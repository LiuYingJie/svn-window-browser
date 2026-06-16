const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const mode = process.argv[2] || 'default';
const privateDir = path.join(root, 'build-private');
const privateConfigPath = path.join(privateDir, 'config.json');
const builderConfigPath = path.join(privateDir, 'electron-builder-with-update.json');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  process.exit(result.status ?? 1);
}

function buildWithoutUpdate() {
  fs.rmSync(privateConfigPath, { force: true });
  fs.rmSync(builderConfigPath, { force: true });
  run('npm', ['run', 'dist']);
}

function buildWithUpdate() {
  const sourceConfigPath = path.join(root, 'config.json');
  if (!fs.existsSync(sourceConfigPath)) {
    console.error('缺少 config.json，无法打包支持更新的版本。');
    process.exit(1);
  }

  JSON.parse(fs.readFileSync(sourceConfigPath, 'utf8'));
  fs.mkdirSync(privateDir, { recursive: true });
  fs.copyFileSync(sourceConfigPath, privateConfigPath);

  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const buildConfig = {
    ...packageJson.build,
    extraResources: [
      ...(packageJson.build.extraResources || []),
      {
        from: 'build-private/config.json',
        to: 'config.json'
      }
    ]
  };
  fs.writeFileSync(builderConfigPath, JSON.stringify(buildConfig, null, 2), 'utf8');
  run('npx', ['electron-builder', '--config', builderConfigPath]);
}

if (mode === 'with-update') {
  buildWithUpdate();
} else if (mode === 'without-update' || mode === 'default') {
  buildWithoutUpdate();
} else {
  console.error(`未知打包模式：${mode}`);
  process.exit(1);
}
