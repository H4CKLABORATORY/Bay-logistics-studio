# Logistics Studio — Architecture

> Brand is configurable in Settings (`brandName`). No vendor name or logo is
> bundled in the product. The repository name is a project label, not product
> branding.

## Overview

Logistics Studio is a desktop Bill of Lading (BOL) manager for warehouse and
delivery operations. It is an Electron app: a TypeScript main process owns the
database and all privileged operations, a React renderer owns the UI, and the
two talk only through a small, allow-listed IPC bridge.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Desktop shell | Electron 33 | Real installable Windows app (`.exe` via electron-builder); printer access via the Electron print API |
| Language | TypeScript 5 (strict) | Shared types between main, renderer, and tests |
| Renderer | React 18 + Vite 5 | Fast dev/build, small bundle, no framework lock-in |
| Database | SQLite via `better-sqlite3` 11 | File-backed, real UNIQUE constraints (BOL numbering), synchronous API fits the main process. Prebuilt native binaries exist for Windows/macOS/Linux. If a platform lacks a prebuild, `npm rebuild better-sqlite3` compiles it; `sql.js` was considered and rejected (in-memory by default, no real constraints, slower for large BOL lists) |
| PDF | `pdf-lib` 1 | Pure-JS PDF generation, no native deps, testable in Node; Letter default, A4 option, portrait/landscape, configurable margins |
| Installer | electron-builder 25 | NSIS + portable `.exe` on Windows; AppImage on Linux |
| Tests | Vitest 2 | Unit tests for numbering, validation, email parsing, PDF generation |

## Process model & security

- **Main process** (`src/main/`): creates the `BrowserWindow`, owns the
  SQLite database, registers all IPC handlers, generates PDFs, talks to
  printers and the file system.
- **Preload** (`src/main/preload.ts`): the only bridge. `contextBridge` exposes
  a fixed `window.api` object — one function per IPC channel. No Node APIs
  leak into the renderer.
- **Renderer** (`src/renderer/`): React app. It never touches the filesystem,
  the database, or `require`. All data flows through `window.api`.
- `BrowserWindow` is created with **`contextIsolation: true`** and
  **`nodeIntegration: false`**. A Content-Security-Policy in `index.html`
  restricts sources to `'self'`.
- **IPC allow-list**: only the channels in `preload.ts` / `ipc.ts` exist
  (`bol:*`, `catalog:*`, `settings:*`, `templates:*`, `backup:*`,
  `printers:list`). There is no generic "run anything" channel.
- **SQL**: every query is a prepared statement with bound parameters
  (`better-sqlite3` `.prepare(...).run(...)`). Table names for catalog CRUD
  come from a hardcoded whitelist (`CATALOG_TABLES`), never from user input.
- **Input validation**: BOL documents are validated in `src/shared/validation.ts`
  (required fields, date format, item quantity > 0, weight format) before any
  insert/update, in main and in the renderer. Catalog records are validated
  the same way (name required, email format when present).
- **No secrets**: the app stores no credentials, tokens, or API keys. Backups
  are local JSON files chosen by the user via a save dialog.

## Data model (SQLite, `logistics-studio.db`)

