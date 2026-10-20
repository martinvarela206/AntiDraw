# Changelog — AntiDraw

All notable changes to the "AntiDraw" extension will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.94.1] - 2026-10-20

### 🛠️ Fixed
- **Canvas Interaction Controller Routing for Smart Fill (`smartFill`)**:
  - Registered `smartFillToolHandler` as an active member in `CanvasInteractionController`.
  - Linked pointer events (`onPointerDown`, `onPointerMove`, `onPointerUp`) and cancellation/lost-focus sequences directly to `SmartFillToolHandler`, enabling interactive click-to-fill synthesis of enclosed planar regions into pure `<path>` elements.
  - Added real-time hover region preview overlay with ephemeral dashed highlights (`vectorEffect="non-scaling-stroke"`, `pointer-events="none"`), powered by lazy planar face caching in `SmartFillToolHandler` to maintain 60–120 FPS cursor tracking without layout thrashing.
  - Implemented `SmartFillEngine.findRegionAtPoint`, `SmartFillEngine.regionToVertices`, and `SmartFillEngine.compileRegionD` for reusable analytical planar region lookup and path compilation.

### 🚀 Added
- **Topology Tools Fallback Handling & Quick Help Localization**:
  - Handled in-development topology tools (`scissors`, `knife`, `eraser`, `shapeBuilder`) in `CanvasInteractionController` with `not-allowed` pointer cursor and non-intrusive bilingual toast notices (`toolbar.toolInDevelopment`).
  - Added bilingual quick help reference guides for `smartFill` in both Spanish and English under `QuickHelpInspector`.
  - Added automated test suites 6 & 7 in `scripts/test-smart-fill.ts` verifying real-time hover preview generation, cache cancellation, and full controller event routing.

---

## [0.94.0] - 2026-10-19

### 🚀 Added
- **Direct Bézier Segment Bending & Interactive Curvature Manipulation**:
  - `NodeEditorTool.calculateSegmentT`: Analytical parametric proximity calculation mapping mouse click coordinates to curve parameter $t \in [0.05, 0.95]$ along cubic Bézier splines and linear segments.
  - `NodeEditorTool.bendSegment`: Direct curvature deformation of path segments without touching tangents manually. Distributes deflections dynamically to `v1.handleOut` and `v2.handleIn` using Bernstein polynomial weighting based on $t$, ensuring smooth, stable deformation.
  - **On-the-fly Straight Line Auto-Conversion**: Dragging any linear segment (`command === 'L'`) automatically synthesizes cubic Bézier handles at $1/3$ and $2/3$ chords and bends the curve seamlessly. Enables rapid silhouette vectorization workflows (blocking coarse polygons with Pen tool `P` and molding smooth organic curves with Node tool `N`).
  - **Contextual Drag Disambiguation**:
    - When clicking an unselected segment: direct Bézier bending mode is activated (`activeHandle = 'segment-curve'`).
    - When dragging a segment whose bounding vertices were already selected: rigid solidary translation mode is activated (`activeHandle = 'segment'`).
    - Holding `Alt` immediately toggles and inverts this behavior on demand.
  - **Predictive Hover Cursor Feedback**:
    - Hovering over a manipulable segment displays a specialized curve-bend cursor (`CURVE_CURSOR`).
    - Hovering over pre-selected bounding vertices displays the rigid translation move cursor (`move`).
  - **Test Suite Expansion**: Added Test 10 in `scripts/test-node-editing-ux.ts` verifying parametric $t$ calculations, symmetric midpoint deflections, and near-endpoint differential tangent weighting.

---

## [0.93.6] - 2026-10-19

### 📚 Documentation
- **Purge Absolute Disk Links & Replace with Relative Paths**:
  - Corrected `README.md` license link from local filesystem URI (`file:///d:/...`) to relative repository link `[LICENSE](LICENSE)`.
  - Standardized internal documentation references across `Docs/PRD.md`, `Docs/TODO.md`, `Docs/Plan-Implementacion.md`, `Docs/Brief-Diseno-UI.md`, `Docs/Catálogo de Iconos y Herramientas.md`, and `Docs/VectorCraft MDWiki/10-Analisis-Herramientas-y-Propiedades-VectorCraft-vs-AntiDraw.md` to use clean relative paths instead of absolute local file URIs.

