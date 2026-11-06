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
| Database | SQLite via `better-sqlite3` 11 | File-backed, real UNIQUE constraints (BOL numbering), synchronous API fits the main process. Prebuilt native binaries exist for Windows/macOS/Linux. **Native-module note:** the binding is compiled against a specific Node ABI, and Electron ships its own Node — so `npm install` alone leaves a binding built for the system Node. The `postinstall` script (`electron-builder install-app-deps`) rebuilds it for Electron's ABI; this was verified in the Linux dev box, where the app failed to start until the rebuild (`@electron/rebuild -f -w better-sqlite3`). If a platform lacks both a prebuild and a compiler, `sql.js` was considered and rejected (in-memory by default, no real constraints, slower for large BOL lists) |
| PDF | `pdf-lib` 1 | Pure-JS PDF generation, no native deps, testable in Node; Letter default, A4 option, portrait/landscape, configurable margins |
| Installer | electron-builder 25 | NSIS + portable `.exe` on Windows; AppImage on Linux |
| 3D map | Three.js | Interactive warehouse map from live DB rows (Phase 5) |
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
  `printers:list`, `warehouse:*`, `inventory:*`). There is no generic
  "run anything" channel.
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
| `warehouses` / `inv_locations` / `inv_items` / `inv_pallets` / `inv_boxes` | Inventory (Phase 4): warehouses with dimensions, coded locations with x/y/z, stock items by SKU, pallets, boxes |
| `inv_stock` | Stock quantity per item + location (+ pallet/box), `quantity >= 0` |
| `inv_movements` | Entry/exit/move records, linked to a BOL (`bol_id`, nullable) and an RR number |
| `inv_history` | Inventory audit log (movements, location creation) |
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

## Official BOL template (Delivery + Warehouse)

