# Offline tool over Tailscale

Turns a self-contained HTML page (like the Symbol Library `index.html` with its
`img/` folder) into an app you can install on your phone, tablet or laptop. It
works **with no connection**, and by default only devices signed in to **your
own Tailscale login** can open it.

How it works:

```
 your Mac                                   your phone / laptop (Tailscale on)
 ┌───────────────────────────────┐          ┌──────────────────────────────┐
 │ offline_tool.py serve         │  HTTPS   │ https://my-mac.tailXXXX.ts.net│
 │  127.0.0.1:8765 (local only)  │◀────────▶│  first visit saves everything │
 │ tailscale serve --bg  :443    │ tailnet  │  later visits work offline    │
 └───────────────────────────────┘  only    └──────────────────────────────┘
```

* `build` copies the page and every file it shows into `~/SymbolLibraryOffline/site`
  and adds an app manifest, a home-screen icon and a service worker (the part
  of a web app that keeps a saved copy).
* `publish` keeps a tiny web server running on the Mac (listening on 127.0.0.1
  only, so nothing else on your Wi-Fi can reach it) and runs
  `tailscale serve` so your tailnet gets it over HTTPS. Service workers need
  HTTPS, and Tailscale supplies the certificate. The server answers only
  requests that come through Tailscale from your login (or from the Mac
  itself).
* The first time a device opens the link, a badge in the page header counts the
  files as they are saved (`Saving offline 120/438`) and then shows
  **Offline ready**. From then on the page opens instantly, even in airplane
  mode, and Tailscale only matters for picking up updates.

Nothing goes to the public internet: it does not use Tailscale Funnel, and the
page is never uploaded anywhere. (Turning on HTTPS certificates does put the
Mac's `*.ts.net` name in public certificate logs; Tailscale explains this when
you enable it.)

## What you need

* A Mac with **Python 3** (type `python3 --version` in Terminal; if macOS
  offers to install the developer tools, accept).
* **Tailscale** on the Mac and on each phone or laptop, all signed in to the
  same account.
