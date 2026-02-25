<p align="center">
  <img src="assets/icon.png" alt="CodeComfy icon" width="96" />
</p>

# CodeComfy: Geração de imagens usando ComfyUI a partir do VS Code

[![CI](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml)

*Relaxe, digite uma instrução e deixe o sistema fazer o trabalho.*

Crie imagens e vídeos com o ComfyUI sem sair do seu editor.
Escolha uma configuração predefinida, digite uma descrição e observe a barra de status enquanto o CodeComfy gerencia o envio do fluxo de trabalho, a verificação de status, o download dos quadros e a montagem com FFmpeg.

**Prioridade para Windows, compatível com diversas plataformas.** Totalmente testado no Windows 10/11.
Espera-se que funcione no macOS e no Linux — consulte [Limitações conhecidas](#known-limitations).
Contribuições são bem-vindas.

---

## Pré-requisitos

| Dependência. | Obrigatório. | Notes |
| Sure, please provide the English text you would like me to translate. I will do my best to provide an accurate and natural-sounding Portuguese translation. | Please provide the English text you would like me to translate. I am ready to translate it into Portuguese. | Please provide the English text you would like me to translate. I am ready to translate it into Portuguese. |
| **ComfyUI** | Yes | Pode ser executado localmente (em `http://127.0.0.1:8188`) ou em uma máquina remota. O CodeComfy se comunica através de sua API HTTP. |
| **FFmpeg**  | Para vídeo. | Deve estar no seu sistema PATH *ou* configurado através da variável `codecomfy.ffmpegPath`. [Baixe o FFmpeg](https://ffmpeg.org/download.html). |
| **NextGallery** | Opcional. | Visualizador de galeria complementar. Não é necessário para a geração em si. |

## Instalação

O CodeComfy ainda não está disponível na loja do VS Code.
Instale a partir de um arquivo `.vsix`:

1. Faça o download da versão mais recente do arquivo `.vsix` em:
[Lançamentos](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases).
2. No VS Code: barra lateral de **Extensões** → menu `···` → **Instalar a partir de VSIX…**
3. Recarregue a janela quando for solicitado.

### Configurações

Abra **Configurações → Extensões → CodeComfy** ou adicione o seguinte ao arquivo `settings.json`:

```json
{
  "codecomfy.comfyuiUrl": "http://127.0.0.1:8188",
  "codecomfy.ffmpegPath": "",
  "codecomfy.autoOpenGalleryOnComplete": true,
  "codecomfy.nextGalleryPath": "",
  "codecomfy.defaultNegativePrompt": ""
}
```

| Cenário. | Descrição. | Padrão. |
| Please provide the English text you would like me to translate. I am ready to translate it into Portuguese. | "Please provide the text you would like me to translate." | Please provide the English text you would like me to translate. I am ready to translate it into Portuguese. |
| `codecomfy.comfyuiUrl` | URL do servidor ComfyUI. | `http://127.0.0.1:8188` |
| `codecomfy.ffmpegPath` | Caminho absoluto para o executável do FFmpeg (deixe em branco para que o sistema procure no PATH). | `""` |
| `codecomfy.autoOpenGalleryOnComplete` | Abra a galeria "NextGallery" após a conclusão da geração. | `true` |
| `codecomfy.nextGalleryPath` | Caminho absoluto para o arquivo NextGallery.exe. | Detecção automática. |
| `codecomfy.defaultNegativePrompt` | Prompt negativo padrão preenchido automaticamente durante a geração. | `""` |

## Início rápido

1. **Inicie o ComfyUI** — certifique-se de que ele está em execução e acessível.
2. **Selecione um comando** — abra a paleta de comandos (`Ctrl+Shift+P`) e escolha:
- `CodeComfy: Gerar Imagem (Alta Qualidade)` — imagem única.
- `CodeComfy: Gerar Vídeo (Alta Qualidade)` — vídeo curto (2–8 segundos).
3. **Insira uma descrição**, opcionalmente uma **descrição negativa** (elementos a evitar), e uma **semente**, e observe a barra de status.

<!-- Imagens: substituir pelas imagens PNG reais – veja assets/SCREENSHOTS.md -->

A **barra de status** exibe o progresso em tempo real (na fila → gerando → concluído).

Os logs estruturados aparecem no canal de saída do **CodeComfy** (pressione `Ctrl+Shift+U` e, em seguida, selecione "CodeComfy").

Os resultados são salvos na pasta `.codecomfy/outputs/`, localizada na raiz do seu espaço de trabalho.
As informações sobre as execuções (metadados) ficam armazenadas na pasta `.codecomfy/runs/`.

### Cancelar

Execute o comando "CodeComfy: Cancelar Geração" a partir da paleta de comandos ou clique no item da barra de status enquanto uma geração estiver em andamento.

## Limites de geração

A geração de vídeos impõe limites de segurança para evitar o consumo acidental de recursos.

| Parâmetro. | Min | Max |
| "Please provide the text you would like me to translate." |-----|-----|
| Duração. | 1 s | 15 s |
| FPS       | 1   | 60   |
| Número total de quadros (duração × quadros por segundo). | — | 450 |

Se você atingir um limite, reduza a duração ou escolha uma configuração predefinida com uma taxa de quadros mais baixa.

## Resolução de problemas

### `[Rede]` — Não foi possível conectar ao servidor do ComfyUI

- O ComfyUI está em execução? Verifique o endereço `http://127.0.0.1:8188/system_stats` em um navegador.
- Se o ComfyUI estiver em uma porta ou servidor diferente, atualize a variável `codecomfy.comfyuiUrl`.
- O firewall ou um servidor proxy estão bloqueando a conexão? Tente executar o comando `curl http://127.0.0.1:8188/system_stats`.

### `[Servidor]` — O ComfyUI retornou um erro

- Verifique o terminal/console do ComfyUI para verificar se há mensagens de erro (stack traces).
- Causa comum: arquivo de modelo (checkpoint) ausente ou nó personalizado.
- Certifique-se de que o seu ComfyUI possui os nós necessários para o fluxo de trabalho (preset) que você está utilizando.

### `[API]` — Erro no formato da resposta

- A sua versão do ComfyUI pode ser muito antiga ou muito recente para os presets incluídos.
- Um servidor proxy reverso ou uma CDN podem estar corrompendo as respostas em formato JSON.
- Tente acessar diretamente os caminhos `/prompt` e `/history` para verificar a estrutura da resposta.

### `[IO]` — Problemas de permissão de arquivo ou de disco

- Certifique-se de que a pasta do seu espaço de trabalho tenha permissão de escrita.
- Verifique o espaço disponível no disco rígido, pois os downloads de vídeos podem ocupar muito espaço.
- No Windows, evite usar espaços de trabalho em unidades de rede para obter o melhor desempenho.

### O FFmpeg não foi encontrado

- Instale o FFmpeg e certifique-se de que o arquivo `ffmpeg.exe` está no caminho de acesso do seu sistema (PATH).
- Ou defina a variável `codecomfy.ffmpegPath` para o **caminho absoluto completo** (por exemplo, `C:\ffmpeg\bin\ffmpeg.exe`).
- Caminhos relativos e nomes de arquivo incompletos (além do `ffmpeg` encontrado no PATH) são rejeitados por motivos de segurança.

### "A geração já está em andamento."

Apenas uma geração pode ser executada por vez.
Para cancelar a geração atual, use a opção (`CodeComfy: Cancelar Geração`) ou aguarde até que ela seja concluída.
Existe um intervalo de 2 segundos entre tarefas consecutivas.

### Validação de sementes/instruções

- As sementes devem ser números inteiros entre 0 e 2.147.483.647.
- As instruções (prompts) devem ser preenchidas e ter no máximo 8.000 caracteres.

## Limitações conhecidas

| Area | Status. |
| Please provide the English text you would like me to translate. I am ready to translate it into Portuguese. | Please provide the English text you would like me to translate. I am ready to translate it into Portuguese. |
| **Windows** | Totalmente testado (Windows 10/11). Plataforma principal. |
| macOS | Espera-se que esta ferramenta seja utilizada para a geração de imagens e vídeos. É possível que o recurso "NextGallery" ainda não esteja disponível. |
| **Linux** | Espera-se que funcione para a geração de imagens e vídeos. É possível que o NextGallery ainda não esteja disponível. |
| **Remote / WSL** | O endereço URL do ComfyUI deve ser acessível a partir do computador que está executando o VS Code. |

A funcionalidade principal (prompt → ComfyUI → download → montagem com FFmpeg) é independente de plataforma. A única funcionalidade específica para Windows é a detecção automática do NextGallery, que, em outras plataformas, volta a apresentar uma mensagem solicitando que o usuário defina o caminho no menu de configurações.

Se você encontrar algum problema específico de um determinado sistema operacional, por favor,
[registre um problema](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues)
informando o seu sistema operacional, a versão do VS Code e a versão do ComfyUI.

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

MIT.
