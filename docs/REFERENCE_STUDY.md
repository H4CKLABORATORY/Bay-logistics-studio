# Reference Study — Bay Logistics Studio (Nov 7, 2026)

Study notes for the master prompt's reference library. Nothing here was
copied blindly: patterns were studied, then re-implemented from scratch for
this product. No proprietary code was copied. Licenses were checked via the
GitHub API on 2026-11-07.

## Reference products (UX / functionality, studied from their public docs)

| Product | What was studied | Pattern adopted | Deliberately NOT copied |
|---|---|---|---|
| Microsoft Dynamics 365 (microsoft.com/en-us/dynamics-365) | Enterprise dashboard, navigation, operations, inventory, stats, forms/tables | KPI stat cards on the Dashboard; sidebar navigation; tables with search/filter/sort | Dynamics' cloud architecture, licensing, branding, and any proprietary UI assets |
| Odoo (odoo.com, github.com/odoo/odoo) | Customers, inventory, products, warehouse moves, documents, relations between modules | Module relations: BOL ↔ customer/project, inventory items ↔ BOL via RR #, movements linked to BOLs; catalogs as separate modules | No Odoo code (see license note below); no Odoo UI, branding, or data model copied verbatim |
| SAP Extended Warehouse Management (sap.com) | Warehouse admin, locations, pallets, logistics operations, movement control | Location coding (zone-aisle-shelf-position), pallets/boxes as containers, atomic entry/exit/move transactions | SAP's proprietary system, UI, and terminology beyond generic logistics concepts |
| Fishbowl Inventory (fishbowlinventory.com) | Inventory, stock control, warehouse operations | Stock per location, low-stock awareness on the dashboard, movement history | Fishbowl's product, UI, and branding |
| Oracle NetSuite (netsuite.com) | Reports, dashboard, business indicators, administration | Reports module: BOLs by period/customer, movements summary, inventory overview, CSV/PDF export | NetSuite's cloud platform, reports engine, and branding |

## Reference repositories (architecture, studied from source)

| Repository | License (GitHub API, 2026-11-07) | Stars | Status | What was studied | What was adopted / not adopted |
|---|---|---|---|---|---|
| electron-vite/electron-vite-react | MIT | 2,434 | Active (updated 2026-11-06) | Electron + React + TS + Vite structure, main/preload/renderer split, tests, desktop dev flow | Adopted the same process split (main.ts / preload.ts / renderer) and the Vite+TS build; the project does NOT use the electron-vite template itself (scaffold was written for this app, with its own IPC allow-list and security hardening) |
| electron/electron-quick-start | — (repo moved) | — | See note | Electron main process, preload, renderer structure | NOTE: `electron/electron-quick-start` now redirects (301) to `electron/minimal-repro` (CC0-1.0, 11,429 stars). The old quick-start template no longer exists under that name; only the general main/preload/renderer pattern was studied, no code taken |
| electron-userland/electron-builder | MIT | 14,704 | Active (updated 2026-11-06) | Windows installers (NSIS), packaging, distribution, version config | Adopted directly: `electron-builder.yml` (NSIS + portable), GitHub Actions `windows-latest` build, artifact upload. This is the project's distribution tool |
| mrdoob/three.js | MIT | 117,790 | Active (updated 2026-11-07) | 3D scenes, cameras, objects, interaction, warehouse visualization | Adopted as a runtime dependency (`three@0.187`): interactive warehouse map with orbit/zoom/click-select, positions stored in SQLite. No Three.js example code copied; the map geometry is original (`src/shared/warehouse3d.ts`) |
| odoo/odoo | **LGPL-3.0** (LICENSE file: "Odoo is published under the GNU LESSER GENERAL PUBLIC LICENSE, Version 3") | 55,618 | Active (updated 2026-11-07) | Enterprise systems, inventory, customers, operations management | **Study only — no code copied.** LGPL-3.0 permits linking but this project does not embed or derive from Odoo code; only the module-relation concepts (customers ↔ projects ↔ documents ↔ stock) informed the data model |

## Dependencies actually in the project (verified in package.json)

| Dependency | License | Use | Verified in code |
|---|---|---|---|
| better-sqlite3 ^11.10.0 | MIT (ISC in some files) | Local file-backed SQLite, UNIQUE constraints for BOL numbering | `src/main/db.ts` |
| pdf-lib ^1.17.1 | MIT | Dynamic PDF generation (official BOL layout) | `src/shared/pdf.ts` |
| react / react-dom ^18.3.1 | MIT | Renderer UI | `src/renderer/` |
| three ^0.187.0 | MIT | Interactive 3D warehouse | `src/renderer/pages/Warehouse3D.tsx`, `src/shared/warehouse3d.ts` |
| electron ^33.2.0 | MIT | Desktop shell, printing, dialogs | `src/main/main.ts`, `src/main/ipc.ts` |
| electron-builder ^25.1.8 | MIT | Windows installer packaging | `electron-builder.yml`, `.github/workflows/build-windows.yml` |
| vite ^5.4.11, vitest ^2.1.8, typescript ^5.6.3 | MIT | Build + tests | `vite.config.ts`, `vitest.config.ts`, `tsconfig*.json` |

## Rules applied (master prompt §9)

1. Original repo reviewed before use — done for every dependency above.
2. License checked — table above; Odoo LGPL-3.0 noted, no code taken.
3. Maintenance checked — all active (updated Nov 2026) except the moved quick-start repo.
4. Compatibility checked — Electron 33 / Node 22 ABI handled (see CI fix commit 893d08c: rebuild better-sqlite3 for Node 22 before tests, for Electron before packaging).
5. Security evaluated — parameterized SQL everywhere, sanitized IPC errors (Phase 6).
6. Dependencies evaluated — no new dependency added for Phase 8 (dashboard/reports use existing React + pdf-lib + SQLite; charts are plain CSS bars).
7. No unnecessary dependencies — no chart library, no extra ORM, no UI framework.
8. No proprietary code copied — Dynamics 365, SAP EWM, Fishbowl, NetSuite studied from public docs only.
9. Sources recorded — this file.
10. Tests run after each integration — full Vitest suite must stay green (47/47 at v0.2.0; Phase 8 adds tests for reports/restore).

## What this study changed in the product

- Dashboard (Phase 8): KPI cards + alerts + activity + weekly BOL chart follow the Dynamics 365 / NetSuite dashboard pattern (stats first, recent documents below, alerts visible), implemented with real data from the local SQLite database — no sample/demo data.
- Reports (Phase 8): NetSuite-style summary reports (BOLs by period/customer, movements summary, inventory overview) with real CSV and PDF export via the existing pdf-lib pipeline.
- Data model: Odoo-style module relations already present (BOL ↔ customer/project, movement ↔ BOL via RR #) were kept; no Odoo code was introduced.
