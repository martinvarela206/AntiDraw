import { Point, PathVertex, VectorElement } from '../../engine/VectorModel.js';
import { BoundingBox, BoundingBoxCalculator } from '../../engine/geometry/BoundingBoxCalculator.js';
import { SelectionMiniHud, SelectionHudMode } from '../interactions/SelectionMiniHud.js';
import { AffineMatrix } from '../../core/geom/TransformMatrix.js';

export type SubgroupTransformMode = 'scale' | 'rotate' | 'move';

export interface SubgroupHitResult {
  type: 'hud' | 'handle' | 'centroid';
  handle?: string;
  hudMode?: SelectionHudMode;
}

/**
 * ARCHITECTURAL RATIONALE: Subgroup Node Transformation Controller (SOLID / SRP)
 *
 * 1. Single Responsibility:
 *    Encapsulates centroid calculation, micro-Bounding Box projection, multi-vertex
 *    affine transformations (scale, rotate, skew), and solidary Bézier handle manipulation
 *    for subselections of N >= 2 nodes without polluting the main NodeToolHandler.
 *
 * 2. Mathematical Exactness:
 *    - Centroid: C = (1/k) * sum(P_i) for k selected nodes.
 *    - Solidary Transformation: Any affine matrix M applied to a selected vertex P_i
 *      is simultaneously applied to its tangent handles (handleIn and handleOut) relative
 *      to the subselection reference pivot/centroid:
 *      P'_i = M(P_i), H'_in = M(H_in), H'_out = M(H_out).
 *
 * 3. Unified Mode Parity (Mouse-Only Ergonomics):
 *    Shares identical modal behavior with SelectTool (scale, rotate, move) via the
 *    contextual Mini-HUD and chromatic bounding box visual cues:
 *    - Scale: Indigo (#6366f1) with 8 resize handles.
 *    - Rotate: Violet (#8b5cf6) with 4 corner rotation handles, top stem, and skew midpoints.
 *    - Move: Emerald (#10b981) with centroid crosshair.
 */
export class NodeSubgroupTransformController {
  public mode: SubgroupTransformMode = 'scale';
  public activeHandle: string | null = null;
  public dragStartPt: Point = { x: 0, y: 0 };
  public initialVertices: PathVertex[] = [];
  public initialBox: BoundingBox | null = null;
  public initialCentroid: Point | null = null;
  public readonly miniHud: SelectionMiniHud = new SelectionMiniHud();

