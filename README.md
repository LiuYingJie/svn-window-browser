# SVN Browser

一个基于 Electron 的 SVN 资源浏览器，支持：

- 保存并切换多个 SVN 仓库
- 浏览仓库目录和文件
- 将单个文件或整个文件夹导出到本地
- 使用 Ctrl/Shift 多选资源，按 Ctrl+C 后到 Windows 文件夹中按 Ctrl+V 粘贴
- 使用返回按钮或 Backspace 返回上一级目录
- 在图标视图和列表视图之间切换，并记住上次选择
- 添加仓库时复用历史账户，或输入新的账户
- 在整个仓库中按文件或文件夹名称关键字搜索
- 管理 Ctrl+C 产生的本地缓存，支持查看占用和手动清理
- 为私有仓库保存用户名和密码
- 手动选择 `svn.exe`

## 运行

```powershell
npm install
npm start
```

应用依赖 SVN 命令行客户端。TortoiseSVN 是独立的图形客户端，默认安装中通常没有 `svn.exe`。应用会自动检测 TortoiseSVN 和常见的命令行客户端；如果只检测到 TortoiseSVN，请在左下角的设置中打开 Windows 版 Subversion 客户端下载页，安装后点击“重新检测”。

## 内置 SVN 客户端

如需让同事无需单独安装命令行客户端，可将完整的 Windows SVN 命令行发行目录放到：

```text
vendor/svn/
└─ bin/
   ├─ svn.exe
   ├─ *.dll
   └─ 发行版附带的其他文件
```

不要只复制 `svn.exe`，它依赖同一发行版中的 DLL 和认证组件。`npm run dist` 或 `npm run pack` 会把整个 `vendor/svn` 目录复制到应用的 resources 目录，程序会优先自动使用其中的客户端。分发前需要保留该发行版要求的许可证和 NOTICE 文件，并在干净的 Windows 电脑上验证 HTTPS、账号认证和 `svn+ssh` 等实际使用的协议。

## 测试与打包

```powershell
npm test
npm run dist
```

仓库配置保存在 Electron 的 `userData` 目录中，密码使用操作系统提供的安全存储能力加密后落盘。

Ctrl+C 下载的临时文件保存在系统临时目录。应用启动时及运行期间会自动清理超过 24 小时的缓存；缓存超过 2 GB 时，会优先删除最旧的批次。也可以通过左下角的“缓存”按钮查看并清空缓存。
