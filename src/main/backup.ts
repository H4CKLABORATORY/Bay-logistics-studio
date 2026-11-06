// Backup / restore: JSON dump of the whole database. Restore asks the user
// to confirm in the renderer before this runs (destructive: replaces all data).
import { BrowserWindow, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { Store } from './db';

export async function exportBackupFile(store: Store, win: BrowserWindow | null): Promise<string | null> {
  const stamp = new Date().toISOString().slice(0, 10);
  const defaultPath = path.join(require('os').homedir(), 'Downloads', `logistics-studio-backup-${stamp}.json`);
  const res = win
    ? await dialog.showSaveDialog(win, { defaultPath, filters: [{ name: 'JSON backup', extensions: ['json'] }] })
    : { canceled: false, filePath: defaultPath };
  if (res.canceled || !res.filePath) return null;
  fs.writeFileSync(res.filePath, JSON.stringify(store.dumpAll(), null, 2), 'utf8');
  return res.filePath;
}

export async function importBackupFile(store: Store, win: BrowserWindow | null): Promise<boolean> {
  const res = win
    ? await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'JSON backup', extensions: ['json'] }],
      })
    : { canceled: true, filePaths: [] as string[] };
  if (res.canceled || !res.filePaths[0]) return false;
  const raw = fs.readFileSync(res.filePaths[0], 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Backup file is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || (parsed as Record<string, unknown>).app !== 'logistics-studio') {
    throw new Error('Backup file is not a Logistics Studio backup.');
  }
  store.restoreAll(parsed as Record<string, unknown>);
  return true;
}
