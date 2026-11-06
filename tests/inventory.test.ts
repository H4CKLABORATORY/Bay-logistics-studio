import { describe, expect, it, beforeEach } from 'vitest';
import { Store } from '../src/main/db';
import { blankBol } from '../src/shared/types';
import { buildLocationCode, parseLocationCode, validateLocationCode, validateMovementInput, validateSku } from '../src/shared/inventory';

function freshStore() {
  return new Store(':memory:');
}

function makeItem(store: Store, sku = 'HOOK-5T') {
  return store.createInvItem({ sku, name: 'Crane Hook 5T', description: '', unit: 'ea', weight: '150 lbs', customer: 'Acme Corp', project: 'Bay 3' });
}

describe('location codes', () => {
  it('accepts A-01-02-03 and parses its parts', () => {
    expect(validateLocationCode('A-01-02-03')).toEqual([]);
    expect(parseLocationCode('A-01-02-03')).toEqual({ zone: 'A', aisle: 1, shelf: 2, position: 3 });
  });
  it('rejects malformed codes', () => {
    expect(validateLocationCode('A-1-2-3').length).toBeGreaterThan(0);
    expect(validateLocationCode('a10203').length).toBeGreaterThan(0);
    expect(validateLocationCode('').length).toBeGreaterThan(0);
    expect(validateLocationCode('A-01-02').length).toBeGreaterThan(0);
  });
  it('buildLocationCode round-trips through parseLocationCode', () => {
    expect(parseLocationCode(buildLocationCode('B', 2, 3, 4))).toEqual({ zone: 'B', aisle: 2, shelf: 3, position: 4 });
  });
  it('rejects bad SKUs', () => {
    expect(validateSku('HOOK-5T')).toEqual([]);
    expect(validateSku('bad sku!').length).toBeGreaterThan(0);
    expect(validateSku('').length).toBeGreaterThan(0);
  });
});

describe('inventory store', () => {
  let store: Store;
  beforeEach(() => { store = freshStore(); });

  it('seeds a default warehouse and a starter location grid', () => {
    expect(store.listWarehouses().length).toBeGreaterThanOrEqual(1);
    expect(store.listWarehouses()[0].name).toBe('Main Warehouse');
    expect(store.listLocations().length).toBe(12);
    expect(store.getLocationByCode('A-01-01-01')).not.toBeNull();
  });

  it('rejects a duplicate SKU and a duplicate location code (UNIQUE)', () => {
    makeItem(store);
    expect(() => makeItem(store)).toThrow();
    const wh = store.listWarehouses()[0];
    expect(() => store.createLocation({
      warehouseId: wh.id!, code: 'A-01-01-01', zone: 'A', aisle: 1, shelf: 1, position: 1, x: 1, y: 1, z: 1, capacity: 10,
    })).toThrow();
  });

  it('entry adds stock, move transfers it, exit removes it', () => {
    const item = makeItem(store);
    const locs = store.listLocations();
    const a = locs[0]; const b = locs[1];
    store.recordMovement({ type: 'entry', itemId: item.id!, quantity: 10, toLocationId: a.id! });
    expect(store.getStockQty(item.id!, a.id!)).toBe(10);
    store.recordMovement({ type: 'move', itemId: item.id!, quantity: 4, fromLocationId: a.id!, toLocationId: b.id! });
    expect(store.getStockQty(item.id!, a.id!)).toBe(6);
    expect(store.getStockQty(item.id!, b.id!)).toBe(4);
    store.recordMovement({ type: 'exit', itemId: item.id!, quantity: 2, fromLocationId: b.id! });
    expect(store.getStockQty(item.id!, b.id!)).toBe(2);
    expect(store.listMovements().length).toBe(3);
    expect(store.listInvHistory().length).toBeGreaterThanOrEqual(3);
  });

  it('rejects a move/exit with insufficient stock and leaves stock unchanged (atomic)', () => {
    const item = makeItem(store);
    const locs = store.listLocations();
    const a = locs[0]; const b = locs[1];
    store.recordMovement({ type: 'entry', itemId: item.id!, quantity: 3, toLocationId: a.id! });
    expect(() => store.recordMovement({ type: 'move', itemId: item.id!, quantity: 5, fromLocationId: a.id!, toLocationId: b.id! })).toThrow(/Insufficient stock/);
    expect(store.getStockQty(item.id!, a.id!)).toBe(3);
    expect(store.getStockQty(item.id!, b.id!)).toBe(0);
    expect(() => store.recordMovement({ type: 'exit', itemId: item.id!, quantity: 99, fromLocationId: a.id! })).toThrow(/Insufficient stock/);
    expect(store.getStockQty(item.id!, a.id!)).toBe(3);
  });

  it('validates movement input before touching the DB', () => {
    expect(validateMovementInput({ type: 'entry', itemId: 1, quantity: 1 }).length).toBeGreaterThan(0); // no destination
    expect(validateMovementInput({ type: 'move', itemId: 1, quantity: 1, fromLocationId: 2, toLocationId: 2 }).length).toBeGreaterThan(0); // same loc
    expect(validateMovementInput({ type: 'exit', itemId: 1, quantity: 0, fromLocationId: 2 }).length).toBeGreaterThan(0);
    expect(validateMovementInput({ type: 'entry', itemId: 1, quantity: 2, toLocationId: 3 })).toEqual([]);
  });

  it('rejects a movement linked to a nonexistent BOL', () => {
    const item = makeItem(store);
    const a = store.listLocations()[0];
    expect(() => store.recordMovement({ type: 'entry', itemId: item.id!, quantity: 1, toLocationId: a.id!, bolId: 99999 })).toThrow(/BOL id 99999 not found/);
  });

  it('RR search finds the BOL, its line item, and BOL-linked movements', () => {
    const bol = store.createBol({
      ...blankBol('warehouse'), bolNumber: 'BOL-00991', shipFrom: 'Warehouse A',
      deliveryAddress: '123 Main St', requestBy: 'Jane Doe',
      items: [{ quantity: 2, modelDescription: 'CRANE HOOK 5T', rrNumber: '9912', weight: '150 lbs' }],
    });
    const item = makeItem(store);
    const a = store.listLocations()[0];
    store.recordMovement({ type: 'entry', itemId: item.id!, quantity: 2, toLocationId: a.id!, bolId: bol.id!, rrNumber: '9912' });
    const res = store.searchInventory('9912');
    expect(res.bols.map((b) => b.bolNumber)).toContain('BOL-00991');
    expect(res.bols[0].rrNumber).toBe('9912');
    expect(res.movements.length).toBeGreaterThanOrEqual(1);
    expect(res.movements[0].bolNumber).toBe('BOL-00991');
  });

  it('search finds items by SKU, client and project', () => {
    makeItem(store);
    expect(store.searchInventory('HOOK-5T').items.length).toBe(1);
    expect(store.searchInventory('Acme Corp').items.length).toBe(1);
    expect(store.searchInventory('Bay 3').items.length).toBe(1);
    expect(store.searchInventory('no-such-thing').items.length).toBe(0);
  });
});
