/**
 * Declarative descriptors for transient canvas overlay visual marks.
 * 
 * Replaces unstructured SVG string concatenation across tools and engine layers,
 * enabling deterministic rendering, efficient DOM element recycling, and strict
 * separation of concerns between tools (data/logic) and rendering (DOM/Canvas).
 */

export interface BaseOverlayDescriptor {
  id?: string;
  className?: string;
  opacity?: number;
  pointerEvents?: 'none' | 'auto' | 'all';
}

export interface LineOverlayDescriptor extends BaseOverlayDescriptor {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  vectorEffect?: 'non-scaling-stroke' | 'none';
}

export interface RectOverlayDescriptor extends BaseOverlayDescriptor {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  fill?: string;
  rx?: number;
  ry?: number;
  vectorEffect?: 'non-scaling-stroke' | 'none';
}

export interface CircleOverlayDescriptor extends BaseOverlayDescriptor {
  type: 'circle';
  cx: number;
  cy: number;
  r: number;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  fill?: string;
  fillOpacity?: number;
  vectorEffect?: 'non-scaling-stroke' | 'none';
}

export interface PathOverlayDescriptor extends BaseOverlayDescriptor {
  type: 'path';
  d: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  fill?: string;
  vectorEffect?: 'non-scaling-stroke' | 'none';
}

export interface TextOverlayDescriptor extends BaseOverlayDescriptor {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fill?: string;
  fontSize?: number;
  fontFamily?: string;
  textAnchor?: 'start' | 'middle' | 'end';
  dominantBaseline?: 'auto' | 'central' | 'hanging' | 'middle';
}

export interface RawOverlayDescriptor extends BaseOverlayDescriptor {
  type: 'raw';
  html: string;
}

export type OverlayDescriptor =
  | LineOverlayDescriptor
  | RectOverlayDescriptor
  | CircleOverlayDescriptor
  | PathOverlayDescriptor
  | TextOverlayDescriptor
  | RawOverlayDescriptor;
