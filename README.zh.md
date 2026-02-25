<p align="center">
  <img src="assets/icon.png" alt="CodeComfy icon" width="96" />
</p>

# CodeComfy：在 VS Code 中使用 ComfyUI 进行图像生成

[![CI](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml)

*放松身心，输入提示语，让智能设备为您完成工作。*

使用 ComfyUI 在您的编辑器中直接生成图像和视频，无需离开当前界面。
选择一个预设，输入提示语，然后观察状态栏，CodeComfy 会自动处理工作流程提交、状态轮询、帧下载以及 FFmpeg 编解码等操作。

**主要面向Windows平台，同时支持跨平台。** 已在Windows 10/11上进行全面测试。
预计macOS和Linux系统也能正常运行，具体情况请参考[已知限制](#known-limitations)。
欢迎提交代码贡献。

---

## 先决条件

| 依赖性。 | 必需的。 | Notes |
| 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 |
| **ComfyUI** | Yes | 可以在本地运行（地址：http://127.0.0.1:8188），也可以在远程机器上运行。CodeComfy 通过其 HTTP API 与其他组件进行通信。 |
| **FFmpeg**  | 用于视频。 | 必须将其添加到您的系统路径中，*或者* 通过 `codecomfy.ffmpegPath` 进行配置。 [下载 FFmpeg](https://ffmpeg.org/download.html)。 |
| **NextGallery** | 可选。 | 辅助画廊查看器。并非生成过程的必需组件。 |

## 安装

CodeComfy 目前尚未在 VS Code 市场中提供。
您可以从 `.vsix` 文件安装：

1. 从 [发布页面](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases) 下载最新的 `.vsix` 文件。
2. 在 VS Code 中：**扩展** 侧边栏 → `···` 菜单 → **从 VSIX 安装…**
3. 按照提示重新加载窗口。

### 设置

打开“设置”→“扩展程序”→“CodeComfy”，或者在 `settings.json` 文件中添加相关配置。

```json
{
  "codecomfy.comfyuiUrl": "http://127.0.0.1:8188",
  "codecomfy.ffmpegPath": "",
  "codecomfy.autoOpenGalleryOnComplete": true,
  "codecomfy.nextGalleryPath": "",
  "codecomfy.defaultNegativePrompt": ""
}
```

| 场景设置。 | 描述。 | 默认设置。 |
| 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 |
| `codecomfy.comfyuiUrl` | ComfyUI 服务器的网址。 | `http://127.0.0.1:8188` |
| `codecomfy.ffmpegPath` | FFmpeg 可执行文件的绝对路径（留空则系统会从 PATH 环境变量中查找）。 | `""` |
| `codecomfy.autoOpenGalleryOnComplete` | 在图像生成完成后，自动打开“NextGallery”窗口。 | `true` |
| `codecomfy.nextGalleryPath` | NextGallery.exe 文件的绝对路径。 | 自动检测。 |
| `codecomfy.defaultNegativePrompt` | 生成过程中，默认会预先填充负面提示词。 | `""` |

## 快速入门指南

1. **启动 ComfyUI** — 确保其正在运行且可以访问。
2. **选择一个命令** — 打开命令面板（按 `Ctrl+Shift+P`），然后选择：
- `CodeComfy: Generate Image (HQ)` — 生成单张图片
- `CodeComfy: Generate Video (HQ)` — 生成短视频（2–8 秒）
3. **输入提示词**，可以选择性地输入**负面提示词**（需要避免的内容），以及一个**种子值**，然后观察状态栏。

(屏幕截图：请替换为真实的PNG图片，具体请参考 assets/SCREENSHOTS.md 文件。)

状态栏显示实时进度（队列中 → 正在生成 → 完成）。

结构化的日志信息会显示在 **CodeComfy** 的输出通道中（按下 `Ctrl+Shift+U`，然后选择“CodeComfy”）。

输出结果会被保存到您的工作区根目录下的 `.codecomfy/outputs/` 文件夹中。
运行过程的元数据信息存储在 `.codecomfy/runs/` 文件夹中。

### 取消

从命令面板中运行“CodeComfy: 取消生成”命令，或者在生成过程中，点击状态栏中的相应项目。

## 世代限制

视频生成功能会强制执行安全限制，以防止意外耗尽系统资源。

| 参数。 | Min | Max |
| 好的，请提供需要翻译的英文文本。 |-----|-----|
| 时长。 | 1 s | 15 s |
| FPS       | 1   | 60   |
| 总帧数（时长 × 帧率） | — | 450 |

如果达到上限，请缩短录制时长或选择一个帧率较低的预设模式。

## 故障排除

### `[网络]` - 无法连接到 ComfyUI 服务器

- ComfyUI 正在运行吗？请在浏览器中访问 `http://127.0.0.1:8188/system_stats` 进行检查。
- 如果 ComfyUI 运行在不同的端口或主机上，请更新 `codecomfy.comfyuiUrl` 的配置。
- 可能是防火墙或代理阻止了连接。尝试使用 `curl http://127.0.0.1:8188/system_stats` 命令进行测试。

### `[服务器]` — ComfyUI 出现错误

- 请检查 ComfyUI 的终端/控制台，查看堆栈跟踪信息。
- 常见原因：缺少模型检查点文件或自定义节点。
- 确保您的 ComfyUI 具有预设工作流程所需的节点。

### `[API]` - 响应格式错误

- 您的 ComfyUI 版本可能太旧或太新，不兼容预设配置。
- 反向代理服务器或 CDN 可能正在修改 JSON 响应数据。
- 尝试直接访问 `/prompt` 和 `/history` 接口，以检查响应数据的结构。

### `[IO]` - 文件权限问题或磁盘问题

- 确保您的工作区文件夹具有写入权限。
- 检查可用磁盘空间，因为视频素材的下载可能占用大量空间。
- 在Windows系统上，为了获得最佳性能，请避免将工作区存储在网络驱动器上。

### 未找到 FFmpeg

- 安装 FFmpeg，并确保 `ffmpeg.exe` 位于您的系统 PATH 环境变量中。
- 或者，将 `codecomfy.ffmpegPath` 设置为 **完整的绝对路径**（例如：`C:\ffmpeg\bin\ffmpeg.exe`）。
- 为了安全起见，不允许使用相对路径或仅包含文件名（除了通过 PATH 环境变量找到的 `ffmpeg`）。

### “已启动新一代系统。”

一次只能运行一个任务。
您可以取消当前正在运行的任务（“CodeComfy: 取消生成”），或者等待其完成。
连续运行任务之间需要间隔2秒的冷却时间。

### 种子/提示验证

- 种子值必须是介于 0 和 2,147,483,647 之间的整数。
- 提示语不能为空，且长度最多为 8000 个字符。

## 已知局限性

| Area | 状态。 |
| 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 |
| **Windows** | 已在 Windows 10/11 系统上进行全面测试。为主要支持平台。 |
| macOS | 预计该功能可用于图像和视频的生成。NextGallery 可能尚未开放。 |
| **Linux** | 预计该功能可用于图像和视频生成。NextGallery 可能尚未开放。 |
| **Remote / WSL** | ComfyUI 的 URL 必须能够从运行 VS Code 的主机访问。 |

核心功能（提示 → ComfyUI → 下载 → FFmpeg 编译）是跨平台的。 只有“NextGallery”的自动检测功能是 Windows 独有的，在其他平台上，它会优雅地降级为“在设置中手动指定路径”的提示。

如果您在使用过程中遇到特定于某个操作系统的相关问题，请
[提交问题](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues)，并在提交时注明您的操作系统、VS Code版本以及ComfyUI版本。

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

## 许可

麻省理工学院。
