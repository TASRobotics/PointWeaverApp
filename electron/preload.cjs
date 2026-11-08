const { contextBridge, ipcRenderer } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('electronAPI', {
  listPaths: call('paths:list'),
  writePath: call('paths:write'),
  renamePath: call('paths:rename'),
  deletePath: call('paths:delete'),
  selectDir: call('dialog:selectDir'),
  readSettings: call('settings:read'),
  writeSettings: call('settings:write'),
  pickFieldImage: call('field:pick'),
  saveFieldImage: call('field:save'),
  readFieldImage: call('field:read'),
  clearFieldImage: call('field:clear'),
});
