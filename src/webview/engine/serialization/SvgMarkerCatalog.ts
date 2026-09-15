import { VectorElement } from '../VectorModel.js';

/**
 * ARCHITECTURAL RATIONALE: Standard SVG Marker Catalog (<marker>)
 *
 * 1. Hardware-Accelerated Contextual Inheritance (context-stroke):
 *    In modern SVG2 (Chromium/Webkit/Gecko), `fill="context-stroke"` and `stroke="context-stroke"`
 *    allow marker primitives to automatically inherit the runtime stroke color and opacity of the
 *    referencing vector element without generating duplicate <marker> entries for every color variant.
 *
 * 2. Explicit Forward & Reverse Orientation Geometry:
 *    Rather than relying on inconsistent browser edge cases with `orient="auto-start-reverse"`,
 *    dedicated `-start` (pointing outward backwards, refX=1 or 2) and `-end` (pointing forward, refX=8 or 9)
 *    markers are generated with explicit `orient="auto"`. This guarantees absolute geometric fidelity
 *    across standalone vector viewers, Inkscape, Illustrator, and web browsers.
 *
 * 3. Proportional Scaling (markerUnits="strokeWidth"):
 *    Default markerUnits="strokeWidth" ensures that when an illustrator thickens the path stroke,
 *    dimension arrows and end caps scale up proportionally without clipping or visual disconnect.
 */
export const STANDARD_MARKERS_INNER_XML = `    <!-- AntiDraw Standard SVG Markers -->
    <!-- Arrow Open Start (Cota abierta inicial) -->
    <marker id="ad-marker-arrow-open-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 9 1.5 L 1 5 L 9 8.5" fill="none" stroke="context-stroke" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </marker>
    <!-- Arrow Open End (Cota abierta final) -->
    <marker id="ad-marker-arrow-open-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 1 1.5 L 9 5 L 1 8.5" fill="none" stroke="context-stroke" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </marker>

    <!-- Arrow Filled Start (Triángulo lleno inicial) -->
    <marker id="ad-marker-arrow-filled-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 10 1.5 L 1 5 L 10 8.5 Z" fill="context-stroke" />
    </marker>
    <!-- Arrow Filled End (Triángulo lleno final) -->
    <marker id="ad-marker-arrow-filled-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 1.5 L 9 5 L 0 8.5 Z" fill="context-stroke" />
    </marker>
    <!-- Arrow Filled Mid (Flecha direccional intermedia) -->
    <marker id="ad-marker-arrow-filled-mid" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 1 1.5 L 9 5 L 1 8.5 Z" fill="context-stroke" />
    </marker>

    <!-- Circle Dot (Punto circular terminal/nodo) -->
    <marker id="ad-marker-circle-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
      <circle cx="5" cy="5" r="3.5" fill="context-stroke" />
    </marker>

    <!-- Square Block (Terminal cuadrado) -->
    <marker id="ad-marker-square-block" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
      <rect x="2" y="2" width="6" height="6" fill="context-stroke" />
    </marker>

    <!-- Bar Cap Start (Remate perpendicular en T inicial) -->
    <marker id="ad-marker-bar-cap-start" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="5" markerHeight="6" orient="auto">
      <line x1="2" y1="1" x2="2" y2="9" stroke="context-stroke" stroke-width="2" stroke-linecap="round" />
    </marker>
    <!-- Bar Cap End (Remate perpendicular en T final) -->
    <marker id="ad-marker-bar-cap-end" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="6" orient="auto">
      <line x1="8" y1="1" x2="8" y2="9" stroke="context-stroke" stroke-width="2" stroke-linecap="round" />
    </marker>\n`;

export interface MarkerTemplate {
  key: string;
  viewBox: string;
  baseRefX: number;
  baseRefY: number;
  markerWidth: number;
  markerHeight: number;
  pos: 'start' | 'mid' | 'end' | 'all';
  innerXml: (color: string) => string;
}

export const MARKER_TEMPLATES: Record<string, MarkerTemplate> = {
  'arrow-open-start': {
    key: 'arrow-open-start',
    viewBox: '0 0 10 10',
    baseRefX: 1,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'start',
    innerXml: (c) => `<path d="M 9 1.5 L 1 5 L 9 8.5" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />`,
  },
  'arrow-open-end': {
    key: 'arrow-open-end',
    viewBox: '0 0 10 10',
    baseRefX: 9,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'end',
    innerXml: (c) => `<path d="M 1 1.5 L 9 5 L 1 8.5" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />`,
  },
  'arrow-filled-start': {
    key: 'arrow-filled-start',
    viewBox: '0 0 10 10',
    baseRefX: 1,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'start',
    innerXml: (c) => `<path d="M 10 1.5 L 1 5 L 10 8.5 Z" fill="${c}" />`,
  },
  'arrow-filled-end': {
    key: 'arrow-filled-end',
    viewBox: '0 0 10 10',
    baseRefX: 9,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'end',
    innerXml: (c) => `<path d="M 0 1.5 L 9 5 L 0 8.5 Z" fill="${c}" />`,
  },
  'arrow-filled-mid': {
    key: 'arrow-filled-mid',
    viewBox: '0 0 10 10',
    baseRefX: 5,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'mid',
    innerXml: (c) => `<path d="M 1 1.5 L 9 5 L 1 8.5 Z" fill="${c}" />`,
  },
  'circle-dot': {
    key: 'circle-dot',
    viewBox: '0 0 10 10',
    baseRefX: 5,
    baseRefY: 5,
    markerWidth: 5,
    markerHeight: 5,
    pos: 'all',
    innerXml: (c) => `<circle cx="5" cy="5" r="3.5" fill="${c}" />`,
  },
  'square-block': {
    key: 'square-block',
    viewBox: '0 0 10 10',
    baseRefX: 5,
    baseRefY: 5,
    markerWidth: 5,
    markerHeight: 5,
    pos: 'all',
    innerXml: (c) => `<rect x="2" y="2" width="6" height="6" fill="${c}" />`,
  },
  'bar-cap-start': {
    key: 'bar-cap-start',
    viewBox: '0 0 10 10',
    baseRefX: 2,
    baseRefY: 5,
    markerWidth: 5,
    markerHeight: 6,
    pos: 'start',
    innerXml: (c) => `<line x1="2" y1="1" x2="2" y2="9" stroke="${c}" stroke-width="2" stroke-linecap="round" />`,
  },
  'bar-cap-end': {
    key: 'bar-cap-end',
    viewBox: '0 0 10 10',
    baseRefX: 8,
    baseRefY: 5,
    markerWidth: 5,
    markerHeight: 6,
    pos: 'end',
    innerXml: (c) => `<line x1="8" y1="1" x2="8" y2="9" stroke="${c}" stroke-width="2" stroke-linecap="round" />`,
  },
};