* In the Tailscale admin console, on the **DNS** page
  (<https://login.tailscale.com/admin/dns>): **MagicDNS** on and
  **HTTPS Certificates** enabled. If you forget, `publish` prints a link to
  turn them on.

## Set it up (once)

1. Download `offline_tool.py` from this folder to your Mac.
2. Open Terminal and build from the folder that holds `index.html` **and** its
   `img/` folder (you can drag the folder into Terminal to type its path):

   ```sh
   python3 ~/Downloads/offline_tool.py build ~/path/to/SymbolLibrary
   ```

   It lists how many files it copied. If it warns about missing files, the
   `img/` folder is not next to `index.html`.
3. Share it on your tailnet:

   ```sh
   python3 ~/Downloads/offline_tool.py publish
   ```

   It prints your link, e.g. `https://my-mac.tail1234.ts.net/`, and the login
   that may open it. macOS may show a "background item added" notice for
   Python: that is the small server that keeps running and restarts at login.
4. On each device, with Tailscale on:
   * **iPhone / iPad:** open the link in Safari, tap **Share › Add to Home
     Screen**, then open the app **from the Home Screen** and wait for
     *Offline ready*. (Home Screen apps keep their own storage, separate from
     Safari, so the saving has to happen inside the app.)
   * **Android:** open the link in Chrome, menu **› Install app** (or *Add to
     Home screen*), open it, wait for *Offline ready*.
   * **Laptop:** Chrome/Edge show an install icon in the address bar; in
     Safari on a Mac use **File › Add to Dock**. Avoid relying on a plain
     Safari bookmark: Safari erases a site's saved copy if you go about a week
     of browsing without opening it. Installed apps are not affected.

## Updating the page

When you regenerate `index.html` or the images, build again; there is no need
to publish again:

```sh
python3 ~/SymbolLibraryOffline/offline_tool.py build ~/path/to/SymbolLibrary
```

Next time a device opens the app, or brings it back to the front, while
connected to Tailscale, the badge shows **Updating…** while it fetches only the
files that changed, then **Updated · tap to reload**. Files the new page no
longer uses are removed once it is running.

If files that the previous build had are missing now (say the `img/` folder is
not in place yet), `build` changes nothing and tells you, because publishing it
would delete those pictures from every device. Put the files back, or add
`--allow-missing` if they really are gone. Likewise, building a *different*
page into the same folder is refused unless you add `--replace`; use `--home`
for a second page instead.

**Getting a newer `offline_tool.py`:** download it, build with it as in setup,
then run its `publish` once (no options needed: it remembers the port and who
may open it). `build` reminds you when the background server runs a
different copy.

## Other commands

```sh
python3 ~/SymbolLibraryOffline/offline_tool.py status      # what is built, running and shared
python3 ~/SymbolLibraryOffline/offline_tool.py unpublish   # stop sharing and stop the server
```

`unpublish` turns off only what this tool set up in Tailscale. It leaves the
built copy in `~/SymbolLibraryOffline` and leaves the offline copies on your
devices; to remove one, delete the app and the site's website data on that
device.

Running `publish` again without options keeps the previous port, link and
list of people. Options worth knowing:

| Option | Use |
| --- | --- |
| `publish --allow-user someone@example.com` | Also let another Tailscale login open it (repeat for more people). Your own login always can. |
| `publish --allow-tailnet` | Let every device your tailnet's access rules allow open it. |
| `publish --https-port 8443` | If this Mac already serves something else on Tailscale port 443. The link gets `:8443`, and the old link is turned off (devices need to install it again from the new link). |
| `publish --port 8766` | If another program already uses local port 8765. |
| `build --short-name Symbols` | The name under the home-screen icon (12 characters or fewer). |
| `build --strict` | Change nothing if any file the page shows is missing. |
| `build --allow-missing` | Publish even though files the last build had are gone. |
| `build --replace` | Put a different page in a folder that already holds one. |
| `--home DIR` | Keep a second page in its own folder (use the same `--home` for every command, and a different `--https-port`). Pick a folder directly in your home folder: macOS stops background programs from reading Desktop, Documents, Downloads and iCloud Drive. |

## The badge

| Badge | Meaning |
| --- | --- |
| Saving offline 120/438 | Downloading; keep the app open until it finishes. |
| Offline ready | Everything is saved; this device works without a connection. |
| Offline copy | No connection right now; you are using the saved copy. |
| Offline copy · update unfinished | No connection, and an update was interrupted; some pictures are from the newer build. Connect and tap. |
| Updating… | A newer build is being saved; the current one keeps working. |
| Updated · tap to reload | The newer build is saved; tap to switch to it. |
| Saved 120/438 · connect to finish | The Mac stopped answering part way; check Tailscale and that the Mac is awake, then tap. |
| Update unfinished · tap to retry | The new build did not finish saving; the old one still works offline. |
| Offline needs the https link | Opened by IP address or `http://`; use the `https://…ts.net` link. |
| Not shared with this login | This device uses a Tailscale login the Mac does not share with; see below. |

## If something goes wrong

* **`tailscale` not found:** install Tailscale and sign in. The script also
  finds the command inside `/Applications/Tailscale.app`.
* **`publish` prints a login.tailscale.com link:** Serve or HTTPS is not yet
  enabled for your tailnet. Open the link and approve; if `publish` then says
  Tailscale is not serving it yet, run `publish` again.
* **The link does not load on the phone:** check Tailscale is on (on both
  devices) and the Mac is awake. To keep serving with the display off, turn on
  *System Settings › Battery › Options › Prevent automatic sleeping on power
  adapter when the display is off*. Closing a MacBook's lid still puts it to
  sleep unless it is on power with an external display. Once a device shows
  *Offline ready* the Mac can be off.
* **"Not shared with this login":** that device is signed in to a different
  Tailscale login. On the Mac run `publish --allow-user that@login` (your own
  login stays allowed).
* **The server will not start:** read `~/SymbolLibraryOffline/server.log`.
  A failed `publish` puts back whatever was running before, so a working link
  keeps working.
* **Storage full:** the saved copy is about the size of the `img/` folder plus
  the page. Free some space and tap the badge.

Requires Python 3.8+ (standard library only) and a current Tailscale (the
`tailscale serve --bg` form). The Mac App Store and standalone Tailscale apps
cannot serve a folder directly, which is why this runs its own local server and
has Tailscale proxy to it.
