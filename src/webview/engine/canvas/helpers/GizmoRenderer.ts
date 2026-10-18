import { BaseHelper } from './BaseHelper.js';
import { Point } from '../../../core/geom/Point.js';
import { OverlayDescriptor } from '../OverlayDescriptor.js';

export type AnchorKind = 'standard' | 'parametric' | 'first' | 'closing';
export type AnchorState = 'idle' | 'selected' | 'hover';

export interface AnchorVisualOptions {
  kind?: AnchorKind;
  state?: AnchorState;
  nodeType?: 'sharp' | 'asymmetric' | 'smooth' | 'symmetric';
}

/**
 * ARCHITECTURAL RATIONALE: Canonical Visual Design Tokens for Editor Gizmos (GizmoTheme - L1)
 *
 * Enforces strict visual parity across all editing tools (Pen, Polyline, NodeTool, SelectTool).
 * Eliminates ad-hoc colors, disjointed stroke widths, and shape discrepancies between tools.
 */
export const GizmoTheme = {
  anchor: {
    size: 7, // 7px constant screen size
    radius: 3.5,
    selectedRadius: 4.5,
    fillIdle: '#ffffff',
    fillSelected: '#0d99ff',
    fillFirst: '#10b981',
    strokeStandard: '#007be5',
    strokeStandardDark: '#005fb8',
    strokeWhite: '#ffffff',
    strokeWidth: 1.5,
    parametric: {
      fillIdle: '#ffffff',
      fillSelected: '#0d99ff',
      stroke: '#007be5',
      side: 7,
      rx: 1,
    },
  },
  handle: {
    radius: 3.5,
    colorStandard: '#a855f7',
    colorGhost: '#c084fc',
    strokeWhite: '#ffffff',
    strokeWidth: 1,
    armDash: '2 2',
  },
  rubberband: {
    strokeStandard: '#0d99ff',
    strokeActive: '#38bdf8',
    strokeClosing: '#10b981',
    strokeWidth: 1.5,
    dash: '4 3',
    closureHaloRadius: 9,
    closureHaloDash: '3 2',
    closureHaloWidth: 2,
  },
  ghost: {
    stroke: '#0d99ff',
    strokeWidth: 2,
    dash: '4 3',
    fillClosed: 'rgba(13, 153, 255, 0.15)',
    fillOpen: 'none',
  },
} as const;

/**
 * ARCHITECTURAL RATIONALE: Unified Gizmo & Overlay Renderer (GizmoRenderer - L1)
 *
 * 1. Visual Parity & Ergonomic Invariance:
 *    Whether creating a path in PenTool, connecting straight segments in PolylineTool,
 *    or manipulating Bézier splines in NodeTool, all anchor nodes, handles, and ghost
 *    lines share identical geometric signatures, sizes, and colors.
 *
 * 2. Dual Generation (Declarative Descriptors & High-Performance SVG Markup):
 *    Provides methods to emit type-safe `OverlayDescriptor[]` for declarative tools,
 *    as well as fast string markup generation for existing overlay pipelines.
 *
 * 3. Scale Invariance (1 / z):
 *    All physical pixel dimensions automatically scale by inverse zoom factor,
 *    guaranteeing crisp, clickable touch targets across extreme zooms (5% to 3200%).
 */
export class GizmoRenderer extends BaseHelper {
  constructor(id: string = 'gizmo_renderer') {
    super(id);
  }

  public override render(_zoom: number): string {
    return '';
  }

