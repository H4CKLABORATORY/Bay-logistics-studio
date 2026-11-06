// BOL PDF generation with pdf-lib. Electron-free so it can be unit-tested
// and run from plain Node (test PDF script).
//
// Layout replicates the official blank Delivery template
// (docs/official-bol-template.pdf — "Bay Crane Mid-Atlantic | Bill of
// Lading | Blank Delivery Template", Letter 612x792, ReportLab). The
// geometry and colours below were measured from that file's content stream:
// title, maroon logo block, 3-column header grid, SHIP FROM / DELIVERY
// ADDRESS, REQUEST BY / TRUCK-TRAILER, BILL TO, pink REQUESTED DELIVERY /
// DELIVERY NOTES row, 20-row items table, receiver/date + driver signature
// lines, maroon footer disclaimer. The Warehouse template keeps the same
// header/table layout with FOUND/PICKED/LOADED columns and internal
// FOUND BY / CHECKED BY / LOADED BY signatures instead of the receiver block.
//
// BRAND RULE: nothing about the company is hard-coded here. The logo block
// and the SHIP FROM block are drawn from PdfOptions (companyName /
// companyAddress / companyPhone / companyWebsite), which the main process
// fills from the configurable company settings. The Bay Crane values are
// only the DEFAULT company settings (see DEFAULT_SETTINGS in types.ts).
// Changing company settings changes the header and SHIP FROM blocks.
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
  companyPhone?: string;
  companyWebsite?: string;
}

export const BOL_FOOTER_DISCLAIMER =
  'ALL EQUIPMENT MUST BE INSPECTED AND ANY CONCERNS MUST BE REPORTED UPON DELIVERY.';

const MM = 72 / 25.4;
const PAPER = {
  Letter: { w: 612, h: 792 },
  A4: { w: 595.28, h: 841.89 },
};

// Colours measured from the official template's content stream.
const MAROON = rgb(0.52549, 0.192157, 0.223529); // logo block, driver line
const MAROON_DARK = rgb(0.458824, 0.141176, 0.176471); // pink-row headers, footer
const PINK_BG = rgb(0.972549, 0.945098, 0.945098); // requested-delivery row
const GREY_BG = rgb(0.945098, 0.945098, 0.945098); // header + table-header rows
const GRID = rgb(0.639216, 0.65098, 0.666667); // cell borders
const DARK = rgb(0.117647, 0.117647, 0.117647); // label text
const MID_GREY = rgb(0.4, 0.4, 0.4); // value underlines, website line
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);

/** Official table: 20 body rows (header + 20 rows fills y 456 → 129). */
export const BOL_TABLE_ROWS_PER_PAGE = 20;
const ROW_H = 16.35;

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

/** "51 Ritchie Road, Capitol Heights, MD 20743" → two display lines. */
function splitAddressLines(address: string): string[] {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return parts;
  return [parts[0], parts.slice(1).join(', ')];
}

function letterspace(s: string): string {
  return s.split('').join(' ');
}

