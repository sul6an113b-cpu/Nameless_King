#!/usr/bin/env python3
"""Make a self-contained HTML page work offline and share it privately on your Tailscale tailnet.

    python3 offline_tool.py build ~/path/to/index.html   # writes ~/SymbolLibraryOffline/site
    python3 offline_tool.py publish                      # https://<this-mac>.<tailnet>.ts.net/
    python3 offline_tool.py status
    python3 offline_tool.py unpublish

build copies the page and every file it references (the img/ folder beside
index.html) into site/, and adds a web-app manifest, icons and a service
worker. publish keeps a small web server running on this computer (127.0.0.1
only) and asks Tailscale to serve it over HTTPS to the devices on your
tailnet. Open the link once on a phone or laptop: a badge in the page header
counts the files as they are saved, and from then on the page opens with no
connection at all.

Python 3.8+ standard library only. See README.md.
"""
import argparse
import functools
import hashlib
import html
import html.parser
import json
import os
import plistlib
import posixpath
import re
import shutil
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

TOOL_VERSION = '1'
DEFAULT_HOME = '~/SymbolLibraryOffline'
DEFAULT_PORT = 8765
DEFAULT_HTTPS_PORT = 443
HEAD_MARK = ('<!-- offline-tool:head -->', '<!-- /offline-tool:head -->')
BODY_MARK = ('<!-- offline-tool:body -->', '<!-- /offline-tool:body -->')
ICONS = (('icon-180.png', 180), ('icon-192.png', 192), ('icon-512.png', 512))
GENERATED = {'index.html', 'sw.js', 'offline.js', 'manifest.webmanifest', 'precache.json'} | {n for n, _ in ICONS}
SHELL_FILES = ['index.html', 'offline.js', 'manifest.webmanifest'] + [n for n, _ in ICONS]
TAILSCALE_CANDIDATES = ('/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale',
                        '/Applications/Tailscale.app/Contents/MacOS/Tailscale')


def die(msg):
    print('\n' + msg, file=sys.stderr)
    sys.exit(1)


def size_text(n):
    return '%.1f MB' % (n / 1048576) if n >= 1048576 else '%d KB' % max(1, round(n / 1024))


def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-') or 'page'


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


