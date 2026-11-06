// Generate the two real test PDFs (Warehouse + Delivery) from the compiled
// PDF module and verify them with pdf-lib: page count, page size, title.
// Usage (after `npm run build`):  node scripts/generate-test-pdfs.mjs
// Output: docs/warehouse-bol-test.pdf, docs/delivery-bol-test.pdf
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const { generateBolPdf } = await import(path.join(root, 'dist', 'shared', 'pdf.js'));
const { PDFDocument } = await import('pdf-lib');

const warehouse = {
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

const delivery = {
  ...warehouse,
  bolNumber: 'BOL-00043',
  template: 'delivery',
  // Blank SHIP FROM: the PDF falls back to the default company block
  // (Bay Crane Mid-Atlantic LLC, 51 Ritchie Road, ...) from settings.
  shipFrom: '',
  foundBy: '',
  checkedBy: '',
  loadedBy: '',
  receiverName: 'John Receiver',
  receiverDate: '2026-11-07',
  driverSignature: 'Driver Dan',
  items: [{ quantity: 3, modelDescription: 'PALLET JACK', rrNumber: '9914', weight: '90 lbs' }],
};

fs.mkdirSync(path.join(root, 'docs'), { recursive: true });

for (const [doc, name] of [
  [warehouse, 'warehouse-bol-test.pdf'],
  [delivery, 'delivery-bol-test.pdf'],
]) {
  const bytes = await generateBolPdf(doc, {
    paperSize: 'Letter', orientation: 'portrait', brandName: 'Logistics Studio',
    companyName: 'Bay Crane Mid-Atlantic LLC',
    companyAddress: '51 Ritchie Road, Capitol Heights, MD 20743',
    companyPhone: '(202) 529-6100',
    companyWebsite: 'baycrane-ma.com',
  });
  const outPath = path.join(root, 'docs', name);
  fs.writeFileSync(outPath, bytes);
  const loaded = await PDFDocument.load(bytes);
  const size = loaded.getPage(0).getSize();
  console.log(`${name}: ${bytes.length} bytes, ${loaded.getPageCount()} page(s), ${size.width.toFixed(2)}x${size.height.toFixed(2)} pt (Letter), title="${loaded.getTitle()}" -> ${outPath}`);
}
console.log('Done.');
