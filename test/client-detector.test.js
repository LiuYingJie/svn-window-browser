const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { detectSvnClient } = require('../src/client-detector');

test('detectSvnClient distinguishes TortoiseSVN from svn.exe', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svn-client-'));
  const bin = path.join(root, 'TortoiseSVN', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'TortoiseProc.exe'), '');

  const tortoiseOnly = detectSvnClient('', {
    ProgramFiles: root,
    'ProgramFiles(x86)': path.join(root, 'x86'),
    PATH: ''
  });
  assert.equal(tortoiseOnly.kind, 'tortoise-only');
  assert.equal(tortoiseOnly.ready, false);

  fs.writeFileSync(path.join(bin, 'svn.exe'), '');
  const withCli = detectSvnClient('', {
    ProgramFiles: root,
    'ProgramFiles(x86)': path.join(root, 'x86'),
    PATH: ''
  });
  assert.equal(withCli.kind, 'tortoise-with-cli');
  assert.equal(withCli.ready, true);

  fs.rmSync(root, { recursive: true, force: true });
});

test('detectSvnClient prefers a bundled command-line client', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svn-bundled-'));
  const executable = path.join(root, 'svn.exe');
  fs.writeFileSync(executable, '');

  const client = detectSvnClient('', {
    ProgramFiles: path.join(root, 'program-files'),
    'ProgramFiles(x86)': path.join(root, 'program-files-x86'),
    PATH: ''
  }, [executable]);

  assert.equal(client.ready, true);
  assert.equal(client.svnExecutable, executable);
  fs.rmSync(root, { recursive: true, force: true });
});
