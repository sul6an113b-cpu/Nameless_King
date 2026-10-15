#!/usr/bin/env python3
"""Make a self-contained HTML page work offline and share it privately on your Tailscale tailnet.

    python3 offline_tool.py build ~/path/to/index.html   # writes ~/SymbolLibraryOffline/site
    python3 offline_tool.py publish                      # https://<this-mac>.<tailnet>.ts.net/
    python3 offline_tool.py status
    python3 offline_tool.py unpublish

build copies the page and every file it references (the img/ folder beside
index.html) into site/, and adds a web-app manifest, icons and a service
worker. publish keeps a small web server running on this computer (127.0.0.1
only) and asks Tailscale to serve it over HTTPS to your own login on your
tailnet. Open the link once on a phone or laptop: a badge in the page header
counts the files as they are saved, and from then on the page opens with no
connection at all.

Python 3.8+ standard library only. See README.md.
"""
import argparse
import email.header
import functools
import hashlib
import html
import html.parser
import ipaddress
import json
import os
import plistlib
import posixpath
import re
import shlex
import shutil
import signal
import socket
import struct
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import zlib
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

TOOL_VERSION = '3'
DEFAULT_HOME = '~/SymbolLibraryOffline'
DEFAULT_PORT = 8765
DEFAULT_HTTPS_PORT = 443
HEAD_MARK = ('<!-- offline-tool:head -->', '<!-- /offline-tool:head -->')
BODY_MARK = ('<!-- offline-tool:body -->', '<!-- /offline-tool:body -->')
ICONS = (('icon-180.png', 180), ('icon-192.png', 192), ('icon-512.png', 512))
GENERATED = {'index.html', 'sw.js', 'offline.js', 'manifest.webmanifest', 'precache.json'} | {n for n, _ in ICONS}
# what the service worker saves as "the page itself"; precache.json rides along so an
# offline device always knows which files its own copy of the page needs
SHELL_FILES = ['index.html', 'offline.js', 'manifest.webmanifest', 'precache.json'] + [n for n, _ in ICONS]
TAILSCALE_CANDIDATES = ('/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale',
                        '/Applications/Tailscale.app/Contents/MacOS/Tailscale')
LOCAL_HOSTS = {'127.0.0.1', 'localhost', '[::1]'}
# macOS keeps background programs out of these unless they are given Full Disk Access
PROTECTED = ('Desktop', 'Documents', 'Downloads', 'Library/Mobile Documents', 'Library/CloudStorage')


def die(msg):
    print('\n' + msg, file=sys.stderr)
    sys.exit(1)


class PublishFailed(Exception):
    pass


def home_id(home):
    """Names the folder a server serves without revealing its path."""
    return hashlib.sha256(str(home).encode('utf-8')).hexdigest()[:16]


def access_id(users):
    """Names the list of people a server lets in, so publish can check what is running."""
    return hashlib.sha256('\n'.join(sorted({decode_login(u) for u in users})).encode('utf-8')).hexdigest()[:16]


def size_text(n):
    return '%.1f MB' % (n / 1048576) if n >= 1048576 else '%d KB' % max(1, round(n / 1024))


def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-') or 'page'


def me():
    """How to run this script again, as typed (quoted for spaces)."""
    return 'python3 ' + shlex.quote(sys.argv[0])


def home_flag(a):
    return '' if a.home == DEFAULT_HOME else ' --home %s' % shlex.quote(a.home)


# ---------------------------------------------------------------- references

SCHEME = re.compile(r'^[a-zA-Z][a-zA-Z0-9+.-]*:')
CSS_URL = re.compile(r'url\(\s*([\'"]?)([^\'")]+)\1\s*\)')
URL_ATTRS = {'src', 'href', 'data-img', 'data-src', 'poster', 'xlink:href'}


class RefCollector(html.parser.HTMLParser):
    """Collects every URL the page points at: required ones (images, scripts,
    styles, the "see it" sheet crops in data-img) and optional ones (plain
    <a href> links, copied only when the file exists)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.required, self.optional, self._style = [], [], False

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if not value:
                continue
            if name in URL_ATTRS:
                (self.optional if tag == 'a' and name == 'href' else self.required).append(value)
            elif name in ('srcset', 'imagesrcset'):
                self.required += [c.split()[0] for c in value.split(',') if c.strip()]
            elif name == 'style':
                self.required += [m.group(2) for m in CSS_URL.finditer(value)]
        if tag == 'style':
            self._style = True

    def handle_endtag(self, tag):
        if tag == 'style':
            self._style = False

    def handle_data(self, data):
        if self._style:
            self.required += [m.group(2) for m in CSS_URL.finditer(data)]


def local_ref(ref):
    """'img/a.jpg?x#y' -> 'img/a.jpg' for a file beside the page; None for
    links elsewhere (other sites, data: URIs, #anchors, parent folders)."""
    ref = ref.strip()
    if not ref or ref.startswith(('#', '//')) or SCHEME.match(ref):
        return None
    ref = ref.split('#', 1)[0].split('?', 1)[0].lstrip('/')
    if not ref or ref.endswith('/'):
        return None
    ref = posixpath.normpath(ref)
    if ref in ('.', '..') or ref.startswith('../'):
        return None
    return ref


def strip_injected(page):
    for start, end in (HEAD_MARK, BODY_MARK):
        page = re.sub(re.escape(start) + '.*?' + re.escape(end) + r'\n?', '', page, flags=re.S)
    return page


def page_title(page):
    m = re.search(r'<title[^>]*>(.*?)</title>', page, re.I | re.S)
    return html.unescape(re.sub(r'\s+', ' ', m.group(1))).strip() if m else ''


def collect(page, src_dir):
    """-> ({url: source path}, [missing urls], [skipped urls])

    Containment is checked on the path as written, not on where symlinks
    lead, so an img/ folder that is a symlink still counts as beside the page."""
    col = RefCollector()
    col.feed(page)
    col.close()
    root = os.path.normpath(str(src_dir))
    found, missing, skipped = {}, [], []
    for ref, required in [(r, True) for r in col.required] + [(r, False) for r in col.optional]:
        url = local_ref(ref)
        if not url or url in found or url in missing or url in skipped:
            continue
        if url in GENERATED:
            if url != 'index.html':
                skipped.append(url)
            continue
        path = os.path.normpath(os.path.join(root, urllib.parse.unquote(url)))
        if not path.startswith(root + os.sep):          # '%2e%2e/' and the like, once decoded
            if required:
                missing.append(url)
            continue
        if os.path.isfile(path):
            found[url] = Path(path)
        elif required:
            missing.append(url)
    return found, missing, skipped


# ---------------------------------------------------------------- icons

def png(size, paint):
    """Encode an opaque RGB PNG; paint(u, v) -> (r, g, b) with u, v in 0..1."""
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            r = g = b = 0
            for sy in (0.25, 0.75):          # 2x2 supersampling for smooth edges
                for sx in (0.25, 0.75):
                    c = paint((x + sx) / size, (y + sy) / size)
                    r, g, b = r + c[0], g + c[1], b + c[2]
            rows += bytes((r // 4, g // 4, b // 4))

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(rows), 9)) + chunk(b'IEND', b''))


