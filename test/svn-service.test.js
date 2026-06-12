const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SvnService, parseSvnList } = require('../src/svn-service');

test('parseSvnList parses and sorts directories before files', () => {
  const xml = `<?xml version="1.0"?>
    <lists><list path="https://example.test/svn">
      <entry kind="file">
        <name>readme.txt</name><size>12</size>
        <commit revision="4"><author>alice</author><date>2026-06-01T10:00:00.000Z</date></commit>
      </entry>
      <entry kind="dir">
        <name>assets &amp; docs</name>
        <commit revision="5"><author>bob</author><date>2026-06-02T10:00:00.000Z</date></commit>
      </entry>
    </list></lists>`;

  assert.deepEqual(parseSvnList(xml), [
    {
      name: 'assets & docs',
      path: 'assets & docs',
      kind: 'dir',
      size: 0,
      revision: '5',
      author: 'bob',
      date: '2026-06-02T10:00:00.000Z'
    },
    {
      name: 'readme.txt',
      path: 'readme.txt',
      kind: 'file',
      size: 12,
      revision: '4',
      author: 'alice',
      date: '2026-06-01T10:00:00.000Z'
    }
  ]);
});

test('SvnService search returns recursive name matches with full paths', async () => {
  const service = new SvnService(() => 'svn');
  service.run = async () => `<lists><list path="https://example.test/svn">
    <entry kind="dir"><name>images</name><commit revision="1"></commit></entry>
    <entry kind="file"><name>images/banner.png</name><commit revision="2"></commit></entry>
    <entry kind="file"><name>docs/images.txt</name><commit revision="3"></commit></entry>
  </list></lists>`;

  assert.deepEqual(await service.search({ url: 'https://example.test/svn' }, 'image'), [
    {
      name: 'images',
      path: 'images',
      kind: 'dir',
      size: 0,
      revision: '1',
      author: '',
      date: ''
    },
    {
      name: 'images.txt',
      path: 'docs/images.txt',
      kind: 'file',
      size: 0,
      revision: '3',
      author: '',
      date: ''
    }
  ]);
});

test('SvnService exports a resource directly to its local relative path', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svn-browser-export-local-'));
  const destination = path.join(root, 'assets', 'logo.png');
  const service = new SvnService(() => 'svn');
  let invocation;
  service.run = async (args, repository) => {
    invocation = { args, repository };
  };
  const repository = { url: 'https://example.test/svn', username: 'alice' };

  assert.equal(await service.exportToLocal(repository, 'assets/logo.png', destination), destination);
  assert.deepEqual(invocation, {
    args: ['export', '--force', 'https://example.test/svn/assets/logo.png', destination],
    repository
  });
  assert.equal(fs.existsSync(path.dirname(destination)), true);
  fs.rmSync(root, { recursive: true, force: true });
});
