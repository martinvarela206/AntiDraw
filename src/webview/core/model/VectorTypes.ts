import { Point, PointUtils } from '../geom/Point.js';

export type { Point };
export { PointUtils };

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
  tagName: string; // 'path' | 'rect' | 'ellipse' | 'circle' | 'line' | 'polygon' | 'polyline' | 'opaque' ...
  attributes: Record<string, string>;
  vertices?: PathVertex[];
  isClosed?: boolean;
  isParametric?: boolean;
  shapeType?: ParametricShapeType | 'path' | 'star' | 'opaque';
  children?: VectorElement[];
  textContent?: string;
  rawInnerXml?: string;
  isOpaque?: boolean;
  dirty?: boolean;
}

export interface CanvasSettings {
  width: number;
  height: number;
  viewBox: string;
  backgroundColor: string;
  currentColor?: string;
  preserveAspectRatio?: string;
  svgFill?: string;
  svgStroke?: string;
  svgStrokeWidth?: string;
  svgStrokeLinecap?: string;
  svgStrokeLinejoin?: string;
  precision?: number;
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

export interface GuideLine {
  id: string;
  orientation: 'horizontal' | 'vertical' | 'angled';
  position: number;
  angle: number; // Angle in degrees: 0 = horizontal (left-to-right), 90 = vertical (top-to-bottom)
  pivotX: number; // Center pivot point X in canvas coordinates
  pivotY: number; // Center pivot point Y in canvas coordinates
  color?: string; // Guide line color, default cyan (#00f0ff)
  visible?: boolean; // Visibility toggle (default true)
  locked?: boolean; // Lock toggle preventing accidental selection or drag
  mode?: 'move' | 'rotate'; // Interactive mode: 'move' (only center handle) or 'rotate' (center + rotation markers)
}

