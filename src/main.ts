import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  screen,
  ipcMain,
  systemPreferences,
} from 'electron';
import * as fs from 'fs';
import * as path from 'path';

type AlwaysOnTopLevel = Parameters<BrowserWindow['setAlwaysOnTop']>[1];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let robot: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  robot = require('@hurdlegroup/robotjs');
} catch {
  robot = null;
}

const DEFAULT_SETTINGS: AppSettings = {
  dragEnabled: true,
  reactionsEnabled: true,
  autoWalkEnabled: true,
  cursorChaseEnabled: false,
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
let cursorPollTimer: NodeJS.Timeout | null = null;

function applyWindowLevel(): void {
  if (!mainWindow) {
    return;
  }
  const level = (settings.pinMode === 'top' ? 'floating' : 'desktop') as AlwaysOnTopLevel;
  mainWindow.setAlwaysOnTop(true, level);
}

function isAccessibilityTrusted(): boolean {
  if (process.platform !== 'darwin') {
    return true;
  }
  return systemPreferences.isTrustedAccessibilityClient(false);
}

function broadcastAccessibilityStatus(): void {
  const granted = isAccessibilityTrusted();
  mainWindow?.webContents.send('accessibility-status', granted);
  settingsWindow?.webContents.send('accessibility-status', granted);
}

function startCursorPolling(): void {
  if (cursorPollTimer) {
    return;
  }
  cursorPollTimer = setInterval(() => {
    if (!mainWindow) {
      return;
    }
    const globalPoint = screen.getCursorScreenPoint();
    const bounds = mainWindow.getBounds();
    mainWindow.webContents.send('cursor-pos', {
      x: globalPoint.x - bounds.x,
      y: globalPoint.y - bounds.y,
    });
  }, 80);
}

function stopCursorPolling(): void {
  if (cursorPollTimer) {
    clearInterval(cursorPollTimer);
    cursorPollTimer = null;
  }
}

function syncCursorPolling(): void {
  if (settings.cursorChaseEnabled) {
    startCursorPolling();
  } else {
    stopCursorPolling();
  }
}

function broadcastSettings(): void {
  mainWindow?.webContents.send('settings-changed', settings);
  settingsWindow?.webContents.send('settings-changed', settings);
  broadcastAccessibilityStatus();
}

function updateSettings(partial: Partial<AppSettings>): void {
  settings = {
    ...settings,
    ...partial,
    characters: { ...settings.characters, ...(partial.characters ?? {}) },
  };
  saveSettings(settings);
  applyWindowLevel();
  syncCursorPolling();
  broadcastSettings();
  refreshTrayMenu();
}

function performCursorGrab(dx: number, dy: number, durationMs: number): void {
  if (!robot || !settings.cursorChaseEnabled || !isAccessibilityTrusted()) {
    return;
  }
  const display = screen.getPrimaryDisplay().bounds;
  const start = robot.getMousePos();
  const targetX = Math.max(display.x, Math.min(display.x + display.width, start.x + dx));
  const targetY = Math.max(display.y, Math.min(display.y + display.height, start.y + dy));
  const steps = Math.max(1, Math.round(durationMs / 16));
  const stepX = (targetX - start.x) / steps;
  const stepY = (targetY - start.y) / steps;
  let i = 0;
  const timer = setInterval(() => {
    i += 1;
    try {
      robot.moveMouse(Math.round(start.x + stepX * i), Math.round(start.y + stepY * i));
    } catch {
      clearInterval(timer);
      return;
    }
    if (i >= steps) {
      clearInterval(timer);
    }
  }, 16);
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
    height: 640,
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

ipcMain.handle('get-accessibility-status', () => isAccessibilityTrusted());

ipcMain.handle('request-accessibility-permission', () => {
  if (process.platform !== 'darwin') {
    return true;
  }
  const granted = systemPreferences.isTrustedAccessibilityClient(true);
  broadcastAccessibilityStatus();
  return granted;
});

ipcMain.on('grab-cursor', (_event, payload: unknown) => {
  if (typeof payload !== 'object' || payload === null) {
    return;
  }
  const { dx, dy, durationMs } = payload as { dx: number; dy: number; durationMs: number };
  if (typeof dx !== 'number' || typeof dy !== 'number' || typeof durationMs !== 'number') {
    return;
  }
  performCursorGrab(dx, dy, durationMs);
});

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }
  createWindow();
  createTray();
  createSettingsWindow();
  syncCursorPolling();
});

app.on('window-all-closed', () => {
  // 트레이 앱으로 유지: 메뉴의 "종료"를 통해서만 종료한다.
});
