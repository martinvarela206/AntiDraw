# Changelog — AntiDraw

All notable changes to the "AntiDraw" extension will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.103.33] - 2026-11-12

### 💉 Surgical SVG In-Place Editing & Foreign Namespace Preservation
- **Surgical SVG In-Place Modifier (`SurgicalSvgModifier.ts`)**:
  - **In-Place DOM Mutation**: Built a targeted patching engine that preserves existing XML document layout, indentation, XML comments (`<!-- ... -->`), and the exact attribute ordering of untouched elements.
  - **Foreign Namespace & Metadata Retention**: Preserves third-party namespace declarations and attributes (`xmlns:inkscape`, `xmlns:sodipodi`, `inkscape:label`, `sodipodi:nodetypes`, `sketch:type`, `figma:id`) without stripping them upon save or serialization.
  - **Lossless `currentColor` Restoration**: Restores original `currentColor` fill and stroke presentation attributes tracked via `data-original-fill` / `data-original-stroke` during deserialization, while sanitizing proprietary internal attributes prior to export.
  - **Surgical Element Deletion & Insertion**: Cleanly synchronizes newly drawn elements and deleted paths directly against the source XML DOM tree structure without rewriting untouched nodes.
  - **Automated Test Coverage**: Added test suite `test-surgical-svg-editing.ts` (Suite 76) with 5 assertions covering comment preservation, external namespace retention, untouched attribute formatting preservation, `currentColor` restoration, and structural synchronization.

---

## [0.103.32] - 2026-11-12

### 🔄 Canonical XML Tree Comparator & Round-Trip SVG Corpus Verification
- **Deterministic Canonical XML Tree Comparator (`CanonicalXmlComparator.ts`)**:
  - **Attribute Order Invariance**: Implemented attribute canonicalization sorting attribute keys deterministically and filtering ignorable transient attributes.
  - **Floating-Point & Coordinate Resilient Matching**: Integrated numerical epsilon tolerance ($\pm 0.05$) across scalar attributes, viewBox bounds, and affine transform components.
  - **SVG Path (`d`) Command Equivalence**: Built path tokenization decomposing commands and coordinate streams to verify geometric identity independent of spacing differences.
  - **W3C, Lucide & Heroicons Round-Trip Verification**: Added automated test suite `test-roundtrip-canonical-corpus.ts` (Suite 75) verifying 5 assertions ensuring fixed-point serialization round-trips ($S_1 \equiv S_2$) across standard W3C geometric primitives, Lucide stroke-centric icons, Heroicons complex paths, hierarchical groups, and defs/gradients.

---

## [0.103.31] - 2026-11-12

### 🎨 Extended CSS Transformations, Variable Expansion & currentColor Cascading
- **CSS Stylesheet Parsing & Scoped Selector Matching (`CssStyleResolver.ts`)**:
  - **Internal `<style>` Parser**: Extracted stylesheet definitions across root and `<defs>` blocks, supporting element tag selectors (`rect`, `path`), class selectors (`.icon`), compound selectors (`rect.icon`), and ID selectors (`#id`) weighted by standard CSS specificity calculations.
  - **CSS Custom Property (`var(...)`) Expansion**: Added recursive CSS variable resolution supporting nested variables and fallbacks (`var(--primary, var(--fallback, #10b981))`) in presentation attributes and transforms.
  - **Cascading `currentColor` Resolution**: Implemented standard W3C `currentColor` inheritance through root `<svg>` and container `<g>` hierarchies, resolving computed color values on child elements while lossless preserving `data-original-fill` / `data-original-stroke` markers.
  - **Composite CSS + Inline Transform Normalization**: Enabled canonical unitless normalisation (`SvgDeserializer.normalizeTransform`) for transforms defined in CSS classes, inline styles, or combined cascading sequences.
  - **Automated Test Coverage**: Added test suite `test-css-transforms-variables-currentcolor.ts` (Suite 74) verifying 5 assertions covering class transforms, CSS variable expansion, nested fallbacks, currentColor container cascades, and composite transform specificity.

---

## [0.103.30] - 2026-11-12

### 📐 Analytical Schneider Curve Segmentation & Corner Detection
- **Adaptive Curve Segmentation & Corner Preservation (`SchneiderFit.ts`)**:
  - **Analytical Corner Detection**: Added `detectCornerIndices()` analyzing consecutive unit tangent direction vectors and angular changes ($\ge 60^\circ$) alongside local curvature extrema clustering, robustly pinpointing sharp $G^0$ cusps in digitized point streams.
  - **Partitioned Multi-Span Curve Fitting**: Upgraded `fitCurveWithCorners()` to partition input point chains across detected corner points, executing independent Schneider cubic fits per segment with unconstrained, decoupled tangents at corner boundaries to eliminate artificial corner rounding and over-smoothing.
  - **Scale-Adaptive Fit Tolerance**: Introduced `resolveAdaptiveTolerance(baseTolerance, zoom, scale)` dynamically scaling error thresholds ($\text{baseTolerance} / (\text{zoom} \times \text{scale})$) down to sub-pixel accuracy (0.5px) during high-zoom editing and relaxing tolerance during zoomed-out drawing.
  - **Automated Test Coverage**: Added test suite `test-schneider-corner-segmentation.ts` (Suite 73) verifying 5 assertions covering angular corner detection on sharp bends, noise suppression on smooth curves, corner preservation vs. traditional single-span fits, and zoom-dependent adaptive tolerance scaling.

---

## [0.103.29] - 2026-11-12

### ⚡ Quantitative Performance Budgets & Automated Verification
- **Rigorous Automated Quantitative Performance Budgets (`scripts/benchmarks.ts` & `test-quantitative-performance-budget.ts`)**:
  - **60 FPS Interactive Frame Budget (5,000 Vector Nodes)**: Verified that interactive frame operations (spatial broad-phase hit-testing, marquee selection, viewport culling) on a dense document with 5,000 vector nodes consistently execute in $\le 0.005$ ms, far below the $16.6$ ms 60 FPS frame threshold.
  - **1 MB SVG Document Deserialization (< 300 ms)**: Verified that full parsing, XML sanitization, and model rehydration of a realistic 1.01 MB SVG document (8,000 path elements) executes in $\approx 180$ ms, comfortably satisfying the sub-300ms budget.
  - **Incremental DOM Diffing Latency (< 5 ms)**: Verified that dirty-flag incremental diffing across 1,000 vector elements executes in $< 1$ ms on frame mutations.
  - **Automated Test Coverage**: Added test suite `test-quantitative-performance-budget.ts` (Suite 72) verifying 4 assertions covering 5,000-node spatial index builds, 60 FPS interactive frame latency, 1 MB SVG parsing latency, and incremental DOM diffing latency.

---

## [0.103.28] - 2026-11-12

### ⚡ Incremental DOM Diffing Renderer
- **Selective Incremental SVG DOM Diffing (`SvgDomRenderer` & `VectorModel`)**:
  - **In-Place Attribute Diffing**: Refactored `SvgDomRenderer` to eliminate global `svgCanvas.innerHTML = ''` DOM destructions on every frame. Implemented selective incremental diffing matching elements by ID and patching only mutated attributes in-place.
  - **Dirty Flag Tracking**: Added `dirty?: boolean` tracking on `VectorElement` alongside `markElementDirty`, `markAllDirty`, and `clearDirtyFlags` in `VectorModel`. Unchanged elements with `dirty === false` skip all DOM mutations, reducing per-frame paint overhead by over 90% on dense canvases.
  - **Direct Element Projection**: Replaced intermediate XML serialization / HTML parsing during full mounts with direct DOM projection using `document.createElementNS`, removing parsing bottlenecks.
  - **Orphan Node Pruning**: Automatically prunes deleted DOM nodes while preserving persistent canvas nodes (`__artboard_bg__`).
  - **Automated Test Coverage**: Added test suite `test-incremental-dom-renderer.ts` (Suite 71) verifying 5 assertions covering initial mount, clean-element mutation skips, in-place dirty updates, element creation, and orphan element removal.

---

## [0.103.27] - 2026-11-12

