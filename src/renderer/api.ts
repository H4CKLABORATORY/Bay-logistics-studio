// Typed wrapper over window.api (exposed by preload). Every call returns
// { ok, data } or { ok, error }; unwrap throws on error so pages can use
// try/catch with a single error banner.
import type { Api } from '../main/preload';
import type { AppSettings, BolDocument, BolHistoryEntry, CatalogKind, CatalogRecord, DashboardStats, InvBox, InvHistoryEntry, InvItem, InvLocation, InvMovement, InvPallet, InvStockRow, InventorySearchResult, Warehouse } from '../shared/types';
import type { ReportBolRow, ReportInventoryResult, ReportMovementRow } from '../shared/reports';

declare global {
  interface Window {
    api: Api;
  }
}

type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function unwrap<T>(p: Promise<IpcResult<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.error || 'Unknown IPC error');
  return r.data;
}

export const api = {
  settingsGet: () => unwrap<AppSettings>(window.api.settingsGet()),
  settingsSet: (s: AppSettings) => unwrap<boolean>(window.api.settingsSet(s)),
  bolList: (search = '') => unwrap<BolDocument[]>(window.api.bolList(search)),
  bolGet: (id: number) => unwrap<BolDocument>(window.api.bolGet(id)),
  bolNextNumber: () => unwrap<string>(window.api.bolNextNumber()),
  bolCreate: (doc: BolDocument) => unwrap<BolDocument>(window.api.bolCreate(doc)),
  bolUpdate: (id: number, doc: BolDocument) => unwrap<BolDocument>(window.api.bolUpdate(id, doc)),
  bolDelete: (id: number) => unwrap<boolean>(window.api.bolDelete(id)),
  bolDuplicate: (id: number) => unwrap<BolDocument>(window.api.bolDuplicate(id)),
  bolHistory: (bolId?: number) => unwrap<BolHistoryEntry[]>(window.api.bolHistory(bolId)),
  bolExportPdf: (id: number, opts?: { paperSize?: 'Letter' | 'A4'; orientation?: 'portrait' | 'landscape' }) =>
    unwrap<{ saved: boolean; path?: string; base64?: string }>(window.api.bolExportPdf(id, opts)),
  bolPdfPreview: (id: number) => unwrap<string>(window.api.bolPdfPreview(id)),
  bolPrint: (id: number, opts?: { copies?: number; silent?: boolean; printerName?: string }) =>
    unwrap<boolean>(window.api.bolPrint(id, opts)),
  printersList: () => unwrap<Array<{ name: string; displayName: string; isDefault?: boolean }>>(window.api.printersList()),
  catalogList: (kind: CatalogKind, search = '') => unwrap<CatalogRecord[]>(window.api.catalogList(kind, search)),
  catalogCreate: (kind: CatalogKind, rec: Record<string, unknown>) => unwrap<CatalogRecord>(window.api.catalogCreate(kind, rec)),
  catalogUpdate: (kind: CatalogKind, id: number, rec: Record<string, unknown>) => unwrap<boolean>(window.api.catalogUpdate(kind, id, rec)),
  catalogDelete: (kind: CatalogKind, id: number) => unwrap<boolean>(window.api.catalogDelete(kind, id)),
  templatesList: () => unwrap<Record<string, unknown>[]>(window.api.templatesList()),
  templatesUpdate: (key: string, patch: Record<string, unknown>) => unwrap<boolean>(window.api.templatesUpdate(key, patch)),
  backupExport: () => unwrap<{ path: string | null }>(window.api.backupExport()),
  dashboardStats: () => unwrap<DashboardStats>(window.api.dashboardStats()),
  reportBols: (from: string, to: string) => unwrap<ReportBolRow[]>(window.api.reportBols(from, to)),
  reportMovements: (from: string, to: string) => unwrap<ReportMovementRow[]>(window.api.reportMovements(from, to)),
  reportInventory: () => unwrap<ReportInventoryResult>(window.api.reportInventory()),
  reportExportCsv: (kind: string, from: string, to: string) => unwrap<{ saved: boolean; path?: string }>(window.api.reportExportCsv(kind, from, to)),
  reportExportPdf: (kind: string, from: string, to: string) => unwrap<{ saved: boolean; path?: string }>(window.api.reportExportPdf(kind, from, to)),
  backupRestore: () => unwrap<{ restored: boolean }>(window.api.backupRestore()),
  warehouseList: () => unwrap<Warehouse[]>(window.api.warehouseList()),
  warehouseCreate: (w: Warehouse) => unwrap<Warehouse>(window.api.warehouseCreate(w)),
  warehouseUpdateDims: (id: number, w: { widthM: number; depthM: number; heightM: number }) => unwrap<Warehouse>(window.api.warehouseUpdateDims(id, w)),
  inventoryLocations: (warehouseId?: number) => unwrap<Array<InvLocation & { stockQty: number }>>(window.api.inventoryLocations(warehouseId)),
  inventoryLocationCreate: (loc: InvLocation) => unwrap<InvLocation>(window.api.inventoryLocationCreate(loc)),
  inventoryItems: (search = '') => unwrap<InvItem[]>(window.api.inventoryItems(search)),
  inventoryItemCreate: (it: InvItem) => unwrap<InvItem>(window.api.inventoryItemCreate(it)),
  inventoryStock: (locationId?: number) => unwrap<InvStockRow[]>(window.api.inventoryStock(locationId)),
  inventoryMovementCreate: (m: { type: 'entry' | 'exit' | 'move'; itemId: number; quantity: number; fromLocationId?: number | null; toLocationId?: number | null; bolId?: number | null; rrNumber?: string; user?: string; note?: string }) => unwrap<InvMovement>(window.api.inventoryMovementCreate(m)),
  inventoryMovements: (limit = 200) => unwrap<InvMovement[]>(window.api.inventoryMovements(limit)),
  inventorySearch: (query: string) => unwrap<InventorySearchResult>(window.api.inventorySearch(query)),
  inventoryHistory: (limit = 200) => unwrap<InvHistoryEntry[]>(window.api.inventoryHistory(limit)),
  inventoryPallets: () => unwrap<InvPallet[]>(window.api.inventoryPallets()),
  inventoryPalletCreate: (code: string, locationId: number | null, x: number, y: number, z: number) => unwrap<InvPallet>(window.api.inventoryPalletCreate(code, locationId, x, y, z)),
  inventoryBoxes: () => unwrap<InvBox[]>(window.api.inventoryBoxes()),
  inventoryBoxCreate: (code: string, palletId: number | null, locationId: number | null, x: number, y: number, z: number) => unwrap<InvBox>(window.api.inventoryBoxCreate(code, palletId, locationId, x, y, z)),
};
