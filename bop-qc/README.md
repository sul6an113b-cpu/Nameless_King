# BOP QC Walkdown

An offline iPhone web app for balance-of-plant QC walkdowns. You inspect an item, mark each checkpoint, record the result (**OK / OK with comments / Rejected**) and raise categorised comments (**A / B+ / B / C / D**). Each comment then stays on the punch list until QC verifies it closed.

- **No server and no account.** Everything is stored on the phone (IndexedDB). Nothing leaves the phone unless you export it.
- **Works without signal** once it has been opened once while online.
- **No project data is built in.** Project label, tags, areas, subcontractors, document numbers, punch numbers and code editions are all typed locally.

---

## Install on iPhone

1. Host the `bop-qc/` folder on any HTTPS static host (see [Hosting](#hosting)).
2. Open the URL in **Safari**, tap **Share → Add to Home Screen**.
3. Open it **from the home-screen icon** once while online. After that it runs offline.

The home-screen app keeps its data separately from Safari. Always use the icon. Data typed in a Safari tab is a different store that Safari can delete after 7 days without use, and the app shows a warning when it is opened that way. Assume **deleting the icon deletes the data**, and back up before you do.

Link to the folder URL **with its trailing slash** and the same capitalisation every time, e.g. `…/Nameless_King/bop-qc/`. The offline cache only covers that exact path.

More → Storage shows whether the offline files are cached, whether the app is running installed, and whether iOS has granted persistent storage. The installed app asks for persistent storage on every launch.

**Before the first site walk, run More → Device check once on your iPhone** (with signal, from the icon). It records what actually works on your phone:
- automatic: installed, offline files, protected storage, space, database read/write, photo encoding, file sharing
- manual: share sheet, saving a file, camera, print/PDF

This turns the "Unknown" rows in the table below into checked results.

If iOS restarts the app in the background (it often does while the camera or Files is open), the app reopens the screen you were on. It checks for a new version each time it comes back to the front.

## Daily use

| Step | What you do |
|---|---|
| Start | **Items → + New item check**: pick the type, type the tag and area (subcontractor and document refs are optional). |
| Check | Each checkpoint gets **✓ OK**, **✗ Defect**, **? Ask** or **N/A**. *Defect* opens a comment: text (or quick-pick phrase), category (always visible above Save), subcontractor, optional project punch no., photos. *Ask* records an unknown as a question. **Next unmarked ↓** jumps down the list. |
| Unsaved work | A half-written comment and its photos are saved on the phone as you go. A stray tap outside the sheet or a back-swipe does not close it; only **Cancel** discards it. If the app is closed (e.g. iOS closes it while the camera is open), the item shows **Unsaved comment → Resume**. |
| Photos | 📷 on the item, on a comment, or "after fix" on a punch item. Tap a photo to add a caption or **mark it up** in red; the unmarked original is kept (**Show original**). On a punch item a photo can be moved between "as found" and "after fix". |
| Result | **Result** → OK / OK with comments / Rejected. The app warns if you pick OK with open comments, if there is an open Cat A, or if checkpoints are unmarked. A rejection needs a reason. **Save & next** starts the next item in the same area. |
| Follow up | **Punch** tab: filter by status, category, area. *Construction reports closed* → **Ready for QC**. On site: **Verify closure**. The core checks are always answered; *item located*, *defect fully fixed as written* and *no new damage* must be **Yes** (no N/A). Records, re-test, joint and weld checks are answered when relevant. Then **Verified** or **Not closed** (needs a reason). A verified item is locked (description, category, subcontractor); **Re-open** to change it. Every edit is kept in the item's history. |
| Re-check | **Re-inspect** on a rejected item starts a new check linked to the old one. |
| Unknowns | **Ask** tab: open questions, plus suggested ones (undefined categories, unconfirmed code editions, which systems are B31.1 vs B31.3). |
| Export | **Export** tab, scope by area, subcontractor and dates. See below. |

### Exports

| Export | Content | Use |
|---|---|---|
| Report (HTML) | Summary, **follow-up list of every item not closed**, each item with result, checklist, comments, questions, photos | Open it in the app, or Share it (Mail / Files). PDF route: see the table under [Hosting](#hosting) |
| Punch list CSV | One row per comment: local no., project no., category, status, dates, days open, photo file names, history | Excel tracking |
| Items / Checkpoints / Questions CSV | One row per item / checkpoint / question | Excel |
| Package (ZIP) | Report + all CSVs + full-size photos named `CHK-0007_TAG_1.jpg`, `P-0012_closure_1.jpg` | Office PC |
| Backup (ZIP) | Everything, including all photos | Restore on this phone or another one |
| Report for this item | One item only (button on the item screen) | Send to a subcontractor |

CSV files start with a UTF-8 BOM so Excel shows Arabic and special characters correctly. Free text starting with `= + - @` gets a leading `'` so Excel does not treat it as a formula.

### Backup (do this every few days)

**Export → Make backup → Share → Save to Files / iCloud Drive** (or e-mail it to yourself). The Items screen reminds you when data has changed and no backup has been made for 2 days. Restore with **Export → Restore**:
- **Merge** adds records from the backup and keeps the newer copy where both exist. If a number (e.g. `P-0012`) is already used on this phone by a different record, the incoming record gets a new number and keeps the old one in its history. Settings and numbering come from the backup only when this phone has no records yet; otherwise this phone's settings stay and checklist additions are merged.
- **Replace** checks the whole file first and refuses an incomplete backup before anything is deleted. If it is interrupted part-way, the app says so on every start until you run it again.
- Backups that were unzipped and zipped again (Files → Compress, Windows "Compressed folder") restore too.

A backup counts as done only after a completed **Share** or after you confirm that the downloaded file saved; until then the reminder stays.

If two phones are used, give each its own number prefix (More → prefixes) so `P-0012` never exists twice.

## What is confirmed, inferred and unknown

The app follows three rules:

- **Unknown is never filled with a guess.** Checkpoints whose acceptance value comes from project documents are tagged **Project – unknown** and carry a question to ask on site. Tapping **? Ask** puts that question on the Ask list and into every report.
- **Code clauses are cited only when confirmed.** Each cited clause passed an adversarial citation audit and then two more independent skeptics (number/title and content). Every other reference reads "verify clause/edition". Even confirmed clauses say "confirm project edition". The project's code editions are blank ("unknown – confirm") until you enter them under More → Code editions, and reports print that status.
- One example of why editions matter: ASME B31.3 para 335.2.3 (Bolt Length) is cited by number and title only, because its acceptance wording changed between editions. Secondary sources, including an ASME PVP paper, say the 2016 edition removed the old "not more than one thread short" allowance. Whether one thread short is acceptable is a site question.
- **Category B+ was not defined**, so it is marked "definition not confirmed" until you enter the project definition under More → Punch categories. A meaning that is typed but not ticked as confirmed is exported as "… (NOT CONFIRMED)".
- A punch item verified without a "construction reports closed" step has an empty "Ready for QC" date. The app does not fill in a date.

Checkpoint basis tags: **Code** (general code requirement, generic edition), **Practice** (common field QC practice, i.e. inferred), **Project – unknown** (depends on project spec or drawings), **Local** (added by you).

## Customising

- **More → Checklists**: hide library checkpoints, add your own per item type. This affects new items only. Past checks keep the checklist they were done against.
- **More → Punch categories**: meanings and whether each is confirmed.
- **More → Photo size / quality**: the default keeps photos at 1600 px, about 150–400 KB each.
- The checklist library is in `js/checklists.js` (plain data).

## Hosting

Any static HTTPS host works. On GitHub Pages for this repository:

1. Merge this branch into `main`.
2. Repository **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**.
3. The app is then at `https://<user>.github.io/<repo>/bop-qc/`.

The app code contains no project information, but the repository is public. **Never commit exported reports, CSVs or backups to it.** `.gitignore` in this folder blocks the usual export file names.

All of an account's GitHub Pages sites share one web origin (`<user>.github.io`). Any other page published from the same account can technically read this app's on-phone storage. Only publish pages you trust from that account, or host the app on its own domain.

### iPhone behaviour (from WebKit source, docs and bug reports)

| Point | Status |
|---|---|
| Home-screen apps are exempt from Safari's 7-day deletion of site data | Confirmed |
| `navigator.storage.persist()` is granted to home-screen apps | Confirmed |
| Storage quota is up to about 60 % of disk per site (iOS 17+) | Confirmed |
| Safari and the home-screen app keep separate storage | Confirmed |
| The camera button opens the camera directly. "From library…" offers the photo library, with HEIC converted to JPEG | Confirmed |
| Photos arrive already rotated upright, so the app does no manual EXIF rotation | Confirmed |
| Share sheet accepts CSV, HTML and ZIP files; `share()` must follow a tap within ~5 s | Confirmed. This is why export is two taps (Prepare → Share) |
| Deleting the home-screen icon deletes the data | Unknown (no primary source). Treated as true: back up |
| "Save" (browser download) inside the home-screen app | Unknown. Use **Share → Save to Files** as the main route |
| Printing the HTML report to PDF from the iPhone | Unknown. The report opens inside the app. Try Share → Print, or save it to Files and print from there. Confirm on your phone |
| Edge-swipe Back in the home-screen app | Likely. The app makes a swipe close an open sheet instead of leaving the screen |

### Releasing an update

Change files, then bump `VERSION` in `sw.js`. Phones download the new version in the background and show **Update ready**. Data is kept.

## Development

```
cd bop-qc
npx http-server -p 8765 -c-1          # any static server
PW=$(npm root -g)/playwright/index.mjs node tests/e2e.mjs http://localhost:8765/
PW=$(npm root -g)/playwright/index.mjs node tests/regression.mjs http://localhost:8765/
```

`tests/e2e.mjs` drives the app in Chromium at iPhone 13 size. It covers the walkdown flow, photo downscaling and mark-up, closure verification, all exports (ZIP validated with Python), wipe and restore, and running offline.

`tests/regression.mjs` covers the review findings:
- per-comment subcontractor kept on item edits
- failed saves reported and retryable
- drafts surviving stray taps, back-swipes and restarts
- viewer and mark-up behaviour
- the bottom bar fitting the screen
- required closure checks
- subcontractor-filtered exports
- every photo named in a package CSV being inside the ZIP
- restore validation, renumbering, settings and re-zipped backups
- backup confirmation

Neither suite replaces a check on a real iPhone (Safari/WebKit).

Files: `index.html`, `app.css`, `js/app.js` (UI), `js/store.js` (state and all writes), `js/db.js` (IndexedDB), `js/export.js` (CSV, report, ZIP, backup/restore), `js/zip.js`, `js/photo.js`, `js/checklists.js` (library), `sw.js` (offline cache), `manifest.webmanifest`, `icons/`.
