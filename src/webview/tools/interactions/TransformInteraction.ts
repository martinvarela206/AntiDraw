import { ToolContext } from '../IToolHandler.js';
import { VectorElement, PathVertex, Point } from '../../engine/VectorModel.js';
import { HandleType } from '../../engine/SelectionTool.js';
import { ScaleTransformer } from './ScaleTransformer.js';
import { RotateTransformer } from './RotateTransformer.js';
import { SkewTransformer } from './SkewTransformer.js';
import { DistortTransformer } from './DistortTransformer.js';
import { QuadCorners } from '../../engine/geometry/ProjectiveHomography.js';
import { PivotManager } from './PivotManager.js';
import { GradientGizmoController } from './GradientGizmoController.js';
import { SelectionMiniHud } from './SelectionMiniHud.js';
import { SelectionCursorHelper } from './SelectionCursorHelper.js';
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
  public readonly miniHud: SelectionMiniHud = new SelectionMiniHud();

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
  public initialDistortQuad: QuadCorners | null = null;
  public currentDistortQuad: QuadCorners | null = null;

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

    const hudCursor = this.miniHud.getHoverCursor(box, pt, z);
    if (hudCursor) return hudCursor;

    if (ctx.selectionTool.selectionMode === 'distort') {
      const h = ctx.selectionTool.hitTestHandle(box, pt, 12 / z, 18 / z, 'distort', this.currentDistortQuad);
      if (h) {
        if (h.startsWith('distort-')) return 'crosshair';
        if (h === 'skew-n' || h === 'skew-s') return 'ew-resize';
        if (h === 'skew-w' || h === 'skew-e') return 'ns-resize';
      }
    } else if (ctx.selectionTool.selectionMode === 'rotate') {
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
    } else if (ctx.selectionTool.selectionMode === 'move') {
      // Pure move mode: no perimeter transform handles
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

  public startDistort(
    handle: string,
    groupBox: any,
    selectedEls: VectorElement[]
  ): void {
    const init = DistortTransformer.initDistort(groupBox, selectedEls);
    this.initialBox = init.initialBox;
    this.initialBoxPadding = 0;
    this.initialElementsMap = init.initialElementsMap;
    this.initialAttributesMap = init.initialAttributesMap;
    this.ghostTransformMap = init.ghostTransformMap;
    this.initialDistortQuad = { ...init.initialQuad };
    if (!this.currentDistortQuad) {
      this.currentDistortQuad = init.initialQuad;
    }
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

    if (activeHandle.startsWith('distort-') && this.initialBox && this.initialElementsMap.size > 0) {
      callbacks.setCursor?.('crosshair');
      if (!this.initialDistortQuad) {
        this.initialDistortQuad = {
          nw: { x: this.initialBox.x, y: this.initialBox.y },
          ne: { x: this.initialBox.x + this.initialBox.width, y: this.initialBox.y },
          se: { x: this.initialBox.x + this.initialBox.width, y: this.initialBox.y + this.initialBox.height },
          sw: { x: this.initialBox.x, y: this.initialBox.y + this.initialBox.height },
        };
      }
      const result = DistortTransformer.computeCornerDistort(
        ctx,
        pt,
        activeHandle,
        this.initialBox,
        this.initialDistortQuad,
        this.initialElementsMap,
        {
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          ctrlKey: e.ctrlKey,
          selectedCorners: ctx.selectionTool.selectedDistortCorners,
        }
      );
      this.ghostTransformMap = result.ghostMap;
      this.currentDistortQuad = result.quad;
      ctx.selectionTool.currentDistortQuad = result.quad;
      this.currentScaleSnappedPt = result.snappedPt;
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
      if (activeHandle.startsWith('distort-')) {
        if (this.initialBox) {
          DistortTransformer.applyDistortCommit(
            ctx,
            this.ghostTransformMap,
            selectedEls,
            this.initialBox
          );
        }
      } else if (activeHandle.startsWith('skew-')) {
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
          /**
           * ARCHITECTURAL RATIONALE: Mandatory Confirmation Before Parametric Primitive Destructuring (ITEM-04)
           * SVG primitives (<rect>, <circle>, <ellipse>, <line>, <polygon>, <star>) carry high-level parametric
           * metadata (corner radius, radial bounds, quadrant angles). Rotating them requires converting them to
           * freeform Bézier paths (<path>), which is an irreversible structural destructuring.
           * A mandatory modal confirmation guarantees explicit user consent before any parametric conversion occurs.
           * If cancelled, the rotation is aborted cleanly and the primitive remains in its pristine parametric state.
           */
          const willDestructureParametric = Math.abs(this.lastDeltaAngle) > 0.01 && selectedEls.some((el) => {
            if (!ctx.model.isParametricElement(el)) return false;
            const isPieOrArc =
              el.attributes['data-ellipse-type'] === 'pie' || el.attributes['data-ellipse-type'] === 'arc';
            const rx = parseFloat(el.attributes.rx || el.attributes.r || '1');
            const ry = parseFloat(el.attributes.ry || el.attributes.r || '1');
            if (isPieOrArc && Math.abs(rx - ry) < 0.5) return false;
            return true;
          });

          if (willDestructureParametric) {
            const ghostMapCopy = new Map(this.ghostTransformMap);
            const pivotCopy = { ...this.rotationPivot };
            const deltaAngleCopy = this.lastDeltaAngle;
            const initialElementsCopy = new Map(this.initialElementsMap);
            const initialBoxCopy = this.initialBox ? { ...this.initialBox } : null;

            this.ghostTransformMap.clear();
            this.initialElementsMap.clear();
            this.initialBox = null;
            this.rotationPivot = null;
            this.currentRotationSnappedPt = null;
            this.currentScaleSnappedPt = null;
            this.currentSkewParallelogram = null;
            this.currentSkewAngleDeg = 0;
            this.lastSkewTransformFn = null;
            ctx.renderOverlay();

            ctx.confirm({
              title: 'Convertir Primitiva a Curvas',
              message: 'La rotación de esta figura paramétrica requiere convertirla a curvas de Bézier.',
              details: 'Las figuras paramétricas nativas en SVG no admiten rotación angular libre sin perder sus parámetros nativos (como radios o esquinas redondeadas). ¿Deseas convertir a curvas y aplicar la rotación?',
              confirmText: 'Convertir y Rotar',
              cancelText: 'Cancelar',
            }).then((confirmed) => {
              if (confirmed) {
                ctx.pushUndo();
                RotateTransformer.applyRotateCommit(
                  ctx,
                  ghostMapCopy,
                  pivotCopy,
                  deltaAngleCopy,
                  initialElementsCopy,
                  initialBoxCopy,
                  selectedEls
                );
                callbacks.onSelectionChanged?.();
                ctx.syncToHost();
                ctx.render();
              } else {
                ctx.render();
              }
            });
            return true;
          }

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
      this.initialDistortQuad = null;
      this.currentDistortQuad = null;
      ctx.selectionTool.currentDistortQuad = null;
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
    this.initialDistortQuad = null;
    this.currentDistortQuad = null;
    ctx.selectionTool.currentDistortQuad = null;
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
      this.initialDistortQuad = null;
      this.currentDistortQuad = null;
      ctx.selectionTool.currentDistortQuad = null;
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
   * ARCHITECTURAL RATIONALE: Universal 4-Mode Cyclic Conmutation (FEAT-TRANS-02 / CorelDraw Benchmark)
   * A deliberate second paused click (>=300ms) without dragging cycles through all 4 selection states:
   * 1. 'scale': 8 bounding box resize handles for geometric sizing and aspect scaling.
   * 2. 'rotate': 4 corner curved rotation arrows, 4 edge skew arrows, and central arbitrary pivot.
   * 3. 'distort': 4 corner diamond deformation handles and 4 edge skew handles for free projective homography.
   * 4. 'move': Bounding box outline without perimeter handles, exposing all real structural vertices
   *    and landmarks (rendered by OverlayRenderer) for direct magnetic snapping anchor picking.
   * Cycles deterministically: scale -> rotate -> distort -> move -> scale.
   */
  public toggleSelectionMode(ctx: ToolContext, callbacks: SelectToolCallbacks): void {
    if (ctx.selectionTool.selectionMode === 'move') {
      ctx.selectionTool.selectionMode = 'scale';
    } else if (ctx.selectionTool.selectionMode === 'scale') {
      ctx.selectionTool.selectionMode = 'rotate';
    } else if (ctx.selectionTool.selectionMode === 'rotate') {
      ctx.selectionTool.selectionMode = 'move';
    } else {
      ctx.selectionTool.selectionMode = 'move';
    }
    this.lastToggleTime = Date.now();
    callbacks.setCursor?.(SelectionCursorHelper.getModeCursor(ctx.selectionTool.selectionMode));
    callbacks.onSelectionChanged?.();
    ctx.render();
    ctx.renderOverlay();
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
        const boxStroke = mode === 'distort' ? '#8b5cf6' : mode === 'rotate' ? '#8b5cf6' : mode === 'move' ? '#10b981' : '#6366f1';
        
        // Render bounding box outline across scale/rotate/move modes, visually distinguishing states by hue
        if (mode !== 'distort') {
          html += `<rect x="${groupBox.x}" y="${groupBox.y}" width="${groupBox.width}" height="${groupBox.height}" fill="none" stroke="${boxStroke}" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />`;
        }

        if (mode !== 'move') {
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
              html += `<rect x="${hPos.x - hHalf}" y="${hPos.y - hHalf}" width="${hSize}" height="${hSize}" fill="#ffffff" stroke="#6366f1" stroke-width="1.2" rx="${hRx}" vector-effect="non-scaling-stroke" />`;
            });
          } else if (mode === 'distort') {
            const q = this.currentDistortQuad || {
              nw: { x: groupBox.x, y: groupBox.y },
              ne: { x: groupBox.x + groupBox.width, y: groupBox.y },
              se: { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height },
              sw: { x: groupBox.x, y: groupBox.y + groupBox.height },
            };

            // Render quadrilateral bounding boundary
            html += `<polygon points="${q.nw.x},${q.nw.y} ${q.ne.x},${q.ne.y} ${q.se.x},${q.se.y} ${q.sw.x},${q.sw.y}" fill="none" stroke="#8b5cf6" stroke-width="1.2" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />`;

            // 4 Corner distort diamond handles
            const corners: { key: string; x: number; y: number; title: string }[] = [
              { key: 'nw', x: q.nw.x, y: q.nw.y, title: 'Esquina Noroeste (Arrastrar para deformar libremente)' },
              { key: 'ne', x: q.ne.x, y: q.ne.y, title: 'Esquina Noreste (Arrastrar para deformar libremente)' },
              { key: 'se', x: q.se.x, y: q.se.y, title: 'Esquina Sureste (Arrastrar para deformar libremente)' },
              { key: 'sw', x: q.sw.x, y: q.sw.y, title: 'Esquina Suroeste (Arrastrar para deformar libremente)' },
            ];

            const activeCornerKey = ctx.selectionTool.activeDistortCorner || 'nw';
            const selectedCorners = ctx.selectionTool.selectedDistortCorners;
            corners.forEach((c) => {
              const isSelected = selectedCorners ? selectedCorners.has(c.key as any) : (c.key === activeCornerKey);
              const fillCol = isSelected ? '#8b5cf6' : '#0f172a';
              const strokeCol = isSelected ? '#c4b5fd' : '#a78bfa';
              const strokeWidth = isSelected ? '2' : '1.4';
              html += `
                <g class="distort-corner-handle" transform="translate(${c.x}, ${c.y}) scale(${1 / z})" style="cursor: crosshair;">
                  <title>${c.title}${isSelected ? ' (Seleccionada)' : ''}</title>
                  <polygon points="0,-7 7,0 0,7 -7,0" fill="${fillCol}" fill-opacity="0.92" stroke="${strokeCol}" stroke-width="${strokeWidth}" vector-effect="non-scaling-stroke" />
                  <circle cx="0" cy="0" r="${isSelected ? 2.5 : 2}" fill="#ffffff" />
                </g>
              `;
            });

            // 4 Midpoint handles (Directional Skew / Shear)
            const midpoints = [
              { x: (q.nw.x + q.ne.x) / 2, y: (q.nw.y + q.ne.y) / 2, isHoriz: true },
              { x: (q.sw.x + q.se.x) / 2, y: (q.sw.y + q.se.y) / 2, isHoriz: true },
              { x: (q.nw.x + q.sw.x) / 2, y: (q.nw.y + q.sw.y) / 2, isHoriz: false },
              { x: (q.ne.x + q.se.x) / 2, y: (q.ne.y + q.se.y) / 2, isHoriz: false },
            ];
            midpoints.forEach((m) => {
              const handleCursor = m.isHoriz ? 'ew-resize' : 'ns-resize';
              const strokeColor = '#8b5cf6';
              const arrowColor = '#a78bfa';
              if (m.isHoriz) {
                html += `
                  <g class="distort-skew-handle" transform="translate(${m.x}, ${m.y}) scale(${1 / z})" style="cursor: ${handleCursor};">
                    <title>Arrastrar para inclinar / sesgar eje horizontal</title>
                    <circle cx="0" cy="0" r="7" fill="#0f172a" fill-opacity="0.9" stroke="${strokeColor}" stroke-width="1.2" vector-effect="non-scaling-stroke" />
                    <line x1="-3.2" y1="0" x2="3.2" y2="0" stroke="${arrowColor}" stroke-width="1.4" stroke-linecap="round" vector-effect="non-scaling-stroke" />
                    <polygon points="-3.2,0 -1.2,-1.8 -1.2,1.8" fill="${arrowColor}" />
                    <polygon points="3.2,0 1.2,-1.8 1.2,1.8" fill="${arrowColor}" />
                  </g>
                `;
              } else {
                html += `
                  <g class="distort-skew-handle" transform="translate(${m.x}, ${m.y}) scale(${1 / z})" style="cursor: ${handleCursor};">
                    <title>Arrastrar para inclinar / sesgar eje vertical</title>
                    <circle cx="0" cy="0" r="7" fill="#0f172a" fill-opacity="0.9" stroke="${strokeColor}" stroke-width="1.2" vector-effect="non-scaling-stroke" />
                    <line x1="0" y1="-3.2" x2="0" y2="3.2" stroke="${arrowColor}" stroke-width="1.4" stroke-linecap="round" vector-effect="non-scaling-stroke" />
                    <polygon points="0,-3.2 -1.8,-1.2 1.8,-1.2" fill="${arrowColor}" />
                    <polygon points="0,3.2 -1.8,1.2 1.8,1.2" fill="${arrowColor}" />
                  </g>
                `;
              }
            });
          } else if (mode === 'rotate') {
            /**
             * ARCHITECTURAL RATIONALE: High-Fidelity Curved Circular Rotation & Skew Handle Iconography (ITEM-07)
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
                  <!-- High-contrast dark disc with purple border -->
                  <circle cx="0" cy="0" r="8.5" fill="#0f172a" fill-opacity="0.88" stroke="#8b5cf6" stroke-width="1.2" vector-effect="non-scaling-stroke" />
                  <!-- Curved circular rotation arc -->
                  <path d="M -3.8 4.2 A 5.8 5.8 0 0 1 -3.8 -4.2" fill="none" stroke="#c4b5fd" stroke-width="1.5" stroke-linecap="round" vector-effect="non-scaling-stroke" />
                  <!-- Top arrowhead -->
                  <polygon points="-3.8,-4.2 -6.5,-1.6 -1.2,-2.2" fill="#c4b5fd" />
                  <!-- Bottom arrowhead -->
                  <polygon points="-3.8,4.2 -1.2,2.2 -6.5,1.6" fill="#c4b5fd" />
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
              const strokeColor = canSkew ? '#8b5cf6' : '#64748b';
              const arrowColor = canSkew ? '#c4b5fd' : '#64748b';
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
          // Mode: Move (Mover Puro) - High-visibility magnetic snap targets for vertices and geometric center
          selectedEls.forEach((el) => {
            if (ctx.model.isEllipse(el)) {
              const cx = parseFloat(el.attributes.cx || '0');
              const cy = parseFloat(el.attributes.cy || '0');
              const rx = parseFloat(el.attributes.rx || el.attributes.r || '1');
              const ry = parseFloat(el.attributes.ry || el.attributes.r || '1');
              const quadrantAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
              quadrantAngles.forEach((rad) => {
                const qx = cx + rx * Math.cos(rad);
                const qy = cy + ry * Math.sin(rad);
                html += `
                  <g class="move-anchor-snap-target" transform="translate(${qx}, ${qy}) scale(${1 / z})" style="pointer-events: none;">
                    <circle cx="0" cy="0" r="5" fill="#ffffff" stroke="#10b981" stroke-width="1.5" vector-effect="non-scaling-stroke" />
                    <line x1="-3.5" y1="0" x2="3.5" y2="0" stroke="#10b981" stroke-width="1" vector-effect="non-scaling-stroke" />
                    <line x1="0" y1="-3.5" x2="0" y2="3.5" stroke="#10b981" stroke-width="1" vector-effect="non-scaling-stroke" />
                    <circle cx="0" cy="0" r="1.5" fill="#10b981" />
                  </g>
                `;
              });
            } else if (el.vertices) {
              el.vertices.forEach((v) => {
                html += `
                  <g class="move-anchor-snap-target" transform="translate(${v.x}, ${v.y}) scale(${1 / z})" style="pointer-events: none;">
                    <!-- High-contrast backing halo with emerald border -->
                    <circle cx="0" cy="0" r="5" fill="#ffffff" stroke="#10b981" stroke-width="1.5" vector-effect="non-scaling-stroke" />
                    <!-- Optical magnetic center reticle -->
                    <line x1="-3.5" y1="0" x2="3.5" y2="0" stroke="#10b981" stroke-width="1" vector-effect="non-scaling-stroke" />
                    <line x1="0" y1="-3.5" x2="0" y2="3.5" stroke="#10b981" stroke-width="1" vector-effect="non-scaling-stroke" />
                    <circle cx="0" cy="0" r="1.5" fill="#10b981" />
                  </g>
                `;
              });
            }
          });

          // Geometric center illuminated with magnetic snapping crosshair reticle
          html += `
            <g class="move-center-snap-reticle" transform="translate(${groupBox.cx}, ${groupBox.cy}) scale(${1 / z})" style="pointer-events: none;">
              <!-- Dark high-contrast backing crosshairs -->
              <line x1="-8" y1="0" x2="8" y2="0" stroke="#0f172a" stroke-width="2.2" vector-effect="non-scaling-stroke" />
              <line x1="0" y1="-8" x2="0" y2="8" stroke="#0f172a" stroke-width="2.2" vector-effect="non-scaling-stroke" />
              <!-- Emerald precision crosshairs -->
              <line x1="-8" y1="0" x2="8" y2="0" stroke="#10b981" stroke-width="1.2" vector-effect="non-scaling-stroke" />
              <line x1="0" y1="-8" x2="0" y2="8" stroke="#10b981" stroke-width="1.2" vector-effect="non-scaling-stroke" />
              <!-- Outer optical target ring -->
              <circle cx="0" cy="0" r="5" fill="#0f172a" fill-opacity="0.8" stroke="#10b981" stroke-width="1.2" vector-effect="non-scaling-stroke" />
              <!-- Bullseye center dot -->
              <circle cx="0" cy="0" r="1.8" fill="#ffffff" />
            </g>
          `;
        }

        html += this.pivotManager.renderOverlay(ctx, groupBox, selectedEls, mode, activeHandle, ghostDragOffset, z);
        const singleEl = selectedEls.length === 1 ? selectedEls[0] : undefined;
        const pivot = ctx.selectionTool.getPivot(groupBox, singleEl);

        if (activeHandle === 'rotate' && this.rotationPivot) {
          if (this.currentRotationSnappedPt) {
            html += `<line x1="${pivot.x}" y1="${pivot.y}" x2="${this.currentRotationSnappedPt.x}" y2="${this.currentRotationSnappedPt.y}" stroke="#10b981" stroke-width="1.2" stroke-dasharray="3 2" opacity="0.9" vector-effect="non-scaling-stroke" />`;
          }
        }

        if (activeHandle?.startsWith('distort-') && this.currentScaleSnappedPt) {
          html += `<circle cx="${this.currentScaleSnappedPt.x}" cy="${this.currentScaleSnappedPt.y}" r="${6 / z}" fill="none" stroke="#10b981" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
        }

        // Contextual Floating Mini-HUD ([ ✥ Mover | ⤢ Escalar | ⟳ Rotar ])
        html += this.miniHud.renderOverlay(groupBox, mode, z);
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
          /**
           * ARCHITECTURAL RATIONALE: Open Path Topological Cleanliness in Transform Ghosts
           * Setting `fill="none"` when `!isClosed` prevents spurious solid chord fills
           * when transforming open polylines, lines, or open Bézier splines (scale, rotate, skew, distort).
           */
          const ghostFill = isClosed ? 'rgba(99, 102, 241, 0.45)' : 'none';
          html += `<path d="${d}" fill="${ghostFill}" stroke="#6366f1" stroke-width="3" stroke-dasharray="5 3" vector-effect="non-scaling-stroke" />`;
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
