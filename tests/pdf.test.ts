import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { generateBolPdf } from '../src/shared/pdf';
import type { BolDocument } from '../src/shared/types';

/** Extract the drawn text of a generated PDF by inflating its content
 *  streams. pdf-lib writes literal strings, so labels and values are
 *  searchable here without a PDF text-extraction dependency. */
function pdfText(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  const parts: string[] = [];
  let idx = 0;
  const streamMarker = Buffer.from('stream');
  const endMarker = Buffer.from('endstream');
  for (;;) {
    const s = buf.indexOf(streamMarker, idx);
    if (s === -1) break;
    let start = s + streamMarker.length;
    if (buf[start] === 0x0d && buf[start + 1] === 0x0a) start += 2;
    else if (buf[start] === 0x0a || buf[start] === 0x0d) start += 1;
    const e = buf.indexOf(endMarker, start);
    if (e === -1) break;
    try {
      parts.push(inflateSync(buf.subarray(start, e)).toString('latin1'));
    } catch {
      parts.push(buf.subarray(start, e).toString('latin1'));
    }
    idx = e + endMarker.length;
  }
  // pdf-lib writes drawn text as hex strings (<42494C4C...>), so decode
  // those back to readable text; literal (...) strings pass through.
  return parts.join('\n').replace(/<([0-9A-Fa-f\s]+)>/g, (_m, hex: string) => {
    try {
      return Buffer.from(hex.replace(/\s+/g, ''), 'hex').toString('latin1');
    } catch {
      return _m;
    }
  });
}

const BAY_CRANE_OPTS = {
  paperSize: 'Letter' as const,
  orientation: 'portrait' as const,
  brandName: 'Logistics Studio',
  companyName: 'Bay Crane Mid-Atlantic LLC',
  companyAddress: '51 Ritchie Road, Capitol Heights, MD 20743',
  companyPhone: '(202) 529-6100',
  companyWebsite: 'baycrane-ma.com',
};

function warehouseBol(): BolDocument {
  return {
    bolNumber: 'BOL-00042',
    template: 'warehouse',
    date: '2026-11-06',
    jobNumber: '8812',
    shipFrom: 'Warehouse A, Bay 3',
    deliveryAddress: '123 Main St, Baltimore, MD',
    requestBy: 'Jane Doe',
    truckTrailer: 'TRK-114 / TRL-88',
    billTo: 'Acme Corp',
    requestedDelivery: '2026-11-07 morning',
    deliveryNotes: 'Call on arrival.',
    items: [
      { quantity: 2, modelDescription: 'CRANE HOOK 5T', rrNumber: '9912', weight: '150 lbs', found: true, picked: true, loaded: false },
      { quantity: 1, modelDescription: 'STEEL BEAM 20FT', rrNumber: '9913', weight: '1200 lbs', found: true, picked: false, loaded: false },
    ],
    foundBy: 'Mike',
    checkedBy: 'Sara',
    loadedBy: '',
  };
}

function deliveryBol(): BolDocument {
  return {
    ...warehouseBol(),
    bolNumber: 'BOL-00043',
    template: 'delivery',
    foundBy: '',
    checkedBy: '',
    loadedBy: '',
    receiverName: 'John Receiver',
    receiverDate: '2026-11-07',
    driverSignature: 'Driver Dan',
    items: [{ quantity: 3, modelDescription: 'PALLET JACK', rrNumber: '9914', weight: '90 lbs' }],
  };
}

