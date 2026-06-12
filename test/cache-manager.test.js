const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CacheManager } = require('../src/cache-manager');

function createFixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'svn-browser-cache-test-'));
}

test('CacheManager reports cache size and clears all batches', () => {
  const root = createFixture();
  try {
    const manager = new CacheManager(root);
    const batch = manager.createDirectory();
    fs.writeFileSync(path.join(batch, 'one.txt'), '12345');
    fs.mkdirSync(path.join(batch, 'folder'));
    fs.writeFileSync(path.join(batch, 'folder', 'two.txt'), '123');

    assert.deepEqual(manager.getStats(), { bytes: 8, files: 2, batches: 1 });
    assert.throws(() => manager.clear(), /正在准备复制文件/);
    manager.releaseDirectory(batch);
    assert.deepEqual(manager.clear(), { bytes: 0, files: 0, batches: 0 });
    assert.deepEqual(manager.getStats(), { bytes: 0, files: 0, batches: 0 });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CacheManager removes expired and oldest oversized batches', () => {
  const root = createFixture();
  try {
    const manager = new CacheManager(root, { maxAgeMs: 1000, maxBytes: 5 });
    const expired = manager.createDirectory();
    fs.writeFileSync(path.join(expired, 'expired.txt'), '123');
    manager.releaseDirectory(expired);
    const oldTime = new Date(Date.now() - 2000);
    fs.utimesSync(expired, oldTime, oldTime);

    const oldest = manager.createDirectory();
    fs.writeFileSync(path.join(oldest, 'oldest.txt'), '1234');
    manager.releaseDirectory(oldest);
    const recent = manager.createDirectory();
    fs.writeFileSync(path.join(recent, 'recent.txt'), '5678');
    manager.releaseDirectory(recent);
    const middleTime = new Date(Date.now() - 500);
    fs.utimesSync(oldest, middleTime, middleTime);

    assert.deepEqual(manager.cleanup(), { bytes: 4, files: 1, batches: 1 });
    assert.equal(fs.existsSync(expired), false);
    assert.equal(fs.existsSync(oldest), false);
    assert.equal(fs.existsSync(recent), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
