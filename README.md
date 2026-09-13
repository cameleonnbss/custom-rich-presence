# Custom Rich Presence

Petit utilitaire Windows qui affiche un **panneau de présence flottant** sur le bureau :
image, titre, sous-titre, texte libre, bouton avec lien, chronomètre, barre de progression,
lecture multimédia Windows ou vidéo YouTube — entièrement configurable.

![stack](https://img.shields.io/badge/stack-Tauri_2%20%2B%20TypeScript-blue)

## Fonctionnalités

- **Panneau flottant** indépendant : toujours au-dessus (optionnel), déplacement par glisser,
  redimensionnement, verrouillage (`Ctrl+Alt+P` sur le panneau), opacité, position mémorisée,
  ancrage dans un coin, multi-écrans.
- **Éditeur** avec aperçu en temps réel (les modifications apparaissent immédiatement).
- **Éléments** : image, titre, sous-titre, texte libre, bouton + lien, chronomètre,
  barre de progression, date/heure — chacun activable/désactivable.
- **Musique Windows** : récupère via l'API native SMTC les métadonnées de *n'importe quelle*
  application compatible (titre, artiste, album, pochette, position, durée, état lecture/pause,
  application source). Aucun média détecté → la carte reste sur son contenu statique, sans erreur.
- **YouTube** : collez une URL, la miniature et le titre sont récupérés via oEmbed public
  (sans clé API) ; miniature mise en cache localement pour un affichage hors ligne.
  L'architecture permet d'ajouter une API dédiée plus tard (`src-tauri/src/youtube.rs`).
- **Discord Rich Presence** : la carte est reflétée comme statut Discord via l'IPC
  locale de Discord (pipe nommé, aucun serveur). Titre, sous-titre, chronomètre
  (timestamps) et image de l'application Discord associée. Nécessite un identifiant
  d'application Discord (voir ci-dessous) et Discord lancé.
- **Presets** : Minimal, Media, Gaming, YouTube, Custom — accessibles depuis l'éditeur
  ou le menu de la zone de notification.
- **Zone de notification** : clic gauche = afficher/masquer le panneau, clic droit = menu
  (Afficher, Masquer, Modifier, Presets, Paramètres, Quitter).
- **Lancement au démarrage de Windows** : option désactivable dans les Paramètres.
- **Stockage local** : `%APPDATA%\CustomRichPresence\config.json` (écriture atomique).
  Aucune connexion serveur ; tout fonctionne hors ligne sauf la récupération
  YouTube/miniatures, qui est optionnelle.

## Build

Prérequis : [Node.js 18+](https://nodejs.org), [Rust stable](https://rustup.rs) avec la cible
`x86_64-pc-windows-msvc` (ou `gnu`), et les outils de build Windows.

```powershell
npm install
npm run icons      # régénère les icônes à partir de assets/icon.png
npm run tauri:build
```

Sur une machine où le nom d'utilisateur Windows contient des caractères non
ASCII **et** où la toolchain Rust est la variante GNU (cas de cette machine
de développement), utilisez plutôt `powershell -File scripts/build.ps1`, qui
dirige la compilation vers un chemin ASCII. Avec la toolchain MSVC standard,
`npm run tauri:build` fonctionne tel quel.

L'installateur NSIS et l'exécutable sont produits dans `src-tauri/target/release/bundle/`.

### Développement

```powershell
npm run tauri:dev
```

## Discord Rich Presence

1. Créez une application sur [discord.com/developers](https://discord.com/developers/applications)
   (un clic sur « New Application » suffit — le champ « description » devient la légende
   du statut).
2. Copiez l'**Application ID** et collez-le dans Paramètres > Discord Rich Presence.
3. Optionnel : dans « Rich Presence > Art Assets », téléversez une image nommée
   `app-icon` (elle apparaît à côté du statut).
4. Activez la présence Discord, lancez Discord, affichez le panneau.

La connexion utilise le protocole IPC officiel de Discord (pipe nommé local) :
aucune donnée ne transite par Internet autre que ce que Discord affiche déjà.
Si Discord est fermé, l'application continue de fonctionner et réessaie
périodiquement, sans erreur bloquante.

## Icône personnalisée

Remplacez simplement le fichier `assets/icon.png` par votre icône (carré, 512×512 recommandé),
puis relancez :

```powershell
npm run icons      # décline l'icône pour la fenêtre, la barre des tâches, le tray et l'installateur
npm run tauri:build
```

Les emplacements dérivés sont régénérés dans `src-tauri/icons/` (`.ico`, PNG multiples) :
icône d'exécutable, de fenêtre, de tray et de raccourci.

## Intégrations

Le système est modulaire :

- `src-tauri/src/media.rs` — lecture SMTC (toute application Windows compatible).
- `src-tauri/src/youtube.rs` — mode YouTube (oEmbed aujourd'hui, API dédiée demain).
- `src-tauri/src/presets.rs` — presets.

Ajouter une intégration = un module + une commande Tauri + un panneau dans l'éditeur
(`src/editor.ts`).

## Notes

- Interface sans emoji : pictogrammes SVG monochromes inline (`src/icons.ts`).
- Le panneau consomme très peu de ressources : aucun minuteur actif tant qu'aucun
  élément dynamique (chronomètre, horloge, progression média) n'est affiché ;
  l'interrogation média ne tourne que si le mode « suivre la lecture » est activé.
