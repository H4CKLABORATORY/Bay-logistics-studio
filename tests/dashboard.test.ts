import { describe, expect, it } from 'vitest';
import { Store } from '../src/main/db';
import { blankBol } from '../src/shared/types';

function today(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

describe('getDashboardStats (Phase 8)', () => {
  it('aggregates BOLs, stock and activity from real rows', () => {
    const store = new Store(':memory:');
    const mk = (n: string, date: string) =>
      store.createBol({
        ...blankBol('warehouse'), bolNumber: n, date, shipFrom: 'WH', deliveryAddress: '1 Main St',
        requestBy: 'Jane', items: [{ quantity: 1, modelDescription: 'X', rrNumber: '1', weight: '' }],
      });
    mk('BOL-00101', today(0));
    mk('BOL-00102', today(-3));
    mk('BOL-00103', today(-60)); // outside the 8-week window and the "this week" count

    const stocked = store.createInvItem({ sku: 'STK-1', name: 'Stocked', description: '', unit: '', weight: '', customer: '', project: '' });
    const empty = store.createInvItem({ sku: 'EMP-1', name: 'Empty', description: '', unit: '', weight: '', customer: '', project: '' });
    const loc = store.listLocations()[0];
    store.recordMovement({ type: 'entry', itemId: stocked.id!, quantity: 6, toLocationId: loc.id! });

    const s = store.getDashboardStats();
    expect(s.totalBols).toBe(3);
    expect(s.bolsToday).toBe(1);
    expect(s.bolsThisWeek).toBe(2);
    expect(s.totalStockUnits).toBe(6);
    expect(s.distinctSkusInStock).toBe(1);
    expect(s.locationsTotal).toBeGreaterThanOrEqual(12); // seeded grid
    expect(s.locationsOccupied).toBe(1);
    expect(s.overCapacity).toEqual([]); // 6 units in a capacity-100 location
    expect(s.zeroStockItems.map((i) => i.sku)).toContain('EMP-1');
    expect(s.zeroStockItems.map((i) => i.sku)).not.toContain('STK-1');
    const weekTotal = s.weekly.reduce((sum, w) => sum + w.count, 0);
    expect(weekTotal).toBe(2); // only the two recent BOLs are inside 8 weeks
    expect(s.weekly.length).toBeLessThanOrEqual(8);
    expect(s.recentActivity.length).toBeGreaterThan(0);
    expect(s.recentActivity.length).toBeLessThanOrEqual(8);
    // Newest first.
    const times = s.recentActivity.map((a) => a.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it('flags a location at/over capacity', () => {
    const store = new Store(':memory:');
    const item = store.createInvItem({ sku: 'CAP-1', name: 'Capacity', description: '', unit: '', weight: '', customer: '', project: '' });
    const loc = store.listLocations()[0]; // seeded capacity 100
    store.recordMovement({ type: 'entry', itemId: item.id!, quantity: 100, toLocationId: loc.id! });
    const s = store.getDashboardStats();
    expect(s.overCapacity.map((l) => l.code)).toContain(loc.code);
    expect(s.overCapacity.find((l) => l.code === loc.code)?.stockQty).toBe(100);
  });
});

describe('report queries (Phase 8)', () => {
  it('getReportBols / getReportMovements / getReportInventory read real rows', () => {
    const store = new Store(':memory:');
    store.createBol({
      ...blankBol('delivery'), bolNumber: 'BOL-00201', date: today(0), shipFrom: 'WH',
      deliveryAddress: '2 Main St', requestBy: 'John',
      items: [
        { quantity: 2, modelDescription: 'A', rrNumber: '1', weight: '10' },
        { quantity: 3, modelDescription: 'B', rrNumber: '2', weight: '5 lb' },
      ],
    });
    const item = store.createInvItem({ sku: 'REP-1', name: 'Reportable', description: '', unit: '', weight: '', customer: '', project: '' });
    const loc = store.listLocations()[0];
    store.recordMovement({ type: 'entry', itemId: item.id!, quantity: 9, toLocationId: loc.id! });

    const bols = store.getReportBols(today(-30), today(0));
    expect(bols).toHaveLength(1);
    expect(bols[0].itemCount).toBe(2);
    expect(bols[0].totalQty).toBe(5);
    expect(bols[0].weights).toEqual(['10', '5 lb']);

    expect(store.getReportBols(today(-30), today(-1))).toHaveLength(0); // range excludes today

    const moves = store.getReportMovements(today(-30), today(0));
    expect(moves).toHaveLength(1);
    expect(moves[0].type).toBe('entry');
    expect(moves[0].sku).toBe('REP-1');
    expect(moves[0].quantity).toBe(9);

    const inv = store.getReportInventory();
    const row = inv.rows.find((r) => r.sku === 'REP-1');
    expect(row?.totalQty).toBe(9);
    expect(row?.locationsUsed).toBe(1);
    expect(inv.palletCount).toBe(0);
    expect(inv.boxCount).toBe(0);
  });
});
