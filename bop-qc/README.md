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

The home-screen app keeps its data separately from Safari. Always use the icon. **Deleting the icon deletes the data**, so back up first.

## Daily use

| Step | What you do |
|---|---|
| Start | **Items → + New item check**: pick the type, type the tag and area (subcontractor and document refs are optional). |
| Check | Each checkpoint gets **✓ OK**, **✗ Defect**, **? Ask** or **N/A**. *Defect* opens a comment: quick-pick phrase, category, subcontractor, optional project punch no., photo. *Ask* records an unknown as a question. |
| Photos | 📷 on the item, on a comment, or "after fix" on a punch item. Tap a photo to add a caption or **mark it up** in red. |
| Result | **Result** → OK / OK with comments / Rejected. The app warns if you pick OK with open comments, if there is an open Cat A, or if checkpoints are unmarked. A rejection needs a reason. **Save & next** starts the next item in the same area. |
| Follow up | **Punch** tab: filter by status, category, area. *Construction reports closed* → **Ready for QC**. On site: **Verify closure** (closure checks + after-fix photo) → **Verified closed**, or **Not closed** with a reason. A closed item can be re-opened. |
| Re-check | **Re-inspect** on a rejected item starts a new check linked to the old one. |
| Unknowns | **Ask** tab: open questions, plus suggested ones (undefined categories, unconfirmed code editions, which systems are B31.1 vs B31.3). |
| Export | **Export** tab, scope by area, subcontractor and dates. See below. |

### Exports

| Export | Content | Use |
|---|---|---|
| Report (HTML) | Summary, **follow-up list of every item not closed**, each item with result, checklist, comments, questions, photos | Open → Share → Print → pinch out on the preview → Save as PDF |
| Punch list CSV | One row per comment: local no., project no., category, status, dates, days open, photo file names, history | Excel tracking |
| Items / Checkpoints / Questions CSV | One row per item / checkpoint / question | Excel |
| Package (ZIP) | Report + all CSVs + full-size photos named `CHK-0007_TAG_1.jpg`, `P-0012_closure_1.jpg` | Office PC |
| Backup (ZIP) | Everything, including all photos | Restore on this phone or another one |
| Report for this item | One item only (button on the item screen) | Send to a subcontractor |

CSV files start with a UTF-8 BOM so Excel shows Arabic and special characters correctly. Free text starting with `= + - @` gets a leading `'` so Excel does not treat it as a formula.

### Backup (do this every few days)

**Export → Make backup → Share → Save to Files / iCloud Drive** (or e-mail it to yourself). The Items screen reminds you when data has changed and no backup has been made for 2 days. Restore with **Export → Restore**:
- **Merge** adds records from the backup and keeps the newer copy where both exist.
- **Replace** wipes the phone first.

If two phones are used, give each its own number prefix (More → prefixes) so `P-0012` never exists twice.

## What is confirmed, inferred and unknown

The app follows three rules:

- **Unknown is never filled with a guess.** Checkpoints whose acceptance value comes from project documents are tagged **Project – unknown** and carry a question to ask on site. Tapping **? Ask** puts that question on the Ask list and into every report.
- **Code clauses are cited only when confirmed by an adversarial check.** Otherwise the reference reads "verify clause/edition". Even confirmed clauses say "confirm project edition". The project's code editions are blank ("unknown – confirm") until you enter them under More → Code editions, and reports print that status.
- **Category B+ was not defined**, so it is marked "definition not confirmed" until you enter the project definition under More → Punch categories.

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

### Releasing an update

Change files, then bump `VERSION` in `sw.js`. Phones download the new version in the background and show **Update ready**. Data is kept.

## Development

```
cd bop-qc
npx http-server -p 8765 -c-1          # any static server
PW=$(npm root -g)/playwright/index.mjs node tests/e2e.mjs http://localhost:8765/
```

The end-to-end test drives the app in Chromium at iPhone 13 size. It covers the walkdown flow, photo downscaling and mark-up, closure verification, all exports (ZIP validated with Python), wipe and restore, and running offline. It does not replace a check on a real iPhone (Safari/WebKit).

Files: `index.html`, `app.css`, `js/app.js` (UI), `js/store.js` (state and all writes), `js/db.js` (IndexedDB), `js/export.js` (CSV, report, ZIP, backup/restore), `js/zip.js`, `js/photo.js`, `js/checklists.js` (library), `sw.js` (offline cache), `manifest.webmanifest`, `icons/`.
