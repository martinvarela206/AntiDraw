import { ToolContext } from '../IToolHandler.js';
import { VectorElement, PathVertex, Point } from '../../engine/VectorModel.js';
import { HandleType } from '../../engine/SelectionTool.js';
import { ScaleTransformer } from './ScaleTransformer.js';
import { RotateTransformer } from './RotateTransformer.js';
import { SkewTransformer } from './SkewTransformer.js';
import { PivotManager } from './PivotManager.js';
import { GradientGizmoController } from './GradientGizmoController.js';
import type { SelectToolCallbacks } from '../SelectToolHandler.js';

/**
 * TransformInteraction
 *
 * Encapsulates scaling, affine rotation, arbitrary pivot manipulation, and interactive
 * gradient handles for active vector selections:
 * 1. Scaling:
 *    - 8 bounding box resize handles (nw, ne, se, sw, n, s, e, w).
 *    - Preserves aspect ratio with Shift key; scales from center with Alt.
 * 2. Rotation:
 *    - Top stem handle + 4 corner rotation handles in 'rotate' mode.
 *    - Magnetic snapping against vertices, grids, and ViewBox edges (FIX-08).
 *    - Strict 15° snapping with Shift; soft 3° primary angle snapping when not locked.
 *    - Solidary Gradient Rotation (FIX-06): Rotates linear angle and transforms radial gradient
 *      center, focus, radii (rx, ry), and rotation solidarily with vector geometry.
 * 3. Interactive Arbitrary Pivot Relocation (FIX-05):
 *    - Displaced rotation pivot with dashed connection lever to bounding box center.
 *    - In 'transform' mode: muted reference indicator.
 *    - In 'rotate' mode: interactive, magnetically relocatable anchor.
 * 4. Interactive Radial Gradient Manipulation:
 *    - Center, focus, radius-x, and radius-y handles with direct SVG defs attribute mutation for 60fps responsiveness.
 */
export class TransformInteraction {
  public readonly gradientGizmo: GradientGizmoController = new GradientGizmoController();

  public get activeGradientElementId(): string | null {
    return this.gradientGizmo.activeGradientElementId;
  }
  public set activeGradientElementId(id: string | null) {
    this.gradientGizmo.activeGradientElementId = id;
  }

  public get initialGradientJson(): string | null {
    return this.gradientGizmo.initialGradientJson;
  }
  public set initialGradientJson(json: string | null) {
    this.gradientGizmo.initialGradientJson = json;
  }

  public rotationPivot: Point | null = null;
  public initialRotationAngle: number = 0;
  public readonly pivotManager: PivotManager = new PivotManager();

  public get initialPivot(): Point | null {
    return this.pivotManager.initialPivot;
  }
  public set initialPivot(p: Point | null) {
    this.pivotManager.initialPivot = p;
  }

  public lastDeltaAngle: number = 0;
  public currentRotationSnappedPt: Point | null = null;
  public currentScaleSnappedPt: Point | null = null;

  public initialElementsMap: Map<string, PathVertex[]> = new Map();
  public initialAttributesMap: Map<string, Record<string, string>> = new Map();
  public initialBox: any = null;
  public initialBoxPadding: number = 0;
  public ghostTransformMap: Map<string, PathVertex[]> = new Map();

  public lastSkewTransformFn: ((p: Point) => Point) | null = null;
  public currentSkewParallelogram: Point[] | null = null;
  public currentSkewAngleDeg: number = 0;

  /**
   * ARCHITECTURAL RATIONALE: Zero-Clearance Tight Selection Box Hit-Testing
   * 1. Exact Alignment with Geometry Extents:
   *    Selection boxes and handles are positioned flush against the true geometric bounds (padding = 0).
   * 2. Hit-Testing:
   *    Handle radius (12 / z) provides comfortable grab target tolerance without requiring
   *    artificial bounding box expansion.
   */
  public getHoverCursor(ctx: ToolContext, pt: Point, selectedEls: VectorElement[]): string | null {
    if (selectedEls.length === 0) return null;
    const z = ctx.canvasMgr.zoom || 1;
    const box = ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 0);
    if (!box) return null;

