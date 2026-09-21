export interface Point {
  x: number;
  y: number;
}

export type NodeType = 'sharp' | 'asymmetric' | 'smooth' | 'symmetric';

export interface PathVertex {
  id: string;
  x: number;
  y: number;
  handleIn?: Point;  // relative or absolute control point
  handleOut?: Point;
  nodeType: NodeType;
  command: 'M' | 'L' | 'C' | 'Z';
}

export interface PathSegment {
  startIndex: number;
  endIndex: number;
  type: 'L' | 'C';
}

export interface RectCorners {
  tl: number;
  tr: number;
  br: number;
  bl: number;
  mode: 'uniform' | 'independent';
  unit: 'px' | '%';
}

export type ParametricShapeType = 'rect' | 'circle' | 'ellipse' | 'line' | 'polyline' | 'polygon';

export interface VectorElement {
  id: string;
  tagName: string; // 'path' | 'rect' | 'ellipse' | 'circle' | 'line' | 'polygon' | 'polyline'
  attributes: Record<string, string>;
  vertices?: PathVertex[];
  isClosed?: boolean;
  isParametric?: boolean;
  shapeType?: ParametricShapeType | 'path' | 'star';
}

export interface CanvasSettings {
  width: number;
  height: number;
  viewBox: string;
  backgroundColor: string;
}

export interface DropShadowConfig {
  enabled: boolean;
  dx: number;
  dy: number;
  blur: number;
  color: string;
  opacity: number;
}

export interface InnerShadowConfig {
  enabled: boolean;
  dx: number;
  dy: number;
  blur: number;
  color: string;
  opacity: number;
}

export interface GradientStop {
  id: string;
  offset: number; // 0.0 to 1.0
  color: string;
  opacity: number; // 0.0 to 1.0
}

export interface GradientConfig {
  type: 'linear' | 'radial';
  x1?: number; // 0.0 to 1.0 for linear
  y1?: number;
  x2?: number;
  y2?: number;
  cx?: number; // 0.0 to 1.0 for radial
  cy?: number;
  r?: number; // fallback single radius
  rx?: number; // 0.0 to 1.0 horizontal radius
  ry?: number; // 0.0 to 1.0 vertical radius
  fx?: number;
  fy?: number;
  angle?: number; // angle in degrees for linear (0 = left-to-right, 90 = top-to-bottom)
  rotation?: number; // angle in degrees for radial (0 to 360)
  // Fill Transformation Locks (default true when undefined: accompanies vector transform)
  lockScale?: boolean; // true = scales with vector; false = maintains physical screen size
  lockPosition?: boolean; // true = translates with vector; false = remains fixed in canvas coordinates
  lockRotation?: boolean; // true = rotates with vector; false = preserves absolute canvas angle
  stops: GradientStop[];
}

import { SvgSerializer, STANDARD_MARKERS_INNER_XML, escapeXml } from './serialization/SvgSerializer.js';
import { PathGeometryCompiler, formatNum } from './geometry/PathGeometryCompiler.js';
import { RectPrimitive } from './primitives/RectPrimitive.js';
import { EllipsePrimitive } from './primitives/EllipsePrimitive.js';
import { PrimitiveDetector } from './primitives/PrimitiveDetector.js';
import type { CompanionMetadata } from '../bridge/VsCodeBridge.js';

export {
  STANDARD_MARKERS_INNER_XML,
  escapeXml,
  formatNum,
  RectPrimitive,
  EllipsePrimitive,
  PrimitiveDetector,
};

export class VectorModel {
  public canvas: CanvasSettings = {
    width: 800,
    height: 600,
    viewBox: '0 0 800 600',
    backgroundColor: '#ffffff',
  };

  public elements: VectorElement[] = [];
  public customDefs: string = '';

  constructor() {}

  /**
   * Parses an SVG document string and populates the model canvas, custom defs, and vector elements.
   * Fuses companion metadata to rehydrate full parametric editor state.
   */
  public loadSvgString(svgText: string, companionMetadata?: CompanionMetadata | null): void {
    SvgSerializer.loadSvgString(svgText, this, companionMetadata);
  }

  /**
   * Generates hardware-accelerated SVG <filter> definitions for Drop Shadow and Inner Shadow.
   * Delegated to SvgSerializer.
   */
  public compileElementFilters(): string {
    return SvgSerializer.compileElementFilters(this.elements);
  }

  /**
   * Compiles dynamic <linearGradient> and <radialGradient> definitions into <defs>.
   * Delegated to SvgSerializer.
   */
  public compileElementGradients(): string {
    return SvgSerializer.compileElementGradients(this.elements);
  }

  /**
   * Serializes the model canvas and elements into an XML-compliant SVG string.
   * Delegated to SvgSerializer.
   */
  public toSvgString(): string {
    return SvgSerializer.toSvgString(this);
  }

