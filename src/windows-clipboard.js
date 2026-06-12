const { spawn } = require('node:child_process');

function powershellString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function copyFilesToClipboard(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    throw new Error('没有可复制的文件');
  }

  const pathsExpression = filePaths.map(powershellString).join(',');
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$files = New-Object System.Collections.Specialized.StringCollection',
    `[void]$files.AddRange([string[]]@(${pathsExpression}))`,
    '[System.Windows.Forms.Clipboard]::SetFileDropList($files)'
  ].join('; ');

  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-STA',
      '-Command',
      script
    ], {
      windowsHide: true,
      shell: false
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || '无法写入 Windows 文件剪贴板'));
      }
    });
  });
}

module.exports = { copyFilesToClipboard, powershellString };