  /**
   * Generates declarative OverlayDescriptors for an anchor node.
   */
  public static renderAnchorDescriptor(
    pt: Point,
    options: AnchorVisualOptions,
    zoom: number
  ): OverlayDescriptor[] {
    const z = Math.max(0.0001, zoom || 1.0);
    const { kind = 'standard', state = 'idle' } = options;
    const descriptors: OverlayDescriptor[] = [];

    if (kind === 'parametric') {
      const side = (state === 'selected' ? 8 : GizmoTheme.anchor.parametric.side) / z;
      const half = side / 2;
      const fill =
        state === 'selected'
          ? GizmoTheme.anchor.parametric.fillSelected
          : GizmoTheme.anchor.parametric.fillIdle;
      const stroke = GizmoTheme.anchor.parametric.stroke;

      descriptors.push({
        type: 'rect',
        x: pt.x - half,
        y: pt.y - half,
        width: side,
        height: side,
        rx: 1 / z,
        fill,
        stroke,
        strokeWidth: GizmoTheme.anchor.strokeWidth,
        vectorEffect: 'non-scaling-stroke',
      });
      return descriptors;
    }

    if (kind === 'first') {
      descriptors.push({
        type: 'circle',
        cx: pt.x,
        cy: pt.y,
        r: 4.5 / z,
        fill: GizmoTheme.anchor.fillFirst,
        stroke: GizmoTheme.anchor.strokeWhite,
        strokeWidth: GizmoTheme.anchor.strokeWidth,
        vectorEffect: 'non-scaling-stroke',
      });
      return descriptors;
    }

    // Standard path anchor: clean rounded rect handle for high tactile visibility
    const isSel = state === 'selected';
    const side = (isSel ? 8 : GizmoTheme.anchor.size) / z;
    const half = side / 2;
    const fill = isSel ? GizmoTheme.anchor.fillSelected : GizmoTheme.anchor.fillIdle;
    const stroke = GizmoTheme.anchor.strokeStandard;

    if (isSel) {
      // Optional subtle halo around selected anchor
      descriptors.push({
        type: 'rect',
        x: pt.x - (half + 2 / z),
        y: pt.y - (half + 2 / z),
        width: side + 4 / z,
        height: side + 4 / z,
        rx: 1.5 / z,
        fill: 'none',
        stroke: GizmoTheme.anchor.fillSelected,
        strokeWidth: 1,
        strokeDasharray: '2 2',
        vectorEffect: 'non-scaling-stroke',
      });
    }

    descriptors.push({
      type: 'rect',
      x: pt.x - half,
      y: pt.y - half,
      width: side,
      height: side,
      rx: 1 / z,
      fill,
      stroke,
      strokeWidth: GizmoTheme.anchor.strokeWidth,
      vectorEffect: 'non-scaling-stroke',
    });

    return descriptors;
  }

  /**
   * Generates declarative OverlayDescriptors for a Bézier handle and connecting arm.
   */
  public static renderHandleDescriptor(
    vertex: Point,
    handle: Point,
    zoom: number,
    color: string = GizmoTheme.handle.colorStandard
  ): OverlayDescriptor[] {
    const z = Math.max(0.0001, zoom || 1.0);
    const r = GizmoTheme.handle.radius / z;

    return [
      {
        type: 'line',
        x1: vertex.x,
        y1: vertex.y,
        x2: handle.x,
        y2: handle.y,
        stroke: color,
        strokeWidth: GizmoTheme.handle.strokeWidth,
        strokeDasharray: GizmoTheme.handle.armDash,
        vectorEffect: 'non-scaling-stroke',
      },
      {
        type: 'circle',
        cx: handle.x,
        cy: handle.y,
        r,
        fill: color,
        stroke: GizmoTheme.handle.strokeWhite,
        strokeWidth: GizmoTheme.handle.strokeWidth,
        vectorEffect: 'non-scaling-stroke',
      },
    ];
  }

  /**
   * Generates declarative OverlayDescriptors for a rubberband drafting segment.
   */
  public static renderRubberbandDescriptor(
    from: Point,
    to: Point,
    zoom: number,
    isClosing: boolean = false
  ): OverlayDescriptor[] {
    const z = Math.max(0.0001, zoom || 1.0);
    const stroke = isClosing
      ? GizmoTheme.rubberband.strokeClosing
      : GizmoTheme.rubberband.strokeStandard;
    const descriptors: OverlayDescriptor[] = [
      {
        type: 'line',
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        stroke,
        strokeWidth: GizmoTheme.rubberband.strokeWidth,
        strokeDasharray: GizmoTheme.rubberband.dash,
        vectorEffect: 'non-scaling-stroke',
      },
    ];

    if (isClosing) {
      descriptors.push({
        type: 'circle',
        cx: to.x,
        cy: to.y,
        r: GizmoTheme.rubberband.closureHaloRadius / z,
        fill: 'none',
        stroke: GizmoTheme.rubberband.strokeClosing,
        strokeWidth: GizmoTheme.rubberband.closureHaloWidth,
        strokeDasharray: GizmoTheme.rubberband.closureHaloDash,
        vectorEffect: 'non-scaling-stroke',
      });
    } else {
      descriptors.push({
        type: 'circle',
        cx: to.x,
        cy: to.y,
        r: 3.5 / z,
        fill: 'rgba(56, 189, 248, 0.35)',
        stroke: GizmoTheme.rubberband.strokeStandard,
        strokeWidth: 1.5,
        strokeDasharray: '2 2',
        vectorEffect: 'non-scaling-stroke',
        pointerEvents: 'none',
      });
    }

    return descriptors;
  }

