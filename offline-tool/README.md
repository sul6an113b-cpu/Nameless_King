# Offline tool over Tailscale

Turns a self-contained HTML page (like the Symbol Library `index.html` with its
`img/` folder) into an app you can install on your phone, tablet or laptop. It
works **with no connection**, and only devices signed in to **your Tailscale
account** can reach it.

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
  HTTPS, and Tailscale supplies the certificate.
* The first time a device opens the link, a badge in the page header counts the
  files as they are saved (`Saving offline 120/438`) and then shows
  **Offline ready**. From then on the page opens instantly, even in airplane
  mode, and Tailscale only matters for picking up updates.

Nothing goes to the public internet: it does not use Tailscale Funnel, and the
page is never uploaded anywhere.

## What you need

* A Mac with **Python 3** (type `python3 --version` in Terminal; if macOS
  offers to install the developer tools, accept).
* **Tailscale** on the Mac and on each phone or laptop, all signed in to the
  same account.
* In the Tailscale admin console, on the **DNS** page
  (<https://login.tailscale.com/admin/dns>): **MagicDNS** on and
  **HTTPS Certificates** enabled. If you forget, `publish` will print a link to
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

   It prints your link, e.g. `https://my-mac.tail1234.ts.net/`. macOS may show
   a "background item added" notice for Python: that is the small server
   that keeps running and restarts at login.
4. On each device, with Tailscale on:
   * **iPhone / iPad:** open the link in Safari, tap **Share › Add to Home
     Screen**, then open the app **from the Home Screen** and wait for
     *Offline ready*. (Home Screen apps keep their own storage, separate from
     Safari, so the saving has to happen inside the app.)
   * **Android:** open the link in Chrome, menu **› Install app** (or *Add to
     Home screen*), open it, wait for *Offline ready*.
   * **Laptop:** Chrome/Edge show an install icon in the address bar; Safari on
     a Mac has **File › Add to Dock**. Or just keep it bookmarked.

## Updating the page

When you regenerate `index.html` or the images, build again; there is no need
to publish again:

```sh
python3 ~/SymbolLibraryOffline/offline_tool.py build ~/path/to/SymbolLibrary
```

Next time a device opens the app while connected to Tailscale, it downloads only
the files that changed, removes ones that are gone, and the badge says
**Updated · tap to reload**.

## Other commands

```sh
python3 ~/SymbolLibraryOffline/offline_tool.py status      # what is built, running and shared
python3 ~/SymbolLibraryOffline/offline_tool.py unpublish   # stop sharing and stop the server
```

`unpublish` leaves the built copy in `~/SymbolLibraryOffline` and leaves the
offline copies on your devices; delete those yourself if you want them gone.

Options worth knowing:

| Option | Use |
| --- | --- |
| `publish --allow-user you@example.com` | Answer only your own Tailscale login, even if you later share this Mac with someone. |
| `publish --https-port 8443` | If this Mac already serves something else on Tailscale port 443. The link gets `:8443`. |
| `publish --port 8766` | If another program already uses local port 8765. |
| `build --short-name Symbols` | The name under the home-screen icon (12 characters or fewer). |
| `build --strict` | Stop instead of warning when a file the page shows is missing. |
| `--home DIR` | Keep a second page in its own folder (use the same `--home` for every command). |

## The badge

| Badge | Meaning |
| --- | --- |
| Saving offline 120/438 | Downloading; keep the app open until it finishes. |
| Offline ready | Everything is saved; this device works without a connection. |
| Offline copy | No connection right now; you are using the saved copy. |
| Updated · tap to reload | A newer build was saved; tap to switch to it. |
| Saved 120/438 · connect to finish | Lost the connection part way; reconnect Tailscale and tap. |
| Offline needs the https link | Opened by IP address or `http://`; use the `https://…ts.net` link. |

## If something goes wrong

* **`tailscale` not found:** install Tailscale and sign in. The script also
  finds the command inside `/Applications/Tailscale.app`.
* **`publish` prints a login.tailscale.com link:** Serve or HTTPS is not yet
  enabled for your tailnet. Open the link, approve, and `publish` carries on.
* **The link does not load on the phone:** check Tailscale is on (on both
  devices) and the Mac is awake. To let the Mac serve with the lid closed or
  display off, see *System Settings › Battery/Energy › Prevent automatic
  sleeping*. Once a device shows *Offline ready* the Mac can be off.
* **The server will not start:** read `~/SymbolLibraryOffline/server.log`.
* **Storage full:** the saved copy is about the size of the `img/` folder plus
  the page. Free some space and tap the badge.

Requires Python 3.8+ (standard library only) and a current Tailscale (the
`tailscale serve --bg` form). The Mac App Store and standalone Tailscale apps
cannot serve a folder directly, which is why this runs its own local server and
has Tailscale proxy to it.
