<p align="center">
  <img src="assets/icon.png" alt="CodeComfy icon" width="96" />
</p>

# CodeComfy: Generazione di immagini con ComfyUI direttamente da VS Code

[![CI](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml)

*Rilassatevi, scrivete una richiesta e lasciate che il sistema faccia il lavoro.*

Genera immagini e video con ComfyUI senza dover lasciare il tuo editor.
Scegli una configurazione predefinita, inserisci un testo descrittivo e osserva la barra di stato mentre CodeComfy gestisce l'invio del processo, il controllo dello stato, il download dei fotogrammi e l'assemblaggio con FFmpeg.

**Progettato principalmente per Windows, ma compatibile con diverse piattaforme.** Completamente testato su Windows 10/11.
Si prevede che funzioni anche su macOS e Linux, ma consultare la sezione "[Limitazioni note](#known-limitations)" per maggiori dettagli.
Siamo aperti a contributi.

---

## Prerequisiti

| Dipendenza. | Richiesto. | Notes |
| Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." | Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." | Certainly. Please provide the English text you would like me to translate. |
| **ComfyUI** | Yes | Funzionamento locale (tramite `http://127.0.0.1:8188`) o su una macchina remota. CodeComfy comunica tramite la sua API HTTP. |
| **FFmpeg**  | Per i video. | Deve essere presente nel percorso di sistema (*PATH*) oppure configurato tramite la variabile `codecomfy.ffmpegPath`. [Scarica FFmpeg](https://ffmpeg.org/download.html). |
| **NextGallery** | Opzionale. | Visualizzatore di gallerie aggiuntive. Non necessario per la generazione stessa. |

## Installazione

CodeComfy non è ancora disponibile sul marketplace di VS Code.
È possibile installarlo da un file `.vsix`:

1. Scaricare l'ultima versione del file `.vsix` da
[Releases](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases).
2. In VS Code: barra laterale **Estensioni** → menu `···` → **Installa da VSIX…**
3. Ricaricare la finestra quando richiesto.

### Impostazioni

Aprire **Impostazioni → Estensioni → CodeComfy** oppure aggiungere la seguente configurazione al file `settings.json`:

```json
{
  "codecomfy.comfyuiUrl": "http://127.0.0.1:8188",
  "codecomfy.ffmpegPath": "",
  "codecomfy.autoOpenGalleryOnComplete": true,
  "codecomfy.nextGalleryPath": "",
  "codecomfy.defaultNegativePrompt": ""
}
```

| Ambientazione. | Descrizione. | Predefinito. |
| Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." | Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." | Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." |
| `codecomfy.comfyuiUrl` | URL del server ComfyUI. | `http://127.0.0.1:8188` |
| `codecomfy.ffmpegPath` | Percorso assoluto dell'eseguibile di FFmpeg (lasciare vuoto per la ricerca nel percorso di sistema). | `""` |
| `codecomfy.autoOpenGalleryOnComplete` | Aprire NextGallery al termine del processo di generazione. | `true` |
| `codecomfy.nextGalleryPath` | Percorso assoluto del file NextGallery.exe. | Rilevamento automatico. |
| `codecomfy.defaultNegativePrompt` | Prompt negativo predefinito inserito automaticamente durante la generazione. | `""` |

## Guida rapida

1. **Avviare ComfyUI** – assicurarsi che sia in esecuzione e accessibile.
2. **Selezionare un comando** – aprire la palette dei comandi (`Ctrl+Shift+P`) e scegliere:
- `CodeComfy: Genera immagine (alta qualità)` – per generare una singola immagine.
- `CodeComfy: Genera video (alta qualità)` – per generare un breve video (2–8 secondi).
3. **Inserire un prompt**, facoltativamente un **prompt negativo** (elementi da evitare), e un **valore di seed**, quindi osservare la barra di stato.

<!-- Immagini: sostituire con immagini PNG reali – vedere il file assets/SCREENSHOTS.md -->

La **barra di stato** mostra l'avanzamento in tempo reale (in coda → in elaborazione → completato).

I log strutturati vengono visualizzati nel canale di output di **CodeComfy** (premere `Ctrl+Shift+U`, quindi selezionare "CodeComfy").

I risultati vengono salvati nella cartella `.codecomfy/outputs/`, che si trova nella directory principale del vostro ambiente di lavoro.
Le informazioni relative alle esecuzioni sono memorizzate nella cartella `.codecomfy/runs/`.

### Annulla

Eseguire il comando `CodeComfy: Annulla generazione` dalla barra dei comandi oppure fare clic sull'elemento della barra di stato mentre una generazione è in corso.

## Limiti di generazione

La generazione di video applica delle limitazioni di sicurezza per prevenire un esaurimento accidentale delle risorse.

| Parametro. | Min | Max |
| Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." |-----|-----|
| Durata. | 1 s | 15 s |
| FPS       | 1   | 60   |
| Numero totale di fotogrammi (durata moltiplicata per i fotogrammi al secondo). | — | 450 |

Se si raggiunge un limite, ridurre la durata del video o scegliere una preimpostazione con una frequenza di fotogrammi inferiore.

## Risoluzione dei problemi

### `[Rete]` — Impossibile connettersi al server di ComfyUI

- ComfyUI è in esecuzione? Verificare l'indirizzo `http://127.0.0.1:8188/system_stats` tramite un browser.
- Se ComfyUI è in esecuzione su una porta o un host diverso, aggiornare il valore di `codecomfy.comfyuiUrl`.
- Il firewall o un proxy stanno bloccando la connessione? Provare a utilizzare il comando `curl http://127.0.0.1:8188/system_stats`.

### `[Server]` — ComfyUI ha restituito un errore

- Controllare il terminale/la console di ComfyUI per eventuali messaggi di errore (stack trace).
- Causa comune: file di checkpoint del modello mancante o nodo personalizzato non presente.
- Assicurarsi che ComfyUI disponga dei nodi necessari per il flusso di lavoro predefinito.

### `[API]` – Errore nella struttura della risposta

- La versione di ComfyUI che stai utilizzando potrebbe essere troppo vecchia o troppo recente per i preset inclusi.
- Un server proxy inverso o una CDN potrebbero alterare le risposte in formato JSON.
- Prova ad accedere direttamente ai percorsi `/prompt` e `/history` per esaminare la struttura delle risposte.

### `[IO]` – Problemi di permessi dei file o di accesso al disco

- Assicurarsi che la cartella di lavoro sia scrivibile.
- Verificare lo spazio disponibile su disco, poiché i download dei fotogrammi possono essere di grandi dimensioni, soprattutto per i video.
- Su Windows, evitare di utilizzare cartelle di lavoro su unità di rete per ottenere le migliori prestazioni.

### FFmpeg non trovato

- Installare FFmpeg e assicurarsi che `ffmpeg.exe` sia presente nel percorso di sistema (PATH).
- In alternativa, impostare la variabile `codecomfy.ffmpegPath` con il **percorso assoluto completo** (ad esempio, `C:\ffmpeg\bin\ffmpeg.exe`).
- I percorsi relativi e i nomi di file senza percorso completo (diversi da `ffmpeg` trovato nel percorso di sistema) non sono accettati per motivi di sicurezza.

### "La generazione è già attiva."

Solo una generazione può essere eseguita contemporaneamente.
Annullare la generazione corrente ("CodeComfy: Annulla Generazione") oppure attendere che termini.
È previsto un intervallo di 2 secondi tra le operazioni successive.

### Validazione dei dati di input / delle istruzioni iniziali

- I valori dei "seed" devono essere numeri interi compresi tra 0 e 2.147.483.647.
- Le istruzioni (prompt) non devono essere vuote e non possono superare i 8.000 caratteri.

## Limitazioni note

| Area | Stato. |
| Translate the following English text into Italian:

"The company is committed to providing high-quality products and services. We strive to meet the needs of our customers and to exceed their expectations. We are constantly innovating and improving our processes to offer the best possible solutions."
"L'azienda si impegna a fornire prodotti e servizi di alta qualità. Ci sforziamo di soddisfare le esigenze dei nostri clienti e di superare le loro aspettative. Innoviamo e miglioriamo costantemente i nostri processi per offrire le soluzioni migliori possibili." | Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." |
| **Windows** | Completamente testato (su Windows 10/11). Piattaforma principale. |
| macOS. | Si prevede che questo strumento venga utilizzato per la generazione di immagini e video. Potrebbe essere che NextGallery non sia ancora disponibile. |
| **Linux** | Si prevede che questo strumento venga utilizzato per la generazione di immagini e video. Potrebbe essere che NextGallery non sia ancora disponibile. |
| **Remote / WSL** | L'URL di ComfyUI deve essere accessibile dal sistema che esegue Visual Studio Code. |

Le funzionalità principali (prompt → ComfyUI → download → compilazione di FFmpeg) sono indipendenti dalla piattaforma. L'unica funzionalità specifica per Windows è il rilevamento automatico di NextGallery, che su altre piattaforme ricorre a un messaggio che invita a impostare il percorso nelle impostazioni.

Se riscontrate un problema specifico per una determinata piattaforma, vi preghiamo di
[segnalare il problema](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues)
indicando il vostro sistema operativo, la versione di VS Code e la versione di ComfyUI.

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

MIT.
