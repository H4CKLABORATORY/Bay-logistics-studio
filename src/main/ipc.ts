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
import { generateReportPdf } from './reportPdf';
import {
  groupBolsByCustomer, groupBolsByPeriod, isValidDateRange, rowsToCsv,
  summarizeInventory, summarizeMovements,
} from '../shared/reports';
import type { Store } from './db';
import { authStatus, createAccount, deleteAccount, listAccounts, login, logout } from './accounts';
import { getSessionUser, requireSessionUser } from './session';
import { CATALOG_TABLES } from './db';
import { exportBackupFile, importBackupFile } from './backup';

const CATALOG_KINDS = Object.keys(CATALOG_TABLES) as CatalogKind[];

function isCatalogKind(v: unknown): v is CatalogKind {
  return typeof v === 'string' && (CATALOG_KINDS as string[]).includes(v);
}

export function registerIpc(store: Store, getWindow: () => BrowserWindow | null) {
  const ok = <T>(data: T) => ({ ok: true as const, data });
  const fail = (message: string) => ({ ok: false as const, error: message });

  // All IPC channels require a signed-in session, except the ones marked
  // open: settings:get (brand/theme for the login screen) and the auth
  // channels themselves. The session lives in main-process memory
  // (session.ts); the renderer never decides who is logged in.
  const handle = (
    channel: string,
    fn: (...args: any[]) => unknown,
    opts?: { open?: boolean },
  ) => {
    ipcMain.handle(channel, (...args: any[]) => {
      if (!opts?.open) {
        try {
          requireSessionUser();
        } catch (err) {
          return fail(sanitizeIpcError(err));
        }
      }
      return fn(...args);
    });
  };

  // ---- Accounts (Phase 9) ----
  handle('auth:status', () => ok(authStatus(store)), { open: true });
  handle('auth:signup', (_e, username: unknown, password: unknown, role: unknown) => {
    try {
      return ok(createAccount(store, String(username ?? ''), String(password ?? ''), role === 'admin' ? 'admin' : 'user'));
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  }, { open: true });
  handle('auth:login', (_e, username: unknown, password: unknown) => {
    try {
      return ok(login(store, String(username ?? ''), String(password ?? '')));
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  }, { open: true });
  handle('auth:logout', () => { logout(); return ok(true); }, { open: true });
  handle('auth:users', () => {
    try {
      return ok(listAccounts(store));
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  });
  handle('auth:delete-user', (_e, id: number) => {
    try {
      deleteAccount(store, Number(id));
      return ok(true);
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  });

  handle('settings:get', () => ok(store.getSettings()), { open: true });
  handle('settings:set', (_e, settings: AppSettings) => {
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

  handle('bol:list', (_e, search = '') => ok(store.listBols(String(search ?? ''))));
  handle('bol:get', (_e, id: number) => {
    const bol = store.getBol(Number(id));
    return bol ? ok(bol) : fail(`BOL id ${id} not found`);
  });
  handle('bol:next-number', () => {
    const settings = store.getSettings();
    const { bolNumber, nextNumber } = allocateBolNumber(
      store.usedBolNumbers(), settings.numbering.prefix, settings.numbering.nextNumber, settings.numbering.padLength,
    );
    settings.numbering.nextNumber = nextNumber;
    store.saveSettings(settings);
    return ok(bolNumber);
  });
  handle('bol:create', (_e, doc: BolDocument) => {
    const errors = validateBol(doc);
    if (errors.length) return fail(errors.join(' '));
    try {
      return ok(store.createBol(doc, getSessionUser()?.username ?? ''));
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  });
  handle('bol:update', (_e, id: number, doc: BolDocument) => {
    const errors = validateBol(doc);
    if (errors.length) return fail(errors.join(' '));
    try {
      return ok(store.updateBol(Number(id), doc, getSessionUser()?.username ?? ''));
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  });
  handle('bol:delete', (_e, id: number) => {
    try {
      store.deleteBol(Number(id), getSessionUser()?.username ?? '');
      return ok(true);
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  });
  handle('bol:duplicate', (_e, id: number) => {
    try {
      const settings = store.getSettings();
      const { bolNumber, nextNumber } = allocateBolNumber(
        store.usedBolNumbers(), settings.numbering.prefix, settings.numbering.nextNumber, settings.numbering.padLength,
      );
      settings.numbering.nextNumber = nextNumber;
      store.saveSettings(settings);
      return ok(store.duplicateBol(Number(id), bolNumber, getSessionUser()?.username ?? ''));
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  });
  handle('bol:history', (_e, bolId?: number) =>
    ok(store.listHistory(bolId === undefined ? undefined : Number(bolId))));

  handle('bol:export-pdf', async (_e, id: number, opts?: { paperSize?: 'Letter' | 'A4'; orientation?: 'portrait' | 'landscape' }) => {
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
        companyPhone: settings.company.phone,
        companyWebsite: settings.company.website ?? '',
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

  handle('bol:pdf-preview', async (_e, id: number) => {
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
        companyPhone: settings.company.phone,
        companyWebsite: settings.company.website ?? '',
      });
      return ok(Buffer.from(bytes).toString('base64'));
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  });

  handle('bol:print', async (_e, id: number, opts?: { copies?: number; silent?: boolean; printerName?: string }) => {
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
        companyPhone: settings.company.phone,
        companyWebsite: settings.company.website ?? '',
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

  handle('printers:list', async () => {
    const win = getWindow();
    if (!win) return ok([]);
    try {
      return ok(await win.webContents.getPrintersAsync());
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  });

  // ---- Catalogs ----
  handle('catalog:list', (_e, kind: CatalogKind, search = '') => {
    if (!isCatalogKind(kind)) return fail(`Unknown catalog "${String(kind)}"`);
    return ok(store.listCatalog(kind, String(search ?? '')));
  });
  handle('catalog:create', (_e, kind: CatalogKind, rec: Record<string, unknown>) => {
    if (!isCatalogKind(kind)) return fail(`Unknown catalog "${String(kind)}"`);
    const errors = validateCatalogRecord(kind, rec);
    if (errors.length) return fail(errors.join(' '));
    try {
      return ok(store.createCatalog(kind, rec));
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  });
  handle('catalog:update', (_e, kind: CatalogKind, id: number, rec: Record<string, unknown>) => {
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
  handle('catalog:delete', (_e, kind: CatalogKind, id: number) => {
    if (!isCatalogKind(kind)) return fail(`Unknown catalog "${String(kind)}"`);
    try {
      store.deleteCatalog(kind, Number(id));
      return ok(true);
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  });

  // ---- Templates ----
  handle('templates:list', () => ok(store.listTemplates()));
  handle('templates:update', (_e, key: string, patch: Record<string, unknown>) => {
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
  handle('warehouse:list', () => {
    try { return ok(store.listWarehouses()); } catch (err) { return fail(sanitizeIpcError(err)); }
  });
  handle('warehouse:create', (_e, w: Warehouse) => {
    const errors = validateWarehouseDims(w ?? {});
    if (errors.length) return fail(errors.join(' '));
    try { return ok(store.createWarehouse(String(w.name).trim(), Number(w.widthM), Number(w.depthM), Number(w.heightM))); }
    catch (err) { return fail(sanitizeIpcError(err)); }
  });
  handle('warehouse:update-dims', (_e, id: number, w: { widthM: number; depthM: number; heightM: number }) => {
    const errors = validateWarehouseDims({ name: 'x', ...(w ?? {}) });
    if (errors.length) return fail(errors.join(' '));
    try { return ok(store.updateWarehouse(Number(id), Number(w.widthM), Number(w.depthM), Number(w.heightM))); }
    catch (err) { return fail(sanitizeIpcError(err)); }
  });

  // ---- Inventory (Phase 4) ----
  handle('inventory:locations', (_e, warehouseId?: number) => {
    try { return ok(store.listLocationsWithStock(warehouseId === undefined ? undefined : Number(warehouseId))); }
    catch (err) { return fail(sanitizeIpcError(err)); }
  });
  handle('inventory:location-create', (_e, loc: InvLocation) => {
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
    try { return ok(store.createLocation(loc, getSessionUser()?.username ?? '')); } catch (err) { return fail(sanitizeIpcError(err)); }
  });
  handle('inventory:items', (_e, search = '') => {
    try { return ok(store.listInvItems(String(search ?? ''))); } catch (err) { return fail(sanitizeIpcError(err)); }
  });
  handle('inventory:item-create', (_e, it: InvItem) => {
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
  handle('inventory:stock', (_e, locationId?: number) => {
    try { return ok(store.listStock(locationId === undefined ? undefined : Number(locationId))); }
    catch (err) { return fail(sanitizeIpcError(err)); }
  });
  handle('inventory:movement-create', (_e, m: Record<string, unknown>) => {
    const input = {
      type: m?.type as 'entry' | 'exit' | 'move',
      itemId: Number(m?.itemId), quantity: Number(m?.quantity),
      fromLocationId: m?.fromLocationId == null ? null : Number(m.fromLocationId),
      toLocationId: m?.toLocationId == null ? null : Number(m.toLocationId),
      bolId: m?.bolId == null ? null : Number(m.bolId),
      rrNumber: String(m?.rrNumber ?? ''), user: getSessionUser()?.username ?? '', note: String(m?.note ?? ''),
    };
    const errors = validateMovementInput(input);
    if (errors.length) return fail(errors.join(' '));
    try { return ok(store.recordMovement(input)); } catch (err) { return fail(sanitizeIpcError(err)); }
  });
  handle('inventory:movements', (_e, limit = 200) => {
    try { return ok(store.listMovements(Math.min(Math.max(Number(limit) || 200, 1), 1000))); }
    catch (err) { return fail(sanitizeIpcError(err)); }
  });
  handle('inventory:search', (_e, query = '') => {
    if (typeof query !== 'string' || !query.trim()) return fail('Search text is required.');
    try { return ok(store.searchInventory(query.trim())); } catch (err) { return fail(sanitizeIpcError(err)); }
  });
  handle('inventory:history', (_e, limit = 200) => {
    try { return ok(store.listInvHistory(Math.min(Math.max(Number(limit) || 200, 1), 1000))); }
    catch (err) { return fail(sanitizeIpcError(err)); }
  });
  handle('inventory:pallets', () => {
    try { return ok(store.listPallets()); } catch (err) { return fail(sanitizeIpcError(err)); }
  });
  handle('inventory:pallet-create', (_e, code: string, locationId: number | null, x: number, y: number, z: number) => {
    if (typeof code !== 'string' || !code.trim()) return fail('Pallet code is required.');
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return fail('Pallet coordinates must be numbers.');
    try { return ok(store.createPallet(code.trim(), locationId == null ? null : Number(locationId), x, y, z)); }
    catch (err) { return fail(sanitizeIpcError(err)); }
  });
  handle('inventory:boxes', () => {
    try { return ok(store.listBoxes()); } catch (err) { return fail(sanitizeIpcError(err)); }
  });
  handle('inventory:box-create', (_e, code: string, palletId: number | null, locationId: number | null, x: number, y: number, z: number) => {
    if (typeof code !== 'string' || !code.trim()) return fail('Box code is required.');
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return fail('Box coordinates must be numbers.');
    try { return ok(store.createBox(code.trim(), palletId == null ? null : Number(palletId), locationId == null ? null : Number(locationId), x, y, z)); }
    catch (err) { return fail(sanitizeIpcError(err)); }
  });

  // ---- Dashboard + reports (Phase 8) ----
  handle('dashboard:stats', () => {
    try { return ok(store.getDashboardStats()); } catch (err) { return fail(sanitizeIpcError(err)); }
  });
  const checkRange = (from: unknown, to: unknown): string | null => {
    if (typeof from !== 'string' || typeof to !== 'string' || !isValidDateRange(from, to)) {
      return 'Date range is invalid: use YYYY-MM-DD and make sure "from" is on or before "to".';
    }
    return null;
  };
  handle('reports:bols', (_e, from: string, to: string) => {
    const bad = checkRange(from, to);
    if (bad) return fail(bad);
    try { return ok(store.getReportBols(from, to)); } catch (err) { return fail(sanitizeIpcError(err)); }
  });
  handle('reports:movements', (_e, from: string, to: string) => {
    const bad = checkRange(from, to);
    if (bad) return fail(bad);
    try { return ok(store.getReportMovements(from, to)); } catch (err) { return fail(sanitizeIpcError(err)); }
  });
  handle('reports:inventory', () => {
    try { return ok(store.getReportInventory()); } catch (err) { return fail(sanitizeIpcError(err)); }
  });
  const saveExportFile = async (
    defaultName: string, filters: { name: string; extensions: string[] }[], bytes: Uint8Array | string,
  ) => {
    const win = getWindow();
    const fallback = path.join(require('os').homedir(), 'Downloads', defaultName);
    const res = win
      ? await dialog.showSaveDialog(win, { defaultPath: fallback, filters })
      : { canceled: true, filePath: '' };
    if (res.canceled || !res.filePath) return { saved: false as const };
    fs.writeFileSync(res.filePath, bytes);
    return { saved: true as const, path: res.filePath };
  };
  handle('reports:export-csv', async (_e, kind: string, from: string, to: string) => {
    const bad = checkRange(from, to);
    if (bad) return fail(bad);
    try {
      const settings = store.getSettings();
      const stamp = new Date().toISOString().slice(0, 10);
      let csv: string;
      let name: string;
      if (kind === 'bols') {
        const rows = store.getReportBols(from, to);
        const byPeriod = groupBolsByPeriod(rows, 'day');
        const byCustomer = groupBolsByCustomer(rows);
        csv = rowsToCsv(['Period', 'BOLs', 'Items', 'Total qty', 'Total weight'],
          byPeriod.map((r) => [r.period, r.bolCount, r.totalItems, r.totalQty, Number(r.totalWeight.toFixed(2))]))
          + '\r\n'
          + rowsToCsv(['Customer', 'BOLs', 'Items', 'Total qty'],
            byCustomer.map((r) => [r.customer, r.bolCount, r.totalItems, r.totalQty]));
        name = `logistics-studio-report-bols-${stamp}.csv`;
      } else if (kind === 'movements') {
        const summary = summarizeMovements(store.getReportMovements(from, to));
        csv = rowsToCsv(['SKU', 'Item', 'Entries', 'Entry qty', 'Exits', 'Exit qty', 'Moves', 'Move qty'],
          summary.map((r) => [r.sku, r.name, r.entries, r.entryQty, r.exits, r.exitQty, r.moves, r.moveQty]));
        name = `logistics-studio-report-movements-${stamp}.csv`;
      } else if (kind === 'inventory') {
        const inv = store.getReportInventory();
        const summary = summarizeInventory(inv.rows, inv.palletCount, inv.boxCount);
        csv = rowsToCsv(['SKU', 'Item', 'Total units', 'Locations used'],
          summary.rows.map((r) => [r.sku, r.name, r.totalQty, r.locationsUsed]))
          + '\r\n'
          + rowsToCsv(['Total', '', '', ''], [['TOTAL', '', summary.totalUnits, summary.locationsUsed]]);
        name = `logistics-studio-report-inventory-${stamp}.csv`;
      } else {
        return fail(`Unknown report "${String(kind)}"`);
      }
      void settings;
      return ok(await saveExportFile(name, [{ name: 'CSV', extensions: ['csv'] }], csv));
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  });
  handle('reports:export-pdf', async (_e, kind: string, from: string, to: string) => {
    const bad = checkRange(from, to);
    if (bad) return fail(bad);
    try {
      const settings = store.getSettings();
      const stamp = new Date().toISOString().slice(0, 10);
      let bytes: Uint8Array;
      let name: string;
      if (kind === 'bols') {
        const rows = store.getReportBols(from, to);
        const byPeriod = groupBolsByPeriod(rows, 'day');
        bytes = await generateReportPdf('BOLs by day', `${from} → ${to} · ${rows.length} BOLs`,
          ['Date', 'BOLs', 'Items', 'Total qty', 'Total weight'],
          byPeriod.map((r) => [r.period, String(r.bolCount), String(r.totalItems), String(r.totalQty), r.totalWeight.toFixed(1)]),
          settings.brandName);
        name = `logistics-studio-report-bols-${stamp}.pdf`;
      } else if (kind === 'movements') {
        const summary = summarizeMovements(store.getReportMovements(from, to));
        bytes = await generateReportPdf('Movements summary', `${from} → ${to}`,
          ['SKU', 'Item', 'Entries', 'Entry qty', 'Exits', 'Exit qty', 'Moves', 'Move qty'],
          summary.map((r) => [r.sku, r.name, String(r.entries), String(r.entryQty), String(r.exits), String(r.exitQty), String(r.moves), String(r.moveQty)]),
          settings.brandName);
        name = `logistics-studio-report-movements-${stamp}.pdf`;
      } else if (kind === 'inventory') {
        const inv = store.getReportInventory();
        const summary = summarizeInventory(inv.rows, inv.palletCount, inv.boxCount);
        bytes = await generateReportPdf('Inventory overview', `As of ${stamp} · ${summary.totalUnits} units, ${summary.distinctSkus} SKUs, ${summary.palletCount} pallets, ${summary.boxCount} boxes`,
          ['SKU', 'Item', 'Total units', 'Locations used'],
          summary.rows.map((r) => [r.sku, r.name, String(r.totalQty), String(r.locationsUsed)]),
          settings.brandName);
        name = `logistics-studio-report-inventory-${stamp}.pdf`;
      } else {
        return fail(`Unknown report "${String(kind)}"`);
      }
      return ok(await saveExportFile(name, [{ name: 'PDF', extensions: ['pdf'] }], bytes));
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  });

  // ---- Backup / restore ----
  handle('backup:export', async () => {
    const win = getWindow();
    try {
      const filePath = await exportBackupFile(store, win);
      return ok(filePath ? { path: filePath } : { path: null });
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  });
  handle('backup:restore', async () => {
    const win = getWindow();
    try {
      const restored = await importBackupFile(store, win);
      return ok({ restored });
    } catch (err) {
      return fail(sanitizeIpcError(err));
    }
  });
}
