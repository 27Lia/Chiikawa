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
};

contextBridge.exposeInMainWorld('settingsAPI', settingsAPI);