export async function generateBolPdf(
  doc: BolDocument,
  opts: PdfOptions = {},
): Promise<Uint8Array> {
  const paper = PAPER[opts.paperSize ?? 'Letter'];
  const landscape = (opts.orientation ?? 'portrait') === 'landscape';
  const pageW = landscape ? paper.h : paper.w;
  const pageH = landscape ? paper.w : paper.h;
  // The official form is drawn in Letter points; scale it to the target page.
  const sx = pageW / 612;
  const sy = pageH / 792;
  const fs = Math.min(sx, sy); // font scale
  const template = getTemplate(doc.template);
  const isWarehouse = template.hasWarehouseChecks;

  const pdf = await PDFDocument.create();
  pdf.setTitle(`BOL ${doc.bolNumber} — ${template.name}`);
  pdf.setSubject(`Bill of Lading ${doc.bolNumber}`);
  pdf.setKeywords(['BOL', 'Bill of Lading', doc.bolNumber, template.name]);
  pdf.setCreator(opts.brandName ?? 'Logistics Studio');

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // ---- Company data (settings-driven; Bay Crane values are only defaults) ----
  const companyName = (opts.companyName ?? '').trim();
  const companyAddress = (opts.companyAddress ?? '').trim();
  const companyPhone = (opts.companyPhone ?? '').trim();
  const companyWebsite = (opts.companyWebsite ?? '').trim();
  // SHIP FROM: the BOL's own value when given, else the company block.
  const shipFromLines: string[] = doc.shipFrom && doc.shipFrom.trim()
    ? wrapText(doc.shipFrom, font, 9, 250)
    : [
        ...(companyName ? [companyName] : []),
        ...splitAddressLines(companyAddress),
        ...(companyPhone ? [companyPhone] : []),
        ...(companyWebsite ? [companyWebsite] : []),
      ];

  // Logo block lines: company name minus a legal suffix, split so the first
  // line fits the block at 30 pt; the rest goes on the spaced second line.
  // "Bay Crane Mid-Atlantic LLC" → "BAY CRANE" / "MID-ATLANTIC".
  const logoName = (companyName || opts.brandName || 'Logistics Studio').replace(/\s+(LLC|Inc\.?|Corp\.?|Co\.?|LLP|Ltd\.?)$/i, '').trim();
  const logoWords = logoName ? logoName.toUpperCase().split(/\s+/) : ['BILL OF LADING'];
  let logoLine1 = logoWords[0];
  let logoLine2 = '';
  {
    let i = 1;
    while (i < logoWords.length && bold.widthOfTextAtSize(`${logoLine1} ${logoWords[i]}`, 30) <= 200) {
      logoLine1 += ` ${logoWords[i]}`;
      i++;
    }
    logoLine2 = logoWords.slice(i).join(' ');
  }

  // ---- Per-page drawing helpers (Letter coordinates, scaled) ----
  let page: PDFPage = pdf.addPage([pageW, pageH]);
  const X = (x: number) => x * sx;
  const Y = (y: number) => y * sy;
  const W = (w: number) => w * sx;
  const H = (h: number) => h * sy;
  const S = (s: number) => s * fs;
  const text = (t: string, x: number, y: number, size: number, f: PDFFont = font, color = DARK) => {
    if (t) page.drawText(t, { x: X(x), y: Y(y), size: S(size), font: f, color });
  };
  const centered = (t: string, cx: number, y: number, size: number, f: PDFFont = font, color = DARK) => {
    const w = f.widthOfTextAtSize(t, size) * fs;
    page.drawText(t, { x: X(cx) - w / 2, y: Y(y), size: S(size), font: f, color });
  };
  const rect = (x: number, y: number, w: number, h: number, color?: ReturnType<typeof rgb>, border = false) => {
    page.drawRectangle({ x: X(x), y: Y(y), width: W(w), height: H(h), color, borderColor: border ? GRID : undefined, borderWidth: border ? 0.6 * fs : undefined });
  };
  const hline = (x1: number, x2: number, y: number, color = GRID, width = 0.6) => {
    page.drawLine({ start: { x: X(x1), y: Y(y) }, end: { x: X(x2), y: Y(y) }, thickness: width * fs, color });
  };
  const vline = (x: number, y1: number, y2: number, color = GRID, width = 0.6) => {
    page.drawLine({ start: { x: X(x), y: Y(y1) }, end: { x: X(x), y: Y(y2) }, thickness: width * fs, color });
  };

  const drawHeader = () => {
    const titleW = bold.widthOfTextAtSize('BILL OF LADING', 15);
    page.drawText('BILL OF LADING', { x: X(306) - (titleW * fs) / 2, y: Y(768), size: S(15), font: bold, color: DARK });
    // Logo block: maroon rectangle with two white rules.
    rect(174, 699, 264, 54, MAROON);
    hline(186, 426, 744, WHITE, 0.65);
    hline(186, 426, 715, WHITE, 0.65);
    centered(logoLine1, 306, 721, 30, bold, WHITE);
    if (logoLine2) centered(letterspace(logoLine2), 306, 703, 9, bold, WHITE);

    // Row 1 — BOL NUMBER | DATE | JOB # (grey band, labels + value lines).
    rect(36, 668, 540, 25, GREY_BG);
    vline(272, 668, 693);
    vline(402, 668, 693);
    text('BOL NUMBER', 43, 678, 8, bold);
    text('DATE', 280, 678, 8, bold);
    text('JOB #', 410, 678, 8, bold);
    text(doc.bolNumber, 133, 678, 10, bold);
    text(doc.date, 316, 678, 10);
    text(doc.jobNumber, 455, 678, 10);
    hline(133, 265, 676, MID_GREY, 0.7);
    hline(316, 390, 676, MID_GREY, 0.7);
    hline(455, 567, 676, MID_GREY, 0.7);

    // Row 2 — SHIP FROM | DELIVERY ADDRESS.
    rect(36, 570, 540, 98, undefined, true);
    vline(306, 570, 668);
    hline(36, 576, 649);
    text('SHIP FROM', 43, 655, 9, bold);
    text('DELIVERY ADDRESS', 313, 655, 9, bold);
    shipFromLines.forEach((ln, i) => {
      const yy = 632 - i * 15;
      if (i === 0 && !doc.shipFrom?.trim()) text(ln, 43, yy, 9.4, bold, MAROON);
      else if (i === shipFromLines.length - 1 && !doc.shipFrom?.trim() && companyWebsite && ln === companyWebsite) text(ln, 43, yy, 8, font, MID_GREY);
      else text(ln, 43, yy, 8.5);
    });
    const addrLines = wrapText(doc.deliveryAddress, font, 9, 250);
    addrLines.slice(0, 5).forEach((ln, i) => text(ln, 313, 632 - i * 15, 9));

    // Row 3 — REQUEST BY | TRUCK / TRAILER.
    rect(36, 545, 540, 25, undefined, true);
    vline(306, 545, 570);
    text('REQUEST BY', 43, 556, 8, bold);
    text('TRUCK / TRAILER:', 313, 556, 8, bold);
    text(doc.requestBy, 134, 556, 10);
    text(doc.truckTrailer, 438, 556, 10);
    hline(134, 297, 554, MID_GREY, 0.7);
    hline(438, 567, 554, MID_GREY, 0.7);

    // Row 4 — THIRD PARTY FREIGHT CHARGES BILL TO (full width).
    rect(36, 523, 540, 22, undefined, true);
    text('THIRD PARTY FREIGHT CHARGES BILL TO:', 43, 531, 8, bold);
    text(doc.billTo, 266, 534, 10);
    hline(266, 567, 532, MID_GREY, 0.65);

    // Row 5 — REQUESTED DELIVERY DATE & TIME | DELIVERY NOTES (pink, maroon headers).
    rect(36, 487, 540, 36, PINK_BG);
    vline(306, 487, 523);
    text('REQUESTED DELIVERY', 43, 507, 7.8, bold, MAROON_DARK);
    text('DATE & TIME:', 43, 498, 8, bold);
    text('DELIVERY NOTES', 313, 507, 7.8, bold, MAROON_DARK);
    const reqLines = wrapText(doc.requestedDelivery, font, 9, 160);
    if (reqLines[0]) text(reqLines[0], 128, 500, 9);
    hline(125, 289, 496, MID_GREY, 0.7);
    const noteLines = wrapText(doc.deliveryNotes, font, 9, 250);
    noteLines.slice(0, 2).forEach((ln, i) => text(ln, 313, 500 - i * 11, 9));
    hline(313, 568, 495, MID_GREY, 0.7);
  };

  // Table columns: official x-positions (Letter points).
  const cols = isWarehouse
    ? [
        { label: 'QUANTITY', x: 36, w: 56 },
        { label: 'MODEL / DESCRIPTION', x: 92, w: 238 },
        { label: 'RR #', x: 330, w: 70 },
        { label: 'WEIGHT', x: 400, w: 52 },
        { label: 'FOUND', x: 452, w: 42 },
        { label: 'PICKED', x: 494, w: 42 },
        { label: 'LOADED', x: 536, w: 40 },
      ]
    : [
        { label: 'QUANTITY', x: 36, w: 76 },
        { label: 'MODEL / DESCRIPTION', x: 112, w: 276 },
        { label: 'RR #', x: 388, w: 94 },
        { label: 'WEIGHT', x: 482, w: 94 },
      ];
  const tableTop = 481; // bottom of the header row (header spans 456–481)
  const drawTableHeader = (top: number) => {
    rect(36, top - 25, 540, 25, GREY_BG);
    for (let i = 1; i < cols.length; i++) vline(cols[i].x, top - 25, top);
    const labelX = isWarehouse ? [48, 100, 340, 408, 458, 500, 542] : [52.79, 121, 425.545, 512.402];
    cols.forEach((c, i) => text(c.label, labelX[i], top - 16, isWarehouse ? 8 : 8.3, bold));
  };
  const drawTableRow = (item: BolDocument['items'][number], top: number) => {
    rect(36, top - ROW_H, 540, ROW_H, undefined, true);
    for (let i = 1; i < cols.length; i++) vline(cols[i].x, top - ROW_H, top, GRID, 0.5);
    const baseline = top - 11;
    text(String(item.quantity), cols[0].x + 6, baseline, 10);
    const descLines = wrapText(item.modelDescription || '', font, 10, cols[1].w - 10);
    if (descLines[0]) text(descLines[0], cols[1].x + 6, baseline, 10);
    text(item.rrNumber || '', cols[2].x + 6, baseline, 10);
    text(item.weight || '', cols[3].x + 6, baseline, 10);
    if (isWarehouse) {
      const checks: Array<boolean | undefined> = [item.found, item.picked, item.loaded];
      checks.forEach((checked, i) => {
        const cx = cols[4 + i].x + cols[4 + i].w / 2;
        const bx = cx - 5.5;
        const by = top - 13.5;
        page.drawRectangle({ x: X(bx), y: Y(by), width: W(11), height: H(11), borderColor: BLACK, borderWidth: 1 * fs });
        if (checked) {
          page.drawLine({ start: { x: X(bx + 2), y: Y(by + 2) }, end: { x: X(bx + 9), y: Y(by + 9) }, thickness: 1.5 * fs, color: BLACK });
          page.drawLine({ start: { x: X(bx + 9), y: Y(by + 2) }, end: { x: X(bx + 2), y: Y(by + 9) }, thickness: 1.5 * fs, color: BLACK });
        }
      });
    }
  };

  const drawSignaturesAndFooter = () => {
    if (template.hasInternalSignatures) {
      // FOUND BY | CHECKED BY side by side; LOADED BY below in maroon.
      hline(48, 266, 91, MID_GREY, 0.7);
      hline(340, 565, 91, MID_GREY, 0.7);
      text('FOUND BY', 48, 78, 8, bold, MID_GREY);
      text('CHECKED BY', 340, 78, 8, bold, MID_GREY);
      if (doc.foundBy) text(doc.foundBy, 48, 95, 10);
      if (doc.checkedBy) text(doc.checkedBy, 340, 95, 10);
      hline(48, 266, 55, MAROON, 0.7);
      text('LOADED BY', 48, 42, 8, bold, MAROON);
      if (doc.loadedBy) text(doc.loadedBy, 48, 59, 10);
    } else if (template.hasDeliveryReceipt) {
      // RECEIVER PRINTED NAME | DATE side by side; DRIVER SIGNATURE below in maroon.
      hline(48, 266, 91, MID_GREY, 0.7);
      hline(340, 565, 91, MID_GREY, 0.7);
      text('RECEIVER PRINTED NAME', 48, 78, 8, bold, MID_GREY);
      text('DATE', 340, 78, 8, bold, MID_GREY);
      if (doc.receiverName) text(doc.receiverName, 48, 95, 10);
      if (doc.receiverDate) text(doc.receiverDate, 340, 95, 10);
      hline(48, 266, 55, MAROON, 0.7);
      text('DRIVER SIGNATURE', 48, 42, 8, bold, MAROON);
      if (doc.driverSignature) text(doc.driverSignature, 48, 59, 10);
    }
    // Footer disclaimer, maroon, centered, two lines (as in the official form).
    const l1 = 'ALL EQUIPMENT MUST BE INSPECTED AND ANY CONCERNS';
    const l2 = 'MUST BE REPORTED UPON DELIVERY.';
    centered(l1, 306, 25, 7.8, bold, MAROON_DARK);
    centered(l2, 306, 14, 7.8, bold, MAROON_DARK);
  };

  // ---- Pages: 20 table rows per page; header on page 1, signatures on last. ----
  const chunks: Array<Array<BolDocument['items'][number]>> = [];
  for (let i = 0; i < doc.items.length; i += BOL_TABLE_ROWS_PER_PAGE) {
    chunks.push(doc.items.slice(i, i + BOL_TABLE_ROWS_PER_PAGE));
  }
  if (chunks.length === 0) chunks.push([]);
  chunks.forEach((rows, pageIdx) => {
    if (pageIdx > 0) page = pdf.addPage([pageW, pageH]);
    const isFirst = pageIdx === 0;
    const isLast = pageIdx === chunks.length - 1;
    if (isFirst) {
      drawHeader();
      drawTableHeader(tableTop);
    } else {
      const titleW = bold.widthOfTextAtSize(`BILL OF LADING — ${doc.bolNumber} (continued)`, 12);
      page.drawText(`BILL OF LADING — ${doc.bolNumber} (continued)`, { x: X(306) - (titleW * fs) / 2, y: Y(768), size: S(12), font: bold, color: DARK });
      drawTableHeader(740);
    }
    const top = isFirst ? tableTop : 740;
    // Body rows start BELOW the 25 pt header band (top - 25), not at `top`.
    const bodyTop = top - 25;
    rows.forEach((item, i) => drawTableRow(item, bodyTop - i * ROW_H));
    // Empty rows keep the official 20-row table shape on every page.
    for (let i = rows.length; i < BOL_TABLE_ROWS_PER_PAGE; i++) {
      rect(36, bodyTop - (i + 1) * ROW_H, 540, ROW_H, undefined, true);
      for (let c = 1; c < cols.length; c++) vline(cols[c].x, bodyTop - (i + 1) * ROW_H, bodyTop - i * ROW_H, GRID, 0.5);
    }
    if (isLast) drawSignaturesAndFooter();
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
