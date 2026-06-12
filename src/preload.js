const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('svnBrowser', {
  repositories: {
    list: () => ipcRenderer.invoke('repositories:list'),
    accounts: () => ipcRenderer.invoke('repositories:accounts'),
    save: (repository) => ipcRenderer.invoke('repositories:save', repository),
    delete: (id) => ipcRenderer.invoke('repositories:delete', id)
  },
  svn: {
    list: (repositoryId, relativePath) => ipcRenderer.invoke('svn:list', repositoryId, relativePath),
    search: (repositoryId, keyword) => ipcRenderer.invoke('svn:search', repositoryId, keyword),
    export: (repositoryId, relativePath) => ipcRenderer.invoke('svn:export', repositoryId, relativePath),
    copyToClipboard: (repositoryId, relativePaths) =>
      ipcRenderer.invoke('svn:copy-to-clipboard', repositoryId, relativePaths)
  },
  cache: {
    getStats: () => ipcRenderer.invoke('cache:get-stats'),
    clear: () => ipcRenderer.invoke('cache:clear')
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    setViewMode: (viewMode) => ipcRenderer.invoke('settings:set-view-mode', viewMode),
    chooseSvn: () => ipcRenderer.invoke('settings:choose-svn'),
    detectClient: () => ipcRenderer.invoke('settings:detect-client'),
    openDownload: () => ipcRenderer.invoke('settings:open-download')
  },
  system: {
    showItem: (targetPath) => ipcRenderer.invoke('system:show-item', targetPath)
  }
});
