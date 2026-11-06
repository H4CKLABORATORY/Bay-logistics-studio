// SQLite layer (better-sqlite3, synchronous, parameterized queries only).
// Database lives in the OS user-data dir (app.getPath('userData')), never in
// the install folder. Choice note: better-sqlite3 was chosen over sql.js
// because it ships prebuilt native binaries for the target platforms and
// gives real file-backed persistence + UNIQUE constraints for BOL numbering.
// If a platform lacks a prebuild, `npm rebuild better-sqlite3` builds it.
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type { AppSettings, BolDocument, BolHistoryEntry, CatalogKind, CatalogRecord, InvBox, InvHistoryEntry, InvItem, InvLocation, InvMovement, InvMovementType, InvPallet, InvStockRow, InventorySearchResult, Warehouse } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import { BASE_TEMPLATES } from '../shared/templates';
import { DEFAULT_WAREHOUSE_DIMS } from '../shared/warehouse3d';

export const INVENTORY_TABLES = ['warehouses', 'inv_locations', 'inv_items', 'inv_pallets', 'inv_boxes', 'inv_stock', 'inv_movements', 'inv_history'];

export const CATALOG_TABLES: Record<CatalogKind, { columns: string[]; create: string }> = {
  companies: {
    columns: ['name', 'address', 'phone', 'email'],
    create: `CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT DEFAULT '',
      phone TEXT DEFAULT '', email TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`,
  },
  customers: {
    columns: ['name', 'contact', 'phone', 'email', 'address'],
    create: `CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, contact TEXT DEFAULT '',
      phone TEXT DEFAULT '', email TEXT DEFAULT '', address TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')))`,
  },
  projects: {
    columns: ['name', 'customer_id', 'description'],
    create: `CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, customer_id INTEGER,
      description TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id))`,
  },
  addresses: {
    columns: ['label', 'address', 'city', 'state', 'zip', 'notes'],
    create: `CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, address TEXT DEFAULT '',
      city TEXT DEFAULT '', state TEXT DEFAULT '', zip TEXT DEFAULT '', notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')))`,
  },
  requesters: {
    columns: ['name', 'company', 'phone', 'email'],
    create: `CREATE TABLE IF NOT EXISTS requesters (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, company TEXT DEFAULT '',
      phone TEXT DEFAULT '', email TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`,
  },
  carriers: {
    columns: ['name', 'contact', 'phone', 'email'],
    create: `CREATE TABLE IF NOT EXISTS carriers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, contact TEXT DEFAULT '',
      phone TEXT DEFAULT '', email TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`,
  },
  items: {
    columns: ['model', 'description', 'default_weight'],
    create: `CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, model TEXT NOT NULL, description TEXT DEFAULT '',
      default_weight TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`,
  },
  materials: {
    columns: ['name', 'sku', 'unit', 'weight'],
    create: `CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sku TEXT DEFAULT '',
      unit TEXT DEFAULT '', weight TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`,
  },
};

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS templates (
    key TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
    fields_json TEXT NOT NULL, has_warehouse_checks INTEGER NOT NULL DEFAULT 0,
    has_internal_signatures INTEGER NOT NULL DEFAULT 0, has_delivery_receipt INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS bol_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bol_number TEXT NOT NULL UNIQUE, template TEXT NOT NULL DEFAULT 'warehouse',
    date TEXT NOT NULL, job_number TEXT DEFAULT '', ship_from TEXT NOT NULL,
    delivery_address TEXT NOT NULL, request_by TEXT NOT NULL, truck_trailer TEXT DEFAULT '',
    bill_to TEXT DEFAULT '', requested_delivery TEXT DEFAULT '', delivery_notes TEXT DEFAULT '',
    found_by TEXT DEFAULT '', checked_by TEXT DEFAULT '', loaded_by TEXT DEFAULT '',
    receiver_name TEXT DEFAULT '', receiver_date TEXT DEFAULT '', driver_signature TEXT DEFAULT '',
    customer_id INTEGER, project_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS bol_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, bol_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL, model_description TEXT NOT NULL DEFAULT '',
    rr_number TEXT DEFAULT '', weight TEXT DEFAULT '',
    found INTEGER NOT NULL DEFAULT 0, picked INTEGER NOT NULL DEFAULT 0, loaded INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (bol_id) REFERENCES bol_documents(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS bol_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, bol_id INTEGER NOT NULL, bol_number TEXT NOT NULL,
    action TEXT NOT NULL, detail TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`,
  // ---- Inventory (Phase 4) ----
  `CREATE TABLE IF NOT EXISTS warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
    width_m REAL NOT NULL DEFAULT 30, depth_m REAL NOT NULL DEFAULT 20, height_m REAL NOT NULL DEFAULT 6,
    created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS inv_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, warehouse_id INTEGER NOT NULL,
    code TEXT NOT NULL UNIQUE, zone TEXT NOT NULL, aisle INTEGER NOT NULL, shelf INTEGER NOT NULL,
    position INTEGER NOT NULL, x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0, z REAL NOT NULL DEFAULT 0,
    capacity INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id))`,
  `CREATE TABLE IF NOT EXISTS inv_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    description TEXT DEFAULT '', unit TEXT DEFAULT '', weight TEXT DEFAULT '',
    customer TEXT DEFAULT '', project TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS inv_pallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE,
    location_id INTEGER, x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0, z REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (location_id) REFERENCES inv_locations(id))`,
  `CREATE TABLE IF NOT EXISTS inv_boxes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE,
    pallet_id INTEGER, location_id INTEGER,
    x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0, z REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (pallet_id) REFERENCES inv_pallets(id), FOREIGN KEY (location_id) REFERENCES inv_locations(id))`,
  `CREATE TABLE IF NOT EXISTS inv_stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, location_id INTEGER NOT NULL,
    pallet_id INTEGER NOT NULL DEFAULT 0, box_id INTEGER NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE (item_id, location_id, pallet_id, box_id),
    FOREIGN KEY (item_id) REFERENCES inv_items(id), FOREIGN KEY (location_id) REFERENCES inv_locations(id))`,
  `CREATE TABLE IF NOT EXISTS inv_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL CHECK (type IN ('entry','exit','move')),
    item_id INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK (quantity > 0),
    from_location_id INTEGER, to_location_id INTEGER, bol_id INTEGER,
    rr_number TEXT DEFAULT '', user TEXT DEFAULT '', note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (item_id) REFERENCES inv_items(id),
    FOREIGN KEY (from_location_id) REFERENCES inv_locations(id),
    FOREIGN KEY (to_location_id) REFERENCES inv_locations(id),
    FOREIGN KEY (bol_id) REFERENCES bol_documents(id))`,
  `CREATE TABLE IF NOT EXISTS inv_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL,
    action TEXT NOT NULL, detail TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE INDEX IF NOT EXISTS idx_inv_stock_item ON inv_stock(item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_inv_stock_location ON inv_stock(location_id)`,
  `CREATE INDEX IF NOT EXISTS idx_inv_movements_bol ON inv_movements(bol_id)`,
  `CREATE INDEX IF NOT EXISTS idx_inv_movements_rr ON inv_movements(rr_number)`,
  `CREATE INDEX IF NOT EXISTS idx_bol_items_rr ON bol_items(rr_number)`,
  ...Object.values(CATALOG_TABLES).map((t) => t.create),
];

export class Store {
  private db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.migrate();
    this.seed();
  }

  private migrate() {
    const run = this.db.transaction(() => {
      for (const sql of MIGRATIONS) this.db.exec(sql);
      this.db.prepare(`INSERT INTO meta (key, value) VALUES ('schema_version', '2') ON CONFLICT(key) DO UPDATE SET value = '2'`).run();
    });
    run();
  }

  private seed() {
    const insertTemplate = this.db.prepare(
      `INSERT OR IGNORE INTO templates
       (key, name, description, fields_json, has_warehouse_checks, has_internal_signatures, has_delivery_receipt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const t of BASE_TEMPLATES) {
      insertTemplate.run(
        t.key, t.name, t.description, JSON.stringify(t.fields),
        t.hasWarehouseChecks ? 1 : 0, t.hasInternalSignatures ? 1 : 0, t.hasDeliveryReceipt ? 1 : 0,
      );
    }
    this.db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('app', ?)`).run(JSON.stringify(DEFAULT_SETTINGS));
    // Default warehouse (Phase 4/5) + a small starter location grid so the
    // 3D map has real rows on a fresh database. INSERT OR IGNORE: safe on upgrade.
    const wh = this.db.prepare(`INSERT OR IGNORE INTO warehouses (name, width_m, depth_m, height_m) VALUES (?, ?, ?, ?)`)
      .run('Main Warehouse', DEFAULT_WAREHOUSE_DIMS.widthM, DEFAULT_WAREHOUSE_DIMS.depthM, DEFAULT_WAREHOUSE_DIMS.heightM);
    const whRow = this.db.prepare(`SELECT id FROM warehouses WHERE name = 'Main Warehouse'`).get() as { id: number } | undefined;
    const whId = whRow?.id ?? Number(wh.lastInsertRowid);
    if (whId) {
      const insLoc = this.db.prepare(
        `INSERT OR IGNORE INTO inv_locations (warehouse_id, code, zone, aisle, shelf, position, x, y, z, capacity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 100)`,
      );
      for (const aisle of [1, 2]) {
        for (const shelf of [1, 2]) {
          for (const pos of [1, 2, 3]) {
            insLoc.run(whId, `A-${String(aisle).padStart(2, '0')}-${String(shelf).padStart(2, '0')}-${String(pos).padStart(2, '0')}`,
              'A', aisle, shelf, pos, 2 + aisle * 4, 0.6 + shelf * 1.2, 2 + pos * 2);
          }
        }
      }
    }
  }

  // ---- Settings ----
  getSettings(): AppSettings {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = 'app'`).get() as { value: string } | undefined;
    if (!row) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    return { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...JSON.parse(row.value) };
  }
  saveSettings(s: AppSettings) {
    this.db.prepare(`INSERT INTO settings (key, value) VALUES ('app', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(s));
  }

  // ---- BOL ----
  listBols(search = ''): BolDocument[] {
    const q = `%${search}%`;
    const rows = (search
      ? this.db.prepare(
          `SELECT * FROM bol_documents WHERE bol_number LIKE ? OR job_number LIKE ? OR ship_from LIKE ?
           OR delivery_address LIKE ? OR request_by LIKE ? ORDER BY updated_at DESC, id DESC`,
        ).all(q, q, q, q, q)
      : this.db.prepare(`SELECT * FROM bol_documents ORDER BY updated_at DESC, id DESC`).all()) as Record<string, unknown>[];
    return rows.map((r) => this.rowToBol(r));
  }

  getBol(id: number): BolDocument | null {
    const row = this.db.prepare(`SELECT * FROM bol_documents WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToBol(row) : null;
  }

  getBolByNumber(bolNumber: string): BolDocument | null {
    const row = this.db.prepare(`SELECT * FROM bol_documents WHERE bol_number = ?`).get(bolNumber) as Record<string, unknown> | undefined;
    return row ? this.rowToBol(row) : null;
  }

  private rowToBol(r: Record<string, unknown>): BolDocument {
    const items = this.db.prepare(`SELECT * FROM bol_items WHERE bol_id = ? ORDER BY position ASC, id ASC`).all(r.id) as Record<string, unknown>[];
    return {
      id: r.id as number,
      bolNumber: String(r.bol_number),
      template: r.template as BolDocument['template'],
      date: String(r.date),
      jobNumber: String(r.job_number ?? ''),
      shipFrom: String(r.ship_from),
      deliveryAddress: String(r.delivery_address),
      requestBy: String(r.request_by),
      truckTrailer: String(r.truck_trailer ?? ''),
      billTo: String(r.bill_to ?? ''),
      requestedDelivery: String(r.requested_delivery ?? ''),
      deliveryNotes: String(r.delivery_notes ?? ''),
      foundBy: String(r.found_by ?? ''),
      checkedBy: String(r.checked_by ?? ''),
      loadedBy: String(r.loaded_by ?? ''),
      receiverName: String(r.receiver_name ?? ''),
      receiverDate: String(r.receiver_date ?? ''),
      driverSignature: String(r.driver_signature ?? ''),
      customerId: (r.customer_id as number | null) ?? null,
      projectId: (r.project_id as number | null) ?? null,
      createdAt: String(r.created_at ?? ''),
      updatedAt: String(r.updated_at ?? ''),
      items: items.map((it) => ({
        id: it.id as number,
        quantity: it.quantity as number,
        modelDescription: String(it.model_description ?? ''),
        rrNumber: String(it.rr_number ?? ''),
        weight: String(it.weight ?? ''),
        found: Boolean(it.found),
        picked: Boolean(it.picked),
        loaded: Boolean(it.loaded),
      })),
    };
  }

  createBol(doc: BolDocument): BolDocument {
    const now = new Date().toISOString();
    const run = this.db.transaction(() => {
      const info = this.db.prepare(
        `INSERT INTO bol_documents (bol_number, template, date, job_number, ship_from, delivery_address,
         request_by, truck_trailer, bill_to, requested_delivery, delivery_notes,
         found_by, checked_by, loaded_by, receiver_name, receiver_date, driver_signature,
         customer_id, project_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        doc.bolNumber, doc.template, doc.date, doc.jobNumber, doc.shipFrom, doc.deliveryAddress,
        doc.requestBy, doc.truckTrailer, doc.billTo, doc.requestedDelivery, doc.deliveryNotes,
        doc.foundBy ?? '', doc.checkedBy ?? '', doc.loadedBy ?? '',
        doc.receiverName ?? '', doc.receiverDate ?? '', doc.driverSignature ?? '',
        doc.customerId ?? null, doc.projectId ?? null, now, now,
      );
      const bolId = Number(info.lastInsertRowid);
      this.insertItems(bolId, doc.items);
      this.logHistory(bolId, doc.bolNumber, 'created', `BOL ${doc.bolNumber} created (${doc.template}).`);
      return bolId;
    });
    const id = run();
    const created = this.getBol(id);
    if (!created) throw new Error('Failed to read back created BOL');
    return created;
  }

  updateBol(id: number, doc: BolDocument): BolDocument {
    const existing = this.getBol(id);
    if (!existing) throw new Error(`BOL id ${id} not found`);
    const now = new Date().toISOString();
    const run = this.db.transaction(() => {
      this.db.prepare(
        `UPDATE bol_documents SET bol_number = ?, template = ?, date = ?, job_number = ?, ship_from = ?,
         delivery_address = ?, request_by = ?, truck_trailer = ?, bill_to = ?, requested_delivery = ?,
         delivery_notes = ?, found_by = ?, checked_by = ?, loaded_by = ?, receiver_name = ?,
         receiver_date = ?, driver_signature = ?, customer_id = ?, project_id = ?, updated_at = ? WHERE id = ?`,
      ).run(
        doc.bolNumber, doc.template, doc.date, doc.jobNumber, doc.shipFrom, doc.deliveryAddress,
        doc.requestBy, doc.truckTrailer, doc.billTo, doc.requestedDelivery, doc.deliveryNotes,
        doc.foundBy ?? '', doc.checkedBy ?? '', doc.loadedBy ?? '',
        doc.receiverName ?? '', doc.receiverDate ?? '', doc.driverSignature ?? '',
        doc.customerId ?? null, doc.projectId ?? null, now, id,
      );
      this.db.prepare(`DELETE FROM bol_items WHERE bol_id = ?`).run(id);
      this.insertItems(id, doc.items);
      this.logHistory(id, doc.bolNumber, 'updated', `BOL ${doc.bolNumber} updated.`);
    });
    run();
    const updated = this.getBol(id);
    if (!updated) throw new Error('Failed to read back updated BOL');
    return updated;
  }

  deleteBol(id: number) {
    const existing = this.getBol(id);
    if (!existing) throw new Error(`BOL id ${id} not found`);
    this.db.prepare(`DELETE FROM bol_documents WHERE id = ?`).run(id);
    this.logHistory(id, existing.bolNumber, 'deleted', `BOL ${existing.bolNumber} deleted.`);
  }

  duplicateBol(id: number, newNumber: string): BolDocument {
    const src = this.getBol(id);
    if (!src) throw new Error(`BOL id ${id} not found`);
    const copy: BolDocument = { ...src, id: undefined, bolNumber: newNumber, items: src.items.map((i) => ({ ...i, id: undefined })) };
    const created = this.createBol(copy);
    this.logHistory(created.id!, newNumber, 'duplicated', `Duplicated from ${src.bolNumber}.`);
    return created;
  }

  private insertItems(bolId: number, items: BolDocument['items']) {
    const stmt = this.db.prepare(
      `INSERT INTO bol_items (bol_id, quantity, model_description, rr_number, weight, found, picked, loaded, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    items.forEach((it, idx) => {
      stmt.run(bolId, it.quantity, it.modelDescription, it.rrNumber, it.weight,
        it.found ? 1 : 0, it.picked ? 1 : 0, it.loaded ? 1 : 0, idx);
    });
  }

  private logHistory(bolId: number, bolNumber: string, action: string, detail: string) {
    this.db.prepare(`INSERT INTO bol_history (bol_id, bol_number, action, detail) VALUES (?, ?, ?, ?)`).run(bolId, bolNumber, action, detail);
  }

  listHistory(bolId?: number): BolHistoryEntry[] {
    const rows = (bolId
      ? this.db.prepare(`SELECT * FROM bol_history WHERE bol_id = ? ORDER BY created_at DESC, id DESC`).all(bolId)
      : this.db.prepare(`SELECT * FROM bol_history ORDER BY created_at DESC, id DESC LIMIT 200`).all()) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as number, bolId: r.bol_id as number, bolNumber: String(r.bol_number),
      action: String(r.action), detail: String(r.detail ?? ''), createdAt: String(r.created_at ?? ''),
    }));
  }

  usedBolNumbers(): Set<string> {
    const rows = this.db.prepare(`SELECT bol_number FROM bol_documents`).all() as { bol_number: string }[];
    return new Set(rows.map((r) => r.bol_number));
  }

  // ---- Catalogs (generic, table name whitelisted — never from raw user input) ----
  listCatalog(kind: CatalogKind, search = ''): CatalogRecord[] {
    const cols = CATALOG_TABLES[kind].columns;
    const nameCol = kind === 'items' ? 'model' : kind === 'addresses' ? 'label' : 'name';
    const q = `%${search}%`;
    const rows = (search
      ? this.db.prepare(`SELECT * FROM ${kind} WHERE ${nameCol} LIKE ? ORDER BY ${nameCol} ASC`).all(q)
      : this.db.prepare(`SELECT * FROM ${kind} ORDER BY ${nameCol} ASC`).all()) as Record<string, unknown>[];
    return rows.map((r) => ({ ...r }));
  }

  createCatalog(kind: CatalogKind, rec: CatalogRecord): CatalogRecord {
    const cols = CATALOG_TABLES[kind].columns;
    const placeholders = cols.map(() => '?').join(', ');
    const info = this.db.prepare(`INSERT INTO ${kind} (${cols.join(', ')}) VALUES (${placeholders})`)
      .run(...cols.map((c) => (rec[c] ?? '') as string | number));
    return { ...rec, id: Number(info.lastInsertRowid) };
  }

  updateCatalog(kind: CatalogKind, id: number, rec: CatalogRecord): void {
    const cols = CATALOG_TABLES[kind].columns;
    const setClause = cols.map((c) => `${c} = ?`).join(', ');
    this.db.prepare(`UPDATE ${kind} SET ${setClause} WHERE id = ?`)
      .run(...cols.map((c) => (rec[c] ?? '') as string | number), id);
  }

  deleteCatalog(kind: CatalogKind, id: number): void {
    this.db.prepare(`DELETE FROM ${kind} WHERE id = ?`).run(id);
  }

  listTemplates() {
    return this.db.prepare(`SELECT * FROM templates ORDER BY key ASC`).all() as Record<string, unknown>[];
  }

  updateTemplate(key: string, patch: { name?: string; description?: string; fieldsJson?: string; hasWarehouseChecks?: boolean; hasInternalSignatures?: boolean; hasDeliveryReceipt?: boolean }) {
    const cur = this.db.prepare(`SELECT * FROM templates WHERE key = ?`).get(key) as Record<string, unknown> | undefined;
    if (!cur) throw new Error(`Template ${key} not found`);
    this.db.prepare(
      `UPDATE templates SET name = ?, description = ?, fields_json = ?, has_warehouse_checks = ?, has_internal_signatures = ?, has_delivery_receipt = ? WHERE key = ?`,
    ).run(
      patch.name ?? cur.name, patch.description ?? cur.description,
      patch.fieldsJson ?? cur.fields_json,
      patch.hasWarehouseChecks !== undefined ? (patch.hasWarehouseChecks ? 1 : 0) : cur.has_warehouse_checks,
      patch.hasInternalSignatures !== undefined ? (patch.hasInternalSignatures ? 1 : 0) : cur.has_internal_signatures,
      patch.hasDeliveryReceipt !== undefined ? (patch.hasDeliveryReceipt ? 1 : 0) : cur.has_delivery_receipt,
      key,
    );
  }

  // ---- Inventory (Phase 4) ----
  // All queries parameterized; moves run in a single transaction so a
  // decrement, an increment, the movement row and the audit row are atomic.
  listWarehouses(): Warehouse[] {
    const rows = this.db.prepare(`SELECT * FROM warehouses ORDER BY id ASC`).all() as Record<string, unknown>[];
    return rows.map((r) => ({ id: r.id as number, name: String(r.name), widthM: r.width_m as number, depthM: r.depth_m as number, heightM: r.height_m as number, createdAt: String(r.created_at ?? '') }));
  }

  getWarehouse(id: number): Warehouse | null {
    const r = this.db.prepare(`SELECT * FROM warehouses WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return r ? { id: r.id as number, name: String(r.name), widthM: r.width_m as number, depthM: r.depth_m as number, heightM: r.height_m as number, createdAt: String(r.created_at ?? '') } : null;
  }

  createWarehouse(name: string, widthM: number, depthM: number, heightM: number): Warehouse {
    const info = this.db.prepare(`INSERT INTO warehouses (name, width_m, depth_m, height_m) VALUES (?, ?, ?, ?)`).run(name, widthM, depthM, heightM);
    const w = this.getWarehouse(Number(info.lastInsertRowid));
    if (!w) throw new Error('Failed to read back warehouse');
    return w;
  }

  updateWarehouse(id: number, widthM: number, depthM: number, heightM: number): Warehouse {
    const existing = this.getWarehouse(id);
    if (!existing) throw new Error(`Warehouse id ${id} not found`);
    this.db.prepare(`UPDATE warehouses SET width_m = ?, depth_m = ?, height_m = ? WHERE id = ?`).run(widthM, depthM, heightM, id);
    const w = this.getWarehouse(id);
    if (!w) throw new Error('Failed to read back warehouse');
    return w;
  }

  private rowToLocation(r: Record<string, unknown>): InvLocation {
    return { id: r.id as number, warehouseId: r.warehouse_id as number, code: String(r.code), zone: String(r.zone), aisle: r.aisle as number, shelf: r.shelf as number, position: r.position as number, x: r.x as number, y: r.y as number, z: r.z as number, capacity: r.capacity as number, createdAt: String(r.created_at ?? '') };
  }

  listLocations(warehouseId?: number): InvLocation[] {
    const rows = (warehouseId
      ? this.db.prepare(`SELECT * FROM inv_locations WHERE warehouse_id = ? ORDER BY code ASC`).all(warehouseId)
      : this.db.prepare(`SELECT * FROM inv_locations ORDER BY code ASC`).all()) as Record<string, unknown>[];
    return rows.map((r) => this.rowToLocation(r));
  }

  listLocationsWithStock(warehouseId?: number): Array<InvLocation & { stockQty: number }> {
    const locs = this.listLocations(warehouseId);
    return locs.map((l) => {
      const row = this.db.prepare(`SELECT COALESCE(SUM(quantity), 0) AS qty FROM inv_stock WHERE location_id = ?`).get(l.id) as { qty: number };
      return { ...l, stockQty: row.qty };
    });
  }

  getLocation(id: number): InvLocation | null {
    const r = this.db.prepare(`SELECT * FROM inv_locations WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return r ? this.rowToLocation(r) : null;
  }

  getLocationByCode(code: string): InvLocation | null {
    const r = this.db.prepare(`SELECT * FROM inv_locations WHERE code = ?`).get(code) as Record<string, unknown> | undefined;
    return r ? this.rowToLocation(r) : null;
  }

  createLocation(loc: Omit<InvLocation, 'id' | 'createdAt'>): InvLocation {
    const info = this.db.prepare(
      `INSERT INTO inv_locations (warehouse_id, code, zone, aisle, shelf, position, x, y, z, capacity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(loc.warehouseId, loc.code, loc.zone, loc.aisle, loc.shelf, loc.position, loc.x, loc.y, loc.z, loc.capacity ?? 0);
    const created = this.getLocation(Number(info.lastInsertRowid));
    if (!created) throw new Error('Failed to read back location');
    this.logInvHistory('location', created.id!, 'created', `Location ${created.code} created.`);
    return created;
  }

  private rowToInvItem(r: Record<string, unknown>): InvItem {
    return { id: r.id as number, sku: String(r.sku), name: String(r.name), description: String(r.description ?? ''), unit: String(r.unit ?? ''), weight: String(r.weight ?? ''), customer: String(r.customer ?? ''), project: String(r.project ?? ''), createdAt: String(r.created_at ?? '') };
  }

  listInvItems(search = ''): InvItem[] {
    const q = `%${search}%`;
    const rows = (search
      ? this.db.prepare(`SELECT * FROM inv_items WHERE sku LIKE ? OR name LIKE ? OR customer LIKE ? OR project LIKE ? ORDER BY name ASC`).all(q, q, q, q)
      : this.db.prepare(`SELECT * FROM inv_items ORDER BY name ASC`).all()) as Record<string, unknown>[];
    return rows.map((r) => this.rowToInvItem(r));
  }

  getInvItem(id: number): InvItem | null {
    const r = this.db.prepare(`SELECT * FROM inv_items WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return r ? this.rowToInvItem(r) : null;
  }

  createInvItem(it: Omit<InvItem, 'id' | 'createdAt'>): InvItem {
    const info = this.db.prepare(
      `INSERT INTO inv_items (sku, name, description, unit, weight, customer, project) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(it.sku, it.name, it.description ?? '', it.unit ?? '', it.weight ?? '', it.customer ?? '', it.project ?? '');
    const created = this.getInvItem(Number(info.lastInsertRowid));
    if (!created) throw new Error('Failed to read back inventory item');
    return created;
  }

  listPallets(): InvPallet[] {
    const rows = this.db.prepare(`SELECT * FROM inv_pallets ORDER BY code ASC`).all() as Record<string, unknown>[];
    return rows.map((r) => ({ id: r.id as number, code: String(r.code), locationId: (r.location_id as number | null) ?? null, x: r.x as number, y: r.y as number, z: r.z as number, createdAt: String(r.created_at ?? '') }));
  }

  createPallet(code: string, locationId: number | null, x: number, y: number, z: number): InvPallet {
    const info = this.db.prepare(`INSERT INTO inv_pallets (code, location_id, x, y, z) VALUES (?, ?, ?, ?, ?)`).run(code, locationId, x, y, z);
    const row = this.db.prepare(`SELECT * FROM inv_pallets WHERE id = ?`).get(Number(info.lastInsertRowid)) as Record<string, unknown>;
    return { id: row.id as number, code: String(row.code), locationId: (row.location_id as number | null) ?? null, x: row.x as number, y: row.y as number, z: row.z as number };
  }

  listBoxes(): InvBox[] {
    const rows = this.db.prepare(`SELECT * FROM inv_boxes ORDER BY code ASC`).all() as Record<string, unknown>[];
    return rows.map((r) => ({ id: r.id as number, code: String(r.code), palletId: (r.pallet_id as number | null) ?? null, locationId: (r.location_id as number | null) ?? null, x: r.x as number, y: r.y as number, z: r.z as number, createdAt: String(r.created_at ?? '') }));
  }

  createBox(code: string, palletId: number | null, locationId: number | null, x: number, y: number, z: number): InvBox {
    const info = this.db.prepare(`INSERT INTO inv_boxes (code, pallet_id, location_id, x, y, z) VALUES (?, ?, ?, ?, ?, ?)`).run(code, palletId, locationId, x, y, z);
    const row = this.db.prepare(`SELECT * FROM inv_boxes WHERE id = ?`).get(Number(info.lastInsertRowid)) as Record<string, unknown>;
    return { id: row.id as number, code: String(row.code), palletId: (row.pallet_id as number | null) ?? null, locationId: (row.location_id as number | null) ?? null, x: row.x as number, y: row.y as number, z: row.z as number };
  }

  getStockQty(itemId: number, locationId: number, palletId = 0, boxId = 0): number {
    const row = this.db.prepare(`SELECT quantity FROM inv_stock WHERE item_id = ? AND location_id = ? AND pallet_id = ? AND box_id = ?`).get(itemId, locationId, palletId, boxId) as { quantity: number } | undefined;
    return row?.quantity ?? 0;
  }

  listStock(locationId?: number): InvStockRow[] {
    const rows = (locationId
      ? this.db.prepare(
          `SELECT s.*, i.sku, i.name AS item_name, l.code AS location_code FROM inv_stock s
           JOIN inv_items i ON i.id = s.item_id JOIN inv_locations l ON l.id = s.location_id
           WHERE s.location_id = ? AND s.quantity > 0 ORDER BY l.code ASC, i.name ASC`,
        ).all(locationId)
      : this.db.prepare(
          `SELECT s.*, i.sku, i.name AS item_name, l.code AS location_code FROM inv_stock s
           JOIN inv_items i ON i.id = s.item_id JOIN inv_locations l ON l.id = s.location_id
           WHERE s.quantity > 0 ORDER BY l.code ASC, i.name ASC`,
        ).all()) as Record<string, unknown>[];
    return rows.map((r) => ({ id: r.id as number, itemId: r.item_id as number, sku: String(r.sku), itemName: String(r.item_name), locationId: r.location_id as number, locationCode: String(r.location_code), palletId: r.pallet_id as number, boxId: r.box_id as number, quantity: r.quantity as number }));
  }

  private adjustStock(itemId: number, locationId: number, palletId: number, boxId: number, delta: number) {
    if (delta === 0) return;
    const cur = this.getStockQty(itemId, locationId, palletId, boxId);
    const next = cur + delta;
    if (next < 0) throw new Error('Insufficient stock at the source location.');
    if (cur === 0 && next > 0) {
      this.db.prepare(`INSERT INTO inv_stock (item_id, location_id, pallet_id, box_id, quantity) VALUES (?, ?, ?, ?, ?)`).run(itemId, locationId, palletId, boxId, next);
    } else {
      this.db.prepare(`UPDATE inv_stock SET quantity = ? WHERE item_id = ? AND location_id = ? AND pallet_id = ? AND box_id = ?`).run(next, itemId, locationId, palletId, boxId);
    }
  }

  private logInvHistory(entityType: string, entityId: number, action: string, detail: string) {
    this.db.prepare(`INSERT INTO inv_history (entity_type, entity_id, action, detail) VALUES (?, ?, ?, ?)`).run(entityType, entityId, action, detail);
  }

  recordMovement(m: { type: InvMovementType; itemId: number; quantity: number; fromLocationId?: number | null; toLocationId?: number | null; bolId?: number | null; rrNumber?: string; user?: string; note?: string }): InvMovement {
    const item = this.getInvItem(m.itemId);
    if (!item) throw new Error(`Inventory item id ${m.itemId} not found`);
    if (m.bolId) {
      const bol = this.getBol(m.bolId);
      if (!bol) throw new Error(`BOL id ${m.bolId} not found`);
    }
    if (m.fromLocationId) {
      const from = this.getLocation(m.fromLocationId);
      if (!from) throw new Error(`Source location id ${m.fromLocationId} not found`);
    }
    if (m.toLocationId) {
      const to = this.getLocation(m.toLocationId);
      if (!to) throw new Error(`Destination location id ${m.toLocationId} not found`);
    }
    if (m.type !== 'entry' && m.fromLocationId) {
      const available = this.getStockQty(m.itemId, m.fromLocationId);
      if (available < m.quantity) {
        throw new Error(`Insufficient stock at the source location: have ${available}, need ${m.quantity}.`);
      }
    }
    const run = this.db.transaction(() => {
      if (m.type === 'entry' && m.toLocationId) this.adjustStock(m.itemId, m.toLocationId, 0, 0, m.quantity);
      if (m.type === 'exit' && m.fromLocationId) this.adjustStock(m.itemId, m.fromLocationId, 0, 0, -m.quantity);
      if (m.type === 'move' && m.fromLocationId && m.toLocationId) {
        this.adjustStock(m.itemId, m.fromLocationId, 0, 0, -m.quantity);
        this.adjustStock(m.itemId, m.toLocationId, 0, 0, m.quantity);
      }
      const info = this.db.prepare(
        `INSERT INTO inv_movements (type, item_id, quantity, from_location_id, to_location_id, bol_id, rr_number, user, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(m.type, m.itemId, m.quantity, m.fromLocationId ?? null, m.toLocationId ?? null, m.bolId ?? null, m.rrNumber ?? '', m.user ?? '', m.note ?? '');
      const id = Number(info.lastInsertRowid);
      const bol = m.bolId ? this.getBol(m.bolId) : null;
      this.logInvHistory('movement', id, m.type,
        `${m.type} ${m.quantity} x ${item.sku} (${item.name})` +
        (m.fromLocationId ? ` from location ${m.fromLocationId}` : '') +
        (m.toLocationId ? ` to location ${m.toLocationId}` : '') +
        (bol ? ` — BOL ${bol.bolNumber}` : '') +
        (m.rrNumber ? ` — RR ${m.rrNumber}` : ''));
      return id;
    });
    const id = run();
    const created = this.listMovements(1000).find((x) => x.id === id);
    if (!created) throw new Error('Failed to read back movement');
    return created;
  }

  listMovements(limit = 200): InvMovement[] {
    const rows = this.db.prepare(
      `SELECT mv.*, i.sku, i.name AS item_name, b.bol_number,
              fl.code AS from_code, tl.code AS to_code
       FROM inv_movements mv
       JOIN inv_items i ON i.id = mv.item_id
       LEFT JOIN bol_documents b ON b.id = mv.bol_id
       LEFT JOIN inv_locations fl ON fl.id = mv.from_location_id
       LEFT JOIN inv_locations tl ON tl.id = mv.to_location_id
       ORDER BY mv.created_at DESC, mv.id DESC LIMIT ?`,
    ).all(limit) as Record<string, unknown>[];
    return rows.map((r) => this.rowToMovement(r));
  }

  private rowToMovement(r: Record<string, unknown>): InvMovement {
    return { id: r.id as number, type: r.type as InvMovementType, itemId: r.item_id as number, sku: String(r.sku ?? ''), itemName: String(r.item_name ?? ''), quantity: r.quantity as number, fromLocationId: (r.from_location_id as number | null) ?? null, fromLocationCode: (r.from_code as string | null) ?? null, toLocationId: (r.to_location_id as number | null) ?? null, toLocationCode: (r.to_code as string | null) ?? null, bolId: (r.bol_id as number | null) ?? null, bolNumber: (r.bol_number as string | null) ?? null, rrNumber: String(r.rr_number ?? ''), user: String(r.user ?? ''), note: String(r.note ?? ''), createdAt: String(r.created_at ?? '') };
  }

  listInvHistory(limit = 200): InvHistoryEntry[] {
    const rows = this.db.prepare(`SELECT * FROM inv_history ORDER BY created_at DESC, id DESC LIMIT ?`).all(limit) as Record<string, unknown>[];
    return rows.map((r) => ({ id: r.id as number, entityType: String(r.entity_type), entityId: r.entity_id as number, action: String(r.action), detail: String(r.detail ?? ''), createdAt: String(r.created_at ?? '') }));
  }

  /** Search inventory by SKU / name / customer / project, and by RR number:
   *  an RR search finds BOL line items with that RR, the BOLs they belong to,
   *  and every inventory movement linked to those BOLs (or carrying that RR). */
  searchInventory(query: string): InventorySearchResult {
    const q = `%${query.trim()}%`;
    const items = this.listInvItems(query.trim());
    const bolRows = this.db.prepare(
      `SELECT DISTINCT b.id AS bol_id, b.bol_number, bi.rr_number FROM bol_items bi
       JOIN bol_documents b ON b.id = bi.bol_id WHERE bi.rr_number LIKE ? ORDER BY b.bol_number ASC`,
    ).all(q) as Record<string, unknown>[];
    const bols = bolRows.map((r) => ({ id: r.bol_id as number, bolNumber: String(r.bol_number), rrNumber: String(r.rr_number ?? '') }));
    const bolIds = [...new Set(bols.map((b) => b.id))];
    let movements: InvMovement[] = [];
    if (bolIds.length) {
      const placeholders = bolIds.map(() => '?').join(', ');
      const rows = this.db.prepare(
        `SELECT mv.*, i.sku, i.name AS item_name, b.bol_number, fl.code AS from_code, tl.code AS to_code
         FROM inv_movements mv JOIN inv_items i ON i.id = mv.item_id
         LEFT JOIN bol_documents b ON b.id = mv.bol_id
         LEFT JOIN inv_locations fl ON fl.id = mv.from_location_id
         LEFT JOIN inv_locations tl ON tl.id = mv.to_location_id
         WHERE mv.bol_id IN (${placeholders}) OR mv.rr_number LIKE ?
         ORDER BY mv.created_at DESC, mv.id DESC`,
      ).all(...bolIds, q) as Record<string, unknown>[];
      movements = rows.map((r) => this.rowToMovement(r));
    } else {
      const rows = this.db.prepare(
        `SELECT mv.*, i.sku, i.name AS item_name, b.bol_number, fl.code AS from_code, tl.code AS to_code
         FROM inv_movements mv JOIN inv_items i ON i.id = mv.item_id
         LEFT JOIN bol_documents b ON b.id = mv.bol_id
         LEFT JOIN inv_locations fl ON fl.id = mv.from_location_id
         LEFT JOIN inv_locations tl ON tl.id = mv.to_location_id
         WHERE mv.rr_number LIKE ? OR i.sku LIKE ?
         ORDER BY mv.created_at DESC, mv.id DESC`,
      ).all(q, q) as Record<string, unknown>[];
      movements = rows.map((r) => this.rowToMovement(r));
    }
    return { items, movements, bols };
  }

  /** Full JSON dump for backup. */
  dumpAll(): Record<string, unknown> {
    const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), app: 'logistics-studio', version: 2 };
    const tables = ['bol_documents', 'bol_items', 'bol_history', 'settings', 'templates',
      ...Object.keys(CATALOG_TABLES), ...INVENTORY_TABLES];
    for (const t of tables) out[t] = this.db.prepare(`SELECT * FROM ${t}`).all();
    return out;
  }

  /** Restore from a JSON dump. Replaces all data. Runs in a transaction.
   *  Inventory tables are optional so pre-Phase-4 (v1) backups still restore.
   *  Deletes run child-first and inserts parent-first so FK constraints hold. */
  restoreAll(dump: Record<string, unknown>) {
    const required = ['bol_documents', 'bol_items', 'bol_history', 'settings', 'templates',
      ...Object.keys(CATALOG_TABLES)];
    for (const t of required) {
      if (!Array.isArray(dump[t])) throw new Error(`Backup is missing table "${t}"`);
    }
    const present = (t: string) => Array.isArray(dump[t]);
    // Parent-first insert order.
    const insertOrder = ['settings', 'templates', 'warehouses', 'inv_locations', 'inv_items',
      'inv_pallets', 'inv_boxes', 'bol_documents', 'bol_items', 'bol_history',
      'inv_stock', 'inv_movements', 'inv_history', ...Object.keys(CATALOG_TABLES)];
    const run = this.db.transaction(() => {
      for (const t of [...insertOrder].reverse()) {
        if (present(t)) this.db.exec(`DELETE FROM ${t}`);
      }
      for (const t of insertOrder) {
        if (!present(t)) continue;
        const rows = dump[t] as Record<string, unknown>[];
        for (const row of rows) {
          const cols = Object.keys(row);
          if (!cols.length) continue;
          const placeholders = cols.map(() => '?').join(', ');
          this.db.prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${placeholders})`)
            .run(...cols.map((c) => row[c] as string | number | null));
        }
      }
    });
    run();
  }

  close() {
    this.db.close();
  }
}
