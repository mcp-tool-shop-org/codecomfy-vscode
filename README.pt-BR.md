<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/codecomfy-vscode/readme.png" alt="CodeComfy VSCode" width="400" />
</p>

[![CI](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml) [![Landing Page](https://img.shields.io/badge/Landing_Page-live-blue)](https://mcp-tool-shop-org.github.io/codecomfy-vscode/)

*Relaxe, digite uma instrução e deixe o CodeComfy fazer o trabalho.*

Gere imagens e vídeos com o ComfyUI sem sair do seu editor.
Escolha uma configuração predefinida, digite uma instrução e observe a barra de status enquanto o CodeComfy
gerencia o envio do fluxo de trabalho, a verificação do status, o download dos quadros e a montagem do FFmpeg.

> **Prioridade para Windows, compatível com outras plataformas.** Totalmente testado no Windows 10/11.
> macOS e Linux devem funcionar — veja as [Limitações Conhecidas](#known-limitations).
> Contribuições são bem-vindas.

---

## Pré-requisitos

| Dependências | Obrigatório | Observações |
|------------|----------|-------|
| **ComfyUI** | Sim | Executando localmente (`http://127.0.0.1:8188`) ou em uma máquina remota. O CodeComfy se comunica com sua API HTTP. |
| **FFmpeg**  | Para vídeos | Deve estar no seu PATH do sistema *ou* configurado via `codecomfy.ffmpegPath`. [Baixe o FFmpeg](https://ffmpeg.org/download.html). |
| **NextGallery** | Opcional | Visualizador de galeria complementar. Não é necessário para a geração em si. |

## Instalação

O CodeComfy ainda não está disponível no Marketplace do VS Code.
Instale a partir de um arquivo `.vsix`:

1. Baixe o arquivo `.vsix` mais recente em
[Releases](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases).
2. No VS Code: Barra lateral de **Extensões** → menu `···` → **Instalar a partir de VSIX…**
3. Recarregue a janela quando solicitado.

### Configurações

Abra **Configurações → Extensões → CodeComfy** ou adicione ao `settings.json`:

```json
{
  "codecomfy.comfyuiUrl": "http://127.0.0.1:8188",
  "codecomfy.ffmpegPath": "",
  "codecomfy.autoOpenGalleryOnComplete": true,
  "codecomfy.nextGalleryPath": "",
  "codecomfy.defaultNegativePrompt": ""
}
```

| Configuração | Descrição | Padrão |
|---------|-------------|---------|
| `codecomfy.comfyuiUrl` | URL do servidor ComfyUI | `http://127.0.0.1:8188` |
| `codecomfy.ffmpegPath` | Caminho absoluto para o executável FFmpeg (deixe em branco para busca no PATH) | `""` |
| `codecomfy.autoOpenGalleryOnComplete` | Abrir NextGallery após a conclusão da geração | `true` |
| `codecomfy.nextGalleryPath` | Caminho absoluto para NextGallery.exe | Detecção automática |
| `codecomfy.defaultNegativePrompt` | Prompt negativo padrão preenchido durante a geração | `""` |

## Início rápido

1. **Inicie o ComfyUI** — certifique-se de que ele está em execução e acessível.
2. **Escolha um comando** — abra o Paleta de Comandos (`Ctrl+Shift+P`) e escolha:
- `CodeComfy: Gerar Imagem (HQ)` — imagem única
- `CodeComfy: Gerar Vídeo (HQ)` — vídeo curto (2–8 s)
3. **Digite uma instrução**, opcionalmente uma **instrução negativa** (coisas a evitar), e uma **semente**, e observe a barra de status.

<!-- Screenshots: substitua por imagens PNG reais — veja assets/SCREENSHOTS.md -->

A **barra de status** mostra o progresso em tempo real (enfileirado → gerando → concluído).

Logs estruturados aparecem no canal de saída **CodeComfy**
(`Ctrl+Shift+U`, depois selecione "CodeComfy").

As saídas são salvas em `.codecomfy/outputs/` na raiz do seu espaço de trabalho.
Os metadados da execução estão em `.codecomfy/runs/`.

### Cancelar

Execute `CodeComfy: Cancelar Geração` na Paleta de Comandos ou clique no
item da barra de status enquanto uma geração está em andamento.

## Limites de Geração

A geração de vídeo impõe limites de segurança para evitar o esgotamento acidental de recursos:

| Parâmetro | Mínimo | Máximo |
|-----------|-----|-----|
| Duração | 1 s | 15 s |
| FPS | 1   | 60   |
| Número total de quadros (duração × fps) | — | 450 |

Se você atingir um limite, reduza a duração ou escolha uma configuração predefinida com uma taxa de quadros mais baixa.

## Solução de problemas

### `[Rede]` — Não é possível acessar o servidor ComfyUI

- O ComfyUI está em execução? Verifique `http://127.0.0.1:8188/system_stats` em um navegador.
- Se o ComfyUI estiver em uma porta ou host diferente, atualize `codecomfy.comfyuiUrl`.
- O firewall ou um proxy estão bloqueando a conexão? Tente `curl http://127.0.0.1:8188/system_stats`.

### `[Servidor]` — O ComfyUI retornou um erro

- Verifique o terminal/console do ComfyUI para rastreamentos de pilha.
- Causa comum: modelo de checkpoint ausente ou nó personalizado.
- Certifique-se de que o seu ComfyUI possui os nós necessários para o fluxo de trabalho predefinido.

### `[API]` — Erro no formato da resposta

- Sua versão do ComfyUI pode ser muito antiga ou muito nova para os presets incluídos.
- Um proxy reverso ou CDN pode estar corrompendo as respostas JSON.
- Tente acessar diretamente `/prompt` e `/history` para inspecionar o formato da resposta.

### `[E/S]` — Problemas de permissão de arquivo ou disco

- Certifique-se de que a pasta de trabalho é gravável.
- Verifique o espaço disponível no disco — os downloads de frames podem ser grandes para vídeos.
- No Windows, evite usar pastas de trabalho em unidades de rede para melhor desempenho.

### FFmpeg não encontrado

- Instale o FFmpeg e certifique-se de que `ffmpeg.exe` está no seu PATH do sistema.
- Ou defina `codecomfy.ffmpegPath` para o **caminho absoluto completo** (por exemplo, `C:\ffmpeg\bin\ffmpeg.exe`).
- Caminhos relativos e nomes simples (além do `ffmpeg` resolvido pelo PATH) são rejeitados por motivos de segurança.

### "Geração já em execução"

Apenas uma geração pode ser executada por vez.
Cancele a geração atual (`CodeComfy: Cancelar Geração`) ou espere que ela termine.
Existe um tempo de espera de 2 segundos entre tarefas consecutivas.

### Validação de seed/prompt

- Os seeds devem ser números inteiros entre 0 e 2.147.483.647.
- Os prompts devem ser não vazios e ter no máximo 8.000 caracteres.

## Segurança e Escopo de Dados

- **Rede:** conecta-se apenas ao URL do ComfyUI configurado pelo usuário (padrão `127.0.0.1:8188`) — nenhuma outra requisição de saída.
- **Arquivos:** os arquivos de saída são salvos em `.codecomfy/outputs/` e `.codecomfy/runs/` na pasta de trabalho — nenhum arquivo fora da pasta de trabalho é modificado.
- **FFmpeg:** a opção `shell: true` foi removida de todas as execuções; o caminho deve ser absoluto, existente e executável.
- **Nenhuma telemetria** é coletada ou enviada — consulte [SECURITY.md](SECURITY.md) para a política completa.

## Limitações Conhecidas

| Área. | Status. |
|------|--------|
| **Windows** | Totalmente testado (Windows 10/11). Plataforma principal. |
| **macOS** | Espera-se que funcione para geração de imagens e vídeos. A NextGallery pode não estar disponível ainda. |
| **Linux** | Espera-se que funcione para geração de imagens e vídeos. A NextGallery pode não estar disponível ainda. |
| **Remote / WSL** | O URL do ComfyUI deve ser acessível a partir do host que executa o VS Code. |

A funcionalidade principal (prompt → ComfyUI → download → montagem FFmpeg) é
agnóstica em relação à plataforma. A única funcionalidade específica do Windows é a
detecção automática da NextGallery, que, em outras plataformas, exibe uma mensagem
para que o usuário defina o caminho nas configurações.

Se você encontrar um problema específico da plataforma, por favor,
[abra um problema](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues)
com seu sistema operacional, versão do VS Code e versão do ComfyUI.

## Como Funciona

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

## Licença

MIT — consulte [LICENSE](LICENSE) para detalhes.

---

Desenvolvido por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
