# Changelog — AntiDraw

All notable changes to the "AntiDraw" extension will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.88.0] - 2026-10-18

### 🚀 Added
- **Image Tool in Toolbar (`ImageTool`)**: Added a dedicated Image tool to the left toolbar with a 1.4px precision SVG icon, supporting direct image file selection, canvas drag-and-drop, and clipboard paste (<kbd>Ctrl+V</kbd>).
- **Contextual Ingestion Architecture**:
  - *No element selected*: Inserts the image as an independent, scalable `<image>` element in the SVG canvas with interactive bounding box transformation.
  - *Vector element selected*: Seamlessly assigns the image as a responsive `<pattern>` background texture to the vector's `fill` attribute using `patternContentUnits="objectBoundingBox"`.
- **Smart Ingestion Thresholding**: Automatic detection for files over 1.5 MB or 1920 px resolution. Files below the threshold pass through instantly with zero friction, while larger assets trigger the optimization modal.
- **Save for Web Optimization Modal**: Interactive 2-up dual viewport comparison dialog inspired by Adobe Fireworks/Photoshop "Save for Web & Devices":
  - Real-time side-by-side comparison of original vs. optimized preview with live byte savings calculation.
  - Multi-scale dimension resizing (width, height, percentage, locked aspect ratio).
  - Color mode control (RGB 24/32-bit vs. indexed palette color quantization to 256, 128, 64, 32, 16 colors).
  - Compression quality slider (WebP/JPEG) and smoothing/noise reduction filter.
  - Background matte color and alpha transparency control.
- **Linked Asset Storage & Naming Standard**: Ability to copy and link images on disk alongside the SVG document (`[svgName]_[imageId]_img.[ext]`) keeping the SVG XML lightweight and portable, as well as embedding as standard Base64 Data URIs.
- **W3C SVG Image Serialization & Roundtrip**: Lossless deserialization and serialization of `<image>` and `<pattern>` nodes in `SvgSerializer` and `SvgDeserializer` adhering strictly to W3C standards.
- **Bilingual Localization (ES / EN)**: Full symmetrical localization for all new modal options, tooltips, and image workflow notifications.

---

## [0.87.3] - 2026-10-17

### 🛠️ Fixed
- **Property Panel Void & Truncated Header Fix**: Fixed an issue where unescaped `<svg>` characters in `panels.rootSvgAttrs` translation strings caused the browser's DOM parser to instantiate an unclosed, native 300×150px `<svg>` canvas element directly inside the Property Panel, truncating the title to `"ATRIBUTOS RAÍZ SVG ("` and pushing the properties controls down with a large empty gap.
- **HTML Entity Escaping**: Properly escaped `<svg>` to `&lt;svg&gt;` in both English and Spanish localization dictionaries (`rootSvgAttrs`).
- **Complete Root SVG Attribute Localization**: Localized all inner attribute labels and tooltips in `CanvasInspector` (`rootFill`, `rootStroke`, `rootWidth`, `linecap`, `linejoin`, `undefinedDefault`, and all explanatory tooltips).

### 📋 Governance & Rules
- **Rule 7 (AntiDraw) & Rule 5 (AntiDraw-Docs) Added**: Enforced mandatory bilingual synchronization—any text correction, addition, or copy update made in Spanish must strictly and symmetrically be reflected in English (and vice versa) across all localization dictionaries, tooltips, and documentation.

---

## [0.87.2] - 2026-10-17

### 🛠️ Fixed
- **Responsive Flex-Wrap TopBar**: Eliminated horizontal scrollbars in the top toolbar by applying `flex-wrap: wrap` and dynamic grid row sizing (`auto`), allowing tool groups to flow into second/third rows gracefully.
- **Multi-Column Vertical Toolbar**: Configured the left tool palette with `flex-direction: column` and `flex-wrap: wrap`, automatically expanding into multiple columns when vertical editor space is constrained without cutting off buttons.
- **Responsive Flex StatusBar**: Enabled `flex-wrap: wrap` across the status bar and action clusters to adapt dynamically to narrow viewports.
- **Reactive Layout Resize Synchronization**: Integrated `ResizeObserver` on the canvas scroll area in `ViewportController` to continuously synchronize rulers, viewport camera offsets, and overlay layers whenever layout bars wrap or expand.

---

## [0.87.1] - 2026-10-17

### 🛠️ Fixed
- **Property Panel Default Fallback Elimination**: Fixed an issue where the Canvas & ViewBox properties were unintentionally rendered when the Selection Tool was active without any selected elements.
- **Explicit Status Bar Activation for Canvas & ViewBox**: Canvas & ViewBox inspector properties now appear *if and only if* explicitly triggered via the `#btn-canvas-props` status bar button.
- **Contextual Empty Selection State**: Introduced a bilingual placeholder state (`No Selection` / `Sin Selección`) with clean iconographic guidance when no objects are selected on the canvas.
- **Active Status Indicator & Dismissal**: Added dynamic active highlighting (`.active`) to the `#btn-canvas-props` status button and automatic dismissal back to empty state upon selecting elements/nodes or pressing <kbd>Escape</kbd>.

---

## [0.87.0] - 2026-10-17