  /**
   * Generates declarative OverlayDescriptor for ghost path previews.
   */
  public static renderGhostPathDescriptor(
    d: string,
    isClosed: boolean,
    _zoom: number = 1.0
  ): OverlayDescriptor {
    return {
      type: 'path',
      d,
      fill: isClosed ? GizmoTheme.ghost.fillClosed : GizmoTheme.ghost.fillOpen,
      stroke: GizmoTheme.ghost.stroke,
      strokeWidth: GizmoTheme.ghost.strokeWidth,
      strokeDasharray: GizmoTheme.ghost.dash,
      vectorEffect: 'non-scaling-stroke',
    };
  }

  /**
   * Generates scale-invariant HTML markup for an anchor node (for legacy string pipelines).
   */
  public static renderAnchorHtml(pt: Point, options: AnchorVisualOptions, zoom: number): string {
    const inv = BaseHelper.getInverseScale(zoom);
    const { kind = 'standard', state = 'idle' } = options;

    if (kind === 'parametric') {
      const side = state === 'selected' ? 8 : GizmoTheme.anchor.parametric.side;
      const half = side / 2;
      const fill =
        state === 'selected'
          ? GizmoTheme.anchor.parametric.fillSelected
          : GizmoTheme.anchor.parametric.fillIdle;
      const stroke = GizmoTheme.anchor.parametric.stroke;
      return `<g transform="translate(${pt.x}, ${pt.y}) scale(${inv})"><rect x="${-half}" y="${-half}" width="${side}" height="${side}" rx="1" fill="${fill}" stroke="${stroke}" stroke-width="${GizmoTheme.anchor.strokeWidth}" /></g>`;
    }

    if (kind === 'first') {
      return `<g transform="translate(${pt.x}, ${pt.y}) scale(${inv})"><circle cx="0" cy="0" r="4.5" fill="${GizmoTheme.anchor.fillFirst}" stroke="${GizmoTheme.anchor.strokeWhite}" stroke-width="${GizmoTheme.anchor.strokeWidth}" /></g>`;
    }

    const isSel = state === 'selected';
    const side = isSel ? 8 : GizmoTheme.anchor.size;
    const half = side / 2;
    const fill = isSel ? GizmoTheme.anchor.fillSelected : GizmoTheme.anchor.fillIdle;
    const stroke = GizmoTheme.anchor.strokeStandard;

    let halo = '';
    if (isSel) {
      halo = `<rect x="${-(half + 2)}" y="${-(half + 2)}" width="${side + 4}" height="${side + 4}" rx="1.5" fill="none" stroke="${GizmoTheme.anchor.fillSelected}" stroke-width="1" stroke-dasharray="2 2" />`;
    }

    return `<g transform="translate(${pt.x}, ${pt.y}) scale(${inv})">${halo}<rect x="${-half}" y="${-half}" width="${side}" height="${side}" rx="1" fill="${fill}" stroke="${stroke}" stroke-width="${GizmoTheme.anchor.strokeWidth}" /></g>`;
  }

  /**
   * Generates scale-invariant HTML markup for a Bézier handle with connecting arm.
   */
  public static renderHandleHtml(
    vx: number,
    vy: number,
    hx: number,
    hy: number,
    zoom: number,
    color: string = GizmoTheme.handle.colorStandard
  ): string {
    const inv = BaseHelper.getInverseScale(zoom);
    return `<line x1="${vx}" y1="${vy}" x2="${hx}" y2="${hy}" stroke="${color}" stroke-width="${GizmoTheme.handle.strokeWidth}" stroke-dasharray="${GizmoTheme.handle.armDash}" vector-effect="non-scaling-stroke" /><g transform="translate(${hx}, ${hy}) scale(${inv})"><circle cx="0" cy="0" r="${GizmoTheme.handle.radius}" fill="${color}" stroke="${GizmoTheme.handle.strokeWhite}" stroke-width="${GizmoTheme.handle.strokeWidth}" /></g>`;
  }
}
