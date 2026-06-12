const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024;

function directoryStats(directory) {
  if (!fs.existsSync(directory)) {
    return { bytes: 0, files: 0 };
  }

  let bytes = 0;
  let files = 0;
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile()) {
        bytes += fs.statSync(entryPath).size;
        files += 1;
      }
    }
  }
  return { bytes, files };
}

class CacheManager {
  constructor(rootDirectory, options = {}) {
    this.rootDirectory = rootDirectory;
    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.activeDirectories = new Set();
  }

  ensureRoot() {
    fs.mkdirSync(this.rootDirectory, { recursive: true });
  }

  createDirectory() {
    this.ensureRoot();
    const directory = path.join(
      this.rootDirectory,
      `${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    fs.mkdirSync(directory, { recursive: true });
    this.activeDirectories.add(directory);
    return directory;
  }

  releaseDirectory(directory) {
    this.activeDirectories.delete(directory);
  }

  batches() {
    this.ensureRoot();
    return fs.readdirSync(this.rootDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const directory = path.join(this.rootDirectory, entry.name);
        const stats = directoryStats(directory);
        return {
          directory,
          modifiedAt: fs.statSync(directory).mtimeMs,
          ...stats
        };
      })
      .sort((left, right) => left.modifiedAt - right.modifiedAt);
  }

  getStats() {
    const batches = this.batches();
    return batches.reduce((total, batch) => ({
      bytes: total.bytes + batch.bytes,
      files: total.files + batch.files,
      batches: total.batches + 1
    }), { bytes: 0, files: 0, batches: 0 });
  }

  cleanup(now = Date.now()) {
    let batches = this.batches();
    for (const batch of batches) {
      if (!this.activeDirectories.has(batch.directory) && now - batch.modifiedAt > this.maxAgeMs) {
        fs.rmSync(batch.directory, { recursive: true, force: true });
      }
    }

    batches = this.batches();
    let totalBytes = batches.reduce((total, batch) => total + batch.bytes, 0);
    for (const batch of batches) {
      if (totalBytes <= this.maxBytes) break;
      if (this.activeDirectories.has(batch.directory)) continue;
      fs.rmSync(batch.directory, { recursive: true, force: true });
      totalBytes -= batch.bytes;
    }
    return this.getStats();
  }

  clear() {
    if (this.activeDirectories.size > 0) {
      throw new Error('正在准备复制文件，请完成后再清理缓存');
    }
    fs.rmSync(this.rootDirectory, { recursive: true, force: true });
    this.ensureRoot();
    return { bytes: 0, files: 0, batches: 0 };
  }
}

module.exports = {
  CacheManager,
  DEFAULT_MAX_AGE_MS,
  DEFAULT_MAX_BYTES,
  directoryStats
};
