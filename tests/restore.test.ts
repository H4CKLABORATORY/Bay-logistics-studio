import { describe, expect, it } from 'vitest';
import { Store } from '../src/main/db';
import { blankBol } from '../src/shared/types';

describe('restoreAll column whitelist (Phase 8)', () => {
  function seededStore(): Store {
    const src = new Store(':memory:');
    src.createBol({
      ...blankBol('warehouse'), bolNumber: 'BOL-00091', shipFrom: 'Warehouse A',
      deliveryAddress: '1 Main St', requestBy: 'Jane',
      items: [{ quantity: 2, modelDescription: 'X', rrNumber: '1', weight: '5' }],
    });
    return src;
  }

  it('rejects a backup with an injected extra column', () => {
    const dump = seededStore().dumpAll() as Record<string, unknown>;
    const docs = dump.bol_documents as Record<string, unknown>[];
    docs[0] = { ...docs[0], x: 1 };
    const dst = new Store(':memory:');
    expect(() => dst.restoreAll(dump)).toThrow(/unknown column "x" in table "bol_documents"/);
    // The failed restore must not have wiped the destination data.
    expect(dst.listBols().length).toBe(0);
  });

  it('rejects a malicious-looking column name (SQL injection attempt)', () => {
    const dump = seededStore().dumpAll() as Record<string, unknown>;
    const docs = dump.bol_documents as Record<string, unknown>[];
    docs[0] = { ...docs[0], 'bol_number"; DROP TABLE bol_documents; --': 'BOL-99999' };
    const dst = new Store(':memory:');
    expect(() => dst.restoreAll(dump)).toThrow(/unknown column/);
    // The table still exists and the destination is intact.
    expect(dst.listBols()).toEqual([]);
    expect(() => dst.dumpAll()).not.toThrow();
  });

  it('rejects an injected column in an inventory table too', () => {
    const dump = seededStore().dumpAll() as Record<string, unknown>;
    const items = dump.inv_items as Record<string, unknown>[];
    // inv_items is empty in this seed; inject a row with a bad column instead.
    dump.inv_items = [{ id: 99, sku: 'BAD-1', name: 'Bad', evil_col: 'x' }];
    const dst = new Store(':memory:');
    expect(() => dst.restoreAll(dump)).toThrow(/unknown column "evil_col" in table "inv_items"/);
  });

  it('a normal v2 dump still restores (whitelist allows real columns)', () => {
    const src = seededStore();
    const item = src.createInvItem({ sku: 'RT-8', name: 'Round Trip 8', description: '', unit: '', weight: '', customer: '', project: '' });
    const loc = src.listLocations()[0];
    src.recordMovement({ type: 'entry', itemId: item.id!, quantity: 4, toLocationId: loc.id! });
    const dst = new Store(':memory:');
    dst.restoreAll(src.dumpAll());
    expect(dst.getBolByNumber('BOL-00091')).not.toBeNull();
    expect(dst.getStockQty(item.id!, loc.id!)).toBe(4);
  });

  it('a v1 backup without inventory tables still restores', () => {
    const dump = seededStore().dumpAll() as Record<string, unknown>;
    for (const t of ['warehouses', 'inv_locations', 'inv_items', 'inv_pallets', 'inv_boxes', 'inv_stock', 'inv_movements', 'inv_history']) delete dump[t];
    const dst = new Store(':memory:');
    dst.restoreAll(dump);
    expect(dst.getBolByNumber('BOL-00091')).not.toBeNull();
  });
});
