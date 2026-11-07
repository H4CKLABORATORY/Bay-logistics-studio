import { describe, expect, it } from 'vitest';
import { validateBol, validateCatalogRecord } from '../src/shared/validation';
import { blankBol } from '../src/shared/types';

function validBol() {
  return {
    ...blankBol('warehouse'),
    bolNumber: 'BOL-00001',
    shipFrom: 'Warehouse A',
    deliveryAddress: '123 Main St',
    requestBy: 'Jane Doe',
    items: [{ quantity: 2, modelDescription: 'CRANE HOOK 5T', rrNumber: 'RR-9912', weight: '150 lbs' }],
  };
}

describe('validateBol', () => {
  it('accepts a complete valid BOL', () => {
    expect(validateBol(validBol())).toEqual([]);
  });
  it('requires BOL number, date, ship-from, delivery address, request-by', () => {
    const errors = validateBol({ ...validBol(), bolNumber: '', shipFrom: '', deliveryAddress: '', requestBy: '', date: '' });
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });
  it('rejects a bad date', () => {
    expect(validateBol({ ...validBol(), date: 'not-a-date' }).length).toBeGreaterThan(0);
  });
  it('requires at least one item with quantity > 0 and a description', () => {
    expect(validateBol({ ...validBol(), items: [] }).length).toBeGreaterThan(0);
    expect(validateBol({ ...validBol(), items: [{ quantity: 0, modelDescription: '', rrNumber: '', weight: '' }] }).length).toBeGreaterThan(0);
  });
  it('rejects a malformed weight', () => {
    expect(validateBol({ ...validBol(), items: [{ quantity: 1, modelDescription: 'X', rrNumber: '', weight: 'heavy' }] }).length).toBeGreaterThan(0);
    expect(validateBol({ ...validBol(), items: [{ quantity: 1, modelDescription: 'X', rrNumber: '', weight: '150 lbs' }] })).toEqual([]);
  });
  it('requires receiver date when a receiver name is given on a delivery BOL', () => {
    const doc = { ...validBol(), template: 'delivery' as const, receiverName: 'John', receiverDate: '' };
    expect(validateBol(doc).length).toBeGreaterThan(0);
  });
});

describe('validateCatalogRecord', () => {
  it('requires a name and a valid email when present', () => {
    expect(validateCatalogRecord('customers', { name: '' }).length).toBeGreaterThan(0);
    expect(validateCatalogRecord('customers', { name: 'Acme', email: 'not-an-email' }).length).toBeGreaterThan(0);
    expect(validateCatalogRecord('customers', { name: 'Acme', email: 'a@b.com' })).toEqual([]);
  });
});