### ⚡ Analytical Layer L0 Bounding Box Cache
- **Analytical Geometric Caching & Forced Layout Thrashing Elimination (`BoundingBoxCalculator`)**:
  - **WeakMap Analytical Cache**: Implemented element-level bounding box caching via `WeakMap` with geometric vertex signature hashing, completely eradicating redundant polynomial extrema evaluations and vertex scans on static elements.
  - **Zero-DOM & Zero-Reflow Guarantee**: Maintained strict Layer L0 analytical boundary computations, eliminating synchronous browser layout readings (`getBBox` / `getBoundingClientRect`) and preventing layout thrashing during mouse movements, hover tests, and selection transformations.
  - **Dynamic Invalidation & Cache Stats**: Added fine-grained signature detection that invalidates stale bounding boxes when vertices, control handles, or tags mutate, alongside explicit eviction APIs (`invalidate`, `invalidateAll`) and telemetry counters (`hits`, `misses`).
  - **Group Bounds Reuse**: Accelerated `getGroupBoundingBox` by leveraging O(1) cache hits across constituent elements, dramatically speeding up multi-element selection bounding envelopes.
  - **Automated Test Coverage**: Added test suite `test-analytical-bbox-cache.ts` (Suite 70) verifying 5 assertions covering initial miss/compute, subsequent cache hit, mutation invalidation, explicit eviction, and group cache reuse.

---

## [0.103.26] - 2026-11-12

### 📐 Robust Bézier Projection & High-Order Convergence
- **Hybrid Sampling + Bounded Newton-Raphson Projection (`BezierProjection` & `EdgeSnappingService`)**:
  - **Global Convergence Architecture (`BezierProjection`)**: Engineered 3-phase hybrid solver combining global Bernstein uniform interval sampling across $[0, 1]$ (to isolate the global minimum basin of attraction) with second-order Newton-Raphson root finding on $g(t) = (B(t) - P) \cdot B'(t) = 0$.
  - **Analytical Derivatives & Backtracking Line Search**: Implemented exact first $B'(t)$ and second $B''(t)$ analytical derivatives paired with line search step-halving, preventing basin overshoot near inflection points and eliminating divergence.
  - **Boundary Guarding**: Guaranteed strict clamping against endpoints $t=0$ and $t=1$, eliminating NaN instability.
  - **Sub-Pixel Snapping & Meeting Calibration**: Refactored `EdgeSnappingService.projectPointToCubicBezier` to delegate to `BezierProjection`, achieving sub-pixel precision across edge snapping and the Bézier meeting intersection algorithm.
  - **Automated Test Coverage**: Added test suite `test-robust-bezier-projection.ts` (Suite 69) verifying 5 assertions covering analytical derivatives, linear degenerate projections, arch peak convergence, boundary clamping, and `EdgeSnappingService` delegation.

---

## [0.103.25] - 2026-11-12

### ⚡ Spatial Grid Broad-Phase Snapping & Intersection Acceleration
- **High-Performance Spatial Broad-Phase Acceleration (`SpatialGrid`, `SnappingEngine` & `IntersectionSnappingService`)**:
  - **Generic 2D Spatial Grid (`SpatialGrid<T>`)**: Created uniform spatial hashing index partitioning coordinate space into spatial buckets (cells) for O(1) point neighborhood queries and O(N) broad-phase candidate pair generation via `findOverlappingPairs()`.
  - **Accelerated Vertex Snapping (`SnappingEngine`)**: Added spatial broad-phase indexing when evaluating dense vertex clouds (>32 vertices), eliminating linear O(N) distance scans during live interactive snapping.
  - **Broad-Phase Curve Intersections (`IntersectionSnappingService`)**: Integrated spatial grid partitioning for segment bounding boxes in `collectAllIntersections`. Replaced quadratic nested loops with broad-phase overlapping pair discovery (`findOverlappingPairs`), drastically speeding up Path × Path intersection detection on complex documents.
  - **Automated Test Coverage**: Added test suite `test-spatial-snapping-acceleration.ts` (Suite 68) verifying 5 assertions covering insertion/removal/querying, broad-phase overlapping pairs, dense vertex snapping, crossing-path detection, and nearest point retrieval.

---

## [0.103.24] - 2026-11-12

### 📋 Resilient Multi-Flavour Clipboard
- **Multi-Flavour MIME Payload & Resilient Chromium Fallback Hierarchy (`ClipboardManager` & `ClipboardService`)**:
  - **Graceful Fallback Hierarchy**: Calibrated `ClipboardManager.copySelectionMultiFlavour` to attempt writing all standard flavours (`image/svg+xml`, `text/plain`, `text/html`, and `image/png`). If standard Chromium restrictions reject `image/svg+xml` in `ClipboardItem`, it automatically falls back to native Chromium flavours (`text/plain`, `text/html`, `image/png`), and further degrades to `writeText` SVG markup if `ClipboardItem` access is constrained.
  - **HTML Fragment Interoperability**: Wrapped HTML clipboard snippets in `<!--StartFragment-->...<!--EndFragment-->` comments to ensure seamless paste behavior across third-party graphic and word-processing applications (Figma, Inkscape, Word, Slack, Discord).
  - **Rich In-Memory Buffer Calibration**: Enhanced `ClipboardService` to track and stagger element-specific transformation pivots (`clipboardPivots`), ensuring geometric transform centers remain synchronized on subsequent staggered pastes.
  - **Automated Test Coverage**: Added test suite `test-resilient-clipboard.ts` (Suite 67) verifying 5 assertions covering isolated bounded SVG generation, full multi-flavour writes, Chromium fallback without `image/svg+xml`, `writeText` fallback, and internal pivot buffer staggering.

---

## [0.103.23] - 2026-11-12

### ⚡ Performance & Batch Synchronization Debounce
- **Deferred Document Serialization & Preview Debounce (`HostSyncService` & `Session`)**:
  - **Preview Gating (`beginPreview` / `commitPreview` / `cancelPreview`)**: Configured `HostSyncService` to defer full XML serialization and IPC messaging during interactive Preview sessions (dragging, transform handles, live geometry manipulation), ensuring consistent 60 FPS rendering without IPC message queue backpressure.
  - **Atomic Commit Flushing**: On pointerup or transaction completion (`commitPreview`), immediately flushes final document state to the extension host and resets debouncing timers.
  - **Rollback Safety**: On transaction abort or Escape (`cancelPreview`), discards pending serialization buffers without leaving dirty residual state.
  - **Debounced Viewport & Nudge Batching**: Implemented `syncToHostDebounced(delayMs)` for rapid-fire operations (such as arrow key nudging repeat), coalescing multiple mutations into a single debounced IPC commit.
  - **Automated Test Coverage**: Added test suite `test-batch-sync-debounce.ts` (Suite 66) verifying 5 assertions covering synchronous sync, preview coalescing, commit flushing, cancel rollback, and keyboard repeat batching.

---

## [0.103.22] - 2026-11-12

### 🔌 IPC Handshake, Monotonic Revision & Deduplication
- **Formal Ready Handshake & Monotonic Revision Sequencing (`IpcContracts`, `VsCodeBridge`, & `AntiDrawEditorProvider`)**:
  - **Formal Handshake Gating**: Configured `AntiDrawEditorProvider` to queue initial document broadcasts until receiving a verified `ready` handshake from the webview, eliminating race conditions on mount.
  - **Monotonic Revision Counter**: Added `revision: number` to `updateDocument`, `updateMetadata`, and `loadSvg`. The host process rejects stale or out-of-order updates (`revision < currentDocumentRevision`), preventing race-condition overwrites.
  - **Request Correlation & Deduplication**: Added `requestId: string` to all protocol messages. The host deduplicates identical request IDs within a rolling cache, preventing duplicated operations from re-broadcasts or event loops.
  - **Automated Test Coverage**: Added test suite `test-ipc-handshake-revision.ts` (Suite 65) verifying 5 assertions covering message schemas, handshake gating, monotonic revision incrementing, stale update rejection, and host deduplication.

---

## [0.103.21] - 2026-11-12

### ⌨️ Keymap & International Ergonomics
- **Centralized International Keymap Registry (`KeymapRegistry` & `KeyboardShortcutController`)**:
  - **Dual-Resolution Physical & Semantic Key Evaluation**: Evaluates both physical keyboard location (`event.code`, e.g. `KeyV`, `KeyA`) and semantic localized characters (`event.key`), ensuring seamless tool selection and shortcuts across US QWERTY, Spanish ISO, French AZERTY, and German QWERTZ layouts.
  - **Unified macOS Meta / Command (⌘) Normalization**: Implemented `KeymapRegistry.isCtrlOrMeta` to normalize Windows/Linux `Ctrl` and macOS `Cmd` (`e.metaKey`), ensuring standard VS Code keyboard shortcuts behave identically across operating systems.
  - **AltGr Character Collision Elimination**: Inspects `e.getModifierState('AltGraph')` to strictly filter out synthetic `Ctrl+Alt` events triggered by AltGr on Spanish, German, and European keyboards, preventing unintended command execution when typing characters like `[`, `]`, `{`, `}`, `@`, `#`, and `~`.
  - **Declarative Keybinding Centralization**: Wired `KeyboardShortcutController` into `KeymapRegistry`, delegating single-key tool switches, clipboard operations, z-order, node conversions, and nudging through `CommandRegistry`.
  - **Automated Test Coverage**: Added test suite `test-international-keymap.ts` (Suite 64) verifying 5 assertions covering dual-resolution matching, macOS Command key normalization, AltGr collision suppression, and controller command dispatch.

