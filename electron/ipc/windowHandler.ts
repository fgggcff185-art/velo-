import { ipcMain, BrowserWindow } from 'electron';

let closeAllowed = false;

export function isCloseAllowed(): boolean {
  return closeAllowed;
}

export function allowClose(): void {
  closeAllowed = true;
}

export function registerWindowHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('window:minimize', () => {
    getWindow()?.minimize();
    return true;
  });

  ipcMain.handle('window:maximize-toggle', () => {
    const win = getWindow();
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });

  // Ask the renderer to save work first; renderer replies with window:force-close
  ipcMain.handle('window:close', () => {
    const win = getWindow();
    if (!win) return true;
    if (closeAllowed) {
      win.close();
    } else {
      win.webContents.send('app:close-request');
    }
    return true;
  });

  ipcMain.handle('window:force-close', () => {
    allowClose();
    getWindow()?.close();
    return true;
  });
}
