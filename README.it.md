<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/codecomfy-vscode/readme.png" alt="CodeComfy VSCode" width="400" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://mcp-tool-shop-org.github.io/codecomfy-vscode/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page" /></a>
</p>

*Sei profili. Flussi di lavoro verificati. Nessuna tela.*

Controlla ComfyUI dal tuo editor: immagini, video, audio, mesh 3D e comprensione delle immagini. Seleziona un profilo, rispondi alle richieste che ti vengono fatte e osserva la barra di stato mentre CodeComfy gestisce l'invio, il polling, il download e l'assemblaggio. Ogni flusso di lavoro fornito viene verificato rispetto al catalogo ComfyUI attivo e i nodi o i modelli mancanti vengono identificati prima dell'invio.

> **Progettato principalmente per Windows, ma compatibile con altre piattaforme.** Completamente testato su Windows 10/11.
> Si prevede che macOS e Linux funzionino correttamente; consulta [Limitazioni note](#limitazioni-note).
> Sono benvenute le segnalazioni (PR).

---

## Prerequisiti

| Dipendenze | Obbligatorio | Note |
|------------|----------|-------|
| **VS Code** | Sì | `^1.85.0` o versione successiva. L'estensione utilizza le API `InputBox` e di annullamento strutturato introdotte con la versione 1.85; testata sulle versioni da 1.85.0 alla versione stabile corrente. |
| **ComfyUI** | Sì | Esecuzione in locale (`http://127.0.0.1:8188`) o su una macchina remota. CodeComfy comunica tramite la sua API HTTP. |
| **FFmpeg**  | Facoltativo | Necessario solo per le impostazioni predefinite legacy di assemblaggio dei fotogrammi. L'impostazione predefinita video fornita viene codificata direttamente da ComfyUI (`CreateVideo` → `SaveVideo`), quindi FFmpeg **non** è richiesto. [Scarica FFmpeg](https://ffmpeg.org/download.html). |
| **NextGallery** | Facoltativo | Visualizzatore di galleria complementare. Non necessario per la generazione vera e propria. |

## Installazione

### Dal VS Code Marketplace (consigliato)

1. Apri la barra laterale **Estensioni** (`Ctrl+Shift+X`).
2. Cerca **CodeComfy** o visita la
[pagina del Marketplace](https://marketplace.visualstudio.com/items?itemName=mcp-tool-shop.codecomfy-vscode).
3. Fai clic su **Installa** e ricarica la finestra quando richiesto.

### Da un file `.vsix` (alternativa)

Per le build di sviluppo o le installazioni offline:

1. Scarica l'ultima versione `.vsix` da
[Releases](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases).
2. In VS Code: barra laterale **Estensioni** → menu `···` → **Installa da VSIX…**
3. Ricarica la finestra quando richiesto.

### Impostazioni

Apri **Impostazioni → Estensioni → CodeComfy** o aggiungi a `settings.json`:

```json
{
  "codecomfy.comfyuiUrl": "http://127.0.0.1:8188",
  "codecomfy.ffmpegPath": "",
  "codecomfy.autoOpenGalleryOnComplete": true,
  "codecomfy.nextGalleryPath": "",
  "codecomfy.defaultNegativePrompt": ""
}
```

| Impostazione | Descrizione | Valore predefinito |
|---------|-------------|---------|
| `codecomfy.comfyuiUrl` | URL del server ComfyUI | `http://127.0.0.1:8188` |
| `codecomfy.ffmpegPath` | Percorso assoluto all'eseguibile FFmpeg (lascia vuoto per la ricerca nel PATH) | `""` |
| `codecomfy.autoOpenGalleryOnComplete` | Apri NextGallery al termine della generazione | `true` |
| `codecomfy.nextGalleryPath` | Percorso assoluto a NextGallery.exe | Rilevamento automatico |
| `codecomfy.defaultNegativePrompt` | Prompt negativo predefinito da inserire durante la generazione | `""` |

## Guida rapida

1. **Avvia ComfyUI**: assicurati che sia in esecuzione e accessibile.
2. **Seleziona un comando**: apri la tavolozza dei comandi (`Ctrl+Shift+P`) e scegli:
- `CodeComfy: Generate Image (HQ)`: immagine singola
- `CodeComfy: Generate Video (HQ)`: breve video (2–8 secondi)
3. **Inserisci un prompt**, facoltativamente un **prompt negativo** (elementi da evitare) e un **seed**, quindi osserva la barra di stato.

<!-- Screenshots: replace with real PNGs — see assets/SCREENSHOTS.md -->

La **barra di stato** mostra l'avanzamento in tempo reale (in coda → generazione → completato).

I log strutturati vengono visualizzati nel canale **CodeComfy** dell'output
(`Ctrl+Shift+U`, quindi seleziona "CodeComfy").

Gli output vengono salvati in `.codecomfy/outputs/` nella directory principale del tuo spazio di lavoro.
I metadati relativi all'esecuzione si trovano in `.codecomfy/runs/`.

### Annulla

Esegui `CodeComfy: Cancel Generation` dalla barra dei comandi oppure fai clic sull’elemento della barra di stato mentre è in corso una generazione. In questo modo si svuota la coda in sospeso **e** si interrompe il processo in esecuzione, quindi l’annullamento non avvia semplicemente il successivo elemento presente nella coda.

### Svuota la coda

`CodeComfy: Clear ComfyUI Queue` elimina tutti i processi *in sospeso* e lascia invariato quello in corso.

Questa è la versione più semplice di “pausa”: nella versione principale di ComfyUI è presente `/interrupt` (annulla, senza possibilità di ripresa) e nient’altro: non c’è una funzione di pausa né di ripresa dal passaggio N. L’unica cosa che si può fare è impedire l’avvio di ulteriori processi.

## Funzionalità

- **Sei profili**: immagine, video, audio, 3D, inferenza e metadati PNG, con 27 flussi di lavoro di riferimento verificati.
- **Preflight**: i nodi e i modelli mancanti vengono identificati prima dell’invio, in modo da non sprecare tempo di elaborazione sulla GPU per un processo che non può avere successo.
- **Progresso in tempo reale**: visualizzazione dei passaggi del campionatore nella barra di stato (`Step 12 / 20`), trasmessi tramite WebSocket di ComfyUI. In caso di problemi, si passa automaticamente a una modalità di controllo periodico.
- Preset integrati per immagini e video ad alta qualità: i video vengono eseguiti su **Wan 2.2 TI2V-5B** (licenza Apache-2.0, sicuro per uso commerciale) con **codifica lato server, senza FFmpeg**.
- **Preset di flusso di lavoro creati dagli utenti** (NOVITÀ): inserisci qualsiasi file JSON del flusso di lavoro di ComfyUI in `.codecomfy/presets/`.
- **Cronologia delle esecuzioni nella barra delle attività** (NOVITÀ): sfoglia e riesegui le generazioni precedenti.
- Progresso in tempo reale nella barra di stato.
- **Notifiche di completamento** (NOVITÀ, possibilità di disattivazione): ricevi una notifica quando un video lento è terminato.
- Canale di output strutturato per la diagnostica.
- Compatibile con diverse piattaforme (inizialmente Windows, previsto supporto per macOS e Linux).

## I sei profili

`CodeComfy: Run… (all profiles)` segue il flusso **profilo → impostazione predefinita → input**. Gli input vengono derivati dal grafico della stessa impostazione predefinita selezionata, quindi un'impostazione predefinita da immagine a video richiede un'immagine di origine e un'impostazione predefinita da testo a video non lo fa.

| Profilo | Cosa fa | Impostazioni predefinite |
|---------|--------------|---------|
| **Image** | Testo-immagine, modifica immagine, ControlNet unificato | Qwen txt2img, Qwen edit, ControlNet (Qwen / SDXL) |
| **Video** | Conversione da testo e immagini in video con modelli temporali reali | Hunyuan 1.5 i2v + 720p, Wan 14B, LTX, Mochi |
| **Audio** | Testo-musica e separazione delle tracce | ACE-Step 1.5 (musica / jingle / bozza / mp3), separazione |
| **3D** | Conversione da immagine a mesh, esportata come GLB | Hunyuan3D-2 (bozza / standard / dettaglio) |
| **Inference** | Didascalia, tag, rilevamento, segmentazione, OCR | Florence-2 (7 attività) |
| **Metadata** | Leggi il flusso di lavoro incorporato in un file PNG | Solo locale, non è necessario alcun server |

**Niente viene inviato prima che possa avere successo.** Ogni impostazione predefinita viene verificata rispetto al tuo server: i suoi nodi vengono controllati con `/object_info/{class}` e i suoi modelli con `/models/{folder}`. Un nodo mancante indica il pacchetto che lo fornisce, un modello mancante indica il file e la cartella in cui si trova; inoltre, non viene sprecato tempo della GPU per scoprirlo.

### Da dove provengono i flussi di lavoro

CodeComfy non crea grafici di flusso di lavoro. I 27 flussi di lavoro di riferimento sono presi dalla base di conoscenza presente nel repository di [comfy-headless](https://github.com/mcp-tool-shop-org/comfy-headless), dove ogni `class_type` viene verificato rispetto al catalogo ComfyUI attivo. I manutentori li aggiornano con `npm run kb:sync`; `npm run kb:check` fallisce se la copia importata si è discostata.

Una seconda copia, gestita manualmente, di tale base di conoscenza divergerebbe e questa divergenza in un grafico di flusso di lavoro sarebbe silenziosa: il grafico verrebbe eseguito senza errori e non restituirebbe nulla.

## Modelli video

`CodeComfy: Generate Video (HQ)` esegue **Wan 2.2 TI2V-5B**, derivato letteralmente dal modello `video_wan2_2_5B_ti2v` di ComfyUI. Wan 2.2 è con licenza **Apache-2.0**: l'output generato può essere utilizzato commercialmente.

Sono necessari tre file sul server ComfyUI:

| File | Posizione | Download |
|------|-----------|----------|
| `wan2.2_ti2v_5B_fp16.safetensors` | `models/diffusion_models/` | [Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors) |
| `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `models/text_encoders/` | [Comfy-Org/Wan_2.1_ComfyUI_repackaged](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors) |
| `wan2.2_vae.safetensors` | `models/vae/` | [Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors) |

> **Nota sulle versioni precedenti alla 1.2.0.** Il preset `hq-video` incluso nelle versioni da v1.0.0 a v1.1.0 non era un flusso di lavoro video, ma un grafico da testo a immagine che generava N fotogrammi indipendenti da un singolo prompt e li assemblava con FFmpeg. Non era coinvolto alcun modello di movimento, quindi l'output tremolava invece di muoversi. Questo è stato il nostro errore, non una limitazione di ComfyUI, e la versione 1.2.0 lo sostituisce. Se si dispone di una copia salvata del vecchio preset video `.codecomfy/presets/`, ora verrà visualizzato un avviso che spiega il problema.

## Limiti di generazione

La generazione di video applica limiti di sicurezza per prevenire l'esaurimento accidentale delle risorse:

| Parametro | Minimo | Massimo |
|-----------|-----|-----|
| Durata | 1 s | 15 s |
| FPS | 1   | 60   |
| Numero totale di fotogrammi (durata × fps) | — | 450 |

Se si raggiunge un limite, ridurre la durata o scegliere un preset con una frequenza di fotogrammi inferiore.

I conteggi dei fotogrammi per i modelli temporali vengono arrotondati al valore legale successivo `4n + 1` prima dell'invio (49, 53, 57, …): ComfyUI accetta conteggi non allineati senza problemi, ma il modello non li gestisce, quindi CodeComfy li arrotonda invece di lasciarli passare.

## Risoluzione dei problemi

### `[Network]`: impossibile raggiungere il server ComfyUI

- ComfyUI è in esecuzione? Controllare `http://127.0.0.1:8188/system_stats` in un browser.
- Se ComfyUI si trova su una porta o un host diverso, aggiornare `codecomfy.comfyuiUrl`.
- Firewall o proxy che bloccano la connessione? Provare `curl http://127.0.0.1:8188/system_stats`.

### `[Server]`: ComfyUI ha restituito un errore

- Controllare il terminale/la console di ComfyUI per le tracce dello stack.
- Causa comune: checkpoint del modello mancante o nodo personalizzato.
- Assicurarsi che la versione di ComfyUI disponga dei nodi richiesti dal flusso di lavoro del preset.

### `[API]`: errore nella forma della risposta

- La versione di ComfyUI potrebbe essere troppo vecchia o troppo nuova per i preset inclusi.
- Un proxy inverso o una CDN potrebbero alterare le risposte JSON.
- Provare a raggiungere direttamente `/prompt` e `/history` per esaminare la forma della risposta.

### `[IO]`: problemi di autorizzazioni dei file o del disco

- Assicurarsi che la cartella dell'area di lavoro sia scrivibile.
- Controllare lo spazio disponibile su disco: i download dei fotogrammi possono essere elevati per i video.
- Su Windows, evitare le aree di lavoro sui dischi di rete per ottenere le migliori prestazioni.

### FFmpeg non trovato

- Installare FFmpeg e assicurarsi che `ffmpeg.exe` sia presente nel PATH del sistema.
- Oppure impostare `codecomfy.ffmpegPath` sul percorso assoluto completo (ad esempio, `C:\ffmpeg\bin\ffmpeg.exe`).
- I percorsi relativi e i nomi semplici (diversi da `ffmpeg` risolti dal PATH) vengono rifiutati per motivi di sicurezza.

### "Generazione già in esecuzione"

È possibile eseguire solo una generazione alla volta.
Annullare quella corrente (`CodeComfy: Cancel Generation`) o attendere che termini.
Esiste un periodo di raffreddamento di 2 secondi tra le attività consecutive.

### Validazione del seme/prompt

- I semi devono essere numeri interi compresi tra 0 e 2.147.483.647.
- I prompt devono essere non vuoti e contenere al massimo 8.000 caratteri.

## Sicurezza e ambito dei dati

- **Rete:** si connette solo all'URL di ComfyUI configurato dall'utente (predefinito `127.0.0.1:8188`), non vengono effettuate altre richieste in uscita.
- **File:** l'output viene salvato in `.codecomfy/outputs/` e `.codecomfy/runs/` nell'area di lavoro: nessun file al di fuori dell'area di lavoro viene toccato.
- **FFmpeg:** `shell: true` rimosso da tutti i processi; il percorso deve essere assoluto, esistente ed eseguibile.
- Non vengono raccolti o inviati dati di telemetria: vedere [SECURITY.md](SECURITY.md) per l'informativa completa.

## Limitazioni note

| Area | Stato |
|------|--------|
| **Windows** | Completamente testato (Windows 10/11). Piattaforma principale. |
| **macOS** | Si prevede che funzioni per la generazione di immagini e video. NextGallery potrebbe non essere ancora disponibile. |
| **Linux** | Si prevede che funzioni per la generazione di immagini e video. NextGallery potrebbe non essere ancora disponibile. |
| **Remote / WSL** | L'URL di ComfyUI deve essere raggiungibile dall'host su cui è in esecuzione VS Code. |

La funzionalità principale (prompt → ComfyUI → download → assemblaggio FFmpeg) è indipendente dalla piattaforma. L'unica funzionalità specifica per Windows è il rilevamento automatico di NextGallery, che in altre piattaforme torna a un prompt che chiede all'utente di impostare il percorso nelle impostazioni.

Se si riscontra un problema specifico della piattaforma, aprire un problema su [https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues) indicando il sistema operativo, la versione di VS Code e la versione di ComfyUI.

## Come funziona

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

## Licenza

MIT: vedere [LICENSE](LICENSE) per i dettagli.

---

Creato da [MCP Tool Shop](https://mcp-tool-shop.github.io/)
