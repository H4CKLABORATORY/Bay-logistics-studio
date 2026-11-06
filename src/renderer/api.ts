// Typed wrapper over window.api (exposed by preload). Every call returns
// { ok, data } or { ok, error }; unwrap throws on error so pages can use
// try/catch with a single error banner.
import type { Api } from '../main/preload';
import type { AppSettings, BolDocument, BolHistoryEntry, CatalogKind, CatalogRecord } from '../shared/types';

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
  backupRestore: () => unwrap<{ restored: boolean }>(window.api.backupRestore()),
};
