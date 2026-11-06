import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { Store } from './db';
import { registerIpc } from './ipc';

let mainWindow: BrowserWindow | null = null;
let store: Store | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Logistics Studio',
    webPreferences: {
      // Security: no Node in the renderer, isolated context, preload-only bridge.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Data lives in the persistent per-user location, never in the install dir.
  const userData = app.getPath('userData');
  try {
    store = new Store(path.join(userData, 'logistics-studio.db'));
  } catch (err) {
    // A native-module ABI mismatch (better-sqlite3) or a corrupt DB must not
    // crash silently: show the error and quit.
    dialog.showErrorBox(
      'Logistics Studio could not start',
      `The local database could not be opened:\n${err instanceof Error ? err.message : String(err)}\n\nIf this mentions a Node.js version mismatch, reinstall dependencies with:\n  npm install\nwhich rebuilds the native database module for Electron (postinstall).`,
    );
    app.quit();
    return;
  }
  registerIpc(store, () => mainWindow);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try {
    store?.close();
  } catch {
    // ignore close errors on quit
  }
});
