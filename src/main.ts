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

const DEFAULT_SETTINGS: AppSettings = {
  dragEnabled: true,
  reactionsEnabled: true,
  autoWalkEnabled: true,
  pinMode: process.env.PIN_MODE === 'top' ? 'top' : 'desktop',
  characters: {
    chiikawa: true,
    hachiware: true,
    usagi: true,
    momonga: true,
  },
};

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      characters: { ...DEFAULT_SETTINGS.characters, ...parsed.characters },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(current: AppSettings): void {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(current, null, 2), 'utf-8');
  } catch {
    // 저장 실패는 조용히 무시: 다음 변경 시 다시 시도된다.
  }
}

let settings: AppSettings = loadSettings();

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function applyWindowLevel(): void {
  if (!mainWindow) {
    return;
  }
  const level = (settings.pinMode === 'top' ? 'floating' : 'desktop') as AlwaysOnTopLevel;
  mainWindow.setAlwaysOnTop(true, level);
}

function broadcastSettings(): void {
  mainWindow?.webContents.send('settings-changed', settings);
  settingsWindow?.webContents.send('settings-changed', settings);
}

function updateSettings(partial: Partial<AppSettings>): void {
  settings = {
    ...settings,
    ...partial,
    characters: { ...settings.characters, ...(partial.characters ?? {}) },
  };
  saveSettings(settings);
  applyWindowLevel();
  broadcastSettings();
  refreshTrayMenu();
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

  mainWindow.webContents.once('did-finish-load', () => {
    broadcastSettings();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 380,
    height: 560,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: '치이카와 펫 설정',
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, '..', 'settings.html'));

  settingsWindow.webContents.once('did-finish-load', () => {
    broadcastSettings();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
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
  const pinLabel = settings.pinMode === 'top' ? '바탕화면에 붙이기' : '항상 위로 고정';

  return Menu.buildFromTemplate([
    {
      label: '설정 열기',
      click: () => {
        createSettingsWindow();
      },
    },
    { type: 'separator' },
    {
      label: pinLabel,
      click: () => {
        updateSettings({ pinMode: settings.pinMode === 'top' ? 'desktop' : 'top' });
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

ipcMain.handle('get-settings', () => settings);

ipcMain.on('update-settings', (_event, partial: unknown) => {
  if (typeof partial !== 'object' || partial === null) {
    return;
  }
  updateSettings(partial as Partial<AppSettings>);
});

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }
  createWindow();
  createTray();
  createSettingsWindow();
});

app.on('window-all-closed', () => {
  // 트레이 앱으로 유지: 메뉴의 "종료"를 통해서만 종료한다.
});
