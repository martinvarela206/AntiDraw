# Changelog — AntiDraw

All notable changes to the "AntiDraw" extension will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.93.2] - 2026-10-18

### 🛠️ Fixed
- **Estilos Figma Studio Dual-Theme (Dark & Light) en Acciones de Nodo y Conversión de Segmento**:
  - Se incorporó la clase `.tool-btn` y contenedor `.button-group` en `main.css` utilizando las variables de diseño dual-theme de Figma Studio (`--figma-bg-input`, `--figma-border-subtle`, `--figma-text-primary`, `--figma-bg-hover` y `--figma-brand`).
  - Se eliminaron estilos inline que generaban fondos blancos con texto blanco en modo oscuro o cajas desalineadas.
  - Se reemplazaron glifos Unicode por iconos vectoriales SVG limpios y consistentes para las acciones `Cerrar Trazo (Z)`, `A Línea Recta` y `A Curva Bézier`, garantizando total nitidez y soporte en modo claro y oscuro sin emojis.

---

## [0.93.1] - 2026-10-18

### 🛠️ Fixed
- **Detección y Prioridad de Tiradores Bézier Sub-2px y Adyacentes a Segmentos**:
  - Se eliminó la restricción artificial `handleLen >= 2` que descartaba tiradores con longitud menor a 2 unidades de coordenadas, impidiendo seleccionar manijas en trazados de precisión o iconos con viewBox compactos (e.g. 64x64, 48x48 o 32x32).
  - Se implementó un radio de captura generoso para tiradores Bézier (`effHandleRadius = 16 / z`) frente a una tolerancia de segmento más ajustada (`8 / z`), asegurando que al clicar sobre o cerca de un tirador posicionado directamente sobre la cuerda del segmento, la interacción seleccione y arrastre siempre el tirador sin secuestro por parte del segmento.
  - Sincronización del cursor en hover (`CanvasInteractionController`): muestra cursor `pointer` con prioridad al sobrevolar tiradores Bézier incluso cuando coinciden exactamente con la trayectoria del segmento.

---

## [0.93.0] - 2026-10-18

### 🚀 Added / 🛠️ Enhanced
- **Selección Concurrente de Nodos al Clicar Segmentos**:
  - Al hacer clic sobre cualquier segmento de un trazado con la herramienta de nodos, ahora se seleccionan simultáneamente ambos nodos extremos que delimitan el segmento en lugar de solo uno.
  - La marquesina de selección interna y el contador de nodos seleccionados reflejan correctamente la selección dual (`selectedCount = 2`), permitiendo transformaciones y operaciones contextuales de segmento de forma inmediata.
- **Prioridad Absoluta de Tiradores Bézier frente a Segmentos**:
  - Se corrigió la colisión de interacción donde arrastrar un tirador Bézier adyacente o coincidente con el trazado era secuestrado por la detección de segmento (`hitTestSegment`), provocando el arrastre accidental de todo el segmento y ambos nodos.
  - Se implementó detección prioritaria universal de tiradores (`hitTestVertices` con verificación de manijas extendidas) antes de evaluar segmentos, garantizando una manipulación fluida y precisa de las tangentes de curvatura.
- **Conversión de Segmentos Coordinada y Tipos de Nodo (`asymmetric`)**:
  - Al convertir un segmento a Curva Bézier (`convertSegmentToCurve`), ambos vértices extremos del segmento se actualizan de vértice recto (`sharp`) a nodo asimétrico (`asymmetric`), creando sus tiradores Bézier tangenciales con proyección proporcional al segmento.
  - Al revertir a línea recta (`convertSegmentToLine`), se eliminan los tiradores correspondientes y el nodo regresa a vértice recto (`sharp`) si no posee otras tangentes activas.
- **Controles Numéricos de Alta Precisión para Tiradores Bézier y Vértices**:
  - Se añadieron campos de entrada numérica en el panel de propiedades (`NodeInspector`) para inspeccionar y calibrar al milímetro las coordenadas absolutas de las manijas de control: `In X`, `In Y`, `Out X` y `Out Y`.
  - Los campos `Position X` y `Position Y` del vértice activo ahora son completamente editables de forma bidireccional con confirmación por teclado (`Enter`, `change`).
  - Actualización reactiva a 60fps sin interferir con la edición activa del usuario (`activeElement`).
- **Botón Contextual de Conversión de Segmento y Limpieza de Acciones de Nodo**:
  - El panel de propiedades ahora muestra un único botón contextual según el estado actual del segmento activo: `[ A Curva Bézier ]` cuando el segmento es recto, o `[ A Línea Recta ]` cuando el segmento es curvo.
  - Se depuró la sección de `Acciones de Nodo`: se removió el texto plano `✓ (cerrado)` y se estandarizaron las acciones con botones consistentes en grilla con iconos y atajos de teclado (`Cerrar Trazo (Z)`, `Dividir Nodo`, `Unir Nodos (Ctrl+J)`).
