const { app, BrowserWindow, net, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'baseworkbench',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

const APP_ROOT = path.resolve(__dirname, '../dist');
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 760,
    minHeight: 640,
    title: '基地工作台',
    backgroundColor: '#f4f7f3',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadURL('baseworkbench://app/index.html');
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function focusOrCreateWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', focusOrCreateWindow);

  app.whenReady().then(async () => {
    protocol.handle('baseworkbench', async (request) => {
      const url = new URL(request.url);
      let requestedPath = decodeURIComponent(url.pathname || '/');
      if (requestedPath === '/') requestedPath = '/index.html';

      const filePath = path.resolve(APP_ROOT, `.${requestedPath}`);
      const relativePath = path.relative(APP_ROOT, filePath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return new Response('Forbidden', { status: 403 });
      }

      const resolvedPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
        ? filePath
        : path.join(APP_ROOT, 'index.html');
      return net.fetch(pathToFileURL(resolvedPath).toString());
    });

    createWindow();
  });

  app.on('activate', focusOrCreateWindow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
