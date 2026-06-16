const test = require('node:test');
const assert = require('node:assert/strict');
const { UPDATE_DOWNLOAD_DIR, compareVersions, shouldCheckToday } = require('../src/update-service');

test('compareVersions compares dotted numeric versions', () => {
  assert.equal(compareVersions('1.0.4', '1.0.3'), 1);
  assert.equal(compareVersions('1.0.3', '1.0.4'), -1);
  assert.equal(compareVersions('1.0.3', '1.0.3'), 0);
  assert.equal(compareVersions('1.2', '1.2.0'), 0);
});

test('shouldCheckToday allows one check per 24 hours', () => {
  const now = new Date('2026-06-16T12:00:00.000Z');
  assert.equal(shouldCheckToday('', now), true);
  assert.equal(shouldCheckToday('2026-06-16T08:00:00.000Z', now), false);
  assert.equal(shouldCheckToday('2026-06-15T11:00:00.000Z', now), true);
});

test('update downloads use a dedicated temp directory name', () => {
  assert.equal(UPDATE_DOWNLOAD_DIR, 'svn-browser-updates');
});
