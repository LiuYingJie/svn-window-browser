const test = require('node:test');
const assert = require('node:assert/strict');
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
