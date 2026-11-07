// Report PDF export (Phase 8, main process only): a simple clean table
// layout with pdf-lib — title, subtitle, header row, zebra rows, footer
// with page numbers. Reuses the BOL PDF's Letter default and Helvetica
// fonts; no company branding is drawn here beyond the brand name line.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const BLACK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.36, 0.39, 0.44);
const GRID = rgb(0.85, 0.87, 0.89);
const HEADER_BG = rgb(0.94, 0.95, 0.96);
const ROW_ALT = rgb(0.97, 0.98, 0.99);

/** Standard Helvetica is WinAnsi-encoded: arrows, middots and other
 *  non-Latin-1 glyphs throw at draw time. Normalise them up front. */
export function safePdfText(text: string): string {
  return String(text ?? '')
    .replace(/→/g, '->')
    .replace(/·/g, '-')
    .replace(/…/g, '...')
    .replace(/—/g, '-')
    .replace(/–/g, '-')
    .replace(/[^\x00-\xFF]/g, '?');
}

export async function generateReportPdf(
  title: string,
  subtitle: string,
  headers: string[],
  rows: string[][],
  brandName = 'Logistics Studio',
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612;
  const H = 792;
  const MARGIN = 40;
  const ROW_H = 20;
  const TITLE_SIZE = 18;
  const BODY = 10;

  const colW = (W - MARGIN * 2) / headers.length;

  const drawPageHeader = (page: ReturnType<typeof doc.addPage>, pageNo: number) => {
    page.drawText(safePdfText(title), { x: MARGIN, y: H - 56, size: TITLE_SIZE, font: bold, color: BLACK });
    page.drawText(safePdfText(subtitle), { x: MARGIN, y: H - 74, size: 11, font, color: MUTED });
    return H - 96; // y for the table header
  };

  const drawTableHeader = (page: ReturnType<typeof doc.addPage>, y: number) => {
    page.drawRectangle({ x: MARGIN, y: y - ROW_H + 6, width: W - MARGIN * 2, height: ROW_H, color: HEADER_BG });
    headers.forEach((h, i) => {
      page.drawText(safePdfText(h), { x: MARGIN + 6 + i * colW, y: y - 8, size: BODY, font: bold, color: BLACK, maxWidth: colW - 10 });
    });
    return y - ROW_H;
  };

  let pageNo = 1;
  let page = doc.addPage([W, H]);
  let y = drawPageHeader(page, pageNo);
  y = drawTableHeader(page, y);

  const cell = (text: string, maxWidth: number): string => {
    // Truncate with "..." so long values never overflow their column.
    const t0 = safePdfText(text);
    if (font.widthOfTextAtSize(t0, BODY) <= maxWidth) return t0;
    let t = t0;
    while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, BODY) > maxWidth) t = t.slice(0, -1);
    return `${t}...`;
  };

  rows.forEach((row, ri) => {
    if (y < 60) {
      pageNo += 1;
      page = doc.addPage([W, H]);
      y = drawPageHeader(page, pageNo);
      y = drawTableHeader(page, y);
    }
    if (ri % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: y - ROW_H + 6, width: W - MARGIN * 2, height: ROW_H, color: ROW_ALT });
    }
    row.forEach((v, i) => {
      page.drawText(cell(String(v ?? ''), colW - 12), {
        x: MARGIN + 6 + i * colW, y: y - 8, size: BODY, font, color: BLACK,
      });
    });
    // Row separator.
    page.drawLine({
      start: { x: MARGIN, y: y - ROW_H + 6 }, end: { x: W - MARGIN, y: y - ROW_H + 6 },
      thickness: 0.5, color: GRID,
    });
    y -= ROW_H;
  });

  if (rows.length === 0) {
    page.drawText('No data in this period.', { x: MARGIN, y: y - 8, size: BODY, font, color: MUTED });
  }

  // Footers (brand + row count + page number) once the page count is known.
  doc.getPages().forEach((p, i) => {
    p.drawText(safePdfText(`${brandName} - ${rows.length} row${rows.length === 1 ? '' : 's'}`), {
      x: MARGIN, y: 28, size: 9, font, color: MUTED,
    });
    p.drawText(`Page ${i + 1}`, { x: W - MARGIN - 50, y: 28, size: 9, font, color: MUTED });
  });

  return doc.save();
}