---

## [0.103.20] - 2026-11-12

### ⚙️ Build Infrastructure & Runtime Target Alignment
- **Dynamic Derivation of esbuild Compilation Targets from `engines.vscode` (`vscode-target-resolver.js`)**:
  - **Single Source of Truth**: Created `scripts/vscode-target-resolver.js` to dynamically map the minimum version defined in `package.json` -> `engines.vscode` (`^1.80.0`) to the exact Electron milestone, Node.js runtime (`node16`), and embedded Chromium version (`chrome108`).
  - **Extension & Webview Target Alignment**: Updated `esbuild.js` to enforce explicit target constraints for both contexts (`target: [targets.nodeTarget]` for extension host, `target: [targets.chromeTarget]` for webview), eliminating syntax incompatibility and execution panics on older supported VS Code installations.
  - **Comprehensive Milestone Mapping**: Configured table of VS Code milestones spanning v1.75 to v1.95+ with fallback defense against malformed engine strings.
  - **Automated Test Coverage**: Added test suite `test-build-target-alignment.ts` (Suite 63) verifying 6 assertions covering milestone mapping, engine parsing, fallback safety, and target application in `esbuild.js`.

---

## [0.103.19] - 2026-11-12

### ⚡ Performance & Webview Memory Optimization
- **Eliminated Webview RAM Leak & Implemented High-Efficiency State Persistence (`WebviewStateManager` & `getState`/`setState`)**:
  - **Eliminated `retainContextWhenHidden`**: Removed blind `retainContextWhenHidden: true` from `AntiDrawEditorProvider.register`, allowing VS Code to suspend and dispose background Chromium webview processes when tabs are hidden, drastically reducing workstation RAM consumption.
  - **Dedicated `WebviewStateManager` Service**: Created `WebviewStateManager` leveraging VS Code's native `getState()` and `setState()` primitives to store compact snapshots of document markup, viewport zoom, camera offset, and active metadata.
  - **Zero-Latency Tab Switch Restoration**: Wired `WebviewStateManager.restoreState()` into `AntiDrawApp.bootstrap()` and `HostSyncService.applyPayload`, enabling instant, flicker-free rendering upon switching back to an inactive tab without waiting for extension host IPC round-trip latency.
  - **Debounced Viewport Sync**: Synchronized viewport pan/zoom updates to persistent webview state with automatic debouncing to prevent serialization bottlenecks.
  - **Automated Test Coverage**: Added test suite `test-webview-state-persistence.ts` (Suite 62) verifying 4 assertions covering serialization, partial update merging, state clearing, and provider registration without `retainContextWhenHidden`.

---

## [0.103.18] - 2026-11-12

### 🎯 SVG Fidelity & Companion Schema Expansion
- **Expanded Companion Schema for Advanced Inspector Fidelity (`ElementMetadata` & Dynamic Shadow Filter Regions)**:
  - **Structured ElementMetadata**: Expanded companion elements schema in `IpcContracts.ts` and `VsCodeBridge.ts` to include typed sub-configurations: `dropShadow`, `innerShadow`, `blendConfig`, `patternLocks`, `markerConfig`, `appearanceStack`, and `customPivot`.
  - **Dynamic Filter Region Calculation**: Refined `SvgSerializer.compileElementFilters` to compute dynamic bounding margins (`pad = max(50, ceil(offset + 3*blur)*2)`) preventing clipping of large blurred drop shadows.
  - **Lossless Deserialization Rehydration**: Updated `SvgDeserializer` to rehydrate both legacy flat `data-*` dictionaries and structured `ElementMetadata` records into element attributes without data loss.
  - **Multi-Grid & Multi-Guide Persistent Configuration**: Supported typed arrays `CanvasGridConfig[]` and `CanvasGuideConfig[]` across workspace sync and storage.
  - **Automated Test Coverage**: Added test suite `test-expanded-companion-schema.ts` (Suite 61) verifying 4 assertions covering structured metadata, rehydration, dynamic filter regions, and multi-grid persistence.

---

## [0.103.17] - 2026-11-12

### 🎯 SVG Fidelity & Sidecar Integrity
- **Standardized Sidecar Versioning & Cryptographic Integrity (`.svg.json` & `SidecarIntegrityService`)**:
  - **Single Extension Standardization**: Unified companion metadata storage to `.svg.json` (resolving inconsistencies between `.json` and `.svg.json`) with seamless backward-compatible ingestion of legacy `.json` sidecars.
  - **Cryptographic SVG Hashing (SHA-256)**: Implemented deterministic SVG normalization and hashing in `SidecarIntegrityService.computeSvgHash`. Detects if an SVG document was modified externally (Illustrator, Inkscape, Figma, text editors).
  - **Safe Desynchronization Defense**: Discards obsolete companion element coordinates when cryptographic hashes diverge, preventing stale metadata injection and falling back safely to native W3C markup parsing and geometric shape re-detection.
  - **Versioned Envelope Schema (`schemaVersion: 1`)**: Standardized sidecar envelope holding `schemaVersion`, `svgHash`, and clean persistent `metadata`.
  - **Automated Test Coverage**: Added test suite `test-sidecar-integrity.ts` (Suite 60) verifying 7 assertions covering hashing, versioning, desynchronization detection, legacy fallback, and atomic persistence.

---

## [0.103.16] - 2026-11-12

### 🔌 VS Code Integration & Git Sanitation
- **Git Sanitation of Sidecar JSON & Volatile Workstation State (`SessionStateStorage`)**:
  - **Volatile State Decoupling**: Offloaded transient workstation session state (`zoom`, `cameraOffset`, `undoStack`, `redoStack`) from companion sidecar files to VS Code's native `workspaceState` memento.
  - **Zero-Noise Git Commits**: Restricts on-disk `.svg.json` sidecar files exclusively to persistent enriched shape metadata (appearance stacks, custom gradients, pivots, swatches, grids, guides). Navigating, panning, and zooming in an active file no longer creates noisy Git diffs or triggers false dirty states.
  - **Transparent Webview Hydration**: Automatically merges persistent disk metadata with session workstation state on document load, seamlessly preserving camera coordinates and undo history across editor activations.
  - **Automated Test Coverage**: Added test assertions to `test-custom-document-lifecycle.ts` (Suite 59) asserting volatile/persistent separation, workspace state persistence, and clean sidecar serialization.

---

## [0.103.15] - 2026-11-12

### 🔌 VS Code Integration & Document Lifecycle
- **Native CustomDocument Lifecycle & Hot Exit Support (`AntiDrawCustomDocument` & `AntiDrawEditorProvider`)**:
  - **Native Document Abstraction (`AntiDrawCustomDocument`)**: Transitioned from legacy `CustomTextEditorProvider` (reliant on synthetic text buffer replacements) to native `vscode.CustomEditorProvider<AntiDrawCustomDocument>`.
  - **Hot Exit & Crash Recovery (`backupCustomDocument` & `backupId`)**: Implemented full `backupCustomDocument` writing current in-memory container state to VS Code's backup destination. Seamlessly restores uncommitted drafts on startup via `openCustomDocument` when `openContext.backupId` is detected.
  - **Revert & External Synchronization (`revertCustomDocument`)**: Implemented `revertCustomDocument` to discard transient edits, reload committed state from disk, and broadcast `loadSvg` reload events to all registered webview panels.
  - **Accurate Dirty State Coordination (`onDidChangeCustomDocument`)**: Coordinated `CustomDocumentContentChangeEvent` emissions with webview edit messages (`updateDocument`, `updateMetadata`), giving VS Code precise control over editor dirty state, auto-save, and save confirmation dialogues.
  - **Automated Test Coverage**: Added test suite `test-custom-document-lifecycle.ts` (Suite 59) verifying 7 assertions covering custom document lifecycle, Hot Exit restoration, atomic saving, revert, and backup deletion callbacks.

---

## [0.103.14] - 2026-11-12

