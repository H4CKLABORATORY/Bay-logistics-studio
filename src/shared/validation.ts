// Field validation for BOL documents. Pure functions — covered by Vitest.
import type { BolDocument } from './types';
import { validateInvItem, validateLocationCode, validateMovementInput, validateWarehouseDims } from './inventory';

export { validateInvItem, validateLocationCode, validateMovementInput, validateWarehouseDims };
export type { InvItemInput, MovementInput, WarehouseDimsInput } from './inventory';

export function validateBol(doc: Partial<BolDocument>): string[] {
  const errors: string[] = [];
  if (!doc.bolNumber || !doc.bolNumber.trim()) errors.push('BOL NUMBER is required.');
  if (!doc.date || !/^\d{4}-\d{2}-\d{2}$/.test(doc.date)) {
    errors.push('DATE is required (YYYY-MM-DD).');
  } else {
    const d = new Date(`${doc.date}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) errors.push('DATE is not a valid calendar date.');
  }
  if (!doc.shipFrom || !doc.shipFrom.trim()) errors.push('SHIP FROM is required.');
  if (!doc.deliveryAddress || !doc.deliveryAddress.trim()) {
    errors.push('DELIVERY ADDRESS is required.');
  }
  if (!doc.requestBy || !doc.requestBy.trim()) errors.push('REQUEST BY is required.');
  if (!doc.items || doc.items.length === 0) {
    errors.push('At least one line item is required.');
  } else {
    doc.items.forEach((it, i) => {
      const n = i + 1;
      if (!Number.isFinite(it.quantity) || it.quantity <= 0) {
        errors.push(`Line ${n}: QUANTITY must be greater than 0.`);
      }
      if (!it.modelDescription || !it.modelDescription.trim()) {
        errors.push(`Line ${n}: MODEL/DESCRIPTION is required.`);
      }
      if (it.weight && !/^\d+(\.\d+)?\s*(lbs?|kg)?$/i.test(it.weight.trim())) {
        errors.push(`Line ${n}: WEIGHT must be a number, optionally followed by lb/lbs/kg.`);
      }
    });
  }
  if (doc.template === 'warehouse') {
    // Internal signatures are optional until the job is complete, but if one is
    // filled the others are expected to be filled at print time — warn, don't block.
  }
  if (doc.template === 'delivery' && doc.receiverName && !doc.receiverDate) {
    errors.push('Delivery: RECEIVER DATE is required when a receiver name is given.');
  }
  return errors;
}

export function validateCatalogRecord(kind: string, rec: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const name = rec.name ?? rec.model ?? rec.label;
  if (!name || String(name).trim() === '') {
    errors.push(`${kind}: a name/label is required.`);
  }
  if (rec.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(rec.email))) {
    errors.push(`${kind}: email looks invalid.`);
  }
  return errors;
}