  /**
   * Calculates local centroid C = (1/k) * sum(P_i) of a set of vertices.
   */
  public static computeCentroid(vertices: { x: number; y: number }[]): Point {
    if (!vertices || vertices.length === 0) return { x: 0, y: 0 };
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < vertices.length; i++) {
      sumX += vertices[i].x;
      sumY += vertices[i].y;
    }
    return {
      x: sumX / vertices.length,
      y: sumY / vertices.length,
    };
  }

  /**
   * Computes the axis-aligned bounding box of selected vertices with a minimum threshold.
   */
  public static computeBoundingBox(vertices: { x: number; y: number }[]): BoundingBox | null {
    const box = BoundingBoxCalculator.getVerticesBoundingBox(vertices);
    if (!box) return null;
    return {
      ...box,
      width: Math.max(box.width, 4),
      height: Math.max(box.height, 4),
    };
  }

  /**
   * Extracts the subset of vertices belonging to the active selection set.
   */
  public getSelectedVertices(element: VectorElement, selectedIds: Set<string>): PathVertex[] {
    if (!element.vertices || selectedIds.size < 2) return [];
    return element.vertices.filter((v) => selectedIds.has(v.id));
  }

  /**
   * Switches the active subgroup interaction mode (move, scale, rotate).
   */
  public setMode(mode: SubgroupTransformMode): void {
    this.mode = mode;
  }

  /**
   * Cycles through the three interaction modes.
   */
  public cycleMode(): SubgroupTransformMode {
    if (this.mode === 'move') {
      this.mode = 'scale';
    } else if (this.mode === 'scale') {
      this.mode = 'rotate';
    } else {
      this.mode = 'move';
    }
    return this.mode;
  }

  /**
   * Hit tests whether a canvas point strikes the Mini-HUD, a micro-Bounding Box handle,
   * or the centroid marker of the subselection.
   */
  public hitTest(
    element: VectorElement,
    selectedIds: Set<string>,
    pt: Point,
    zoom: number
  ): SubgroupHitResult | null {
    if (selectedIds.size < 2) return null;
    const selVerts = this.getSelectedVertices(element, selectedIds);
    if (selVerts.length < 2) return null;

    const box = NodeSubgroupTransformController.computeBoundingBox(selVerts);
    if (!box) return null;

    const z = zoom || 1;
    const handleRadius = 9 / z;

    // 1. Mini-HUD Hit Testing
    // In rotate mode, adjust HUD position so it doesn't overlap the stem handle
    const hudBox: BoundingBox = this.mode === 'rotate'
      ? { ...box, y: box.y - 18 / z }
      : box;
    const hudHit = this.miniHud.hitTest(hudBox, pt, z);
    if (hudHit) {
      return { type: 'hud', hudMode: hudHit };
    }

    // 2. Handle Hit Testing
    if (this.mode === 'scale') {
      const handles: { key: string; x: number; y: number }[] = [
        { key: 'nw', x: box.x, y: box.y },
        { key: 'n', x: box.cx, y: box.y },
        { key: 'ne', x: box.x + box.width, y: box.y },
        { key: 'e', x: box.x + box.width, y: box.cy },
        { key: 'se', x: box.x + box.width, y: box.y + box.height },
        { key: 's', x: box.cx, y: box.y + box.height },
        { key: 'sw', x: box.x, y: box.y + box.height },
        { key: 'w', x: box.x, y: box.cy },
      ];

      for (const h of handles) {
        if (Math.hypot(pt.x - h.x, pt.y - h.y) <= handleRadius) {
          return { type: 'handle', handle: h.key };
        }
      }
    } else if (this.mode === 'rotate') {
      // Top stem handle
      const stemPt: Point = { x: box.cx, y: box.y - 18 / z };
      if (Math.hypot(pt.x - stemPt.x, pt.y - stemPt.y) <= handleRadius) {
        return { type: 'handle', handle: 'rotate-stem' };
      }

      // 4 corner rotation handles
      const cornerHandles: { key: string; x: number; y: number }[] = [
        { key: 'rotate-nw', x: box.x, y: box.y },
        { key: 'rotate-ne', x: box.x + box.width, y: box.y },
        { key: 'rotate-se', x: box.x + box.width, y: box.y + box.height },
        { key: 'rotate-sw', x: box.x, y: box.y + box.height },
      ];
      for (const ch of cornerHandles) {
        if (Math.hypot(pt.x - ch.x, pt.y - ch.y) <= handleRadius) {
          return { type: 'handle', handle: ch.key };
        }
      }

      // 4 midpoint skew handles
      const skewHandles: { key: string; x: number; y: number }[] = [
        { key: 'skew-n', x: box.cx, y: box.y },
        { key: 'skew-s', x: box.cx, y: box.y + box.height },
        { key: 'skew-w', x: box.x, y: box.cy },
        { key: 'skew-e', x: box.x + box.width, y: box.cy },
      ];
      for (const sh of skewHandles) {
        if (Math.hypot(pt.x - sh.x, pt.y - sh.y) <= handleRadius) {
          return { type: 'handle', handle: sh.key };
        }
      }
    }

    // 3. Centroid marker hit
    const centroid = NodeSubgroupTransformController.computeCentroid(selVerts);
    if (Math.hypot(pt.x - centroid.x, pt.y - centroid.y) <= 7 / z) {
      return { type: 'centroid' };
    }

    return null;
  }

  /**
   * Initializes a subgroup transformation drag sequence.
   */
  public startTransform(
    handle: string,
    pt: Point,
    elementVertices: PathVertex[],
    selectedIds: Set<string>
  ): void {
    this.activeHandle = handle;
    this.dragStartPt = { x: pt.x, y: pt.y };
    this.initialVertices = JSON.parse(JSON.stringify(elementVertices));

    const selVerts = this.initialVertices.filter((v) => selectedIds.has(v.id));
    this.initialCentroid = NodeSubgroupTransformController.computeCentroid(selVerts);
    this.initialBox = NodeSubgroupTransformController.computeBoundingBox(selVerts);
  }

  /**
   * Updates the affine transformation and applies solidary transforms to selected nodes
   * and their Bézier tangents. Returns updated ghost vertices.
   */
  public updateTransform(
    pt: Point,
    isShift: boolean,
    _isCtrl: boolean,
    isAlt: boolean,
    selectedIds: Set<string>
  ): PathVertex[] | null {
    if (!this.activeHandle || !this.initialBox || !this.initialCentroid) return null;

    const box = this.initialBox;
    const centroid = this.initialCentroid;
    const h = this.activeHandle;

    let matrix: AffineMatrix = AffineMatrix.identity();

    if (h.startsWith('rotate')) {
      // Rotation around Centroid
      const v0 = { x: this.dragStartPt.x - centroid.x, y: this.dragStartPt.y - centroid.y };
      const v1 = { x: pt.x - centroid.x, y: pt.y - centroid.y };
      const angle0 = Math.atan2(v0.y, v0.x);
      const angle1 = Math.atan2(v1.y, v1.x);
      let deltaAngle = angle1 - angle0;

      // 15° snapping with Shift
      if (isShift) {
        const step = Math.PI / 12; // 15 degrees
        deltaAngle = Math.round(deltaAngle / step) * step;
      }

      matrix = AffineMatrix.rotation(deltaAngle, centroid);
    } else if (h.startsWith('skew')) {
      // Skew / Shear around Centroid
      const dx = pt.x - this.dragStartPt.x;
      const dy = pt.y - this.dragStartPt.y;
      const halfH = Math.max(box.height / 2, 1);
      const halfW = Math.max(box.width / 2, 1);

      if (h === 'skew-n') {
        const skewAngle = Math.atan2(dx, halfH);
        matrix = AffineMatrix.skew(skewAngle, 0, centroid);
      } else if (h === 'skew-s') {
        const skewAngle = Math.atan2(-dx, halfH);
        matrix = AffineMatrix.skew(skewAngle, 0, centroid);
      } else if (h === 'skew-w') {
        const skewAngle = Math.atan2(-dy, halfW);
        matrix = AffineMatrix.skew(0, skewAngle, centroid);
      } else if (h === 'skew-e') {
        const skewAngle = Math.atan2(dy, halfW);
        matrix = AffineMatrix.skew(0, skewAngle, centroid);
      }
    } else {
      // Scale handles (nw, n, ne, e, se, s, sw, w)
      // Determine reference anchor point
      let anchor: Point = centroid;
      if (!isAlt) {
        switch (h) {
          case 'se': anchor = { x: box.x, y: box.y }; break;
          case 'nw': anchor = { x: box.x + box.width, y: box.y + box.height }; break;
          case 'ne': anchor = { x: box.x, y: box.y + box.height }; break;
          case 'sw': anchor = { x: box.x + box.width, y: box.y }; break;
          case 'e': anchor = { x: box.x, y: box.cy }; break;
          case 'w': anchor = { x: box.x + box.width, y: box.cy }; break;
          case 's': anchor = { x: box.cx, y: box.y }; break;
          case 'n': anchor = { x: box.cx, y: box.y + box.height }; break;
        }
      }

      const dx = pt.x - this.dragStartPt.x;
      const dy = pt.y - this.dragStartPt.y;
      const multiplier = isAlt ? 2 : 1;

      let targetW = box.width;
      let targetH = box.height;

      if (h.includes('e')) targetW = box.width + multiplier * dx;
      if (h.includes('w')) targetW = box.width - multiplier * dx;
      if (h.includes('s')) targetH = box.height + multiplier * dy;
      if (h.includes('n')) targetH = box.height - multiplier * dy;

      let sx = box.width > 0.001 ? targetW / box.width : 1;
      let sy = box.height > 0.001 ? targetH / box.height : 1;

      // Preserve aspect ratio with Shift
      if (isShift) {
        const isCorner = h.length === 2;
        if (isCorner) {
          const signX = Math.sign(sx) || 1;
          const signY = Math.sign(sy) || 1;
          const maxMag = Math.max(Math.abs(sx), Math.abs(sy));
          sx = signX * maxMag;
          sy = signY * maxMag;
        }
      }

      matrix = AffineMatrix.scaling(sx, sy, anchor);
    }

    // Apply affine transform solidarily to anchor vertices and their Bézier handles
    return this.applyAffineToVertices(this.initialVertices, selectedIds, matrix);
  }

  /**
   * Applies an affine matrix solidarily to selected vertices and their handles.
   */
  public applyAffineToVertices(
    vertices: PathVertex[],
    selectedIds: Set<string>,
    matrix: AffineMatrix
  ): PathVertex[] {
    return vertices.map((v) => {
      if (!selectedIds.has(v.id)) return v;

      const p = matrix.applyToPoint({ x: v.x, y: v.y });
      const hIn = v.handleIn ? matrix.applyToPoint(v.handleIn) : undefined;
      const hOut = v.handleOut ? matrix.applyToPoint(v.handleOut) : undefined;

      return {
        ...v,
        x: p.x,
        y: p.y,
        handleIn: hIn,
        handleOut: hOut,
      };
    });
  }

  /**
   * Completes the transformation and cleans up temporary state.
   */
  public finishTransform(): void {
    this.activeHandle = null;
    this.initialVertices = [];
    this.initialBox = null;
    this.initialCentroid = null;
  }

  /**
   * Renders the micro-Bounding Box, centroid indicator, transform handles, and Mini-HUD.
   */
  public renderOverlay(
    element: VectorElement,
    selectedIds: Set<string>,
    zoom: number,
    _activeHandle?: string | null
  ): string {
    if (selectedIds.size < 2) return '';
    const selVerts = this.getSelectedVertices(element, selectedIds);
    if (selVerts.length < 2) return '';

    const box = NodeSubgroupTransformController.computeBoundingBox(selVerts);
    if (!box) return '';

    const centroid = NodeSubgroupTransformController.computeCentroid(selVerts);
    const z = zoom || 1;
    let html = '';

    const strokeColor = this.mode === 'rotate' ? '#8b5cf6' : this.mode === 'move' ? '#10b981' : '#6366f1';

    // 1. Micro-Bounding Box outline
    html += `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="none" stroke="${strokeColor}" stroke-width="${1 / z}" stroke-dasharray="${3 / z} ${3 / z}" vector-effect="non-scaling-stroke" />`;

    // 2. Centroid Marker C = (1/k) sum(P_i)
    html += `
      <g class="subgroup-centroid-marker" transform="translate(${centroid.x}, ${centroid.y}) scale(${1 / z})" style="pointer-events: none;">
        <circle cx="0" cy="0" r="4.5" fill="none" stroke="${strokeColor}" stroke-width="1.2" />
        <circle cx="0" cy="0" r="1.5" fill="${strokeColor}" />
        <line x1="-7" y1="0" x2="-3" y2="0" stroke="${strokeColor}" stroke-width="1.2" />
        <line x1="3" y1="0" x2="7" y2="0" stroke="${strokeColor}" stroke-width="1.2" />
        <line x1="0" y1="-7" x2="0" y2="-3" stroke="${strokeColor}" stroke-width="1.2" />
        <line x1="0" y1="3" x2="0" y2="7" stroke="${strokeColor}" stroke-width="1.2" />
      </g>
    `;

    // 3. Handles according to mode
    if (this.mode === 'scale') {
      const handles: { key: string; x: number; y: number }[] = [
        { key: 'nw', x: box.x, y: box.y },
        { key: 'n', x: box.cx, y: box.y },
        { key: 'ne', x: box.x + box.width, y: box.y },
        { key: 'e', x: box.x + box.width, y: box.cy },
        { key: 'se', x: box.x + box.width, y: box.y + box.height },
        { key: 's', x: box.cx, y: box.y + box.height },
        { key: 'sw', x: box.x, y: box.y + box.height },
        { key: 'w', x: box.x, y: box.cy },
      ];

      const hSize = 7 / z;
      const hHalf = hSize / 2;
      const hRx = 1 / z;
      handles.forEach((hPos) => {
        html += `<rect x="${hPos.x - hHalf}" y="${hPos.y - hHalf}" width="${hSize}" height="${hSize}" rx="${hRx}" fill="#ffffff" stroke="#6366f1" stroke-width="${1.2 / z}" vector-effect="non-scaling-stroke" />`;
      });
    } else if (this.mode === 'rotate') {
      // Stem handle
      const stemPt: Point = { x: box.cx, y: box.y - 18 / z };
      html += `<line x1="${box.cx}" y1="${box.y}" x2="${stemPt.x}" y2="${stemPt.y}" stroke="#8b5cf6" stroke-width="${1 / z}" stroke-dasharray="${2 / z} ${2 / z}" vector-effect="non-scaling-stroke" />`;
      html += `<circle cx="${stemPt.x}" cy="${stemPt.y}" r="${4 / z}" fill="#8b5cf6" stroke="#ffffff" stroke-width="${1.2 / z}" vector-effect="non-scaling-stroke" />`;

      // 4 corner rotation handles
      const cornerHandles: { x: number; y: number }[] = [
        { x: box.x, y: box.y },
        { x: box.x + box.width, y: box.y },
        { x: box.x + box.width, y: box.y + box.height },
        { x: box.x, y: box.y + box.height },
      ];
      cornerHandles.forEach((ch) => {
        html += `<circle cx="${ch.x}" cy="${ch.y}" r="${3.5 / z}" fill="#8b5cf6" stroke="#ffffff" stroke-width="${1.2 / z}" vector-effect="non-scaling-stroke" />`;
      });

      // 4 midpoint skew handles
      const skewHandles: { x: number; y: number; isHoriz: boolean }[] = [
        { x: box.cx, y: box.y, isHoriz: true },
        { x: box.cx, y: box.y + box.height, isHoriz: true },
        { x: box.x, y: box.cy, isHoriz: false },
        { x: box.x + box.width, y: box.cy, isHoriz: false },
      ];
      skewHandles.forEach((sh) => {
        const arrowCol = '#a78bfa';
        if (sh.isHoriz) {
          html += `
            <g transform="translate(${sh.x}, ${sh.y}) scale(${1 / z})" style="pointer-events: none;">
              <circle cx="0" cy="0" r="5" fill="#0f172a" fill-opacity="0.9" stroke="#8b5cf6" stroke-width="1.2" />
              <line x1="-2.5" y1="0" x2="2.5" y2="0" stroke="${arrowCol}" stroke-width="1.2" stroke-linecap="round" />
            </g>
          `;
        } else {
          html += `
            <g transform="translate(${sh.x}, ${sh.y}) scale(${1 / z})" style="pointer-events: none;">
              <circle cx="0" cy="0" r="5" fill="#0f172a" fill-opacity="0.9" stroke="#8b5cf6" stroke-width="1.2" />
              <line x1="0" y1="-2.5" x2="0" y2="2.5" stroke="${arrowCol}" stroke-width="1.2" stroke-linecap="round" />
            </g>
          `;
        }
      });
    }

    // 4. Floating Mini-HUD
    const hudBox: BoundingBox = this.mode === 'rotate'
      ? { ...box, y: box.y - 18 / z }
      : box;
    html += this.miniHud.renderOverlay(hudBox, this.mode, z);

    return html;
  }

  /**
   * Resolves the appropriate hover cursor over the subgroup handles or Mini-HUD.
   */
  public getHoverCursor(
    element: VectorElement,
    selectedIds: Set<string>,
    pt: Point,
    zoom: number
  ): string | null {
    const hit = this.hitTest(element, selectedIds, pt, zoom);
    if (!hit) return null;

    if (hit.type === 'hud') return 'pointer';
    if (hit.type === 'centroid') return 'crosshair';

    if (hit.type === 'handle' && hit.handle) {
      if (hit.handle === 'rotate-stem' || hit.handle.startsWith('rotate-')) return 'grab';
      if (hit.handle === 'skew-n' || hit.handle === 'skew-s') return 'ew-resize';
      if (hit.handle === 'skew-w' || hit.handle === 'skew-e') return 'ns-resize';

      switch (hit.handle) {
        case 'nw':
        case 'se':
          return 'nwse-resize';
        case 'ne':
        case 'sw':
          return 'nesw-resize';
        case 'n':
        case 's':
          return 'ns-resize';
        case 'w':
        case 'e':
          return 'ew-resize';
      }
    }

    return null;
  }
}
