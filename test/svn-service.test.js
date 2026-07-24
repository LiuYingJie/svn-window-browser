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

test('SvnService creates remote folder with a commit message', async () => {
  const service = new SvnService(() => 'svn');
  let invocation;
  service.run = async (args, repository) => {
    invocation = { args, repository };
  };
  const repository = { url: 'https://example.test/svn', username: 'alice' };

  assert.deepEqual(
    await service.createFolder(repository, '关卡/BS_51——BS_100', '猪咪', '创建猪咪目录'),
    {
      name: '猪咪',
      path: '关卡/BS_51——BS_100/猪咪'
    }
  );
  assert.deepEqual(invocation, {
    args: [
      'mkdir',
      '-m',
      '创建猪咪目录',
      'https://example.test/svn/%E5%85%B3%E5%8D%A1/BS_51%E2%80%94%E2%80%94BS_100/%E7%8C%AA%E5%92%AA'
    ],
    repository
  });
});

test('SvnService creates a default commit message for remote folders', async () => {
  const service = new SvnService(() => 'svn');
  let invocation;
  service.run = async (args) => {
    invocation = args;
  };

  await service.createFolder({ url: 'https://example.test/svn' }, '', 'docs', '');

  assert.deepEqual(invocation, [
    'mkdir',
    '-m',
    '新建文件夹 docs',
    'https://example.test/svn/docs'
  ]);
});

test('SvnService rejects invalid remote folder names', async () => {
  const service = new SvnService(() => 'svn');
  service.run = async () => {
    throw new Error('should not run svn');
  };

  await assert.rejects(
    () => service.createFolder({ url: 'https://example.test/svn' }, '', 'a/b', 'message'),
    /不能包含路径分隔符/
  );
});

test('SvnService builds checkout URL for a directory', () => {
  const service = new SvnService(() => 'svn');

  assert.equal(
    service.buildCheckoutUrl({ url: 'https://example.test/svn' }, 'a/b/c', 'dir'),
    'https://example.test/svn/a/b/c'
  );
});

test('SvnService builds checkout URL for a file parent directory', () => {
  const service = new SvnService(() => 'svn');

  assert.equal(
    service.buildCheckoutUrl({ url: 'https://example.test/svn' }, 'd/e/f.txt', 'file'),
    'https://example.test/svn/d/e'
  );
});

test('SvnService encodes checkout URL path segments', () => {
  const service = new SvnService(() => 'svn');

  assert.equal(
    service.buildCheckoutUrl({ url: 'https://example.test/svn' }, '关卡/BS_51——BS_100/猪咪', 'dir'),
    'https://example.test/svn/%E5%85%B3%E5%8D%A1/BS_51%E2%80%94%E2%80%94BS_100/%E7%8C%AA%E5%92%AA'
  );
});

test('SvnService checks out a directory to its full local relative path', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svn-browser-checkout-local-'));
  const destination = path.join(root, '关卡', 'BS_51——BS_100', '猪咪');
  const service = new SvnService(() => 'svn');
  let invocation;
  service.run = async (args, repository) => {
    invocation = { args, repository };
  };
  service.isVersioned = async () => false;
  const repository = { url: 'https://example.test/svn', username: 'alice' };

  assert.deepEqual(
    await service.applyToLocal(repository, '关卡/BS_51——BS_100/猪咪', 'dir', destination),
    {
      destination,
      workingCopyPath: destination,
      action: 'checked-out'
    }
  );
  assert.deepEqual(invocation, {
    args: [
      'checkout',
      '--force',
      'https://example.test/svn/%E5%85%B3%E5%8D%A1/BS_51%E2%80%94%E2%80%94BS_100/%E7%8C%AA%E5%92%AA',
      destination
    ],
    repository
  });
  assert.equal(fs.existsSync(path.dirname(destination)), true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('SvnService updates an existing directory working copy', async () => {
  const service = new SvnService(() => 'svn');
  const destination = 'D:\\project\\关卡\\猪咪';
  let invocation;
  const progress = [];
  service.isVersioned = async () => true;
  service.run = async (args, repository, options) => {
    invocation = { args, repository };
    options.onOutput('Updated to revision 8.\n');
  };
  const repository = { url: 'svn://example.test/project' };

  assert.deepEqual(await service.applyToLocal(
    repository,
    '关卡/猪咪',
    'dir',
    destination,
    (event) => progress.push(event)
  ), {
    destination,
    workingCopyPath: destination,
    action: 'updated'
  });
  assert.deepEqual(invocation, {
    args: ['update', destination],
    repository
  });
  assert.deepEqual(progress, [
    { phase: 'checking', message: '正在检查本地工作副本...' },
    { phase: 'updating', message: `正在更新：${destination}` },
    { phase: 'updating', message: 'Updated to revision 8.\n' }
  ]);
});

test('SvnService applies a file by checking out its parent directory', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svn-browser-checkout-file-'));
  const destination = path.join(root, 'assets', 'icons', 'logo.png');
  const parent = path.dirname(destination);
  const service = new SvnService(() => 'svn');
  let invocation;
  service.isVersioned = async () => false;
  service.run = async (args, repository) => {
    invocation = { args, repository };
  };
  const repository = { url: 'https://example.test/svn' };

  assert.deepEqual(await service.applyToLocal(repository, 'assets/icons/logo.png', 'file', destination), {
    destination,
    workingCopyPath: parent,
    action: 'checked-out'
  });
  assert.deepEqual(invocation, {
    args: ['checkout', '--force', 'https://example.test/svn/assets/icons', parent],
    repository
  });
  fs.rmSync(root, { recursive: true, force: true });
});
