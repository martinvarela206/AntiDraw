import { VectorElement, PathVertex, Point, VectorModel } from '../VectorModel.js';
import { PathGeometryCompiler } from '../geometry/PathGeometryCompiler.js';

export interface BlendConfig {
  steps: number; // 1 to 50 (default: 5)
  startNodeAIndex: number; // Starting Node 0 on figure A
  startNodeBIndex: number; // Starting Node 0 on figure B
  reverseDirectionA: boolean; // Clockwise vs Counterclockwise on figure A
  reverseDirectionB: boolean; // Clockwise vs Counterclockwise on figure B (anti-twisting)
}

/**
 * ARCHITECTURAL RATIONALE: Parametric Morphological Blend Engine (BlendEngine)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Encapsulates morphological vertex interpolation, color blending, node index alignment,
 *    and curve orientation reversal (anti-twisting) across two vector contours.
 *
 * 2. Resolution of Curve Twisting / Retorcimiento (MDWiki 8.8):
 *    When blending two distinct vector figures A and B, disparate vertex ordering or opposite
 *    contour polarities create severe spiral twisting. BlendEngine provides:
 *    - Manual calibration of Node 0 for both figures: startNodeAIndex and startNodeBIndex
 *      cyclically shift the start anchor node.
 *    - Polarity reversal toggle (reverseDirectionB): inverts the direction of figure B,
 *      swapping handleIn and handleOut tangents to immediately untwist the blend ribbon.
 *
 * 3. Equal-Length Topological Resampling:
 *    When figure A has N_A vertices and figure B has N_B vertices, the geometry is resampled
 *    or subdivided so both contours possess identical vertex counts M = max(N_A, N_B, 4),
 *    yielding smooth C1 morphing without index mismatch.
 *
 * 4. Non-Destructive Group Container:
 *    Intermediate interpolated steps are wrapped inside a live parametric group (<g data-blend="true">)
 *    retaining full inspection and editing capabilities until explicitly expanded into static vectors.
 */
export class BlendEngine {
  public static readonly BLEND_ATTR = 'data-blend';
  public static readonly STEPS_ATTR = 'data-blend-steps';
  public static readonly START_A_ATTR = 'data-blend-start-a';
  public static readonly START_B_ATTR = 'data-blend-start-b';
  public static readonly REV_A_ATTR = 'data-blend-rev-a';
  public static readonly REV_B_ATTR = 'data-blend-rev-b';
  public static readonly SOURCE_A_ATTR = 'data-blend-source-a';
  public static readonly SOURCE_B_ATTR = 'data-blend-source-b';

  /**
   * Checks whether an element is a live parametric blend container group.
   */
  public static isBlendGroup(element: VectorElement): boolean {
    return element.tagName === 'g' && element.attributes[this.BLEND_ATTR] === 'true';
  }

  /**
   * Extracts current blend configuration from group attributes.
   */
  public static getBlendConfig(element: VectorElement): BlendConfig | null {
    if (!this.isBlendGroup(element)) return null;
    return {
      steps: Math.max(1, Math.min(50, parseInt(element.attributes[this.STEPS_ATTR] || '5', 10) || 5)),
      startNodeAIndex: Math.max(0, parseInt(element.attributes[this.START_A_ATTR] || '0', 10) || 0),
      startNodeBIndex: Math.max(0, parseInt(element.attributes[this.START_B_ATTR] || '0', 10) || 0),
      reverseDirectionA: element.attributes[this.REV_A_ATTR] === 'true',
      reverseDirectionB: element.attributes[this.REV_B_ATTR] === 'true',
    };
  }