- **Suite de Pruebas Automatizadas**:
  - Creada la suite `test-node-editing-ux.ts` (suite 37) validando selección dual de segmento, prioridad de hit-testing de manijas, conversión simétrica/asimétrica y renderizado contextual del inspector.

---

## [0.92.0] - 2026-10-18

### 🚀 Added / 🛠️ Enhanced
- **Atracción Magnética Unificada Multi-Objetivo a Grilla (`SnappingEngine`)**:
  - Se unificó el cálculo de snap a grillas ortogonales, isométricas y axonométricas para contemplar de manera simultánea e interactiva los 3 tipos de anclaje esenciales sin requerir alternar modos:
    1. **Punto 1 (Intersecciones)**: Cruce analítico de líneas de grilla (líneas ortogonales, diagonales ±30° isométricas, diagonales ±45° axonométricas y ejes verticales).
    2. **Punto 2 (Centros de Celda)**: Baricentro y punto medio de las celdas o rombos formados por la malla.
    3. **Punto 3 (Puntos Medios de Segmento)**: Puntos medios exactos de cada segmento que delimita las celdas de la grilla (líneas horizontales, verticales y diagonales).
  - Admite deslizamiento magnético continuo sobre líneas de grilla cuando el cursor no se encuentra en la proximidad directa de un vértice o centro de celda.
- **Simplificación y Depuración de Interfaz**:
  - Se eliminaron las opciones manuales y redundantes de alternar snap ("Línea (0,0)" y "Celda (0,0)") tanto de la barra de estado inferior (`AppLayoutManager`) como de los inspectores de propiedades (`CanvasInspector` y `RulerGuideInspector`).
  - La activación del snap a grilla ahora abarca automáticamente y sin fricción cognitiva todos los puntos clave de construcción geométrica.
- **Suite de Pruebas Automatizadas**:
  - Incorporada la suite de validación `test-unified-grid-snapping.ts` cubriendo la atracción magnética concurrente en grillas ortogonales, isométricas y axonométricas.

---

## [0.91.0] - 2026-10-18

### 🚀 Added / 🛠️ Enhanced
- **Relocalización de la Píldora Contextual Mini-HUD (`SelectionMiniHud`)**:
  - Se reubicó el panel flotante de modos (`[ ✥ Mover | ⤢ Escalar | ⟳ Rotar ]`) fuera del overlay SVG del lienzo para desacoplarlo por completo del borde superior del bounding box.
  - El Mini-HUD ahora se ancla directamente dentro del contenedor del área de trabajo (`#canvas-container`), centrado horizontalmente justo por debajo de la regla superior (`.ruler-top-container`).
  - **Experiencia de edición sin colisiones**: Elimina completamente la obstrucción visual y el secuestro de clics sobre vértices, nodos superiores y tangentes Bézier que antes quedaban cubiertos por el badge sobre el marco de selección.
  - Implementado como un elemento DOM HTML con aceleración de hardware, estética de vidrio esmerilado Figma (`backdrop-filter: blur(12px)`), tokens de diseño dual (Dark/Light) y sincronización reactiva de estado activo para herramientas de Selección (`SelectToolHandler`) y Nodos (`NodeToolHandler` / `NodeSubgroupTransformController`).
  - Detección automática de reglas: en modo sin reglas (`.no-rulers`), se posiciona con un margen limpio de 8px en la parte superior del canvas.

---

## [0.90.0] - 2026-10-18

### 🚀 Added
- **Borde Mínimo Hairline (`vector-effect="non-scaling-stroke"`)**:
  - Al dibujar cualquier vector (Pluma Bézier, Polilínea o Formas paramétricas), el borde se inicializa por defecto en "mínimo" (`vector-effect="non-scaling-stroke"`, `stroke-width="1"`), asegurando un trazo visualmente constante de exactamente 1px de dispositivo sin importar el nivel de zoom o escala del viewBox.
  - Se añadieron tres botones paso a paso en el panel de propiedades (`StrokeInspector`): `[-]`, `[+]`, y `[min]`.
  - El botón `[min]` activa instantáneamente el modo de borde mínimo ("hairline") y resalta visualmente en el inspector.
  - Al hacer click en `[-]` estando en mínimo, la propiedad transiciona a `0` (sin borde / `stroke="none"`).
  - Al hacer click en `[+]` estando en mínimo, la propiedad transiciona a `1` (borde de 1px con escalabilidad estándar).
  - Al hacer click en `[-]` desde `1`, el grosor desciende elegantemente a `min`.
- **Restricción Angular a 15° con Shift en Dibujo y Desplazamiento**:
  - Al dibujar con la Pluma Bézier (`PenToolHandler`), Línea (`ShapeToolHandler`), o Polilínea (`PolylineToolHandler`), mantener presionado <kbd>Shift</kbd> restringe la ubicación del nuevo nodo a los ejes ortogonales X e Y, y a incrementos angulares discretos de 15° (0°, 15°, 30°, 45°, 60°, 75°, 90°, etc.).
  - Al manipular tiradores y tangentes Bézier durante la creación con pluma, mantener presionado <kbd>Shift</kbd> restringe el ángulo de los manejadores simétricos o asimétricos a múltiplos de 15°.
  - Al desplazar o mover elementos seleccionados en el lienzo (`TranslateInteraction`) con <kbd>Shift</kbd>, el desplazamiento se bloquea con precisión en rayos de 15°, garantizando alineación horizontal, vertical o diagonal sin desvíos.
  - Soporte homólogo en el editor de nodos (`NodeToolHandler`) para traslación individual y múltiple de vértices y manejadores.

