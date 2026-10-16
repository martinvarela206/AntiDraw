# Changelog — AntiDraw

All notable changes to the "AntiDraw" extension will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