---

## [0.93.5] - 2026-10-18

### 🛠️ Fixed
- **Exact Analytical Bézier Curve Extrema in Bounding Box Calculation**:
  - `BoundingBoxCalculator.getPathBoundingBox`: Implemented analytical calculus-based extrema determination for cubic Bézier curve segments by solving $B'(t) = 0$ for $t \in (0, 1)$ across both dimensions ($X$ and $Y$).
  - Incorporated convex hull property optimization ($B(t) \in \text{ConvexHull}(P_0, P_1, P_2, P_3)$) to bypass derivative root computations whenever control handles lie within the current anchor $[\min, \max]$ boundaries, maintaining sub-millisecond execution.
  - Eliminated false-rejections in `HitTestService` where clicks on curve peaks protruding outside the anchor nodes were prematurely discarded by early AABB checks. Users can now click, select, and manipulate paths with outward-bulging Bézier curves directly on their outer lobes.
  - Aligned selection gizmos and bounding box handles with the exact visual contour and mathematical extrema of curved shapes.
- **Dynamic VSIX Installer Script**:
  - Updated `install.bat` with automated wildcard resolution (`antidraw-*.vsix`) to seamlessly install the latest compiled version without requiring manual version edits.

---

## [0.93.4] - 2026-10-18

### 🛠️ Fixed
- **Eliminate `command === 'C'` False Positives on Straight Segments**:
  - `NodeEditorTool.isSegmentCurved`: Completely removed erroneous checking of `v2.command === 'C'`. In SVG paths and vector graphs, vertex commands indicate import metadata; a segment is mathematically and geometrically curved if and only if control handles exist on that specific segment (`v1.handleOut || v2.handleIn`).
  - Clicking any straight segment that shares a node with an adjacent curve now reliably displays **`[ To Bézier Curve ]`** (`[ A Curva Bézier ]`), allowing immediate curve conversion without false curve detections.
- **Topological Segment Target Resolution & Mixed Segment Detection (`Mixed Segments`)**:
  - `NodeEditorTool.getTargetSegmentIndices`: When non-adjacent or isolated nodes are selected (e.g. 4 opposite corners), incident segments (both incoming and outgoing) for all selected vertices are gathered.
  - When selection spans both straight and curved segments, the Property Panel displays the disabled state **`[ Mixed Segments ]`** (`[ Segmentos Mixtos ]`), preventing ambiguous conversions.
  - `NodeToolHandler.getTargetSegmentIndices`: Unified segment resolution by delegating directly to `NodeEditorTool.getTargetSegmentIndices`, guaranteeing single-source-of-truth parity between inspector state and tool execution.
- **Reactive Node Inspector Synchronization on Vertex Switching**:
  - Introduced `lastRenderedVertexId` in `PropertyPanel` to ensure switching between different vertices completely reconstructs contextual segment actions and Bézier handle rows, while preserving 60fps in-place DOM mutation during active node dragging.

---

## [0.93.3] - 2026-10-18

### 🛠️ Fixed
- **Strict Bézier Handle Isolation on Segment Selection**:
  - Selecting a path segment in the node editor now restricts display and rendering of Bézier handles exclusively to those belonging to the active segment (`v1.handleOut` and `v2.handleIn`).
  - Eliminated handle leakage where neighbor or adjacent vertices not belonging to the segment rendered outside handles. Selecting a straight segment renders zero handles along that chord.
- **Topological Segment Conversion Evaluation and Mixed Segment State**:
  - `NodeEditorTool.getSegmentConversionState`: Evaluates active segment state or segments spanned by selected vertices rather than checking whether an individual node has outgoing handles towards unselected chords.
  - Selecting a straight segment displays `[ To Bézier Curve ]`, allowing conversion to curve.
  - Selecting multiple nodes or segments with mixed states displays the disabled button `[ Mixed Segments ]`, preventing ambiguous mutations.
