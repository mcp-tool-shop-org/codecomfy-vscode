<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/codecomfy-vscode/readme.png" alt="CodeComfy VSCode" width="400" />
</p>

[![CI](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml) [![Landing Page](https://img.shields.io/badge/Landing_Page-live-blue)](https://mcp-tool-shop-org.github.io/codecomfy-vscode/)

*リラックスして、プロンプトを入力するだけ。後はCodeComfyにお任せください。*

エディタを閉じずに、ComfyUIで画像や動画を生成できます。
プリセットを選択し、プロンプトを入力して、ステータスバーを確認しながら、CodeComfyがワークフローの送信、ポーリング、フレームのダウンロード、およびFFmpegの処理を自動的に行います。

> **Windowsを優先、クロスプラットフォーム対応。** Windows 10/11で完全にテスト済み。
> macOSおよびLinuxでも動作するはずですが、[既知の制限事項](#known-limitations)を参照してください。
> 貢献歓迎。

---

## 前提条件

| 依存関係 | 必須 | 備考 |
|------------|----------|-------|
| **ComfyUI** | はい | ローカル環境 (`http://127.0.0.1:8188`) またはリモートマシンで実行します。CodeComfyはHTTP APIを介して通信します。 |
| **FFmpeg**  | 動画の場合 | システムPATHに登録されているか、または `codecomfy.ffmpegPath` で設定されている必要があります。 [FFmpegのダウンロード](https://ffmpeg.org/download.html)。 |
| **NextGallery** | オプション | Companion gallery viewer。生成自体には必須ではありません。 |

## インストール

CodeComfyはまだVS Code Marketplaceには登録されていません。
`.vsix`ファイルからインストールします。

1. 最新の`.vsix`ファイルを[Releases](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases)からダウンロードします。
2. VS Codeで：**Extensions** パネル → `···` メニュー → **Install from VSIX…**
3. プロンプトが表示されたら、ウィンドウを再読み込みします。

### 設定

**Settings → Extensions → CodeComfy** を開くか、`settings.json` に以下を追加します。

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
| `codecomfy.ffmpegPath` | FFmpeg実行可能ファイルへの絶対パス（PATHで検索する場合は空白のまま） | `""` |
| `codecomfy.autoOpenGalleryOnComplete` | 生成完了後にNextGalleryを開く | `true` |
| `codecomfy.nextGalleryPath` | NextGallery.exe への絶対パス | 自動検出 |
| `codecomfy.defaultNegativePrompt` | 生成時にデフォルトのネガティブプロンプトを自動的に入力 | `""` |

## クイックスタート

1. **ComfyUIを起動** — 起動していて、アクセス可能であることを確認します。
2. **コマンドを選択** — コマンドパレット (`Ctrl+Shift+P`) を開き、以下を選択します。
- `CodeComfy: Generate Image (HQ)` — 単一の画像
- `CodeComfy: Generate Video (HQ)` — 短い動画 (2〜8秒)
3. **プロンプトを入力** し、必要に応じて**ネガティブプロンプト**（避けるべきもの）と**シード**を入力し、ステータスバーを確認します。

<!-- スクリーンショット：実際のPNG画像に置き換えてください — 詳細は assets/SCREENSHOTS.md を参照してください -->

**ステータスバー**には、リアルタイムの進行状況（キューイング → 生成中 → 完了）が表示されます。

構造化されたログは、**CodeComfy** の出力チャンネル（`Ctrl+Shift+U` を押して、"CodeComfy" を選択）に表示されます。

出力ファイルは、ワークスペースのルートにある `.codecomfy/outputs/` フォルダに保存されます。
実行に関するメタデータは、`.codecomfy/runs/` フォルダに保存されます。

### キャンセル

コマンドパレットから `CodeComfy: Cancel Generation` を実行するか、生成中にステータスバーの項目をクリックして、生成をキャンセルします。

## 生成制限

動画生成では、リソースの過剰な消費を防ぐための安全制限が適用されます。

| パラメータ | 最小値 | 最大値 |
|-----------|-----|-----|
| 持続時間 | 1秒 | 15秒 |
| FPS | 1   | 60   |
| 総フレーム数 (持続時間 × FPS) | — | 450 |

制限に達した場合は、持続時間を短くするか、フレームレートの低いプリセットを選択してください。

## トラブルシューティング

### `[ネットワーク]` — ComfyUIサーバーに接続できません

- ComfyUIが実行されていますか？ ブラウザで `http://127.0.0.1:8188/system_stats` を確認してください。
- ComfyUIが別のポートまたはホストで実行されている場合は、`codecomfy.comfyuiUrl` を更新してください。
- ファイアウォールまたはプロキシが接続をブロックしていませんか？ `curl http://127.0.0.1:8188/system_stats` を試してみてください。

### `[サーバー]` — ComfyUIからエラーが返されました

- ComfyUIのターミナル/コンソールでスタックトレースを確認してください。
- よくある原因：モデルのチェックポイントまたはカスタムノードが不足している。
- 使用するプリセットワークフローに必要なノードがComfyUIにインストールされていることを確認してください。

### `[API]` — レスポンスの形式が正しくありません

- ComfyUIのバージョンが、同梱されているプリセットに対して古すぎるか、新すぎる可能性があります。
- リバースプロキシまたはCDNがJSONレスポンスを改ざんしている可能性があります。
- レスポンスの形式を確認するために、`/prompt` と `/history` に直接アクセスしてみてください。

### `[I/O]` — ファイルのアクセス権またはディスクの問題

- ワークスペースフォルダへの書き込み権限があることを確認してください。
- 空きディスク容量を確認してください。ビデオの場合、フレームのダウンロードサイズが大きくなることがあります。
- Windowsでは、最高のパフォーマンスを得るために、ネットワークドライブ上のワークスペースは避けてください。

### FFmpegが見つかりません

- FFmpegをインストールし、`ffmpeg.exe` がシステムのPATHに含まれていることを確認してください。
- または、`codecomfy.ffmpegPath` に、**絶対パス全体** (例: `C:\ffmpeg\bin\ffmpeg.exe`) を設定してください。
- 相対パスや、PATHで解決されないファイル名のみを指定することは、セキュリティ上の理由から許可されていません。

### 「生成処理中です」

一度に実行できる生成処理は1つだけです。
現在の処理をキャンセルします (`CodeComfy: キャンセル`)、または完了するまで待ちます。
連続したジョブの間には、2秒のクールダウン期間があります。

### シード/プロンプトの検証

- シードは、0から2,147,483,647までの整数である必要があります。
- プロンプトは、空でなく、最大8,000文字以内でなければなりません。

## セキュリティとデータ範囲

- **ネットワーク:** ユーザーが設定したComfyUIのURL (デフォルト: `127.0.0.1:8188`) への接続のみを行います。その他の外部へのリクエストは行いません。
- **ファイル:** 出力はワークスペース内の `.codecomfy/outputs/` および `.codecomfy/runs/` に保存されます。ワークスペース外のファイルは一切変更されません。
- **FFmpeg:** すべてのプロセスから `shell: true` が削除されました。パスは絶対パスで、存在し、実行可能である必要があります。
- **テレメトリは一切収集または送信されません。** 詳細については、[SECURITY.md](SECURITY.md) を参照してください。

## 既知の制限事項

| 領域 | 状態 |
|------|--------|
| **Windows** | Windows 10/11で完全にテスト済み。主要なプラットフォーム。 |
| **macOS** | 画像とビデオの生成が期待通りに動作します。NextGalleryはまだ利用できない場合があります。 |
| **Linux** | 画像とビデオの生成が期待通りに動作します。NextGalleryはまだ利用できない場合があります。 |
| **Remote / WSL** | ComfyUIのURLが、VS Codeを実行しているホストからアクセス可能である必要があります。 |

コア機能 (プロンプト → ComfyUI → ダウンロード → FFmpegの結合) は、
プラットフォームに依存しません。Windows固有の機能は、NextGalleryの
自動検出機能のみです。これは、他のプラットフォームでは、
「設定でパスを指定してください」というプロンプトにフォールバックします。

プラットフォーム固有の問題が発生した場合は、
[問題の報告](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues)
を、OS、VS Codeのバージョン、およびComfyUIのバージョンとともに行ってください。

## 動作原理

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

MIT — 詳細については、[LICENSE](LICENSE) を参照してください。

---

[MCP Tool Shop](https://mcp-tool-shop.github.io/) が作成しました。
