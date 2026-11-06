import { describe, expect, it } from 'vitest';
import { parseEmailToBol, parseItemLine } from '../src/shared/emailParser';

const SAMPLE_EMAIL = `Hi team,

Please create a BOL for this delivery.

BOL NUMBER: BOL-00042
DATE: 2026-11-06
JOB #: 8812
SHIP FROM: Warehouse A, Bay 3
DELIVERY ADDRESS: 123 Main St, Baltimore, MD
REQUEST BY: Jane Doe
TRUCK/TRAILER: TRK-114 / TRL-88
THIRD PARTY FREIGHT CHARGES BILL TO: Acme Corp
REQUESTED DELIVERY: 2026-11-07 morning
DELIVERY NOTES: Call on arrival.

ITEMS:
2 x CRANE HOOK 5T RR# 9912 150 lbs
1 | STEEL BEAM 20FT | 9913 | 1200 lbs
3, PALLET JACK, 9914, 90 lbs

Thanks,
Jane`;

describe('parseEmailToBol', () => {
  it('parses all header fields from raw email text', () => {
    const r = parseEmailToBol(SAMPLE_EMAIL, 'warehouse');
    expect(r.bolNumber).toBe('BOL-00042');
    expect(r.date).toBe('2026-11-06');
    expect(r.jobNumber).toBe('8812');
    expect(r.shipFrom).toBe('Warehouse A, Bay 3');
    expect(r.deliveryAddress).toBe('123 Main St, Baltimore, MD');
    expect(r.requestBy).toBe('Jane Doe');
    expect(r.truckTrailer).toBe('TRK-114 / TRL-88');
    expect(r.billTo).toBe('Acme Corp');
    expect(r.requestedDelivery).toBe('2026-11-07 morning');
    expect(r.deliveryNotes).toBe('Call on arrival.');
  });
  it('parses item lines in all three supported formats', () => {
    const r = parseEmailToBol(SAMPLE_EMAIL, 'warehouse');
    expect(r.items).toHaveLength(3);
    expect(r.items![0]).toMatchObject({ quantity: 2, modelDescription: 'CRANE HOOK 5T', rrNumber: '9912', weight: '150 lbs' });
    expect(r.items![1]).toMatchObject({ quantity: 1, modelDescription: 'STEEL BEAM 20FT', rrNumber: '9913', weight: '1200 lbs' });
    expect(r.items![2]).toMatchObject({ quantity: 3, modelDescription: 'PALLET JACK', rrNumber: '9914', weight: '90 lbs' });
  });
  it('returns an empty partial for unrelated text (never invents fields)', () => {
    const r = parseEmailToBol('Hello, just checking in. No BOL here.', 'delivery');
    expect(r.bolNumber).toBeUndefined();
    expect(r.items).toEqual([]);
  });
});

describe('parseItemLine', () => {
  it('parses "2 x MODEL RR# 123 150 lbs"', () => {
    expect(parseItemLine('2 x CRANE HOOK 5T RR# 9912 150 lbs')).toMatchObject({
      quantity: 2, modelDescription: 'CRANE HOOK 5T', rrNumber: '9912', weight: '150 lbs',
    });
  });
  it('returns null for non-item lines', () => {
    expect(parseItemLine('Thanks, Jane')).toBeNull();
    expect(parseItemLine('')).toBeNull();
  });
});