- **Homogeneous Multi-Segment Conversion**:
  - Converting multiple selected nodes where all intermediate segments are lines or all are curves converts all spanned segments uniformly and updates the inspector immediately.

---

## [0.93.2] - 2026-10-18

### 🛠️ Fixed
- **Figma Studio Dual-Theme (Dark & Light) Styling for Node Actions and Segment Conversion**:
  - Added `.tool-btn` class and `.button-group` container in `main.css` utilizing Figma Studio dual-theme design tokens (`--figma-bg-input`, `--figma-border-subtle`, `--figma-text-primary`, `--figma-bg-hover`, and `--figma-brand`).
  - Removed unstyled inline backgrounds that caused white-on-white text in dark mode or misaligned boxes.
  - Replaced Unicode glyphs with clean, scalable SVG vector icons for `Close Curve (Z)`, `To Straight Line`, and `To Bézier Curve`, ensuring crisp rendering across Dark and Light themes without platform emojis.

---

## [0.93.1] - 2026-10-18

### 🛠️ Fixed
- **Detection and Priority for Sub-2px Bézier Handles Adjacent to Segments**:
  - Removed artificial `handleLen >= 2` restriction that discarded handles shorter than 2 coordinate units, unblocking handle selection in precision paths or compact viewBoxes (e.g. 64x64, 48x48, 32x32).
  - Implemented generous hit radius for Bézier handles (`effHandleRadius = 16 / z`) against tighter segment tolerance (`8 / z`), ensuring clicks on or near handles lying directly on segment chords always select and drag handles without segment hijacking.
  - Hover cursor synchronization (`CanvasInteractionController`): prioritizes pointer cursor over Bézier handles even when coincident with segment paths.

---

## [0.93.0] - 2026-10-18

### 🚀 Added / 🛠️ Enhanced
- **Concurrent Node Selection on Segment Click**:
  - Clicking any path segment with the node tool selects both boundary vertices delimiting the segment simultaneously instead of just one.
  - Internal marquee selection and node count reflect dual selection (`selectedCount = 2`), enabling immediate contextual segment operations.
- **Absolute Priority of Bézier Handles over Segments**:
  - Resolved interaction collision where dragging a Bézier handle coincident with or adjacent to a path was hijacked by segment detection (`hitTestSegment`), dragging the entire segment and both nodes.
  - Universal prioritized handle hit-testing (`hitTestVertices` with extended handle checks) runs before segment evaluation, guaranteeing smooth, precise tangent manipulation.
- **Coordinated Segment Conversion and Node Types (`asymmetric`)**:
  - Converting a segment to Bézier Curve (`convertSegmentToCurve`) updates both endpoint vertices from `sharp` to `asymmetric`, creating tangential handles projected proportionally along the chord.
  - Reverting to straight line (`convertSegmentToLine`) removes corresponding handles and restores `sharp` corner type if no other tangents remain.
- **High-Precision Numerical Inputs for Bézier Handles and Vertices**:
  - Added numerical coordinate fields in Property Panel (`NodeInspector`) to inspect and calibrate absolute handle coordinates: `In X`, `In Y`, `Out X`, and `Out Y`.
  - Active vertex `Position X` and `Position Y` inputs are fully bidirectional with keyboard confirmation (`Enter`, `change`).
  - Reactive 60fps updates without disrupting active input focus (`activeElement`).
- **Contextual Segment Conversion Button and Node Actions Polish**:
  - Property Panel displays a single contextual button according to active segment state: `[ To Bézier Curve ]` when straight, or `[ To Straight Line ]` when curved.
  - Polished `Node Actions` section: removed plain `✓ (cerrado)` text and standardized actions into consistent button grid with SVG icons and shortcuts (`Close Curve (Z)`, `Split Node`, `Join Nodes (Ctrl+J)`).
- **Automated Test Suite**:
  - Created `test-node-editing-ux.ts` (suite 37) validating dual-node segment selection, handle hit-test priority, symmetric/asymmetric conversion, and inspector markup.

---

## [0.92.0] - 2026-10-18

