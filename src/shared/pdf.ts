// BOL PDF generation with pdf-lib. Electron-free so it can be unit-tested
// and run from plain Node (test PDF script). No clipped content: rows paginate.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { BolDocument, PrintSettings } from './types';
import { getTemplate } from './templates';

export interface PdfOptions {
  paperSize?: 'Letter' | 'A4';
  orientation?: 'portrait' | 'landscape';
  marginsMm?: { top: number; right: number; bottom: number; left: number };
  brandName?: string;
  companyName?: string;
  companyAddress?: string;
}

const MM = 72 / 25.4;
const PAPER = {
  Letter: { w: 612, h: 792 },
  A4: { w: 595.28, h: 841.89 },
};

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      // Long single word: hard-split it.
      let rest = w;
      while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
        let cut = rest.length;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      cur = rest;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

export async function generateBolPdf(
  doc: BolDocument,
  opts: PdfOptions = {},
): Promise<Uint8Array> {
  const paper = PAPER[opts.paperSize ?? 'Letter'];
  const landscape = (opts.orientation ?? 'portrait') === 'landscape';
  const pageW = landscape ? paper.h : paper.w;
  const pageH = landscape ? paper.w : paper.h;
  const m = opts.marginsMm ?? { top: 12, right: 12, bottom: 12, left: 12 };
  const margin = {
    top: m.top * MM,
    right: m.right * MM,
    bottom: m.bottom * MM,
    left: m.left * MM,
  };
  const contentW = pageW - margin.left - margin.right;
  const template = getTemplate(doc.template);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`BOL ${doc.bolNumber} — ${template.name}`);
  pdf.setSubject(`Bill of Lading ${doc.bolNumber}`);
  pdf.setKeywords(['BOL', 'Bill of Lading', doc.bolNumber, template.name]);
  pdf.setCreator(opts.brandName ?? 'Logistics Studio');

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  const dark = rgb(0.15, 0.15, 0.15);
  const grey = rgb(0.45, 0.45, 0.45);
  const lineGrey = rgb(0.7, 0.7, 0.7);

  let page: PDFPage = pdf.addPage([pageW, pageH]);
  let y = pageH - margin.top;

  const newPage = () => {
    page = pdf.addPage([pageW, pageH]);
    y = pageH - margin.top;
  };
  const ensure = (needed: number) => {
    if (y - needed < margin.bottom) newPage();
  };

  const drawText = (text: string, x: number, yy: number, size: number, f: PDFFont = font, color = black) => {
    page.drawText(text, { x, y: yy, size, font: f, color });
  };

  // ---- Header ----
  drawText((opts.brandName ?? 'Logistics Studio').toUpperCase(), margin.left, y, 16, bold);
  y -= 20;
  drawText(`BILL OF LADING — ${template.name.toUpperCase()}`, margin.left, y, 12, bold);
  y -= 16;
  if (opts.companyName) {
    drawText(opts.companyName, margin.left, y, 10, font, dark);
    y -= 13;
  }
  if (opts.companyAddress) {
    drawText(opts.companyAddress, margin.left, y, 10, font, dark);
    y -= 13;
  }
  page.drawLine({ start: { x: margin.left, y: y + 4 }, end: { x: pageW - margin.right, y: y + 4 }, thickness: 1, color: black });
  y -= 10;

  // ---- Header fields (two columns) ----
  const fields: Array<[string, string]> = [
    ['BOL NUMBER', doc.bolNumber],
    ['DATE', doc.date],
    ['JOB #', doc.jobNumber],
    ['SHIP FROM', doc.shipFrom],
    ['DELIVERY ADDRESS', doc.deliveryAddress],
    ['REQUEST BY', doc.requestBy],
    ['TRUCK/TRAILER', doc.truckTrailer],
    ['THIRD PARTY FREIGHT CHARGES BILL TO', doc.billTo],
    ['REQUESTED DELIVERY', doc.requestedDelivery],
    ['DELIVERY NOTES', doc.deliveryNotes],
  ];
  const labelW = 190;
  for (const [label, value] of fields) {
    const lines = wrapText(value || '—', font, 10, contentW - labelW);
    const blockH = lines.length * 13 + 4;
    ensure(blockH);
    drawText(label, margin.left, y, 9, bold, grey);
    lines.forEach((ln, i) => drawText(ln, margin.left + labelW, y - i * 13, 10));
    y -= blockH;
  }
  y -= 6;

  // ---- Items table ----
  const cols = template.hasWarehouseChecks
    ? [
        { label: 'QTY', w: 40 },
        { label: 'MODEL/DESCRIPTION', w: contentW - 40 - 90 - 70 - 3 * 52 },
        { label: 'RR #', w: 90 },
        { label: 'WEIGHT', w: 70 },
        { label: 'FOUND', w: 52 },
        { label: 'PICKED', w: 52 },
        { label: 'LOADED', w: 52 },
      ]
    : [
        { label: 'QUANTITY', w: 70 },
        { label: 'MODEL/DESCRIPTION', w: contentW - 70 - 110 - 90 },
        { label: 'RR #', w: 110 },
        { label: 'WEIGHT', w: 90 },
      ];
  const rowH = 18;
  const drawHeaderRow = () => {
    ensure(rowH + 4);
    let x = margin.left;
    page.drawRectangle({ x: margin.left, y: y - rowH + 6, width: contentW, height: rowH, color: rgb(0.92, 0.92, 0.92) });
    for (const c of cols) {
      drawText(c.label, x + 4, y - 6, 8, bold);
      x += c.w;
    }
    y -= rowH;
  };
  drawHeaderRow();

  for (const item of doc.items) {
    const descLines = wrapText(item.modelDescription || '', font, 10, cols[1].w - 8);
    const needed = Math.max(rowH, descLines.length * 13 + 6);
    ensure(needed + 4);
    let x = margin.left;
    const top = y;
    // Row separator
    page.drawLine({ start: { x: margin.left, y: y + 4 }, end: { x: pageW - margin.right, y: y + 4 }, thickness: 0.5, color: lineGrey });
    drawText(String(item.quantity), x + 4, y - 8, 10);
    x += cols[0].w;
    descLines.forEach((ln, i) => drawText(ln, x + 4, y - 8 - i * 13, 10));
    x += cols[1].w;
    drawText(item.rrNumber || '', x + 4, y - 8, 10);
    x += cols[2].w;
    drawText(item.weight || '', x + 4, y - 8, 10);
    x += cols[3].w;
    if (template.hasWarehouseChecks) {
      const checks: Array<boolean | undefined> = [item.found, item.picked, item.loaded];
      for (const checked of checks) {
        const bx = x + 16;
        const by = top - 14;
        page.drawRectangle({ x: bx, y: by, width: 12, height: 12, borderColor: black, borderWidth: 1 });
        if (checked) {
          page.drawLine({ start: { x: bx + 2, y: by + 2 }, end: { x: bx + 10, y: by + 10 }, thickness: 1.5, color: black });
          page.drawLine({ start: { x: bx + 10, y: by + 2 }, end: { x: bx + 2, y: by + 10 }, thickness: 1.5, color: black });
        }
        x += 52;
      }
    }
    y -= needed;
  }

  // ---- Signatures ----
  y -= 14;
  ensure(90);
  page.drawLine({ start: { x: margin.left, y: y + 8 }, end: { x: pageW - margin.right, y: y + 8 }, thickness: 1, color: black });
  if (template.hasInternalSignatures) {
    drawText('INTERNAL SIGNATURES', margin.left, y - 6, 10, bold);
    y -= 26;
    const sigs: Array<[string, string]> = [
      ['FOUND BY', doc.foundBy ?? ''],
      ['CHECKED BY', doc.checkedBy ?? ''],
      ['LOADED BY', doc.loadedBy ?? ''],
    ];
    for (const [label, value] of sigs) {
      ensure(30);
      drawText(label, margin.left, y, 9, bold, grey);
      if (value) drawText(value, margin.left + 110, y, 10);
      page.drawLine({ start: { x: margin.left + 110, y: y - 6 }, end: { x: margin.left + 320, y: y - 6 }, thickness: 0.75, color: black });
      y -= 28;
    }
  } else if (template.hasDeliveryReceipt) {
    drawText('RECEIVER / DELIVERY RECEIPT', margin.left, y - 6, 10, bold);
    y -= 26;
    const sigs: Array<[string, string]> = [
      ['RECEIVER PRINTED NAME', doc.receiverName ?? ''],
      ['DATE', doc.receiverDate ?? ''],
      ['DRIVER SIGNATURE', doc.driverSignature ?? ''],
    ];
    for (const [label, value] of sigs) {
      ensure(30);
      drawText(label, margin.left, y, 9, bold, grey);
      if (value) drawText(value, margin.left + 170, y, 10);
      page.drawLine({ start: { x: margin.left + 170, y: y - 6 }, end: { x: margin.left + 380, y: y - 6 }, thickness: 0.75, color: black });
      y -= 28;
    }
  }

  // ---- Footer with page numbers ----
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(`BOL ${doc.bolNumber}  •  Page ${i + 1} of ${pages.length}`, {
      x: margin.left,
      y: margin.bottom - 12,
      size: 8,
      font,
      color: grey,
    });
  });

  return pdf.save({ useObjectStreams: false });
}

export function defaultPrintSettings(): PrintSettings {
  return {
    paperSize: 'Letter',
    orientation: 'portrait',
    copies: 1,
    silent: false,
    marginsMm: { top: 12, right: 12, bottom: 12, left: 12 },
    labelFormat: 'none',
  };
}
