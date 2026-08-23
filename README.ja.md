<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/codecomfy-vscode/readme.png" alt="CodeComfy VSCode" width="400" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://mcp-tool-shop-org.github.io/codecomfy-vscode/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page" /></a>
</p>

*6つのプロファイル。検証済みのワークフロー。キャンバスはなし。*

エディターからComfyUIを操作 — 画像、ビデオ、オーディオ、3Dメッシュ、および画像理解機能。プロファイルを選択し、求められる入力情報を入力し、CodeComfyが送信、ポーリング、ダウンロード、およびアセンブリを実行する間、ステータスバーを確認します。すべての公開されたワークフローは、ライブのComfyUIカタログに対して検証され、不足しているノードやモデルは、送信前に名前で示されます。

> **Windows優先、クロスプラットフォーム対応。** Windows 10/11で完全にテスト済み。macOSとLinuxでも動作する見込みです。[既知の制限事項](#known-limitations)を参照してください。PR（プルリクエスト）を歓迎します。

---

## 前提条件

| 依存関係 | 必須 | 注記 |
|------------|----------|-------|
| **VS Code** | はい | `^1.85.0`以降。この拡張機能は、1.85で導入された`InputBox`と構造化キャンセルAPIを使用しており、1.85.0から最新の安定版までテストされています。 |
| **ComfyUI** | はい | ローカル（`http://127.0.0.1:8188`）またはリモートマシン上で実行します。CodeComfyはHTTP APIと通信します。 |
| **FFmpeg**  | オプション | レガシーフレームアセンブリプリセットにのみ必要です。公開されているビデオプリセットは、ComfyUI自体（`CreateVideo` → `SaveVideo`）でエンコードされるため、FFmpegは**不要**です。[FFmpegをダウンロード](https://ffmpeg.org/download.html)してください。 |
| **NextGallery** | オプション | コンパニオンギャラリービューアー。生成自体には必要ありません。 |

## インストール

### VS Code Marketplaceから（推奨）

1. **拡張機能**サイドバーを開きます（`Ctrl+Shift+X`）。
2. **CodeComfy**を検索するか、[Marketplaceのページ](https://marketplace.visualstudio.com/items?itemName=mcp-tool-shop.codecomfy-vscode)にアクセスします。
3. **インストール**をクリックし、プロンプ​​トが表示されたらウィンドウを再読み込みします。

### `.vsix`ファイルから（代替手段）

開発ビルドまたはオフラインインストールの場合は：

1. 最新の`.vsix`を[リリース](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases)からダウンロードします。
2. VS Codeで：**拡張機能**サイドバー → `···`メニュー → **VSIXファイルからインストール…**
3. プロンプ​​トが表示されたらウィンドウを再読み込みします。

### 設定

**設定 → 拡張機能 → CodeComfy**を開くか、`settings.json`に追加します：

```json
{
  "codecomfy.comfyuiUrl": "http://127.0.0.1:8188",
  "codecomfy.ffmpegPath": "",
  "codecomfy.autoOpenGalleryOnComplete": true,
  "codecomfy.nextGalleryPath": "",
  "codecomfy.defaultNegativePrompt": ""
}
```

| 設定項目 | 説明 | デフォルト値 |
|---------|-------------|---------|
| `codecomfy.comfyuiUrl` | ComfyUIサーバーのURL | `http://127.0.0.1:8188` |
| `codecomfy.ffmpegPath` | FFmpeg実行ファイルの絶対パス（PATH検索の場合は空白） | `""` |
| `codecomfy.autoOpenGalleryOnComplete` | 生成が完了したらNextGalleryを開く | `true` |
| `codecomfy.nextGalleryPath` | NextGallery.exeへの絶対パス | 自動検出 |
| `codecomfy.defaultNegativePrompt` | 生成中に事前に設定されるデフォルトのネガティブプロンプト | `""` |

## クイックスタート

1. **ComfyUIを起動** — 実行中であり、アクセス可能であることを確認します。
2. **コマンドを選択** — コマンドパレットを開き（`Ctrl+Shift+P`）、次のいずれかを選択します：
- `CodeComfy: Generate Image (HQ)` — 単一の画像
- `CodeComfy: Generate Video (HQ)` — 短いビデオ（2〜8秒）
3. プロンプトを入力し、オプションでネガティブプロンプト（避けるべきこと）とシードを入力し、ステータスバーを確認します。

<!-- Screenshots: replace with real PNGs — see assets/SCREENSHOTS.md -->

**ステータスバー**には、リアルタイムの進行状況（キューイング中 → 生成中 → 完了）が表示されます。

構造化されたログは、**CodeComfy**出力チャンネルに表示されます（`Ctrl+Shift+U`を選択し、「CodeComfy」を選択）。

出力は、ワークスペースのルートにある`.codecomfy/outputs/`に保存されます。実行メタデータは、`.codecomfy/runs/`に保存されます。

### キャンセル

コマンドパレットから`CodeComfy: Cancel Generation`を実行するか、生成中にステータスバー項目をクリックします。

## 機能

- **6つのプロファイル** — 画像、ビデオ、オーディオ、3D、推論、およびPNGメタデータ。27の検証済みの参照ワークフローが含まれます。
- **プリフライト** — ワークフローを送信する前に、不足しているノードとモデルの名前が示されるため、GPU時間を無駄に実行できない原因を防ぎます。
- 高品質な画像+ビデオプリセット内蔵 — ビデオは**Wan 2.2 TI2V-5B**（Apache-2.0、商用利用可能）で実行され、**サーバー側のエンコードを使用し、FFmpegは不要**です。
- **ユーザー作成のワークフロープリセット**（新規）— ComfyUIワークフローJSONを`.codecomfy/presets/`にドロップします。
- **アクティビティバーの実行履歴**（新規）— 過去の生成結果を参照して再実行できます。
- ステータスバーでのリアルタイム進行状況表示。
- **完了通知**（新規、オプトアウト可能）— 遅いビデオが終了したときに通知します。
- 診断用の構造化出力チャンネル。
- クロスプラットフォーム（Windows優先、macOS + Linuxも対応予定）。

## 6つのプロファイル

`CodeComfy: Run… (all profiles)`は**プロファイル → プリセット → 入力**の順に処理します。入力は、選択したプリセット自体のグラフから派生するため、画像-ビデオプリセットではソース画像が要求され、テキスト-ビデオプリセットでは要求されません。

| プロファイル | その機能 | プリセット |
|---------|--------------|---------|
| **Image** | テキストから画像を生成、画像の編集、Union ControlNet | Qwen txt2img、Qwen edit、ControlNet（Qwen / SDXL） |
| **Video** | テキストと画像からリアルな時間モデルでビデオを生成 | Hunyuan 1.5 i2v + 720p、Wan 14B、LTX、Mochi |
| **Audio** | テキストから音楽を生成し、ステム分離を実行 | ACE-Step 1.5（音楽/ジング​​ル/ドラフト/mp3）、分離 |
| **3D** | 画像からメッシュを生成し、GLBとしてエクスポート | Hunyuan3D-2（ドラフト/標準/詳細） |
| **Inference** | キャプション、タグ付け、検出、セグメンテーション、OCR | Florence-2（7つのタスク） |
| **Metadata** | PNGに埋め込まれたワークフローを読み取る | ローカルのみで動作し、サーバーは不要 |

**成功する前に何も送信されません。**すべてのプリセットは、サーバーに対して事前にチェックされます。そのノードは`/object_info/{class}`を使用して確認され、モデルは`/models/{folder}`を使用して確認されます。不足しているノードは、それを提供するパッケージの名前を示し、不足しているモデルはファイル名とそれが属するフォルダーの名前を示します。GPU時間を無駄にすることはありません。

### ワークフローの入手先

CodeComfyはワークフローグラフを作成しません。27個の参照ワークフローは、[comfy-headless](https://github.com/mcp-tool-shop-org/comfy-headless)のリポジトリ内の知識ベースから提供されており、各`class_type`はライブのComfyUIカタログに対して検証されます。メンテナーはそれらを`npm run kb:sync`で更新します。提供されたコピーが変更されている場合、`npm run kb:check`は失敗します。

手動でメンテナンスされる2番目の知識ベースも変更され、ワークフローグラフ内で変更が発生すると、グラフは正常に実行されますが、何も返しません。

## ビデオモデル

`CodeComfy: Generate Video (HQ)`は、ComfyUI自身の`video_wan2_2_5B_ti2v`テンプレートから正確に派生した**Wan 2.2 TI2V-5B**を実行します。Wan 2.2は**Apache-2.0**であり、生成された出力は商用利用が可能です。

ComfyUIサーバー上に3つのファイルが必要です。

| ファイル | 配置場所 | ダウンロード |
|------|-----------|----------|
| `wan2.2_ti2v_5B_fp16.safetensors` | `models/diffusion_models/` | [Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors) |
| `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `models/text_encoders/` | [Comfy-Org/Wan_2.1_ComfyUI_repackaged](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors) |
| `wan2.2_vae.safetensors` | `models/vae/` | [Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors) |

> **1.2.0より前のバージョンに関する注意。** v1.0.0からv1.1.0に搭載されていた`hq-video`プリセットは、**ビデオワークフローではありませんでした**。これは、1つのプロンプトからN個の独立したフレームを生成し、FFmpegでそれらを結合するテキストから画像へのグラフでした。モーションモデルは含まれておらず、出力が移動する代わりにちらついていました。これは当社の欠陥であり、ComfyUIの制限ではなく、v1.2.0で置き換えられました。古いビデオプリセットの保存された`.codecomfy/presets/`コピーがある場合は、問題について警告が表示されるようになります。

## 生成制限

ビデオ生成では、リソースの意図しない枯渇を防ぐために、安全な制限が適用されます。

| パラメータ | 最小値 | 最大値 |
|-----------|-----|-----|
| 期間 | 1秒 | 15秒 |
| FPS | 1   | 60   |
| 合計フレーム数（期間×fps） | — | 450 |

制限に達した場合は、期間を短縮するか、フレームレートの低いプリセットを選択してください。

時間モデルのフレーム数は、送信前に次の有効な`4n + 1`値（49、53、57など）に調整されます。ComfyUIはグリッド外の値を受け入れますが、モデルはそれらを処理しないため、CodeComfyは値をそのまま通過させるのではなく、調整します。

## トラブルシューティング

### `[Network]` - ComfyUIサーバーに接続できません

- ComfyUIは実行されていますか？ブラウザで`http://127.0.0.1:8188/system_stats`を確認してください。
- ComfyUIが別のポートまたはホストで実行されている場合は、`codecomfy.comfyuiUrl`を更新してください。
- ファイアウォールまたはプロキシが接続をブロックしていませんか？`curl http://127.0.0.1:8188/system_stats`を試してください。

### `[Server]` - ComfyUIからエラーが返されました

- ComfyUIターミナル/コンソールでスタックトレースを確認してください。
- 一般的な原因：モデルチェックポイントまたはカスタムノードが見つかりません。
- ComfyUIに、プリセットワークフローに必要なノードが含まれていることを確認してください。

### `[API]` - 応答の形状エラー

- ComfyUIのバージョンが古すぎたり新しすぎたりして、バンドルされたプリセットと互換性がない可能性があります。
- リバースプロキシまたはCDNがJSONレスポンスを破損している可能性があります。
- `/prompt`と`/history`に直接アクセスして、応答の形状を確認してみてください。

### `[IO]` - ファイルの権限またはディスクの問題

- ワークスペースフォルダーへの書き込みが可能であることを確認してください。
- 利用可能なディスク領域を確認してください。ビデオの場合、フレームのダウンロードサイズが大きくなる可能性があります。
- Windowsでは、最高のパフォーマンスを得るために、ネットワークドライブ上のワークスペースの使用は避けてください。

### FFmpegが見つかりません

- FFmpegをインストールし、`ffmpeg.exe`がシステムのPATHに含まれていることを確認してください。
- または、`codecomfy.ffmpegPath`を**完全な絶対パス**（例：`C:\ffmpeg\bin\ffmpeg.exe`）に設定します。
- セキュリティ上の理由から、相対パスとベア名（PATHで解決される`ffmpeg`を除く）は拒否されます。

### 「生成がすでに実行中です」

一度に1つの生成しか実行できません。
現在のものをキャンセルするか（`CodeComfy: Cancel Generation`）、完了するまで待機してください。
連続したジョブの間には2秒のクールダウンがあります。

### シード/プロンプトの検証

- シードは、0から2,147,483,647までの整数である必要があります。
- プロンプトは空でなく、最大8,000文字である必要があります。

## セキュリティとデータ範囲

- **ネットワーク：**ユーザーが構成したComfyUI URL（デフォルトは`127.0.0.1:8188`）にのみ接続します。他のアウトバウンドリクエストはありません。
- **ファイル：**ワークスペース内の`.codecomfy/outputs/`と`.codecomfy/runs/`に出力された保存ファイル。ワークスペース外のファイルにはアクセスしません。
- **FFmpeg：**すべてのスプawnから`shell: true`が削除されました。パスは絶対パスであり、存在し、実行可能である必要があります。
- **テレメトリは収集または送信されません**。完全なポリシーについては、[SECURITY.md](SECURITY.md)を参照してください。

## 既知の制限事項

| 領域 | 状態 |
|------|--------|
| **Windows** | 完全にテスト済み（Windows 10/11）。主要なプラットフォームです。 |
| **macOS** | 画像とビデオの生成で動作することが予想されます。NextGalleryはまだ利用できない場合があります。 |
| **Linux** | 画像とビデオの生成で動作することが予想されます。NextGalleryはまだ利用できない場合があります。 |
| **Remote / WSL** | ComfyUI URLは、VS Codeを実行しているホストからアクセスできる必要があります。 |

コア機能（プロンプト→ComfyUI→ダウンロード→FFmpegアセンブリ）はプラットフォームに依存しません。Windows固有の機能はNextGalleryの自動検出のみであり、他のプラットフォームでは「設定でパスを設定する」というプロンプトが表示されます。

プラットフォーム固有の問題が発生した場合は、OS、VS Codeバージョン、ComfyUIバージョンを記載して、[問題を提起](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues)してください。

## 仕組み

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

## ライセンス

MIT - 詳細については、[LICENSE](LICENSE)を参照してください。

---

[MCP Tool Shop](https://mcp-tool-shop.github.io/)によって作成されました。
