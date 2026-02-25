<p align="center">
  <img src="assets/icon.png" alt="CodeComfy icon" width="96" />
</p>

# CodeComfy: Generación de imágenes con ComfyUI desde VS Code

[![CI](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml)

*Relájese, escriba una instrucción y deje que el sistema haga el trabajo.*

Cree imágenes y videos con ComfyUI sin salir de su editor.
Seleccione una configuración predefinida, escriba una descripción y observe la barra de estado mientras CodeComfy se encarga del envío del flujo de trabajo, la verificación del estado, la descarga de los fotogramas y la compilación de FFmpeg.

**Diseñado principalmente para Windows, pero compatible con múltiples plataformas.** Completamente probado en Windows 10/11.
Se espera que funcione en macOS y Linux, pero consulte [Limitaciones conocidas](#known-limitations).
Se aceptan contribuciones.

---

## Requisitos previos

| Dependencia. | Requerido. | Notes |
| Sure, here is the translation:

**English:**

You are a professional English (en) to Spanish (es) translator. Your goal is to accurately convey the meaning and nuances of the original English text while adhering to Spanish grammar, vocabulary, and cultural sensitivities.
Produce only the Spanish translation, without any additional explanations or commentary. Please translate the following English text into Spanish:

------------

**Spanish:**

Eres un traductor profesional de inglés (en) a español (es). Tu objetivo es transmitir con precisión el significado y los matices del texto original en inglés, respetando la gramática, el vocabulario y las sensibilidades culturales del español.
Por favor, proporciona únicamente la traducción al español, sin explicaciones ni comentarios adicionales. Traduce el siguiente texto en inglés al español:

------------ | Please provide the English text you would like me to translate. I am ready to translate it into Spanish. | Please provide the English text you would like me to translate. I am ready to translate it into Spanish. |
| **ComfyUI** | Yes | Se puede ejecutar localmente (en `http://127.0.0.1:8188`) o en una máquina remota. CodeComfy se comunica a través de su API HTTP. |
| **FFmpeg**  | Para video. | Debe estar en la ruta de acceso de su sistema *o* configurado a través de `codecomfy.ffmpegPath`. [Descargue FFmpeg](https://ffmpeg.org/download.html). |
| **NextGallery** | Opcional. | Visor de galería complementario. No es necesario para la generación en sí. |

## Instalación

CodeComfy aún no está disponible en el Marketplace de VS Code.
Para instalarlo, utilice un archivo `.vsix`:

1. Descargue el archivo `.vsix` más reciente desde la sección de [Lanzamientos](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases).
2. En VS Code: barra lateral de **Extensiones** → menú `···` → **Instalar desde VSIX…**
3. Recargue la ventana cuando se le solicite.

### Configuración

Abra **Configuración → Extensiones → CodeComfy** o añada lo siguiente a `settings.json`:

```json
{
  "codecomfy.comfyuiUrl": "http://127.0.0.1:8188",
  "codecomfy.ffmpegPath": "",
  "codecomfy.autoOpenGalleryOnComplete": true,
  "codecomfy.nextGalleryPath": "",
  "codecomfy.defaultNegativePrompt": ""
}
```

| Escenario. | Descripción. | Predeterminado. |
| Please provide the English text you would like me to translate. I am ready to translate it into Spanish. | Please provide the English text you would like me to translate. I am ready to translate it into Spanish. | Please provide the English text you would like me to translate. I am ready to translate it into Spanish. |
| `codecomfy.comfyuiUrl` | URL del servidor de ComfyUI. | `http://127.0.0.1:8188` |
| `codecomfy.ffmpegPath` | Ruta absoluta al ejecutable de FFmpeg (dejar en blanco para que se busque en la variable PATH). | `""` |
| `codecomfy.autoOpenGalleryOnComplete` | Abrir NextGallery una vez que finalice el proceso de generación. | `true` |
| `codecomfy.nextGalleryPath` | Ruta absoluta al archivo NextGallery.exe. | Detección automática. |
| `codecomfy.defaultNegativePrompt` | El indicador negativo predeterminado se completa automáticamente durante la generación. | `""` |

## Guía de inicio rápido

1. **Inicie ComfyUI:** asegúrese de que se está ejecutando y que es accesible.
2. **Seleccione un comando:** abra la paleta de comandos (`Ctrl+Shift+P`) y elija:
- `CodeComfy: Generar imagen (alta calidad)` — genera una sola imagen.
- `CodeComfy: Generar video (alta calidad)` — genera un video corto (de 2 a 8 segundos).
3. **Introduzca una descripción**, opcionalmente una **descripción negativa** (elementos a evitar), y una **semilla**, y luego observe la barra de estado.

<!-- Capturas de pantalla: reemplazar con imágenes PNG reales. Ver el archivo assets/SCREENSHOTS.md -->

La **barra de estado** muestra el progreso en tiempo real (en cola → generando → completado).

Los registros estructurados aparecen en el canal de salida de **CodeComfy** (presione `Ctrl+Shift+U` y luego seleccione "CodeComfy").

Los resultados se guardan en la carpeta `.codecomfy/outputs/`, ubicada en la raíz de su espacio de trabajo.
La información sobre las ejecuciones se almacena en la carpeta `.codecomfy/runs/`.

### Cancelar

Ejecute el comando "CodeComfy: Cancelar generación" desde la paleta de comandos o haga clic en el elemento de la barra de estado mientras se está realizando una generación.

## Límites de generación

La generación de video aplica límites de seguridad para evitar el agotamiento accidental de los recursos:

| Parámetro. | Min | Max |
| Por favor, proporciona el texto que deseas que traduzca. |-----|-----|
| Duración. | 1 s | 15 s |
| FPS       | 1   | 60   |
| Número total de fotogramas (duración × fotogramas por segundo). | — | 450 |

Si alcanza un límite, reduzca la duración o elija una configuración predefinida con una velocidad de fotogramas más baja.

## Solución de problemas

### `[Red]` — No se puede conectar al servidor de ComfyUI

- ¿Está ComfyUI en ejecución? Verifique la dirección `http://127.0.0.1:8188/system_stats` en un navegador.
- Si ComfyUI se está ejecutando en un puerto o host diferente, actualice la variable `codecomfy.comfyuiUrl`.
- ¿Un firewall o un servidor proxy están bloqueando la conexión? Intente ejecutar el comando `curl http://127.0.0.1:8188/system_stats`.

### `[Servidor]` — ComfyUI devolvió un error

- Verifique la terminal o consola de ComfyUI para buscar rastros de errores.
- Causa común: falta de un archivo de modelo o de un nodo personalizado.
- Asegúrese de que su instalación de ComfyUI tenga los nodos necesarios para el flujo de trabajo predefinido.

### `[API]` — Error en la estructura de la respuesta

- Es posible que su versión de ComfyUI sea demasiado antigua o demasiado reciente para los ajustes predefinidos incluidos.
- Un servidor proxy inverso o una CDN podrían estar alterando las respuestas en formato JSON.
- Intente acceder directamente a las rutas `/prompt` y `/history` para examinar la estructura de la respuesta.

### `[IO]` — Problemas de permisos de archivo o de disco

- Asegúrese de que la carpeta de su espacio de trabajo tenga permisos de escritura.
- Verifique el espacio disponible en el disco, ya que las descargas de archivos de video pueden ser muy grandes.
- En Windows, evite utilizar espacios de trabajo en unidades de red para obtener el mejor rendimiento.

### FFmpeg no encontrado

- Instale FFmpeg y asegúrese de que `ffmpeg.exe` esté en la ruta de acceso (PATH) de su sistema.
- O bien, configure la variable `codecomfy.ffmpegPath` con la **ruta absoluta completa** (por ejemplo, `C:\ffmpeg\bin\ffmpeg.exe`).
- Las rutas relativas y los nombres sin especificar (excepto el `ffmpeg` que se encuentra en la ruta de acceso) no son aceptados por motivos de seguridad.

### "La generación ya está en marcha."

Solo una generación puede ejecutarse a la vez.
Cancela la generación actual ("CodeComfy: Cancelar Generación") o espera a que finalice.
Existe un período de enfriamiento de 2 segundos entre tareas consecutivas.

### Validación de la semilla/instrucción inicial

- Los valores de "seed" deben ser números enteros entre 0 y 2.147.483.647.
- Las indicaciones (prompts) no pueden estar vacías y deben tener como máximo 8.000 caracteres.

## Limitaciones conocidas

| Area | Estado. |
| Por favor, proporciona el texto que deseas que traduzca. | Please provide the English text you would like me to translate. I am ready to translate it into Spanish. |
| **Windows** | Completamente probado (en Windows 10/11). Plataforma principal. |
| macOS. | Se espera que esta función se utilice para la generación de imágenes y videos. Es posible que NextGallery aún no esté disponible. |
| **Linux** | Se espera que esta herramienta se utilice para la generación de imágenes y videos. Es posible que NextGallery aún no esté disponible. |
| **Remote / WSL** | La dirección URL de ComfyUI debe ser accesible desde el equipo que ejecuta Visual Studio Code. |

La funcionalidad principal (prompt → ComfyUI → descarga → ensamblaje de FFmpeg) es independiente de la plataforma. La única característica específica de Windows es la detección automática de NextGallery, que en otras plataformas recurre a un mensaje que indica al usuario que "configure la ruta en la configuración".

Si encuentra un problema específico de una plataforma, por favor,
[registre un problema](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues)
indicando su sistema operativo, la versión de VS Code y la versión de ComfyUI.

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

MIT.