Database file location: `app.getPath('userData')` — the OS persistent
per-user location (e.g. `%APPDATA%\Logistics Studio\` on Windows). Never in
the install folder, so updates and reinstalls keep the data.

| Table | Purpose |
| --- | --- |
| `companies` | Company records (name, address, phone, email) |
| `customers` | Customers (name, contact, phone, email, address) |
| `projects` | Projects, linked to a customer |
| `addresses` | Reusable addresses (label, address, city, state, zip, notes) |
| `requesters` | People who request BOLs |
| `carriers` | Carriers |
| `items` | Reusable items (model, description, default weight) |
| `materials` | Materials (name, sku, unit, weight) |
| `bol_documents` | One row per BOL. `bol_number` is `UNIQUE`. Exact fields: BOL NUMBER, DATE, JOB #, SHIP FROM, DELIVERY ADDRESS, REQUEST BY, TRUCK/TRAILER, THIRD PARTY FREIGHT CHARGES BILL TO, REQUESTED DELIVERY, DELIVERY NOTES; plus Warehouse internal signatures (FOUND BY / CHECKED BY / LOADED BY) and Delivery receipt fields (Receiver Printed Name, Date, Driver Signature) |
| `bol_items` | Line items: QUANTITY \| MODEL/DESCRIPTION \| RR # \| WEIGHT, plus FOUND/PICKED/LOADED flags (Warehouse) |
| `bol_history` | Audit log of BOL changes (created/updated/duplicated/deleted) |
| `templates` | The 7 base templates (Warehouse, Delivery, Standard, Return, Transfer, Pickup, Custom) with their field sets and signature behaviour |
| `settings` | Single-row JSON: brand, company, numbering, print, backups, theme |
| `meta` | Schema version |

Migrations run at startup (`CREATE TABLE IF NOT EXISTS` + seed of the 7
templates and default settings). Schema version is tracked in `meta`.

## BOL numbering

Consecutive, no duplicates. Settings hold `prefix`, `nextNumber`,
`padLength`, and `mode` (`global` = one sequence for all templates,
`per-template` = separate sequence per template). Allocation
(`src/shared/bolNumbering.ts`) formats the next number, checks it against
the set of used numbers from the DB, and skips any already taken. The DB
`UNIQUE` constraint on `bol_number` is the final backstop. Covered by Vitest.

## BOL templates

- **Warehouse (default)**: items have FOUND / PICKED / LOADED checkboxes;
  internal signatures FOUND BY / CHECKED BY / LOADED BY. **No customer
  receipt signatures.**
- **Delivery**: Receiver Printed Name, Date, Driver Signature. **No
  FOUND/PICKED/LOADED, no internal signatures.**
- **Standard, Return, Transfer, Pickup, Custom**: configurable shells stored
  in the `templates` table; each declares whether it uses warehouse checks,
  internal signatures, or a delivery receipt. Field sets are editable via
  the templates API / Settings.

## PDF & print

- PDF generation is pure `pdf-lib` (`src/shared/pdf.ts`), shared by the main
  process and the test suite. Letter is the default paper size, A4 is an
  option; portrait/landscape and margins are configurable. Long item lists
  paginate to additional pages (no clipped content — the generator measures
  wrapped text height per row). Page numbers and the BOL number appear in the
  footer; the BOL number is also the PDF title metadata.
- **Preview**: the main process generates the PDF and returns base64; the
  renderer shows it in an `<iframe>`.
- **Print**: Electron's `webContents.print` API on a hidden window loaded
  with the generated PDF. Printer detection via `getPrintersAsync()`,
  copies, Letter/A4, portrait/landscape, configurable margins, silent
  option, and errors surfaced to the user (never swallowed).
- **NIIMBOT RW403B 4×6 label**: prepared only as a `labelFormat` option in
  print settings, explicitly labelled **UNTESTED**. No compatibility is
  claimed — it needs a driver test on a Windows PC with the printer
  attached.

## Backup / restore

Export writes a JSON dump of every table (`Store.dumpAll()`) to a
user-chosen `.json` file. Restore reads a backup, validates it is a
Logistics Studio backup with all tables present, and replaces all data in a
single transaction. The renderer asks for confirmation before restore.

## First-run setup wizard

Shown until `settings.setupComplete` is true. Steps: company, BOL
numbering, units & formats, printer, templates & backups, theme.

## Project layout

```
src/
  shared/        # pure TS: types, numbering, validation, email parser, templates, PDF
  main/          # main.ts, preload.ts, db.ts, ipc.ts, backup.ts
  renderer/      # React app: App.tsx, api.ts, pages/, styles.css
tests/           # Vitest unit tests
scripts/         # generate-test-pdfs.mjs (real test PDFs into docs/)
.github/workflows/build-windows.yml   # windows-latest -> .exe
```

## Build & distribution

- `npm run dev` — Vite renderer dev server (port 5173).
- `npm run build` — `tsc` (main) + `vite build` (renderer).
- `npm test` — Vitest.
- `npm run dist` — build + electron-builder Windows NSIS + portable `.exe`.
- `.github/workflows/build-windows.yml` — runs on `windows-latest`: install,
  test, build, `electron-builder --win`, uploads `release/` as an artifact.
  **No `.exe` is built in this Linux environment**; the Windows installer is
  produced only by GitHub Actions (or a Windows PC running `npm run dist`).

## What is intentionally not done here

- No cloud sync, no accounts, no paid services.
- No real NIIMBOT driver test (label option is marked untested).
- No Windows `.exe` artifact in this repo state (see Distribution above).
