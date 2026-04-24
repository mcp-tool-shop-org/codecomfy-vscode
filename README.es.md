<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/codecomfy-vscode/readme.png" alt="CodeComfy VSCode" width="400" />
</p>

[![CI](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml) [![Landing Page](https://img.shields.io/badge/Landing_Page-live-blue)](https://mcp-tool-shop-org.github.io/codecomfy-vscode/)

*Siéntese, escriba una instrucción y deje que el programa haga el trabajo.*

Genere imágenes y videos con ComfyUI sin salir de su editor.
Seleccione una configuración predefinida, escriba una instrucción y observe la barra de estado mientras CodeComfy
se encarga del envío del flujo de trabajo, la verificación del estado, la descarga de fotogramas y la compilación de FFmpeg.

> **Diseñado principalmente para Windows, pero compatible con otras plataformas.** Completamente probado en Windows 10/11.
> Se espera que macOS y Linux funcionen, pero consulte las [Limitaciones conocidas](#known-limitations).
> Se aceptan contribuciones.

---

## Requisitos previos

| Dependencia | Requerido | Notas |
|------------|----------|-------|
| **ComfyUI** | Sí | Ejecutándose localmente (`http://127.0.0.1:8188`) o en una máquina remota. CodeComfy se comunica a través de su API HTTP. |
| **FFmpeg**  | Para video | Debe estar en su PATH del sistema *o* configurado a través de `codecomfy.ffmpegPath`. [Descargue FFmpeg](https://ffmpeg.org/download.html). |
| **NextGallery** | Opcional | Visor de galería complementario. No es necesario para la generación en sí. |

## Instalación

CodeComfy aún no está disponible en el Marketplace de VS Code.
Instale desde un archivo `.vsix`:

1. Descargue el archivo `.vsix` más reciente de
[Releases](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases).
2. En VS Code: Barra lateral de **Extensiones** → menú `···` → **Instalar desde VSIX…**
3. Recargue la ventana cuando se le solicite.

### Configuración

Abra **Configuración → Extensiones → CodeComfy** o agréguelo a `settings.json`:

```json
{
  "codecomfy.comfyuiUrl": "http://127.0.0.1:8188",
  "codecomfy.ffmpegPath": "",
  "codecomfy.autoOpenGalleryOnComplete": true,
  "codecomfy.nextGalleryPath": "",
  "codecomfy.defaultNegativePrompt": ""
}
```

| Configuración | Descripción | Valor predeterminado |
|---------|-------------|---------|
| `codecomfy.comfyuiUrl` | URL del servidor de ComfyUI | `http://127.0.0.1:8188` |
| `codecomfy.ffmpegPath` | Ruta absoluta al ejecutable de FFmpeg (déjelo vacío para buscar en el PATH) | `""` |
| `codecomfy.autoOpenGalleryOnComplete` | Abrir NextGallery después de que finalice la generación | `true` |
| `codecomfy.nextGalleryPath` | Ruta absoluta a NextGallery.exe | Detección automática |
| `codecomfy.defaultNegativePrompt` | Instrucción negativa predeterminada que se completa durante la generación | `""` |

## Inicio rápido

1. **Inicie ComfyUI** — asegúrese de que se esté ejecutando y sea accesible.
2. **Seleccione un comando** — abra la Paleta de Comandos (`Ctrl+Shift+P`) y elija:
- `CodeComfy: Generate Image (HQ)` — imagen única
- `CodeComfy: Generate Video (HQ)` — video corto (2–8 s)
3. **Escriba una instrucción**, opcionalmente una **instrucción negativa** (cosas que evitar), y una **semilla**, y luego observe la barra de estado.

<!-- Screenshots: replace with real PNGs — see assets/SCREENSHOTS.md -->

La **barra de estado** muestra el progreso en tiempo real (en cola → generando → completado).

Los registros estructurados aparecen en el canal de salida de **CodeComfy**
(`Ctrl+Shift+U`, luego seleccione "CodeComfy").

Las salidas se guardan en `.codecomfy/outputs/` en la raíz de su espacio de trabajo.
Los metadatos de la ejecución se encuentran en `.codecomfy/runs/`.

### Cancelar

Ejecute `CodeComfy: Cancel Generation` desde la Paleta de Comandos o haga clic en el
elemento de la barra de estado mientras se está generando algo.

## Límites de generación

La generación de video impone límites de seguridad para evitar el agotamiento accidental de recursos:

| Parámetro | Mínimo | Máximo |
|-----------|-----|-----|
| Duración | 1 s | 15 s |
| FPS | 1   | 60   |
| Número total de fotogramas (duración × fps) | — | 450 |

Si alcanza un límite, reduzca la duración o elija una configuración predefinida con una frecuencia de fotogramas más baja.

## Solución de problemas

### `[Red]` — No se puede acceder al servidor de ComfyUI

- ¿Está ComfyUI en ejecución? Verifique `http://127.0.0.1:8188/system_stats` en un navegador.
- Si ComfyUI está en un puerto u host diferente, actualice `codecomfy.comfyuiUrl`.
- ¿Un firewall o un proxy están bloqueando la conexión? Intente `curl http://127.0.0.1:8188/system_stats`.

### `[Servidor]` — ComfyUI devolvió un error

- Revise la terminal/consola de ComfyUI para ver los rastros de pila.
- Causa común: falta un modelo o un nodo personalizado.
- Asegúrese de que ComfyUI tenga los nodos requeridos por el flujo de trabajo predefinido.

### `[API]` — Error en la estructura de la respuesta

- Es posible que su versión de ComfyUI sea demasiado antigua o demasiado nueva para los flujos de trabajo predefinidos.
- Un proxy inverso o una CDN podría estar alterando las respuestas JSON.
- Intente acceder directamente a `/prompt` y `/history` para inspeccionar la estructura de la respuesta.

### `[E/S]` — Problemas de permisos de archivo o del disco

- Asegúrese de que la carpeta de su espacio de trabajo sea de escritura.
- Verifique el espacio disponible en el disco; las descargas de fotogramas pueden ser grandes para videos.
- En Windows, evite usar espacios de trabajo en unidades de red para obtener el mejor rendimiento.

### No se encontró FFmpeg

- Instale FFmpeg y asegúrese de que `ffmpeg.exe` esté en la ruta del sistema.
- O configure `codecomfy.ffmpegPath` con la **ruta absoluta completa** (por ejemplo, `C:\ffmpeg\bin\ffmpeg.exe`).
- Las rutas relativas y los nombres sin ruta (aparte de `ffmpeg` resuelto por la ruta) se rechazan por motivos de seguridad.

### "La generación ya está en curso"

Solo se puede ejecutar una generación a la vez.
Cancela la generación actual (`CodeComfy: Cancelar generación`) o espera a que finalice.
Hay un período de espera de 2 segundos entre trabajos consecutivos.

### Validación de semilla/indicación

- Las semillas deben ser números enteros entre 0 y 2.147.483.647.
- Las indicaciones deben tener al menos un carácter y no pueden exceder los 8.000 caracteres.

## Seguridad y alcance de los datos

- **Red:** se conecta solo a la URL de ComfyUI configurada por el usuario (por defecto `127.0.0.1:8188`) — no se realizan otras solicitudes salientes.
- **Archivos:** los archivos se guardan en `.codecomfy/outputs/` y `.codecomfy/runs/` en el espacio de trabajo — no se modifican archivos fuera del espacio de trabajo.
- **FFmpeg:** se eliminó `shell: true` de todos los procesos; la ruta debe ser absoluta, existente y ejecutable.
- No se recopila ni se envía **telemetría** — consulte [SECURITY.md](SECURITY.md) para obtener la política completa.

## Limitaciones conocidas

| Área. | Estado. |
|------|--------|
| **Windows** | Completamente probado (Windows 10/11). Plataforma principal. |
| **macOS** | Se espera que funcione para la generación de imágenes y videos. Es posible que NextGallery no esté disponible todavía. |
| **Linux** | Se espera que funcione para la generación de imágenes y videos. Es posible que NextGallery no esté disponible todavía. |
| **Remote / WSL** | La URL de ComfyUI debe ser accesible desde el host que ejecuta VS Code. |

La funcionalidad principal (indicación → ComfyUI → descarga → ensamblaje de FFmpeg) es
independiente de la plataforma. La única función específica de Windows es la detección automática de NextGallery, que, en otras plataformas, muestra un mensaje para "establecer la ruta en la configuración".

Si encuentra un problema específico de la plataforma,
[abra un problema](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues)
con su sistema operativo, versión de VS Code y versión de ComfyUI.

## Cómo funciona

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

## Licencia

MIT — consulte [LICENSE](LICENSE) para obtener más detalles.

---

Creado por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
