<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/codecomfy-vscode/readme.png" alt="CodeComfy VSCode" width="400" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://mcp-tool-shop-org.github.io/codecomfy-vscode/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page" /></a>
</p>

*Seis perfis. Fluxos de trabalho verificados. Sem tela.*

Controle o ComfyUI a partir do seu editor — imagens, vídeo, áudio, malhas 3D e compreensão de imagem. Escolha um perfil, responda às perguntas que ele faz e observe a barra de status enquanto o CodeComfy lida com o envio, a verificação, o download e a montagem. Cada fluxo de trabalho enviado é verificado em relação ao catálogo ativo do ComfyUI, e os nós ou modelos ausentes são identificados antes que qualquer coisa seja enviada.

> **Prioridade para Windows, compatível com várias plataformas.** Totalmente testado no Windows 10/11.
> Espera-se que macOS e Linux funcionem — consulte [Limitações conhecidas](#limitações-conhecidas).
> PRs são bem-vindos.

---

## Pré-requisitos

| Dependência | Obrigatório | Notas |
|------------|----------|-------|
| **VS Code** | Sim | `^1.85.0` ou mais recente. A extensão usa as APIs `InputBox` e de cancelamento estruturado que foram lançadas com a versão 1.85; testado nas versões 1.85.0 até a versão estável atual. |
| **ComfyUI** | Sim | Executando localmente (`http://127.0.0.1:8188`) ou em uma máquina remota. O CodeComfy se comunica com sua API HTTP. |
| **FFmpeg**  | Opcional | Necessário apenas para configurações de montagem de quadros legadas. A configuração de vídeo enviada é codificada pelo próprio ComfyUI (`CreateVideo` → `SaveVideo`), portanto, o FFmpeg **não** é necessário. [Baixe o FFmpeg](https://ffmpeg.org/download.html). |
| **NextGallery** | Opcional | Visualizador de galeria complementar. Não é necessário para a geração em si. |

## Instalação

### A partir do VS Code Marketplace (recomendado)

1. Abra a barra lateral **Extensões** (`Ctrl+Shift+X`).
2. Pesquise por **CodeComfy** ou visite o
[listagem no Marketplace](https://marketplace.visualstudio.com/items?itemName=mcp-tool-shop.codecomfy-vscode).
3. Clique em **Instalar** e recarregue a janela quando solicitado.

### A partir de um arquivo `.vsix` (alternativa)

Para versões de desenvolvimento ou instalações offline:

1. Baixe o arquivo `.vsix` mais recente em
[Releases](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases).
2. No VS Code: barra lateral **Extensões** → menu `···` → **Instalar a partir de VSIX…**
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
| `codecomfy.ffmpegPath` | Caminho absoluto para o arquivo executável do FFmpeg (deixe em branco para pesquisa no PATH) | `""` |
| `codecomfy.autoOpenGalleryOnComplete` | Abrir NextGallery após a conclusão da geração | `true` |
| `codecomfy.nextGalleryPath` | Caminho absoluto para NextGallery.exe | Detecção automática |
| `codecomfy.defaultNegativePrompt` | Prompt negativo padrão preenchido durante a geração | `""` |

## Guia rápido

1. **Inicie o ComfyUI** — certifique-se de que ele esteja em execução e acessível.
2. **Escolha um comando** — abra a Paleta de comandos (`Ctrl+Shift+P`) e escolha:
- `CodeComfy: Generate Image (HQ)` — imagem única
- `CodeComfy: Generate Video (HQ)` — vídeo curto (2–8 s)
3. **Insira um prompt**, opcionalmente um **prompt negativo** (coisas para evitar) e uma **semente**, e observe a barra de status.

<!-- Screenshots: replace with real PNGs — see assets/SCREENSHOTS.md -->

A **barra de status** mostra o progresso em tempo real (em fila → gerando → concluído).

Os logs estruturados aparecem no canal **CodeComfy** da Saída
(`Ctrl+Shift+U`, depois selecione "CodeComfy").

As saídas são salvas em `.codecomfy/outputs/` na raiz do seu espaço de trabalho.
Os metadados de execução estão localizados em `.codecomfy/runs/`.

### Cancelar

Execute `CodeComfy: Cancel Generation` a partir da Paleta de Comandos ou clique no item da barra de estado enquanto uma geração estiver em andamento. Isso limpa a fila pendente **e** interrompe o trabalho em execução — portanto, cancelar não apenas inicia o próximo trabalho que você tinha na fila.

### Limpar a fila

`CodeComfy: Clear ComfyUI Queue` cancela todos os trabalhos *pendentes* e deixa o trabalho em execução intacto.

Esta é a versão mais direta de "pausar": a versão principal do ComfyUI tem `/interrupt` (cancelar, sem retomar) e nada mais — não há pausa nem retomada no passo N. Impedir que mais trabalhos comecem é o que realmente pode ser feito.

## Recursos

- **Seis perfis** — imagem, vídeo, áudio, 3D, inferência e metadados PNG, com 27 fluxos de trabalho de referência verificados.
- **Pré-verificação** — os nós e modelos ausentes são identificados antes que qualquer coisa seja enviada, para que nenhum tempo da GPU seja gasto em uma execução que não pode ser concluída.
- **Progresso em tempo real** — etapas reais do sampler na barra de status (`Step 12 / 20`), transmitidas pelo WebSocket do ComfyUI. Retorna automaticamente ao modo de consulta.
- Predefinições integradas de imagem e vídeo de alta qualidade — vídeos executados no **Wan 2.2 TI2V-5B** (Apache-2.0, seguro para uso comercial) com **codificação do lado do servidor, sem FFmpeg**.
- **Predefinições de fluxo de trabalho criadas pelo usuário** (NOVO) — coloque qualquer arquivo JSON de fluxo de trabalho do ComfyUI em `.codecomfy/presets/`.
- **Histórico de execução na barra de atividades** (NOVO) — navegue e execute novamente as gerações anteriores.
- Progresso em tempo real na barra de status.
- **Notificações de conclusão** (NOVO, opção para desativar) — saiba quando um vídeo lento for concluído.
- Canal de saída estruturado para diagnósticos.
- Multiplataforma (inicialmente para Windows, macOS + Linux previsto).

## Os seis perfis

`CodeComfy: Run… (all profiles)` percorre **perfil → configuração → entradas**. As entradas são derivadas do próprio gráfico da configuração escolhida, portanto, uma configuração de imagem para vídeo solicita uma imagem de origem e uma configuração de texto para vídeo não.

| Perfil | O que ele faz | Configurações |
|---------|--------------|---------|
| **Image** | Texto para imagem, edição de imagem, união ControlNet | Qwen txt2img, Qwen edit, ControlNet (Qwen / SDXL) |
| **Video** | Texto e imagem para vídeo em modelos temporais reais | Hunyuan 1.5 i2v + 720p, Wan 14B, LTX, Mochi |
| **Audio** | Texto para música e separação de faixas | ACE-Step 1.5 (música / jingle / rascunho / mp3), separação |
| **3D** | Imagem para malha, exportada como GLB | Hunyuan3D-2 (rascunho / padrão / detalhe) |
| **Inference** | Legenda, tag, detecção, segmentação, OCR | Florence-2 (7 tarefas) |
| **Metadata** | Leia o fluxo de trabalho incorporado em um PNG | somente local, sem servidor necessário |

**Nada é enviado antes que possa ter sucesso.** Cada configuração é pré-verificada em relação ao seu servidor: seus nós são verificados com `/object_info/{class}` e seus modelos com `/models/{folder}`. Um nó ausente identifica o pacote que o fornece, um modelo ausente identifica o arquivo e a pasta à qual ele pertence — e nenhum tempo da GPU é gasto para descobrir.

### De onde vêm os fluxos de trabalho

O CodeComfy não cria gráficos de fluxo de trabalho. Os 27 fluxos de trabalho de referência são importados da base de conhecimento do repositório [comfy-headless](https://github.com/mcp-tool-shop-org/comfy-headless), onde cada `class_type` é verificado em relação ao catálogo ComfyUI ativo. Os responsáveis pela manutenção os atualizam com `npm run kb:sync`; `npm run kb:check` falha se a cópia importada estiver desatualizada.

Uma segunda cópia mantida manualmente desse conhecimento ficaria desatualizada e, em um gráfico de fluxo de trabalho, isso passaria despercebido — o gráfico é executado sem problemas e não retorna nada.

## Modelos de vídeo

`CodeComfy: Generate Video (HQ)` executa **Wan 2.2 TI2V-5B**, derivado literalmente do próprio modelo `video_wan2_2_5B_ti2v` do ComfyUI. Wan 2.2 é **Apache-2.0** — a saída gerada pode ser usada comercialmente.

Ele precisa de três arquivos no seu servidor ComfyUI:

| Arquivo | Coloque em | Download |
|------|-----------|----------|
| `wan2.2_ti2v_5B_fp16.safetensors` | `models/diffusion_models/` | [Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors) |
| `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `models/text_encoders/` | [Comfy-Org/Wan_2.1_ComfyUI_repackaged](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors) |
| `wan2.2_vae.safetensors` | `models/vae/` | [Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors) |

> **Observação sobre versões anteriores à 1.2.0.** O modelo `hq-video` incluído nas versões v1.0.0 e v1.1.0 não era um fluxo de trabalho de vídeo — era um gráfico de texto para imagem que gerava N quadros independentes a partir de um único prompt e os combinava com o FFmpeg. Não havia nenhum modelo de movimento envolvido, então a saída tremeluzia em vez de se mover. Esse foi o nosso defeito, não uma limitação do ComfyUI, e a versão v1.2.0 o substitui. Se você tiver uma cópia salva `.codecomfy/presets/` do antigo modelo de vídeo, ele agora registrará um aviso explicando o problema.

## Limites de geração

A geração de vídeo aplica limites de segurança para evitar o esgotamento acidental de recursos:

| Parâmetro | Mín. | Máx. |
|-----------|-----|-----|
| Duração | 1 s | 15 s |
| FPS | 1   | 60   |
| Total de quadros (duração × fps) | — | 450 |

Se você atingir um limite, reduza a duração ou escolha um modelo com uma taxa de quadros mais baixa.

As contagens de quadros para modelos temporais são arredondadas para o próximo valor `4n + 1` válido (49, 53, 57, ...) antes do envio — o ComfyUI aceita contagens fora da grade sem problemas, mas o modelo não as processa, então o CodeComfy as ajusta em vez de permitir que o valor seja usado.

## Solução de problemas

### `[Network]` — Não é possível acessar o servidor ComfyUI

- O ComfyUI está em execução? Verifique `http://127.0.0.1:8188/system_stats` em um navegador.
- Se o ComfyUI estiver em uma porta ou host diferente, atualize `codecomfy.comfyuiUrl`.
- Firewall ou proxy bloqueando a conexão? Tente `curl http://127.0.0.1:8188/system_stats`.

### `[Server]` — O ComfyUI retornou um erro

- Verifique o terminal/console do ComfyUI para obter rastreamentos de pilha.
- Causa comum: modelo ou nó personalizado ausente.
- Certifique-se de que seu ComfyUI tenha os nós exigidos pelo fluxo de trabalho predefinido.

### `[API]` — Erro no formato da resposta

- Sua versão do ComfyUI pode ser muito antiga ou muito recente para os modelos incluídos.
- Um proxy reverso ou CDN pode estar corrompendo as respostas JSON.
- Tente acessar `/prompt` e `/history` diretamente para inspecionar o formato da resposta.

### `[IO]` — Problemas de permissão de arquivo ou disco

- Certifique-se de que sua pasta de espaço de trabalho seja gravável.
- Verifique o espaço livre em disco — os downloads de quadros podem ser grandes para vídeos.
- No Windows, evite usar espaços de trabalho em unidades de rede para obter o melhor desempenho.

### FFmpeg não encontrado

- Instale o FFmpeg e certifique-se de que `ffmpeg.exe` esteja no PATH do seu sistema.
- Ou defina `codecomfy.ffmpegPath` para o **caminho absoluto completo** (por exemplo, `C:\ffmpeg\bin\ffmpeg.exe`).
- Caminhos relativos e nomes simples (além do `ffmpeg` resolvido pelo PATH) são rejeitados por motivos de segurança.

### "Geração já em execução"

Apenas uma geração pode ser executada por vez.
Cancele a geração atual (`CodeComfy: Cancel Generation`) ou espere que ela termine.
Há um intervalo de 2 segundos entre os trabalhos consecutivos.

### Validação de semente/prompt

- As sementes devem ser números inteiros entre 0 e 2.147.483.647.
- Os prompts não podem estar vazios e devem ter no máximo 8.000 caracteres.

## Segurança e escopo de dados

- **Rede:** conecta-se apenas à URL do ComfyUI configurada pelo usuário (padrão `127.0.0.1:8188`) — nenhuma outra solicitação externa
- **Arquivos:** as saídas são salvas em `.codecomfy/outputs/` e `.codecomfy/runs/` no espaço de trabalho — nenhum arquivo fora do espaço de trabalho é acessado
- **FFmpeg:** `shell: true` removido de todos os processos; o caminho deve ser absoluto, existente e executável
- **Nenhuma telemetria** é coletada ou enviada — consulte [SECURITY.md](SECURITY.md) para obter a política completa

## Limitações conhecidas

| Área | Status |
|------|--------|
| **Windows** | Totalmente testado (Windows 10/11). Plataforma principal. |
| **macOS** | Espera-se que funcione para geração de imagem e vídeo. O NextGallery pode ainda não estar disponível. |
| **Linux** | Espera-se que funcione para geração de imagem e vídeo. O NextGallery pode ainda não estar disponível. |
| **Remote / WSL** | A URL do ComfyUI deve ser acessível a partir do host onde o VS Code está em execução. |

A funcionalidade principal (prompt → ComfyUI → download → montagem FFmpeg) é independente da plataforma. O único recurso específico do Windows é a detecção automática do NextGallery, que retorna graciosamente para um prompt "defina o caminho nas configurações" em outras plataformas.

Se você encontrar um problema específico da plataforma, abra um [problema](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues) com seu sistema operacional, versão do VS Code e versão do ComfyUI.

## Como funciona

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

MIT — consulte [LICENSE](LICENSE) para obter detalhes.

---

Criado por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
