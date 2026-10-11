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
 *    dedicated `-start` (pointing outward backwards) and `-end` (pointing forward) markers are generated
 *    with explicit `orient="auto"`. This guarantees absolute geometric fidelity across standalone vector
 *    viewers, Inkscape, Illustrator, and web browsers.
 *
 * 3. Tip-on-End vs Extend-Past-End (marker-align):
 *    - Tip-on-End (default): refX is placed at the arrow tip, so the arrow terminates exactly at the vertex.
 *    - Extend-Past-End: refX is placed at the arrow base, so the arrow body projects outward past the vertex
 *      without cutting off the line's physical length.
 *
 * 4. Proportional Scaling (markerUnits="strokeWidth"):
 *    Default markerUnits="strokeWidth" ensures that when an illustrator thickens the path stroke,
 *    dimension arrows and end caps scale up proportionally without clipping or visual disconnect.
 */
export const STANDARD_MARKERS_INNER_XML = `    <!-- AntiDraw Standard SVG Markers -->
    <!-- Arrow Open -->
    <marker id="ad-marker-arrow-open-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 9 1.5 L 1 5 L 9 8.5" fill="none" stroke="context-stroke" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </marker>
    <marker id="ad-marker-arrow-open-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 1 1.5 L 9 5 L 1 8.5" fill="none" stroke="context-stroke" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </marker>

    <!-- Arrow Filled -->
    <marker id="ad-marker-arrow-filled-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 10 1.5 L 1 5 L 10 8.5 Z" fill="context-stroke" />
    </marker>
    <marker id="ad-marker-arrow-filled-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 1.5 L 9 5 L 0 8.5 Z" fill="context-stroke" />
    </marker>
    <marker id="ad-marker-arrow-filled-mid" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 1 1.5 L 9 5 L 1 8.5 Z" fill="context-stroke" />
    </marker>

    <!-- Arrow Stealth -->
    <marker id="ad-marker-arrow-stealth-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 10 1.5 L 1 5 L 10 8.5 L 7 5 Z" fill="context-stroke" />
    </marker>
    <marker id="ad-marker-arrow-stealth-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 1.5 L 9 5 L 0 8.5 L 3 5 Z" fill="context-stroke" />
    </marker>
    <marker id="ad-marker-arrow-stealth-mid" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 1 1.5 L 9 5 L 1 8.5 L 4 5 Z" fill="context-stroke" />
    </marker>

    <!-- Arrow Triangle Wide -->
    <marker id="ad-marker-arrow-triangle-wide-start" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <polygon points="9,0.5 0,5 9,9.5" fill="context-stroke" />
    </marker>
    <marker id="ad-marker-arrow-triangle-wide-end" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <polygon points="1,0.5 10,5 1,9.5" fill="context-stroke" />
    </marker>
    <marker id="ad-marker-arrow-triangle-wide-mid" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <polygon points="1,0.5 10,5 1,9.5" fill="context-stroke" />
    </marker>

    <!-- Arrow Concave -->
    <marker id="ad-marker-arrow-concave-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 10 1 Q 6 5 10 9 L 1 5 Z" fill="context-stroke" />
    </marker>
    <marker id="ad-marker-arrow-concave-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 1 Q 4 5 0 9 L 9 5 Z" fill="context-stroke" />
    </marker>
    <marker id="ad-marker-arrow-concave-mid" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 1 Q 4 5 0 9 L 9 5 Z" fill="context-stroke" />
    </marker>

    <!-- Circle Dot & Open -->
    <marker id="ad-marker-circle-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
      <circle cx="5" cy="5" r="3.5" fill="context-stroke" />
    </marker>
    <marker id="ad-marker-circle-open" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
      <circle cx="5" cy="5" r="3.5" fill="none" stroke="context-stroke" stroke-width="1.8" />
    </marker>

    <!-- Diamond -->
    <marker id="ad-marker-diamond" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
      <polygon points="5,1 9,5 5,9 1,5" fill="context-stroke" />
    </marker>

    <!-- Square Block & Open -->
    <marker id="ad-marker-square-block" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
      <rect x="2" y="2" width="6" height="6" fill="context-stroke" />
    </marker>
    <marker id="ad-marker-square-open" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
      <rect x="2" y="2" width="6" height="6" fill="none" stroke="context-stroke" stroke-width="1.8" />
    </marker>

    <!-- Bar Cap -->
    <marker id="ad-marker-bar-cap-start" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="5" markerHeight="6" orient="auto">
      <line x1="2" y1="1" x2="2" y2="9" stroke="context-stroke" stroke-width="2" stroke-linecap="round" />
    </marker>
    <marker id="ad-marker-bar-cap-end" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="6" orient="auto">
      <line x1="8" y1="1" x2="8" y2="9" stroke="context-stroke" stroke-width="2" stroke-linecap="round" />
    </marker>

    <!-- Slash -->
    <marker id="ad-marker-slash" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="6" orient="auto">
      <line x1="2" y1="8" x2="8" y2="2" stroke="context-stroke" stroke-width="2" stroke-linecap="round" />
    </marker>

    <!-- Bracket -->
    <marker id="ad-marker-bracket-start" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 6 1 L 2 1 L 2 9 L 6 9" fill="none" stroke="context-stroke" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </marker>
    <marker id="ad-marker-bracket-end" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 4 1 L 8 1 L 8 9 L 4 9" fill="none" stroke="context-stroke" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </marker>\n`;