    if (ctx.selectionTool.selectionMode === 'rotate') {
      const singleEl = selectedEls.length === 1 ? selectedEls[0] : undefined;
      if (ctx.selectionTool.hitTestPivot(box, pt, 8 / z, singleEl)) {
        return 'move';
      }
      const h = ctx.selectionTool.hitTestHandle(box, pt, 12 / z, 18 / z, 'rotate');
      if (h === 'rotate') return 'grab';
      if (h === 'skew-n' || h === 'skew-s' || h === 'skew-w' || h === 'skew-e') {
        if (!SkewTransformer.canSkewElements(selectedEls, ctx)) {
          return 'not-allowed';
        }
        return (h === 'skew-n' || h === 'skew-s') ? 'ew-resize' : 'ns-resize';
      }
    } else {
      const h = ctx.selectionTool.hitTestHandle(box, pt, 12 / z, 18 / z, 'transform');
      if (h) {
        if (h === 'nw' || h === 'se') return 'nwse-resize';
        if (h === 'ne' || h === 'sw') return 'nesw-resize';
        if (h === 'n' || h === 's') return 'ns-resize';
        if (h === 'w' || h === 'e') return 'ew-resize';
      }
    }

    const gradCursor = this.gradientGizmo.getHoverCursor(ctx, pt, selectedEls);
    if (gradCursor) return gradCursor;