# ---------------------------------------------------------------- build

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
  var APP = __APP__, VERSION = __VERSION__;
  var FILES = APP + '-files', META = APP + '-meta', MARK = '__offline';
  if (location.protocol === 'file:') return;          // opened straight from disk: nothing to do

  var badge = null, running = false, updated = false, reg = null;
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
  function reload() { location.reload(); }

  if (!window.isSecureContext) {                       // plain http hides the offline APIs altogether
    say('Offline needs the https link', 'warn', 'Open this page at its https://…ts.net address to save it for offline use.');
    return;
  }
  if (!('serviceWorker' in navigator) || !window.caches) {
    say('Offline not supported here', 'warn', 'This browser cannot save pages for offline use.');
    return;
  }

  // fetch a file past the service worker and the HTTP cache, with a time limit for the whole body
  function grab(url, ms) {
    var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, ms);
    url += (url.indexOf('?') < 0 ? '?' : '&') + MARK + '=' + Date.now();
    return fetch(url, { cache: 'no-store', signal: ctl.signal }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob().then(function (b) { return { blob: b, type: r.headers.get('content-type') || b.type }; });
    }).finally(function () { clearTimeout(timer); });
  }

  async function run() {
    var meta = await caches.open(META), list = null, online = false;
    try {
      var got = await grab(new URL('precache.json', location.href).href, 10000);
      list = JSON.parse(await new Response(got.blob).text());
      await meta.put('precache.json', new Response(got.blob, { headers: { 'content-type': 'application/json' } }));
      online = true;
    } catch (e) {
      var old = await meta.match('precache.json');
      if (old) list = await old.json();
    }
    if (!list) {
      say('Not saved yet · tap to retry', 'warn', 'Could not reach the server. Connect to Tailscale, then tap to try again.', sync);
      return;
    }
    if (online && list.version !== VERSION && reg) reg.update().catch(function () {});   // a newer build is out

    var files = list.files || [], total = files.length, bytes = 0, want = new Map();
    files.forEach(function (f) { bytes += f.b || 0; want.set(new URL(f.u, location.href).href, f); });
    var cache = await caches.open(FILES), keys = await cache.keys();
    await Promise.all(keys.map(function (k) { return want.has(k.url) ? null : cache.delete(k); }));
    var todo = [];
    await Promise.all(Array.from(want).map(async function (e) {
      var hit = await cache.match(e[0]);
      if (!hit || hit.headers.get('x-offline-rev') !== e[1].r) todo.push(e);
    }));

    var have = total - todo.length, detail = total + ' files · ' + mb(bytes) + ' · version ' + list.version;
    if (todo.length && !online) {
      say('Saved ' + have + '/' + total + ' · connect to finish', 'warn',
          'Some files are not saved yet. Connect to Tailscale, then tap to finish.', sync);
      return;
    }
    var failed = [], full = false, next = 0;
    function progress() { say('Saving offline ' + have + '/' + total, 'busy', detail); }
    async function worker() {
      while (next < todo.length && !full) {
        var e = todo[next++];
        try {
          var got = await grab(e[0], 120000);
          await cache.put(e[0], new Response(got.blob, { headers: {
            'content-type': got.type || 'application/octet-stream', 'x-offline-rev': e[1].r } }));
          have++;
          progress();
        } catch (err) {
          if (err && err.name === 'QuotaExceededError') full = true;
          failed.push(e[1].u);
        }
      }
    }
    if (todo.length) { progress(); await Promise.all([worker(), worker(), worker(), worker()]); }
    if (full) {
      say('Storage full · ' + have + '/' + total + ' saved', 'warn', 'Free some space on this device, then tap to try again.', sync);
      return;
    }
    if (failed.length) {
      say('Saved ' + have + '/' + total + ' · tap to retry', 'warn',
          failed.length + ' files failed, e.g.\n' + failed.slice(0, 8).join('\n'), sync);
      return;
    }

    var ready = await Promise.race([navigator.serviceWorker.ready,
      new Promise(function (r) { setTimeout(r, 30000, null); })]);
    if (!ready) { say('Offline setup unfinished · tap to retry', 'warn', 'The page itself is not saved yet.', reload); return; }
    if (updated) say('Updated · tap to reload', 'busy', 'A newer version is saved. Tap to open it.', reload);
    else if (online) say('Offline ready', 'ready', detail);
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
    if (hadController) {                                 // a newer build took over, not the first install
      updated = true;
      if (!running) say('Updated · tap to reload', 'busy', 'A newer version is saved. Tap to open it.', reload);
    }
    hadController = true;
  });
  navigator.serviceWorker.register('sw.js').then(function (r) {
    reg = r;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    sync();
  }, function (e) {
    say('Offline setup failed · tap to retry', 'warn', String(e && e.message || e), reload);
  });
  window.addEventListener('online', sync);
})();
'''

SW_JS = r'''/* Serves the saved copy of the page when there is no connection.
   Written by offline_tool.py; VERSION changes on every build, which is how
   browsers notice an update. */
