// Secure IPC: a small allow-list of channels. The renderer can only invoke
// these; preload exposes them through contextBridge. All inputs are validated
// in the handlers; all SQL is parameterized in db.ts.
import { BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings, BolDocument, CatalogKind } from '../shared/types';
import { allocateBolNumber } from '../shared/bolNumbering';
import { validateBol, validateCatalogRecord } from '../shared/validation';
import { generateBolPdf } from '../shared/pdf';
import type { Store } from './db';
import { CATALOG_TABLES } from './db';
import { exportBackupFile, importBackupFile } from './backup';

const CATALOG_KINDS = Object.keys(CATALOG_TABLES) as CatalogKind[];

function isCatalogKind(v: unknown): v is CatalogKind {
  return typeof v === 'string' && (CATALOG_KINDS as string[]).includes(v);
}

export function registerIpc(store: Store, getWindow: () => BrowserWindow | null) {
  const ok = <T>(data: T) => ({ ok: true as const, data });
  const fail = (message: string) => ({ ok: false as const, error: message });

  ipcMain.handle('settings:get', () => ok(store.getSettings()));
  ipcMain.handle('settings:set', (_e, settings: AppSettings) => {
    try {
      store.saveSettings(settings);
      return ok(true);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle('bol:list', (_e, search = '') => ok(store.listBols(String(search ?? ''))));
  ipcMain.handle('bol:get', (_e, id: number) => {
    const bol = store.getBol(Number(id));
    return bol ? ok(bol) : fail(`BOL id ${id} not found`);
  });
  ipcMain.handle('bol:next-number', () => {
    const settings = store.getSettings();
    const { bolNumber, nextNumber } = allocateBolNumber(
      store.usedBolNumbers(), settings.numbering.prefix, settings.numbering.nextNumber, settings.numbering.padLength,
    );
    settings.numbering.nextNumber = nextNumber;
    store.saveSettings(settings);
    return ok(bolNumber);
  });
  ipcMain.handle('bol:create', (_e, doc: BolDocument) => {
    const errors = validateBol(doc);
    if (errors.length) return fail(errors.join(' '));
    try {
      return ok(store.createBol(doc));
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });
  ipcMain.handle('bol:update', (_e, id: number, doc: BolDocument) => {
    const errors = validateBol(doc);
    if (errors.length) return fail(errors.join(' '));
    try {
      return ok(store.updateBol(Number(id), doc));
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });
  ipcMain.handle('bol:delete', (_e, id: number) => {
    try {
      store.deleteBol(Number(id));
      return ok(true);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });
  ipcMain.handle('bol:duplicate', (_e, id: number) => {
    try {
      const settings = store.getSettings();
      const { bolNumber, nextNumber } = allocateBolNumber(
        store.usedBolNumbers(), settings.numbering.prefix, settings.numbering.nextNumber, settings.numbering.padLength,
      );
      settings.numbering.nextNumber = nextNumber;
      store.saveSettings(settings);
      return ok(store.duplicateBol(Number(id), bolNumber));
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });
  ipcMain.handle('bol:history', (_e, bolId?: number) =>
    ok(store.listHistory(bolId === undefined ? undefined : Number(bolId))));

  ipcMain.handle('bol:export-pdf', async (_e, id: number, opts?: { paperSize?: 'Letter' | 'A4'; orientation?: 'portrait' | 'landscape' }) => {
    const bol = store.getBol(Number(id));
    if (!bol) return fail(`BOL id ${id} not found`);
    const settings = store.getSettings();
    try {
      const bytes = await generateBolPdf(bol, {
        paperSize: opts?.paperSize ?? settings.print.paperSize,
        orientation: opts?.orientation ?? settings.print.orientation,
        marginsMm: settings.print.marginsMm,
        brandName: settings.brandName,
        companyName: settings.company.name,
        companyAddress: settings.company.address,
      });
      const win = getWindow();
      const fallback = path.join(require('os').homedir(), 'Downloads', `${bol.bolNumber}.pdf`);
      const res = win
        ? await dialog.showSaveDialog(win, { defaultPath: fallback, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
        : { canceled: true, filePath: '' };
      if (res.canceled || !res.filePath) return ok({ saved: false, base64: Buffer.from(bytes).toString('base64') });
      fs.writeFileSync(res.filePath, bytes);
      return ok({ saved: true, path: res.filePath, base64: Buffer.from(bytes).toString('base64') });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle('bol:pdf-preview', async (_e, id: number) => {
    const bol = store.getBol(Number(id));
    if (!bol) return fail(`BOL id ${id} not found`);
    const settings = store.getSettings();
    try {
      const bytes = await generateBolPdf(bol, {
        paperSize: settings.print.paperSize,
        orientation: settings.print.orientation,
        marginsMm: settings.print.marginsMm,
        brandName: settings.brandName,
        companyName: settings.company.name,
        companyAddress: settings.company.address,
      });
      return ok(Buffer.from(bytes).toString('base64'));
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle('bol:print', async (_e, id: number, opts?: { copies?: number; silent?: boolean; printerName?: string }) => {
    const bol = store.getBol(Number(id));
    if (!bol) return fail(`BOL id ${id} not found`);
    const settings = store.getSettings();
    const win = getWindow();
    if (!win) return fail('No window available for printing');
    try {
      const bytes = await generateBolPdf(bol, {
        paperSize: settings.print.paperSize,
        orientation: settings.print.orientation,
        marginsMm: settings.print.marginsMm,
        brandName: settings.brandName,
        companyName: settings.company.name,
        companyAddress: settings.company.address,
      });
      const tmpPath = path.join(require('os').tmpdir(), `${bol.bolNumber}.pdf`);
      fs.writeFileSync(tmpPath, bytes);
      // Print the PDF by loading it in a hidden window (Electron print API).
      const printWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
      await printWin.loadFile(tmpPath);
      await new Promise<void>((resolve) => {
        printWin.webContents.once('did-finish-load', () => resolve());
        setTimeout(resolve, 5000);
      });
      await new Promise<void>((resolve, reject) => {
        printWin.webContents.print(
          {
            silent: opts?.silent ?? settings.print.silent,
            printBackground: true,
            copies: opts?.copies ?? settings.print.copies,
            deviceName: opts?.printerName ?? settings.print.defaultPrinter ?? '',
            margins: { marginType: 'custom', top: settings.print.marginsMm.top, bottom: settings.print.marginsMm.bottom, left: settings.print.marginsMm.left, right: settings.print.marginsMm.right },
            pageSize: settings.print.paperSize,
            landscape: settings.print.orientation === 'landscape',
          },
          (success, errorType) => {
            printWin.close();
            if (success) resolve();
            else reject(new Error(`Print failed: ${errorType || 'unknown error'}`));
          },
        );
      });
      store.listHistory(bol.id);
      return ok(true);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle('printers:list', async () => {
    const win = getWindow();
    if (!win) return ok([]);
    try {
      return ok(await win.webContents.getPrintersAsync());
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });

  // ---- Catalogs ----
  ipcMain.handle('catalog:list', (_e, kind: CatalogKind, search = '') => {
    if (!isCatalogKind(kind)) return fail(`Unknown catalog "${String(kind)}"`);
    return ok(store.listCatalog(kind, String(search ?? '')));
  });
  ipcMain.handle('catalog:create', (_e, kind: CatalogKind, rec: Record<string, unknown>) => {
    if (!isCatalogKind(kind)) return fail(`Unknown catalog "${String(kind)}"`);
    const errors = validateCatalogRecord(kind, rec);
    if (errors.length) return fail(errors.join(' '));
    try {
      return ok(store.createCatalog(kind, rec));
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });
  ipcMain.handle('catalog:update', (_e, kind: CatalogKind, id: number, rec: Record<string, unknown>) => {
    if (!isCatalogKind(kind)) return fail(`Unknown catalog "${String(kind)}"`);
    const errors = validateCatalogRecord(kind, rec);
    if (errors.length) return fail(errors.join(' '));
    try {
      store.updateCatalog(kind, Number(id), rec);
      return ok(true);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });
  ipcMain.handle('catalog:delete', (_e, kind: CatalogKind, id: number) => {
    if (!isCatalogKind(kind)) return fail(`Unknown catalog "${String(kind)}"`);
    try {
      store.deleteCatalog(kind, Number(id));
      return ok(true);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });

  // ---- Templates ----
  ipcMain.handle('templates:list', () => ok(store.listTemplates()));
  ipcMain.handle('templates:update', (_e, key: string, patch: Record<string, unknown>) => {
    try {
      store.updateTemplate(String(key), patch as never);
      return ok(true);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });

  // ---- Backup / restore ----
  ipcMain.handle('backup:export', async () => {
    const win = getWindow();
    try {
      const filePath = await exportBackupFile(store, win);
      return ok(filePath ? { path: filePath } : { path: null });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });
  ipcMain.handle('backup:restore', async () => {
    const win = getWindow();
    try {
      const restored = await importBackupFile(store, win);
      return ok({ restored });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });
}
