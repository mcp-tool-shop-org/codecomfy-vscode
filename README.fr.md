<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/codecomfy-vscode/readme.png" alt="CodeComfy VSCode" width="400" />
</p>

[![CI](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml) [![Landing Page](https://img.shields.io/badge/Landing_Page-live-blue)](https://mcp-tool-shop-org.github.io/codecomfy-vscode/)

*Installez-vous confortablement, tapez une requête, et laissez CodeComfy faire le travail.*

Générez des images et des vidéos avec ComfyUI sans quitter votre éditeur.
Sélectionnez un préréglage, tapez une requête, et surveillez la barre d'état pendant que CodeComfy
gère la soumission du flux de travail, la vérification de l'état, le téléchargement des images et l'assemblage FFmpeg.

> **Priorité à Windows, compatible avec de nombreuses plateformes.** Testé de manière approfondie sur Windows 10/11.
> macOS et Linux devraient fonctionner — voir les [Limitations connues](#known-limitations).
> Les contributions sont les bienvenues.

---

## Prérequis

| Dépendances | Nécessaire | Notes |
|------------|----------|-------|
| **ComfyUI** | Oui | Fonctionne localement (`http://127.0.0.1:8188`) ou sur une machine distante. CodeComfy communique via son API HTTP. |
| **FFmpeg**  | Pour les vidéos | Doit être présent dans votre variable d'environnement PATH *ou* configuré via `codecomfy.ffmpegPath`. [Téléchargez FFmpeg](https://ffmpeg.org/download.html). |
| **NextGallery** | Optionnel | Lecteur de galerie complémentaire. Non requis pour la génération elle-même. |

## Installation

CodeComfy n'est pas encore disponible sur le Marketplace de VS Code.
Installez à partir d'un fichier `.vsix` :

1. Téléchargez le fichier `.vsix` le plus récent depuis
[Releases](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases).
2. Dans VS Code : barre latérale **Extensions** → menu `···` → **Installer depuis VSIX…**
3. Rechargez la fenêtre lorsque vous y êtes invité.

### Paramètres

Ouvrez **Paramètres → Extensions → CodeComfy** ou ajoutez les paramètres à `settings.json` :

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
| `codecomfy.ffmpegPath` | Chemin absolu vers l'exécutable FFmpeg (laissez vide pour la recherche dans le PATH) | `""` |
| `codecomfy.autoOpenGalleryOnComplete` | Ouvrir NextGallery après la fin de la génération | `true` |
| `codecomfy.nextGalleryPath` | Chemin absolu vers NextGallery.exe | Détection automatique |
| `codecomfy.defaultNegativePrompt` | Invite négative par défaut pré-remplie pendant la génération | `""` |

## Démarrage rapide

1. **Démarrez ComfyUI** — assurez-vous qu'il est en cours d'exécution et accessible.
2. **Choisissez une commande** — ouvrez la palette de commandes (`Ctrl+Shift+P`) et choisissez :
- `CodeComfy: Generate Image (HQ)` — image unique
- `CodeComfy: Generate Video (HQ)` — courte vidéo (2–8 s)
3. **Entrez une requête**, éventuellement une **requête négative** (éléments à éviter), et une **seed**, puis surveillez la barre d'état.

<!-- Screenshots: replace with real PNGs — see assets/SCREENSHOTS.md -->

La **barre d'état** affiche la progression en temps réel (en attente → en cours de génération → terminé).

Les journaux structurés apparaissent dans le canal de sortie **CodeComfy**
(`Ctrl+Shift+U`, puis sélectionnez "CodeComfy").

Les résultats sont enregistrés dans le dossier `.codecomfy/outputs/` à la racine de votre espace de travail.
Les métadonnées des exécutions se trouvent dans le dossier `.codecomfy/runs/`.

### Annuler

Exécutez `CodeComfy: Cancel Generation` depuis la palette de commandes ou cliquez sur
l'élément de la barre d'état pendant qu'une génération est en cours.

## Limites de génération

La génération de vidéos impose des limites de sécurité pour éviter un épuisement accidentel des ressources :

| Paramètre | Minimum | Maximum |
|-----------|-----|-----|
| Durée | 1 s | 15 s |
| FPS | 1   | 60   |
| Nombre total d'images (durée × fps) | — | 450 |

Si vous atteignez une limite, réduisez la durée ou choisissez un préréglage avec un taux d'images inférieur.

## Dépannage

### `[Réseau]` — Impossible de contacter le serveur ComfyUI

- ComfyUI est-il en cours d'exécution ? Vérifiez `http://127.0.0.1:8188/system_stats` dans un navigateur.
- Si ComfyUI est sur un port ou un hôte différent, mettez à jour `codecomfy.comfyuiUrl`.
- Un pare-feu ou un proxy bloque-t-il la connexion ? Essayez `curl http://127.0.0.1:8188/system_stats`.

### `[Serveur]` — ComfyUI a renvoyé une erreur

- Vérifiez le terminal/la console de ComfyUI pour les traces de pile.
- Cause fréquente : modèle de checkpoint manquant ou nœud personnalisé.
- Assurez-vous que votre ComfyUI possède les nœuds requis par le flux de travail prédéfini.

### `[API]` — Erreur de format de réponse

- Votre version de ComfyUI peut être trop ancienne ou trop récente pour les modèles prédéfinis inclus.
- Un proxy inverse ou un CDN peut corrompre les réponses JSON.
- Essayez d'accéder directement à `/prompt` et `/history` pour examiner le format de la réponse.

### `[E/S]` — Problèmes de permissions de fichier ou de disque

- Assurez-vous que le dossier de votre espace de travail est accessible en écriture.
- Vérifiez l'espace disque disponible : les téléchargements de frames peuvent être importants pour les vidéos.
- Sous Windows, évitez d'utiliser des espaces de travail sur des lecteurs réseau pour de meilleures performances.

### FFmpeg introuvable

- Installez FFmpeg et assurez-vous que `ffmpeg.exe` se trouve dans le chemin d'accès de votre système.
- Ou définissez `codecomfy.ffmpegPath` sur le **chemin d'accès absolu complet** (par exemple, `C:\ffmpeg\bin\ffmpeg.exe`).
- Les chemins d'accès relatifs et les noms de fichiers simples (autres que `ffmpeg` résolu par le chemin d'accès) sont rejetés pour des raisons de sécurité.

### "Génération déjà en cours"

Une seule génération peut être en cours à la fois.
Annulez la génération actuelle (`CodeComfy : Annuler la génération`) ou attendez qu'elle se termine.
Il y a un délai de 2 secondes entre les tâches consécutives.

### Validation de la graine / du prompt

- Les graines doivent être des nombres entiers compris entre 0 et 2 147 483 647.
- Les prompts doivent être non vides et ne doivent pas dépasser 8 000 caractères.

## Sécurité et portée des données

- **Réseau :** se connecte uniquement à l'URL ComfyUI configurée par l'utilisateur (par défaut `127.0.0.1:8188`) — aucune autre requête sortante.
- **Fichiers :** les sorties sont enregistrées dans les dossiers `.codecomfy/outputs/` et `.codecomfy/runs/` de l'espace de travail — aucun fichier en dehors de l'espace de travail n'est modifié.
- **FFmpeg :** l'option `shell: true` a été supprimée de toutes les exécutions ; le chemin d'accès doit être absolu, existant et exécutable.
- **Aucune télémétrie** n'est collectée ou envoyée — consultez [SECURITY.md](SECURITY.md) pour connaître la politique complète.

## Limitations connues

| Domaine. | Statut. |
|------|--------|
| **Windows** | Entièrement testé (Windows 10/11). Plateforme principale. |
| **macOS** | Fonctionne comme prévu pour la génération d'images et de vidéos. NextGallery peut ne pas être disponible. |
| **Linux** | Fonctionne comme prévu pour la génération d'images et de vidéos. NextGallery peut ne pas être disponible. |
| **Remote / WSL** | L'URL ComfyUI doit être accessible depuis l'hôte exécutant VS Code. |

La fonctionnalité de base (prompt → ComfyUI → téléchargement → assemblage FFmpeg) est
indépendante de la plateforme. La seule fonctionnalité spécifique à Windows est la
détection automatique de NextGallery, qui, dans les autres environnements,
affiche un message invitant à "définir le chemin d'accès dans les
paramètres".

Si vous rencontrez un problème spécifique à une plateforme, veuillez
[ouvrir un problème](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues)
en indiquant votre système d'exploitation, votre version de VS Code et votre version de ComfyUI.

## Fonctionnement

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