  /**
   * Parses RGBA color components from hex or rgb/rgba string.
   */
  public static parseColor(colorStr?: string): { r: number; g: number; b: number; a: number } {
    if (!colorStr || colorStr === 'none' || colorStr === 'transparent') {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    if (colorStr.startsWith('#')) {
      let hex = colorStr.slice(1);
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }
      if (hex.length === 6) {
        const num = parseInt(hex, 16);
        return {
          r: (num >> 16) & 255,
          g: (num >> 8) & 255,
          b: num & 255,
          a: 1,
        };
      }
      if (hex.length === 8) {
        const num = parseInt(hex, 16);
        return {
          r: (num >> 24) & 255,
          g: (num >> 16) & 255,
          b: (num >> 8) & 255,
          a: Number(((num & 255) / 255).toFixed(2)),
        };
      }
    }
    const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (m) {
      return {
        r: parseInt(m[1], 10),
        g: parseInt(m[2], 10),
        b: parseInt(m[3], 10),
        a: m[4] !== undefined ? parseFloat(m[4]) : 1,
      };
    }
    return { r: 0, g: 0, b: 0, a: 1 };
  }

  /**
   * Interpolates linearly between two RGBA colors at parameter t.
   */
  public static interpolateColor(
    c1: { r: number; g: number; b: number; a: number },
    c2: { r: number; g: number; b: number; a: number },
    t: number
  ): string {
    if (c1.a === 0 && c2.a === 0) return 'none';
    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);
    const a = Number((c1.a + (c2.a - c1.a) * t).toFixed(2));
    if (a >= 0.99) {
      return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    }
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  /**
   * Extracts clean, structured vertices from an element.
   */
  public static extractVertices(element: VectorElement): PathVertex[] {
    if (element.vertices && element.vertices.length > 0) {
      return element.vertices.map((v) => ({ ...v }));
    }
    if (element.attributes.d) {
      return PathGeometryCompiler.parsePathD(element.attributes.d);
    }
    if (element.tagName === 'line') {
      const x1 = parseFloat(element.attributes.x1 || '0');
      const y1 = parseFloat(element.attributes.y1 || '0');
      const x2 = parseFloat(element.attributes.x2 || '0');
      const y2 = parseFloat(element.attributes.y2 || '0');
      return [
        { id: 'lv1', x: x1, y: y1, command: 'M', nodeType: 'sharp' },
        { id: 'lv2', x: x2, y: y2, command: 'L', nodeType: 'sharp' },
      ];
    }
    if (element.tagName === 'rect') {
      const x = parseFloat(element.attributes.x || '0');
      const y = parseFloat(element.attributes.y || '0');
      const w = parseFloat(element.attributes.width || '100');
      const h = parseFloat(element.attributes.height || '100');
      return [
        { id: 'rv1', x, y, command: 'M', nodeType: 'sharp' },
        { id: 'rv2', x: x + w, y, command: 'L', nodeType: 'sharp' },
        { id: 'rv3', x: x + w, y: y + h, command: 'L', nodeType: 'sharp' },
        { id: 'rv4', x, y: y + h, command: 'L', nodeType: 'sharp' },
      ];
    }
    return [];
  }

  /**
   * Resamples or subdivides a vertex list so that it contains targetCount vertices.
   */
  public static equalizeVertices(verts: PathVertex[], targetCount: number, isClosed: boolean): PathVertex[] {
    if (verts.length === 0) return [];
    if (verts.length === targetCount) {
      return verts.map((v, i) => ({ ...v, id: `v_eq_${i}` }));
    }

    const n = verts.length;
    const result: PathVertex[] = [];
    const totalSegs = isClosed ? n : n - 1;

    for (let i = 0; i < targetCount; i++) {
      const globalT = isClosed ? i / targetCount : i / (targetCount - 1);
      const segParam = globalT * totalSegs;
      const segIdx = Math.min(Math.floor(segParam), totalSegs - 1);
      const localT = segParam - segIdx;

      const v0 = verts[segIdx];
      const v1 = verts[(segIdx + 1) % n];

      const p0 = { x: v0.x, y: v0.y };
      const p3 = { x: v1.x, y: v1.y };

      let x: number;
      let y: number;
      let handleIn: Point | undefined;
      let handleOut: Point | undefined;

      if (v0.handleOut || v1.handleIn) {
        const p1 = v0.handleOut || p0;
        const p2 = v1.handleIn || p3;
        const inv = 1 - localT;
        x = inv * inv * inv * p0.x + 3 * inv * inv * localT * p1.x + 3 * inv * localT * localT * p2.x + localT * localT * localT * p3.x;
        y = inv * inv * inv * p0.y + 3 * inv * inv * localT * p1.y + 3 * inv * localT * localT * p2.y + localT * localT * localT * p3.y;

        // Approximate tangents
        if (v0.handleOut) {
          handleOut = {
            x: x + (p1.x - p0.x) * (1 - localT),
            y: y + (p1.y - p0.y) * (1 - localT),
          };
        }
        if (v1.handleIn) {
          handleIn = {
            x: x + (p2.x - p3.x) * localT,
            y: y + (p2.y - p3.y) * localT,
          };
        }
      } else {
        x = p0.x + (p3.x - p0.x) * localT;
        y = p0.y + (p3.y - p0.y) * localT;
      }

      result.push({
        id: `v_eq_${i}`,
        x: Number(x.toFixed(3)),
        y: Number(y.toFixed(3)),
        command: i === 0 ? 'M' : (v0.handleOut || v1.handleIn ? 'C' : 'L'),
        nodeType: v0.nodeType,
        handleIn,
        handleOut,
      });
    }

    return result;
  }

