function svnDirectoryPath(relativePath, kind) {
  const normalizedPath = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (kind === 'dir') return normalizedPath;
  if (kind === 'file') return normalizedPath.split('/').slice(0, -1).join('/');
  throw new Error('不支持的资源类型');
}

module.exports = { svnDirectoryPath };
