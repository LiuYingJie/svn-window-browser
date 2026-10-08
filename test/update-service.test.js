const test = require('node:test');
const assert = require('node:assert/strict');
const { UPDATE_DOWNLOAD_DIR, compareVersions } = require('../src/update-service');

test('compareVersions compares dotted numeric versions', () => {
  assert.equal(compareVersions('1.0.4', '1.0.3'), 1);
  assert.equal(compareVersions('1.0.3', '1.0.4'), -1);
  assert.equal(compareVersions('1.0.3', '1.0.3'), 0);
  assert.equal(compareVersions('1.2', '1.2.0'), 0);
});

test('update downloads use a dedicated temp directory name', () => {
  assert.equal(UPDATE_DOWNLOAD_DIR, 'svn-browser-updates');
});