'use strict';
var APP = __APP__, VERSION = __VERSION__, SHELL_FILES = __SHELL__;
var SHELL = APP + '-shell-' + VERSION, FILES = APP + '-files', MARK = '__offline';
var ROOT = new URL('./', self.location.href).href, ROOT_PATH = new URL(ROOT).pathname;

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(SHELL).then(function (cache) {
    return cache.addAll(SHELL_FILES.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.map(function (n) {
      return n.indexOf(APP + '-shell-') === 0 && n !== SHELL ? caches.delete(n) : null;
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


def inject(page, head, body):
    m = re.search(r'</head\s*>', page, re.I) or re.search(r'<body[\s>]', page, re.I)
    page = page[:m.start()] + head + page[m.start():] if m else head + page
    i = page.lower().rfind('</body')
    return page[:i] + body + page[i:] if i >= 0 else page + body


def collect(page, src_dir):
    """-> ({url: source path}, [missing urls], [skipped refs])"""
    col = RefCollector()
    col.feed(page)
    col.close()
    found, missing, skipped, root = {}, [], [], src_dir.resolve()
    for ref, required in [(r, True) for r in col.required] + [(r, False) for r in col.optional]:
        url = local_ref(ref)
        if not url or url in found or url in missing:
            continue
        if url in GENERATED:
            if url != 'index.html':
                skipped.append(url)
            continue
        path = (src_dir / urllib.parse.unquote(url)).resolve()
        try:
            path.relative_to(root)
        except ValueError:
            skipped.append(url)
            continue
        if path.is_file():
            found[url] = path
        elif required:
            missing.append(url)
    return found, missing, skipped


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
    app = slug(title)
    found, missing, skipped = collect(page, src_dir)

    head = HEAD_BLOCK.format(light=a.theme_light, dark=a.theme_dark, short=html.escape(short))
    out_page = inject(page, head, BODY_BLOCK).encode('utf-8')
    manifest = json.dumps({
        'name': title, 'short_name': short, 'id': './', 'start_url': './', 'scope': './',
        'display': 'standalone', 'background_color': a.theme_light, 'theme_color': a.theme_light,
        'icons': [{'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
                  {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
                  {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'}],
    }, indent=1).encode('utf-8')

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

    digest = hashlib.sha256(TOOL_VERSION.encode() + out_page + manifest)
    digest.update(json.dumps(entries, sort_keys=True).encode())
    version = digest.hexdigest()[:12]
    built = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    consts = {'__APP__': json.dumps(app), '__VERSION__': json.dumps(version), '__SHELL__': json.dumps(SHELL_FILES)}

    def fill(template):
        for k, v in consts.items():
            template = template.replace(k, v)
        return template.encode('utf-8')

    (stage / 'index.html').write_bytes(out_page)
    (stage / 'manifest.webmanifest').write_bytes(manifest)
    (stage / 'offline.js').write_bytes(fill(OFFLINE_JS))
    (stage / 'sw.js').write_bytes(fill(SW_JS))
    for name, px in ICONS:
        (stage / name).write_bytes(png(px, paint_icon))
    (stage / 'precache.json').write_text(json.dumps(
        {'app': app, 'name': title, 'version': version, 'built': built, 'files': entries},
        separators=(',', ':')), encoding='utf-8')

    old = home / 'site.old'
    if old.exists():
        shutil.rmtree(old)
    if site.exists():
        site.rename(old)
    stage.rename(site)
    if old.exists():
        shutil.rmtree(old)

    print('Built %s' % site)
    print('  page     %s (%s)' % (title, size_text(len(out_page))))
    print('  files    %d copied (%s)' % (len(entries), size_text(total)))
    print('  version  %s' % version)
    for url in skipped:
        print('  skipped  %s (outside the page folder or a reserved name)' % url)
    if missing:
        print('\nWARNING: %d file(s) the page shows are missing next to %s, e.g.' % (len(missing), src.name))
        for url in missing[:8]:
            print('    ' + url)
        top = sorted({m.split('/')[0] for m in missing if '/' in m})
        if top:
            print('  Put the %s folder that came with the page beside it, then build again.' % ', '.join(t + '/' for t in top))
        if a.strict:
            die('Stopped because of --strict.')
    print('\nNext: python3 %s publish%s' % (Path(sys.argv[0]).name,
          '' if a.home == DEFAULT_HOME else ' --home "%s"' % a.home))


# ---------------------------------------------------------------- serve

class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map, **{
        '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json', '.webmanifest': 'application/manifest+json',
        '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'})
    allow_users = frozenset()

    def send_head(self):
        if self.allow_users and self.headers.get('Tailscale-User-Login', '').lower() not in self.allow_users:
            self.send_error(403, 'Not shared with you')
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
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
    site = Path(a.home).expanduser().resolve() / 'site'
    if not (site / 'index.html').is_file():
        die('Nothing built at %s yet. Run build first.' % site)
    Handler.allow_users = frozenset(u.lower() for u in a.allow_user or ())
    httpd = ThreadingHTTPServer((a.bind, a.port), functools.partial(Handler, directory=str(site)))
    httpd.daemon_threads = True
    print('Serving %s at http://%s:%d/ (Ctrl-C stops)' % (site, a.bind, a.port), flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


# ---------------------------------------------------------------- tailscale + launchd

def find_tailscale():
    for c in (shutil.which('tailscale'),) + TAILSCALE_CANDIDATES:
        if c and os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    die('Could not find the tailscale command.\n'
        'Install Tailscale (https://tailscale.com/download) and sign in to your account. On a Mac the\n'
        'app is enough: this script uses the command built into /Applications/Tailscale.app.')


def ts(cli, *args, capture=True):
    env = dict(os.environ, TAILSCALE_BE_CLI='1')     # makes the Mac app binary act as the CLI
    if capture:
        return subprocess.run([cli] + list(args), env=env, capture_output=True, text=True)
    return subprocess.run([cli] + list(args), env=env)


def ts_status(cli):
    r = ts(cli, 'status', '--json')
    try:
        return json.loads(r.stdout)
    except ValueError:
        die('Tailscale did not answer (%s).\nOpen the Tailscale app, sign in, and run this again.'
            % (r.stderr.strip() or 'no output'))


def local_get(port, path, timeout=2):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))    # never through a proxy
    with opener.open('http://127.0.0.1:%d/%s' % (port, path), timeout=timeout) as r:
        return r.read()


def site_version(home):
    try:
        return json.loads((home / 'site' / 'precache.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None


def wait_for_server(port, version, seconds=15):
    end = time.time() + seconds
    while time.time() < end:
        try:
            if json.loads(local_get(port, 'precache.json')).get('version') == version:
                return True
        except Exception:
            pass
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
    """Keep `serve` running in the background, restarted at login. The script
    runs from home (outside Desktop/Documents/Downloads, which macOS keeps
    background programs out of)."""
    me = home / 'offline_tool.py'
    if Path(__file__).resolve() != me.resolve():
        shutil.copyfile(__file__, me)
    agent_stop(home)
    args = [sys.executable, str(me), 'serve', '--home', str(home), '--port', str(port)]
    for u in allow_users:
        args += ['--allow-user', u]
    plist = agent_plist(home)
    plist.parent.mkdir(parents=True, exist_ok=True)
    with open(plist, 'wb') as f:
        plistlib.dump({'Label': agent_label(home), 'ProgramArguments': args, 'RunAtLoad': True,
                       'KeepAlive': True, 'ProcessType': 'Background', 'WorkingDirectory': str(home),
                       'StandardOutPath': str(home / 'server.log'),
                       'StandardErrorPath': str(home / 'server.log')}, f)
    r = launchctl('bootstrap', 'gui/%d' % os.getuid(), str(plist))
    if r.returncode != 0:
        r = launchctl('load', '-w', str(plist))
    if r.returncode != 0:
        die('Could not start the background server: %s' % (r.stderr.strip() or r.stdout.strip()))


def served_by(cli, host, https_port):
    """What this machine already serves at https://host:port/, or None."""
    r = ts(cli, 'serve', 'status', '--json')
    try:
        web = json.loads(r.stdout or '{}').get('Web') or {}
    except ValueError:
        return None
    handler = ((web.get('%s:%d' % (host, https_port)) or {}).get('Handlers') or {}).get('/') or {}
    return handler.get('Proxy') or handler.get('Path') or handler.get('Text') or None


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
    info = site_version(home)
    if not info:
        die('Nothing built at %s yet. Run: python3 offline_tool.py build path/to/index.html' % (home / 'site'))
    cli = find_tailscale()
    st = ts_status(cli)
    if st.get('BackendState') != 'Running':
        die('Tailscale is %s. Open the Tailscale app, sign in to your account, and run this again.'
            % (st.get('BackendState') or 'not running'))
    host = ((st.get('Self') or {}).get('DNSName') or '').rstrip('.')
    if not host or (st.get('CurrentTailnet') or {}).get('MagicDNSEnabled') is False:
        die('MagicDNS is off for your tailnet, so this computer has no https name.\n'
            'Turn it on at https://login.tailscale.com/admin/dns and run this again.')
    target = 'http://127.0.0.1:%d' % a.port
    busy = served_by(cli, host, a.https_port)
    if busy and busy.rstrip('/') != target:
        die('%s already serves %s.\nPick another port, e.g.: python3 offline_tool.py publish --https-port 8443'
            % (public_url(host, a.https_port), busy))

    if sys.platform == 'darwin' and not a.no_agent:
        agent_start(home, a.port, a.allow_user or [])
        if not wait_for_server(a.port, info['version']):
            die('The background server did not come up on port %d. See %s\n'
                'If another program uses that port, run publish again with --port 8766.'
                % (a.port, home / 'server.log'))
    elif not wait_for_server(a.port, info['version'], seconds=2):
        die('Start the server first and keep it running, then publish again:\n'
            '    python3 %s serve --home "%s" --port %d' % (Path(sys.argv[0]).name, home, a.port))

    if not st.get('CertDomains'):
        print('Note: HTTPS certificates may be off for your tailnet. If Tailscale asks, follow its link\n'
              '(or enable "HTTPS Certificates" at https://login.tailscale.com/admin/dns).\n')
    r = ts(cli, 'serve', '--bg', '--https=%d' % a.https_port, target, capture=False)
    if r.returncode != 0:
        die('tailscale serve failed (see above). Fix that, then run publish again.')
    settings_path(home).write_text(json.dumps({'port': a.port, 'https_port': a.https_port, 'host': host,
                                               'agent': sys.platform == 'darwin' and not a.no_agent}),
                                   encoding='utf-8')
    url = public_url(host, a.https_port)
    print('\nShared on your tailnet only (not the public internet):\n\n    %s\n' % url)
    print('On your phone or laptop, with Tailscale on:\n'
          '  1. Open that link.\n'
          '  2. iPhone/iPad: Share > Add to Home Screen, then open it from the Home Screen.\n'
          '     Android/Chrome/Edge: menu > Install app (or Add to Home screen).\n'
          '  3. Wait for the header badge to say "Offline ready". After that it opens with no connection.\n'
          'The first visit can take a few seconds while Tailscale issues the certificate.')


def cmd_unpublish(a):
    home = Path(a.home).expanduser().resolve()
    s = load_settings(home)
    https_port = a.https_port or s.get('https_port') or DEFAULT_HTTPS_PORT
    cli = find_tailscale()
    r = ts(cli, 'serve', '--https=%d' % https_port, 'off')
    print('tailscale serve on port %d: %s' % (https_port, 'off' if r.returncode == 0 else
          'not changed (%s)' % (r.stderr.strip() or r.stdout.strip())))
    if sys.platform == 'darwin':
        agent_stop(home)
        print('background server: stopped')
    if settings_path(home).exists():
        settings_path(home).unlink()
    print('The built copy stays in %s; delete that folder if you no longer need it.\n'
          'Devices that saved it keep their offline copy until you remove the app from them.' % home)


def cmd_status(a):
    home = Path(a.home).expanduser().resolve()
    s = load_settings(home)
    port = a.port or s.get('port') or DEFAULT_PORT
    info = site_version(home)
    print('built copy   ' + ('%s, version %s, %d files, built %s' % (home / 'site', info['version'], len(info['files']),
                             info['built']) if info else 'none at %s' % (home / 'site')))
    try:
        v = json.loads(local_get(port, 'precache.json')).get('version')
        print('local server http://127.0.0.1:%d/ is up%s' % (port, '' if info and v == info['version']
                                                             else ' but serves a different build (version %s)' % v))
    except Exception:
        print('local server not answering on port %d' % port)
    if sys.platform == 'darwin':
        r = launchctl('print', 'gui/%d/%s' % (os.getuid(), agent_label(home)))
        print('background   %s' % ('installed (%s)' % agent_label(home) if r.returncode == 0 else 'not installed'))
    cli = None
    for c in (shutil.which('tailscale'),) + TAILSCALE_CANDIDATES:
        if c and os.path.isfile(c):
            cli = c
            break
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
    b.add_argument('--strict', action='store_true', help='fail when a referenced file is missing')
    b.set_defaults(fn=cmd_build)

    s = with_home(sub.add_parser('serve', help='run the local web server in the foreground'))
    s.add_argument('--port', type=int, default=DEFAULT_PORT)
    s.add_argument('--bind', default='127.0.0.1', help=argparse.SUPPRESS)
    s.add_argument('--allow-user', action='append', metavar='LOGIN',
                   help='only answer requests from this Tailscale login (repeatable)')
    s.set_defaults(fn=cmd_serve)

    pb = with_home(sub.add_parser('publish', help='keep the server running and share it with tailscale serve'))
    pb.add_argument('--port', type=int, default=DEFAULT_PORT, help='local port (default %d)' % DEFAULT_PORT)
    pb.add_argument('--https-port', type=int, default=DEFAULT_HTTPS_PORT, help='tailnet HTTPS port (default 443)')
    pb.add_argument('--allow-user', action='append', metavar='LOGIN',
                    help='only your Tailscale login may open it, e.g. you@example.com (repeatable)')
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
