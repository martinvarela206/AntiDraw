[ English ](README.md) | [ Español ](README.es.md) | [ 简体中文 ](README.zh-CN.md) | [ Deutsch ](README.de.md) | [ Français ](README.fr.md) | [ Русский ](README.ru.md) | [ 日本語 ](README.ja.md)

# AntiDraw — Éditeur vectoriel SVG pour VS Code & Antigravity

<p align="center">
  <img src="https://raw.githubusercontent.com/martinvarela206/AntiDraw/main/icon.png" width="128" height="128" alt="AntiDraw Logo" />
</p>

<p align="center">
  <strong>La précision vectorielle professionnelle alliée à la rapidité de votre éditeur de code.</strong><br>
  <em>La fluidité de travail de Figma combinée à la rigueur géométrique de CorelDraw au cœur de votre IDE.</em>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw"><img src="https://img.shields.io/badge/VS%20Code-Marketplace-007ACC?style=flat-square&logo=visual-studio-code" alt="VS Code Marketplace"></a>
  <a href="https://open-vsx.org/extension/martinvarela206/antidraw"><img src="https://img.shields.io/badge/Open--VSX-Registry-purple?style=flat-square" alt="Open VSX Registry"></a>
  <a href="https://github.com/martinvarela206/AntiDraw"><img src="https://img.shields.io/badge/GitHub-Repository-181717?style=flat-square&logo=github" alt="GitHub Repository"></a>
  <a href="https://github.com/martinvarela206/AntiDraw/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Source--Available-blue?style=flat-square" alt="Source-Available License"></a>
  <a href="https://github.com/martinvarela206/AntiDraw"><img src="https://img.shields.io/badge/Status-Beta%20v0.99.1-orange?style=flat-square" alt="Status"></a>
</p>

<p align="center">
  <a href="https://ko-fi.com/martinvarela206" target="_blank">
    <img src="https://img.shields.io/badge/Ko--fi-Soutenir%20le%20cr%C3%A9ateur-FF5E5B?style=for-the-badge&logo=kofi&logoColor=white" alt="Support on Ko-fi">
  </a>
</p>

---

## 🌐 Liens de l'Écosystème & Distribution

| Service / Plateforme | Description | Lien direct |
| :--- | :--- | :--- |
| 🐙 **Dépôt GitHub** | Code source, architecture, releases et suivi des anomalies | [github.com/martinvarela206/AntiDraw](https://github.com/martinvarela206/AntiDraw) |
| 🔷 **Visual Studio Marketplace** | Boutique officielle d'extensions Microsoft pour VS Code | [marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw](https://marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw) |
| 🟣 **Registre Open VSX** | Registre d'extensions open source pour VSCodium, Antigravity, Gitpod | [open-vsx.org/extension/martinvarela206/antidraw](https://open-vsx.org/extension/martinvarela206/antidraw) |

---

> [!NOTE]
> **État du projet : Bêta publique (v0.99.1)**  
> AntiDraw fait l'objet d'un développement actif continu. Bien que le dessin vectoriel, les courbes de Bézier, l'aimantation et les opérations booléennes soient stables, des cas limites peuvent survenir.  
> Un problème ou une suggestion ? N'hésitez pas à [ouvrir un ticket sur GitHub](https://github.com/martinvarela206/AntiDraw/issues).

---

## ⚡ Pourquoi AntiDraw ?

* **100% SVG Standard W3C épuré** : Aucune balise XML propriétaire polluante. Vos SVG sont exploitables directement dans React, Vue, Flutter et les applications web.
* **Persistance Sidecar (`.svg.json`)** : Les métadonnées de travail (repères, centres de rotation, historique, formes paramétriques) sont conservées sans altérer le SVG d'origine.
* **Zéro rupture de contexte** : Modifiez vos courbes, ajustez vos contours et appliquez vos textures directement sans jamais quitter votre éditeur de code.

---

## ✨ Fonctionnalités Essentielles

* **Canevas infini & Règles dynamiques** en `px`, `mm`, `cm` et `in`.
* **Cycle de sélection tri-état** : Déplacer (<kbd>W</kbd>), Redimensionner (<kbd>E</kbd>) et Tourner (<kbd>R</kbd>).
* **Déformation libre perspective 3x3** (<kbd>D</kbd>).
* **Modelage direct de courbes de Bézier** et auto-conversion des droites en courbes.
* **Primitives paramétriques intelligentes** : Rectangles, cercles, polygones et étoiles avec auto-promotion fluide en `<path>`.
* **Pathfinder booléen & Remplissage intelligent** planaire (DCEL).
* **Menu de sélection de langue flottant** avec drapeaux vectoriels SVG (Français, Anglais, Espagnol, Chinois, Allemand, Russe, Japonais).

---

## ⌨️ Raccourcis Clavier Principaux

| Raccourci | Action |
| :--- | :--- |
| <kbd>V</kbd> | Outil de sélection |
| <kbd>A</kbd> | Outil de nœuds |
| <kbd>P</kbd> | Plume Bézier |
| <kbd>L</kbd> | Ligne droite |
| <kbd>Y</kbd> | Polyligne |
| <kbd>R</kbd> | Rectangle |
| <kbd>O</kbd> | Cercle |
| <kbd>E</kbd> | Ellipse |
| <kbd>G</kbd> | Polygone régulier |
| <kbd>S</kbd> | Étoile |
| <kbd>T</kbd> | Outil de contour |
| <kbd>C</kbd> | Ciseaux |
| <kbd>K</kbd> | Couteau |
| <kbd>Shift</kbd> + <kbd>E</kbd> | Gomme vectorielle |
| <kbd>F</kbd> | Remplissage intelligent |
| <kbd>M</kbd> | Concepteur de formes |
| <kbd>I</kbd> | Image |
| <kbd>+</kbd> | Ajouter sommet |
| <kbd>Z</kbd> | Zoom & Pan |
| <kbd>D</kbd> | Basculer déformation libre |
| <kbd>Ctrl</kbd> + <kbd>J</kbd> | Joindre / Souder les sommets |
| <kbd>Suppr</kbd> / <kbd>Retour arrière</kbd> | Supprimer l'élément sélectionné |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Ctrl</kbd> + <kbd>Y</kbd> | Annuler / Rétablir |
| <kbd>Ctrl</kbd> + <kbd>0</kbd> | Recentrer le canevas |

---

## 📄 Licence

Copyright © 2026 **Martin Varela** (`martinvarela206@gmail.com`). Licencié sous **PolyForm Noncommercial License 1.0.0** (Source-Available). Voir [LICENSE](LICENSE).