### 🎯 SVG Fidelity & Zero Corruption W3C
- **Namespaced Proprietary Attribute Purging (`data-antidraw-*` and Internal Editor Keys)**:
  - **Namespaced Attribute Delimitation**: Delimited attribute stripping strictly to AntiDraw internal namespaces (`data-antidraw-*`) and internal geometry/editor attributes (`data-shape`, `data-parametric`, `data-corner-*`, `data-ellipse-*`, `data-rect-*`, `data-star-*`, `data-blend*`, `data-marker-*`, etc.).
  - **Third-Party & W3C SVG 2 Data Attribute Preservation**: Legitimate SVG 2 `data-*` attributes from external tools and web frameworks (such as `data-name`, `data-testid`, `data-lucide`, `data-cy`, `data-custom-*`, or `inkscape:*`) are preserved 100% intact through deserialization and serialization round-trips.
  - **Automated Test Coverage**: Added test suite `test-namespaced-attribute-purge.ts` (Suite 58) verifying 3 assertions covering proprietary attribute purge, third-party preservation, and lossless round-trip serialization.

---

## [0.103.13] - 2026-11-12

### 🎯 SVG Fidelity & Zero Corruption W3C
- **Preservation of Opaque Elements (Zero-Corruption W3C Standard Compliance)**:
  - **Opaque Element Model Representation (`OpaqueElement`)**: Extended `VectorElement` with `isOpaque`, `shapeType: 'opaque'`, and `rawInnerXml`, guaranteeing that non-directly editable SVG nodes are preserved verbatim.
  - **Comprehensive Opaque Tag Coverage**: Integrated full deserialization preservation for `<defs>`, `<clipPath>`, `<mask>`, `<filter>`, `<pattern>`, `<marker>`, `<style>`, `<use>`, `<symbol>`, `<linearGradient>`, and `<radialGradient>`.
  - **100% Round-Trip Markup Fidelity**: Configured `SvgSerializer` to re-emit opaque elements preserving their exact original XML inner markup, eliminating silent corruption of complex filters, clip paths, and symbol definitions.
  - **Automated Test Coverage**: Added test suite `test-opaque-elements-fidelity.ts` (Suite 57) verifying 3 assertions covering clip path extraction, multi-tag ingestion, and round-trip serialization fidelity.

---

## [0.103.12] - 2026-11-12

### 🏛️ Architecture & Isomorphic Serialization
- **Isomorphic XML Parser Abstraction (IXmlParser & IsomorphicXmlParserFactory)**:
  - **Environment-Agnostic XML Parsing**: Decoupled `SvgDeserializer` from implicit browser `window.DOMParser` globals via `IXmlParser` contract.
  - **Dual-Engine Polymorphism**: Built `NativeBrowserXmlParser` for ultra-fast W3C standard parsing in webview runtime, and `HeadlessNodeXmlParser` for Node.js / CLI / automated test runners using `linkedom`.
  - **Dependency Injection & Global Override**: Supported direct parser injection into `SvgDeserializer.loadSvgString` as well as global test-harness configuration via `IsomorphicXmlParserFactory.setDefaultParser`.
  - **Automated Test Coverage**: Added test suite `test-xml-parser-abstraction.ts` (Suite 56) verifying 4 assertions covering factory resolution, headless fallback, custom parser injection, and global override mechanisms.

---

## [0.103.11] - 2026-11-12

### 🏛️ Architecture & Layer Assignment
- **Formal Layer Mapping for Orphan Modules (L0 - L4)**:
  - **Comprehensive Architectural Map**: Aligned `AntiDraw_Documento_Maestro_Vol1_Estrategia_y_Arquitectura.md` with the real layer locations of SVG serialization (`serialization/` L1/L2), native containers (`container/AdrwContainer` L1/L2), geometric snapping (`operations/snapping/` L1), cross-platform clipboard (`services/ClipboardService.ts` L3/L4), and interactive grids/guides (`ui/grid/` L4).
  - **Automated Structural Compliance**: Added test suite `test-orphan-modules-architecture.ts` (Suite 55) asserting strict documentation and structural layer alignment across the five architectural tiers.

---

## [0.103.10] - 2026-11-12

### 🏛️ Architecture & Transaction Lifecycle
- **Atomic Tool Transactions (ToolTransactionManager: Begin, Preview, Commit, Cancel)**:
  - **Monotonic Transaction Identifiers (`txId`)**: Formalized interactive tool sessions with unique identifiers (`tx_${toolType}_${timestamp}_${counter}`) allowing multi-step interactions to be tracked, correlated, and audited cleanly.
  - **Discriminated Transaction Lifecycle**: Enforced explicit four-phase interaction cycle (`Begin`, `Preview`, `Commit`, `Cancel`), guaranteeing that ephemeral preview shapes never leak into the undo stack or SVG DOM.
  - **Session Integration**: Connected `ToolTransactionManager` directly into `Session` and `ToolFactory`, dispatching transactional lifecycle actions and preserving base document snapshots on demand.
  - **Automated Test Coverage**: Added test suite `test-tool-transactions.ts` (Suite 54) verifying 7 assertions covering monotonic IDs, transient preview emissions, atomic commits, rollback cancellation, listener subscriptions, and audit history logging.

---

## [0.103.9] - 2026-11-12

### 🏛️ Architecture & Tool State Reducer
- **Deterministic Tool State Machine (ITool / ToolStateMachine) & 3-Tier Coordinate Projections**:
  - **Deterministic State Reducer (`ToolStateMachine`)**: Formalized tool interactions as a pure mathematical reducer `(State, Event) -> NextState` with typed events (`ACTIVATE`, `POINTER_DOWN`, `POINTER_MOVE`, `POINTER_UP`, `KEY_DOWN`, `KEY_UP`, `CANCEL`) and transition audit logging.
  - **High-Frequency Pointer Coalescence (`getCoalescedEvents`)**: Integrated sub-frame event coalescence across `CanvasInteractionController` and specialized handlers (`PenToolHandler`, `EraserToolHandler`, `SmartFillToolHandler`, `ShapeBuilderToolHandler`, `ScissorKnifeToolHandler`), eliminating jitter on high-refresh styluses and digitizers.
  - **3-Tier Canonical Coordinate Projections (`CoordinateSpaceTransformer`)**: Engineered analytical bidirectional projection pipeline bridging Screen Space (Client px) -> Document Space (viewBox world) -> Local Space (Object matrix).
  - **Automated Test Coverage**: Added test suite `test-tool-state-machine.ts` (Suite 53) verifying 12 assertions covering deterministic reducer transitions, keyboard tracking, 3-tier coordinate projections, and pointer coalescence extraction.

---

## [0.103.8] - 2026-11-12

### ⚡ Performance & State Management
- **Structural Sharing & Transactional Patch Engine (DocumentPatchEngine)**:
  - **Structural Sharing in DocumentState**: Implemented `DocumentState.createWithSharing()` and `freezeElement()`, maintaining object reference identity for unmodified elements and only allocating newly modified nodes, slashing GC pressure.
  - **Transactional Patches (DocumentPatchEngine)**: Added `DocumentPatchEngine` providing forward (`patches`) and inverse (`inversePatches`) operational deltas following RFC 6902-style operations (`add`, `remove`, `replace`) without full tree deep cloning.
  - **HistoryService Integration**: Upgraded `HistoryService` to record incremental delta patches alongside structural snapshots, facilitating high-frequency undo/redo operations with lightweight memory footprints.
  - **Automated Test Coverage**: Added test suite `test-document-patch-immutability.ts` (Suite 52) verifying 20 assertions covering structural reference preservation, bi-directional delta generation, patch replay, and undo stack integration.

---

## [0.103.7] - 2026-11-12

### 🏛️ Architecture & Migration Alignment
- **Migration Phases Dependency Alignment & VectorScene Decoupling**:
  - **Phase 1 Canonical VectorScene Contract**: Formally anchored `VectorScene` in Phase 1 (L0 pure in-memory scene graph) providing the canonical contract required by `CommandSpec` in Phase 2, resolving previous forward-dependency architectural paradoxes.
  - **Decoupled Schneider Curve Fitting**: Decoupled the scene graph adoption from `SchneiderFit.ts`, isolating cubic curve fitting as an independent geometry operation for Boolean CAG without blocking scene-graph migration.
  - **Hierarchical Group Support in VectorScene**: Enhanced `VectorScene.fromVectorElements` and `VectorScene.toVectorElements` with full recursive support for nested `<g>` group hierarchies.
  - **Automated Test Coverage**: Added test suite `test-migration-phases-alignment.ts` (Suite 51) verifying 15 assertions covering pure scene manipulation, command precondition evaluation, and bidirectional serialization fidelity.

---

## [0.103.6] - 2026-11-12