- The PDF layout replicates the official blank Delivery template
  (`docs/official-bol-template.pdf` — "Bay Crane Mid-Atlantic | Bill of
  Lading | Blank Delivery Template", Letter 612×792, 1 page, ReportLab).
  Geometry and colours were measured from that file's content stream:
  centered `BILL OF LADING` title; maroon logo block (rect 174,699,264×54,
  fill #86313A) with the company name in white bold and the region
  letterspaced below it; grey 3-column header grid (BOL NUMBER | DATE |
  JOB #); SHIP FROM | DELIVERY ADDRESS; REQUEST BY | TRUCK / TRAILER;
  full-width THIRD PARTY FREIGHT CHARGES BILL TO; pink row with maroon
  headers REQUESTED DELIVERY DATE & TIME | DELIVERY NOTES; items table
  (QUANTITY | MODEL / DESCRIPTION | RR # | WEIGHT) with 20 rows; RECEIVER
  PRINTED NAME | DATE lines and a maroon DRIVER SIGNATURE line; maroon
  footer disclaimer "ALL EQUIPMENT MUST BE INSPECTED AND ANY CONCERNS
  MUST BE REPORTED UPON DELIVERY."
- The Warehouse template keeps the same header/table layout with
  FOUND/PICKED/LOADED checkbox columns and internal FOUND BY / CHECKED BY
  / LOADED BY signatures instead of the receiver/driver block.
- **Brand rule:** nothing about the company is hard-coded in the PDF code.
  The logo block and the SHIP FROM block are drawn from the configurable
  company settings (name, address, phone, website) passed via
  `PdfOptions`; a blank SHIP FROM on a BOL falls back to the company
  block. The Bay Crane values are only the *default* company settings
  (`DEFAULT_SETTINGS.company` in `src/shared/types.ts`, editable in
  Settings and the Setup Wizard, which now has a Website field); blank
  company fields in an existing database fall back to those defaults in
  `Store.getSettings()`. Verified by Vitest: a different company changes
  both blocks and no Bay Crane text remains.
- Tests (`tests/pdf.test.ts`) inflate the generated PDF's content streams
  (pdf-lib hex-encodes drawn text) and assert the disclaimer, signature
  labels, Letter size, and the settings-driven header. `scripts/generate-test-pdfs.mjs`
  regenerates `docs/warehouse-bol-test.pdf` and `docs/delivery-bol-test.pdf`
  (both 1 page, Letter) with the new layout.

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
  shared/        # pure TS: types, numbering, validation, email parser, templates, PDF, inventory, warehouse3d, errors
  main/          # main.ts, preload.ts, db.ts, ipc.ts, backup.ts
  renderer/      # React app: App.tsx, api.ts, pages/ (incl. Inventory, Warehouse3D lazy), styles.css
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

## Inventory (Phase 4)

- Tables: `warehouses` (multi-warehouse ready; a `Main Warehouse` 30×20×6 m
  is seeded), `inv_locations` (code `ZONE-AISLE-SHELF-POSITION`, e.g.
  `A-01-02-03`, unique; x/y/z in metres; 12 starter locations seeded),
  `inv_items` (unique SKU, name, customer, project — separate from the
  `items`/`materials` catalog tables), `inv_pallets`, `inv_boxes`,
  `inv_stock` (one row per item+location+pallet+box, `quantity >= 0`,
  `UNIQUE(item_id, location_id, pallet_id, box_id)`), `inv_movements`
  (entry/exit/move, quantity, from/to location, nullable `bol_id`,
  RR number, user, note), `inv_history` (audit log).
- Moves are one better-sqlite3 transaction in `Store.recordMovement`:
  source decrement + destination increment + movement row + audit row are
  atomic; insufficient stock throws before anything is written, so a failed
  move leaves stock unchanged. All queries parameterized; foreign keys on.
- Search (`Store.searchInventory`): SKU/name/customer/project on
  `inv_items`, plus RR search — an RR finds BOL line items with that RR,
  their BOLs, and every movement linked to those BOLs (or carrying the RR).
- IPC: `inventory:*` (locations, location-create, items, item-create,
  stock, movement-create, movements, search, history, pallets, boxes) and
  `warehouse:*`; all validated in `src/shared/inventory.ts` /
  `src/shared/validation.ts` before the Store call. UI: `Inventory.tsx`.
- Schema version is now `2` (`meta.schema_version`); backups are version 2
  and include the inventory tables. Restore accepts v1 backups (inventory
  tables optional) and deletes/inserts child-first/parent-first so FKs hold.

## 3D warehouse (Phase 5)

- `src/shared/warehouse3d.ts` is pure coordinate math (no Three.js import):
  `gridToWorld`/`worldToGrid` (1.2 m cells), `validatePosition`,
  `isOccupied` (same shelf level, 0.6 m radius), `buildSceneModel`
  (plain data from DB rows). Covered by Vitest headless, including a smoke
  test that builds a real `THREE.Scene` from the model without a renderer.
- `src/renderer/pages/Warehouse3D.tsx` (lazy-loaded via `React.lazy`, so
  Three.js never enters the main bundle) builds a real interactive scene:
  floor sized from the warehouse dimensions in SQLite, shelf slots as
  coloured boxes (amber = occupied, teal = free), pallets (purple) and
  boxes (blue) at stored x/y/z, drag-to-orbit + wheel zoom, click a slot
  to select it and see its stock, move stock to another location from the
  3D view (calls the Phase 4 move IPC; target must exist, differ from the
  source, be inside the warehouse and not already occupied by other stock).
- Guarded: if WebGL is unavailable the page shows an error state; the app
  still starts and the Inventory page keeps working. Three.js 0.17x is a
  runtime dependency (`three`, `@types/three`).

## Quality & security (Phase 6)

- Audit results: `contextIsolation: true` + `nodeIntegration: false`
  confirmed in `main.ts`; preload exposes only the allow-listed `window.api`
  (no Node, no generic channel); every SQL statement is a prepared
  statement with bound parameters — catalog table names come from the
  hardcoded `CATALOG_TABLES` whitelist, never from user input (grep for
  template-literal interpolation in `db.ts` found only whitelisted table
  names and integer placeholders built from DB-returned ids).
- Centralised error handling: `src/shared/errors.ts` `sanitizeIpcError`
  is used by every IPC handler — validation messages pass through, but
  stack traces, `SQLITE_*` / driver internals, file paths and raw
  `UNIQUE constraint` text are replaced with a generic or friendly message
  (duplicate SKU/location/BOL get a specific safe wording). Renderer only
  ever sees `{ ok: false, error }`.
- Fixes made in Phase 6: all IPC `fail(...)` calls now sanitise; added
  shape validation to `settings:set` and `templates:update`; removed a
  dead no-op `store.listHistory(bol.id)` call in `bol:print`; fixed the
  win-level `artifactName` collision (see Distribution); `restoreAll`
  now orders deletes/inserts so FK constraints hold and accepts v1 backups.
- Tests: 21 original + inventory (location codes, move transactions,
  insufficient-stock atomicity, RR search, unique violations), 3D
  coordinate math + headless scene build, security (error sanitising) and
  backup round-trip/compat. Run with `npm test`.

## Build & distribution (Phase 7)

- Version is **0.2.0** (`package.json`; README matches). `electron-builder.yml`:
  NSIS installer + portable, desktop/Start Menu shortcuts, uninstaller,
  `deleteAppDataOnUninstall: false` so uninstalling never deletes the
  database in `%APPDATA%`.
- Data location re-verified: `main.ts` opens the DB at
  `path.join(app.getPath('userData'), 'logistics-studio.db')` — outside the
  install directory, so updates/reinstalls keep the data.
- `.github/workflows/build-windows.yml` validated (YAML parses; every step
  command exists in `package.json`: `npm ci`, `npm test`, `npm run build`,
  `npm run dist`). The Windows `.exe` is produced only by GitHub Actions
  on `windows-latest` after a push — it has never been run yet, so no
  `.exe` exists and the NSIS installer has not been smoke-tested on Windows.

## What is intentionally not done here

- No cloud sync, no accounts, no paid services.
- No real NIIMBOT driver test (label option is marked untested).
- No Windows `.exe` artifact in this repo state (see Distribution above).
- No printer test on a Windows PC (NIIMBOT or otherwise); no NSIS
  installer smoke test on Windows; no Linux AppImage run test in dexter
  (disk-constrained — see Phase 7 report).