---

## [0.89.1] - 2026-10-18

### 🛠️ Fixed
- **Persistent In-DOM Color Picker Popover (`ColorPickerPopover`)**:
  - Replaced native `<input type="color">` across all inspectors with a custom, in-DOM Figma-styled color picker popover to resolve the VS Code webview focus-stealing bug where color dialogues immediately closed or dismissed upon clicking.
  - The picker popover now stays open continuously while selecting colors, dragging in the 2D Saturation-Value box, adjusting the Hue or Alpha sliders, picking colors with the Eyedropper API, or typing Hex codes. It closes exclusively when clicking outside the popover or pressing <kbd>Escape</kbd>.
  - Protected inspector DOM from reactive canvas destruction during real-time color dragging by guarding `WorkspaceLayoutService.render()` with `ColorPickerPopover.isOpen()`.
  - Harmonized color picking across Fill, Gradient Stops, Stroke, Multi-Stroke Layers, Batch Selection, Canvas Background, CurrentColor, Drop/Inner Shadows, Guides, Grids, and Global Swatches.

---

## [0.89.0] - 2026-10-18

### 🚀 Added
- **Figma Studio Design System & Dual-Theme (`figma-ux-ui`)**:
  - Full native support for Dark and Light modes using the canonical Figma achromatic design token architecture (`--figma-bg-deep`, `--figma-bg-canvas`, `--figma-bg-panel`, `--figma-bg-card`, `--figma-bg-select`, `--figma-border-subtle`, `--figma-brand`).
  - Added a circular theme toggle button (`#btn-theme-toggle`) in the status bar with custom, inline stroke 1.6 SVG Sun/Moon icons and persistent local storage caching via `ThemeService`.
  - Micro-precision typography with active OpenType kerning (`font-feature-settings: "kern" 1`) and monospace tabular numerals (`--font-mono`: JetBrains Mono / SFMono / Menlo) across coordinates, zoom levels, ruler marks, and property inputs.
  - Quiet Chrome / Canvas First principle: removed saturated blue gradients (`#2563eb`/`#1d4ed8`) and heavy glow filters from toolbars and ruler corners, replacing them with flat, high-density Figma Blue accents (`#0d99ff`).
  - Layer Tree & Vector Explorer refinement: indented hierarchy with hover-revealed tools (`opacity: 0.4` -> `1.0`), clean selection accents, and Natural Title Case headers.
  - ViewBox artboard card elevation: crisp boundary contrast with subtle drop shadow (`box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25)`) differentiating artboard surfaces from the workspace canvas.

---

## [0.88.1] - 2026-10-18

### 🚀 Added
- **Storage Mode Choice Gate (`ImageStorageChoiceModal`)**: Added an interactive ingestion dialog prompted whenever an image is added via toolbar, drag-and-drop, or clipboard paste, allowing users to explicitly choose between:
  - *Linked Asset* (`./[svgName]_[id]_img.ext`): keeps SVG XML lightweight and portable with clean Git diffs.
  - *Embedded Data URI* (`data:image/...;base64`): creates a 100% self-contained standalone SVG.
  - *Save for Web Optimizer*: 1-click transition to granular dimension downscaling, color quantization, and compression.

### 🛠️ Fixed
- **Omnichannel Drag & Drop Interception**: Fixed an issue where dragging an image into the AntiDraw canvas caused VS Code to open the image in a new tab with the image preview plugin. Drag events (`dragenter`, `dragover`, `dragleave`, `drop`) are now captured at window root level in the capture phase, supporting both OS file drops (`File` blobs) and VS Code Explorer sidebar drops (`text/uri-list`).
- **Webview Relative Image Resolution & 404 Prevention**: Fixed broken image placeholder icon when saving linked relative assets (`./name.png`) by configuring `<base href>` in the webview head and providing an in-memory live asset resolver in `SvgDomRenderer`.
- **Image Bounding Box Hit-Testing**: Fixed an issue where `<image>` elements could only be selected by clicking their perimeter edges. `<image>` elements are now recognized as solid bodies in `HitTestService`, allowing instant selection and transformation when clicking anywhere inside their bounding box.
- **Canvas Click Flicker**: Resolved the flickering of broken image icons upon clicking anywhere on the document by eliminating 404 reload cycles during reactive canvas re-renders.
- **Local Test Scratch Artifacts**: Added `sample_test_*` to `.gitignore` and `.vscodeignore` to ensure temporary test assets never pollute repository commits or VSIX package bundles.

---

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
