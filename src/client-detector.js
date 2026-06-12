const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function firstExisting(paths) {
  return paths.find((candidate) => candidate && fs.existsSync(candidate)) || '';
}

function findOnPath(executable) {
  const result = spawnSync('where.exe', [executable], {
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) return '';
  return result.stdout.split(/\r?\n/).find(Boolean)?.trim() || '';
}

function detectSvnClient(configuredExecutable = '', environment = process.env, bundledExecutables = []) {
  const programFiles = environment.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = environment['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const tortoiseDirectories = [
    path.join(programFiles, 'TortoiseSVN', 'bin'),
    path.join(programFilesX86, 'TortoiseSVN', 'bin')
  ];

  const svnExecutable = firstExisting([
    configuredExecutable,
    ...bundledExecutables,
    findOnPath('svn.exe'),
    ...tortoiseDirectories.map((directory) => path.join(directory, 'svn.exe')),
    path.join(programFiles, 'SlikSvn', 'bin', 'svn.exe'),
    path.join(programFilesX86, 'SlikSvn', 'bin', 'svn.exe'),
    path.join(programFiles, 'CollabNet', 'Subversion Client', 'svn.exe'),
    path.join(programFilesX86, 'CollabNet', 'Subversion Client', 'svn.exe')
  ]);
  const tortoiseProc = firstExisting([
    findOnPath('TortoiseProc.exe'),
    ...tortoiseDirectories.map((directory) => path.join(directory, 'TortoiseProc.exe'))
  ]);

  if (svnExecutable) {
    return {
      ready: true,
      svnExecutable,
      tortoiseProc,
      kind: tortoiseProc ? 'tortoise-with-cli' : 'svn-cli'
    };
  }

  if (tortoiseProc) {
    return {
      ready: false,
      svnExecutable: '',
      tortoiseProc,
      kind: 'tortoise-only'
    };
  }

  return {
    ready: false,
    svnExecutable: '',
    tortoiseProc: '',
    kind: 'not-found'
  };
}

module.exports = { detectSvnClient };
