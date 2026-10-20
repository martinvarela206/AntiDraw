# AntiDraw — SVG Vector Editor for VS Code & Antigravity

<p align="center">
  <img src="https://raw.githubusercontent.com/martinvarela206/AntiDraw/main/icon.png" width="128" height="128" alt="AntiDraw Logo" />
</p>

<p align="center">
  <strong>Professional vector graphics precision meets the speed of your code editor.</strong><br>
  <em>Combining the workflow agility of Figma and the geometric precision of CorelDraw inside your IDE.</em>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw"><img src="https://img.shields.io/badge/VS%20Code-Marketplace-007ACC?style=flat-square&logo=visual-studio-code" alt="VS Code Marketplace"></a>
  <a href="https://open-vsx.org/extension/martinvarela206/antidraw"><img src="https://img.shields.io/badge/Open--VSX-Registry-purple?style=flat-square" alt="Open VSX Registry"></a>
  <a href="https://github.com/martinvarela206/AntiDraw"><img src="https://img.shields.io/badge/GitHub-Repository-181717?style=flat-square&logo=github" alt="GitHub Repository"></a>
  <a href="https://github.com/martinvarela206/AntiDraw/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Source--Available-blue?style=flat-square" alt="Source-Available License"></a>
  <a href="https://github.com/martinvarela206/AntiDraw"><img src="https://img.shields.io/badge/Status-Beta%20v0.94.2-orange?style=flat-square" alt="Status"></a>
</p>

<p align="center">
  <a href="https://ko-fi.com/martinvarela206" target="_blank">
    <img src="https://img.shields.io/badge/Ko--fi-Support%20Creator-FF5E5B?style=for-the-badge&logo=kofi&logoColor=white" alt="Support on Ko-fi">
  </a>
</p>

---

## 🌐 Ecosystem & Distribution Links / Enlaces del Ecosistema

Whether you discovered AntiDraw through GitHub, VS Code Marketplace, or Open VSX, you can easily access any part of the project:

