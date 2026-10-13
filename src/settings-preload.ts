import { contextBridge, ipcRenderer } from 'electron';

const settingsAPI: SettingsAPI = {
  getSettings(): Promise<AppSettings> {
    return ipcRenderer.invoke('get-settings');
  },
  updateSettings(partial: Partial<AppSettings>): void {
    ipcRenderer.send('update-settings', partial);
  },
  onSettingsChanged(callback: (settings: AppSettings) => void): void {
    ipcRenderer.on('settings-changed', (_event, settings: AppSettings) => {
      callback(settings);
    });
  },
  getAccessibilityStatus(): Promise<boolean> {
    return ipcRenderer.invoke('get-accessibility-status');
  },
  requestAccessibilityPermission(): Promise<boolean> {
    return ipcRenderer.invoke('request-accessibility-permission');
  },
  onAccessibilityStatus(callback: (granted: boolean) => void): void {
    ipcRenderer.on('accessibility-status', (_event, granted: boolean) => {
      callback(granted);
    });
  },
};

contextBridge.exposeInMainWorld('settingsAPI', settingsAPI);