def paint_icon(u, v):
    """A gate valve on a pipe, the first symbol anyone learns on a P&ID.
    Everything stays inside the central 80% so maskable crops keep it."""
    cy = 0.56                                                    # valve centre; stem and handwheel sit above
    dx, dy = abs(u - 0.5), abs(v - cy)
    white, blue, ink = (246, 246, 244), (143, 176, 255), (29, 31, 34)
    if dx <= 0.2 and dy <= 0.16 * dx / 0.2:                      # valve body: two triangles tip to tip
        return white
    if dx <= 0.024 and cy - 0.25 <= v <= cy:                     # stem
        return white
    if abs(v - (cy - 0.25)) <= 0.028 and dx <= 0.12:             # handwheel
        return white
    if dy <= 0.034 and 0.12 <= u <= 0.88:                        # pipe
        return blue
    return ink


# ---------------------------------------------------------------- browser code

HEAD_BLOCK = '''<!-- offline-tool:head -->
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="{light}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="{dark}" media="(prefers-color-scheme: dark)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="{short}">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" type="image/png" href="icon-192.png">
<style>
#offline-badge{{display:inline-flex;align-items:center;gap:6px;margin-left:auto;font:12px/18px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;border:1px solid var(--line,#d5d7db);border-radius:4px;padding:1px 7px;color:var(--muted,#5d6168);background:var(--card,#fff);white-space:nowrap;cursor:default}}
#offline-badge.act{{cursor:pointer;color:var(--ink,#1d1f22)}}
#offline-badge:before{{content:"";width:7px;height:7px;border-radius:50%;background:var(--muted,#5d6168)}}
#offline-badge[data-state=ready]:before{{background:#11833a}}
#offline-badge[data-state=busy]:before{{background:#c29400}}
#offline-badge[data-state=warn]:before{{background:#d0262e}}
#offline-badge:focus-visible{{outline:2px solid var(--focus,#2a5bd7);outline-offset:2px}}
#offline-badge.float{{position:fixed;right:12px;bottom:12px;z-index:99}}
</style>
<!-- /offline-tool:head -->
'''

BODY_BLOCK = '''<!-- offline-tool:body -->
<script src="offline.js" defer></script>
<!-- /offline-tool:body -->
'''

