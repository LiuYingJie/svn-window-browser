const fs = require('node:fs');
const path = require('node:path');

function validateLocalDirectory(directory) {
  const value = String(directory || '').trim();
  if (!value) {
    throw new Error('请先为仓库设置本地目录');
  }
  if (!path.isAbsolute(value)) {
    throw new Error('本地目录必须是绝对路径');
  }

  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root) {
    throw new Error('本地目录不能是磁盘根目录');
  }
  return resolved;
}

function resolveLocalResource(directory, relativePath) {
  const root = validateLocalDirectory(directory);
  const segments = String(relativePath || '')
    .split('/')
    .filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('无效的仓库相对路径');
  }

  const destination = path.resolve(root, ...segments);
  const relative = path.relative(root, destination);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('本地目标路径超出仓库目录');
  }
  return { root, destination };
}

function clearLocalDirectory(directory) {
  const root = validateLocalDirectory(directory);
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
    return { directory: root, removed: 0 };
  }
  if (!fs.statSync(root).isDirectory()) {
    throw new Error('设置的本地路径不是目录');
  }

  const entries = fs.readdirSync(root);
  for (const entry of entries) {
    fs.rmSync(path.join(root, entry), { recursive: true, force: true });
  }
  return { directory: root, removed: entries.length };
}

module.exports = {
  clearLocalDirectory,
  resolveLocalResource,
  validateLocalDirectory
};
