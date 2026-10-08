/**
 * CAPA L2 / L4: Descriptores de Overlays Tipados (OverlayDescriptor)
 * Inspirado en vectorcraft_render::overlay.
 *
 * Estructuras de datos puras para representar marcas visuales efímeras
 * (recuadros de selección, tiradores de control, guías de alineación,
 * fantasmas de dibujo Bézier) sin concatenar cadenas SVG en las herramientas.
 */

export interface BoxOverlay {
  readonly type: 'box';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly strokeDasharray?: string;
  readonly fill?: string;
}

export interface LineOverlay {
  readonly type: 'line';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly strokeDasharray?: string;
}

export interface CircleOverlay {
  readonly type: 'circle';
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly fill?: string;
}

export interface HandleOverlay {
  readonly type: 'handle';
  readonly x: number;
  readonly y: number;
  readonly size?: number;
  readonly kind?: 'square' | 'circle' | 'diamond';
  readonly active?: boolean;
  readonly color?: string;
}

export interface PathOverlay {
  readonly type: 'path';
  readonly d: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly strokeDasharray?: string;
  readonly fill?: string;
}

export interface GuideOverlay {
  readonly type: 'guide';
  readonly orientation: 'h' | 'v';
  readonly position: number;
  readonly color?: string;
}

export type OverlayDescriptor =
  | BoxOverlay
  | LineOverlay
  | CircleOverlay
  | HandleOverlay
  | PathOverlay
  | GuideOverlay;
