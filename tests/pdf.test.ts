import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateBolPdf } from '../src/shared/pdf';
import type { BolDocument } from '../src/shared/types';

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