OFFLINE_JS = r'''/* Saves this page and every file it shows for offline use, with progress in a
   small badge in the header. Written by offline_tool.py on every build. */
(function () {
  'use strict';
  var VERSION = __VERSION__;                       // the build this copy of the page belongs to
  var FILES = 'offline-files', SHELL = 'offline-shell-', MARK = '__offline';
  if (location.protocol === 'file:') return;       // opened straight from disk: nothing to do

  var badge = null, running = false, updated = false, reg = null, setupError = null;
  function say(text, state, detail, action) {
    if (!badge) {
      badge = document.createElement('button');
      badge.type = 'button';
      badge.id = 'offline-badge';
      badge.setAttribute('aria-live', 'polite');
      var bar = document.querySelector('header .bar') || document.querySelector('header');
      if (bar) bar.appendChild(badge); else { badge.className = 'float'; document.body.appendChild(badge); }
      badge.addEventListener('click', function () { if (badge.act) badge.act(); });
    }
    badge.textContent = text;
    badge.setAttribute('data-state', state);
    badge.title = detail || '';
    badge.act = action || null;
    badge.classList.toggle('act', !!action);
  }
  function mb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function reload() { location.reload(); }
  function showUpdated() { say('Updated · tap to reload', 'busy', 'A newer version is saved. Tap to open it.', reload); }

  if (!window.isSecureContext) {                   // plain http hides the offline APIs altogether
    say('Offline needs the https link', 'warn', 'Open this page at its https://…ts.net address to save it for offline use.');
    return;
  }
  if (!('serviceWorker' in navigator) || !window.caches) {
    say('Offline not supported here', 'warn', 'This browser cannot save pages for offline use.');
    return;
  }
  function getReg() {
    return navigator.serviceWorker.getRegistration().then(function (r) { return r || null; }, function () { return null; });
  }

  // Fetch past the service worker and the HTTP cache. Gives up once no bytes have
  // arrived for idleMs, so a Mac that went to sleep is noticed in seconds, while a
  // big file on a slow link still finishes.
  function grab(url, idleMs) {
    var ctl = new AbortController(), timer = 0;
    function arm() { clearTimeout(timer); timer = setTimeout(function () { ctl.abort(); }, idleMs); }
    arm();
    url += (url.indexOf('?') < 0 ? '?' : '&') + MARK + '=' + Date.now();
    return fetch(url, { cache: 'no-store', signal: ctl.signal }).then(function (r) {
      if (!r.ok) { var e = new Error('HTTP ' + r.status); e.http = true; e.status = r.status; throw e; }
      var type = r.headers.get('content-type') || '';
      if (!r.body || !r.body.getReader) return r.blob().then(function (b) { return { blob: b, type: type || b.type }; });
      var reader = r.body.getReader(), parts = [];
      function pump() {
        return reader.read().then(function (x) {
          if (x.done) return { blob: new Blob(parts, { type: type }), type: type };
          parts.push(x.value);
          arm();
          return pump();
        });
      }
      arm();
      return pump();
    }).finally(function () { clearTimeout(timer); });
  }

  // The file list saved with the page itself (this build's first, any other as a fallback).
  async function savedList() {
    var names = (await caches.keys()).filter(function (n) { return n.indexOf(SHELL) === 0; });
    names.sort(function (a, b) { return (b === SHELL + VERSION) - (a === SHELL + VERSION); });
    for (var i = 0; i < names.length; i++) {
      var hit = await (await caches.open(names[i])).match('precache.json');
      if (hit) return hit.json();
    }
    return null;
  }

  // Ask the browser for the newer service worker, noting if this attempt's worker fails.
  async function startUpdate() {
    var at = { failed: false, settled: false, before: null };
    if (!reg) reg = await getReg();
    if (!reg) { at.failed = true; return at; }
    at.before = reg.active;
    function watch(w) {
      if (w) w.addEventListener('statechange', function () { if (w.state === 'redundant' && !updated) at.failed = true; });
    }
    // only the worker this request creates counts: one already installing may be the browser's
    // own earlier check, made before the files were saved, and its failure says nothing
    reg.addEventListener('updatefound', function () { watch(reg.installing); });
    reg.update().then(function () { at.settled = true; }, function () { at.failed = true; });
    return at;
  }

  // Wait until a new service worker has taken over (or this attempt's has failed).
  async function shellReady(at, ms) {
    var end = Date.now() + ms, idle = 0;
    while (Date.now() < end && !updated && !at.failed) {
      var w = reg && (reg.installing || reg.waiting);
      if (!w && reg && reg.active && reg.active !== at.before) return true;
      idle = at.settled && !w ? idle + 500 : 0;       // update check done but nothing installing
      if (idle > 3000) return false;
      await sleep(500);
    }
    return updated;
  }

  async function run() {
    var list = null, online = false;
    try {
      var got = await grab(new URL('precache.json', location.href).href, 10000);
      list = JSON.parse(await new Response(got.blob).text());
      online = true;
    } catch (e) {
      if (e && e.status === 403) {
        say('Not shared with this login', 'warn', 'This device is signed in to a Tailscale login the Mac does not share this page with. ' +
            'On the Mac, publish again with --allow-user for that login.', sync);
        return;
      }
      list = await savedList();
    }
    if (!list) {
      say('Not saved yet · tap to retry', 'warn', 'Could not reach the server. Connect to Tailscale, then tap to try again.', sync);
      return;
    }
    // An older copy of the page reading a newer list is mid-update: it may add files but
    // must not delete any, because it still shows them until the new version takes over.
    var current = list.version === VERSION, upgrading = online && !current;

    var files = list.files || [], total = files.length, bytes = 0, want = new Map();
    files.forEach(function (f) { bytes += f.b || 0; want.set(new URL(f.u, location.href).href, f); });
    var cache = await caches.open(FILES);
    if (current) {
      var keys = await cache.keys();
      await Promise.all(keys.map(function (k) { return want.has(k.url) ? null : cache.delete(k); }));
    }
    var todo = [], stale = 0;     // stale: saved, but from another build (an update did not finish)
    await Promise.all(Array.from(want).map(async function (e) {
      var hit = await cache.match(e[0]);
      if (!hit) todo.push(e);
      else if (hit.headers.get('x-offline-rev') !== e[1].r) { if (online) todo.push(e); else stale++; }
    }));

    var have = total - todo.length, detail = total + ' files · ' + mb(bytes) + ' · version ' + list.version;
    function unfinished() {
      say('Saved ' + have + '/' + total + ' · connect to finish', 'warn',
          'Lost the connection to the Mac. Check Tailscale is on and the Mac is awake, then tap to finish.', sync);
    }
    if (todo.length && !online) { unfinished(); return; }
    var failed = [], full = false, lost = false, next = 0;
    function progress() { say('Saving offline ' + have + '/' + total, 'busy', detail); }
    async function worker() {
      while (next < todo.length && !full && !lost) {
        var e = todo[next++];
        try {
          var hit = await cache.match(e[0]);              // another run may have saved it meanwhile
          if (hit && hit.headers.get('x-offline-rev') === e[1].r) { have++; progress(); continue; }
          var got = await grab(e[0], 25000);
          await cache.put(e[0], new Response(got.blob, { headers: {
            'content-type': got.type || 'application/octet-stream', 'x-offline-rev': e[1].r } }));
          have++;
          progress();
        } catch (err) {
          if (err && err.name === 'QuotaExceededError') full = true;
          else if (err && err.http) failed.push(e[1].u);       // that one file; carry on
          else lost = true;                                    // no answer at all: stop asking
        }
      }
    }
    if (todo.length) { progress(); await Promise.all([worker(), worker(), worker(), worker()]); }
    if (full) {
      say('Storage full · ' + have + '/' + total + ' saved', 'warn', 'Free some space on this device, then tap to try again.', sync);
      return;
    }
    if (lost) { unfinished(); return; }
    if (failed.length) {
      say('Saved ' + have + '/' + total + ' · tap to retry', 'warn',
          failed.length + ' files failed, e.g.\n' + failed.slice(0, 8).join('\n'), sync);
      return;
    }

    if (upgrading && !updated) {
      say('Updating…', 'busy', 'Saving the new version. The current one keeps working until it is complete.');
      if (!(await shellReady(await startUpdate(), 600000))) {
        say('Update unfinished · tap to retry', 'warn', 'The new version of the page did not finish saving. This copy still works.', sync);
        return;
      }
      updated = true;
    }
    var ready = await Promise.race([navigator.serviceWorker.ready, sleep(30000).then(function () { return null; })]);
    if (setupError || !ready) {
      say('Offline setup unfinished · tap to retry', 'warn', setupError ? String(setupError.message || setupError) : 'The page itself is not saved yet.', reload);
      if (!setupError) navigator.serviceWorker.ready.then(function () { if (!running) sync(); });
      return;
    }
    if (updated) showUpdated();
    else if (online) say('Offline ready', 'ready', detail);
    else if (stale) say('Offline copy · update unfinished', 'busy', stale + ' files are from another version. ' +
                        'Connect to Tailscale to finish updating.', sync);
    else say('Offline copy', 'ready', detail + '\nNo connection: showing the saved copy.');
  }

  function sync() {
    if (running) return;
    running = true;
    run().catch(function (e) {
      say('Offline save failed · tap to retry', 'warn', String(e && e.message || e), sync);
    }).finally(function () { running = false; });
  }

  var hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (hadController) {                              // a newer build took over
      updated = true;
      if (!running) showUpdated();
    } else if (!running) {
      sync();                                         // first install finished after the files: confirm it
    }
    hadController = true;
  });
  // Registering can wait behind the browser's own update check, which hangs while the Mac
  // sleeps, so the files are checked straight away rather than after it.
  navigator.serviceWorker.register('sw.js').then(function (r) {
    reg = r;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  }, function (e) {
    setupError = e;
    if (!running) say('Offline setup failed · tap to retry', 'warn', String(e && e.message || e), reload);
  });
  sync();
  window.addEventListener('online', sync);
  // Phones resume an installed app rather than reloading it: check again when it comes
  // back to the front (at most every 30 s), which is also how updates are noticed.
  var lastWake = Date.now();
  function wake() {
    if (document.visibilityState !== 'visible' || Date.now() - lastWake < 30000) return;
    lastWake = Date.now();
    sync();
  }
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('pageshow', function (e) { if (e.persisted) wake(); });
})();
'''

