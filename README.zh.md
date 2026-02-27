<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/codecomfy-vscode/readme.png" alt="CodeComfy VSCode" width="400" />
</p>

[![CI](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml) [![Landing Page](https://img.shields.io/badge/Landing_Page-live-blue)](https://mcp-tool-shop-org.github.io/codecomfy-vscode/)

* 坐下来，输入提示，让 CodeComfy 完成工作。

无需离开编辑器，即可使用 ComfyUI 生成图像和视频。
选择一个预设，输入提示，并在状态栏查看进度，CodeComfy
负责工作流程提交、轮询、帧下载以及 FFmpeg 编解码。

> **主要面向 Windows，但支持跨平台。** 已在 Windows 10/11 上进行全面测试。
> 预计 macOS 和 Linux 也能正常运行，请参阅 [已知限制](#known-limitations)。
> 欢迎贡献代码。

---

## 先决条件

| 依赖项 | 必需 | 说明 |
|------------|----------|-------|
| **ComfyUI** | 是 | CodeComfy 通过其 HTTP API 进行通信，可以运行在本地 (`http://127.0.0.1:8188`) 或远程机器上。 |
| **FFmpeg**  | 用于视频 | 必须在系统 PATH 中 *或* 通过 `codecomfy.ffmpegPath` 进行配置。 [下载 FFmpeg](https://ffmpeg.org/download.html)。 |
| **NextGallery** | 可选 | 配套的画廊查看器。生成本身不需要。 |

## 安装

CodeComfy 尚未在 VS Code Marketplace 上发布。
从 `.vsix` 文件安装：

1. 从 [发布版本](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases) 下载最新的 `.vsix` 文件。
2. 在 VS Code 中：**扩展** 侧边栏 → `···` 菜单 → **从 VSIX 安装…**
3. 提示时重新加载窗口。

### 设置

打开 **设置 → 扩展 → CodeComfy**，或将其添加到 `settings.json` 中：

```json
{
  "codecomfy.comfyuiUrl": "http://127.0.0.1:8188",
  "codecomfy.ffmpegPath": "",
  "codecomfy.autoOpenGalleryOnComplete": true,
  "codecomfy.nextGalleryPath": "",
  "codecomfy.defaultNegativePrompt": ""
}
```

| 设置项 | 描述 | 默认值 |
|---------|-------------|---------|
| `codecomfy.comfyuiUrl` | ComfyUI 服务器 URL | `http://127.0.0.1:8188` |
| `codecomfy.ffmpegPath` | FFmpeg 可执行文件的绝对路径（留空则使用 PATH 查找） | `""` |
| `codecomfy.autoOpenGalleryOnComplete` | 生成完成后是否自动打开 NextGallery | `true` |
| `codecomfy.nextGalleryPath` | NextGallery.exe 的绝对路径 | 自动检测 |
| `codecomfy.defaultNegativePrompt` | 生成过程中默认填充的负面提示 | `""` |

## 快速入门

1. **启动 ComfyUI** — 确保其正在运行且可访问。
2. **选择一个命令** — 打开命令面板 (`Ctrl+Shift+P`) 并选择：
- `CodeComfy: 生成图像 (HQ)` — 单个图像
- `CodeComfy: 生成视频 (HQ)` — 短视频 (2–8 秒)
3. **输入提示**，可选地输入 **负面提示**（要避免的内容），以及一个 **种子**，然后查看状态栏。

<!-- 屏幕截图：替换为真实的 PNG 文件 — 参见 assets/SCREENSHOTS.md -->

**状态栏** 显示实时进度（排队 → 生成 → 完成）。

结构化的日志显示在 **CodeComfy** 输出通道中
(`Ctrl+Shift+U`，然后选择 "CodeComfy")。

输出文件保存在工作区根目录下的 `.codecomfy/outputs/` 文件夹中。
运行元数据保存在 `.codecomfy/runs/` 文件夹中。

### 取消

从命令面板中运行 `CodeComfy: 取消生成`，或在生成过程中单击状态栏上的项目。

## 生成限制

视频生成会强制执行安全限制，以防止意外耗尽资源：

| 参数 | 最小值 | 最大值 |
|-----------|-----|-----|
| 时长 | 1 秒 | 15 秒 |
| FPS | 1   | 60   |
| 总帧数 (时长 × FPS) | — | 450 |

如果达到限制，请缩短时长或选择具有较低帧率的预设。

## 故障排除

### `[网络]` — 无法连接到 ComfyUI 服务器

- ComfyUI 正在运行吗？请在浏览器中访问 `http://127.0.0.1:8188/system_stats` 进行检查。
- 如果 ComfyUI 运行在不同的端口或主机上，请更新 `codecomfy.comfyuiUrl`。
- 防火墙或代理是否阻止了连接？尝试使用 `curl http://127.0.0.1:8188/system_stats` 命令。

### `[服务器]` — ComfyUI 返回错误

- 请检查 ComfyUI 的终端/控制台，查看堆栈跟踪信息。
- 常见原因：缺少模型检查点或自定义节点。
- 确保您的 ComfyUI 具有预设工作流程所需的节点。

### `[API]` — 响应格式错误

- 您的 ComfyUI 版本可能太旧或太新，不兼容捆绑的预设。
- 反向代理或 CDN 可能会修改 JSON 响应。
- 尝试直接访问 `/prompt` 和 `/history` 接口，以检查响应格式。

### `[IO]` — 文件权限或磁盘问题

- 确保您的工作区文件夹具有写入权限。
- 检查可用磁盘空间——视频帧的下载可能非常大。
- 在 Windows 上，避免将工作区放在网络驱动器上，以获得最佳性能。

### 未找到 FFmpeg

- 安装 FFmpeg，并确保 `ffmpeg.exe` 位于您的系统 PATH 环境变量中。
- 或者，将 `codecomfy.ffmpegPath` 设置为 **完整的绝对路径**（例如：`C:\ffmpeg\bin\ffmpeg.exe`）。
- 相对路径和不带扩展名的名称（除了 PATH 环境变量中找到的 `ffmpeg`）将被拒绝，以确保安全性。

### "生成任务已在运行中"

- 每次只能运行一个生成任务。
- 取消当前任务 (`CodeComfy: 取消生成`) 或等待其完成。
- 连续任务之间存在 2 秒的冷却时间。

### 种子/提示验证

- 种子必须是 0 到 2,147,483,647 之间的整数。
- 提示必须不为空，且长度最多为 8,000 个字符。

## 安全与数据范围

- **网络：** 仅连接到用户配置的 ComfyUI URL（默认 `127.0.0.1:8188`）——不进行任何其他出站请求。
- **文件：** 输出保存到工作区中的 `.codecomfy/outputs/` 和 `.codecomfy/runs/` 文件夹中——不会修改工作区之外的任何文件。
- **FFmpeg：** 从所有进程中删除了 `shell: true`；路径必须是绝对路径、已存在的路径，并且可执行。
- **不收集或发送任何遥测数据**——请参阅 [SECURITY.md](SECURITY.md) 了解完整策略。

## 已知限制

| 区域 | 状态 |
|------|--------|
| **Windows** | 已完全测试（Windows 10/11）。主要平台。 |
| **macOS** | 预期适用于图像和视频生成。NextGallery 可能尚未可用。 |
| **Linux** | 预期适用于图像和视频生成。NextGallery 可能尚未可用。 |
| **Remote / WSL** | ComfyUI URL 必须能够从运行 VS Code 的主机访问。 |

核心功能（提示 → ComfyUI → 下载 → FFmpeg 组装）
是跨平台的。Windows 上的唯一特定功能是 NextGallery
自动检测，如果其他平台无法检测到，则会提示用户在
设置中指定路径。

如果遇到与特定平台相关的问题，请
[提交问题](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues)
，并提供您的操作系统、VS Code 版本和 ComfyUI 版本。

## 工作原理

```
Command Palette
   │
   ▼
extension.ts  ─── validates inputs, creates JobRouter
   │
   ▼
JobRouter     ─── creates run folder, tracks lifecycle
   │
   ▼
ComfyServerEngine ─── POST /prompt → poll /history → stream /view
   │
   ▼
FFmpeg        ─── (video only) assemble frames → MP4
   │
   ▼
.codecomfy/outputs/index.json  ─── atomic index update
```

## 许可证

MIT — 详情请参阅 [LICENSE](LICENSE)。

---

由 [MCP Tool Shop](https://mcp-tool-shop.github.io/) 构建。
