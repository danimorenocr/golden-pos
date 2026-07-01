const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dockerAPI', {
  onDockerStatus: (callback) => ipcRenderer.on('docker-status', (event, value) => callback(value)),
  onDockerError: (callback) => ipcRenderer.on('docker-error', (event, value) => callback(value))
});