| Service / Platform | Description | Direct Link |
| :--- | :--- | :--- |
| 🐙 **GitHub Repository** | Source code, architecture docs, releases, and issue tracker | [github.com/martinvarela206/AntiDraw](https://github.com/martinvarela206/AntiDraw) |
| 🔷 **Visual Studio Marketplace** | Official Microsoft extension store for VS Code | [marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw](https://marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw) |
| 🟣 **Open VSX Registry** | Open-source extension registry for VSCodium, Antigravity, Gitpod | [open-vsx.org/extension/martinvarela206/antidraw](https://open-vsx.org/extension/martinvarela206/antidraw) |

---

> [!NOTE]
> **Project Status: Public Beta (v0.92.0)**  
> AntiDraw is under active, continuous development. While vector editing, Bézier curves, snapping, and boolean topology are fully functional and stable, you may encounter occasional edge cases.  
> Found a bug or have a feature request? Please [open an issue on GitHub](https://github.com/martinvarela206/AntiDraw/issues) — your feedback directly shapes upcoming releases!

---

## ⚡ Why AntiDraw?

Frontend developers, UI engineers, and technical designers constantly face a painful context switch:
1. **Desktop heavyweights (Illustrator, CorelDraw)** are expensive, proprietary, and isolated from code workflows.
2. **Traditional open-source tools (Inkscape)** suffer from steep learning curves and pollute SVGs with proprietary namespace tags (`inkscape:*`, `sodipodi:*`) that break modern bundlers (Vite, Next.js, Webpack).
3. **Basic IDE viewers/draw plugins** lack serious Bézier curve math, snapping precision, and Boolean pathfinders.

**AntiDraw** solves this directly inside Visual Studio Code and Antigravity:
* **100% Clean W3C Standard SVG**: Zero proprietary XML garbage. Your SVGs remain directly consumable by React, Vue, Flutter, and web apps.
* **Sidecar Persistence (`.svg.json`)**: Editor metadata (guides, angle pivots, history, parametric states) are saved non-destructively in an optional companion sidecar file.
* **Zero Context Switching**: Tweak dimensions, alter Bézier nodes, weld shapes, and adjust fills directly without ever leaving your workspace.

---

## ✨ Key Features

### 📐 1. Canvas & Interactive Precision Rulers
* **Infinite Canvas**: Smooth high-framerate pan, zoom, and transform controls.
* **On-Demand Canvas & ViewBox Inspector**: Accessible directly via the status bar (`Lienzo` / `Canvas`) to configure presets (Icon 16-128, A4, 1080p, 1440p), bounds, and artboard background fill without cluttering the selection inspector.
* **Dynamic Rulers & Units**: Top and Left rulers with real-time cursor tracking, configurable in `px`, `mm`, `cm`, and `in`.
* **Interactive Smart Guides**:
  * Drag directly from horizontal or vertical rulers to place guides.
  * Click to select, press <kbd>Delete</kbd> / <kbd>Supr</kbd> to remove, or drag back into the ruler.
  * **Double-click manipulation**: Rotate guides to any custom angle and relocate the rotation pivot point interactively.

### 🎯 2. Three-State Selection & Transform Bounding Box
* **Canonical 3-State Cycle**: Rapidly cycle between **Move** (<kbd>W</kbd>), **Scale** (<kbd>E</kbd>), and **Rotate** (<kbd>R</kbd>).
* **Dedicated Free Deformation** (<kbd>D</kbd>): Non-uniform skew and perspective tweaking.
* **Floating Contextual Mini-HUD**: Instant access to alignment, dimensions, stroke widths, and fills right next to your selection.

### 🖋️ 3. Advanced Bézier Curve & Node Tool
* **Direct Bézier Segment Bending**: Click and drag any path segment directly to sculpt organic curves into place without fiddling with tangents, backed by analytical Bernstein polynomial weighting.
* **On-the-Fly Straight Line Auto-Conversion**: Dragging linear segments automatically promotes them to cubic Bézier curves, accelerating silhouette vectorization workflows (trace rough polygons with Pen <kbd>P</kbd> and curve smoothly with Node <kbd>N</kbd>).
* **Contextual Drag Disambiguation**: Intelligently switches between direct curve bending and rigid solidary node translation based on node pre-selection, with on-demand <kbd>Alt</kbd> inversion and predictive cursor feedback.
* **Handle Modes**: Full mathematical support for Cusp (Corner), Smooth, and Symmetric Bézier handles.
* **Subgroup Node Transformations**: Multi-select $N \ge 2$ nodes to scale, rotate, or skew them around their dynamic local centroid while preserving tangents.
* **Node Welding / Join** (<kbd>Ctrl</kbd> + <kbd>J</kbd>): Seamlessly fuse coincident nodes without leaving zero-length segments.

### 🔷 4. Parametric Shapes with Smart Auto-Promotion
* **Rectangles**: Independent 4-corner radius controls with instant "Unify Corners" symmetry toggle.
* **Ellipses & Circles**: Pie-slice opening angles and inner donut hole radii.
* **Polygons & Stars**: Interactive live side/point adjustment via <kbd>↑</kbd> / <kbd>↓</kbd> arrows and inner radius depth modulation with <kbd>Ctrl</kbd>.
* **Auto-Promotion**: Modifying parametric primitives automatically transitions them to clean `<path>` geometry without breaking live undo or sidecar fidelity.

### ✂️ 5. Boolean Operations, Cutting & Smart Fill
* **Vector Pathfinder**: Union, Difference, Intersection, Exclusion, Combine, and Fragmentation.
* **Planar Graph Smart Fill**: Instant enclosed area detection via DCEL planar graph partitioning and ray-casting.
* **Topology Tools**: Precision Scissors (<kbd>C</kbd>), Knife tool, and Eraser (<kbd>Shift</kbd> + <kbd>E</kbd>).

### 🧲 6. Five-Fold Snapping System
* **Orthogonal & Isometric Grids** with GPU-accelerated pattern caching.
* **Smart Guides Snapping** with analytical line-line and line-curve intersections.
* **Pixel-Perfect Alignment** with automatic $\pm 0.5\text{px}$ odd-stroke compensation.
* **Geometry Snapping**: ViewBox bounds, anchor nodes, and edge midpoints.

### 🌊 7. Variable Strokes, Morphing & Warp
* **Spine Curves**: Hermite $C^1$ variable stroke width with sketch-ink harmonic modulation.
* **Parametric Blend Tool**: Morphological and chromatic interpolation between vectors with twist-correction inversion.
* **Warp & Distort Engine**: Concentric circular arc deformation without polygon breakdown.

### 🌐 8. Native Bilingual Architecture (i18n) & Refined UI
* **Instant Bilingual Switching**: 1-click live toggle between English (<kbd>EN</kbd>) and Spanish (<kbd>ES</kbd>) from the status bar with zero editor reloads.
* **Universal Coverage**: All property panels, tooltips, shortcuts cheatsheet, and floating Mini-HUD adapt instantaneously to the chosen language.
* **100% Crisp Vector Iconography**: Slenderized `1.4px` precision stroke geometry, eliminating emojis in favor of professional technical SVG design.

### 🖼️ 9. Images, Textures & Save for Web Optimizer
* **Interactive Image Tool**: Insert bitmap images (PNG, JPEG, WebP) directly from the toolbar, canvas Drag & Drop, or clipboard paste (<kbd>Ctrl</kbd> + <kbd>V</kbd>).
* **Contextual Ingestion Flow**:
  * *No selection*: Places an independent, scalable `<image>` element on the canvas.
  * *Vector selected*: Assigns the image as a responsive `<pattern>` background texture directly to the vector's `fill`.
* **Smart Ingestion Thresholding**: Files under 1.5 MB or 1920 px pass through instantly, while larger assets trigger the Save for Web dialog.
* **Save for Web Dialog (Dual 2-Up Viewport)**:
  * Split side-by-side comparison (Original vs. Optimized) with synchronized zoom & pan and real-time byte savings telemetry.
  * Multi-scale resizing with aspect ratio lock, color quantization (256 down to 16 colors), smoothing filter, and lossy/lossless compression control.
* **Linked vs. Embedded Assets**: Option to copy and link the image in disk alongside the SVG (`svgName_id_img.ext`) keeping the SVG XML lightweight, or embed cleanly in Base64 Data URI.

---

## ⌨️ Essential Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>V</kbd> | Selection Tool |
| <kbd>W</kbd> / <kbd>E</kbd> / <kbd>R</kbd> | Toggle Move / Scale / Rotate Mode |
| <kbd>D</kbd> | Free Deformation Mode |
| <kbd>N</kbd> / <kbd>A</kbd> | Node Editing Tool |
| <kbd>P</kbd> | Pen Tool (Bézier curves) |
| <kbd>C</kbd> | Scissors Tool |
| <kbd>Shift</kbd> + <kbd>E</kbd> | Eraser Tool |
| <kbd>Ctrl</kbd> + <kbd>J</kbd> | Join / Weld selected coincident nodes |
| <kbd>Space</kbd> + Drag | Pan Canvas |
| <kbd>Delete</kbd> / <kbd>Supr</kbd> | Delete selected elements or guide lines |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Ctrl</kbd> + <kbd>Y</kbd> | Undo / Redo |

---

## 🚀 Getting Started

1. Install **AntiDraw** from the **Visual Studio Code Marketplace** or **Open VSX**.
2. Right-click any `.svg` file in your VS Code Explorer.
3. Select **"Reopen Editor With..."** ➔ **"AntiDraw SVG Editor"** (or configure it as the default editor for `.svg`).
4. Alternatively, run `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) and type:  
   `AntiDraw: Open with AntiDraw SVG Editor`

---

## ☕ Support & Donations

AntiDraw is built and maintained with dedication by an independent developer. It is offered freely to the community under a **Source-Available License** so that developers and designers around the world can enjoy a fast, uncluttered vector workflow directly in their IDE.

If AntiDraw saves you time, enhances your daily coding flow, or helps you ship great products, you can support its continued evolution and maintenance:

* ☕ **Support on Ko-fi (Global Cards & PayPal):**  
  👉 **[ko-fi.com/martinvarela206](https://ko-fi.com/martinvarela206)**
* ⭐ **Give a Star:** Star the repository on [GitHub](https://github.com/martinvarela206/AntiDraw) to help more developers discover it!

---

## 📄 License & Intellectual Property

Copyright © 2026 **Martin Varela** (`martinvarela206@gmail.com`).

AntiDraw is licensed under the **PolyForm Noncommercial License 1.0.0** (Source-Available):
* **Free to use, study, and modify** for personal, educational, research, and non-commercial development workflows.
* **Mandatory Attribution**: All forks and distributed copies must preserve original copyright notices and credit Martin Varela.
* **Commercial Redistribution Prohibited**: You may not repackage, rebrand, or sell AntiDraw (or its derivatives) as a commercial product without explicit written consent from the author.

See the full [LICENSE](LICENSE) file for complete legal terms.
