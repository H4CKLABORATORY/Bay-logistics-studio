import { describe, expect, it } from 'vitest';
import { sanitizeIpcError } from '../src/shared/errors';
import { Store } from '../src/main/db';
import { blankBol } from '../src/shared/types';

describe('sanitizeIpcError (Phase 6: no stack traces / SQL leak to renderer)', () => {
  it('passes validation messages through unchanged', () => {
    expect(sanitizeIpcError(new Error('BOL NUMBER is required.'))).toBe('BOL NUMBER is required.');
    expect(sanitizeIpcError(new Error('Insufficient stock at the source location: have 3, need 5.'))).toContain('Insufficient stock');
  });
  it('turns UNIQUE violations into a friendly duplicate message', () => {
    expect(sanitizeIpcError(new Error('UNIQUE constraint failed: inv_items.sku'))).toBe('An inventory item with that SKU already exists.');
    expect(sanitizeIpcError(new Error('UNIQUE constraint failed: inv_locations.code'))).toBe('A location with that code already exists.');
    expect(sanitizeIpcError(new Error('UNIQUE constraint failed: bol_documents.bol_number'))).toBe('That BOL number is already in use.');
  });
  it('hides stack traces, driver internals and file paths', () => {
    expect(sanitizeIpcError(new Error('boom\n    at foo (/data/home/x.js:10:5)'))).toBe('Database error. Please try again.');
    expect(sanitizeIpcError(new Error('SQLITE_ERROR: no such table: foo'))).toBe('Database error. Please try again.');
    expect(sanitizeIpcError(new Error('better-sqlite3 failed to load'))).toBe('Database error. Please try again.');
    expect(sanitizeIpcError(new Error('open C:\\Users\\x\\AppData\\logistics-studio.db failed'))).toBe('Database error. Please try again.');
  });
});

describe('backup compatibility (Phase 6/7)', () => {
  it('a pre-Phase-4 (v1) backup without inventory tables still restores', () => {
    const src = new Store(':memory:');
    src.createBol({
      ...blankBol('warehouse'), bolNumber: 'BOL-00077', shipFrom: 'Warehouse A',
      deliveryAddress: '1 Main St', requestBy: 'Jane',
      items: [{ quantity: 1, modelDescription: 'X', rrNumber: '1', weight: '' }],
    });
    const dump = src.dumpAll() as Record<string, unknown>;
    // Simulate a v1 backup: strip every inventory table.
    for (const t of ['warehouses', 'inv_locations', 'inv_items', 'inv_pallets', 'inv_boxes', 'inv_stock', 'inv_movements', 'inv_history']) delete dump[t];
    const dst = new Store(':memory:');
    dst.restoreAll(dump);
    expect(dst.getBolByNumber('BOL-00077')).not.toBeNull();
    // Inventory tables still exist (seeded default warehouse) after restore.
    expect(dst.listWarehouses().length).toBeGreaterThanOrEqual(1);
  });

  it('a v2 backup round-trips inventory data', () => {
    const src = new Store(':memory:');
    const item = src.createInvItem({ sku: 'RT-1', name: 'Round Trip', description: '', unit: '', weight: '', customer: '', project: '' });
    const loc = src.listLocations()[0];
    src.recordMovement({ type: 'entry', itemId: item.id!, quantity: 7, toLocationId: loc.id! });
    const dst = new Store(':memory:');
    dst.restoreAll(src.dumpAll());
    expect(dst.listInvItems().map((i) => i.sku)).toContain('RT-1');
    expect(dst.getStockQty(item.id!, loc.id!)).toBe(7);
  });
});