### 🛡️ Resilience & Fault Recovery
- **CrashGuard Resilience Hardening, Global Unhandled Rejection & Pointer Capture Release**:
  - **Global Promise Rejection Catch (`installGlobalHandlers`)**: Attached global window listeners for `unhandledrejection` and `window.error`, ensuring unhandled asynchronous exceptions in background pipelines never freeze or crash the webview canvas.
  - **Guaranteed Pointer Capture Release**: Implemented `IInteractionCleanup.releasePointerCapture()` executed automatically on any synchronous panic, async rejection, or global error, eliminating locked mouse pointers and frozen drags.
  - **Forced Interaction Flag Reset**: Enforced systematic resets of `isDragging`, `activeHandle`, and orphaned DOM overlay elements upon exception containment, restoring interactive responsiveness immediately.
  - **Automated Test Coverage**: Added test suite `test-crashguard-resilience.ts` (Suite 50) verifying 18 assertions of cleanup callbacks, async rejection handling, and global listener life-cycle management.

---

## [0.103.5] - 2026-11-12

### 🏛️ Architecture & Refactoring
- **Layer 3 / Layer 4 Inversion of Control in CrashGuard (`INotifier` Port)**:
  - **Strict Layer Decoupling**: Completely severed the compile-time dependency of Layer 3 (`CrashGuard`) on Layer 4 (`VsCodeBridge`) by defining the `INotifier` port (`showInfo`, `showError`, `showWarning`).
  - **Constructor & Static Port Injection**: Refactored `CrashGuard` (both in `engine/guard` and `services`) to accept any `INotifier` via constructor and static setters, enabling headless testability and execution without browser or VS Code host dependencies.
  - **Composition Root Binding**: Bound `VsCodeBridge.getInstance()` at the application composition root in `CoreServiceRegistry.ts`.
  - **Automated Test Coverage**: Added test suite `test-crashguard-inversion.ts` (Suite 49) verifying 15 assertions of synchronous/asynchronous fault containment and history rollback with mock notifiers.

---

## [0.103.4] - 2026-11-12

### 🛡️ Security & Hardening
- **XML Parser Hardening, Recursion Depth Limits & Anti-XXE/DoS Protection**:
  - **Anti-XXE & DoS Protection (`SvgSanitizer.stripDoctypeAndEntities`)**: Strips and neutralizes XML `<!DOCTYPE ...>` and `<!ENTITY ...>` declarations, preventing XML External Entity (XXE) attacks, local file disclosures, and quadratic/Billion Laughs entity expansion denial-of-service vulnerabilities.
  - **Recursion Depth Limiter**: Enforced maximum DOM traversal recursion limits (`maxDepth = 64`) across `SvgDeserializer.parseNode` and `SvgSanitizer.sanitizeNodeRecursive`, guarding the webview runtime against stack overflow attacks caused by adversarial deeply nested group hierarchies.
  - **Host Persistence Defense**: Added defense-in-depth checks inside `HostSaveValidator` rejecting any file containing external `SYSTEM`/`PUBLIC` entities or unstripped DOCTYPEs from disk persistence.
  - **Automated Test Coverage**: Added test suite `test-xml-parser-hardening.ts` (Suite 48) covering 13 assertions verifying DOCTYPE neutralization, recursion truncation, and anti-XXE rejection.

---

## [0.103.3] - 2026-11-12

### 🛡️ Security & Integrity
- **Strict Host Save Validation (`HostSaveValidator`) & Atomic Disk Write (`AtomicFileWriter`)**:
  - **Geometric Numerical Integrity**: Enforced strict pre-save validation guarding against corrupt tokens (`NaN`, `Infinity`, `-Infinity`, `undefined`, `[object Object]`) inside geometric attributes (`d`, `points`, `transform`, coordinates, dimensions).
  - **Catastrophic Loss & Wipeout Protection**: Added automated checks comparing incoming geometric node counts against previous file state, blocking sudden 100% wipeouts or anomalous drops (>85% node loss) caused by serialization errors or IPC glitches.
  - **Atomic File Replacement**: Implemented `AtomicFileWriter` using temporary file creation and atomic replacement (`fs.rename` with overwrite) with automatic cleanup on failure, guaranteeing zero file truncation or corrupted files on disk during power outages or process interrupts.
  - **Automated Test Coverage**: Added test suite `test-host-save-validator.ts` (Suite 47) verifying 20 assertions covering edge cases, attribute corruption, node drops, and atomic write rollback.

---

## [0.103.2] - 2026-11-12

### 🛡️ Security & Hardening
- **Environment Isolation & Hardened Content Security Policy (CSP)**:
  - **Restricted Mode & Untrusted Workspaces**: Formally declared `capabilities.untrustedWorkspaces.supported = true` with full 7-language localization parity in `package.json` and `package.nls.*.json`, guaranteeing secure operation inside VS Code Restricted Mode.
  - **Hardened Webview CSP**: Reinforced `<meta http-equiv="Content-Security-Policy">` with `connect-src 'none'`, `object-src 'none'`, and `form-action 'none'` alongside existing `nonce` script-src, neutralizing any potential outbound exfiltration or rogue plugin injection.

---

## [0.103.1] - 2026-11-12

### 🛡️ Security & Fixed
- **Bi-directional IPC Protocol Schema & Strict Contracts (`IpcContracts` & `IpcValidator`)**:
  - **Formal Schema Validation**: Implemented deterministic runtime validation and type guards for all messages flowing across the Webview-Host boundary (`validateWebviewToHost` and `validateHostToWebview`).
  - **Host Protection & Input Sanitization**: Guarded `AntiDrawEditorProvider` against malformed payloads and malicious IPC requests; restricted `openExternal` commands strictly to `http://` and `https://` URLs to prevent local file or shell scheme execution.
  - **Webview Defense**: Guarded `VsCodeBridge` against unverified host events and corrupted payloads before dispatching to model listeners.
  - **Automated Test Suite (`test-ipc-contracts.ts`)**: Added Suite 46 covering 18 validation assertions across all message types (100% pass across all 46 test suites).

---

## [0.103.0] - 2026-11-12

### 🛡️ Security & Added
- **Strict SVG Ingestion Sanitizer (`SvgSanitizer` - Zero-Trust Input Pipeline)**:
  - **Malicious Tag Purge**: Neutralizes and eradicates dangerous executable tags (`<script>`, `<foreignObject>`, `<iframe>`, `<embed>`, `<object>`, `<audio>`, `<video>`, `<applet>`, `<meta>`, `<link>`, `<form>`, `<input>`) on any imported SVG prior to ingestion into `VectorModel` or projection into Chromium DOM.
  - **Inline Event Handler Eradication (CWE-79 / Stored XSS Prevention)**: Automatically strips all attributes matching `/^on[a-z]+/i` (`onload`, `onclick`, `onerror`, `onmouseover`, `onfocus`) from all elements across the parsed XML document.
  - **Dangerous URI Scheme Neutralization**: Sanitizes `href`, `xlink:href`, and `src` attributes, eradicating `javascript:`, `vbscript:`, and `data:text/html` payloads while preserving local fragment anchors (`#id`), standard data URIs (`data:image/*`), and local relative assets.
  - **Stylesheet Boundary Protection**: Strips `@import` declarations and neutralizes executable `url(javascript:...)` references within `<style>` blocks.
  - **Automated Security Test Suite (`test-svg-sanitizer.ts`)**: Added Suite 45 to the test harness validating zero-trust ingestion and sanitization across 24 security assertions (100% pass across all 45 test suites).

---

## [0.102.0] - 2026-10-24

### 🚀 Added
- **Native Project Container (`.adrw`) & Infinite Canvas Artboards**:
  - **`AdrwProjectService`**: Engineered native project container format (`.adrw`) bundling infinite canvas viewport configurations, multi-artboard definitions (`ArtboardDef`), companion metadata, and W3C SVG vector definitions into an atomic JSON project architecture.
  - **Inkscape Multi-Page Ingestion (`<inkscape:page>`)**: Automatically parses Inkscape multi-page markup (`<inkscape:page x="..." y="..." width="..." height="..." inkscape:label="..."/>`) on SVG load, seamlessly mapping pages into native Artboards while maintaining exact coordinates, dimensions, and custom labels.
  - **Lossless W3C Multi-Artboard SVG Extraction**: Integrated pure, standards-compliant W3C SVG extraction (`extractArtboardSvg`, `extractAllArtboards`) stripping proprietary `data-*` attributes and editor metadata, generating production-ready vector graphics with tailored viewBox dimensions for each artboard.
  - **TopBar SVG Export Action**: Added dedicated `#btn-export-svg` action button in the Top toolbar enabling instant extraction and export of clean SVGs directly from the active project container.
  - **Non-Destructive SVG Ingestion & Dual Custom Editor Integration**:
    - Registered `antidraw.projectEditor` (`*.adrw`) with `priority: "default"` for instant one-click opening.
    - Maintained `antidraw.svgEditor` (`*.svg`) with `priority: "option"` via Right-Click -> "Open With".
    - When an `.svg` is opened, AntiDraw automatically generates/links a companion `.adrw` project container; all canvas edits are saved exclusively into the `.adrw` container, preserving the original `.svg` untouched from destructive writes.
  - **7-Language Localization Parity**: Synchronized `topbar.exportSvg` and `package.nls.*.json` project editor titles across English, Spanish, Simplified Chinese, German, French, Russian, and Japanese.
  - **Automated Test Suite (`test-adrw-container.ts`)**: Added Suite 44 validating container instantiation, Inkscape multi-page ingestion, auto-healing deserialization, and multi-artboard W3C SVG extraction (100% pass across all 44 test suites).