### 🌐 Added
- **Native Bilingual Internationalization (i18n)**: Integrated bilingual architecture (English `EN` and Spanish `ES`) with live runtime switching without editor reloads via a status bar toggle.
- **Universal i18n Coverage Across All Inspectors & Panels**: Comprehensive dictionary coverage for Geometry, Nodes, Primitives, Lines/Polygons, Swatches, Parametric Blend, Free Distortion, Variable Stroke, Markers, Stroke Layers, Pathfinders, and the Vector Explorer panel.
- **Floating Mini-HUD Localization**: Localized 1-click transformation controls (`✥ Move / ⤢ Scale / ⟳ Rotate`) directly hovering over the selection bounding box.
- **Bilingual Dynamic Quick Help Table**: Real-time contextual shortcut and modifier table dynamically presented in both English and Spanish for all 10 tools.
- **Status Bar Metric Grid Align Controls**: Quick-toggle buttons (`┼ Line (0,0)` / `◫ Cell (0,0)`) directly integrated into status bar with localized tooltips and instantaneous re-centering.
- **Ecosystem Cross-Navigation**: Direct reference links and shield badges linking GitHub source code, VS Code Marketplace, and Open VSX Registry across all distribution platforms.

### 🎨 Changed
- **Slenderized Vector Iconography**: Complete redesign and thinning of all UI icons from thick strokes to refined `1.4px` professional geometry with crisp high-DPI scaling.
- **100% SVG Visual Language**: Replaced all informal emojis across the canvas, toolbars, and notifications with clean, standard SVG iconography.
- **Reorganized Status Bar & Toolbar Topology**: Relocated Canvas & ViewBox properties launcher from the vertical tool palette to the bottom status bar for cleaner canvas real estate.

### 🛠️ Fixed
- **Topological Drawer Sub-Flyouts**: Restored visual indicator arrows and interactive switching for Scissors/Knife/Eraser and Smart Fill/Shape Builder tool groups with active slot persistence and corner badges.
- **Eliminated Spanish Strings in English Mode**: Resolved untranslated headers (`POLÍGONO`, `Puntos`, `Convertir a Curvas`, `Mover / Escalar / Rotar`, `Ayuda Rápida`) when `EN` is active.

---

## [0.85.87] - 2026-10-15 (Beta Release)

### ✨ Added
- **Infinite Vector Canvas**: Integrated SVG canvas with pan (<kbd>Space</kbd> + Drag) and mouse wheel zoom.
- **Top and Left Dynamic Rulers**: Real-time cursor tracking and configurable measurement units (`px`, `mm`, `cm`, `in`).
- **Interactive Smart Guides**:
  - Drag-to-create directly from horizontal or vertical rulers.
  - Guide selection, deletion (<kbd>Supr</kbd> / <kbd>Delete</kbd>), and ruler return.
  - Double-click rotation with interactive angle pivot manipulation.
- **Three-State Selection & Transform Bounding Box**:
  - Quick cycle between Move (<kbd>W</kbd>), Scale (<kbd>E</kbd>), and Rotate (<kbd>R</kbd>).
  - Dedicated Free Deformation mode (<kbd>D</kbd>) for non-uniform perspective tweaks.
  - Floating contextual Mini-HUD for instant dimension, fill, and stroke adjustments.
- **Advanced Bézier Curve & Node Tool**:
  - Full support for Cusp (Corner), Smooth, and Symmetric Bézier control handles.
  - Subgroup node transformation with dynamic centroid computation and tangent preservation.
  - Node welding and join (<kbd>Ctrl</kbd> + <kbd>J</kbd>) with zero-length segment prevention.
- **Parametric Shapes & Auto-Promotion Engine**:
  - Rectangles with independent 4-corner radius sliders and "Unify Corners" symmetry toggle.
  - Ellipses and Circles with pie-slice opening angles and inner donut hole radii.
  - Polygons and Stars with real-time arrow keys (<kbd>↑</kbd> / <kbd>↓</kbd>) and depth modulation (<kbd>Ctrl</kbd>).
  - Silent auto-promotion to `<path>` on asymmetrical modifications while preserving parametric state in `.json` sidecar.
- **Boolean Operations & Topologic Cutting**:
  - Pathfinder operations: Union, Difference, Intersection, Exclusion, Combine, and Fragmentation.
  - Planar graph Smart Fill (`SmartFillEngine`) with DCEL partitioning and ray-casting.
  - Scissors (<kbd>C</kbd>), Knife, and Eraser (<kbd>Shift</kbd> + <kbd>E</kbd>) tools.
- **Precision Snapping System**:
  - Orthogonal & Isometric grids with GPU-accelerated pattern caching.
  - Smart Guides snapping with analytical line-line and line-curve intersections.
  - Pixel-Perfect alignment with $\pm 0.5\text{px}$ odd-stroke compensation.
  - ViewBox and geometry anchor point snapping.
- **Variable Strokes & Morphing**:
  - Hermite $C^1$ variable stroke width with sketch-ink harmonic modulation.
  - Parametric Blend Tool (`BlendEngine`) with morphological morphing and twist correction.
  - Warp & Distort engine (`WarpEngine`) with concentric circular arc deformation.
- **High-Fidelity Persistence**:
  - 100% clean W3C Standard SVG generation without proprietary XML namespaces.
  - Non-destructive companion `.svg.json` sidecar metadata storage.

### 🛡️ Licensing & Governance
- Established **PolyForm Noncommercial License 1.0.0** (Source-Available) to protect author attribution and prohibit unauthorized commercial exploitation while keeping the tool free for the community.
