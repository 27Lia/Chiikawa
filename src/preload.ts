import { contextBridge, ipcRenderer } from 'electron';

const petAPI: PetAPI = {
  setIgnoreMouseEvents(ignore: boolean): void {
    if (typeof ignore !== 'boolean') {
      return;
    }
    ipcRenderer.send('set-ignore-mouse', ignore);
  },
};

contextBridge.exposeInMainWorld('petAPI', petAPI);