---

## [0.101.1] - 2026-10-24

### 🎨 Fixed & Improved
- **WCAG AAA Light Theme Contrast & Accessible Disabled State Visibility**:
  - **Luminance Token Calibration**: Elevated `--figma-text-secondary` in `[data-theme="light"]` from `#555555` to `#2d2d2d`, achieving strict **WCAG AAA** contrast ratios ($\ge 7:1$) on both panel backgrounds (`#ffffff`) and input elements (`#f5f5f5`).
  - **Tertiary & Muted Hierarchy**: Calibrated `--figma-text-tertiary` to `#545454` ($\ge 7:1$ on `#ffffff`) and `--figma-text-dim` to `#767676` ($\ge 4.5:1$).
  - **Accessible Inactive UI Elements**: Updated `.tool-btn:disabled` opacity from `0.35` to `0.52` with explicit `--figma-text-tertiary` coloring to eliminate washed-out controls while maintaining clear tactile deactivation.

---

## [0.101.0] - 2026-10-24

### 🚀 Added
- **Unified Vector Scissors & Knife Tool (`scissors` / <kbd>C</kbd>, <kbd>K</kbd>)**:
  - **ScissorKnifeEngine**: Implemented analytical straight bisecting cuts and continuous freeform curve carving with zero-gap planar half-space partitioning (`polygonClipping.intersection` across complementary bounding polygons), preserving 100% geometric area and exact seam coordinates.
  - **Mode 1 (Scissors / 2 Clicks)**: Allows users to click on an initial edge/node to project an elastic guideline, then click on a second boundary or point to sever closed vectors cleanly in two, or split open paths at intersection nodes.
  - **Mode 2 (Knife / Freehand Drag)**: Real-time freeform carving through shapes with live high-contrast trail rendering and automatic shape partitioning upon gesture release.
  - **Curve Smoothing (Douglas-Peucker & Schneider Bézier Fitting)**: Integrated curve smoothing slider (0% to 100%) in `ScissorInspector` to eliminate digitizer noise and reduce node counts on freehand cuts.
  - **Closed-Loop Cookie-Cutter Carving**: Drawing a closed loop inside a shape extracts an interior cutout piece while preserving the outer frame.
  - **Dedicated Scissor Inspector (`ScissorInspector.ts`)**: Real-time mode toggle (`Auto`, `2 Clicks`, `Drag`), smoothing slider with synced numeric input, and interactive shortcut hints.
  - **7-Language Localization Symmetry**: Complete `scissorInspector` translations across English, Spanish, Simplified Chinese, German, French, Russian, and Japanese.
  - **Automated Test Suite (`test-scissor-knife-tool.ts`)**: 6 comprehensive test suites covering Douglas-Peucker simplification, planar bisecting cuts, curved slicing, open-path splitting, cookie-cutter loops, and tool handler lifecycle (all 43 test suites passing at 100%).

---

## [0.100.0] - 2026-10-24

### 🚀 Added
- **Vector Eraser Tool (`eraser` / <kbd>Shift</kbd>+<kbd>E</kbd>) with Continuous Boolean Subtraction & Auto-Partitioning**:
  - **EraserEngine**: Implemented analytical constructive area subtraction (`polygonClipping.difference`) along swept continuous swaths.
  - **Dynamic Brush Tip Footprints**: Configurable brush tip shapes (**Circle** capsule and **Square** convex hull) with real-time size regulation (2px to 150px) via inspector slider or bracket hotkeys (<kbd>[</kbd> to decrease, <kbd>]</kbd> to increase diameter).
  - **Automatic Multi-Polygon Partitioning**: When the eraser slices through a closed vector from boundary to boundary, the engine automatically splits the shape into $N \ge 2$ independent closed `<path>` elements, preserving z-index stacking order, fills, strokes, gradients, and filters.
  - **Alt Swath Preservation**: Holding <kbd>Alt</kbd> during erasing synthesizes the erased path swath directly into the document as a new independent vector graphic.
  - **Dedicated Eraser Inspector (`EraserInspector.ts`)**: Integrated property panel controls for tip shape, size slider, and shortcut tips.
  - **Universal Multilingual Coverage**: Full localization across all 7 supported languages (`es`, `en`, `zh-cn`, `de`, `fr`, `ru`, `ja`) in both the property inspector and `QuickHelpInspector`.
  - **Comprehensive Automated Test Suite (`test-eraser-tool.ts`)**: 5 new test suites validating circular/square footprint generation, in-place subtraction, multi-part partitioning, Alt preservation, and pointer workflows (42/42 test suites passing at 100%).

---

## [0.99.3] - 2026-10-23

### 🐛 Fixed
- **Universal Internationalization & Localization across all 7 Supported Languages**:
  - **QuickHelp Inspector Native Coverage**: Added complete localized shortcut cheat sheets for German (`de`), French (`fr`), Russian (`ru`), and Japanese (`ja`) alongside English, Spanish, and Simplified Chinese across all 20 vector tools in `src/webview/ui/inspectors/quickHelp/`.
  - **Eliminated Binary Fallbacks**: Eradicated hardcoded `isEs ? '...' : '...'` ternaries across `PropertyPanel.ts`, `CanvasInspector.ts`, and `StrokeMarkerControls.ts`, routing all UI strings through `I18nService.t()` keys.
  - **Shape Defaults & Creation Shortcuts**: Replaced hardcoded English labels and modifiers in `ShapeDefaultsInspector.ts` with dedicated `shapeDefaults` i18n keys.
  - **Modal Dialogs Localization**: Internationalized `TransformNumericModal` and `ExportModal` dialogs with full multilingual support for dimensions, multipliers, resolution calculations, and buttons.
  - **Rulers, Guides, & Secondary Stroke Layers**: Localized ruler origin/scale inputs, guide inspector batch metrics, and multi-stroke layer control tooltips in `RulerGuideInspector.ts` and `StrokeLayersControls.ts`.
  - **100% Dictionary Symmetry**: Verified structural and key count parity across all 7 language dictionaries (`es.ts`, `en.ts`, `zh-cn.ts`, `de.ts`, `fr.ts`, `ru.ts`, `ja.ts`) passing all 41 automated test suites.

---

## [0.99.2] - 2026-10-23

### 🐛 Fixed
- **Shape Builder Tool Paralysis after Undo (<kbd>Ctrl+Z</kbd>)**:
  - Connected `HistoryService.onHistoryApplied` callback through `CoreServiceRegistry` directly to `shapeBuilderToolHandler.invalidate()`, clearing stale hovered states, swept segments, and cached subsegment IDs when restoring document state.
  - Added dynamic fallback in `ShapeBuilderToolHandler.refreshSubSegments()`: if `selectedElementIds` contains stale IDs from undone/synthetic elements, it automatically falls back to all trimable vector elements in `model.elements`.
  - Subsegments can now be trimmed, undone, and re-trimmed immediately without having to switch tools or click outside to deselect.
- **Continuous Open Path Synthesis on Self-Intersecting Polygons (`sample_test.svg`)**:
  - Resolved graph fragmentation ("comportamiento aberrante") where deleting a single subsegment from a self-intersecting polygon shattered it into 11-12 disconnected `<path>` fragments and erased its fills.
  - Implemented subpath-aware sequential run tracing in `SegmentTrimEngine.trimAndWeld()`: preserves the natural winding order of original subpaths across intact 4-way crossings ($k = 4$) while respecting true branch barriers ($k \ge 3$) when different elements meet.
  - Trimming 1 subsegment from a 10-vertex self-intersecting polygon now synthesizes exactly 1 continuous open path containing all remaining 21 subsegments.

---

## [0.99.1] - 2026-10-23