SW_JS = r'''/* Serves the saved copy of the page when there is no connection.
   Written by offline_tool.py; VERSION changes whenever anything a browser
   receives changes, which is how browsers notice an update. */
'use strict';
var VERSION = __VERSION__, SHELL_FILES = __SHELL__;
var SHELL = 'offline-shell-' + VERSION, FILES = 'offline-files', META = 'offline-meta', MARK = '__offline';
var OURS = /-(shell-[0-9a-f]{12}|files|meta)$/;   // this tool's caches, from any build or older naming
var ROOT = new URL('./', self.location.href).href, ROOT_PATH = new URL(ROOT).pathname;

// The files this build's page shows, all saved at the right revision? (The page saves
// them itself, with progress, before it asks for this worker.)
function filesSaved(list) {
  return caches.open(FILES).then(function (files) {
    return Promise.all(list.map(function (f) {
      return files.match(new URL(f.u, ROOT).href).then(function (hit) {
        return !!hit && hit.headers.get('x-offline-rev') === f.r;
      });
    }));
  }).then(function (oks) { return oks.every(Boolean); });
}

// An update takes over only once every file its page shows is saved, so an update cut
// short leaves the previous copy whole. It checks first and fails at once if anything is
// missing, so the install stays short; the page itself is saved last, with the very file
// list that was checked.
self.addEventListener('install', function (event) {
  event.waitUntil(fetch('precache.json?' + MARK + '=' + Date.now(), { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw new Error('precache.json: HTTP ' + r.status);
    return r.clone().json().then(function (list) {
      return self.registration.active ? filesSaved(list.files || []) : true;
    }).then(function (complete) {
      if (!complete) throw new Error('the files of this version are not saved yet');
      return caches.open(SHELL).then(function (cache) {
        var rest = SHELL_FILES.filter(function (u) { return u !== 'precache.json'; });
        return cache.addAll(rest.map(function (u) { return new Request(u, { cache: 'reload' }); }))
          .then(function () { return cache.put('precache.json', r); });
      });
    });
  }).then(function () { return self.skipWaiting(); }, function (e) {
    return caches.delete(SHELL).then(function () { throw e; });   // no half-saved page left behind
  }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.map(function (n) {
      return OURS.test(n) && n !== SHELL && n !== FILES && n !== META ? caches.delete(n) : null;
    }));
  }).then(function () { return self.clients.claim(); }));
});

function fromCache(name, request) {
  return caches.open(name).then(function (c) { return c.match(request, { ignoreSearch: true }); });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || req.url.indexOf(ROOT) !== 0) return;
  var url = new URL(req.url), rel = url.pathname.slice(ROOT_PATH.length);
  if (url.searchParams.has(MARK) || rel === 'sw.js' || rel === 'precache.json') return;   // always the network
  if (req.mode === 'navigate' && (rel === '' || rel === 'index.html')) {
    event.respondWith(fromCache(SHELL, 'index.html').then(function (r) { return r || fetch(req); }));
    return;
  }
  event.respondWith(fromCache(SHELL, req)
    .then(function (r) { return r || fromCache(FILES, req); })
    .then(function (r) { return r || fetch(req); }));
});
'''


# ---------------------------------------------------------------- build

def inject(page, head, body):
    m = re.search(r'</head\s*>', page, re.I) or re.search(r'<body[\s>]', page, re.I)
    page = page[:m.start()] + head + page[m.start():] if m else head + page
    i = page.lower().rfind('</body')
    return page[:i] + body + page[i:] if i >= 0 else page + body


