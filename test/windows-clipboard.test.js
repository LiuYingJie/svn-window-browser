const test = require('node:test');
const assert = require('node:assert/strict');
const { powershellString } = require('../src/windows-clipboard');

test('PowerShell clipboard string escaping preserves apostrophes', () => {
  assert.equal(powershellString("C:\\Designer's files\\a.txt"), "'C:\\Designer''s files\\a.txt'");
});