### 🐛 Fixed
- **Shape Builder Isolation & Collateral Damage Prevention**:
  - Filtered candidate elements with `SegmentTrimEngine.isTrimable()`: strictly excludes non-vector elements (`image`, `text`, `defs`, `style`, `g`) to prevent raster images from losing their boundaries or being destroyed.
  - Connected component scoping via `SegmentTrimEngine.findConnectedElementIds()`: trims and welds ONLY the elements physically connected to the deleted sub-segment graph. Unrelated shapes in the document remain 100% untouched and retain their exact properties and z-order.
  - In-place z-index replacement: replaces affected elements at their precise position in `model.elements` rather than pushing to the end.
- **T-Junction & Internal Sub-Stroke Detection**:
  - Implemented analytical T-junction projection and snapping in `SegmentTrimEngine.checkTJunction()`: detects when an internal branch or line endpoint meets another stroke within 1.5px tolerance, splits the touched stroke cleanly, and unifies incident nodes with valence $k=3$.
  - Deleting internal branches now preserves continuous closed contours without creating unintended holes or gaps.
- **Click vs Drag-Sweep Jitter Protection**:
  - Added a 5px screen drag threshold (`hasExceededDragThreshold`) in `ShapeBuilderToolHandler`: hand jitter during mouse click release no longer accidentally sweeps or deletes adjacent boundary sub-segments.
- **Deep 1000-Step Undo History**:
  - Expanded `HistoryService.maxHistory` from 30 to 1000 steps for practically unlimited in-session undo/redo capabilities.
  - Added `optimizeHistory()` memory management helper and kept file metadata sync to host bounded to 50 snapshots.
  - Added test suite `scripts/test-shape-builder-isolation-undo.ts` with 100% assertions passed.

---

## [0.99.0] - 2026-10-23

### 🚀 Added
- **Shape Builder Sub-Stroke Trimming & Topological Graph Welding**:
  - Implemented analytical `SegmentTrimEngine` partitioning intersecting vector paths into atomic sub-strokes bounded by crossing points.
  - Interactive `ShapeBuilderToolHandler` with real-time hover highlight in vibrant crimson `#ef4444` and dual click or continuous drag sweep trimming.
  - Topological valence welding algorithm:
    - Nodes with valence $k = 2$: automatically merges the 2 incident sub-strokes into a unified continuous vector, fusing disparate source paths and synthesizing closed polygons (e.g. converting 4 intersecting hashtag `#` lines into a closed 4-corner square).
    - Nodes with valence $k \ge 3$: preserves distinct separate branches meeting at that coordinate without automatic combination.
  - Connected tool lifecycle in `ToolFactory`, `Session`, and `CanvasInteractionController`.
  - Added test suite `scripts/test-shape-builder.ts` with 100% assertions passed.

---

## [0.98.2] - 2026-10-23

### 🔄 Changed
- **Unified Cut Tool Drawer**:
  - Reconfigured Topology Drawer A (`drawerCut`) to host strictly 2 primary tools: **Scissors / Knife Tool** (`scissors` with shortcut <kbd>C</kbd>) and **Eraser Tool** (`eraser` with shortcut <kbd>Shift+E</kbd>).
  - Streamlined toolbar flyout by eliminating the redundant standalone Knife button, routing both <kbd>C</kbd> and <kbd>K</kbd> shortcuts to the unified Scissors/Knife tool.
  - Synchronized tooltips and documentation across all 7 languages.
  - Updated automated test suite in `scripts/test-toolbar-topology-drawers.ts` with 100% assertions passed.

---

## [0.98.1] - 2026-10-23

### 🚀 Added
- **5000% Ultra-High Viewport Zoom Limit**:
  - Increased maximum optical zoom limit from 3000% (factor 30.0) to 5000% (factor 50.0) in `CanvasManager.MAX_ZOOM`.
  - Calibrated adaptive human-scale graduations in `RulerView` to compute clean decimal stepping and sub-steps at 50x magnification with zero tick stalls or performance drops.
  - Verified hardware-accelerated viewport-bounded grid lines in `GridCanvasRenderer` and invariant overlay indicators across extreme zoom scales.
  - Added dedicated test suite `scripts/test-viewport-zoom.ts` with 100% assertions passed.

---

## [0.98.0] - 2026-10-22

### 🚀 Added
- **Welcome & Creator Support Modal (Ko-fi)**:
  - Added an initial welcome and creator support modal (`WelcomeModal`) that gracefully displays upon opening AntiDraw.
  - Prominently showcases the official AntiDraw logo, current version tag, and last update date.
  - Includes a warm, multi-language appeal inviting satisfied users to support continuous development with a Ko-fi donation.
  - Features an interactive **"Support on Ko-fi"** button with the official Ko-fi cup icon that automatically launches the donation page (`https://ko-fi.com/martinvarela206`) via external browser and dismisses the dialog.
  - Features a ghost **"Maybe later"** dismiss button, with keyboard (<kbd>Escape</kbd>) and backdrop click dismissal.
  - Fully translated across all 7 supported languages (English, Spanish, Simplified Chinese, German, French, Russian, Japanese) with 100% key symmetry in `welcomeModal` translation namespace.
  - Added `openExternal` IPC bridge handling in `VsCodeBridge` and `AntiDrawEditorProvider`.
  - Expanded test suite in `scripts/test-i18n-system.ts` verifying modal translation keys and variable interpolation across all 7 languages.

---

## [0.97.2] - 2026-10-22

### 🚀 Added
- **Automatic IDE Language Detection & Dynamic Syncing**:
  - Configured AntiDraw to automatically default to the host VS Code IDE language (`vscode.env.language`) on first launch and webview bootstrap via `data-vscode-language` and payload synchronization.
  - Added dedicated **"Auto (IDE: {Language})"** option to the status bar language popover menu with an active checkmark, allowing users to effortlessly switch back to tracking their IDE's language after manual language overrides.
  - Added localized `statusbar.languageAuto` key across all 7 dictionaries (`Automático (IDE: {lang})`, `Auto (IDE: {lang})`, `自动 (IDE: {lang})`, `Automatisch (IDE: {lang})`, `Automatique (IDE : {lang})`, `Авто (IDE: {lang})`, `自動 (IDE: {lang})`) with full variable interpolation support.
  - Preserves user manual overrides in `localStorage` when an explicit language is selected, while cleanly purging the override when switching back to Auto IDE mode.
  - Integrated dynamic locale synchronization in `HostSyncService` whenever the extension host loads or updates SVG documents with locale metadata.
  - Expanded test suite in `scripts/test-i18n-system.ts` verifying auto-detection, live host synchronization, manual override isolation, and seamless restoration of auto mode.

---

## [0.97.1] - 2026-10-22

### 🛠️ Fixed
- **Dynamic Status Bar & Inspector Localization Across All 7 Languages**:
  - Removed restrictive bilingual condition `(statusInfo.innerText === 'Ready' || statusInfo.innerText === 'Listo')` in `AppLayoutManager`, ensuring `status-info` dynamically refreshes to the active language's ready message ("Listo", "Ready", "就绪", "Bereit", "Prêt", "Готово", "準備完了") without getting stuck on a previous language's string.
  - Dynamically localized `#status-tool` in the status bar using `statusbar.currentTool` (`Tool: {tool}`) and localized tool names across all tools (Selection, Node, Pen, Shapes, Scissors, Smart Fill, Ruler, etc.) both on initial load, tool change, and language toggle.
  - Added `reRenderCurrentMode()` in `PropertyPanel` and fixed parameterless `update()` defaults to preserve tool and vertex state while forcing complete label retranslation across inspectors upon language switch.
  - Localized `QuickHelpInspector` header titles using active language dictionary tool names.
  - Triggered live re-render of `VectorExplorerPanel` on language change.

---

## [0.97.0] - 2026-10-22

### 🚀 Added
- **Multi-Language Expansion: German, French, Russian, and Japanese (7 Languages Total)**:
  - Added complete, native dictionaries for German (`de`), French (`fr`), Russian (`ru`), and Japanese (`ja`), each implementing all 10 namespaces with 100% key and section symmetry (451 keys) against English, Spanish, and Simplified Chinese.
  - Extended VS Code NLS metadata files (`package.nls.de.json`, `package.nls.fr.json`, `package.nls.ru.json`, `package.nls.ja.json`) providing localized extension titles, descriptions, and commands in the VS Code editor UI.
  - Implemented crisp inline vector SVG flags for all 7 languages (🇪🇸 Spain, 🇬🇧 United Kingdom, 🇨🇳 China, 🇩🇪 Germany, 🇫🇷 France, 🇷🇺 Russia, 🇯🇵 Japan) in the floating language popover menu, bypassing Windows Chromium font fallback limitations.
  - Added localized `QuickHelpInspector` shortcut guides and header resolution for German, French, Russian, and Japanese.
  - Created standalone localized documentation files: `README.de.md`, `README.fr.md`, `README.ru.md`, and `README.ja.md` with unified top Language Switcher bars across all 7 READMEs.
  - Upgraded automated version synchronizer (`scripts/sync-version.js`) to continuously synchronize version badges and status blocks across all 7 language documentation files.
  - Expanded test suite (`scripts/test-i18n-system.ts`) to comprehensively assert structural symmetry across all 7 dictionaries, regional locale auto-detection (`de-DE`, `fr-FR`, `ru-RU`, `ja-JP`), variable interpolation, and 7-language cycle transitions.

