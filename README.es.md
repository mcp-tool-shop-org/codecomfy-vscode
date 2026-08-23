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
| **VS Code** | Sí | `^1.85.0` o posterior. La extensión utiliza las API de cancelación estructurada y `InputBox` que se incluyeron en la versión 1.85; probado en las versiones 1.85.0 hasta la última estable. |
| **ComfyUI** | Sí | Ejecución local (`http://127.0.0.1:8188`) o en una máquina remota. CodeComfy se comunica con su API HTTP. |
| **FFmpeg**  | Opcional | Solo es necesario para los ajustes preestablecidos de ensamblaje de fotogramas heredados. El ajuste preestablecido de video incluido se codifica mediante el propio ComfyUI (`CreateVideo` → `SaveVideo`), por lo que FFmpeg **no** es obligatorio. [Descarga FFmpeg](https://ffmpeg.org/download.html). |
| **NextGallery** | Opcional | Visor de galería complementario. No es necesario para la generación en sí. |

## Instalación

### Desde el Marketplace de VS Code (recomendado)

1. Abre la barra lateral de **Extensiones** (`Ctrl+Shift+X`).
2. Busca **CodeComfy** o visita la página del
[Marketplace](https://marketplace.visualstudio.com/items?itemName=mcp-tool-shop.codecomfy-vscode).
3. Haz clic en **Instalar** y vuelve a cargar la ventana cuando se te solicite.

### Desde un archivo `.vsix` (alternativa)

Para versiones de desarrollo o instalaciones sin conexión:

1. Descarga el último archivo `.vsix` desde
[Releases](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases).
2. En VS Code: barra lateral de **Extensiones** → menú `···` → **Instalar desde VSIX…**
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
| `codecomfy.defaultNegativePrompt` | Indicación negativa predeterminada que se completa durante la generación | `""` |

## Guía rápida

1. **Inicia ComfyUI**: asegúrate de que esté en funcionamiento y accesible.
2. **Elige un comando**: abre la paleta de comandos (`Ctrl+Shift+P`) y selecciona:
- `CodeComfy: Generate Image (HQ)`: imagen única
- `CodeComfy: Generate Video (HQ)`: video corto (de 2 a 8 segundos)
3. **Introduce una indicación**, opcionalmente una **indicación negativa** (cosas que se deben evitar) y una **semilla**, y observa la barra de estado.

<!-- Screenshots: replace with real PNGs — see assets/SCREENSHOTS.md -->

La **barra de estado** muestra el progreso en tiempo real (en cola → generando → completado).

Los registros estructurados aparecen en el canal de salida de **CodeComfy**
(`Ctrl+Shift+U`, luego selecciona "CodeComfy").

Las salidas se guardan en `.codecomfy/outputs/` en la raíz de tu espacio de trabajo. Los metadatos de ejecución se encuentran en `.codecomfy/runs/`.

### Cancelar

Ejecuta `CodeComfy: Cancel Generation` desde la paleta de comandos o haz clic en el elemento de la barra de estado mientras una generación está en curso. Esto borra la cola pendiente **y** interrumpe el trabajo que se está ejecutando; por lo tanto, cancelar no simplemente inicia lo que tenías en la cola a continuación.

### Borrar la cola

`CodeComfy: Clear ComfyUI Queue` elimina todos los trabajos *pendientes* y deja intacto el trabajo que se está ejecutando.

Esta es la versión honesta de "pausa": ComfyUI tiene `/interrupt` (abortar, sin reanudar) y nada más; no hay pausa ni reanudación en un paso N. Detener más trabajos para que no se inicien es lo que realmente se puede hacer.

## Características

- **Seis perfiles**: imagen, video, audio, 3D, inferencia y metadatos PNG, con 27 flujos de trabajo de referencia verificados.
- **Preflight**: los nodos y modelos faltantes se identifican antes de enviar cualquier cosa, por lo que no se gasta tiempo de GPU en una ejecución que no puede tener éxito.
- **Progreso en vivo**: pasos de muestreo en tiempo real en la barra de estado (`Step 12 / 20`), transmitidos a través del WebSocket de ComfyUI. Vuelve automáticamente al sondeo.
- Ajustes preestablecidos integrados de imagen y video de alta calidad: el video se ejecuta en **Wan 2.2 TI2V-5B** (Apache-2.0, seguro para uso comercial) con **codificación del lado del servidor, sin FFmpeg**.
- **Ajustes preestablecidos de flujo de trabajo creados por el usuario** (NUEVO): coloca cualquier archivo JSON de flujo de trabajo de ComfyUI en `.codecomfy/presets/`.
- **Historial de ejecución en la barra de actividades** (NUEVO): explora y vuelve a ejecutar generaciones anteriores.
- Progreso en tiempo real en la barra de estado.
- **Notificaciones de finalización** (NUEVO, se puede desactivar): sabrás cuándo termina un video lento.
- Canal de salida estructurado para el diagnóstico.
- Compatible con múltiples plataformas (prioridad en Windows, se espera compatibilidad con macOS y Linux).

## Los seis perfiles

`CodeComfy: Run… (all profiles)` sigue el patrón **perfil → ajuste preestablecido → entradas**. Las entradas se derivan del propio gráfico del ajuste preestablecido elegido, por lo que un ajuste preestablecido de imagen a video solicita una imagen de origen y un ajuste preestablecido de texto a video no.

| Perfil | Qué hace | Ajustes preestablecidos |
|---------|--------------|---------|
| **Image** | Texto a imagen, edición de imágenes, unión ControlNet | Qwen txt2img, Qwen edit, ControlNet (Qwen / SDXL) |
| **Video** | Texto e imagen a video en modelos temporales reales | Hunyuan 1.5 i2v + 720p, Wan 14B, LTX, Mochi |
| **Audio** | Texto a música y separación de pistas | ACE-Step 1.5 (música / jingle / borrador / mp3), separación |
| **3D** | Imagen a malla, exportada como GLB | Hunyuan3D-2 (borrador / estándar / detalle) |
| **Inference** | Leyenda, etiqueta, detección, segmentación, OCR | Florence-2 (7 tareas) |
| **Metadata** | Lee el flujo de trabajo incrustado en un PNG | solo local, no se necesita servidor |

**Nada se envía hasta que pueda tener éxito.** Cada configuración preestablecida se verifica previamente en tu servidor: sus nodos se comprueban con `/object_info/{class}` y sus modelos con `/models/{folder}`. Un nodo faltante indica el paquete que lo proporciona, un modelo faltante indica el archivo y la carpeta a los que pertenece; y no se invierte tiempo de GPU en averiguarlo.

### De dónde provienen los flujos de trabajo

CodeComfy no crea gráficos de flujo de trabajo. Los 27 flujos de trabajo de referencia se obtienen de la base de conocimientos dentro del repositorio de [comfy-headless](https://github.com/mcp-tool-shop-org/comfy-headless), donde cada `class_type` se verifica con el catálogo ComfyUI en vivo. Los mantenedores los actualizan con `npm run kb:sync`; `npm run kb:check` falla si la copia obtenida ha cambiado.

Una segunda copia mantenida manualmente de esa información cambiaría y, dentro de un gráfico de flujo de trabajo, este cambio sería silencioso: el gráfico se ejecutaría sin errores y no devolvería nada.

## Modelos de video

`CodeComfy: Generate Video (HQ)` ejecuta **Wan 2.2 TI2V-5B**, derivado textualmente de la propia plantilla `video_wan2_2_5B_ti2v` de ComfyUI. Wan 2.2 es **Apache-2.0**: la salida generada es segura para uso comercial.

Necesita tres archivos en tu servidor ComfyUI:

| Archivo | Colócalo en | Descarga |
|------|-----------|----------|
| `wan2.2_ti2v_5B_fp16.safetensors` | `models/diffusion_models/` | [Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors) |
| `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `models/text_encoders/` | [Comfy-Org/Wan_2.1_ComfyUI_repackaged](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors) |
| `wan2.2_vae.safetensors` | `models/vae/` | [Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors) |

> **Nota sobre las versiones anteriores a 1.2.0.** La configuración preestablecida `hq-video` incluida en v1.0.0 hasta v1.1.0 **no era un flujo de trabajo de video**: era un gráfico de texto a imagen que generaba N fotogramas independientes a partir de una sola instrucción y los ensamblaba con FFmpeg. No se utilizó ningún modelo de movimiento, por lo que la salida parpadeaba en lugar de moverse. Ese fue nuestro defecto, no una limitación de ComfyUI, y v1.2.0 lo reemplaza. Si tienes una copia guardada `.codecomfy/presets/` del antiguo flujo de trabajo de video, ahora registrará una advertencia explicando el problema.

## Límites de generación

La generación de video aplica límites de seguridad para evitar el agotamiento accidental de recursos:

| Parámetro | Mín. | Máx. |
|-----------|-----|-----|
| Duración | 1 s | 15 s |
| FPS | 1   | 60   |
| Total de fotogramas (duración × fps) | — | 450 |

Si alcanzas un límite, reduce la duración o elige una configuración preestablecida con una velocidad de fotogramas más baja.

Los recuentos de fotogramas para los modelos temporales se ajustan al siguiente valor `4n + 1` válido (49, 53, 57, ...) antes del envío; ComfyUI acepta recuentos fuera de la cuadrícula sin quejarse, pero el modelo no los gestiona, por lo que CodeComfy los ajusta en lugar de permitir que el valor se utilice.

## Solución de problemas

### `[Network]`: No se puede acceder al servidor ComfyUI

- ¿Está ejecutándose ComfyUI? Verifica `http://127.0.0.1:8188/system_stats` en un navegador.
- Si ComfyUI está en un puerto u host diferente, actualiza `codecomfy.comfyuiUrl`.
- ¿Un firewall o proxy bloquea la conexión? Intenta con `curl http://127.0.0.1:8188/system_stats`.

### `[Server]`: ComfyUI devolvió un error

- Verifica el terminal/consola de ComfyUI para ver los rastreos de pila.
- Causa común: punto de control o nodo personalizado faltante.
- Asegúrate de que tu ComfyUI tenga los nodos requeridos por el flujo de trabajo preestablecido.

### `[API]`: Error en la forma de respuesta

- Es posible que tu versión de ComfyUI sea demasiado antigua o demasiado nueva para las configuraciones preestablecidas incluidas.
- Un proxy inverso o una CDN pueden estar alterando las respuestas JSON.
- Intenta acceder directamente a `/prompt` y `/history` para inspeccionar la forma de respuesta.

### `[IO]`: Problemas de permisos de archivo o disco

- Asegúrate de que tu carpeta de espacio de trabajo sea escribible.
- Verifica el espacio libre en disco; las descargas de fotogramas pueden ser grandes para videos.
- En Windows, evita los espacios de trabajo en unidades de red para obtener el mejor rendimiento.

### FFmpeg no encontrado

- Instala FFmpeg y asegúrate de que `ffmpeg.exe` esté en la variable PATH de tu sistema.
- O establece `codecomfy.ffmpegPath` a la **ruta absoluta completa** (por ejemplo, `C:\ffmpeg\bin\ffmpeg.exe`).
- Las rutas relativas y los nombres sin formato (que no sean `ffmpeg` resueltos por PATH) se rechazan por motivos de seguridad.

### "La generación ya está en curso"

Solo se puede ejecutar una generación a la vez.
Cancela la actual (`CodeComfy: Cancel Generation`) o espera a que termine.
Hay un período de enfriamiento de 2 segundos entre trabajos consecutivos.

### Validación de semilla/instrucción

- Las semillas deben ser números enteros entre 0 y 2,147,483,647.
- Las instrucciones no deben estar vacías y tener como máximo 8000 caracteres.

## Seguridad y alcance de los datos

- **Red:** se conecta solo a la URL de ComfyUI configurada por el usuario (predeterminada `127.0.0.1:8188`); no hay otras solicitudes salientes.
- **Archivos:** las salidas se guardan en `.codecomfy/outputs/` y `.codecomfy/runs/` en el espacio de trabajo; no se tocan archivos fuera del espacio de trabajo.
- **FFmpeg:** `shell: true` eliminado de todos los procesos secundarios; la ruta debe ser absoluta, existente y ejecutable.
- No se recopilan ni envían **datos de telemetría**: consulta [SECURITY.md](SECURITY.md) para obtener la política completa.

## Limitaciones conocidas

| Área | Estado |
|------|--------|
| **Windows** | Totalmente probado (Windows 10/11). Plataforma principal. |
| **macOS** | Se espera que funcione para la generación de imágenes y videos. Es posible que NextGallery aún no esté disponible. |
| **Linux** | Se espera que funcione para la generación de imágenes y videos. Es posible que NextGallery aún no esté disponible. |
| **Remote / WSL** | La URL de ComfyUI debe ser accesible desde el host donde se ejecuta VS Code. |

La funcionalidad principal (instrucción → ComfyUI → descarga → ensamblaje con FFmpeg) es independiente de la plataforma. La única característica específica de Windows es la detección automática de NextGallery, que vuelve a un mensaje que solicita "establecer la ruta en la configuración" en otras plataformas.

Si encuentras un problema específico de la plataforma, abre un [problema](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues) con tu sistema operativo, versión de VS Code y versión de ComfyUI.

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

MIT: consulta [LICENSE](LICENSE) para obtener más detalles.

---

Creado por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
