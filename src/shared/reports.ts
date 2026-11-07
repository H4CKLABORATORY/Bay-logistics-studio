// Reports (Phase 8): pure aggregation + CSV helpers. No Electron/Node
// imports, so these functions are unit-testable and usable from both the
// main process (export) and the renderer (on-screen tables).
// Every number here comes from DB rows supplied by Store — no demo data.

export interface ReportBolRow {
  id: number;
  date: string; // YYYY-MM-DD
  customerName: string;
  itemCount: number;
  totalQty: number;
  weights: string[]; // raw weight strings from bol_items (may be '' or non-numeric)
}

export interface BolsByPeriodEntry {
  period: string; // YYYY-MM-DD for day, week-start YYYY-MM-DD for week
  bolCount: number;
  totalItems: number;
  totalQty: number;
  totalWeight: number;
}

export interface BolsByCustomerEntry {
  customer: string;
  bolCount: number;
  totalItems: number;
  totalQty: number;
}

export interface ReportMovementRow {
  type: 'entry' | 'exit' | 'move';
  sku: string;
  name: string;
  quantity: number;
  date: string; // YYYY-MM-DD
}

export interface MovementSummaryEntry {
  sku: string;
  name: string;
  entries: number;
  exits: number;
  moves: number;
  entryQty: number;
  exitQty: number;
  moveQty: number;
}

export interface ReportInventoryRow {
  sku: string;
  name: string;
  totalQty: number;
  locationsUsed: number;
}

export interface InventorySummary {
  rows: ReportInventoryRow[];
  totalUnits: number;
  distinctSkus: number;
  locationsUsed: number;
  palletCount: number;
  boxCount: number;
}

export interface ReportInventoryResult {
  rows: ReportInventoryRow[];
  palletCount: number;
  boxCount: number;
}

/** Parse a weight string ("12", "12.5 lb", "") to a number; non-numeric -> 0. */
export function parseWeight(raw: string | null | undefined): number {
  if (!raw) return 0;
  const m = String(raw).match(/-?\d+(\.\d+)?/);
  if (!m) return 0;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : 0;
}

/** Monday (YYYY-MM-DD) of the week containing `dateStr` (YYYY-MM-DD). */
export function weekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = d.getUTCDay(); // 0 = Sunday
  const delta = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - delta);
  return d.toISOString().slice(0, 10);
}

export function groupBolsByPeriod(rows: ReportBolRow[], granularity: 'day' | 'week'): BolsByPeriodEntry[] {
  const map = new Map<string, BolsByPeriodEntry>();
  for (const r of rows) {
    const key = granularity === 'week' ? weekStart(r.date) : r.date;
    const cur = map.get(key) ?? { period: key, bolCount: 0, totalItems: 0, totalQty: 0, totalWeight: 0 };
    cur.bolCount += 1;
    cur.totalItems += r.itemCount;
    cur.totalQty += r.totalQty;
    cur.totalWeight += r.weights.reduce((sum, w) => sum + parseWeight(w), 0);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
}

export function groupBolsByCustomer(rows: ReportBolRow[]): BolsByCustomerEntry[] {
  const map = new Map<string, BolsByCustomerEntry>();
  for (const r of rows) {
    const key = r.customerName.trim() || '(no customer)';
    const cur = map.get(key) ?? { customer: key, bolCount: 0, totalItems: 0, totalQty: 0 };
    cur.bolCount += 1;
    cur.totalItems += r.itemCount;
    cur.totalQty += r.totalQty;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.bolCount - a.bolCount || (a.customer < b.customer ? -1 : 1));
}

export function summarizeMovements(rows: ReportMovementRow[]): MovementSummaryEntry[] {
  const map = new Map<string, MovementSummaryEntry>();
  for (const r of rows) {
    const cur = map.get(r.sku) ?? {
      sku: r.sku, name: r.name,
      entries: 0, exits: 0, moves: 0, entryQty: 0, exitQty: 0, moveQty: 0,
    };
    if (r.type === 'entry') { cur.entries += 1; cur.entryQty += r.quantity; }
    else if (r.type === 'exit') { cur.exits += 1; cur.exitQty += r.quantity; }
    else { cur.moves += 1; cur.moveQty += r.quantity; }
    map.set(r.sku, cur);
  }
  return [...map.values()].sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0));
}

export function summarizeInventory(rows: ReportInventoryRow[], palletCount: number, boxCount: number): InventorySummary {
  const totalUnits = rows.reduce((s, r) => s + r.totalQty, 0);
  const locationsUsed = rows.reduce((s, r) => s + r.locationsUsed, 0);
  return {
    rows: [...rows].sort((a, b) => b.totalQty - a.totalQty || (a.sku < b.sku ? -1 : 1)),
    totalUnits,
    distinctSkus: rows.length,
    locationsUsed,
    palletCount,
    boxCount,
  };
}

// ---- CSV ----

export function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

// ---- Date range ----

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateRange(from: string, to: string): boolean {
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return false;
  return from <= to;
}

/** Default report range: last `days` days ending today (inclusive). */
export function defaultRange(days = 30): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}