  public getViewBoxBounds(): { minX: number; minY: number; width: number; height: number } {
    const parts = (this.canvas.viewBox || '').trim().split(/[\s,]+/).map(parseFloat);
    if (parts.length === 4 && !parts.some(isNaN)) {
      return { minX: parts[0], minY: parts[1], width: parts[2], height: parts[3] };
    }
    return { minX: 0, minY: 0, width: this.canvas.width || 800, height: this.canvas.height || 600 };
  }

  public setViewBoxBounds(minX: number, minY: number, width: number, height: number): void {
    this.canvas.viewBox = `${minX} ${minY} ${width} ${height}`;
  }

  /**
   * ARCHITECTURAL RATIONALE: Working Canvas Dynamic Bounds Expansion
   *
   * Calculates the minimum enclosing bounding box covering the artboard ViewBox frame
   * and dynamically expands only to a tightly bounded 16px margin beyond any vector node
   * extending outside the ViewBox in the workspace.
   *
   * Padding Rationale:
   * A 16px margin provides comfortable clearance for selection outlines and transform handles
   * without creating excessive dead space or inflating GPU rasterization textures.
   */
  public getWorkingCanvasBounds(padding: number = 16): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  } {
    const vb = this.getViewBoxBounds();
    let minX = vb.minX;
    let minY = vb.minY;
    let maxX = vb.minX + vb.width;
    let maxY = vb.minY + vb.height;

    // Dynamically expand bounds if elements extend beyond viewBox
    this.elements.forEach((el) => {
      if (el.vertices && el.vertices.length > 0) {
        el.vertices.forEach((v) => {
          minX = Math.min(minX, v.x - padding);
          minY = Math.min(minY, v.y - padding);
          maxX = Math.max(maxX, v.x + padding);
          maxY = Math.max(maxY, v.y + padding);
        });
      }
    });

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(maxX - minX, vb.width),
      height: Math.max(maxY - minY, vb.height),
    };
  }

  public createDefaultCanvas() {
    this.canvas = {
      width: 800,
      height: 600,
      viewBox: '0 0 800 600',
      backgroundColor: '#ffffff',
    };
    this.elements = [];
  }

  /**
   * Parse Path 'd' attribute string into structured vertices.
   * Delegated to PathGeometryCompiler.
   */
  public parsePathD(d: string, nodeTypesStr: string = ''): PathVertex[] {
    return PathGeometryCompiler.parsePathD(d, nodeTypesStr);
  }

  /**
   * Converts an elliptical arc to cubic Bézier curve segments.
   * Delegated to PathGeometryCompiler.
   */
  public static arcToBezier(
    x1: number,
    y1: number,
    rx: number,
    ry: number,
    phiDeg: number,
    largeArc: number,
    sweep: number,
    x2: number,
    y2: number
  ): { p1: Point; p2: Point; p: Point }[] {
    return PathGeometryCompiler.arcToBezier(x1, y1, rx, ry, phiDeg, largeArc, sweep, x2, y2);
  }

  /**
   * Compiles native SVG path string for an ellipse, pie, or arc.
   * Delegated to EllipsePrimitive.
   */
  public compileEllipseD(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    type: 'ellipse' | 'pie' | 'arc' = 'ellipse',
    startAngleDeg: number = 0,
    endAngleDeg: number = 360,
    innerRatio: number = 0
  ): string {
    return EllipsePrimitive.compileEllipseD(cx, cy, rx, ry, type, startAngleDeg, endAngleDeg, innerRatio);
  }

  /**
   * Generates unified PathVertex[] representation for ellipse, pie, arc, or donut.
   * Delegated to EllipsePrimitive.
   */
  public convertEllipseToVertices(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    type: 'ellipse' | 'pie' | 'arc' = 'ellipse',
    startAngleDeg: number = 0,
    endAngleDeg: number = 360,
    innerRatio: number = 0
  ): PathVertex[] {
    return EllipsePrimitive.convertEllipseToVertices(cx, cy, rx, ry, type, startAngleDeg, endAngleDeg, innerRatio);
  }

  /**
   * Topological Closing & Coincident Endpoint Unification.
   * Delegated to PathGeometryCompiler.
   */
  public unifyClosingVertices(vertices: PathVertex[], isClosed?: boolean, closingTol: number = 0.5): PathVertex[] {
    return PathGeometryCompiler.unifyClosingVertices(vertices, isClosed, closingTol);
  }

  /**
   * Convert vertices back into SVG 'd' string with proper per-subpath closing and Bézier curves.
   * Delegated to PathGeometryCompiler.
   */
  public compilePathD(vertices: PathVertex[], isClosed?: boolean): string {
    return PathGeometryCompiler.compilePathD(vertices, isClosed);
  }

  /**
   * HISTORICAL ARCHITECTURE (FIX-13): Rigorous Topological Closure Evaluation
   *
   * Problem & SVG Edge Case:
   * When an SVG element lacks closure ('Z' command), browsers automatically simulate a closed polygon
   * whenever `fill` is defined. This produces bizarre artifacts (e.g. diagonal filling chords
   * cutting across unclosed Bézier branches or split nodes).
   *
   * Technical Solution:
   * Determine topological closure across all SVG primitives:
   * - <path>: explicitly checks presence of 'Z' or 'z' command in compiled path data or `el.isClosed`.
   * - <line>, <polyline>: open by nature unless explicitly flagged.
   * - <rect>, <circle>, <ellipse>, <star>, <polygon>: inherently closed polygons.
   */
  public isElementClosed(el: VectorElement): boolean {
    if (el.attributes?.['data-ellipse-type'] === 'arc') return false;
    if (el.isClosed !== undefined) return el.isClosed;
    if (el.tagName && ['rect', 'circle', 'ellipse', 'star', 'polygon'].includes(el.tagName)) return true;
    if (el.tagName && ['line', 'polyline'].includes(el.tagName)) return false;
    if (el.attributes?.d && /[zZ]/.test(el.attributes.d)) return true;
    return false;
  }

  /**
   * Identifies whether a vector element represents an ellipse or circle primitive.
   * Delegated to EllipsePrimitive.
   */
  public isEllipse(el: VectorElement): boolean {
    return EllipsePrimitive.isEllipse(el);
  }

  public isCircle(el: VectorElement): boolean {
    return EllipsePrimitive.isCircle(el);
  }

  /**
   * Identifies whether a vector element represents a parametric rectangle primitive.
   * Delegated to RectPrimitive.
   */
  public isRect(el: VectorElement): boolean {
    return RectPrimitive.isRect(el);
  }

  public isLine(el: VectorElement): boolean {
    return PrimitiveDetector.isLine(el);
  }

  public isPolyline(el: VectorElement): boolean {
    return PrimitiveDetector.isPolyline(el);
  }

  public isPolygon(el: VectorElement): boolean {
    return PrimitiveDetector.isPolygon(el);
  }

  public isStar(el: VectorElement): boolean {
    return PrimitiveDetector.isStar(el);
  }

  /**
   * Extracts corner curvature settings from an element's attributes.
   * Delegated to RectPrimitive.
   */
  public getRectCorners(el: VectorElement, w: number = 100, h: number = 100): RectCorners {
    return RectPrimitive.getRectCorners(el, w, h);
  }

  public parseCornersFromAttrs(attrs: Record<string, string>, w: number = 100, h: number = 100): RectCorners {
    return RectPrimitive.parseCornersFromAttrs(attrs, w, h);
  }

  public calculateEffectiveCorners(
    w: number,
    h: number,
    corners: RectCorners
  ): { tl: number; tr: number; br: number; bl: number } {
    return RectPrimitive.calculateEffectiveCorners(w, h, corners);
  }

  public convertRectToVertices(
    x: number,
    y: number,
    w: number,
    h: number,
    tl: number,
    tr: number,
    br: number,
    bl: number
  ): PathVertex[] {
    return RectPrimitive.convertRectToVertices(x, y, w, h, tl, tr, br, bl);
  }

  public compileRectD(
    x: number,
    y: number,
    w: number,
    h: number,
    tl: number,
    tr: number,
    br: number,
    bl: number
  ): string {
    return RectPrimitive.compileRectD(x, y, w, h, tl, tr, br, bl);
  }

  /**
   * Hybrid Model Primitives & Parametric State Identification.
   * Delegated to PrimitiveDetector.
   */
  public isParametricElement(el: VectorElement): boolean {
    return PrimitiveDetector.isParametricElement(el);
  }

  /**
   * De-structuring Parametric Primitives to Freeform Curves.
   * Delegated to PrimitiveDetector.
   */
  public convertToCurves(element: VectorElement): void {
    PrimitiveDetector.convertToCurves(element, this);
  }

  /**
   * Mandatory De-structuring for Vector-Vector Operations.
   * Delegated to PrimitiveDetector.
   */
  public ensureCurves(element: VectorElement): void {
    PrimitiveDetector.ensureCurves(element, this);
  }

  /**
   * Synchronizes native SVG attributes from internal vertices for clean parametric serialization.
   * Delegated to PrimitiveDetector.
   */
  public syncParametricAttributes(element: VectorElement): void {
    PrimitiveDetector.syncParametricAttributes(element);
  }

  /**
   * Convert shape tags to path vertices.
   * Delegated to PrimitiveDetector.
   */
  public convertShapeToVertices(tag: string, attrs: Record<string, string>): PathVertex[] {
    return PrimitiveDetector.convertShapeToVertices(tag, attrs);
  }

  /**
   * Inverse Geometric Analyzer for SVG Primitives.
   * Delegated to PrimitiveDetector.
   */
  public detectPrimitiveFromPath(el: VectorElement, tolerance: number = 1.0): {
    primitive: ParametricShapeType;
    attributes: Record<string, string>;
  } | null {
    return PrimitiveDetector.detectPrimitiveFromPath(el, this.isElementClosed(el), tolerance);
  }

  /**
   * Converts a <path> element to its recognized native SVG primitive.
   * Delegated to PrimitiveDetector.
   */
  public convertPathToPrimitive(el: VectorElement): ParametricShapeType | null {
    return PrimitiveDetector.convertPathToPrimitive(el, this);
  }
}
