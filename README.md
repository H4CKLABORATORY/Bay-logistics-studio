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
delivered the scaffolded app and the complete BOL workflow; see
`ARCHITECTURE.md` for details.

## Distribution

The Windows `.exe` is built by GitHub Actions
(`.github/workflows/build-windows.yml`, `windows-latest`): install, test,
build, `electron-builder --win`, artifact upload of `release/`. No `.exe`
is built or claimed in this Linux environment.

## License

Private project — all rights reserved unless a LICENSE file is added.