def site_info(home):
    try:
        return json.loads((home / 'site' / 'precache.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None


def show_missing(missing, src):
    print('\nWARNING: %d file(s) the page shows are missing next to %s, e.g.' % (len(missing), src.name))
    for url in missing[:8]:
        print('    ' + url)
    top = sorted({m.split('/')[0] for m in missing if '/' in m})
    if top:
        print('  Put the %s folder that came with the page beside it, then build again.' % ', '.join(t + '/' for t in top))


def cmd_build(a):
    src = Path(a.page).expanduser()
    if src.is_dir():
        src = src / 'index.html'
    if not src.is_file():
        die('No page found at %s\nPass the index.html file, or the folder that holds it.' % src)
    src_dir = src.parent.resolve()
    home = Path(a.home).expanduser().resolve()
    site = home / 'site'
    if src_dir == site or site in src_dir.parents:
        die('That is the built copy. Point build at the original page (the one next to its img/ folder).')

    page = strip_injected(src.read_text(encoding='utf-8'))
    title = a.name or page_title(page) or 'Offline page'
    short = a.short_name or (title if len(title) <= 12 else title.split()[0][:12])
    found, missing, skipped = collect(page, src_dir)

    # Decide before touching site/: the server publishes whatever is there at once, and
    # devices then drop every saved file the new list no longer has.
    previous = site_info(home)
    had = {f['u'] for f in (previous or {}).get('files', ())}
    dropped = [m for m in missing if m in had]
    if missing and a.strict:
        show_missing(missing, src)
        die('Nothing changed (--strict).')
    try:
        last = json.loads((home / 'build.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        last = {}
    # Another page, not a new build of this one? Judge by title, source folder and how many
    # of the files devices already have it still uses (missing ones count: see the next check).
    here = str(src.resolve())
    renamed, moved = previous and previous.get('name') != title, last.get('source', here) != here
    if not had:
        other_page = renamed and moved
    else:
        other_page = (renamed or moved) and len(had & (set(found) | set(missing))) * 2 < len(had)
    if previous and other_page and not a.replace:
        die('Nothing changed: %s holds "%s"%s, which your devices may have installed.\n'
            'Building "%s" here would replace it on every device and delete its saved files.\n'
            'Use --home for a second page, or add --replace if replacing it is what you want.'
            % (home, previous.get('name'), ' (from %s)' % last['source'] if last.get('source') else '', title))
    if dropped and not a.allow_missing:
        show_missing(missing, src)
        die('Nothing changed: %d of these are in the build your devices already have, and publishing\n'
            'this one would delete them from those devices. Put the files back and build again, or, if\n'
            'they really are gone, add --allow-missing.' % len(dropped))

    head = HEAD_BLOCK.format(light=a.theme_light, dark=a.theme_dark, short=html.escape(short))
    out_page = inject(page, head, BODY_BLOCK).encode('utf-8')
    manifest = json.dumps({
        'name': title, 'short_name': short, 'id': './', 'start_url': './', 'scope': './',
        'display': 'standalone', 'background_color': a.theme_light, 'theme_color': a.theme_light,
        'icons': [{'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
                  {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
                  {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'}],
    }, indent=1).encode('utf-8')
    icons = [(name, png(px, paint_icon)) for name, px in ICONS]

    home.mkdir(parents=True, exist_ok=True)
    stage = home / 'site.new'
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir()
    entries, total = [], 0
    for url in sorted(found):
        data = found[url].read_bytes()
        dest = stage / urllib.parse.unquote(url)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        entries.append({'u': url, 'r': hashlib.sha256(data).hexdigest()[:16], 'b': len(data)})
        total += len(data)

    # the version covers everything a browser receives, the tool's own code included
    digest = hashlib.sha256()
    for part in [TOOL_VERSION.encode(), out_page, manifest, OFFLINE_JS.encode(), SW_JS.encode(),
                 json.dumps(SHELL_FILES).encode(), json.dumps(entries, sort_keys=True).encode()] + [b for _, b in icons]:
        digest.update(hashlib.sha256(part).digest())
    version = digest.hexdigest()[:12]
    built = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    def fill(template):
        return (template.replace('__VERSION__', json.dumps(version))
                .replace('__SHELL__', json.dumps(SHELL_FILES)).encode('utf-8'))

    (stage / 'index.html').write_bytes(out_page)
    (stage / 'manifest.webmanifest').write_bytes(manifest)
    (stage / 'offline.js').write_bytes(fill(OFFLINE_JS))
    (stage / 'sw.js').write_bytes(fill(SW_JS))
    for name, data in icons:
        (stage / name).write_bytes(data)
    (stage / 'precache.json').write_text(json.dumps(
        {'name': title, 'version': version, 'built': built, 'files': entries},
        separators=(',', ':')), encoding='utf-8')

    old = home / 'site.old'
    if old.exists():
        shutil.rmtree(old)
    if site.exists():
        site.rename(old)
    stage.rename(site)
    if old.exists():
        shutil.rmtree(old)
    (home / 'build.json').write_text(json.dumps({'source': str(src.resolve()), 'title': title}), encoding='utf-8')

    print('Built %s with offline_tool.py version %s' % (site, TOOL_VERSION))
    print('  page     %s (%s)' % (title, size_text(len(out_page))))
    print('  files    %d copied (%s)' % (len(entries), size_text(total)))
    print('  version  %s%s' % (version, ' (unchanged)' if previous and previous.get('version') == version else ''))
    for url in skipped:
        print('  skipped  %s (a name this tool writes itself)' % url)
    if missing:
        show_missing(missing, src)
    if sys.platform == 'darwin' and protected_path(home):
        print('\nNote: publish cannot run its background server from inside %s. Build into a folder\n'
              'directly in your home folder instead (the default %s is fine).' % (protected_path(home), DEFAULT_HOME))
    copy = home / 'offline_tool.py'
    if not (home / 'publish.json').exists():
        print('\nNext: %s publish%s' % (me(), home_flag(a)))
    elif copy.exists() and Path(__file__).resolve() != copy.resolve() and copy.read_bytes() != Path(__file__).read_bytes():
        print('\nThe background server runs a different copy of this tool. To switch it to this one, run once:\n'
              '    %s publish%s' % (me(), home_flag(a)))
    else:
        print('\nAlready published: devices pick this up the next time they open it online.')


# ---------------------------------------------------------------- serve

def decode_login(value):
    """Tailscale sends non-ASCII header values RFC 2047 encoded."""
    if '=?' in value:
        try:
            value = str(email.header.make_header(email.header.decode_header(value)))
        except Exception:
            pass
    return value.strip().lower()


TAILNET_NETS = [ipaddress.ip_network(n) for n in ('100.64.0.0/10', 'fd7a:115c:a1e0::/48', '127.0.0.0/8', '::1/128')]


def from_tailnet(forwarded_for):
    """Whether the client Tailscale forwarded for is a tailnet (or local) address."""
    if not forwarded_for:
        return True                     # not proxied, or no address given: nothing to judge by
    last = forwarded_for.split(',')[-1].strip()
    if last.startswith('['):
        last = last[1:last.find(']')]
    elif last.count(':') == 1:
        last = last.split(':')[0]       # 1.2.3.4:port
    try:
        ip = ipaddress.ip_address(last)
    except ValueError:
        return False
    return any(ip in n for n in TAILNET_NETS)


class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map, **{
        '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json', '.webmanifest': 'application/manifest+json',
        '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'})
    allow_users = frozenset()
    allow_hosts = frozenset()
    home_id = ''
    local = False

    def send_head(self):
        # Only two kinds of visitor get an answer:
        #  - this computer itself, by 127.0.0.1/localhost (publish's own checks). A web page
        #    open on the Mac cannot send that Host for its own origin, so DNS rebinding fails.
        #  - Tailscale, which always sends the *.ts.net name and sets the login header itself.
        host = self.headers.get('Host', '').strip().lower()
        host = (host[:host.find(']') + 1] if host.startswith('[') else host.split(':')[0]).rstrip('.')
        proxied = any(h in self.headers for h in ('Tailscale-User-Login', 'X-Forwarded-For', 'X-Forwarded-Host'))
        self.local = host in LOCAL_HOSTS and not proxied
        if not self.local:
            if not (host.endswith('.ts.net') or host in self.allow_hosts or host in LOCAL_HOSTS):
                self.send_error(421, 'Wrong host')
                return None
            if 'Tailscale-Funnel-Request' in self.headers or not from_tailnet(self.headers.get('X-Forwarded-For')):
                self.send_error(403, 'Tailnet only')          # Funnel (public internet) traffic
                return None
            login = decode_login(self.headers.get('Tailscale-User-Login', ''))
            if self.allow_users and login not in self.allow_users:
                self.send_error(403, 'Not shared with you', 'Not shared with %s.' % (login or 'this device'))
                return None
        return super().send_head()

    def handle(self):
        try:
            super().handle()
        except (BrokenPipeError, ConnectionResetError):
            pass                    # the browser gave up on a download (app closed, connection lost)

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        if self.local and self.home_id:                          # this computer only: lets publish check
            self.send_header('X-Offline-Home', self.home_id)     # which folder and which people this serves
            self.send_header('X-Offline-Access', access_id(self.allow_users))
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        super().end_headers()

    def log_request(self, code='-', size='-'):
        if str(code)[:1] in ('4', '5'):
            super().log_request(code, size)

    def log_error(self, format, *args):
        if not format.startswith('code '):      # send_error's own line; log_request already has it
            super().log_error(format, *args)


def cmd_serve(a):
    home = Path(a.home).expanduser().resolve()
    site = home / 'site'
    if not (site / 'index.html').is_file():
        die('Nothing built at %s yet. Run build first.' % site)
    Handler.home_id = home_id(home)
    Handler.allow_users = frozenset(decode_login(u) for u in a.allow_user or ())
    Handler.allow_hosts = frozenset(h.lower().rstrip('.') for h in a.allow_host or ())
    try:
        httpd = ThreadingHTTPServer((a.bind, a.port), functools.partial(Handler, directory=str(site)))
    except OSError as e:
        die('Cannot listen on port %d (%s). Another program may use it: pick another one with --port,\n'
            'and give publish the same --port.' % (a.port, e.strerror or e))
    httpd.daemon_threads = True
    who = ', '.join(sorted(Handler.allow_users)) or 'everyone your tailnet lets in'
    print('Serving %s at http://%s:%d/ for %s (Ctrl-C stops)' % (site, a.bind, a.port, who), flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


# ---------------------------------------------------------------- tailscale + launchd

def find_cli():
    for c in (shutil.which('tailscale'),) + TAILSCALE_CANDIDATES:
        if c and os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    return None


def find_tailscale():
    return find_cli() or die(
        'Could not find the tailscale command.\n'
        'Install Tailscale (https://tailscale.com/download) and sign in to your account. On a Mac the\n'
        'app is enough: this script uses the command built into /Applications/Tailscale.app.')


def ts(cli, *args, capture=True):
    env = dict(os.environ, TAILSCALE_BE_CLI='1')     # makes the Mac app binary act as the CLI
    if capture:
        return subprocess.run([cli] + list(args), env=env, capture_output=True, text=True)
    return subprocess.run([cli] + list(args), env=env)


def ts_status(cli):
    """tailscale status --json, or None when Tailscale does not answer."""
    r = ts(cli, 'status', '--json')
    try:
        return json.loads(r.stdout)
    except ValueError:
        return None


def owner_login(st):
    """The login this computer is signed in with, or None (e.g. a tagged server)."""
    me_ = st.get('Self') or {}
    if me_.get('Tags'):
        return None
    user = (st.get('User') or {}).get(str(me_.get('UserID'))) or {}
    return user.get('LoginName') or None


def probe(port):
    """(folder id, build version, access id) of the offline-tool server on this port, or
    None. Copies of this tool from before these ids existed answer with ''."""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))    # never through a proxy
    try:
        with opener.open('http://127.0.0.1:%d/precache.json' % port, timeout=2) as r:
            return (r.headers.get('X-Offline-Home', ''), json.loads(r.read()).get('version'),
                    r.headers.get('X-Offline-Access', ''))
    except Exception:
        return None


def wait_for_server(port, version, hid, access, seconds=15):
    """Until the server on port serves this folder's build to exactly these people."""
    end = time.time() + seconds
    while time.time() < end:
        if probe(port) == (hid, version, access):
            return True
        time.sleep(0.5)
    return False


def agent_label(home):
    return 'local.offline-tool.' + slug(home.name)


def agent_plist(home):
    return Path.home() / 'Library' / 'LaunchAgents' / (agent_label(home) + '.plist')


def launchctl(*args):
    return subprocess.run(['launchctl'] + list(args), capture_output=True, text=True)


def agent_stop(home):
    launchctl('bootout', 'gui/%d/%s' % (os.getuid(), agent_label(home)))
    plist = agent_plist(home)
    if plist.exists():
        launchctl('unload', str(plist))
        plist.unlink()


def agent_start(home, port, allow_users):
    """Keep `serve` running in the background, restarted at login, from a copy of
    this script in home."""
    script = home / 'offline_tool.py'
    if Path(__file__).resolve() != script.resolve():
        shutil.copyfile(__file__, script)
    agent_stop(home)
    args = [sys.executable, str(script), 'serve', '--home', str(home), '--port', str(port)]
    for u in allow_users:
        args += ['--allow-user', u]
    plist = agent_plist(home)
    plist.parent.mkdir(parents=True, exist_ok=True)
    with open(plist, 'wb') as f:
        plistlib.dump({'Label': agent_label(home), 'ProgramArguments': args, 'RunAtLoad': True,
                       'KeepAlive': True, 'ProcessType': 'Background', 'WorkingDirectory': str(home),
                       'StandardOutPath': str(home / 'server.log'),
                       'StandardErrorPath': str(home / 'server.log')}, f)
    for attempt in range(3):            # bootout finishes asynchronously; bootstrap may need a moment
        r = launchctl('bootstrap', 'gui/%d' % os.getuid(), str(plist))
        if r.returncode == 0:
            return
        time.sleep(1)
    r = launchctl('load', '-w', str(plist))
    if r.returncode != 0:
        agent_stop(home)
        raise PublishFailed('Could not start the background server: %s' % (r.stderr.strip() or r.stdout.strip()))


def protected_path(p):
    """The macOS privacy-protected folder p is in, or None. Checks the path as given and
    with symlinks resolved, ignoring case as macOS does."""
    fold = str.casefold if sys.platform == 'darwin' else str
    homes = {fold(os.path.abspath(str(Path.home()))), fold(os.path.realpath(str(Path.home())))}
    for cand in {fold(os.path.abspath(str(p))), fold(os.path.realpath(str(p)))}:
        for h in homes:
            for name in PROTECTED:
                root = os.path.join(h, fold(name))
                if cand == root or cand.startswith(root + os.sep):
                    return '~/' + name
        if cand.startswith(fold('/Volumes/')) and not any(cand == h or cand.startswith(h + os.sep) for h in homes):
            return '/Volumes'
    return None


def port_usable(port, hid, version=None):
    """True if nothing answers on 127.0.0.1:port (on any interface), or only this folder's
    own server does: one that names this folder, or (given its build version) an older copy
    of this tool serving it."""
    try:
        socket.create_connection(('127.0.0.1', port), 0.5).close()
    except OSError:
        return True
    found = probe(port)
    return bool(found) and (found[0] == hid or (version is not None and found[:2] == ('', version)))


def served_by(cli, host, https_port):
    """What this machine serves at https://host:port/ ('' for nothing), or None if unknown."""
    r = ts(cli, 'serve', 'status', '--json')
    try:
        web = json.loads(r.stdout or '{}').get('Web') or {}
    except ValueError:
        return None
    handler = ((web.get('%s:%d' % (host, https_port)) or {}).get('Handlers') or {}).get('/') or {}
    return (handler.get('Proxy') or handler.get('Path') or handler.get('Text') or '').rstrip('/')


def public_url(host, https_port):
    return 'https://%s%s/' % (host, '' if https_port == 443 else ':%d' % https_port)


def settings_path(home):
    return home / 'publish.json'


def load_settings(home):
    try:
        return json.loads(settings_path(home).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def cmd_publish(a):
    home = Path(a.home).expanduser().resolve()
    s = load_settings(home)                      # a previous publish of this home, if any
    hid = home_id(home)
    port = a.port or s.get('port')
    https_port = a.https_port or s.get('https_port') or DEFAULT_HTTPS_PORT
    agent = sys.platform == 'darwin' and not a.no_agent
    if agent:
        for p, what in ((home, '--home folder'), (sys.executable, 'Python')):
            where = protected_path(p)
            if where:
                die('The %s is inside %s (%s). macOS stops background programs from reading\n'
                    'there, so the server would not start. Use a folder directly in your home folder\n'
                    '(the default is %s)%s, or run the server yourself with --no-agent.'
                    % (what, where, p, DEFAULT_HOME, '' if what != 'Python' else ', run this with /usr/bin/python3'))
    info = site_info(home)
    if not info:
        die('Nothing built at %s yet. Run: %s build path/to/index.html%s' % (home / 'site', me(), home_flag(a)))
    cli = find_tailscale()
    st = ts_status(cli)
    if not st or st.get('BackendState') != 'Running':
        die('Tailscale is %s. Open the Tailscale app, sign in to your account, and run this again.'
            % ((st or {}).get('BackendState') or 'not answering'))
    host = ((st.get('Self') or {}).get('DNSName') or '').rstrip('.')
    if not host or (st.get('CurrentTailnet') or {}).get('MagicDNSEnabled') is False:
        die('MagicDNS is off for your tailnet, so this computer has no https name.\n'
            'Turn it on at https://login.tailscale.com/admin/dns and run this again.')

    # Who may open it. The Mac's own login is always included; --allow-user adds people,
    # --only-me starts again from just the owner, and no option keeps last time's choice.
    owner = owner_login(st)
    saved_mode = s.get('mode')
    if not saved_mode and 'allow_users' in s:       # publish.json from before 'mode' was saved
        saved = [decode_login(u) for u in s['allow_users'] or []]
        saved_mode = 'tailnet' if not saved else 'owner' if saved == [decode_login(owner or '')] else 'users'
    saved_users = (s.get('allow_users') or []) if saved_mode == 'users' else []
    if a.allow_tailnet and (a.allow_user or a.only_me):
        die('--allow-tailnet cannot be combined with --allow-user or --only-me.')
    if a.allow_tailnet:
        mode, extra = 'tailnet', []
    elif a.only_me:
        mode, extra = ('users' if a.allow_user else 'owner'), a.allow_user or []
    elif a.allow_user:
        mode, extra = 'users', saved_users + a.allow_user
    else:
        mode, extra = saved_mode or 'owner', saved_users
    users = [] if mode == 'tailnet' else list(dict.fromkeys(decode_login(u) for u in ([owner] if owner else []) + extra))
    if mode != 'tailnet' and not users:
        print('Note: this computer is a tagged device, so there is no owner login to limit access to.\n'
              'Everyone your tailnet rules let in can open it; add --allow-user you@example.com to limit it.\n')

    if port is None:                              # first publish: take the first free port
        port = next((p for p in range(DEFAULT_PORT, DEFAULT_PORT + 40) if port_usable(p, hid)), None)
        if port is None:
            die('No free local port between %d and %d. Pick one with --port.' % (DEFAULT_PORT, DEFAULT_PORT + 39))
    elif not port_usable(port, hid, info['version'] if port == s.get('port') else None):
        die('Local port %d is used by another program. Run publish again with --port %d.' % (port, port + 1))
    access = access_id(users)
    target = 'http://127.0.0.1:%d' % port
    previous = 'http://127.0.0.1:%d' % s['port'] if s.get('host') == host and s.get('port') else None
    busy = served_by(cli, host, https_port)
    if busy and busy not in (target, previous):
        die('%s already serves %s.\nPick another port, e.g.: %s publish --https-port 8443%s'
            % (public_url(host, https_port), busy, me(), home_flag(a)))

    def rollback():
        """Put back what ran before this publish, or leave nothing running."""
        if not agent:
            return ''
        print('\nPutting back what ran before...', file=sys.stderr, flush=True)
        old_int = signal.signal(signal.SIGINT, signal.SIG_IGN)    # a second Ctrl-C must not cut this short
        try:
            if s.get('agent') and previous and served_by(cli, host, s.get('https_port') or DEFAULT_HTTPS_PORT) == previous:
                try:
                    agent_start(home, s['port'], s.get('allow_users') or [])
                    if wait_for_server(s['port'], info['version'], hid, access_id(s.get('allow_users') or []), 10):
                        return '\nThe previous share is still running.'
                except PublishFailed:
                    pass
                agent_stop(home)
                return '\nThe previous share could not be restarted, so its link is down. Run publish again.'
            agent_stop(home)
            return '\nNothing was left running.'
        finally:
            signal.signal(signal.SIGINT, old_int)

    try:
        if agent:
            agent_start(home, port, users)
            if not wait_for_server(port, info['version'], hid, access):
                found = probe(port)
                raise PublishFailed(
                    'Another serve for this folder is running on port %d. Stop it, then run publish again.' % port
                    if found and found[0] == hid else
                    'The background server did not come up on port %d. See %s.\n'
                    'If another program uses that port, run publish again with --port %d.'
                    % (port, home / 'server.log', port + 1))
        elif not wait_for_server(port, info['version'], hid, access, seconds=2):
            cmd = '    %s serve --home %s --port %d%s' % (me(), shlex.quote(str(home)), port,
                                                          ''.join(' --allow-user ' + shlex.quote(u) for u in users))
            found = probe(port)
            if found and found[0] in (hid, '') and found[1] == info['version']:
                die('The server running on port %d lets in a different list of people (or is an older copy\n'
                    'of this tool). Stop it (Ctrl-C in its window) and start it again with:\n%s\n'
                    'then publish again.' % (port, cmd))
            die('Start the server first and keep it running, then publish again:\n' + cmd)
        if not st.get('CertDomains'):
            print('Note: HTTPS certificates may be off for your tailnet. If Tailscale asks, follow its link\n'
                  '(or enable "HTTPS Certificates" at https://login.tailscale.com/admin/dns).\n')
        r = ts(cli, 'serve', '--bg', '--https=%d' % https_port, target, capture=False)
        now = served_by(cli, host, https_port)
        if r.returncode != 0 or (now is not None and now != target):
            raise PublishFailed('Tailscale is not serving it yet%s. Finish any step Tailscale printed above (or ask\n'
                                'your tailnet admin to allow Serve and HTTPS), then run publish again.'
                                % ('' if r.returncode == 0 else ' (tailscale serve failed)'))
    except PublishFailed as e:
        die(str(e) + rollback())
    except KeyboardInterrupt:
        print('\nStopped.' + rollback(), file=sys.stderr)
        sys.exit(130)

    old_port = s.get('https_port') if s.get('host') == host else None
    if old_port and old_port != https_port and served_by(cli, host, old_port) in (previous, target):
        ts(cli, 'serve', '--https=%d' % old_port, '--set-path=/', 'off')
        print('Turned off the old link %s. A different port is a different app to browsers,\n'
              'so install it again on your devices from the new link.\n' % public_url(host, old_port))
    settings_path(home).write_text(json.dumps({'port': port, 'https_port': https_port, 'host': host, 'mode': mode,
                                               'allow_users': users, 'agent': agent}), encoding='utf-8')
    url = public_url(host, https_port)
    print('\nShared on your tailnet only (not the public internet):\n\n    %s\n' % url)
    print('Who can open it: %s' % (', '.join(users) if users else 'every device your tailnet rules let in'))
    print('\nOn your phone or laptop, with Tailscale on:\n'
          '  1. Open that link.\n'
          '  2. iPhone/iPad: Share > Add to Home Screen, then open it from the Home Screen.\n'
          '     Android/Chrome/Edge: menu > Install app (or Add to Home screen).\n'
          '  3. Wait for the header badge to say "Offline ready". After that it opens with no connection.\n'
          'The first visit can take a few seconds while Tailscale issues the certificate.\n'
          'To update later, just build again; this server picks it up.')


def cmd_unpublish(a):
    home = Path(a.home).expanduser().resolve()
    s = load_settings(home)
    https_port = a.https_port or s.get('https_port') or DEFAULT_HTTPS_PORT
    target = 'http://127.0.0.1:%d' % (s.get('port') or DEFAULT_PORT)
    done = True
    cli = find_cli()
    st = cli and ts_status(cli)
    host = (((st or {}).get('Self') or {}).get('DNSName') or '').rstrip('.') or s.get('host')
    if not cli:
        print('tailscale    not found; nothing to turn off there')
    elif not st or not host:
        done = False
        print('tailscale    did not answer. Open the Tailscale app and run unpublish again.')
    else:
        current = served_by(cli, host, https_port)
        if current is None:
            done = False
            print('tailscale    could not read what is served; check with: tailscale serve status')
        elif current == target:
            # --set-path=/ removes only this tool's mount and never asks a question
            ts(cli, 'serve', '--https=%d' % https_port, '--set-path=/', 'off')
            done = served_by(cli, host, https_port) != target
            print('tailscale    %s' % ('stopped serving %s' % public_url(host, https_port) if done
                                       else 'could not turn it off; run unpublish again'))
        elif current:
            print('tailscale    %s serves %s, not this tool; left alone' % (public_url(host, https_port), current))
        else:
            print('tailscale    nothing served on port %d' % https_port)
    if sys.platform == 'darwin':
        agent_stop(home)
        print('background   server stopped')
    if done and settings_path(home).exists():
        settings_path(home).unlink()
    print('\nThe built copy stays in %s; delete that folder if you no longer need it.\n'
          'Devices that saved it keep their offline copy until you remove the app and its\n'
          'website data from them.' % home)


def cmd_status(a):
    home = Path(a.home).expanduser().resolve()
    s = load_settings(home)
    port = a.port or s.get('port') or DEFAULT_PORT
    info = site_info(home)
    print('built copy   ' + ('%s, version %s, %d files, built %s' % (home / 'site', info['version'], len(info['files']),
                             info['built']) if info else 'none at %s' % (home / 'site')))
    print('tool         offline_tool.py version %s' % TOOL_VERSION)
    found = probe(port)
    if not found:
        print('local server not answering on port %d' % port)
    elif found[0] == '' and info and found[1] == info['version']:
        print('local server http://127.0.0.1:%d/ is up, run by an older copy of this tool (run publish once)' % port)
    elif found[0] != home_id(home):
        print('local server port %d answers for another folder, not %s' % (port, home))
    else:
        print('local server http://127.0.0.1:%d/ is up%s' % (port, '' if info and found[1] == info['version']
                                                             else ' but serves a different build (version %s)' % found[1]))
        if s and found[2] != access_id(s.get('allow_users') or []):
            print('             but it lets in a different list of people than publish saved; run publish again')
    if sys.platform == 'darwin':
        r = launchctl('print', 'gui/%d/%s' % (os.getuid(), agent_label(home)))
        print('background   %s' % ('installed (%s)' % agent_label(home) if r.returncode == 0 else 'not installed'))
    if s:
        print('who          %s' % (', '.join(s.get('allow_users') or []) or 'every device your tailnet rules let in'))
    cli = find_cli()
    if not cli:
        print('tailscale    not found')
        return
    r = ts(cli, 'serve', 'status')
    print('tailscale serve:\n  ' + ((r.stdout or r.stderr).strip() or 'nothing served').replace('\n', '\n  '))
    if s.get('host'):
        print('link         ' + public_url(s['host'], s.get('https_port') or DEFAULT_HTTPS_PORT))


# ---------------------------------------------------------------- main

def main(argv=None):
    p = argparse.ArgumentParser(description='Make an HTML page work offline and share it on your Tailscale tailnet.')
    sub = p.add_subparsers(dest='cmd', required=True)

    def with_home(sp):
        sp.add_argument('--home', default=DEFAULT_HOME,
                        help='where the built copy and server files live (default %s)' % DEFAULT_HOME)
        return sp

    b = with_home(sub.add_parser('build', help='copy the page and its files into an offline-capable site'))
    b.add_argument('page', help='the index.html file, or the folder holding it (with its img/ folder)')
    b.add_argument('--name', help='app name (default: the page <title>)')
    b.add_argument('--short-name', help='name under the home-screen icon, 12 characters or fewer')
    b.add_argument('--theme-light', default='#f6f6f4', help='browser bar colour in light mode')
    b.add_argument('--theme-dark', default='#17181a', help='browser bar colour in dark mode')
    b.add_argument('--strict', action='store_true', help='change nothing when any referenced file is missing')
    b.add_argument('--allow-missing', action='store_true',
                   help='publish even if files the last build had are missing now (devices delete them)')
    b.add_argument('--replace', action='store_true',
                   help='build a different page into a home that already holds one (devices switch to it)')
    b.set_defaults(fn=cmd_build)

    s = with_home(sub.add_parser('serve', help='run the local web server in the foreground'))
    s.add_argument('--port', type=int, default=DEFAULT_PORT)
    s.add_argument('--bind', default='127.0.0.1', help=argparse.SUPPRESS)
    s.add_argument('--allow-host', action='append', metavar='HOST', help=argparse.SUPPRESS)
    s.add_argument('--allow-user', action='append', metavar='LOGIN',
                   help='only answer tailnet requests from this Tailscale login (repeatable)')
    s.set_defaults(fn=cmd_serve)

    pb = with_home(sub.add_parser('publish', help='keep the server running and share it with tailscale serve'))
    pb.add_argument('--port', type=int, help='local port (default: as last time, else the first free from %d)' % DEFAULT_PORT)
    pb.add_argument('--https-port', type=int, help='tailnet HTTPS port (default: as last time, else 443)')
    pb.add_argument('--allow-user', action='append', metavar='LOGIN',
                    help='also let this Tailscale login open it (repeatable); your own login always can')
    pb.add_argument('--only-me', action='store_true',
                    help='start the list again from just your own login (plus any --allow-user given now)')
    pb.add_argument('--allow-tailnet', action='store_true',
                    help='let every device your tailnet rules allow open it')
    pb.add_argument('--no-agent', action='store_true', help='do not install a background server; run serve yourself')
    pb.set_defaults(fn=cmd_publish)

    u = with_home(sub.add_parser('unpublish', help='stop sharing and stop the background server'))
    u.add_argument('--https-port', type=int)
    u.set_defaults(fn=cmd_unpublish)

    st = with_home(sub.add_parser('status', help='show what is built, running and shared'))
    st.add_argument('--port', type=int)
    st.set_defaults(fn=cmd_status)

    a = p.parse_args(argv)
    a.fn(a)


if __name__ == '__main__':
    main()
