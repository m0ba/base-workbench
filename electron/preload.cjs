const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopWorkspace', {
  openTool: (payload) => ipcRenderer.invoke('workspace:open-tool', payload)
});
