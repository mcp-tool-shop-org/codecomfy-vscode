<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/codecomfy-vscode/readme.png" alt="CodeComfy VSCode" width="400" />
</p>

[![CI](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml) [![Landing Page](https://img.shields.io/badge/Landing_Page-live-blue)](https://mcp-tool-shop-org.github.io/codecomfy-vscode/)

*Rilassati, scrivi un prompt e lascia che CodeComfy faccia il lavoro.*

Genera immagini e video con ComfyUI senza uscire dall'editor.
Scegli un preset, scrivi un prompt e osserva la barra di stato mentre CodeComfy
gestisce l'invio del flusso di lavoro, il controllo dello stato, il download dei frame e l'assemblaggio con FFmpeg.

> **Progettato principalmente per Windows, ma compatibile con altre piattaforme.** Completamente testato su Windows 10/11.
> macOS e Linux dovrebbero funzionare, ma potrebbero esserci delle limitazioni (vedere [Limitazioni note](#known-limitations)).
> Sono benvenuti contributi.

---

## Prerequisiti

| Dipendenze | Necessario | Note |
|------------|----------|-------|
| **ComfyUI** | Sì | In esecuzione localmente (`http://127.0.0.1:8188`) o su una macchina remota. CodeComfy comunica tramite la sua API HTTP. |
| **FFmpeg**  | Per i video | Deve essere presente nel percorso di sistema (PATH) *oppure* configurato tramite `codecomfy.ffmpegPath`. [Scarica FFmpeg](https://ffmpeg.org/download.html). |
| **NextGallery** | Opzionale | Visualizzatore di galleria integrato. Non necessario per la generazione stessa. |

## Installazione

CodeComfy non è ancora disponibile sul Marketplace di VS Code.
Installa da un file `.vsix`:

1. Scarica l'ultimo file `.vsix` da
[Releases](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases).
2. In VS Code: barra laterale **Estensioni** → menu `···` → **Installa da VSIX…**
3. Ricarica la finestra quando richiesto.

### Impostazioni

Apri **Impostazioni → Estensioni → CodeComfy** oppure aggiungi al file `settings.json`:

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
| `codecomfy.ffmpegPath` | Percorso assoluto dell'eseguibile FFmpeg (lascia vuoto per la ricerca nel PATH) | `""` |
| `codecomfy.autoOpenGalleryOnComplete` | Apri NextGallery dopo il completamento della generazione | `true` |
| `codecomfy.nextGalleryPath` | Percorso assoluto di NextGallery.exe | Rilevamento automatico |
| `codecomfy.defaultNegativePrompt` | Prompt negativo predefinito inserito durante la generazione | `""` |

## Guida rapida

1. **Avvia ComfyUI** — assicurati che sia in esecuzione e raggiungibile.
2. **Scegli un comando** — apri la Palette dei comandi (`Ctrl+Shift+P`) e scegli:
- `CodeComfy: Genera immagine (alta qualità)` — singola immagine
- `CodeComfy: Genera video (alta qualità)` — breve video (2–8 s)
3. **Inserisci un prompt**, opzionalmente un **prompt negativo** (cose da evitare), e un **seed**, quindi osserva la barra di stato.

<!-- Screenshots: sostituisci con immagini PNG reali — vedi assets/SCREENSHOTS.md -->

La **barra di stato** mostra i progressi in tempo reale (in coda → in generazione → completato).

I log strutturati appaiono nel canale di output **CodeComfy**
(`Ctrl+Shift+U`, quindi seleziona "CodeComfy").

Gli output vengono salvati in `.codecomfy/outputs/` nella directory radice del tuo progetto.
I metadati delle esecuzioni si trovano in `.codecomfy/runs/`.

### Annulla

Esegui `CodeComfy: Annulla generazione` dalla Palette dei comandi oppure fai clic sull'elemento della
barra di stato mentre è in corso una generazione.

## Limiti di generazione

La generazione di video impone dei limiti di sicurezza per prevenire un consumo eccessivo di risorse:

| Parametro | Min | Max |
|-----------|-----|-----|
| Durata | 1 s | 15 s |
| FPS | 1   | 60   |
| Numero totale di frame (durata × fps) | — | 450 |

Se raggiungi un limite, riduci la durata o scegli un preset con una frequenza di fotogrammi inferiore.

## Risoluzione dei problemi

### `[Rete]` — Impossibile raggiungere il server ComfyUI

- ComfyUI è in esecuzione? Controlla `http://127.0.0.1:8188/system_stats` in un browser.
- Se ComfyUI è su una porta o host diverso, aggiorna `codecomfy.comfyuiUrl`.
- Il firewall o un proxy stanno bloccando la connessione? Prova `curl http://127.0.0.1:8188/system_stats`.

### `[Server]` — ComfyUI ha restituito un errore

- Controlla il terminale/la console di ComfyUI per i messaggi di errore (stack trace).
- Causa comune: checkpoint del modello mancante o nodo personalizzato.
- Assicurati che ComfyUI abbia i nodi richiesti dal flusso di lavoro predefinito.

### `[API]` — Errore nella struttura della risposta

- La tua versione di ComfyUI potrebbe essere troppo vecchia o troppo nuova per i preset inclusi.
- Un proxy inverso o una CDN potrebbe alterare le risposte JSON.
- Prova ad accedere direttamente a `/prompt` e `/history` per esaminare la struttura della risposta.

### `[IO]` — Problemi di permessi dei file o del disco

- Assicurati che la cartella di lavoro sia scrivibile.
- Controlla lo spazio disponibile sul disco; i download dei frame possono essere molto grandi per i video.
- Su Windows, evita di utilizzare cartelle di lavoro su unità di rete per ottenere le migliori prestazioni.

### FFmpeg non trovato

- Installa FFmpeg e assicurati che `ffmpeg.exe` sia presente nel percorso di sistema (PATH).
- Oppure, imposta `codecomfy.ffmpegPath` sul **percorso assoluto completo** (ad esempio, `C:\ffmpeg\bin\ffmpeg.exe`).
- I percorsi relativi e i nomi senza percorso (diversi da `ffmpeg` risolto dal PATH) non sono ammessi per motivi di sicurezza.

### "Generazione già in corso"

Può essere eseguita solo una generazione alla volta.
Annulla quella corrente (`CodeComfy: Annulla generazione`) oppure attendi che termini.
C'è un periodo di attesa di 2 secondi tra le attività consecutive.

### Validazione del seed/prompt

- I seed devono essere numeri interi compresi tra 0 e 2.147.483.647.
- I prompt devono essere non vuoti e contenere al massimo 8.000 caratteri.

## Sicurezza e ambito dei dati

- **Rete:** si connette solo all'URL di ComfyUI configurato dall'utente (predefinito `127.0.0.1:8188`) — non vengono inviate altre richieste in uscita.
- **File:** i file vengono salvati nelle cartelle `.codecomfy/outputs/` e `.codecomfy/runs/` all'interno della cartella di lavoro — nessun file al di fuori della cartella di lavoro viene modificato.
- **FFmpeg:** l'opzione `shell: true` è stata rimossa da tutte le esecuzioni; il percorso deve essere assoluto, esistente e eseguibile.
- Non vengono raccolti o inviati dati di telemetria; consulta [SECURITY.md](SECURITY.md) per la politica completa.

## Limitazioni note

| Area | Stato |
|------|--------|
| **Windows** | Completamente testato (Windows 10/11). Piattaforma principale. |
| **macOS** | Dovrebbe funzionare per la generazione di immagini e video. NextGallery potrebbe non essere ancora disponibile. |
| **Linux** | Dovrebbe funzionare per la generazione di immagini e video. NextGallery potrebbe non essere ancora disponibile. |
| **Remote / WSL** | L'URL di ComfyUI deve essere raggiungibile dall'host su cui è in esecuzione VS Code. |

La funzionalità principale (prompt → ComfyUI → download → assemblaggio FFmpeg) è
indipendente dalla piattaforma. L'unica funzionalità specifica per Windows è il rilevamento automatico di NextGallery, che in caso di problemi su altre piattaforme, propone di impostare il percorso nelle impostazioni.

Se riscontri un problema specifico della piattaforma, ti preghiamo di
[segnalare un problema](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues)
indicando il tuo sistema operativo, la versione di VS Code e la versione di ComfyUI.

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

MIT — consulta [LICENSE](LICENSE) per i dettagli.

---

Creato da [MCP Tool Shop](https://mcp-tool-shop.github.io/)
