const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JsonStore } = require('../src/store');

test('JsonStore persists encrypted passwords and returns safe repository lists', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'svn-browser-'));
  const filePath = path.join(directory, 'data.json');
  const store = new JsonStore(filePath, {
    encrypt: (value) => Buffer.from(value).toString('base64'),
    decrypt: (value) => Buffer.from(value, 'base64').toString()
  });

  const saved = store.saveRepository({
    name: 'Assets',
    url: 'https://example.test/svn/',
    localDirectory: 'D:\\projects\\assets',
    username: 'alice',
    password: 'secret'
  });

  assert.equal(store.getRepository(saved.id).password, 'secret');
  assert.equal(store.getRepository(saved.id).localDirectory, 'D:\\projects\\assets');
  assert.equal(store.getRepositories()[0].passwordEncrypted, undefined);
  assert.equal(fs.readFileSync(filePath, 'utf8').includes('secret'), false);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('JsonStore reuses saved credentials without exposing passwords', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'svn-browser-account-'));
  const store = new JsonStore(path.join(directory, 'data.json'), {
    encrypt: (value) => Buffer.from(value).toString('base64'),
    decrypt: (value) => Buffer.from(value, 'base64').toString()
  });
  const source = store.saveRepository({
    name: 'Source',
    url: 'https://example.test/source',
    username: 'alice',
    password: 'secret'
  });
  const target = store.saveRepository({
    name: 'Target',
    url: 'https://example.test/target',
    credentialSourceId: source.id
  });

  assert.deepEqual(store.getSavedAccounts(), [
    { id: source.id, username: 'alice', sourceName: 'Source' }
  ]);
  assert.equal(store.getRepository(target.id).username, 'alice');
  assert.equal(store.getRepository(target.id).password, 'secret');
  fs.rmSync(directory, { recursive: true, force: true });
});

test('JsonStore persists the selected view mode', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'svn-browser-view-'));
  const filePath = path.join(directory, 'data.json');
  const store = new JsonStore(filePath);
  store.saveSettings({ viewMode: 'icons' });

  assert.equal(new JsonStore(filePath).getSettings().viewMode, 'icons');
  fs.rmSync(directory, { recursive: true, force: true });
});