export interface MarkerTemplate {
  key: string;
  viewBox: string;
  tipRefX: number;
  extendRefX: number;
  baseRefX: number;
  baseRefY: number;
  markerWidth: number;
  markerHeight: number;
  pos: 'start' | 'mid' | 'end' | 'all';
  innerXml: (color: string) => string;
}

export const MARKER_TEMPLATES: Record<string, MarkerTemplate> = {
  // 1. Arrow Open
  'arrow-open-start': {
    key: 'arrow-open-start',
    viewBox: '0 0 10 10',
    tipRefX: 1,
    extendRefX: 9,
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
    tipRefX: 9,
    extendRefX: 1,
    baseRefX: 9,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'end',
    innerXml: (c) => `<path d="M 1 1.5 L 9 5 L 1 8.5" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />`,
  },

  // 2. Arrow Filled
  'arrow-filled-start': {
    key: 'arrow-filled-start',
    viewBox: '0 0 10 10',
    tipRefX: 1,
    extendRefX: 10,
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
    tipRefX: 9,
    extendRefX: 0,
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
    tipRefX: 5,
    extendRefX: 5,
    baseRefX: 5,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'mid',
    innerXml: (c) => `<path d="M 1 1.5 L 9 5 L 1 8.5 Z" fill="${c}" />`,
  },

  // 3. Arrow Stealth
  'arrow-stealth-start': {
    key: 'arrow-stealth-start',
    viewBox: '0 0 10 10',
    tipRefX: 1,
    extendRefX: 7,
    baseRefX: 1,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'start',
    innerXml: (c) => `<path d="M 10 1.5 L 1 5 L 10 8.5 L 7 5 Z" fill="${c}" />`,
  },
  'arrow-stealth-end': {
    key: 'arrow-stealth-end',
    viewBox: '0 0 10 10',
    tipRefX: 9,
    extendRefX: 3,
    baseRefX: 9,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'end',
    innerXml: (c) => `<path d="M 0 1.5 L 9 5 L 0 8.5 L 3 5 Z" fill="${c}" />`,
  },
  'arrow-stealth-mid': {
    key: 'arrow-stealth-mid',
    viewBox: '0 0 10 10',
    tipRefX: 5,
    extendRefX: 5,
    baseRefX: 5,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'mid',
    innerXml: (c) => `<path d="M 1 1.5 L 9 5 L 1 8.5 L 4 5 Z" fill="${c}" />`,
  },

  // 4. Arrow Triangle Wide
  'arrow-triangle-wide-start': {
    key: 'arrow-triangle-wide-start',
    viewBox: '0 0 10 10',
    tipRefX: 0,
    extendRefX: 9,
    baseRefX: 0,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'start',
    innerXml: (c) => `<polygon points="9,0.5 0,5 9,9.5" fill="${c}" />`,
  },
  'arrow-triangle-wide-end': {
    key: 'arrow-triangle-wide-end',
    viewBox: '0 0 10 10',
    tipRefX: 10,
    extendRefX: 1,
    baseRefX: 10,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'end',
    innerXml: (c) => `<polygon points="1,0.5 10,5 1,9.5" fill="${c}" />`,
  },
  'arrow-triangle-wide-mid': {
    key: 'arrow-triangle-wide-mid',
    viewBox: '0 0 10 10',
    tipRefX: 5,
    extendRefX: 5,
    baseRefX: 5,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'mid',
    innerXml: (c) => `<polygon points="1,0.5 10,5 1,9.5" fill="${c}" />`,
  },

  // 5. Arrow Concave
  'arrow-concave-start': {
    key: 'arrow-concave-start',
    viewBox: '0 0 10 10',
    tipRefX: 1,
    extendRefX: 6,
    baseRefX: 1,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'start',
    innerXml: (c) => `<path d="M 10 1 Q 6 5 10 9 L 1 5 Z" fill="${c}" />`,
  },
  'arrow-concave-end': {
    key: 'arrow-concave-end',
    viewBox: '0 0 10 10',
    tipRefX: 9,
    extendRefX: 4,
    baseRefX: 9,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'end',
    innerXml: (c) => `<path d="M 0 1 Q 4 5 0 9 L 9 5 Z" fill="${c}" />`,
  },
  'arrow-concave-mid': {
    key: 'arrow-concave-mid',
    viewBox: '0 0 10 10',
    tipRefX: 5,
    extendRefX: 5,
    baseRefX: 5,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'mid',
    innerXml: (c) => `<path d="M 0 1 Q 4 5 0 9 L 9 5 Z" fill="${c}" />`,
  },

  // 6. Circle Dot
  'circle-dot': {
    key: 'circle-dot',
    viewBox: '0 0 10 10',
    tipRefX: 5,
    extendRefX: 5,
    baseRefX: 5,
    baseRefY: 5,
    markerWidth: 5,
    markerHeight: 5,
    pos: 'all',
    innerXml: (c) => `<circle cx="5" cy="5" r="3.5" fill="${c}" />`,
  },

  // 7. Circle Open
  'circle-open': {
    key: 'circle-open',
    viewBox: '0 0 10 10',
    tipRefX: 5,
    extendRefX: 5,
    baseRefX: 5,
    baseRefY: 5,
    markerWidth: 5,
    markerHeight: 5,
    pos: 'all',
    innerXml: (c) => `<circle cx="5" cy="5" r="3.5" fill="none" stroke="${c}" stroke-width="1.8" />`,
  },

  // 8. Diamond
  'diamond': {
    key: 'diamond',
    viewBox: '0 0 10 10',
    tipRefX: 5,
    extendRefX: 5,
    baseRefX: 5,
    baseRefY: 5,
    markerWidth: 5,
    markerHeight: 5,
    pos: 'all',
    innerXml: (c) => `<polygon points="5,1 9,5 5,9 1,5" fill="${c}" />`,
  },

  // 9. Square Block
  'square-block': {
    key: 'square-block',
    viewBox: '0 0 10 10',
    tipRefX: 5,
    extendRefX: 5,
    baseRefX: 5,
    baseRefY: 5,
    markerWidth: 5,
    markerHeight: 5,
    pos: 'all',
    innerXml: (c) => `<rect x="2" y="2" width="6" height="6" fill="${c}" />`,
  },

  // 10. Square Open
  'square-open': {
    key: 'square-open',
    viewBox: '0 0 10 10',
    tipRefX: 5,
    extendRefX: 5,
    baseRefX: 5,
    baseRefY: 5,
    markerWidth: 5,
    markerHeight: 5,
    pos: 'all',
    innerXml: (c) => `<rect x="2" y="2" width="6" height="6" fill="none" stroke="${c}" stroke-width="1.8" />`,
  },

  // 11. Bar Cap
  'bar-cap-start': {
    key: 'bar-cap-start',
    viewBox: '0 0 10 10',
    tipRefX: 2,
    extendRefX: 2,
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
    tipRefX: 8,
    extendRefX: 8,
    baseRefX: 8,
    baseRefY: 5,
    markerWidth: 5,
    markerHeight: 6,
    pos: 'end',
    innerXml: (c) => `<line x1="8" y1="1" x2="8" y2="9" stroke="${c}" stroke-width="2" stroke-linecap="round" />`,
  },

  // 12. Slash
  'slash': {
    key: 'slash',
    viewBox: '0 0 10 10',
    tipRefX: 5,
    extendRefX: 5,
    baseRefX: 5,
    baseRefY: 5,
    markerWidth: 5,
    markerHeight: 6,
    pos: 'all',
    innerXml: (c) => `<line x1="2" y1="8" x2="8" y2="2" stroke="${c}" stroke-width="2" stroke-linecap="round" />`,
  },

  // 13. Bracket
  'bracket-start': {
    key: 'bracket-start',
    viewBox: '0 0 10 10',
    tipRefX: 2,
    extendRefX: 6,
    baseRefX: 2,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'start',
    innerXml: (c) => `<path d="M 6 1 L 2 1 L 2 9 L 6 9" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />`,
  },
  'bracket-end': {
    key: 'bracket-end',
    viewBox: '0 0 10 10',
    tipRefX: 8,
    extendRefX: 4,
    baseRefX: 8,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'end',
    innerXml: (c) => `<path d="M 4 1 L 8 1 L 8 9 L 4 9" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />`,
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
   * 2. Parametric Marker Alignment, Offsets & Sizing:
   *    - Alignment: Tip-on-end (tip) places refX on arrow tip; Extend-past-end (extend) places refX on arrow base.
   *    - Offsets: shifts refX along curve tangents to eliminate protruding stroke butt caps.
   *    - Independent Sizing: scales markerWidth and markerHeight based on data-marker-size.
   *    - Scaling Units: supports markerUnits="strokeWidth" (relative, default) or "userSpaceOnUse" (absolute px).
   *
   * 3. Self-Healing Element-Scoped Marker IDs:
   *    If an element has customized markers (align != 'tip', offset != 0, custom size, or absolute units),
   *    SvgMarkerCatalog compiles dedicated <marker id="ad-marker-${tplKey}-${el.id}"> in <defs> and synchronizes
   *    the element's marker-start/mid/end attributes to point to the customized definition.
   */
  public static compileElementMarkers(elements: VectorElement[]): string {
    let out = STANDARD_MARKERS_INNER_XML;

    elements.forEach((el) => {
      const align = (el.attributes['data-marker-align'] as 'tip' | 'extend') || 'tip';
      const offset = parseFloat(el.attributes['data-marker-offset'] || '0') || 0;
      const markerSize = el.attributes['data-marker-size'] ? parseFloat(el.attributes['data-marker-size']) : 6;
      const markerUnits = el.attributes['data-marker-units'] || 'strokeWidth';
      const markerColor = el.attributes['data-marker-color'] || 'context-stroke';

      const isCustom =
        align !== 'tip' ||
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
        const baseRefX = align === 'extend' ? tpl.extendRefX : tpl.tipRefX;
        let refX = baseRefX;
        if (pos === 'start') {
          refX = Math.round((baseRefX + offset) * 100) / 100;
        } else {
          refX = Math.round((baseRefX - offset) * 100) / 100;
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
