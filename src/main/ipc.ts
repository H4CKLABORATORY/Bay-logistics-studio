// Secure IPC: a small allow-list of channels. The renderer can only invoke
// these; preload exposes them through contextBridge. All inputs are validated
// in the handlers; all SQL is parameterized in db.ts.
import { BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings, BolDocument, CatalogKind, InvItem, InvLocation, Warehouse } from '../shared/types';
import { allocateBolNumber } from '../shared/bolNumbering';
import { validateBol, validateCatalogRecord, validateInvItem, validateLocationCode, validateMovementInput, validateWarehouseDims } from '../shared/validation';
import { parseLocationCode } from '../shared/inventory';
import { sanitizeIpcError } from '../shared/errors';
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
    if (!settings || typeof settings !== 'object' || typeof (settings as AppSettings).brandName !== 'string') {
      return fail('Settings are invalid.');
    }
    try {
      store.saveSettings(settings);
      return ok(true);
    } catch (err) {
      return fail(sanitizeIpcError(err));
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
      return fail(sanitizeIpcError(err));
    }
  });
  ipcMain.handle('bol:update', (_e, id: number, doc: BolDocument) => {
    const errors = validateBol(doc);
    if (errors.length) return fail(errors.join(' '));
    try {
      return ok(store.updateBol(Number(id), doc));
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  });
  ipcMain.handle('bol:delete', (_e, id: number) => {
    try {
      store.deleteBol(Number(id));
      return ok(true);
    } catch (err) {
      return fail(sanitizeIpcError(err));
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
      return fail(sanitizeIpcError(err));
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
      return fail(sanitizeIpcError(err));
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
      return fail(sanitizeIpcError(err));
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
      return ok(true);
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  });

  ipcMain.handle('printers:list', async () => {
    const win = getWindow();
    if (!win) return ok([]);
    try {
      return ok(await win.webContents.getPrintersAsync());
    } catch (err) {
      return fail(sanitizeIpcError(err));
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
      return fail(sanitizeIpcError(err));
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
      return fail(sanitizeIpcError(err));
    }
  });
  ipcMain.handle('catalog:delete', (_e, kind: CatalogKind, id: number) => {
    if (!isCatalogKind(kind)) return fail(`Unknown catalog "${String(kind)}"`);
    try {
      store.deleteCatalog(kind, Number(id));
      return ok(true);
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  });

  // ---- Templates ----
  ipcMain.handle('templates:list', () => ok(store.listTemplates()));
  ipcMain.handle('templates:update', (_e, key: string, patch: Record<string, unknown>) => {
    if (typeof key !== 'string' || !key.trim()) return fail('Template key is required.');
    if (!patch || typeof patch !== 'object') return fail('Template patch is invalid.');
    try {
      store.updateTemplate(String(key), patch as never);
      return ok(true);
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  });


  // ---- Warehouses (Phase 5 config) ----
  ipcMain.handle('warehouse:list', () => {
    try { return ok(store.listWarehouses()); } catch (err) { return fail(sanitizeIpcError(err)); }
  });
  ipcMain.handle('warehouse:create', (_e, w: Warehouse) => {
    const errors = validateWarehouseDims(w ?? {});
    if (errors.length) return fail(errors.join(' '));
    try { return ok(store.createWarehouse(String(w.name).trim(), Number(w.widthM), Number(w.depthM), Number(w.heightM))); }
    catch (err) { return fail(sanitizeIpcError(err)); }
  });
  ipcMain.handle('warehouse:update-dims', (_e, id: number, w: { widthM: number; depthM: number; heightM: number }) => {
    const errors = validateWarehouseDims({ name: 'x', ...(w ?? {}) });
    if (errors.length) return fail(errors.join(' '));
    try { return ok(store.updateWarehouse(Number(id), Number(w.widthM), Number(w.depthM), Number(w.heightM))); }
    catch (err) { return fail(sanitizeIpcError(err)); }
  });

  // ---- Inventory (Phase 4) ----
  ipcMain.handle('inventory:locations', (_e, warehouseId?: number) => {
    try { return ok(store.listLocationsWithStock(warehouseId === undefined ? undefined : Number(warehouseId))); }
    catch (err) { return fail(sanitizeIpcError(err)); }
  });
  ipcMain.handle('inventory:location-create', (_e, loc: InvLocation) => {
    const errors = validateLocationCode(loc?.code);
    if (!loc || !Number.isInteger(loc.warehouseId) || loc.warehouseId <= 0) errors.push('A valid warehouse is required.');
    const parsed = parseLocationCode(String(loc?.code ?? ''));
    if (parsed && (parsed.aisle !== loc.aisle || parsed.shelf !== loc.shelf || parsed.position !== loc.position || parsed.zone !== String(loc.zone).toUpperCase())) {
      errors.push('Location code does not match its zone/aisle/shelf/position.');
    }
    for (const k of ['x', 'y', 'z'] as const) {
      if (typeof loc?.[k] !== 'number' || !Number.isFinite(loc[k])) errors.push(`Location ${k} coordinate must be a number.`);
    }
    if (errors.length) return fail(errors.join(' '));
    try { return ok(store.createLocation(loc)); } catch (err) { return fail(sanitizeIpcError(err)); }
  });
  ipcMain.handle('inventory:items', (_e, search = '') => {
    try { return ok(store.listInvItems(String(search ?? ''))); } catch (err) { return fail(sanitizeIpcError(err)); }
  });
  ipcMain.handle('inventory:item-create', (_e, it: InvItem) => {
    const errors = validateInvItem(it ?? {});
    if (errors.length) return fail(errors.join(' '));
    try {
      return ok(store.createInvItem({
        sku: String(it.sku).trim(), name: String(it.name).trim(),
        description: String(it.description ?? ''), unit: String(it.unit ?? ''), weight: String(it.weight ?? ''),
        customer: String(it.customer ?? ''), project: String(it.project ?? ''),
      }));
    } catch (err) { return fail(sanitizeIpcError(err)); }
  });
  ipcMain.handle('inventory:stock', (_e, locationId?: number) => {
    try { return ok(store.listStock(locationId === undefined ? undefined : Number(locationId))); }
    catch (err) { return fail(sanitizeIpcError(err)); }
  });
  ipcMain.handle('inventory:movement-create', (_e, m: Record<string, unknown>) => {
    const input = {
      type: m?.type as 'entry' | 'exit' | 'move',
      itemId: Number(m?.itemId), quantity: Number(m?.quantity),
      fromLocationId: m?.fromLocationId == null ? null : Number(m.fromLocationId),
      toLocationId: m?.toLocationId == null ? null : Number(m.toLocationId),
      bolId: m?.bolId == null ? null : Number(m.bolId),
      rrNumber: String(m?.rrNumber ?? ''), user: String(m?.user ?? ''), note: String(m?.note ?? ''),
    };
    const errors = validateMovementInput(input);
    if (errors.length) return fail(errors.join(' '));
    try { return ok(store.recordMovement(input)); } catch (err) { return fail(sanitizeIpcError(err)); }
  });
  ipcMain.handle('inventory:movements', (_e, limit = 200) => {
    try { return ok(store.listMovements(Math.min(Math.max(Number(limit) || 200, 1), 1000))); }
    catch (err) { return fail(sanitizeIpcError(err)); }
  });
  ipcMain.handle('inventory:search', (_e, query = '') => {
    if (typeof query !== 'string' || !query.trim()) return fail('Search text is required.');
    try { return ok(store.searchInventory(query.trim())); } catch (err) { return fail(sanitizeIpcError(err)); }
  });
  ipcMain.handle('inventory:history', (_e, limit = 200) => {
    try { return ok(store.listInvHistory(Math.min(Math.max(Number(limit) || 200, 1), 1000))); }
    catch (err) { return fail(sanitizeIpcError(err)); }
  });
  ipcMain.handle('inventory:pallets', () => {
    try { return ok(store.listPallets()); } catch (err) { return fail(sanitizeIpcError(err)); }
  });
  ipcMain.handle('inventory:pallet-create', (_e, code: string, locationId: number | null, x: number, y: number, z: number) => {
    if (typeof code !== 'string' || !code.trim()) return fail('Pallet code is required.');
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return fail('Pallet coordinates must be numbers.');
    try { return ok(store.createPallet(code.trim(), locationId == null ? null : Number(locationId), x, y, z)); }
    catch (err) { return fail(sanitizeIpcError(err)); }
  });
  ipcMain.handle('inventory:boxes', () => {
    try { return ok(store.listBoxes()); } catch (err) { return fail(sanitizeIpcError(err)); }
  });
  ipcMain.handle('inventory:box-create', (_e, code: string, palletId: number | null, locationId: number | null, x: number, y: number, z: number) => {
    if (typeof code !== 'string' || !code.trim()) return fail('Box code is required.');
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return fail('Box coordinates must be numbers.');
    try { return ok(store.createBox(code.trim(), palletId == null ? null : Number(palletId), locationId == null ? null : Number(locationId), x, y, z)); }
    catch (err) { return fail(sanitizeIpcError(err)); }
  });

  // ---- Backup / restore ----
  ipcMain.handle('backup:export', async () => {
    const win = getWindow();
    try {
      const filePath = await exportBackupFile(store, win);
      return ok(filePath ? { path: filePath } : { path: null });
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  });
  ipcMain.handle('backup:restore', async () => {
    const win = getWindow();
    try {
      const restored = await importBackupFile(store, win);
      return ok({ restored });
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  });
}
