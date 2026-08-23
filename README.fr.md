<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/codecomfy-vscode/readme.png" alt="CodeComfy VSCode" width="400" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://mcp-tool-shop-org.github.io/codecomfy-vscode/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page" /></a>
</p>

*Six profils. Flux de travail vérifiés. Pas de canevas.*

Pilotez ComfyUI depuis votre éditeur : images, vidéos, audio, maillages 3D et
analyse d’images. Sélectionnez un profil, répondez aux questions qu’il pose, et observez
la barre d’état pendant que CodeComfy gère la soumission, le suivi, le téléchargement et
l’assemblage. Chaque flux de travail fourni est vérifié par rapport au catalogue ComfyUI en ligne,
et les nœuds ou modèles manquants sont identifiés avant toute soumission.

> **Priorité à Windows, compatible multiplateforme.** Entièrement testé sur Windows 10/11.
> macOS et Linux devraient fonctionner — voir [Limitations connues](#known-limitations).
> Les contributions sont les bienvenues.

---

## Prérequis

| Dépendance | Requis | Notes |
|------------|----------|-------|
| **VS Code** | Oui | `^1.85.0` ou version ultérieure. L’extension utilise les API `InputBox` et d’annulation structurée fournies avec la version 1.85 ; testé sur les versions 1.85.0 jusqu’à la dernière version stable. |
| **ComfyUI** | Oui | Exécution en local (`http://127.0.0.1:8188`) ou sur une machine distante. CodeComfy communique avec son API HTTP. |
| **FFmpeg**  | Facultatif | Uniquement nécessaire pour les anciens paramètres d’assemblage de trames. Le paramètre vidéo fourni est encodé par ComfyUI lui-même (`CreateVideo` → `SaveVideo`), donc FFmpeg n’est **pas** requis. [Télécharger FFmpeg](https://ffmpeg.org/download.html). |
| **NextGallery** | Facultatif | Visionneuse de galerie compagnon. Pas nécessaire pour la génération elle-même. |

## Installation

### Depuis le VS Code Marketplace (recommandé)

1. Ouvrez la barre latérale **Extensions** (`Ctrl+Shift+X`).
2. Recherchez **CodeComfy** ou visitez la
[page du Marketplace](https://marketplace.visualstudio.com/items?itemName=mcp-tool-shop.codecomfy-vscode).
3. Cliquez sur **Installer** et rechargez la fenêtre lorsque vous y êtes invité.

### Depuis un fichier `.vsix` (alternative)

Pour les versions de développement ou les installations hors ligne :

1. Téléchargez la dernière version `.vsix` depuis
[Releases](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases).
2. Dans VS Code : barre latérale **Extensions** → menu `···` → **Installer à partir de VSIX…**
3. Rechargez la fenêtre lorsque vous y êtes invité.

### Paramètres

Ouvrez **Paramètres → Extensions → CodeComfy** ou ajoutez-les à `settings.json` :

```json
{
  "codecomfy.comfyuiUrl": "http://127.0.0.1:8188",
  "codecomfy.ffmpegPath": "",
  "codecomfy.autoOpenGalleryOnComplete": true,
  "codecomfy.nextGalleryPath": "",
  "codecomfy.defaultNegativePrompt": ""
}
```

| Paramètre | Description | Valeur par défaut |
|---------|-------------|---------|
| `codecomfy.comfyuiUrl` | URL du serveur ComfyUI | `http://127.0.0.1:8188` |
| `codecomfy.ffmpegPath` | Chemin absolu vers l’exécutable FFmpeg (laissez vide pour la recherche dans PATH) | `""` |
| `codecomfy.autoOpenGalleryOnComplete` | Ouvrir NextGallery une fois la génération terminée | `true` |
| `codecomfy.nextGalleryPath` | Chemin absolu vers NextGallery.exe | Détection automatique |
| `codecomfy.defaultNegativePrompt` | Invite négative par défaut préremplie pendant la génération | `""` |

## Démarrage rapide

1. **Démarrez ComfyUI** — assurez-vous qu’il est en cours d’exécution et accessible.
2. **Sélectionnez une commande** — ouvrez la palette de commandes (`Ctrl+Shift+P`) et choisissez :
- `CodeComfy: Generate Image (HQ)` — image unique
- `CodeComfy: Generate Video (HQ)` — courte vidéo (2 à 8 secondes)
3. **Entrez une invite**, éventuellement une **invite négative** (éléments à éviter) et une **graine**, puis observez la barre d’état.

<!-- Screenshots: replace with real PNGs — see assets/SCREENSHOTS.md -->

La **barre d’état** affiche l’avancement en temps réel (en attente → génération → terminé).

Les journaux structurés apparaissent dans le canal de sortie **CodeComfy**
(`Ctrl+Shift+U`, puis sélectionnez « CodeComfy »).

Les résultats sont enregistrés dans `.codecomfy/outputs/` dans le répertoire racine de votre espace de travail.
Les métadonnées d’exécution se trouvent dans `.codecomfy/runs/`.

### Annuler

Exécutez `CodeComfy: Cancel Generation` à partir de la palette de commandes ou cliquez sur l’élément de la barre d’état pendant qu’une génération est en cours. Cela efface la file d’attente et interrompt le travail en cours, de sorte que l’annulation ne se contente pas de lancer le prochain élément de la file d’attente.

### Effacer la file d’attente

`CodeComfy: Clear ComfyUI Queue` annule tous les travaux *en attente* et laisse le travail en cours intact.

Il s’agit de la version honnête de « pause » : ComfyUI principal possède `/interrupt` (annulation, sans reprise) et rien d’autre ; il n’y a pas de fonction de pause ni de reprise à l’étape N. L’action qui consiste à empêcher le démarrage de nouveaux travaux est celle qui peut réellement être effectuée.

## Fonctionnalités

- **Six profils** : image, vidéo, audio, 3D, inférence et métadonnées PNG, avec 27 flux de travail de référence vérifiés.
- **Préparation** : les nœuds et modèles manquants sont identifiés avant que quoi que ce soit ne soit soumis, afin qu’aucun temps GPU ne soit gaspillé sur une exécution qui ne peut pas aboutir.
- **Suivi en direct** : étapes d’échantillonnage réelles dans la barre d’état (`Step 12 / 20`), transmises via le WebSocket de ComfyUI. En cas de problème, il revient automatiquement à un mode de sondage.
- Préréglages intégrés pour images et vidéos de haute qualité : les vidéos sont exécutées sur **Wan 2.2 TI2V-5B** (Apache-2.0, sans danger pour une utilisation commerciale) avec **encodage côté serveur, pas de FFmpeg**.
- **Préréglages de flux de travail créés par l’utilisateur** (NOUVEAU) : déposez n’importe quel fichier JSON de flux de travail ComfyUI dans `.codecomfy/presets/`.
- **Historique des exécutions dans la barre d’activité** (NOUVEAU) : parcourez et relancez les générations précédentes.
- Suivi en temps réel dans la barre d’état.
- **Notifications de fin** (NOUVEAU, possibilité de désactivation) : soyez informé lorsque l’exécution d’une vidéo lente est terminée.
- Canal de sortie structuré pour le diagnostic.
- Multiplateforme (priorité à Windows, macOS et Linux prévus).

## Les six profils

`CodeComfy: Run… (all profiles)` suit le schéma **profil → paramètre → entrées**. Les entrées sont dérivées du graphique du paramètre sélectionné. Ainsi, un paramètre de conversion d’image en vidéo demande une image source et un paramètre de conversion de texte en vidéo n’en demande pas.

| Profil | Ce qu’il fait | Paramètres |
|---------|--------------|---------|
| **Image** | Conversion de texte en image, retouche d’image, union ControlNet | Qwen txt2img, Qwen edit, ControlNet (Qwen / SDXL) |
| **Video** | Conversion de texte et d’images en vidéo sur des modèles temporels réels | Hunyuan 1.5 i2v + 720p, Wan 14B, LTX, Mochi |
| **Audio** | Conversion de texte en musique et séparation de pistes | ACE-Step 1.5 (musique / jingle / brouillon / mp3), séparation |
| **3D** | Conversion d’image en maillage, exporté au format GLB | Hunyuan3D-2 (brouillon / standard / détail) |
| **Inference** | Légende, étiquette, détection, segmentation, OCR | Florence-2 (7 tâches) |
| **Metadata** | Lecture du flux de travail intégré dans un fichier PNG | utilisation locale uniquement, aucun serveur n’est requis |

**Rien n’est soumis tant que cela ne peut pas réussir.** Chaque paramètre est préparé en amont par rapport à votre serveur : ses nœuds sont vérifiés avec `/object_info/{class}` et ses modèles avec `/models/{folder}`. Un nœud manquant indique le paquet qui le fournit, un modèle manquant indique le fichier et le dossier auquel il appartient, et aucun temps GPU n’est gaspillé pour le trouver.

### D’où proviennent les flux de travail

CodeComfy ne crée pas de graphiques de flux de travail. Les 27 flux de travail de référence sont importés depuis la base de connaissances du dépôt [comfy-headless](https://github.com/mcp-tool-shop-org/comfy-headless), où chaque élément `class_type` est vérifié par rapport au catalogue ComfyUI en direct. Les responsables les mettent à jour avec `npm run kb:sync` ; `npm run kb:check` échoue si la copie importée a divergé.

Une deuxième copie maintenue manuellement de cette base de connaissances divergerait, et une divergence dans un graphique de flux de travail est silencieuse : le graphique s'exécute sans erreur et ne renvoie rien.

## Modèles vidéo

`CodeComfy: Generate Video (HQ)` exécute **Wan 2.2 TI2V-5B**, dérivé littéralement du modèle `video_wan2_2_5B_ti2v` de ComfyUI. Wan 2.2 est sous licence **Apache-2.0** ; les résultats générés sont utilisables à des fins commerciales.

Il nécessite trois fichiers sur votre serveur ComfyUI :

| Fichier | Emplacement | Télécharger |
|------|-----------|----------|
| `wan2.2_ti2v_5B_fp16.safetensors` | `models/diffusion_models/` | [Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors) |
| `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `models/text_encoders/` | [Comfy-Org/Wan_2.1_ComfyUI_repackaged](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors) |
| `wan2.2_vae.safetensors` | `models/vae/` | [Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors) |

> **Remarque concernant les versions antérieures à 1.2.0.** Le préréglage `hq-video` inclus dans les versions 1.0.0 et 1.1.0 n’était **pas un flux de travail vidéo** ; il s’agissait d’un graphique texte-vers-image qui générait N images indépendantes à partir d’une seule invite et les assemblait avec FFmpeg. Aucun modèle de mouvement n’était impliqué, de sorte que la sortie clignotait au lieu de bouger. C’était notre défaut, pas une limitation de ComfyUI, et la version 1.2.0 le remplace. Si vous avez une copie enregistrée du préréglage vidéo ancien `.codecomfy/presets/`, un avertissement expliquant le problème sera maintenant enregistré.

## Limites de génération

La génération vidéo applique des limites de sécurité pour éviter l’épuisement accidentel des ressources :

| Paramètre | Min | Max |
|-----------|-----|-----|
| Durée | 1 s | 15 s |
| FPS | 1   | 60   |
| Nombre total d’images (durée × fps) | — | 450 |

Si vous atteignez une limite, réduisez la durée ou choisissez un préréglage avec un nombre de trames par seconde inférieur.

Les nombres de trames pour les modèles temporels sont arrondis au prochain multiple `4n + 1` valide (49, 53, 57, …) avant l’envoi ; ComfyUI accepte les nombres non alignés sans se plaindre, mais le modèle ne les gère pas. CodeComfy effectue donc un arrondi plutôt que de laisser la valeur passer.

## Dépannage

### `[Network]` — Impossible d’atteindre le serveur ComfyUI

- ComfyUI est-il en cours d’exécution ? Vérifiez `http://127.0.0.1:8188/system_stats` dans un navigateur.
- Si ComfyUI se trouve sur un port ou un hôte différent, mettez à jour `codecomfy.comfyuiUrl`.
- Un pare-feu ou un proxy bloque-t-il la connexion ? Essayez `curl http://127.0.0.1:8188/system_stats`.

### `[Server]` — ComfyUI a renvoyé une erreur

- Vérifiez le terminal/la console de ComfyUI pour les traces de pile.
- Cause fréquente : modèle ou nœud personnalisé manquant.
- Assurez-vous que votre installation de ComfyUI dispose des nœuds requis par le flux de travail du préréglage.

### `[API]` — Erreur de forme de réponse

- Votre version de ComfyUI peut être trop ancienne ou trop récente pour les préréglages inclus.
- Un proxy inverse ou un CDN peut altérer les réponses JSON.
- Essayez d’accéder directement à `/prompt` et `/history` pour inspecter la forme de la réponse.

### `[IO]` — Problèmes d’autorisations de fichiers ou de disque

- Assurez-vous que votre dossier d’espace de travail est accessible en écriture.
- Vérifiez l’espace disque disponible : les téléchargements d’images peuvent être importants pour la vidéo.
- Sous Windows, évitez d’utiliser des espaces de travail sur des lecteurs réseau pour obtenir les meilleures performances.

### FFmpeg introuvable

- Installez FFmpeg et assurez-vous que `ffmpeg.exe` se trouve dans le PATH de votre système.
- Ou définissez `codecomfy.ffmpegPath` sur le **chemin absolu complet** (par exemple, `C:\ffmpeg\bin\ffmpeg.exe`).
- Les chemins relatifs et les noms simples (autres que `ffmpeg` résolu par le PATH) sont rejetés pour des raisons de sécurité.

### « La génération est déjà en cours »

Une seule génération peut être exécutée à la fois. Annulez la génération actuelle (`CodeComfy: Cancel Generation`) ou attendez qu’elle se termine. Il existe un délai de 2 secondes entre les travaux consécutifs.

### Validation de la graine/de l’invite

- Les graines doivent être des nombres entiers compris entre 0 et 2 147 483 647.
- Les invites doivent être non vides et comporter au maximum 8 000 caractères.

## Sécurité et portée des données

- **Réseau :** se connecte uniquement à l’URL ComfyUI configurée par l’utilisateur (par défaut `127.0.0.1:8188`) ; aucune autre requête sortante
- **Fichiers :** les fichiers enregistrés sont stockés dans `.codecomfy/outputs/` et `.codecomfy/runs/` dans l’espace de travail ; aucun fichier en dehors de l’espace de travail n’est modifié
- **FFmpeg :** `shell: true` supprimé de tous les processus ; le chemin doit être absolu, existant et exécutable
- **Aucune télémétrie** n’est collectée ou envoyée ; consultez [SECURITY.md](SECURITY.md) pour connaître l’intégralité de la politique

## Limitations connues

| Domaine | État |
|------|--------|
| **Windows** | Entièrement testé (Windows 10/11). Plateforme principale. |
| **macOS** | Devrait fonctionner pour la génération d’images et de vidéos. NextGallery peut ne pas être encore disponible. |
| **Linux** | Devrait fonctionner pour la génération d’images et de vidéos. NextGallery peut ne pas être encore disponible. |
| **Remote / WSL** | L’URL ComfyUI doit être accessible à partir de l’hôte exécutant VS Code. |

La fonctionnalité principale (invite → ComfyUI → téléchargement → assemblage FFmpeg) est indépendante de la plateforme. La seule fonctionnalité spécifique à Windows est la détection automatique de NextGallery, qui revient gracieusement à une invite « définir le chemin dans les paramètres » sur d’autres plateformes.

Si vous rencontrez un problème spécifique à une plateforme, veuillez [ouvrir un ticket](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues) avec votre système d’exploitation, la version de VS Code et la version de ComfyUI.

## Comment ça marche

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

## Licence

MIT — consultez [LICENSE](LICENSE) pour plus de détails.

---

Créé par [MCP Tool Shop](https://mcp-tool-shop.github.io/)
