// Paste parser: turn raw email text into BOL fields + line items.
// Pure function — covered by Vitest. Best-effort: unmatched lines are ignored,
// never invented. The caller shows the parsed result for review before saving.
import type { BolDocument, BolItem } from './types';

const FIELD_PATTERNS: Array<{ keys: string[]; field: keyof BolDocument }> = [
  { keys: ['BOL NUMBER', 'BOL NO', 'BOL #', 'BOL'], field: 'bolNumber' },
  { keys: ['JOB #', 'JOB NO', 'JOB NUMBER', 'JOB'], field: 'jobNumber' },
  { keys: ['SHIP FROM', 'SHIPPED FROM', 'FROM'], field: 'shipFrom' },
  { keys: ['DELIVERY ADDRESS', 'DELIVER TO', 'SHIP TO', 'DELIVERY TO'], field: 'deliveryAddress' },
  { keys: ['REQUEST BY', 'REQUESTED BY', 'REQUESTED FROM'], field: 'requestBy' },
  { keys: ['TRUCK/TRAILER', 'TRUCK', 'TRAILER'], field: 'truckTrailer' },
  {
    keys: ['THIRD PARTY FREIGHT CHARGES BILL TO', 'BILL TO', 'FREIGHT CHARGES BILL TO'],
    field: 'billTo',
  },
  { keys: ['REQUESTED DELIVERY', 'DELIVERY DATE', 'REQUESTED DELIVERY DATE'], field: 'requestedDelivery' },
  { keys: ['DELIVERY NOTES', 'NOTES', 'NOTE'], field: 'deliveryNotes' },
];

function cleanValue(v: string): string {
  return v.replace(/^[:\-–—\s]+/, '').replace(/\s+$/, '').trim();
}

/** Parse one item line. Supports:
 *  "2 x MODEL ABC  RR# 12345  150 lbs"
 *  "2 | MODEL ABC | 12345 | 150 lbs"
 *  "2, MODEL ABC, 12345, 150 lbs"
 */
export function parseItemLine(line: string): BolItem | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const bySep = trimmed.split(/\s*[|,;]\s*/);
  if (bySep.length >= 3) {
    const qty = parseInt(bySep[0], 10);
    if (Number.isFinite(qty) && qty > 0) {
      return {
        quantity: qty,
        modelDescription: bySep[1] || '',
        rrNumber: (bySep[2] || '').replace(/^RR\s*#?\s*/i, ''),
        weight: bySep[3] || '',
      };
    }
  }
  const m = trimmed.match(
    /^(\d+)\s*(?:x|\*|pcs?)?\s+(.+?)(?:\s+RR\s*#?\s*([A-Za-z0-9\-]+))?(?:\s+(\d+(?:\.\d+)?\s*(?:lbs?|kg)?))?\s*$/i,
  );
  if (m) {
    return {
      quantity: parseInt(m[1], 10),
      modelDescription: (m[2] || '').trim(),
      rrNumber: m[3] || '',
      weight: m[4] || '',
    };
  }
  return null;
}

export function parseEmailToBol(
  raw: string,
  template: BolDocument['template'] = 'warehouse',
): Partial<BolDocument> {
  const result: Partial<BolDocument> = { template, items: [] };
  const items: BolItem[] = [];
  const lines = raw.split(/\r?\n/);
  let inItemsSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const upper = line.toUpperCase();

    if (/^(ITEMS?|LINES?|PRODUCTS?|QTY|QUANTITY)\b/.test(upper)) {
      inItemsSection = true;
      continue;
    }

    // Date: "DATE: 2026-11-06" or "DATE: Nov 6, 2026"
    const dateMatch = line.match(/^DATE\s*[:\-]\s*(.+)$/i);
    if (dateMatch) {
      const parsed = new Date(dateMatch[1].trim());
      if (!Number.isNaN(parsed.getTime())) {
        result.date = parsed.toISOString().slice(0, 10);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateMatch[1].trim())) {
        result.date = dateMatch[1].trim();
      }
      continue;
    }

    let matchedField = false;
    for (const { keys, field } of FIELD_PATTERNS) {
      for (const key of keys) {
        if (upper.startsWith(key)) {
          const value = cleanValue(line.slice(key.length));
          if (value) (result as Record<string, unknown>)[field] = value;
          matchedField = true;
          break;
        }
      }
      if (matchedField) break;
    }
    if (matchedField) continue;

    if (inItemsSection || /^\d+\s/.test(line)) {
      const item = parseItemLine(line);
      if (item && item.modelDescription) items.push(item);
    }
  }

  if (items.length > 0) result.items = items;
  return result;
}
