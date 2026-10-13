import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  screen,
  ipcMain,
} from 'electron';
import * as fs from 'fs';
import * as path from 'path';

type AlwaysOnTopLevel = Parameters<BrowserWindow['setAlwaysOnTop']>[1];

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let pinMode: 'desktop' | 'top' = process.env.PIN_MODE === 'top' ? 'top' : 'desktop';

function applyWindowLevel(): void {
  if (!mainWindow) {
    return;
  }
  const level = (pinMode === 'top' ? 'floating' : 'desktop') as AlwaysOnTopLevel;
  mainWindow.setAlwaysOnTop(true, level);
}

function createWindow(): void {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width } = primaryDisplay.workArea;
  const windowHeight = 480;

  mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height: windowHeight,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  applyWindowLevel();
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildTrayIcon(): Electron.NativeImage {
  const iconPath = path.join(__dirname, '..', 'assets', 'trayTemplate.png');
  if (fs.existsSync(iconPath)) {
    const image = nativeImage.createFromPath(iconPath);
    image.setTemplateImage(true);
    return image;
  }
  return nativeImage.createEmpty();
}

function buildTrayMenu(): Menu {
  const loginItemSettings = app.getLoginItemSettings();
  const pinLabel = pinMode === 'top' ? '바탕화면에 붙이기' : '항상 위로 고정';

  return Menu.buildFromTemplate([
    {
      label: pinLabel,
      click: () => {
        pinMode = pinMode === 'top' ? 'desktop' : 'top';
        applyWindowLevel();
        refreshTrayMenu();
      },
    },
    {
      label: '로그인 시 자동 실행',
      type: 'checkbox',
      checked: loginItemSettings.openAtLogin,
      click: () => {
        const current = app.getLoginItemSettings();
        app.setLoginItemSettings({ openAtLogin: !current.openAtLogin });
        refreshTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        app.quit();
      },
    },
  ]);
}

function refreshTrayMenu(): void {
  if (!tray) {
    return;
  }
  tray.setContextMenu(buildTrayMenu());
}

function createTray(): void {
  tray = new Tray(buildTrayIcon());
  tray.setToolTip('HangingPet');
  refreshTrayMenu();
}

ipcMain.on('set-ignore-mouse', (_event, ignore: unknown) => {
  if (typeof ignore !== 'boolean' || !mainWindow) {
    return;
  }
  mainWindow.setIgnoreMouseEvents(ignore, ignore ? { forward: true } : undefined);
});

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // 트레이 앱으로 유지: 메뉴의 "종료"를 통해서만 종료한다.
});