  /**
   * Cyclically shifts vertices so that newStartIndex becomes index 0.
   */
  public static shiftStartNode(verts: PathVertex[], newStartIndex: number): PathVertex[] {
    const n = verts.length;
    if (n <= 1 || newStartIndex <= 0) return verts.map((v, i) => ({ ...v, command: i === 0 ? 'M' : v.command }));

    const shift = ((newStartIndex % n) + n) % n;
    const shifted: PathVertex[] = [];

    for (let i = 0; i < n; i++) {
      const orig = verts[(i + shift) % n];
      shifted.push({
        ...orig,
        id: `v_shift_${i}`,
        command: i === 0 ? 'M' : orig.command,
      });
    }

    return shifted;
  }

  /**
   * Reverses contour direction (clockwise <-> counterclockwise) and swaps control handles.
   */
  public static reverseContour(verts: PathVertex[]): PathVertex[] {
    const n = verts.length;
    if (n <= 1) return verts;

    const reversed: PathVertex[] = [];
    for (let i = 0; i < n; i++) {
      const srcIdx = (n - i) % n;
      const v = verts[srcIdx];
      reversed.push({
        ...v,
        id: `v_rev_${i}`,
        command: i === 0 ? 'M' : v.command,
        // Swap handleIn and handleOut upon reversal
        handleIn: v.handleOut ? { ...v.handleOut } : undefined,
        handleOut: v.handleIn ? { ...v.handleIn } : undefined,
      });
    }

    return reversed;
  }

