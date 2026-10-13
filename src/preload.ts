import { contextBridge, ipcRenderer } from 'electron';

const petAPI: PetAPI = {
  setIgnoreMouseEvents(ignore: boolean): void {
    if (typeof ignore !== 'boolean') {
      return;
    }
    ipcRenderer.send('set-ignore-mouse', ignore);
  },
  onSettingsChanged(callback: (settings: AppSettings) => void): void {
    ipcRenderer.on('settings-changed', (_event, settings: AppSettings) => {
      callback(settings);
    });
  },
  onCursorPos(callback: (point: CursorPoint) => void): void {
    ipcRenderer.on('cursor-pos', (_event, point: CursorPoint) => {
      callback(point);
    });
  },
  grabCursor(payload: { dx: number; dy: number; durationMs: number }): void {
    ipcRenderer.send('grab-cursor', payload);
  },
};

contextBridge.exposeInMainWorld('petAPI', petAPI);