    return null;
  }

  public startScale(
    handle: HandleType,
    groupBox: any,
    selectedEls: VectorElement[],
    padding: number = 0
  ): void {
    this.initialBox = { ...groupBox };
    this.initialBoxPadding = padding;
    this.initialElementsMap.clear();
    this.initialAttributesMap.clear();
    selectedEls.forEach((el) => {
      this.initialAttributesMap.set(el.id, { ...el.attributes });
      if (el.vertices) {
        this.initialElementsMap.set(
          el.id,
          el.vertices.map((v) => ({ ...v, handleIn: v.handleIn ? { ...v.handleIn } : undefined, handleOut: v.handleOut ? { ...v.handleOut } : undefined }))
        );
      }
    });
    this.ghostTransformMap.clear();
    this.currentScaleSnappedPt = null;
  }

  public startRotate(
    pivot: Point,
    dragStartPt: Point,
    selectedEls: VectorElement[]
  ): void {
    const init = RotateTransformer.initRotate(pivot, dragStartPt, selectedEls);
    this.rotationPivot = init.rotationPivot;
    this.initialRotationAngle = init.initialRotationAngle;
    this.lastDeltaAngle = 0;
    this.initialElementsMap = init.initialElementsMap;
    this.initialAttributesMap = init.initialAttributesMap;
    this.ghostTransformMap = init.ghostTransformMap;
  }

  public canSkew(selectedEls: VectorElement[], ctx: ToolContext): boolean {
    return SkewTransformer.canSkewElements(selectedEls, ctx);
  }

  public startSkew(
    handle: string,
    groupBox: any,
    selectedEls: VectorElement[]
  ): void {
    const init = SkewTransformer.initSkew(groupBox, selectedEls);
    this.initialBox = init.initialBox;
    this.initialElementsMap = init.initialElementsMap;
    this.initialAttributesMap = init.initialAttributesMap;
    this.ghostTransformMap = init.ghostTransformMap;
    this.currentSkewParallelogram = null;
    this.currentSkewAngleDeg = 0;
    this.lastSkewTransformFn = null;
  }

  public onPointerMove(
    ctx: ToolContext,
    pt: Point,
    dragStartPt: Point,
    activeHandle: string,
    e: PointerEvent,
    callbacks: SelectToolCallbacks
  ): boolean {
    const dx = pt.x - dragStartPt.x;
    const dy = pt.y - dragStartPt.y;

    if (activeHandle === 'selection-pivot') {
      return this.pivotManager.onPointerMove(ctx, pt, callbacks);
    }

    if (this.gradientGizmo.onPointerMove(ctx, pt, activeHandle, e, callbacks)) {
      return true;
    }

    if (activeHandle === 'rotate' && this.rotationPivot && this.initialElementsMap.size > 0) {
      callbacks.setCursor?.('grabbing');
      const isConstrained = e.ctrlKey || e.shiftKey;
      const result = RotateTransformer.computeRotation(
        ctx,
        pt,
        this.rotationPivot,
        this.initialRotationAngle,
        this.initialElementsMap,
        isConstrained
      );
      this.currentRotationSnappedPt = result.snappedPt;
      this.lastDeltaAngle = result.deltaAngle;
      this.ghostTransformMap = result.ghostMap;
      ctx.renderOverlay();
      return true;
    }

    if (activeHandle.startsWith('skew-') && this.initialBox && this.initialElementsMap.size > 0) {
      callbacks.setCursor?.(
        activeHandle === 'skew-n' || activeHandle === 'skew-s' ? 'ew-resize' : 'ns-resize'
      );
      const isConstrained = e.ctrlKey || e.shiftKey;
      const isSymmetric = e.altKey;
      const selectedEls = ctx.model.elements.filter((el) => ctx.selectionTool.isSelected(el.id));
      const singleEl = selectedEls.length === 1 ? selectedEls[0] : undefined;
      const pivot = ctx.selectionTool.getPivot(this.initialBox, singleEl);
      const result = SkewTransformer.computeSkew(
        ctx,
        pt,
        dragStartPt,
        activeHandle,
        this.initialBox,
        this.initialElementsMap,
        isConstrained,
        isSymmetric,
        pivot
      );
      this.ghostTransformMap = result.ghostMap;
      this.currentSkewAngleDeg = result.skewAngleDeg;
      this.currentSkewParallelogram = result.parallelogramCorners;
      this.lastSkewTransformFn = result.transformPoint;
      ctx.renderOverlay();
      return true;
    }

    // Scaling with directional handle Snap To (Snapping to grid, guidelines, artboard bounds, and unselected vertices)
    if (this.initialBox && activeHandle !== 'move' && this.initialElementsMap.size > 0) {
      const result = ScaleTransformer.computeGhostScale(ctx, {
        pt,
        dragStartPt,
        activeHandle,
        initialBox: this.initialBox,
        initialBoxPadding: this.initialBoxPadding,
        initialElementsMap: this.initialElementsMap,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
      });
      this.currentScaleSnappedPt = result.snappedPt;
      this.ghostTransformMap = result.ghostMap;
      ctx.renderOverlay();
      return true;
    }

    return false;
  }

  public onPointerUp(
    ctx: ToolContext,
    activeHandle: string,
    callbacks: SelectToolCallbacks
  ): boolean {
    if (activeHandle === 'selection-pivot') {
      return this.pivotManager.onPointerUp(ctx, callbacks);
    }

    if (this.gradientGizmo.onPointerUp(ctx, activeHandle, callbacks)) {
      return true;
    }

    if (activeHandle && activeHandle !== 'move' && this.ghostTransformMap.size > 0) {
      ctx.pushUndo();
      const selectedEls = ctx.model.elements.filter((el) => ctx.selectionTool.isSelected(el.id));
      if (activeHandle.startsWith('skew-')) {
        if (this.lastSkewTransformFn) {
          SkewTransformer.applySkewCommit(
            ctx,
            this.ghostTransformMap,
            this.lastSkewTransformFn,
            selectedEls
          );
        }
      } else if (activeHandle === 'rotate') {
        if (this.rotationPivot) {
          RotateTransformer.applyRotateCommit(
            ctx,
            this.ghostTransformMap,
            this.rotationPivot,
            this.lastDeltaAngle,
            this.initialElementsMap,
            this.initialBox,
            selectedEls
          );
        }
      } else if (this.initialBox) {
        ScaleTransformer.applyScaleCommit(
          ctx,
          this.ghostTransformMap,
          this.initialBox,
          this.initialAttributesMap,
          this.initialElementsMap,
          selectedEls
        );
      }

      this.ghostTransformMap.clear();
      this.initialElementsMap.clear();
      this.initialBox = null;
      this.rotationPivot = null;
      this.currentRotationSnappedPt = null;
      this.currentScaleSnappedPt = null;
      this.currentSkewParallelogram = null;
      this.currentSkewAngleDeg = 0;
      this.lastSkewTransformFn = null;
      callbacks.onSelectionChanged?.();
      ctx.syncToHost();
      ctx.render();
      return true;
    }

    this.ghostTransformMap.clear();
    this.initialElementsMap.clear();
    this.initialBox = null;
    this.rotationPivot = null;
    this.currentRotationSnappedPt = null;
    this.currentScaleSnappedPt = null;
    return false;
  }

  public cancel(ctx: ToolContext): boolean {
    let handled = false;
    if (this.ghostTransformMap.size > 0 || this.initialBox) {
      this.ghostTransformMap.clear();
      this.initialElementsMap.clear();
      this.initialBox = null;
      this.rotationPivot = null;
      this.currentRotationSnappedPt = null;
      this.currentScaleSnappedPt = null;
      this.currentSkewParallelogram = null;
      this.currentSkewAngleDeg = 0;
      this.lastSkewTransformFn = null;
      handled = true;
    }

    if (this.pivotManager.cancel(ctx)) {
      handled = true;
    }

    if (this.gradientGizmo.cancel(ctx)) {
      handled = true;
    }

    return handled;
  }

  public lastToggleTime: number = 0;

  /**
   * ARCHITECTURAL RATIONALE: Encapsulated Selection Mode Toggle (FIX-22)
   * Alternates between 'transform' (scale/bounding box resize handles) and 'rotate' (rotation handles & pivot).
   * Encapsulating this in TransformInteraction respects Single Responsibility Principle (SRP)
   * and allows both synthetic double-click gesture detectors and native DOM dblclick events
   * to trigger clean, synchronized state transitions across UI inspectors and canvas overlays.
  /**
   * ARCHITECTURAL RATIONALE: CorelDraw Benchmark Scale <-> Rotate Selection Box Conmutation (ITEM-05)
   * Toggles the selection bounding box directly between 'scale' (8 sizing handles) and 'rotate'
   * (corner rotation arrows, side skew handles, and central pivot).
   * Calls ctx.render() to synchronize property panel inspector buttons and canvas overlays simultaneously.
   */
  public toggleSelectionMode(ctx: ToolContext, callbacks: SelectToolCallbacks): void {
    if (ctx.selectionTool.selectionMode === 'rotate') {
      ctx.selectionTool.selectionMode = 'scale';
    } else {
      ctx.selectionTool.selectionMode = 'rotate';
    }
    this.lastToggleTime = Date.now();
    callbacks.onSelectionChanged?.();
    ctx.render();
  }

  public onDoubleClick(ctx: ToolContext, pt: Point, callbacks: SelectToolCallbacks): boolean {
    const selectedEls = ctx.model.elements.filter((el) => ctx.selectionTool.isSelected(el.id));
    if (selectedEls.length > 0) {
      const groupBox = ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 0);
      if (this.pivotManager.resetPivotOnDoubleClick(ctx, pt, groupBox, selectedEls, callbacks)) {
        return true;
      }
    }

    return false;
  }

  public renderOverlay(
    ctx: ToolContext,
    zoom: number,
    activeHandle: string | null,
    ghostDragOffset: Point | null
  ): string {
    let html = '';
    const z = zoom || 1;
    const selectedEls = ctx.model.elements.filter((e) => ctx.selectionTool.isSelected(e.id));

    if (selectedEls.length > 0) {
      const groupBox = ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 0);
      if (groupBox) {
        const mode = ctx.selectionTool.selectionMode;
        const boxStroke = mode === 'rotate' ? '#f59e0b' : '#38bdf8';
        
        if (mode !== 'move') {
          html += `<rect x="${groupBox.x}" y="${groupBox.y}" width="${groupBox.width}" height="${groupBox.height}" fill="none" stroke="${boxStroke}" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />`;

          const rotOffset = 18 / z;

          if (mode === 'scale') {
            const handles = [
              { x: groupBox.x, y: groupBox.y },
              { x: groupBox.cx, y: groupBox.y },
              { x: groupBox.x + groupBox.width, y: groupBox.y },
              { x: groupBox.x, y: groupBox.cy },
              { x: groupBox.x + groupBox.width, y: groupBox.cy },
              { x: groupBox.x, y: groupBox.y + groupBox.height },
              { x: groupBox.cx, y: groupBox.y + groupBox.height },
              { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height },
            ];

            const hSize = 7 / z;
            const hHalf = hSize / 2;
            const hRx = 1 / z;
            handles.forEach((hPos) => {
              html += `<rect x="${hPos.x - hHalf}" y="${hPos.y - hHalf}" width="${hSize}" height="${hSize}" fill="#ffffff" stroke="#0284c7" stroke-width="1" rx="${hRx}" vector-effect="non-scaling-stroke" />`;
            });
          } else if (mode === 'rotate') {
            /**
             * ARCHITECTURAL RATIONALE: High-Fidelity Curved Circular Rotation & Skew Handle Iconography (ITEM-07)
             *
             * 1. Industrial Parity (CorelDraw Benchmark):
             *    In CorelDraw, rotation mode replaces standard corner square sizing handles with
             *    tangential curved circular arrows that visually convey bidirectional angular rotation,
             *    and midpoint handles with bidirectional linear arrows for skew/shear manipulation.
             *
             * 2. Zoom-Invariant Vector Geometry:
             *    Icons are rendered inside `<g transform="translate(x,y) scale(1/z) rotate(angle)">`,
             *    ensuring pixel-crisp display at all zoom levels (10% to 3200%) with dark high-contrast
             *    backing discs that stand out universally over light, dark, or transparent canvases.
             */
            const rotCorners = [
              { x: groupBox.x, y: groupBox.y, rot: -45 },
              { x: groupBox.x + groupBox.width, y: groupBox.y, rot: 45 },
              { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height, rot: 135 },
              { x: groupBox.x, y: groupBox.y + groupBox.height, rot: -135 },
            ];
            rotCorners.forEach((c) => {
              html += `
                <g class="rotate-corner-handle" transform="translate(${c.x}, ${c.y}) scale(${1 / z}) rotate(${c.rot})" style="cursor: grab;">
                  <!-- High-contrast dark disc with amber border -->
                  <circle cx="0" cy="0" r="8.5" fill="#0f172a" fill-opacity="0.88" stroke="#f59e0b" stroke-width="1.2" vector-effect="non-scaling-stroke" />
                  <!-- Curved circular rotation arc -->
                  <path d="M -3.8 4.2 A 5.8 5.8 0 0 1 -3.8 -4.2" fill="none" stroke="#fbbf24" stroke-width="1.5" stroke-linecap="round" vector-effect="non-scaling-stroke" />
                  <!-- Top arrowhead -->
                  <polygon points="-3.8,-4.2 -6.5,-1.6 -1.2,-2.2" fill="#fbbf24" />
                  <!-- Bottom arrowhead -->
                  <polygon points="-3.8,4.2 -1.2,2.2 -6.5,1.6" fill="#fbbf24" />
                </g>
              `;
            });

            // Midpoint handles (Skew / Shear axes)
            const canSkew = SkewTransformer.canSkewElements(selectedEls, ctx);
            const skewMidpoints = [
              { x: groupBox.cx, y: groupBox.y, isHoriz: true },
              { x: groupBox.cx, y: groupBox.y + groupBox.height, isHoriz: true },
              { x: groupBox.x, y: groupBox.cy, isHoriz: false },
              { x: groupBox.x + groupBox.width, y: groupBox.cy, isHoriz: false },
            ];
            skewMidpoints.forEach((m) => {
              const handleCursor = canSkew ? (m.isHoriz ? 'ew-resize' : 'ns-resize') : 'not-allowed';
              const strokeColor = canSkew ? '#f59e0b' : '#64748b';
              const arrowColor = canSkew ? '#fbbf24' : '#64748b';
              const titleText = canSkew
                ? 'Arrastrar para inclinar / sesgar (Ctrl: pasos de 15°, Alt: simétrico)'
                : 'Las primitivas paramétricas rígidas requieren conversión a curvas (Ctrl+Q) para inclinarse';

              if (m.isHoriz) {
                html += `
                  <g class="rotate-skew-handle" transform="translate(${m.x}, ${m.y}) scale(${1 / z})" style="cursor: ${handleCursor};">
                    <title>${titleText}</title>
                    <circle cx="0" cy="0" r="7.5" fill="#0f172a" fill-opacity="0.88" stroke="${strokeColor}" stroke-width="1.2" vector-effect="non-scaling-stroke" />
                    <line x1="-3.5" y1="0" x2="3.5" y2="0" stroke="${arrowColor}" stroke-width="1.4" stroke-linecap="round" vector-effect="non-scaling-stroke" />
                    <polygon points="-3.5,0 -1.5,-2 -1.5,2" fill="${arrowColor}" />
                    <polygon points="3.5,0 1.5,-2 1.5,2" fill="${arrowColor}" />
                  </g>
                `;
              } else {
                html += `
                  <g class="rotate-skew-handle" transform="translate(${m.x}, ${m.y}) scale(${1 / z})" style="cursor: ${handleCursor};">
                    <title>${titleText}</title>
                    <circle cx="0" cy="0" r="7.5" fill="#0f172a" fill-opacity="0.88" stroke="${strokeColor}" stroke-width="1.2" vector-effect="non-scaling-stroke" />
                    <line x1="0" y1="-3.5" x2="0" y2="3.5" stroke="${arrowColor}" stroke-width="1.4" stroke-linecap="round" vector-effect="non-scaling-stroke" />
                    <polygon points="0,-3.5 -2,-1.5 2,-1.5" fill="${arrowColor}" />
                    <polygon points="0,3.5 -2,1.5 2,1.5" fill="${arrowColor}" />
                  </g>
                `;
              }
            });
          }
        } else {
          // Mode: Move - Render vertices for visualization and snapping reference
          const hSize = 5 / z;
          selectedEls.forEach((el) => {
            if (el.vertices) {
              el.vertices.forEach((v) => {
                html += `<circle cx="${v.x}" cy="${v.y}" r="${hSize}" fill="#ffffff" stroke="#38bdf8" stroke-width="1.5" vector-effect="non-scaling-stroke" style="pointer-events: none;" />`;
              });
            }
          });
        }

        html += this.pivotManager.renderOverlay(ctx, groupBox, selectedEls, mode, activeHandle, ghostDragOffset, z);
        const singleEl = selectedEls.length === 1 ? selectedEls[0] : undefined;
        const pivot = ctx.selectionTool.getPivot(groupBox, singleEl);

        if (activeHandle === 'rotate' && this.rotationPivot) {
          if (this.currentRotationSnappedPt) {
            html += `<line x1="${pivot.x}" y1="${pivot.y}" x2="${this.currentRotationSnappedPt.x}" y2="${this.currentRotationSnappedPt.y}" stroke="#10b981" stroke-width="1.2" stroke-dasharray="3 2" opacity="0.9" vector-effect="non-scaling-stroke" />`;
          }
        }
      }

      // Radial & Linear Gradient overlay
      html += this.gradientGizmo.renderOverlay(ctx, selectedEls, z);

      if (selectedEls.length > 1) {
        selectedEls.forEach((el) => {
          const elBox = ctx.selectionTool.getSelectionBoundingBox(el, 0);
          if (elBox) {
            html += `<rect x="${elBox.x}" y="${elBox.y}" width="${elBox.width}" height="${elBox.height}" fill="none" stroke="#60a5fa" stroke-width="0.75" stroke-dasharray="2 2" opacity="0.6" vector-effect="non-scaling-stroke" />`;
          }
        });
      }
    }

    // Ghost Transform Vector
    if (this.ghostTransformMap.size > 0) {
      this.ghostTransformMap.forEach((gVerts, id) => {
        const el = ctx.model.elements.find((e) => e.id === id);
        if (el) {
          const isClosed = ctx.model.isElementClosed(el);
          const d = ctx.model.compilePathD(gVerts, isClosed);
          html += `<path d="${d}" fill="rgba(99, 102, 241, 0.45)" stroke="#6366f1" stroke-width="3" stroke-dasharray="5 3" vector-effect="non-scaling-stroke" />`;
          gVerts.forEach((gv) => {
            html += `<circle cx="${gv.x}" cy="${gv.y}" r="${3.5 / z}" fill="#a5b4fc" stroke="#4338ca" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
          });
        }
      });
    }

    // Ghost dashed bounding box during interactive scaling
    if (activeHandle && activeHandle !== 'move' && activeHandle !== 'rotate' && !activeHandle.startsWith('skew-') && this.ghostTransformMap.size > 0) {
      let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
      this.ghostTransformMap.forEach((gVerts) => {
        gVerts.forEach((v) => {
          if (v.x < gMinX) gMinX = v.x;
          if (v.x > gMaxX) gMaxX = v.x;
          if (v.y < gMinY) gMinY = v.y;
          if (v.y > gMaxY) gMaxY = v.y;
        });
      });
      if (gMinX !== Infinity) {
        html += `<rect x="${gMinX}" y="${gMinY}" width="${Math.max(gMaxX - gMinX, 1)}" height="${Math.max(gMaxY - gMinY, 1)}" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />`;
      }
    }

    // Ghost dashed parallelogram during interactive skew
    if (activeHandle && activeHandle.startsWith('skew-') && this.currentSkewParallelogram) {
      html += SkewTransformer.renderGhostParallelogram(this.currentSkewParallelogram);
      const badgeAnchor = this.currentSkewParallelogram[0] || { x: 0, y: 0 };
      html += SkewTransformer.renderAngleBadge(this.currentSkewAngleDeg, badgeAnchor, z);
    }

    if (activeHandle === 'rotate' && this.rotationPivot && selectedEls.length > 0) {
      const gBox = ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 0);
      if (gBox) {
        html += RotateTransformer.renderGhostBoundingBox(gBox, this.rotationPivot, this.lastDeltaAngle);
      }

      // Angular degree badge display during rotation
      const deg = Math.round(((this.lastDeltaAngle * 180) / Math.PI) * 10) / 10;
      const inv = 1 / z;
      const degText = `${deg > 0 ? '+' : ''}${deg}°`;
      const badgeX = this.rotationPivot.x + 18 / z;
      const badgeY = this.rotationPivot.y - 18 / z;
      html += `
        <g transform="translate(${badgeX}, ${badgeY}) scale(${inv})" pointer-events="none">
          <rect x="0" y="-14" width="50" height="18" rx="3" fill="#1e1b4b" stroke="#6366f1" stroke-width="1" opacity="0.9" />
          <text x="6" y="-1" font-size="11" fill="#c7d2fe" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="600">${degText}</text>
        </g>
      `;
    }

    // Magnetic Snap Target Indicator during Vector or Guideline Rotation (FIX-08)
    if (this.currentRotationSnappedPt) {
      html += RotateTransformer.renderSnapIndicator(this.currentRotationSnappedPt, z);
    }

    // Magnetic Snap Target Indicator during Vector Scaling (Snapping to grid, guides, artboard, vertices)
    if (this.currentScaleSnappedPt) {
      const sp = this.currentScaleSnappedPt;
      const sR = 6 / z;
      const sCross = 9 / z;
      html += `
        <g class="scale-snap-indicator" pointer-events="none">
          <circle cx="${sp.x}" cy="${sp.y}" r="${sR}" fill="none" stroke="#38bdf8" stroke-width="1.5" vector-effect="non-scaling-stroke" />
          <line x1="${sp.x - sCross}" y1="${sp.y}" x2="${sp.x + sCross}" y2="${sp.y}" stroke="#38bdf8" stroke-width="1" vector-effect="non-scaling-stroke" />
          <line x1="${sp.x}" y1="${sp.y - sCross}" x2="${sp.x}" y2="${sp.y + sCross}" stroke="#38bdf8" stroke-width="1" vector-effect="non-scaling-stroke" />
          <circle cx="${sp.x}" cy="${sp.y}" r="${1.8 / z}" fill="#38bdf8" />
        </g>
      `;
    }

    return html;
  }
}
