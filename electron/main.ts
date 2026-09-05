import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'path';
import { registerFileHandlers } from './ipc/fileHandler';
import { registerTerminalHandlers } from './ipc/terminalHandler';
import { registerAIHandlers } from './ipc/aiHandler';
import { registerStoreHandlers } from './ipc/storeHandler';
import { registerWindowHandlers, isCloseAllowed } from './ipc/windowHandler';
import { registerMcpHandlers } from './ipc/mcpHandler';
import { registerExtensionsHandlers } from './ipc/extensionsHandler';

app.setName('Velo IDE');

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 980,
    minHeight: 620,
    frame: false,
    show: false,
    backgroundColor: '#0b0e14',
    title: 'Velo IDE',
    icon: path.join(app.getAppPath(), 'build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      webSecurity: true,
    },
  });

  if (process.env.VELO_DEV) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized', true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized', false));

  // Intercept every close path (X button, Alt+F4, system) so the renderer can save first
  mainWindow.on('close', (e) => {
    if (!isCloseAllowed()) {
      e.preventDefault();
      mainWindow?.webContents.send('app:close-request');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerFileHandlers();
    registerTerminalHandlers();
    registerAIHandlers();
    registerStoreHandlers();
    registerWindowHandlers(() => mainWindow);
    registerMcpHandlers();
    registerExtensionsHandlers();

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
