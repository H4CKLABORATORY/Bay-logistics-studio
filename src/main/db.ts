// SQLite layer (better-sqlite3, synchronous, parameterized queries only).
// Database lives in the OS user-data dir (app.getPath('userData')), never in
// the install folder. Choice note: better-sqlite3 was chosen over sql.js
// because it ships prebuilt native binaries for the target platforms and
// gives real file-backed persistence + UNIQUE constraints for BOL numbering.
// If a platform lacks a prebuild, `npm rebuild better-sqlite3` builds it.
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type { AppSettings, BolDocument, BolHistoryEntry, CatalogKind, CatalogRecord } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import { BASE_TEMPLATES } from '../shared/templates';

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
      this.db.prepare(`INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1')`).run();
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

  /** Full JSON dump for backup. */
  dumpAll(): Record<string, unknown> {
    const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), app: 'logistics-studio', version: 1 };
    const tables = ['bol_documents', 'bol_items', 'bol_history', 'settings', 'templates',
      ...Object.keys(CATALOG_TABLES)];
    for (const t of tables) out[t] = this.db.prepare(`SELECT * FROM ${t}`).all();
    return out;
  }

  /** Restore from a JSON dump. Replaces all data. Runs in a transaction. */
  restoreAll(dump: Record<string, unknown>) {
    const tables = ['bol_documents', 'bol_items', 'bol_history', 'settings', 'templates',
      ...Object.keys(CATALOG_TABLES)];
    for (const t of tables) {
      if (!Array.isArray(dump[t])) throw new Error(`Backup is missing table "${t}"`);
    }
    const run = this.db.transaction(() => {
      for (const t of tables) {
        this.db.exec(`DELETE FROM ${t}`);
        const rows = dump[t] as Record<string, unknown>[];
        for (const row of rows) {
          const cols = Object.keys(row);
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
