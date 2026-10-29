const { app, BrowserWindow, Menu, net, protocol } = require('electron');
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
const toolWindows = new Map();
let mainWindow;

function allowedToolUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return ['https:', 'http:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function openToolWindow({ id, title, url }) {
  let target = allowedToolUrl(url);
  try {
    const parsed = new URL(url, 'baseworkbench://app/index.html');
    if (parsed.protocol === 'baseworkbench:') target = parsed;
  } catch {
    // Keep the HTTP/HTTPS URL returned above.
  }
  if (!target) return { ok: false, message: '应用地址无效' };

  const existing = toolWindows.get(id);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return { ok: true, reused: true };
  }

  const toolWindow = new BrowserWindow({
    width: 1240,
    height: 880,
    minWidth: 380,
    minHeight: 560,
    title: String(title || '业务应用'),
    backgroundColor: '#f4f7f3',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  toolWindow.setMenuBarVisibility(false);
  toolWindow.loadURL(target.href);
  toolWindow.webContents.setWindowOpenHandler(({ url: nextUrl }) => {
    const parsed = allowedToolUrl(nextUrl);
    if (!parsed) return { action: 'deny' };
    toolWindow.loadURL(parsed.href);
    return { action: 'deny' };
  });
  toolWindow.on('closed', () => {
    if (toolWindows.get(id) === toolWindow) toolWindows.delete(id);
  });
  toolWindows.set(id, toolWindow);
  return { ok: true, reused: false };
}

async function serveWorkspaceFile(request) {
  const url = new URL(request.url);
  let requestedPath = decodeURIComponent(url.pathname || '/');
  if (requestedPath === '/') requestedPath = '/index.html';

  const filePath = path.resolve(APP_ROOT, `.${requestedPath.startsWith('/') ? requestedPath : '/' + requestedPath}`);
  const relativePath = path.relative(APP_ROOT, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return new Response('Forbidden', { status: 403 });
  }

  let resolvedPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    ? filePath
    : null;
  if (!resolvedPath && !path.extname(requestedPath)) {
    const directoryIndex = path.join(filePath, 'index.html');
    if (fs.existsSync(directoryIndex) && fs.statSync(directoryIndex).isFile()) resolvedPath = directoryIndex;
  }
  if (!resolvedPath) return new Response('Not found', { status: 404 });
  return net.fetch(pathToFileURL(resolvedPath).toString());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 760,
    minHeight: 640,
    title: '基地工作台',
    backgroundColor: '#f4f7f3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
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
    Menu.setApplicationMenu(null);
    const { ipcMain } = require('electron');
    ipcMain.handle('workspace:open-tool', (_event, payload) => {
      if (!payload || typeof payload.id !== 'string' || !payload.id.trim()) {
        return { ok: false, message: '应用标识无效' };
      }
      return openToolWindow({
        id: payload.id.trim().slice(0, 80),
        title: typeof payload.title === 'string' ? payload.title.slice(0, 80) : '业务应用',
        url: payload.url
      });
    });

    protocol.handle('baseworkbench', serveWorkspaceFile);

    createWindow();
  });

  app.on('activate', focusOrCreateWindow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
