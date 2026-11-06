// Inventory — pure helpers shared by main, renderer and tests.
// No Electron/Node imports here. Location codes are ZONE-AISLE-SHELF-POSITION,
// e.g. "A-01-02-03": zone A, aisle 01, shelf 02, position 03.

export type MovementType = 'entry' | 'exit' | 'move';

/** Location code: 1-3 uppercase letters, then three 2-digit groups. */
export const LOCATION_CODE_RE = /^[A-Z]{1,3}-\d{2}-\d{2}-\d{2}$/;

/** SKU: 1-32 chars, letters/digits/dash/underscore/dot. */
export const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

export interface ParsedLocationCode {
  zone: string;
  aisle: number;
  shelf: number;
  position: number;
}

export function validateLocationCode(code: unknown): string[] {
  if (typeof code !== 'string' || !code.trim()) return ['Location code is required (e.g. A-01-02-03).'];
  if (!LOCATION_CODE_RE.test(code.trim().toUpperCase())) {
    return ['Location code must look like A-01-02-03 (zone-aisle-shelf-position).'];
  }
  return [];
}

export function parseLocationCode(code: string): ParsedLocationCode | null {
  const m = LOCATION_CODE_RE.exec(code.trim().toUpperCase());
  if (!m) return null;
  const [zone, aisle, shelf, position] = code.trim().toUpperCase().split('-');
  return { zone, aisle: Number(aisle), shelf: Number(shelf), position: Number(position) };
}

export function buildLocationCode(zone: string, aisle: number, shelf: number, position: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${zone.trim().toUpperCase()}-${pad(aisle)}-${pad(shelf)}-${pad(position)}`;
}

export function validateSku(sku: unknown): string[] {
  if (typeof sku !== 'string' || !sku.trim()) return ['SKU is required.'];
  if (!SKU_RE.test(sku.trim())) return ['SKU may only contain letters, digits, dash, underscore and dot (max 32 chars).'];
  return [];
}

export interface InvItemInput {
  sku: string;
  name: string;
  description?: string;
  unit?: string;
  weight?: string;
  customer?: string;
  project?: string;
}

export function validateInvItem(it: Partial<InvItemInput>): string[] {
  const errors: string[] = [...validateSku(it.sku)];
  if (!it.name || !String(it.name).trim()) errors.push('Item name is required.');
  if (it.weight && !/^\d+(\.\d+)?\s*(lbs?|kg)?$/i.test(String(it.weight).trim())) {
    errors.push('Weight must be a number, optionally followed by lb/lbs/kg.');
  }
  return errors;
}

export interface MovementInput {
  type: MovementType;
  itemId: number;
  quantity: number;
  fromLocationId?: number | null;
  toLocationId?: number | null;
  bolId?: number | null;
  rrNumber?: string;
  user?: string;
  note?: string;
}

/** Pure input checks for a movement. Stock-availability is checked in the
 *  Store transaction (it needs live DB state) — see Store.recordMovement. */
export function validateMovementInput(m: Partial<MovementInput>): string[] {
  const errors: string[] = [];
  if (m.type !== 'entry' && m.type !== 'exit' && m.type !== 'move') {
    errors.push('Movement type must be entry, exit or move.');
  }
  if (!Number.isInteger(m.itemId) || (m.itemId as number) <= 0) errors.push('A valid item is required.');
  if (!Number.isInteger(m.quantity) || (m.quantity as number) <= 0) errors.push('Quantity must be a whole number greater than 0.');
  if (m.type === 'entry' && !m.toLocationId) errors.push('Entry needs a destination location.');
  if (m.type === 'exit' && !m.fromLocationId) errors.push('Exit needs a source location.');
  if (m.type === 'move' && (!m.fromLocationId || !m.toLocationId)) errors.push('Move needs both a source and a destination location.');
  if (m.type === 'move' && m.fromLocationId && m.fromLocationId === m.toLocationId) {
    errors.push('Move source and destination must be different locations.');
  }
  if (m.bolId !== undefined && m.bolId !== null && (!Number.isInteger(m.bolId) || m.bolId <= 0)) {
    errors.push('BOL id must be a positive integer when given.');
  }
  return errors;
}

export interface WarehouseDimsInput {
  name: string;
  widthM: number;
  depthM: number;
  heightM: number;
}

export function validateWarehouseDims(w: Partial<WarehouseDimsInput>): string[] {
  const errors: string[] = [];
  if (!w.name || !String(w.name).trim()) errors.push('Warehouse name is required.');
  for (const [k, v] of [['widthM', w.widthM], ['depthM', w.depthM], ['heightM', w.heightM]] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 1000) {
      errors.push(`${k} must be a number between 0 and 1000 metres.`);
    }
  }
  return errors;
}
