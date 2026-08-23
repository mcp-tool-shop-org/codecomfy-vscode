<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/codecomfy-vscode/readme.png" alt="CodeComfy VSCode" width="400" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://mcp-tool-shop-org.github.io/codecomfy-vscode/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page" /></a>
</p>

*Seis perfiles. Flujos de trabajo verificados. Sin lienzo.*

Controla ComfyUI desde tu editor: imágenes, video, audio, mallas 3D y comprensión de imágenes. Elige un perfil, responde a las preguntas que se te hagan y observa la barra de estado mientras CodeComfy gestiona el envío, la consulta, la descarga y el ensamblaje. Cada flujo de trabajo incluido se verifica con el catálogo activo de ComfyUI, y los nodos o modelos faltantes se identifican antes de enviar cualquier cosa.

> **Prioridad en Windows, compatible con múltiples plataformas.** Totalmente probado en Windows 10/11. Se espera que macOS y Linux funcionen; consulta [Limitaciones conocidas](#limitaciones-conocidas). Las contribuciones son bienvenidas.

---

## Requisitos previos

| Dependencia | Obligatorio | Notas |
|------------|----------|-------|
| **VS Code** | Sí | `^1.85.0` o posterior. La extensión utiliza las API de `InputBox` y cancelación estructurada que se incluyeron en la versión 1.85; probado en las versiones 1.85.0 hasta la última estable. |
| **ComfyUI** | Sí | Ejecución local (`http://127.0.0.1:8188`) o en una máquina remota. CodeComfy se comunica con su API HTTP. |
| **FFmpeg**  | Opcional | Solo es necesario para los ajustes de ensamblaje de fotogramas heredados. El ajuste de video incluido se codifica mediante el propio ComfyUI (`CreateVideo` → `SaveVideo`), por lo que FFmpeg **no** es obligatorio. [Descarga FFmpeg](https://ffmpeg.org/download.html). |
| **NextGallery** | Opcional | Visor de galería complementario. No es necesario para la generación en sí. |

## Instalación

### Desde el Marketplace de VS Code (recomendado)

1. Abre la barra lateral **Extensiones** (`Ctrl+Shift+X`).
2. Busca **CodeComfy** o visita la
[ficha del Marketplace](https://marketplace.visualstudio.com/items?itemName=mcp-tool-shop.codecomfy-vscode).
3. Haz clic en **Instalar** y vuelve a cargar la ventana cuando se te solicite.

### Desde un archivo `.vsix` (alternativa)

Para versiones de desarrollo o instalaciones sin conexión:

1. Descarga el último archivo `.vsix` desde
[Releases](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases).
2. En VS Code: barra lateral **Extensiones** → menú `···` → **Instalar desde VSIX…**
3. Vuelve a cargar la ventana cuando se te solicite.

### Configuración

Abre **Configuración → Extensiones → CodeComfy** o añade a `settings.json`:

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
| `codecomfy.ffmpegPath` | Ruta absoluta al ejecutable de FFmpeg (déjalo en blanco para buscarlo en PATH) | `""` |
| `codecomfy.autoOpenGalleryOnComplete` | Abrir NextGallery después de que finalice la generación | `true` |
| `codecomfy.nextGalleryPath` | Ruta absoluta a NextGallery.exe | Detección automática |
| `codecomfy.defaultNegativePrompt` | Indicación negativa predeterminada que se rellenará durante la generación | `""` |

## Guía rápida

1. **Inicia ComfyUI**: asegúrate de que esté en ejecución y accesible.
2. **Elige un comando**: abre la paleta de comandos (`Ctrl+Shift+P`) y elige:
- `CodeComfy: Generate Image (HQ)`: imagen única
- `CodeComfy: Generate Video (HQ)`: video corto (de 2 a 8 segundos)
3. **Introduce una indicación**, opcionalmente una **indicación negativa** (cosas que se deben evitar) y una **semilla**, y luego observa la barra de estado.

<!-- Screenshots: replace with real PNGs — see assets/SCREENSHOTS.md -->

La **barra de estado** muestra el progreso en tiempo real (en cola → generando → completado).

Los registros estructurados aparecen en el canal de salida de **CodeComfy**
(`Ctrl+Shift+U`, luego selecciona "CodeComfy").

Las salidas se guardan en `.codecomfy/outputs/` en la raíz de tu espacio de trabajo. Los metadatos de ejecución se encuentran en `.codecomfy/runs/`.

### Cancelar

Ejecuta `CodeComfy: Cancel Generation` desde la paleta de comandos o haz clic en el elemento de la barra de estado mientras una generación está en curso.

## Características

- **Seis perfiles**: imagen, video, audio, 3D, inferencia y metadatos PNG, con 27 flujos de trabajo de referencia verificados.
- **Preflight**: los nodos y modelos faltantes se identifican antes de enviar cualquier cosa, por lo que no se gasta tiempo de GPU en una ejecución que no puede tener éxito.
- Ajustes integrados de imagen y video de alta calidad: el video se ejecuta en **Wan 2.2 TI2V-5B** (Apache-2.0, seguro para uso comercial) con **codificación del lado del servidor, sin FFmpeg**.
- **Ajustes de flujo de trabajo creados por el usuario** (NUEVO): coloca cualquier archivo JSON de flujo de trabajo de ComfyUI en `.codecomfy/presets/`.
- **Historial de ejecución en la barra de actividades** (NUEVO): explora y vuelve a ejecutar generaciones anteriores.
- Progreso en tiempo real en la barra de estado.
- **Notificaciones de finalización** (NUEVO, se puede desactivar): sabrás cuándo termina un video lento.
- Canal de salida estructurado para el diagnóstico.
- Compatible con múltiples plataformas (prioridad en Windows, se espera que funcione en macOS y Linux).

## Los seis perfiles

`CodeComfy: Run… (all profiles)` sigue el patrón **perfil → ajuste → entradas**. Las entradas se derivan del propio gráfico del ajuste elegido, por lo que un ajuste de imagen a video solicita una imagen de origen y un ajuste de texto a video no.

| Perfil | Qué hace | Ajustes |
|---------|--------------|---------|
| **Image** | Texto a imagen, edición de imágenes, ControlNet combinado | Qwen txt2img, Qwen edit, ControlNet (Qwen / SDXL) |
| **Video** | Texto e imagen a video en modelos temporales reales | Hunyuan 1.5 i2v + 720p, Wan 14B, LTX, Mochi |
| **Audio** | Texto a música y separación de pistas | ACE-Step 1.5 (música / jingle / borrador / mp3), separación |
| **3D** | Imagen a malla, exportada como GLB | Hunyuan3D-2 (borrador / estándar / detalle) |
| **Inference** | Leyenda, etiqueta, detección, segmentación, OCR | Florence-2 (7 tareas) |
| **Metadata** | Lee el flujo de trabajo incrustado en un PNG | Solo local, no se necesita servidor |

**Nada se envía antes de que pueda tener éxito.** Cada ajuste se verifica previamente con tu servidor: sus nodos se comprueban con `/object_info/{class}` y sus modelos con `/models/{folder}`. Un nodo faltante indica el paquete que lo proporciona, un modelo faltante indica el archivo y la carpeta a los que pertenece, y no se gasta tiempo de GPU en averiguarlo.

### De dónde provienen los flujos de trabajo

CodeComfy no crea gráficos de flujo de trabajo. Los 27 flujos de trabajo de referencia se obtienen de la base de conocimientos dentro del repositorio de [comfy-headless](https://github.com/mcp-tool-shop-org/comfy-headless), donde cada `class_type` se verifica con el catálogo ComfyUI en funcionamiento. Los mantenedores los actualizan con `npm run kb:sync`; `npm run kb:check` falla si la copia obtenida ha cambiado.

Una segunda copia mantenida manualmente de esa información cambiaría y, dentro de un gráfico de flujo de trabajo, este cambio pasaría desapercibido: el gráfico se ejecutaría sin errores y no devolvería nada.

## Modelos de video

`CodeComfy: Generate Video (HQ)` ejecuta **Wan 2.2 TI2V-5B**, derivado textualmente de la propia plantilla `video_wan2_2_5B_ti2v` de ComfyUI. Wan 2.2 es **Apache-2.0**: la salida generada se puede utilizar comercialmente.

Necesita tres archivos en su servidor ComfyUI:

| Archivo | Colóquelo en | Descargar |
|------|-----------|----------|
| `wan2.2_ti2v_5B_fp16.safetensors` | `models/diffusion_models/` | [Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors) |
| `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `models/text_encoders/` | [Comfy-Org/Wan_2.1_ComfyUI_repackaged](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors) |
| `wan2.2_vae.safetensors` | `models/vae/` | [Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors) |

> **Nota sobre las versiones anteriores a 1.2.0.** El ajuste preestablecido `hq-video` incluido en las versiones 1.0.0 y 1.1.0 no era un flujo de trabajo de video; era un gráfico de texto a imagen que generaba N fotogramas independientes a partir de una sola instrucción y los ensamblaba con FFmpeg. No se utilizó ningún modelo de movimiento, por lo que la salida parpadeaba en lugar de moverse. Ese fue nuestro error, no una limitación de ComfyUI, y la versión 1.2.0 lo reemplaza. Si tiene una copia guardada del antiguo ajuste preestablecido de video `.codecomfy/presets/`, ahora registrará una advertencia explicando el problema.

## Límites de generación

La generación de video aplica límites de seguridad para evitar el agotamiento accidental de recursos:

| Parámetro | Mín. | Máx. |
|-----------|-----|-----|
| Duración | 1 s | 15 s |
| FPS | 1   | 60   |
| Total de fotogramas (duración × fps) | — | 450 |

Si alcanza un límite, reduzca la duración o elija un ajuste preestablecido con una velocidad de fotogramas más baja.

Los recuentos de fotogramas para los modelos temporales se ajustan al siguiente valor legal `4n + 1` antes del envío (49, 53, 57, …); ComfyUI acepta recuentos fuera de la cuadrícula sin quejarse, pero el modelo no los gestiona, por lo que CodeComfy los ajusta en lugar de permitir que se utilicen.

## Solución de problemas

### `[Network]`: No se puede acceder al servidor ComfyUI

- ¿Está ejecutándose ComfyUI? Verifique `http://127.0.0.1:8188/system_stats` en un navegador.
- Si ComfyUI está en un puerto u host diferente, actualice `codecomfy.comfyuiUrl`.
- ¿Un firewall o proxy bloquea la conexión? Intente con `curl http://127.0.0.1:8188/system_stats`.

### `[Server]`: ComfyUI devolvió un error

- Verifique el terminal/consola de ComfyUI para ver los rastros de pila.
- Causa común: falta un punto de control del modelo o un nodo personalizado.
- Asegúrese de que su ComfyUI tenga los nodos requeridos por el flujo de trabajo preestablecido.

### `[API]`: Error en la forma de respuesta

- Es posible que su versión de ComfyUI sea demasiado antigua o demasiado nueva para los ajustes preestablecidos incluidos.
- Un proxy inverso o una CDN pueden estar alterando las respuestas JSON.
- Intente acceder directamente a `/prompt` y `/history` para inspeccionar la forma de respuesta.

### `[IO]`: Problemas de permisos de archivo o disco

- Asegúrese de que su carpeta de espacio de trabajo sea escribible.
- Verifique el espacio libre en disco; las descargas de fotogramas pueden ser grandes para los videos.
- En Windows, evite usar espacios de trabajo en unidades de red para obtener el mejor rendimiento.

### No se encontró FFmpeg

- Instale FFmpeg y asegúrese de que `ffmpeg.exe` esté en la variable PATH de su sistema.
- O establezca `codecomfy.ffmpegPath` a la ruta absoluta completa (por ejemplo, `C:\ffmpeg\bin\ffmpeg.exe`).
- Las rutas relativas y los nombres sin formato (que no sean `ffmpeg` resuelto por PATH) se rechazan por motivos de seguridad.

### "La generación ya está en curso"

Solo se puede ejecutar una generación a la vez.
Cancele la actual (`CodeComfy: Cancel Generation`) o espere a que termine.
Hay un período de espera de 2 segundos entre trabajos consecutivos.

### Validación de semilla/instrucción

- Las semillas deben ser números enteros entre 0 y 2,147,483,647.
- Las instrucciones no deben estar vacías y tener como máximo 8000 caracteres.

## Seguridad y alcance de los datos

- **Red:** se conecta solo a la URL de ComfyUI configurada por el usuario (predeterminada `127.0.0.1:8188`); no hay otras solicitudes salientes.
- **Archivos:** las salidas se guardan en `.codecomfy/outputs/` y `.codecomfy/runs/` en el espacio de trabajo; no se tocan archivos fuera del espacio de trabajo.
- **FFmpeg:** `shell: true` se eliminó de todos los procesos secundarios; la ruta debe ser absoluta, existente y ejecutable.
- No se recopilan ni envían datos de telemetría; consulte [SECURITY.md](SECURITY.md) para obtener la política completa.

## Limitaciones conocidas

| Área | Estado |
|------|--------|
| **Windows** | Totalmente probado (Windows 10/11). Plataforma principal. |
| **macOS** | Se espera que funcione para la generación de imágenes y videos. Es posible que NextGallery aún no esté disponible. |
| **Linux** | Se espera que funcione para la generación de imágenes y videos. Es posible que NextGallery aún no esté disponible. |
| **Remote / WSL** | La URL de ComfyUI debe ser accesible desde el host donde se ejecuta VS Code. |

La funcionalidad principal (instrucción → ComfyUI → descarga → ensamblaje con FFmpeg) es independiente de la plataforma. La única función específica de Windows es la detección automática de NextGallery, que vuelve a un mensaje que indica "establezca la ruta en la configuración" en otras plataformas.

Si encuentra un problema específico de la plataforma, abra un problema en [https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues) con su sistema operativo, versión de VS Code y versión de ComfyUI.

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

MIT: consulte [LICENSE](LICENSE) para obtener más detalles.

---

Creado por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
