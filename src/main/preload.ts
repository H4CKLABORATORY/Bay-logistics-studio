import { contextBridge, ipcRenderer } from 'electron';

// Secure IPC surface: only the channels listed here are exposed to the
// renderer. No Node APIs, no remote module, no direct DB access.
const api = {
  // Accounts (Phase 9): local username + password, session in main memory.
  authStatus: () => ipcRenderer.invoke('auth:status'),
  authSignup: (username: string, password: string, role: string) => ipcRenderer.invoke('auth:signup', username, password, role),
  authLogin: (username: string, password: string) => ipcRenderer.invoke('auth:login', username, password),
  authLogout: () => ipcRenderer.invoke('auth:logout'),
  authUsers: () => ipcRenderer.invoke('auth:users'),
  authDeleteUser: (id: number) => ipcRenderer.invoke('auth:delete-user', id),
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (s: unknown) => ipcRenderer.invoke('settings:set', s),
  bolList: (search = '') => ipcRenderer.invoke('bol:list', search),
  bolGet: (id: number) => ipcRenderer.invoke('bol:get', id),
  bolNextNumber: () => ipcRenderer.invoke('bol:next-number'),
  bolCreate: (doc: unknown) => ipcRenderer.invoke('bol:create', doc),
  bolUpdate: (id: number, doc: unknown) => ipcRenderer.invoke('bol:update', id, doc),
  bolDelete: (id: number) => ipcRenderer.invoke('bol:delete', id),
  bolDuplicate: (id: number) => ipcRenderer.invoke('bol:duplicate', id),
  bolHistory: (bolId?: number) => ipcRenderer.invoke('bol:history', bolId),
  bolExportPdf: (id: number, opts?: unknown) => ipcRenderer.invoke('bol:export-pdf', id, opts),
  bolPdfPreview: (id: number) => ipcRenderer.invoke('bol:pdf-preview', id),
  bolPrint: (id: number, opts?: unknown) => ipcRenderer.invoke('bol:print', id, opts),
  printersList: () => ipcRenderer.invoke('printers:list'),
  catalogList: (kind: string, search?: string) => ipcRenderer.invoke('catalog:list', kind, search),
  catalogCreate: (kind: string, rec: unknown) => ipcRenderer.invoke('catalog:create', kind, rec),
  catalogUpdate: (kind: string, id: number, rec: unknown) => ipcRenderer.invoke('catalog:update', kind, id, rec),
  catalogDelete: (kind: string, id: number) => ipcRenderer.invoke('catalog:delete', kind, id),
  templatesList: () => ipcRenderer.invoke('templates:list'),
  templatesUpdate: (key: string, patch: unknown) => ipcRenderer.invoke('templates:update', key, patch),
  backupExport: () => ipcRenderer.invoke('backup:export'),
  dashboardStats: () => ipcRenderer.invoke('dashboard:stats'),
  reportBols: (from: string, to: string) => ipcRenderer.invoke('reports:bols', from, to),
  reportMovements: (from: string, to: string) => ipcRenderer.invoke('reports:movements', from, to),
  reportInventory: () => ipcRenderer.invoke('reports:inventory'),
  reportExportCsv: (kind: string, from: string, to: string) => ipcRenderer.invoke('reports:export-csv', kind, from, to),
  reportExportPdf: (kind: string, from: string, to: string) => ipcRenderer.invoke('reports:export-pdf', kind, from, to),
  backupRestore: () => ipcRenderer.invoke('backup:restore'),
  // Warehouses + inventory (Phases 4-5)
  warehouseList: () => ipcRenderer.invoke('warehouse:list'),
  warehouseCreate: (w: unknown) => ipcRenderer.invoke('warehouse:create', w),
  warehouseUpdateDims: (id: number, w: unknown) => ipcRenderer.invoke('warehouse:update-dims', id, w),
  inventoryLocations: (warehouseId?: number) => ipcRenderer.invoke('inventory:locations', warehouseId),
  inventoryLocationCreate: (loc: unknown) => ipcRenderer.invoke('inventory:location-create', loc),
  inventoryItems: (search?: string) => ipcRenderer.invoke('inventory:items', search),
  inventoryItemCreate: (it: unknown) => ipcRenderer.invoke('inventory:item-create', it),
  inventoryStock: (locationId?: number) => ipcRenderer.invoke('inventory:stock', locationId),
  inventoryMovementCreate: (m: unknown) => ipcRenderer.invoke('inventory:movement-create', m),
  inventoryMovements: (limit?: number) => ipcRenderer.invoke('inventory:movements', limit),
  inventorySearch: (query: string) => ipcRenderer.invoke('inventory:search', query),
  inventoryHistory: (limit?: number) => ipcRenderer.invoke('inventory:history', limit),
  inventoryPallets: () => ipcRenderer.invoke('inventory:pallets'),
  inventoryPalletCreate: (code: string, locationId: number | null, x: number, y: number, z: number) => ipcRenderer.invoke('inventory:pallet-create', code, locationId, x, y, z),
  inventoryBoxes: () => ipcRenderer.invoke('inventory:boxes'),
  inventoryBoxCreate: (code: string, palletId: number | null, locationId: number | null, x: number, y: number, z: number) => ipcRenderer.invoke('inventory:box-create', code, palletId, locationId, x, y, z),
};

export type Api = typeof api;

contextBridge.exposeInMainWorld('api', api);