describe('generateBolPdf', () => {
  it('generates a non-empty Warehouse BOL PDF, Letter, >= 1 page, titled with the BOL number', async () => {
    const bytes = await generateBolPdf(warehouseBol(), { paperSize: 'Letter', orientation: 'portrait' });
    expect(bytes.length).toBeGreaterThan(1000);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(loaded.getTitle()).toContain('BOL-00042');
    const size = loaded.getPage(0).getSize();
    expect(size.width).toBeCloseTo(612, 0);
    expect(size.height).toBeCloseTo(792, 0);
  });

  it('generates a non-empty Delivery BOL PDF, Letter, >= 1 page, titled with the BOL number', async () => {
    const bytes = await generateBolPdf(deliveryBol(), { paperSize: 'Letter', orientation: 'portrait' });
    expect(bytes.length).toBeGreaterThan(1000);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(loaded.getTitle()).toContain('BOL-00043');
    const size = loaded.getPage(0).getSize();
    expect(size.width).toBeCloseTo(612, 0);
    expect(size.height).toBeCloseTo(792, 0);
  });

  it('Delivery PDF (official template) contains the footer disclaimer, is Letter-sized and 1 page', async () => {
    const bytes = await generateBolPdf(deliveryBol(), BAY_CRANE_OPTS);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
    const size = loaded.getPage(0).getSize();
    expect(size.width).toBeCloseTo(612, 0);
    expect(size.height).toBeCloseTo(792, 0);
    const text = pdfText(bytes);
    expect(text).toContain('ALL EQUIPMENT MUST BE INSPECTED AND ANY CONCERNS');
    expect(text).toContain('MUST BE REPORTED UPON DELIVERY.');
    expect(text).toContain('RECEIVER PRINTED NAME');
    expect(text).toContain('DRIVER SIGNATURE');
    expect(text).toContain('BILL OF LADING');
    expect(text).toContain('QUANTITY');
    expect(text).toContain('MODEL / DESCRIPTION');
    expect(text).toContain('RR #');
    expect(text).toContain('REQUESTED DELIVERY');
    expect(text).toContain('DELIVERY NOTES');
    expect(text).toContain('THIRD PARTY FREIGHT CHARGES BILL TO:');
  });

  it('Warehouse PDF contains the internal signature labels and FOUND/PICKED/LOADED columns', async () => {
    const bytes = await generateBolPdf(warehouseBol(), BAY_CRANE_OPTS);
    const text = pdfText(bytes);
    expect(text).toContain('FOUND BY');
    expect(text).toContain('CHECKED BY');
    expect(text).toContain('LOADED BY');
    expect(text).toContain('FOUND');
    expect(text).toContain('PICKED');
    expect(text).toContain('LOADED');
    expect(text).not.toContain('RECEIVER PRINTED NAME');
    expect(text).not.toContain('DRIVER SIGNATURE');
    expect(text).toContain('ALL EQUIPMENT MUST BE INSPECTED AND ANY CONCERNS');
  });

  it('the header and SHIP FROM blocks are driven by company settings, not hard-coded', async () => {
    // Default company (Bay Crane) in the logo block and SHIP FROM fallback.
    const withDefault = await generateBolPdf({ ...deliveryBol(), shipFrom: '' }, BAY_CRANE_OPTS);
    const defaultText = pdfText(withDefault);
    expect(defaultText).toContain('BAY CRANE');
    expect(defaultText).toContain('M I D - A T L A N T I C');
    expect(defaultText).toContain('51 Ritchie Road');
    expect(defaultText).toContain('baycrane-ma.com');
    // A different company changes both blocks; no Bay Crane text remains.
    const acme = await generateBolPdf(
      { ...deliveryBol(), shipFrom: '' },
      { ...BAY_CRANE_OPTS, companyName: 'Acme Logistics LLC', companyAddress: '9 Industrial Pkwy, Cleveland, OH 44101', companyPhone: '(216) 555-0100', companyWebsite: 'acme.example' },
    );
    const acmeText = pdfText(acme);
    // Logo splits the name across its two lines: "ACME" big, the rest
    // letterspaced on the second line ("L O G I S T I C S").
    expect(acmeText).toContain('ACME');
    expect(acmeText).toContain('L O G I S T I C S');
    expect(acmeText).toContain('9 Industrial Pkwy');
    expect(acmeText).toContain('acme.example');
    expect(acmeText).not.toContain('BAY CRANE');
    expect(acmeText).not.toContain('Ritchie Road');
    // An explicit SHIP FROM on the BOL wins over the company default.
    const explicit = await generateBolPdf(deliveryBol(), BAY_CRANE_OPTS);
    expect(pdfText(explicit)).toContain('Warehouse A, Bay 3');
  });

  it('supports A4 landscape and paginates long item lists without clipping', async () => {
    const many: BolDocument = {
      ...warehouseBol(),
      items: Array.from({ length: 60 }, (_, i) => ({
        quantity: 1,
        modelDescription: `ITEM ${i + 1} — long description to test wrapping and pagination`,
        rrNumber: `RR-${1000 + i}`,
        weight: '10 lbs',
      })),
    };
    const bytes = await generateBolPdf(many, { paperSize: 'A4', orientation: 'landscape' });
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThan(1);
    const size = loaded.getPage(0).getSize();
    expect(size.width).toBeCloseTo(841.89, 0);
    expect(size.height).toBeCloseTo(595.28, 0);
  });
});