---

## [0.96.0] - 2026-10-22

### 🚀 Added
- **Simplified Chinese Localization (zh-CN) & Multi-Language Architecture**:
  - Expanded internationalization system with full Simplified Chinese (`zh-cn`) dictionary implementing all 10 translation namespaces with 100% key and section symmetry against English and Spanish.
  - Implemented tri-state live language toggle (`ES` ➔ `EN` ➔ `ZH-CN` ➔ `ES`) in status bar without editor reloads or state loss.
  - Added locale auto-detection for Chinese locales (`zh-CN`, `zh-Hans`, `zh`) with proper fallback mechanics and HTML template attribute propagation (`lang="zh-cn"`).
  - Implemented comprehensive `TOOL_HELP_MAP_ZH` in `QuickHelpInspector` providing fully localized shortcuts cheatsheets across all 21 vector tools.
  - Introduced VS Code NLS metadata files (`package.nls.json`, `package.nls.es.json`, `package.nls.zh-cn.json`) and hooked `%antidraw...%` placeholder tokens into `package.json`.
  - Created complete multi-language documentation (`README.zh-CN.md` and `README.es.md`) featuring a unified top *Language Switcher* bar in all three READMEs.
  - Upgraded automated version synchronization script (`scripts/sync-version.js`) to keep badges and status blocks synchronized across all three language documentation files.
  - Expanded test suite (`scripts/test-i18n-system.ts`) validating tripartite key symmetry, non-empty values, Chinese locale auto-detection, variable interpolation, and tri-state cycle transitions.
- **Interactive Floating Language Popover Menu with Crisp SVG Flags**:
  - Replaced cyclical status bar toggle with a dedicated floating popup menu anchored to the status bar button.
  - Implemented high-contrast pixel-perfect vector SVG flags for Spain (ES), United Kingdom (EN), and China (ZH-CN).
  - Displays localized language titles, language code badges, and active checkmarks with capture-phase dismiss lifecycle.
  - Status bar button reactively displays the active flag, uppercase language code, and an animated chevron indicator.

---

## [0.95.1] - 2026-10-22

### 🛠️ Fixed
- **Strict Multi-Layer Version Synchronization & Unconditional Commit Governance**:
  - Implemented automated version synchronization tool (`scripts/sync-version.js`) with npm scripts `pnpm run version:sync` and `pnpm run version:bump`.
  - Harmonized version occurrences across `package.json` (`version` and `publish:openvsx`), `README.md` (top status badge and project status block), and `CHANGELOG.md`.
  - Updated local project rules (`.agents/rules/project-rules.md`) and global workflow skill (`task-atomic-workflow`) to enforce immediate atomic commit and VSIX artifact packaging in the exact same tool turn upon test verification.

---

## [0.95.0] - 2026-10-22

### 🚀 Added
- **Native Hierarchical SVG Grouping (`<g>`) & Isolated Stacking Context**:
  - Re-engineered `object.group` (<kbd>Ctrl</kbd>+<kbd>G</kbd>) and `object.ungroup` (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>) system commands to create true W3C standard SVG `<g id="group_...">` containers, replacing the prior destructive Boolean combine behavior.
  - Preserved relative z-order and hierarchy across arbitrary parent/nested tree depths.
  - Implemented W3C Isolated Stacking Context: group opacity (`group.attributes['opacity']`) is assigned directly to the `<g>` container without multiplying or altering individual child opacities, eliminating unsightly internal seam overlap artifacts.
  - Propagated opacity smoothly to children upon ungrouping if the container had fractional opacity ($< 1$).
  - Added full recursive affine transforms: scaling, rotating, translating, skewing, and projective distortion on `<g>` containers proportionally transform all descendant leaf vector vertices and handles.
  - Built dedicated `GroupInspector` exposing bounding box geometry ($X$, $Y$, $W$, $H$), isolated group opacity (0–100%), compositing blend modes (`mix-blend-mode`), child element telemetry, and an instant ungroup action.
  - Added `[ Agrupar (Ctrl+G) ]` quick action in `MultiSelectionInspector`.
  - Added recursive companion metadata (`data-*`) extraction and roundtrip serialization/deserialization for nested `<g>` elements.

---

## [0.94.3] - 2026-10-20

### 🛠️ Fixed
- **Canonical 1:1 Keyboard Shortcut Unification & Collision Elimination**:
  - Eliminated primitive tool key interception: pressing <kbd>R</kbd> and <kbd>E</kbd> now always cleanly activates Rectangle (`rect`) and Ellipse (`ellipse`) tools regardless of active selection state (no longer hijacked by selection scale/rotate modes).
  - Enforced strict modifier precedence: <kbd>Shift</kbd>+<kbd>E</kbd> (Eraser) is evaluated with priority before single-key <kbd>E</kbd>, ensuring seamless tool switching.
  - Assigned dedicated canonical shortcuts to previously unmapped tools: Knife (<kbd>K</kbd>), Smart Fill (<kbd>F</kbd>), Shape Builder (<kbd>M</kbd>), Image Ingestion (<kbd>I</kbd>), and Add Vertex (<kbd>+</kbd>).
  - Standardized Node Tool to canonical <kbd>A</kbd> (maintaining <kbd>N</kbd> as compatible alias).
  - Removed misleading `(Z)` badge on Node Inspector's close curve button, eliminating collision with Zoom Tool (<kbd>Z</kbd>).
  - Reassigned `blend.create` system command shortcut to <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>B</kbd>, removing single-key conflict on <kbd>W</kbd>.
  - Wired active listeners in `KeyboardShortcutController` for menu-advertised commands: <kbd>Ctrl</kbd>+<kbd>0</kbd> (Recenter ViewBox), <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>;</kbd> (Toggle Guide Lock), and layer lock/hide family (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>L</kbd>, <kbd>2</kbd>, <kbd>3</kbd>).
  - Fully synchronized bilingual Quick Help (`QuickHelpInspector`), Toolbar tooltips, and documentation (`README.md`).

---

## [0.94.2] - 2026-10-20

### 🛠️ Fixed
- **Shared Seam & Internal Boundary Elimination in Boolean Union**:
  - Implemented collinear line-line overlap and curve coincidence detection in `BezierCurveTrimmer.findSegmentIntersections` and `areSegmentsCoincident`.
  - Prevented touching contiguous regions from prematurely falling into the non-intersecting disjoint compound path branch when intersecting along a line (`det === 0`).
  - Added shared opposite-boundary segment cancellation in `BezierCurveTrimmer.booleanOpPair` during `op === 'union'`, stripping coincident interior edges completely from the segment pool before graph chaining. Eliminates double boundaries, interior seams, and degenerate cutout holes under `fill-rule="evenodd"`.
  - Upgraded `PolygonBooleanService.union` to execute simultaneous N-way planar clipping via `polygonClipping.union(geoms[0], ...geoms.slice(1))`, eliminating pairwise iteration errors across complex contiguous regions.
  - Added automatic sliver micro-hole filtering ($< 2.0\text{ px}^2$) in `PolygonUtils.multiPolygonToElement` to guarantee clean, watertight planar fills.

### 🚀 Added
- **Triple Interaction Mode Suite for Smart Fill & Shape Builder**:
  - **Mode 1 (Single Click)**: Classic Smart Fill creating independent, isolated `<path>` fragments per enclosed region.
  - **Mode 2 (<kbd>Shift</kbd> + Click - Incremental Step-by-Step Weld)**: Welds clicked enclosed regions directly into the currently active/selected shape in-place. Pushes dedicated, granular undo history entries (`pushUndo()`) for each step, allowing seamless step-by-step assembly with full rollback (<kbd>Ctrl+Z</kbd>) capability.
  - **Mode 3 (Continuous Drag Sweep - Shape Builder style)**: Dynamically accumulates candidate regions crossed by the pointer trajectory with button down. Renders real-time combined preview highlights of all accumulated swept regions, and cleanly welds them into a single unified `<path>` on `pointerup`.
  - **Additive Modifier Homogeneity**: Verified and enforced universal modifier standard: <kbd>Shift</kbd> is the canonical additive modifier across AntiDraw (multi-selection, node multi-selection, additive marquee, and additive region fusion).

---

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
