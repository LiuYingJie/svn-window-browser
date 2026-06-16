const fs = require('node:fs');
const path = require('node:path');
const { app, shell } = require('electron');

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeConfig(raw) {
  const manifestUrl = typeof raw?.newVersionLink === 'string' ? raw.newVersionLink.trim() : '';
  return {
    enabled: Boolean(manifestUrl),
    manifestUrl
  };
}

function readUpdateConfig() {
  if (!app.isPackaged) {
    return { enabled: false, manifestUrl: '' };
  }

  try {
    const configPath = path.join(process.resourcesPath, 'config.json');
    return normalizeConfig(JSON.parse(fs.readFileSync(configPath, 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Could not read update config:', error);
    }
    return { enabled: false, manifestUrl: '' };
  }
}

function compareVersions(left, right) {
  const leftParts = String(left || '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = String(right || '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function shouldCheckToday(lastUpdateCheckAt, now = new Date()) {
  if (!lastUpdateCheckAt) return true;
  const last = new Date(lastUpdateCheckAt);
  if (Number.isNaN(last.getTime())) return true;
  return now.getTime() - last.getTime() >= DAY_MS;
}

class UpdateService {
  constructor({ store, currentVersion }) {
    this.store = store;
    this.currentVersion = currentVersion;
    this.config = readUpdateConfig();
  }

  getStatus() {
    const installDirectory = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
    return {
      supported: this.config.enabled,
      installDirectory
    };
  }

  async check({ force = false } = {}) {
    const settings = this.store.getSettings();
    if (!this.config.enabled || settings.checkUpdates === false) {
      return { supported: this.config.enabled, updateAvailable: false, skipped: true };
    }
    if (!force && !shouldCheckToday(settings.lastUpdateCheckAt)) {
      return { supported: true, updateAvailable: false, skipped: true };
    }

    this.store.saveSettings({ lastUpdateCheckAt: new Date().toISOString() });
    const response = await fetch(this.config.manifestUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`更新配置读取失败：HTTP ${response.status}`);
    }
    const remote = await response.json();
    const remoteVersion = typeof remote?.version === 'string' ? remote.version.trim() : '';
    const downloadUrl = typeof remote?.newVersionLink === 'string' ? remote.newVersionLink.trim() : '';
    if (!remoteVersion || !downloadUrl) {
      throw new Error('远程更新配置缺少 version 或 newVersionLink');
    }
    if (compareVersions(remoteVersion, this.currentVersion) <= 0) {
      return { supported: true, updateAvailable: false, currentVersion: this.currentVersion, remoteVersion };
    }
    return {
      supported: true,
      updateAvailable: true,
      currentVersion: this.currentVersion,
      remoteVersion,
      downloadUrl
    };
  }

  async downloadAndInstall(updateInfo) {
    const downloadUrl = typeof updateInfo?.downloadUrl === 'string' ? updateInfo.downloadUrl : '';
    if (!this.config.enabled || !downloadUrl) {
      throw new Error('没有可用的更新下载地址');
    }

    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`更新下载失败：HTTP ${response.status}`);
    }
    const fileName = path.basename(new URL(downloadUrl).pathname) || `SVN-Browser-${Date.now()}.exe`;
    const installerPath = path.join(app.getPath('temp'), fileName);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(installerPath, buffer);

    const openError = await shell.openPath(installerPath);
    if (openError) throw new Error(openError);
    setTimeout(() => app.quit(), 1000);
    return { installerPath };
  }
}

module.exports = {
  DAY_MS,
  UpdateService,
  compareVersions,
  readUpdateConfig,
  shouldCheckToday
};
