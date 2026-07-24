const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { svnDirectoryPath } = require('./svn-path');

function escapeXml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function parseAttributes(source) {
  const attributes = {};
  for (const match of source.matchAll(/([\w-]+)="([^"]*)"/g)) {
    attributes[match[1]] = escapeXml(match[2]);
  }
  return attributes;
}

function parseSvnList(xml) {
  const entries = [];
  const entryPattern = /<entry\s+([^>]*)>([\s\S]*?)<\/entry>/g;
  for (const match of xml.matchAll(entryPattern)) {
    const attributes = parseAttributes(match[1]);
    const body = match[2];
    const relativePath = escapeXml(body.match(/<name>([\s\S]*?)<\/name>/)?.[1] || '');
    const name = relativePath.split('/').filter(Boolean).at(-1) || relativePath;
    const size = Number(body.match(/<size>(\d+)<\/size>/)?.[1] || 0);
    const commit = body.match(/<commit\s+([^>]*)>([\s\S]*?)<\/commit>/);
    const commitAttributes = commit ? parseAttributes(commit[1]) : {};
    const commitBody = commit?.[2] || '';

    entries.push({
      name,
      path: relativePath,
      kind: attributes.kind || 'file',
      size,
      revision: commitAttributes.revision || '',
      author: escapeXml(commitBody.match(/<author>([\s\S]*?)<\/author>/)?.[1] || ''),
      date: commitBody.match(/<date>([\s\S]*?)<\/date>/)?.[1] || ''
    });
  }
  return entries.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'dir' ? -1 : 1;
    return left.name.localeCompare(right.name, 'zh-CN');
  });
}

function normalizeDirectoryName(name) {
  const normalized = String(name || '').trim();
  if (!normalized) throw new Error('文件夹名称不能为空');
  if (/[\\/]/.test(normalized)) throw new Error('文件夹名称不能包含路径分隔符');
  if (normalized === '.' || normalized === '..') throw new Error('文件夹名称不能是 . 或 ..');
  return normalized;
}

class SvnService {
  constructor(getExecutable) {
    this.getExecutable = getExecutable;
  }

  run(args, repository, options = {}) {
    const executable = this.getExecutable() || 'svn';
    const authArgs = ['--non-interactive'];
    if (repository.username) authArgs.push('--username', repository.username);
    if (repository.password) authArgs.push('--password', repository.password);

    return new Promise((resolve, reject) => {
      const child = spawn(executable, [...args, ...authArgs], {
        windowsHide: true,
        shell: false
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (data) => {
        stdout += data;
        options.onOutput?.(data);
      });
      child.stderr.on('data', (data) => {
        stderr += data;
        options.onOutput?.(data);
      });
      child.on('error', (error) => {
        if (error.code === 'ENOENT') {
          reject(new Error('未找到 SVN 命令行客户端。请安装 TortoiseSVN 命令行工具，或在设置中选择 svn.exe。'));
          return;
        }
        reject(error);
      });
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr.trim() || `SVN 命令执行失败，退出码 ${code}`));
        }
      });
    });
  }

  buildUrl(repository, relativePath = '') {
    const encodedPath = relativePath
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
    return encodedPath ? `${repository.url}/${encodedPath}` : repository.url;
  }

  buildCheckoutUrl(repository, relativePath, kind) {
    return this.buildUrl(repository, svnDirectoryPath(relativePath, kind));
  }

  async list(repository, relativePath = '') {
    const xml = await this.run(['list', '--xml', this.buildUrl(repository, relativePath)], repository);
    return parseSvnList(xml).map((entry) => ({
      ...entry,
      path: [relativePath, entry.path].filter(Boolean).join('/')
    }));
  }

  async search(repository, keyword) {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase('zh-CN');
    if (!normalizedKeyword) return [];
    const xml = await this.run(['list', '--recursive', '--xml', repository.url], repository);
    return parseSvnList(xml)
      .filter((entry) => entry.name.toLocaleLowerCase('zh-CN').includes(normalizedKeyword))
      .slice(0, 500);
  }

  async createFolder(repository, parentPath, folderName, message) {
    const normalizedName = normalizeDirectoryName(folderName);
    const relativePath = [parentPath, normalizedName].filter(Boolean).join('/');
    const commitMessage = String(message || '').trim() || `新建文件夹 ${normalizedName}`;
    await this.run(['mkdir', '-m', commitMessage, this.buildUrl(repository, relativePath)], repository);
    return { name: normalizedName, path: relativePath };
  }

  async export(repository, relativePath, destinationDirectory) {
    const sourceUrl = this.buildUrl(repository, relativePath);
    const itemName = relativePath.split('/').filter(Boolean).at(-1) || repository.name;
    const destination = path.join(destinationDirectory, itemName);

    if (fs.existsSync(destination)) {
      throw new Error(`目标位置已存在同名文件或文件夹：${destination}`);
    }

    await this.run(['export', sourceUrl, destination], repository);
    return destination;
  }

  async isVersioned(repository, targetPath) {
    try {
      await this.run(['info', '--show-item', 'wc-root', targetPath], repository);
      return true;
    } catch {
      return false;
    }
  }

  async applyToLocal(repository, relativePath, kind, destination, onProgress = () => {}) {
    const isFile = kind === 'file';
    const checkoutRelativePath = isFile
      ? relativePath.split('/').slice(0, -1).join('/')
      : relativePath;
    const workingCopyPath = isFile ? path.dirname(destination) : destination;
    const updatePath = isFile ? workingCopyPath : destination;

    onProgress({ phase: 'checking', message: '正在检查本地工作副本...' });
    if (await this.isVersioned(repository, updatePath)) {
      onProgress({ phase: 'updating', message: `正在更新：${updatePath}` });
      await this.run(['update', updatePath], repository, {
        onOutput: (output) => onProgress({ phase: 'updating', message: output })
      });
      return { destination, workingCopyPath, action: 'updated' };
    }

    fs.mkdirSync(path.dirname(workingCopyPath), { recursive: true });
    onProgress({ phase: 'checking-out', message: `正在检出：${workingCopyPath}` });
    await this.run([
      'checkout',
      '--force',
      this.buildUrl(repository, checkoutRelativePath),
      workingCopyPath
    ], repository, {
      onOutput: (output) => onProgress({ phase: 'checking-out', message: output })
    });
    return { destination, workingCopyPath, action: 'checked-out' };
  }

  async exportMany(repository, relativePaths, destinationDirectory) {
    fs.mkdirSync(destinationDirectory, { recursive: true });
    const destinations = [];
    for (const relativePath of relativePaths) {
      destinations.push(await this.export(repository, relativePath, destinationDirectory));
    }
    return destinations;
  }
}

module.exports = { SvnService, parseSvnList, normalizeDirectoryName };
