import { describe, expect, it } from 'vitest';
import { generateReportPdf, safePdfText } from '../src/main/reportPdf';
import {
  csvEscape, defaultRange, groupBolsByCustomer, groupBolsByPeriod,
  isValidDateRange, parseWeight, rowsToCsv, summarizeInventory,
  summarizeMovements, weekStart,
  type ReportBolRow, type ReportMovementRow,
} from '../src/shared/reports';

const bols: ReportBolRow[] = [
  { id: 1, date: '2026-11-02', customerName: 'Acme', itemCount: 2, totalQty: 5, weights: ['10', '2.5 lb'] },
  { id: 2, date: '2026-11-02', customerName: 'Acme', itemCount: 1, totalQty: 3, weights: [''] },
  { id: 3, date: '2026-11-04', customerName: '', itemCount: 1, totalQty: 1, weights: ['7 kg'] },
];

describe('safePdfText / generateReportPdf (WinAnsi)', () => {
  it('replaces arrows, middots, dashes and ellipsis that Helvetica cannot encode', () => {
    expect(safePdfText('2026-10-08 → 2026-11-06 · test')).toBe('2026-10-08 -> 2026-11-06 - test');
    expect(safePdfText('a…b — c–d')).toBe('a...b - c-d');
    expect(safePdfText('plain ASCII')).toBe('plain ASCII');
  });
  it('generates a valid PDF even with arrow/middot subtitles', async () => {
    const bytes = await generateReportPdf('BOLs by day', '2026-10-08 → 2026-11-06 · 3 BOLs',
      ['Date', 'BOLs'], [['2026-11-02', '2']]);
    expect(bytes.length).toBeGreaterThan(500);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
  });
  it('generates a valid empty PDF', async () => {
    const bytes = await generateReportPdf('Inventory overview', 'As of 2026-11-07',
      ['SKU', 'Item'], []);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
  });
});

describe('parseWeight', () => {
  it('parses plain, suffixed and empty weights', () => {
    expect(parseWeight('10')).toBe(10);
    expect(parseWeight('2.5 lb')).toBe(2.5);
    expect(parseWeight('7 kg')).toBe(7);
    expect(parseWeight('')).toBe(0);
    expect(parseWeight('n/a')).toBe(0);
    expect(parseWeight(undefined)).toBe(0);
  });
});

describe('weekStart', () => {
  it('returns the Monday of the week (2026-11-04 is a Wednesday)', () => {
    expect(weekStart('2026-11-04')).toBe('2026-11-02');
    expect(weekStart('2026-11-02')).toBe('2026-11-02'); // Monday stays
    expect(weekStart('2026-11-08')).toBe('2026-11-02'); // Sunday still that week
  });
});

describe('groupBolsByPeriod', () => {
  it('groups by day with counts, items, qty and summed weight', () => {
    const out = groupBolsByPeriod(bols, 'day');
    expect(out).toEqual([
      { period: '2026-11-02', bolCount: 2, totalItems: 3, totalQty: 8, totalWeight: 12.5 },
      { period: '2026-11-04', bolCount: 1, totalItems: 1, totalQty: 1, totalWeight: 7 },
    ]);
  });
  it('groups by week into one bucket for the same week', () => {
    const out = groupBolsByPeriod(bols, 'week');
    expect(out).toEqual([
      { period: '2026-11-02', bolCount: 3, totalItems: 4, totalQty: 9, totalWeight: 19.5 },
    ]);
  });
  it('returns [] for no rows', () => {
    expect(groupBolsByPeriod([], 'day')).toEqual([]);
  });
});

describe('groupBolsByCustomer', () => {
  it('groups by customer, blank name becomes "(no customer)"', () => {
    const out = groupBolsByCustomer(bols);
    expect(out).toEqual([
      { customer: 'Acme', bolCount: 2, totalItems: 3, totalQty: 8 },
      { customer: '(no customer)', bolCount: 1, totalItems: 1, totalQty: 1 },
    ]);
  });
});

describe('summarizeMovements', () => {
  it('counts and sums entries/exits/moves per SKU', () => {
    const rows: ReportMovementRow[] = [
      { type: 'entry', sku: 'A-1', name: 'Widget', quantity: 5, date: '2026-11-02' },
      { type: 'entry', sku: 'A-1', name: 'Widget', quantity: 2, date: '2026-11-03' },
      { type: 'exit', sku: 'A-1', name: 'Widget', quantity: 3, date: '2026-11-03' },
      { type: 'move', sku: 'B-2', name: 'Gadget', quantity: 4, date: '2026-11-03' },
    ];
    expect(summarizeMovements(rows)).toEqual([
      { sku: 'A-1', name: 'Widget', entries: 2, exits: 1, moves: 0, entryQty: 7, exitQty: 3, moveQty: 0 },
      { sku: 'B-2', name: 'Gadget', entries: 0, exits: 0, moves: 1, entryQty: 0, exitQty: 0, moveQty: 4 },
    ]);
  });
});

describe('summarizeInventory', () => {
  it('totals units, SKUs and locations used', () => {
    const out = summarizeInventory([
      { sku: 'A-1', name: 'Widget', totalQty: 10, locationsUsed: 2 },
      { sku: 'B-2', name: 'Gadget', totalQty: 0, locationsUsed: 0 },
    ], 3, 5);
    expect(out.totalUnits).toBe(10);
    expect(out.distinctSkus).toBe(2);
    expect(out.locationsUsed).toBe(2);
    expect(out.palletCount).toBe(3);
    expect(out.boxCount).toBe(5);
    expect(out.rows[0].sku).toBe('A-1'); // sorted by qty desc
  });
});

describe('CSV helpers', () => {
  it('quotes fields containing commas, quotes or newlines', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(rowsToCsv(['a', 'b'], [[1, 'x,y'], [2, 'z']])).toBe('a,b\r\n1,"x,y"\r\n2,z\r\n');
  });
});

describe('isValidDateRange / defaultRange', () => {
  it('accepts a valid range and rejects bad or reversed ranges', () => {
    expect(isValidDateRange('2026-10-01', '2026-10-31')).toBe(true);
    expect(isValidDateRange('2026-10-31', '2026-10-01')).toBe(false);
    expect(isValidDateRange('2026-10-1', '2026-10-31')).toBe(false);
    expect(isValidDateRange('', '2026-10-31')).toBe(false);
  });
  it('defaultRange(30) ends today and spans 30 days', () => {
    const r = defaultRange(30);
    const today = new Date().toISOString().slice(0, 10);
    expect(r.to).toBe(today);
    const span = (new Date(r.to).getTime() - new Date(r.from).getTime()) / 86400000;
    expect(span).toBe(29);
  });
});
