<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/codecomfy-vscode/readme.png" alt="CodeComfy VSCode" width="400" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://mcp-tool-shop-org.github.io/codecomfy-vscode/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page" /></a>
</p>

*六种配置。经过验证的工作流程。无需画布。*

从您的编辑器驱动 ComfyUI ——图像、视频、音频、3D 网格和图像理解。选择一个配置，回答它提出的问题，并观察状态栏，CodeComfy 会处理提交、轮询、下载和组装。每个已发布的流程都会对照实时 ComfyUI 目录进行验证，并且在提交任何内容之前，会列出缺少的节点或模型。

> **首先支持 Windows，同时对跨平台友好。** 已在 Windows 10/11 上进行了全面测试。预计 macOS 和 Linux 也能正常工作——请参阅[已知限制](#known-limitations)。欢迎提交 PR（拉取请求）。

---

## 先决条件

| 依赖项 | 必需 | 说明 |
|------------|----------|-------|
| **VS Code** | 是 | `^1.85.0` 或更高版本。该扩展程序使用了 1.85 版本中发布的 `InputBox` 和结构化取消 API；已在 1.85.0 到当前稳定版本上进行了测试。 |
| **ComfyUI** | 是 | 在本地运行（`http://127.0.0.1:8188`）或在远程机器上运行。CodeComfy 与其 HTTP API 进行通信。 |
| **FFmpeg**  | 可选 | 仅适用于旧版帧组装预设。已发布的视频预设由 ComfyUI 本身进行编码（`CreateVideo` → `SaveVideo`），因此不需要 FFmpeg。[下载 FFmpeg](https://ffmpeg.org/download.html)。 |
| **NextGallery** | 可选 | 配套的图库查看器。本身不需要用于生成。 |

## 安装

### 从 VS Code 市场（推荐）

1. 打开“扩展”侧边栏（`Ctrl+Shift+X`）。
2. 搜索“CodeComfy”，或访问[市场列表](https://marketplace.visualstudio.com/items?itemName=mcp-tool-shop.codecomfy-vscode)。
3. 点击“安装”，并在提示时重新加载窗口。

### 从 `.vsix` 文件（备选）

用于开发版本或离线安装：

1. 从[发布](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases)下载最新的 `.vsix`。
2. 在 VS Code 中： “扩展”侧边栏 → `···` 菜单 →“从 VSIX 安装…”
3. 并在提示时重新加载窗口。

### 设置

打开“设置 → 扩展 → CodeComfy”，或添加到 `settings.json`：

```json
{
  "codecomfy.comfyuiUrl": "http://127.0.0.1:8188",
  "codecomfy.ffmpegPath": "",
  "codecomfy.autoOpenGalleryOnComplete": true,
  "codecomfy.nextGalleryPath": "",
  "codecomfy.defaultNegativePrompt": ""
}
```

| 设置 | 描述 | 默认值 |
|---------|-------------|---------|
| `codecomfy.comfyuiUrl` | ComfyUI 服务器 URL | `http://127.0.0.1:8188` |
| `codecomfy.ffmpegPath` | FFmpeg 可执行文件的绝对路径（如果为空，则在 PATH 环境变量中查找） | `""` |
| `codecomfy.autoOpenGalleryOnComplete` | 生成完成后打开 NextGallery | `true` |
| `codecomfy.nextGalleryPath` | NextGallery.exe 的绝对路径 | 自动检测 |
| `codecomfy.defaultNegativePrompt` | 生成过程中预填充的默认负面提示词 | `""` |

## 快速入门

1. **启动 ComfyUI**——确保它正在运行且可以访问。
2. **选择一个命令**——打开“命令面板”（`Ctrl+Shift+P`），然后选择：
- `CodeComfy: Generate Image (HQ)` —— 单个图像
- `CodeComfy: Generate Video (HQ)` —— 短视频（2–8 秒）
3. **输入提示词**，可选地输入**负面提示词**（要避免的内容）和**种子**，然后观察状态栏。

<!-- Screenshots: replace with real PNGs — see assets/SCREENSHOTS.md -->

**状态栏**显示实时进度（已排队 → 正在生成 → 完成）。

结构化日志会出现在“CodeComfy”输出通道中（`Ctrl+Shift+U`，然后选择“CodeComfy”）。

输出保存在工作区根目录的 `.codecomfy/outputs/` 中。运行元数据存储在 `.codecomfy/runs/` 中。

### 取消

从命令面板运行`CodeComfy: Cancel Generation`，或者在生成过程中单击状态栏中的项目。这将清除待处理队列**并**中断正在运行的任务——因此取消操作不会简单地启动下一个已排队的任务。

### 清除队列

`CodeComfy: Clear ComfyUI Queue`会停止所有*待处理*的任务，但让当前正在运行的任务继续执行。

这是“暂停”功能的真实版本：ComfyUI的主版本中只有`/interrupt`（中止，不恢复），没有其他功能——既没有暂停，也没有在第 N 步处恢复的功能。阻止更多任务开始执行是实际可以实现的部分。

## 特性

- **六种配置文件**——图像、视频、音频、3D、推理和 PNG 元数据，其中包含 27 个经过验证的参考工作流程。
- **预检**——在提交任何内容之前，会列出缺少的节点和模型，因此不会浪费 GPU 时间来执行无法成功的任务。
- **实时进度**——状态栏中显示真实的采样步骤（`Step 12 / 20`），通过 ComfyUI 的 WebSocket 进行传输。如果连接中断，会自动切换到轮询模式。
- 内置的高质量图像 + 视频预设——视频在 **Wan 2.2 TI2V-5B** 上运行（Apache-2.0 许可，可用于商业用途），采用**服务器端编码，无需 FFmpeg**。
- **用户自定义的工作流程预设**（新增）——将任何 ComfyUI 工作流程 JSON 文件放入`.codecomfy/presets/`中。
- **活动栏中的运行历史记录**（新增）——浏览并重新运行过去生成的任务。
- 状态栏中显示实时进度。
- **完成通知**（新增，可选择关闭）——当耗时的视频完成后会发出通知。
- 用于诊断的结构化输出通道。
- 跨平台（首先支持 Windows，预计未来支持 macOS + Linux）。

## 这六种配置

`CodeComfy: Run… (all profiles)` 遵循 **配置 → 预设 → 输入** 的流程。输入是从所选预设的图表中派生的，因此图像到视频的预设会要求提供源图像，而文本到视频的预设则不需要。

| 配置 | 它做什么 | 预设 |
|---------|--------------|---------|
| **Image** | 文本转图像、图像编辑、联合 ControlNet | Qwen txt2img、Qwen 编辑、ControlNet（Qwen / SDXL） |
| **Video** | 基于真实时间模型的文本和图像到视频 | Hunyuan 1.5 i2v + 720p、Wan 14B、LTX、Mochi |
| **Audio** | 文本转音乐和人声分离 | ACE-Step 1.5（音乐/小曲/草稿/mp3）、分离 |
| **3D** | 图像到网格，导出为 GLB | Hunyuan3D-2（草稿/标准/详细） |
| **Inference** | 字幕、标签、检测、分割、OCR | Florence-2（7 个任务） |
| **Metadata** | 读取嵌入在 PNG 中的流程 | 仅本地，不需要服务器 |

**在可以成功之前不会提交任何内容。** 每个预设都会针对您的服务器进行预检：其节点会使用 `/object_info/{class}` 进行检查，模型会使用 `/models/{folder}` 进行检查。缺少节点时，会显示提供该节点的包的名称；缺少模型时，会显示文件名和它所属的文件夹——并且不会浪费 GPU 时间来查找。

### 工作流程来自哪里

CodeComfy 不会自行创建工作流图。这 27 个参考工作流是从 [comfy-headless](https://github.com/mcp-tool-shop-org/comfy-headless) 的代码库知识库中提取的，其中每个 `class_type` 都经过验证，以确保与当前的 ComfyUI 目录一致。维护者会使用 `npm run kb:sync` 来更新它们；如果提取的副本发生偏差，`npm run kb:check` 命令将失败。

对该知识库进行第二次手动维护的副本可能会发生偏差，并且工作流图中发生的偏差是不会发出任何提示的——图会正常运行，但不会返回任何结果。

## 视频模型

`CodeComfy: Generate Video (HQ)` 运行 **Wan 2.2 TI2V-5B** 模型，该模型完全基于 ComfyUI 自带的 `video_wan2_2_5B_ti2v` 模板。Wan 2.2 使用 **Apache-2.0** 许可——生成的输出可以用于商业用途。

它需要在您的 ComfyUI 服务器上安装三个文件：

| 文件 | 放置位置 | 下载链接 |
|------|-----------|----------|
| `wan2.2_ti2v_5B_fp16.safetensors` | `models/diffusion_models/` | [Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors) |
| `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `models/text_encoders/` | [Comfy-Org/Wan_2.1_ComfyUI_repackaged](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors) |
| `wan2.2_vae.safetensors` | `models/vae/` | [Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors) |

> **关于 1.2.0 版本之前的版本说明。** 在 v1.0.0 到 v1.1.0 版本中提供的 `hq-video` 预设**不是视频工作流**——它是一个文本到图像的图，该图从一个提示词生成 N 个独立的帧，然后使用 FFmpeg 将它们组合在一起。其中没有涉及任何运动模型，因此输出结果会闪烁而不是移动。这是我们的缺陷，而不是 ComfyUI 的限制，v1.2.0 版本已对其进行了替换。如果您保存了旧视频预设的 `.codecomfy/presets/` 副本，现在它将记录一条警告信息，解释该问题。

## 生成限制

为了防止意外耗尽资源，视频生成会强制执行安全限制：

| 参数 | 最小值 | 最大值 |
|-----------|-----|-----|
| 时长 | 1 秒 | 15 秒 |
| FPS（每秒帧数） | 1   | 60   |
| 总帧数（时长 × 每秒帧数） | — | 450 |

如果达到限制，请减少时长或选择具有较低帧速率的预设。

在提交之前，时间模型中的帧数将向上取整到下一个合法的 `4n + 1` 值（49、53、57……）。ComfyUI 可以接受非网格计数，但该模型无法处理这些值，因此 CodeComfy 会进行调整，而不是直接使用该值。

## 故障排除

### `[Network]` — 无法连接到 ComfyUI 服务器

- ComfyUI 是否正在运行？请在浏览器中检查 `http://127.0.0.1:8188/system_stats`。
- 如果 ComfyUI 使用不同的端口或主机，请更新 `codecomfy.comfyuiUrl`。
- 防火墙或代理是否阻止了连接？请尝试 `curl http://127.0.0.1:8188/system_stats`。

### `[Server]` — ComfyUI 返回错误

- 检查 ComfyUI 终端/控制台中的堆栈跟踪信息。
- 常见原因：缺少模型检查点或自定义节点。
- 确保您的 ComfyUI 具有预设工作流所需的节点。

### `[API]` — 响应形状错误

- 您的 ComfyUI 版本可能太旧或太新，无法与捆绑的预设兼容。
- 反向代理或 CDN 可能会破坏 JSON 响应。
- 尝试直接访问 `/prompt` 和 `/history` 以检查响应形状。

### `[IO]` — 文件权限或磁盘问题

- 确保您的工作区文件夹可写。
- 检查可用磁盘空间——视频的帧下载量可能很大。
- 在 Windows 上，为了获得最佳性能，请避免在网络驱动器上使用工作区。

### 未找到 FFmpeg

- 安装 FFmpeg 并确保 `ffmpeg.exe` 在您的系统 PATH 中。
- 或者将 `codecomfy.ffmpegPath` 设置为**完整的绝对路径**（例如，`C:\ffmpeg\bin\ffmpeg.exe`）。
- 出于安全考虑，相对路径和裸名称（不包括通过 PATH 解析的 `ffmpeg`）将被拒绝。

### “生成已在运行”

一次只能运行一个生成任务。
取消当前任务（`CodeComfy: Cancel Generation`），或等待其完成。
连续作业之间有 2 秒的冷却时间。

### 种子/提示验证

- 种子必须是介于 0 和 2,147,483,647 之间的整数。
- 提示不能为空，并且最多为 8,000 个字符。

## 安全性和数据范围

- **网络：**仅连接到用户配置的 ComfyUI URL（默认 `127.0.0.1:8188`）——没有其他外部请求
- **文件：**输出保存到工作区中的 `.codecomfy/outputs/` 和 `.codecomfy/runs/` ——不会触及工作区之外的文件
- **FFmpeg：**所有进程中都删除了 `shell: true`；路径必须是绝对的、存在的和可执行的
- 不会收集或发送任何遥测数据——有关完整策略，请参阅 [SECURITY.md](SECURITY.md)

## 已知限制

| 区域 | 状态 |
|------|--------|
| **Windows** | 已完全测试（Windows 10/11）。主要平台。 |
| **macOS** | 预计可以用于图像 + 视频生成。NextGallery 可能尚未可用。 |
| **Linux** | 预计可以用于图像 + 视频生成。NextGallery 可能尚未可用。 |
| **Remote / WSL** | ComfyUI URL 必须可从运行 VS Code 的主机访问。 |

核心功能（提示 → ComfyUI → 下载 → FFmpeg 组装）与平台无关。唯一的 Windows 特定功能是 NextGallery 自动检测，如果无法检测到，它会优雅地回退到“在设置中设置路径”的提示上。

如果您遇到特定于平台的问题，请[提交问题](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues)，并提供您的操作系统、VS Code 版本和 ComfyUI 版本。

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

MIT——有关详细信息，请参阅 [LICENSE](LICENSE)。

---

由 [MCP Tool Shop](https://mcp-tool-shop.github.io/) 构建