### 🚀 Added / 🛠️ Enhanced
- **Unified Multi-Target Magnetic Grid Snapping (`SnappingEngine`)**:
  - Unified grid snapping across orthogonal, isometric, and axonometric grids to simultaneously snap across all 3 essential target types without toggling modes:
    1. **Point 1 (Intersections)**: Analytical crossing of grid lines (orthogonal lines, isometric ±30° diagonals, axonometric ±45° diagonals, and vertical axes).
    2. **Point 2 (Cell Centers)**: Center of gravity / midpoint of mesh cells or diamonds.
    3. **Point 3 (Segment Midpoints)**: Exact midpoints of every segment bounding grid cells (horizontal, vertical, and diagonal lines).
  - Supports continuous magnetic sliding along grid lines when cursor is not directly near a vertex or cell center.
- **UI Simplification and Cleanup**:
  - Removed manual, redundant snap mode toggles ("Line (0,0)" and "Cell (0,0)") from both status bar (`AppLayoutManager`) and property inspectors (`CanvasInspector`, `RulerGuideInspector`).
  - Activating grid snapping frictionlessly covers all key geometric construction points.
- **Automated Test Suite**:
  - Added `test-unified-grid-snapping.ts` validating concurrent snapping across orthogonal, isometric, and axonometric grids.

---

## [0.91.0] - 2026-10-18

### 🚀 Added / 🛠️ Enhanced
- **Relocation of Contextual Mini-HUD Pill (`SelectionMiniHud`)**:
  - Repositioned floating mode pill (`[ ✥ Move | ⤢ Scale | ⟳ Rotate ]`) outside canvas SVG overlay to completely decouple it from bounding box top edge.
  - Mini-HUD anchors directly inside workspace container (`#canvas-container`), centered horizontally right below top ruler (`.ruler-top-container`).
  - **Collision-free editing**: Eliminates visual obstruction and click hijacking over top vertices and Bézier handles previously covered by badge.
  - Implemented as hardware-accelerated HTML DOM element with Figma frosted glass styling (`backdrop-filter: blur(12px)`), dual tokens (Dark/Light), and reactive state sync for Selection (`SelectToolHandler`) and Node (`NodeToolHandler` / `NodeSubgroupTransformController`) tools.
  - Automatic ruler detection: in rulerless mode (`.no-rulers`), cleanly offsets 8px from top of canvas.

---

## [0.90.0] - 2026-10-18

### 🚀 Added
- **Hairline Minimum Stroke (`vector-effect="non-scaling-stroke"`)**:
  - Vector creation (Bézier Pen, Polyline, Parametric Shapes) initializes stroke by default to "minimum" (`vector-effect="non-scaling-stroke"`, `stroke-width="1"`), ensuring a constant visual 1px stroke regardless of zoom level or viewBox scale.
  - Added three-step stepper buttons in Property Panel (`StrokeInspector`): `[-]`, `[+]`, and `[min]`.
  - `[min]` button instantly activates minimum hairline stroke with active visual highlight.
  - Clicking `[-]` from minimum transitions to `0` (`stroke="none"`).
  - Clicking `[+]` from minimum transitions to standard scalable 1px stroke.
  - Clicking `[-]` from `1` smoothly steps down to `min`.
- **15° Angle Constraints with Shift on Drawing and Translation**:
  - Holding <kbd>Shift</kbd> during Bézier Pen (`PenToolHandler`), Line (`ShapeToolHandler`), or Polyline (`PolylineToolHandler`) creation constrains next node placement to orthogonal X/Y axes and discrete 15° radial increments (0°, 15°, 30°, 45°, 60°, 75°, 90°, etc.).
  - Holding <kbd>Shift</kbd> while manipulating Bézier handles constrains symmetrical/asymmetrical tangents to 15° multiples.
  - Holding <kbd>Shift</kbd> during canvas element translation (`TranslateInteraction`) locks movement to 15° rays, ensuring horizontal, vertical, or diagonal alignment without drift.
  - Homologous support in Node Editor (`NodeToolHandler`) for single and multi-vertex/handle translation.

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
