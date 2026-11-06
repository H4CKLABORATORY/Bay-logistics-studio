import { contextBridge, ipcRenderer } from 'electron';

// Secure IPC surface: only the channels listed here are exposed to the
// renderer. No Node APIs, no remote module, no direct DB access.
const api = {
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
  backupRestore: () => ipcRenderer.invoke('backup:restore'),
};

export type Api = typeof api;

contextBridge.exposeInMainWorld('api', api);
