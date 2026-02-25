<p align="center">
  <img src="assets/icon.png" alt="CodeComfy icon" width="96" />
</p>

# CodeComfy : Génération d'images avec ComfyUI, directement depuis VS Code

[![CI](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/codecomfy-vscode/actions/workflows/ci.yml)

*Installez-vous confortablement, tapez une requête, et laissez le système effectuer le travail.*

Générez des images et des vidéos avec ComfyUI sans quitter votre éditeur.
Choisissez un modèle prédéfini, saisissez une instruction, et suivez la barre de progression pendant que CodeComfy gère la soumission du flux de travail, les requêtes, le téléchargement des images et l'assemblage avec FFmpeg.

**Conçu en priorité pour Windows, mais compatible avec d'autres plateformes.** Testé en profondeur sur Windows 10/11.
Il est prévu que macOS et Linux fonctionnent correctement, mais veuillez consulter [les limitations connues](#known-limitations).
Les contributions sont les bienvenues.

---

## Prérequis

| Dépendance. | Obligatoire. | Notes |
| Veuillez fournir le texte à traduire. | Bien sûr, veuillez me fournir le texte que vous souhaitez que je traduise. | Please provide the English text you would like me to translate. I am ready to translate it into French. |
| **ComfyUI** | Yes | Fonctionnement local (à l'adresse http://127.0.0.1:8188) ou sur une machine distante. CodeComfy communique via son API HTTP. |
| **FFmpeg**  | Pour la vidéo. | Doit être présent dans le chemin d'accès de votre système *ou* configuré via la variable `codecomfy.ffmpegPath`. [Télécharger FFmpeg](https://ffmpeg.org/download.html). |
| **NextGallery** | Facultatif. | Visualiseur de galeries associé. Non requis pour la génération elle-même. |

## Installation

CodeComfy n'est pas encore disponible sur le marché de VS Code.
Pour l'installer, utilisez un fichier `.vsix` :

1. Téléchargez la dernière version du fichier `.vsix` depuis la page
[Releases](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases).
2. Dans VS Code : onglet **Extensions** → menu `···` → **Installer à partir de VSIX…**
3. Rechargez la fenêtre lorsque vous y êtes invité.

### Paramètres

Ouvrez **Paramètres → Extensions → CodeComfy** ou ajoutez la configuration suivante au fichier `settings.json` :

```json
{
  "codecomfy.comfyuiUrl": "http://127.0.0.1:8188",
  "codecomfy.ffmpegPath": "",
  "codecomfy.autoOpenGalleryOnComplete": true,
  "codecomfy.nextGalleryPath": "",
  "codecomfy.defaultNegativePrompt": ""
}
```

| Cadre.
Contexte.
Décor.
Lieu.
Environnement.
Installation.
Réglage.
Configuration.
Mise en place.
Aménagement. | Description. | Par défaut. |
| Veuillez fournir le texte à traduire. | Veuillez fournir le texte à traduire. | Veuillez fournir le texte à traduire. |
| `codecomfy.comfyuiUrl` | URL du serveur ComfyUI. | `http://127.0.0.1:8188` |
| `codecomfy.ffmpegPath` | Chemin d'accès absolu à l'exécutable FFmpeg (laisser vide pour une recherche dans le chemin d'accès système). | `""` |
| `codecomfy.autoOpenGalleryOnComplete` | Ouvrez NextGallery une fois la génération terminée. | `true` |
| `codecomfy.nextGalleryPath` | Chemin d'accès absolu vers le fichier NextGallery.exe. | Détection automatique. |
| `codecomfy.defaultNegativePrompt` | Invite négative par défaut préremplie pendant la génération. | `""` |

## Démarrage rapide

1. **Lancez ComfyUI** — assurez-vous qu'il est en cours d'exécution et accessible.
2. **Choisissez une commande** — ouvrez la palette de commandes (appuyez sur `Ctrl+Shift+P`) et sélectionnez :
- `CodeComfy: Generate Image (HQ)` — pour générer une image unique.
- `CodeComfy: Generate Video (HQ)` — pour générer une courte vidéo (2 à 8 secondes).
3. **Entrez une description**, éventuellement une **description négative** (éléments à éviter), et une **graine**, puis surveillez la barre d'état.

<!-- Captures d'écran : remplacer par des images PNG réelles – voir le fichier assets/SCREENSHOTS.md -->

La **barre d'état** affiche la progression en temps réel (en attente → en cours de génération → terminé).

Les journaux structurés apparaissent dans le canal de sortie **CodeComfy** (accessible en appuyant sur `Ctrl+Shift+U`, puis en sélectionnant "CodeComfy").

Les résultats sont enregistrés dans le dossier `.codecomfy/outputs/`, situé à la racine de votre espace de travail.
Les informations relatives aux exécutions sont stockées dans le dossier `.codecomfy/runs/`.

### Annuler

Exécutez la commande `CodeComfy : Annuler la génération` depuis la palette de commandes, ou cliquez sur l'élément de la barre d'état pendant qu'une génération est en cours.

## Limites de génération

La génération de vidéos respecte les limites de sécurité afin d'éviter tout épuisement accidentel des ressources.

| Paramètre. | Min | Max |
| Veuillez fournir le texte à traduire. |-----|-----|
| Durée. | 1 s | 15 s |
| FPS       | 1   | 60   |
| Nombre total d'images (durée × nombre d'images par seconde). | — | 450 |

Si vous atteignez une limite, réduisez la durée ou choisissez un préréglage avec un taux de trame inférieur.

## Dépannage

### `[Réseau]` — Impossible de se connecter au serveur ComfyUI

- ComfyUI est-il en cours d'exécution ? Vérifiez l'adresse `http://127.0.0.1:8188/system_stats` dans un navigateur.
- Si ComfyUI est accessible sur un port ou un hôte différent, mettez à jour la variable `codecomfy.comfyuiUrl`.
- Un pare-feu ou un proxy bloque-t-il la connexion ? Essayez la commande `curl http://127.0.0.1:8188/system_stats`.

### `[Serveur]` — ComfyUI a renvoyé une erreur

- Vérifiez le terminal/la console de ComfyUI pour détecter les traces de pile.
- Cause fréquente : fichier de modèle manquant ou nœud personnalisé.
- Assurez-vous que votre installation de ComfyUI contient les nœuds requis par le flux de travail prédéfini.

### `[API]` — Erreur de format de la réponse

- Votre version de ComfyUI peut être trop ancienne ou trop récente pour les modèles préconfigurés inclus.
- Un serveur proxy inverse ou un CDN pourrait corrompre les réponses au format JSON.
- Essayez d'accéder directement aux pages `/prompt` et `/history` pour examiner la structure des réponses.

### `[IO]` — Problèmes de permissions de fichier ou de disque

- Assurez-vous que le dossier de votre espace de travail est accessible en écriture.
- Vérifiez l'espace disque disponible, car les téléchargements de séquences vidéo peuvent être volumineux.
- Sous Windows, évitez d'utiliser des espaces de travail situés sur des lecteurs réseau pour optimiser les performances.

### FFmpeg introuvable

- Installez FFmpeg et assurez-vous que `ffmpeg.exe` se trouve dans le chemin d'accès de votre système (PATH).
- Ou, définissez la variable `codecomfy.ffmpegPath` sur le **chemin d'accès absolu complet** (par exemple, `C:\ffmpeg\bin\ffmpeg.exe`).
- Les chemins relatifs et les noms de fichiers incomplets (autres que `ffmpeg` trouvé via le PATH) sont rejetés pour des raisons de sécurité.

### "Génération déjà en cours d'exécution."

Une seule génération peut être exécutée à la fois.
Pour interrompre la génération en cours, utilisez la commande (`CodeComfy: Annuler la génération`) ou attendez qu'elle se termine.
Il y a un délai de 2 secondes entre chaque tâche.

### Validation des données initiales / amorçage

- Les valeurs des paramètres doivent être des nombres entiers compris entre 0 et 2 147 483 647.
- Les instructions doivent être non vides et ne doivent pas dépasser 8 000 caractères.

## Limitations connues

| Area | Statut. |
| Veuillez fournir le texte à traduire. | Veuillez fournir le texte à traduire. |
| **Windows** | Entièrement testé (Windows 10/11). Plateforme principale. |
| macOS | Conçu pour la génération d'images et de vidéos. Il est possible que NextGallery ne soit pas encore disponible. |
| **Linux** | Conçu pour la génération d'images et de vidéos. Il est possible que NextGallery ne soit pas encore disponible. |
| **Remote / WSL** | L'URL de ComfyUI doit être accessible depuis l'ordinateur hébergeant Visual Studio Code. |

Les fonctionnalités de base (invite → ComfyUI → téléchargement → assemblage FFmpeg) sont indépendantes de la plateforme. La seule fonctionnalité spécifique à Windows est la détection automatique de NextGallery, qui, sur les autres plateformes, se substitue gracieusement à une invite demandant à l'utilisateur de définir le chemin d'accès dans les paramètres.

Si vous rencontrez un problème spécifique à une plateforme, veuillez
[ouvrir un ticket](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues)
en indiquant votre système d'exploitation, la version de VS Code et la version de ComfyUI.

## Comment ça fonctionne

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

MIT.
