const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  clearLocalDirectory,
  resolveLocalResource,
  validateLocalDirectory
} = require('../src/local-resources');

test('local resource paths stay inside the configured directory', () => {
  const root = path.join(os.tmpdir(), 'svn-browser-local');
  assert.deepEqual(resolveLocalResource(root, 'assets/icons/logo.png'), {
    root: path.resolve(root),
    destination: path.resolve(root, 'assets', 'icons', 'logo.png')
  });
  assert.throws(() => resolveLocalResource(root, '../outside.txt'), /无效的仓库相对路径/);
  assert.throws(() => validateLocalDirectory(path.parse(root).root), /不能是磁盘根目录/);
});

test('clearLocalDirectory removes children but preserves the root directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svn-browser-local-clear-'));
  fs.writeFileSync(path.join(root, 'one.txt'), 'one');
  fs.mkdirSync(path.join(root, 'folder'));
  fs.writeFileSync(path.join(root, 'folder', 'two.txt'), 'two');

  const result = clearLocalDirectory(root);

  assert.equal(result.removed, 2);
  assert.equal(fs.existsSync(root), true);
  assert.deepEqual(fs.readdirSync(root), []);
  fs.rmSync(root, { recursive: true, force: true });
});
