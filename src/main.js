const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require('electron');
const { JsonStore } = require('./store');
const { SvnService } = require('./svn-service');
const { detectSvnClient } = require('./client-detector');
const { copyFilesToClipboard } = require('./windows-clipboard');
const { CacheManager } = require('./cache-manager');
const {
  clearLocalDirectory,
  resolveLocalResource,
  validateLocalDirectory
} = require('./local-resources');

let mainWindow;
let store;
let svn;
let cacheManager;
let cacheCleanupTimer;

function detectClient() {
  const bundledExecutables = app.isPackaged
    ? [path.join(process.resourcesPath, 'svn', 'bin', 'svn.exe')]
    : [path.join(app.getAppPath(), 'vendor', 'svn', 'bin', 'svn.exe')];
  return detectSvnClient(store.getSettings().svnExecutable, process.env, bundledExecutables);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#f5f7fb',
    title: 'SVN Browser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function registerHandlers() {
  ipcMain.handle('repositories:list', () => store.getRepositories());
  ipcMain.handle('repositories:accounts', () => store.getSavedAccounts());
  ipcMain.handle('repositories:save', (_event, repository) => {
    if (repository.localDirectory?.trim()) {
      repository.localDirectory = validateLocalDirectory(repository.localDirectory);
    }
    return store.saveRepository(repository);
  });
  ipcMain.handle('repositories:delete', (_event, id) => store.deleteRepository(id));
  ipcMain.handle('repositories:choose-local-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择仓库本地目录',
      properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled ? null : result.filePaths[0] || null;
  });
  ipcMain.handle('repositories:clear-local', async (_event, repositoryId) => {
    const repository = store.getRepository(repositoryId);
    if (!repository) throw new Error('仓库不存在或已被删除');
    const localDirectory = validateLocalDirectory(repository.localDirectory);
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '删除本地资源',
      message: `确定清空“${repository.name}”的全部本地资源吗？`,
      detail: `将永久删除以下目录中的所有文件和文件夹，但保留目录本身：\n${localDirectory}`,
      buttons: ['取消', '删除本地资源'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });
    if (result.response !== 1) return null;
    return clearLocalDirectory(localDirectory);
  });

  ipcMain.handle('svn:list', async (_event, repositoryId, relativePath) => {
    const repository = store.getRepository(repositoryId);
    if (!repository) throw new Error('仓库不存在或已被删除');
    return svn.list(repository, relativePath);
  });
  ipcMain.handle('svn:search', async (_event, repositoryId, keyword) => {
    const repository = store.getRepository(repositoryId);
    if (!repository) throw new Error('仓库不存在或已被删除');
    return svn.search(repository, keyword);
  });
  ipcMain.handle('svn:create-folder', async (_event, repositoryId, parentPath, folderName, message) => {
    const repository = store.getRepository(repositoryId);
    if (!repository) throw new Error('仓库不存在或已被删除');
    return svn.createFolder(repository, parentPath, folderName, message);
  });

  ipcMain.handle('svn:export', async (_event, repositoryId, relativePath) => {
    const repository = store.getRepository(repositoryId);
    if (!repository) throw new Error('仓库不存在或已被删除');

    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择保存位置',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return svn.export(repository, relativePath, result.filePaths[0]);
  });
  ipcMain.handle('svn:apply-to-local', async (event, repositoryId, relativePath, kind, taskId) => {
    const repository = store.getRepository(repositoryId);
    if (!repository) throw new Error('仓库不存在或已被删除');
    if (!['file', 'dir'].includes(kind)) throw new Error('不支持的资源类型');
    if (typeof taskId !== 'string' || !taskId) throw new Error('无效的后台任务');
    const { destination } = resolveLocalResource(repository.localDirectory, relativePath);
    const sendProgress = (progress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('svn:apply-progress', { taskId, ...progress });
      }
    };
    return svn.applyToLocal(repository, relativePath, kind, destination, sendProgress);
  });

  ipcMain.handle('svn:copy-to-clipboard', async (_event, repositoryId, relativePaths) => {
    const repository = store.getRepository(repositoryId);
    if (!repository) throw new Error('仓库不存在或已被删除');
    if (!Array.isArray(relativePaths) || relativePaths.length === 0) {
      throw new Error('请先选择要复制的文件或文件夹');
    }

    const clipboardRoot = cacheManager.createDirectory();
    try {
      const exportedPaths = await svn.exportMany(repository, relativePaths, clipboardRoot);
      await copyFilesToClipboard(exportedPaths);
      return { count: exportedPaths.length };
    } catch (error) {
      fs.rmSync(clipboardRoot, { recursive: true, force: true });
      throw error;
    } finally {
      cacheManager.releaseDirectory(clipboardRoot);
    }
  });

  ipcMain.handle('cache:get-stats', () => cacheManager.getStats());
  ipcMain.handle('cache:clear', () => cacheManager.clear());

  ipcMain.handle('settings:get', () => ({
    ...store.getSettings(),
    client: detectClient()
  }));
  ipcMain.handle('settings:set-view-mode', (_event, viewMode) => {
    if (!['list', 'icons'].includes(viewMode)) throw new Error('不支持的视图模式');
    return store.saveSettings({ viewMode });
  });
  ipcMain.handle('settings:detect-client', () => {
    const client = detectClient();
    if (client.ready && client.svnExecutable !== store.getSettings().svnExecutable) {
      store.saveSettings({ svnExecutable: client.svnExecutable });
    }
    return client;
  });
  ipcMain.handle('settings:choose-svn', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 svn.exe',
      properties: ['openFile'],
      filters: [{ name: 'SVN executable', extensions: ['exe'] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    store.saveSettings({ svnExecutable: result.filePaths[0] });
    return detectSvnClient(result.filePaths[0]);
  });
  ipcMain.handle('settings:open-download', () => {
    shell.openExternal('https://subversion.apache.org/packages.html#windows');
  });

  ipcMain.handle('system:show-item', (_event, targetPath) => {
    if (targetPath) shell.showItemInFolder(targetPath);
  });
}

app.whenReady().then(async () => {
  const passwordCodec = {
    encrypt: (value) => safeStorage.encryptString(value).toString('base64'),
    decrypt: (value) => safeStorage.decryptString(Buffer.from(value, 'base64'))
  };
  store = new JsonStore(path.join(app.getPath('userData'), 'data.json'), passwordCodec);
  cacheManager = new CacheManager(path.join(app.getPath('temp'), 'svn-browser-clipboard'));
  cacheManager.cleanup();
  cacheCleanupTimer = setInterval(() => cacheManager.cleanup(), 60 * 60 * 1000);
  cacheCleanupTimer.unref();
  svn = new SvnService(() => {
    const client = detectClient();
    return client.svnExecutable;
  });
  registerHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
