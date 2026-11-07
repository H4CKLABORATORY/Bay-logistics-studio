# Logistics Studio

Desktop Bill of Lading (BOL) manager for warehouse and delivery operations.
Electron + TypeScript + React + SQLite + pdf-lib. Brand is configurable in
Settings — no vendor name or logo is bundled.

## Quick start

```bash
npm install
npm run dev        # renderer dev server (http://localhost:5173)
npm run dev:electron   # build main + launch the Electron app
npm test           # Vitest unit tests
npm run build      # production build (main + renderer)
npm run dist       # build + Windows installer (.exe) — needs Windows or CI
```

On first launch the setup wizard asks for company, BOL numbering, units,
formats, printer, templates, backups, and theme.

## Features

- **BOLs**: Warehouse (default) and Delivery templates with the exact field
  set (BOL NUMBER, DATE, JOB #, SHIP FROM, DELIVERY ADDRESS, REQUEST BY,
  TRUCK/TRAILER, THIRD PARTY FREIGHT CHARGES BILL TO, REQUESTED DELIVERY,
  DELIVERY NOTES; table QUANTITY | MODEL/DESCRIPTION | RR # | WEIGHT).
  Warehouse items have FOUND/PICKED/LOADED checkboxes and internal
  signatures (FOUND BY / CHECKED BY / LOADED BY). Delivery has Receiver
  Printed Name, Date, Driver Signature.
- **Create**: manual entry, paste-from-email parser, CSV/JSON import.
- **Numbering**: configurable consecutive numbering (prefix, next number,
  global or per-template), duplicates impossible (allocation check + DB
  UNIQUE constraint).
- **Edit / duplicate / autosave** (debounced) / **history** (audit log).
- **Search** by BOL / RR / customer / project, with filter and sort.
- **PDF export** (Letter default, A4 option, portrait/landscape, margins),
  **in-app preview**, **print** (printer detection, copies, silent option,
  error handling). NIIMBOT RW403B 4×6 label is an option marked UNTESTED.
- **Catalogs**: companies, customers, projects, addresses, requesters,
  carriers, items, materials — full CRUD.
- **Backup / restore**: JSON export of the whole database, restore with
  confirmation.
- **7 base templates**: Warehouse, Delivery, Standard, Return, Transfer,
  Pickup, Custom (configurable, stored in the DB).
- **Official BOL layout**: PDF export replicates the official Delivery
  template (`docs/official-bol-template.pdf`) — maroon logo block, header
  grid, 20-row items table, receiver/driver signatures, and the inspection
  disclaimer footer. The Warehouse template uses the same layout with
  FOUND/PICKED/LOADED checkboxes and internal signatures. The company
  header and SHIP FROM block come from the configurable company settings
  (default: Bay Crane Mid-Atlantic LLC, 51 Ritchie Road, Capitol Heights,
  MD 20743, (202) 529-6100, baycrane-ma.com) — change them in Settings and
  the PDFs change too.
- **Inventory (Phase 4)**: warehouses, coded locations (`A-01-02-03`),
  items by unique SKU, pallets, boxes, stock per location, atomic
  entry/exit/move transactions with insufficient-stock rejection, audit
  history, and search by SKU / client / project / RR # (an RR search finds
  the BOL and its BOL-linked movements).
- **3D warehouse (Phase 5)**: interactive Three.js map built from live
  database rows — drag to orbit, scroll to zoom, click a shelf slot to see
  its stock and move it to another location. Guarded: shows a clear error
  state instead of crashing when WebGL is unavailable.
- **Security (Phase 6)**: IPC errors are sanitised (no stack traces or SQL
  leak to the renderer); all SQL parameterized; input validation on every
  IPC handler.
- **Dashboard (Phase 8)**: KPI cards (total / this-week / today BOLs, stock
  units, SKUs in stock, locations occupied), low-stock and at/over-capacity
  alerts, an 8-week BOL bar chart (plain CSS, no chart library) and recent
  activity — all aggregated in SQL via one `dashboard:stats` call.
- **Reports (Phase 8)**: BOLs by period (day/week) and by customer,
  movements summary per SKU, and inventory overview over a date range
  (default last 30 days), each exportable as CSV and as PDF (pdf-lib table
  layout). All numbers come from the real database.
- **App icon (Phase 8)**: original navy rounded-square icon with a white
  box glyph (`build/icon.png` 512×512, `build/icon.ico` multi-size),
  wired into the Windows installer and Linux AppImage. No brand logo copied.
- **Backup restore hardening (Phase 8)**: restore validates every column
  against the live schema (PRAGMA whitelist) and rejects backups with
  unknown columns instead of interpolating them into INSERT.

## Phase 1 report (Nov 6, 2026)

Real repo state at the start of this work:

- Default branch: `bootstrap/review-base` (there is no `main` branch).
- Work branch: `feature/logistics-desktop-v1`.
- Commits before this work: **1** (`a9a0617 chore: initialize review base
  without changing main`).
- Files before this work: only `.gitkeep`.
- Pull requests: **0**. GitHub Actions workflows: **0**.

Phase 1 delivered `ARCHITECTURE.md` (stack, security, data model, numbering,
PDF/print, backup, distribution) and this report section. Phases 2–3
delivered the scaffolded app and the complete BOL workflow. Phases 4–7
added inventory, the 3D warehouse map, the security audit, and Windows
distribution (version 0.2.0). Phase 8 added the dashboard upgrade, the
reports module (CSV + PDF export), the original app icon, print polish and
the backup-restore column whitelist (version 0.3.0); see `ARCHITECTURE.md`
for details.

## Distribution

The Windows `.exe` is built by GitHub Actions
(`.github/workflows/build-windows.yml`, `windows-latest`): install, test,
build, `electron-builder --win`, artifact upload of `release/`. No `.exe`
is built or claimed in this Linux environment. Current version: **0.3.0**.

Still untested (needs a Windows PC / GitHub credentials): the first
GitHub Actions run that actually produces the `.exe`, the NSIS installer
smoke test on Windows, and printer tests including NIIMBOT.

## License

Private project — all rights reserved unless a LICENSE file is added.