  /**
   * Creates a live parametric blend container group between shape A and shape B.
   */
  public static createBlendGroup(
    elementA: VectorElement,
    elementB: VectorElement,
    config: Partial<BlendConfig> = {}
  ): VectorElement {
    const steps = config.steps !== undefined ? Math.max(1, Math.min(50, config.steps)) : 5;
    const startNodeAIndex = config.startNodeAIndex ?? 0;
    const startNodeBIndex = config.startNodeBIndex ?? 0;
    const reverseDirectionA = config.reverseDirectionA ?? false;
    const reverseDirectionB = config.reverseDirectionB ?? false;

    const blendGroup: VectorElement = {
      id: `blend_group_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      tagName: 'g',
      attributes: {
        id: `blend_group_${Date.now().toString(36)}`,
        [this.BLEND_ATTR]: 'true',
        [this.STEPS_ATTR]: steps.toString(),
        [this.START_A_ATTR]: startNodeAIndex.toString(),
        [this.START_B_ATTR]: startNodeBIndex.toString(),
        [this.REV_A_ATTR]: reverseDirectionA ? 'true' : 'false',
        [this.REV_B_ATTR]: reverseDirectionB ? 'true' : 'false',
        [this.SOURCE_A_ATTR]: JSON.stringify(elementA),
        [this.SOURCE_B_ATTR]: JSON.stringify(elementB),
      },
      children: [],
    };

    this.recomputeBlendSteps(blendGroup);
    return blendGroup;
  }

  /**
   * Recomputes and synthesizes all intermediate vector steps inside a blend group.
   */
  public static recomputeBlendSteps(blendGroup: VectorElement): boolean {
    if (!this.isBlendGroup(blendGroup)) return false;

    const rawA = blendGroup.attributes[this.SOURCE_A_ATTR];
    const rawB = blendGroup.attributes[this.SOURCE_B_ATTR];
    if (!rawA || !rawB) return false;

    let elA: VectorElement;
    let elB: VectorElement;
    try {
      elA = JSON.parse(rawA);
      elB = JSON.parse(rawB);
    } catch {
      return false;
    }

    const cfg = this.getBlendConfig(blendGroup);
    if (!cfg) return false;

    let vertsA = this.extractVertices(elA);
    let vertsB = this.extractVertices(elB);

    if (vertsA.length === 0 || vertsB.length === 0) return false;

    const isClosed = elA.isClosed ?? elB.isClosed ?? false;
    const maxNodes = Math.max(vertsA.length, vertsB.length, 4);

    // 1. Equalize vertex count
    vertsA = this.equalizeVertices(vertsA, maxNodes, isClosed);
    vertsB = this.equalizeVertices(vertsB, maxNodes, isClosed);

    // 2. Shift start node (Node 0)
    vertsA = this.shiftStartNode(vertsA, cfg.startNodeAIndex);
    vertsB = this.shiftStartNode(vertsB, cfg.startNodeBIndex);

    // 3. Direction reversal (anti-twisting)
    if (cfg.reverseDirectionA) {
      vertsA = this.reverseContour(vertsA);
    }
    if (cfg.reverseDirectionB) {
      vertsB = this.reverseContour(vertsB);
    }

    // 4. Color and styling interpolation setup
    const fillA = this.parseColor(elA.attributes.fill);
    const fillB = this.parseColor(elB.attributes.fill);
    const strokeA = this.parseColor(elA.attributes.stroke);
    const strokeB = this.parseColor(elB.attributes.stroke);
    const wA = parseFloat(elA.attributes['stroke-width'] || '1') || 1;
    const wB = parseFloat(elB.attributes['stroke-width'] || '1') || 1;
    const opA = elA.attributes.opacity !== undefined ? parseFloat(elA.attributes.opacity) : 1;
    const opB = elB.attributes.opacity !== undefined ? parseFloat(elB.attributes.opacity) : 1;

    // Children array: Shape A, intermediate steps 1..K, Shape B
    const children: VectorElement[] = [];

    // Clone element A as start shape
    const childA: VectorElement = {
      ...elA,
      id: `${blendGroup.id}_source_a`,
      attributes: { ...elA.attributes, id: `${blendGroup.id}_source_a` },
      vertices: vertsA.map((v) => ({ ...v })),
    };
    children.push(childA);

    // Intermediate steps
    const totalSteps = cfg.steps;
    for (let k = 1; k <= totalSteps; k++) {
      const t = k / (totalSteps + 1);

      const stepVerts: PathVertex[] = [];
      for (let i = 0; i < maxNodes; i++) {
        const va = vertsA[i];
        const vb = vertsB[i];

        const x = Number((va.x + (vb.x - va.x) * t).toFixed(3));
        const y = Number((va.y + (vb.y - va.y) * t).toFixed(3));

        let handleIn: Point | undefined;
        let handleOut: Point | undefined;

        if (va.handleIn || vb.handleIn) {
          const inAx = va.handleIn ? va.handleIn.x : va.x;
          const inAy = va.handleIn ? va.handleIn.y : va.y;
          const inBx = vb.handleIn ? vb.handleIn.x : vb.x;
          const inBy = vb.handleIn ? vb.handleIn.y : vb.y;
          handleIn = {
            x: Number((inAx + (inBx - inAx) * t).toFixed(3)),
            y: Number((inAy + (inBy - inAy) * t).toFixed(3)),
          };
        }

        if (va.handleOut || vb.handleOut) {
          const outAx = va.handleOut ? va.handleOut.x : va.x;
          const outAy = va.handleOut ? va.handleOut.y : va.y;
          const outBx = vb.handleOut ? vb.handleOut.x : vb.x;
          const outBy = vb.handleOut ? vb.handleOut.y : vb.y;
          handleOut = {
            x: Number((outAx + (outBx - outAx) * t).toFixed(3)),
            y: Number((outAy + (outBy - outAy) * t).toFixed(3)),
          };
        }

        stepVerts.push({
          id: `step_${k}_v_${i}`,
          x,
          y,
          command: i === 0 ? 'M' : (handleIn || handleOut ? 'C' : 'L'),
          nodeType: t < 0.5 ? va.nodeType : vb.nodeType,
          handleIn,
          handleOut,
        });
      }

      const stepD = PathGeometryCompiler.compilePathD(stepVerts, isClosed);
      const stepFill = this.interpolateColor(fillA, fillB, t);
      const stepStroke = this.interpolateColor(strokeA, strokeB, t);
      const stepWidth = Number((wA + (wB - wA) * t).toFixed(2));
      const stepOp = Number((opA + (opB - opA) * t).toFixed(2));

      const stepEl: VectorElement = {
        id: `${blendGroup.id}_step_${k}`,
        tagName: 'path',
        attributes: {
          id: `${blendGroup.id}_step_${k}`,
          d: stepD,
          fill: stepFill,
          stroke: stepStroke,
          'stroke-width': stepWidth.toString(),
          opacity: stepOp.toString(),
          'data-blend-intermediate': 'true',
          'data-blend-step-index': k.toString(),
        },
        vertices: stepVerts,
        isClosed,
        shapeType: 'path',
      };
      children.push(stepEl);
    }

    // Clone element B as end shape
    const childB: VectorElement = {
      ...elB,
      id: `${blendGroup.id}_source_b`,
      attributes: { ...elB.attributes, id: `${blendGroup.id}_source_b` },
      vertices: vertsB.map((v) => ({ ...v })),
    };
    children.push(childB);

    blendGroup.children = children;
    return true;
  }

  /**
   * Updates configuration on a blend group and recomputes geometry.
   */
  public static updateBlendConfig(blendGroup: VectorElement, patch: Partial<BlendConfig>): boolean {
    if (!this.isBlendGroup(blendGroup)) return false;

    if (patch.steps !== undefined) {
      blendGroup.attributes[this.STEPS_ATTR] = Math.max(1, Math.min(50, patch.steps)).toString();
    }
    if (patch.startNodeAIndex !== undefined) {
      blendGroup.attributes[this.START_A_ATTR] = Math.max(0, patch.startNodeAIndex).toString();
    }
    if (patch.startNodeBIndex !== undefined) {
      blendGroup.attributes[this.START_B_ATTR] = Math.max(0, patch.startNodeBIndex).toString();
    }
    if (patch.reverseDirectionA !== undefined) {
      blendGroup.attributes[this.REV_A_ATTR] = patch.reverseDirectionA ? 'true' : 'false';
    }
    if (patch.reverseDirectionB !== undefined) {
      blendGroup.attributes[this.REV_B_ATTR] = patch.reverseDirectionB ? 'true' : 'false';
    }

    return this.recomputeBlendSteps(blendGroup);
  }

  /**
   * Toggles reverseDirectionB to instantaneously untwist morph ribbons.
   */
  public static toggleReverseDirectionB(blendGroup: VectorElement): boolean {
    const cfg = this.getBlendConfig(blendGroup);
    if (!cfg) return false;
    return this.updateBlendConfig(blendGroup, { reverseDirectionB: !cfg.reverseDirectionB });
  }

  /**
   * Bakes all intermediate and endpoint shapes into independent ordinary vector elements.
   */
  public static expandBlendGroup(blendGroup: VectorElement): VectorElement[] {
    if (!this.isBlendGroup(blendGroup) || !blendGroup.children) return [blendGroup];
    return blendGroup.children.map((child) => {
      const clone = { ...child, attributes: { ...child.attributes } };
      delete clone.attributes['data-blend-intermediate'];
      delete clone.attributes['data-blend-step-index'];
      return clone;
    });
  }
}