/**
 * ARCHITECTURAL RATIONALE: Dedicated SVG Marker Catalog & Defs Compiler
 *
 * Segregates standard marker definitions, contextual inheritance templates, and
 * element-specific customized marker compilation away from the core SvgSerializer.
 */
export class SvgMarkerCatalog {
  /**
   * Evaluates if any vector element makes use of SVG marker terminations.
   */
  public static hasMarkers(elements: VectorElement[]): boolean {
    return elements.some(
      (el) => !!(el.attributes['marker-start'] || el.attributes['marker-mid'] || el.attributes['marker-end'])
    );
  }

  /**
   * ARCHITECTURAL RATIONALE: Dynamic & Parametric SVG Markers with Offset & Sizing Support
   *
   * 1. Baseline Global Catalog:
   *    Always emits STANDARD_MARKERS_INNER_XML for default marker IDs without customization.
   *
   * 2. Parametric Marker Offsets & Sizing:
   *    - Offsets: shifts refX along curve tangents to eliminate protruding stroke butt caps.
   *    - Independent Sizing: scales markerWidth and markerHeight based on data-marker-size.
   *    - Scaling Units: supports markerUnits="strokeWidth" (relative, default) or "userSpaceOnUse" (absolute px).
   *
   * 3. Self-Healing Element-Scoped Marker IDs:
   *    If an element has customized markers (offset != 0, custom size, or absolute units), SvgMarkerCatalog compiles
   *    dedicated <marker id="ad-marker-${tplKey}-${el.id}"> in <defs> and synchronizes
   *    the element's marker-start/mid/end attributes to point to the customized definition.
   */
  public static compileElementMarkers(elements: VectorElement[]): string {
    let out = STANDARD_MARKERS_INNER_XML;

    elements.forEach((el) => {
      const offset = parseFloat(el.attributes['data-marker-offset'] || '0') || 0;
      const markerSize = el.attributes['data-marker-size'] ? parseFloat(el.attributes['data-marker-size']) : 6;
      const markerUnits = el.attributes['data-marker-units'] || 'strokeWidth';
      const markerColor = el.attributes['data-marker-color'] || 'context-stroke';

      const isCustom =
        offset !== 0 ||
        el.attributes['data-marker-size'] !== undefined ||
        el.attributes['data-marker-units'] !== undefined ||
        (el.attributes['data-marker-color'] !== undefined && el.attributes['data-marker-color'] !== 'context-stroke');
      if (!isCustom) return;

      const checkMarker = (attrName: 'marker-start' | 'marker-mid' | 'marker-end', pos: 'start' | 'mid' | 'end') => {
        const val = el.attributes[attrName];
        if (!val || val === 'none') return;

        let matchKey: string | null = null;
        for (const k of Object.keys(MARKER_TEMPLATES)) {
          if (val.includes(k)) {
            matchKey = k;
            break;
          }
        }
        if (!matchKey) return;

        const tpl = MARKER_TEMPLATES[matchKey];
        let refX = tpl.baseRefX;
        if (pos === 'start') {
          refX = Math.round((tpl.baseRefX + offset) * 100) / 100;
        } else {
          refX = Math.round((tpl.baseRefX - offset) * 100) / 100;
        }

        const sizeScale = markerSize / 6;
        const mw = Math.round(tpl.markerWidth * sizeScale * 100) / 100;
        const mh = Math.round(tpl.markerHeight * sizeScale * 100) / 100;

        const customId = `ad-marker-${matchKey}-${el.id}`;
        el.attributes[attrName] = `url(#${customId})`;

        out += `    <marker id="${customId}" viewBox="${tpl.viewBox}" refX="${refX}" refY="${tpl.baseRefY}" markerWidth="${mw}" markerHeight="${mh}" markerUnits="${markerUnits}" orient="auto">\n`;
        out += `      ${tpl.innerXml(markerColor)}\n`;
        out += `    </marker>\n`;
      };

      checkMarker('marker-start', 'start');
      checkMarker('marker-mid', 'mid');
      checkMarker('marker-end', 'end');
    });

    return out;
  }
}
