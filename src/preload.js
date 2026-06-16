const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('svnBrowser', {
  repositories: {
    list: () => ipcRenderer.invoke('repositories:list'),
    accounts: () => ipcRenderer.invoke('repositories:accounts'),
    save: (repository) => ipcRenderer.invoke('repositories:save', repository),
    delete: (id) => ipcRenderer.invoke('repositories:delete', id),
    chooseLocalDirectory: () => ipcRenderer.invoke('repositories:choose-local-directory'),
    clearLocal: (id) => ipcRenderer.invoke('repositories:clear-local', id)
  },
  svn: {
    list: (repositoryId, relativePath) => ipcRenderer.invoke('svn:list', repositoryId, relativePath),
    search: (repositoryId, keyword) => ipcRenderer.invoke('svn:search', repositoryId, keyword),
    createFolder: (repositoryId, parentPath, folderName, message) =>
      ipcRenderer.invoke('svn:create-folder', repositoryId, parentPath, folderName, message),
    export: (repositoryId, relativePath) => ipcRenderer.invoke('svn:export', repositoryId, relativePath),
    applyToLocal: (repositoryId, relativePath, kind, taskId) =>
      ipcRenderer.invoke('svn:apply-to-local', repositoryId, relativePath, kind, taskId),
    onApplyProgress: (callback) => {
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on('svn:apply-progress', listener);
      return () => ipcRenderer.removeListener('svn:apply-progress', listener);
    },
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
    setCheckUpdates: (checkUpdates) => ipcRenderer.invoke('settings:set-check-updates', checkUpdates),
    chooseSvn: () => ipcRenderer.invoke('settings:choose-svn'),
    detectClient: () => ipcRenderer.invoke('settings:detect-client'),
    openDownload: () => ipcRenderer.invoke('settings:open-download')
  },
  updates: {
    check: (options) => ipcRenderer.invoke('updates:check', options),
    downloadAndInstall: (updateInfo) => ipcRenderer.invoke('updates:download-and-install', updateInfo),
    onDownloadProgress: (callback) => {
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on('updates:download-progress', listener);
      return () => ipcRenderer.removeListener('updates:download-progress', listener);
    }
  },
  system: {
    showItem: (targetPath) => ipcRenderer.invoke('system:show-item', targetPath)
  }
});
