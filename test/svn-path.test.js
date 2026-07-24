const test = require('node:test');
const assert = require('node:assert/strict');
const { svnDirectoryPath } = require('../src/svn-path');

test('svnDirectoryPath returns directory path unchanged', () => {
  assert.equal(svnDirectoryPath('a/b/c', 'dir'), 'a/b/c');
});

test('svnDirectoryPath returns parent path for files', () => {
  assert.equal(svnDirectoryPath('d/e/f.txt', 'file'), 'd/e');
});

test('svnDirectoryPath normalizes path separators and edge slashes', () => {
  assert.equal(svnDirectoryPath('/d\\e\\f.txt/', 'file'), 'd/e');
});
