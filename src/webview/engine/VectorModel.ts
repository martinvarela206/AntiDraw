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

export interface VectorElement {
  id: string;
  tagName: string; // 'path' | 'rect' | 'ellipse' | 'circle' | 'line' | 'polygon'
  attributes: Record<string, string>;
  vertices?: PathVertex[];
  isClosed?: boolean;
}

export interface CanvasSettings {
  width: number;
  height: number;
  viewBox: string;
  backgroundColor: string;
}

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

  public loadSvgString(svgText: string): void {
    if (!svgText || !svgText.trim()) {
      this.createDefaultCanvas();
      return;
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');

      if (!svgEl) {
        this.createDefaultCanvas();
        return;
      }

      // Read Canvas settings
      const wAttr = svgEl.getAttribute('width');
      const hAttr = svgEl.getAttribute('height');
      const vbAttr = svgEl.getAttribute('viewBox');
      const styleAttr = svgEl.getAttribute('style') || '';

      let width = wAttr ? parseFloat(wAttr) : 800;
      let height = hAttr ? parseFloat(hAttr) : 600;
      if (isNaN(width) || width <= 0) width = 800;
      if (isNaN(height) || height <= 0) height = 600;

      let viewBox = vbAttr || `0 0 ${width} ${height}`;

      let bg = '#ffffff';
      const bgMatch = styleAttr.match(/background-color:\s*([^;]+)/i);
      if (bgMatch) {
        bg = bgMatch[1].trim();
      } else if (svgEl.getAttribute('background-color')) {
        bg = svgEl.getAttribute('background-color')!;
      }

      this.canvas = { width, height, viewBox, backgroundColor: bg };
      this.elements = [];

      // Parse external <defs> if present, filtering out our standard markers to avoid duplicates
      const defsEl = svgEl.querySelector('defs');
      if (defsEl) {
        const clone = defsEl.cloneNode(true) as HTMLElement;
        const markerIds = [
          'ad-marker-arrow-open-start', 'ad-marker-arrow-open-end',
          'ad-marker-arrow-filled-start', 'ad-marker-arrow-filled-end',
          'ad-marker-arrow-filled-mid', 'ad-marker-circle-dot',
          'ad-marker-square-block', 'ad-marker-bar-cap-start', 'ad-marker-bar-cap-end'
        ];
        markerIds.forEach((id) => {
          const m = clone.querySelector(`#${id}`);
          if (m) m.remove();
        });
        this.customDefs = clone.innerHTML.trim();
      } else {
        this.customDefs = '';
      }

      // Parse child vector elements
      const children = Array.from(svgEl.children);
      children.forEach((child, idx) => {
        const tag = child.tagName.toLowerCase();
        if (['path', 'rect', 'ellipse', 'circle', 'line', 'polygon', 'polyline', 'star'].includes(tag)) {
          const attrs: Record<string, string> = {};
          for (let i = 0; i < child.attributes.length; i++) {
            const attr = child.attributes[i];
            attrs[attr.name] = attr.value;
          }

          if (!attrs.id) {
            attrs.id = `el_${idx}_${Date.now().toString(36)}`;
          }

          const elem: VectorElement = {
            id: attrs.id,
            tagName: tag,
            attributes: attrs,
          };

          const shapeAttrs = ['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points'];

          if (tag === 'path') {
            const nodeTypesStr = attrs['data-node-types'] || '';
            elem.vertices = this.parsePathD(attrs.d || '', nodeTypesStr);
            elem.isClosed = (attrs.d || '').toUpperCase().includes('Z');
            shapeAttrs.forEach((sa) => delete elem.attributes[sa]);
          } else {
            // Normalize shapes into path vertices for unified vector editing
            elem.vertices = this.convertShapeToVertices(tag, attrs);
            elem.tagName = 'path';
            shapeAttrs.forEach((sa) => delete elem.attributes[sa]);

            elem.isClosed = tag !== 'line' && tag !== 'polyline';
            elem.attributes.d = this.compilePathD(elem.vertices, elem.isClosed);
          }

          this.elements.push(elem);
        }
      });
    } catch (e) {
      console.error('Failed to parse SVG string', e);
      this.createDefaultCanvas();
    }
  }

  public toSvgString(): string {
    const { width, height, viewBox, backgroundColor } = this.canvas;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" style="background-color: ${backgroundColor};">\n`;

    // Detect if any vector element makes use of SVG marker terminations
    const hasMarkers = this.elements.some(
      (el) => !!(el.attributes['marker-start'] || el.attributes['marker-mid'] || el.attributes['marker-end'])
    );

    if (hasMarkers || (this.customDefs && this.customDefs.length > 0)) {
      svg += `  <defs id="antidraw-marker-defs">\n`;
      if (hasMarkers) {
        svg += STANDARD_MARKERS_INNER_XML;
      }
      if (this.customDefs && this.customDefs.length > 0) {
        svg += `    ${this.customDefs}\n`;
      }
      svg += `  </defs>\n`;
    }

    this.elements.forEach((el) => {
      if (el.vertices && el.vertices.length > 0) {
        el.attributes.d = this.compilePathD(el.vertices, el.isClosed);
        // Persist nodeType for each vertex so re-parsing restores it reliably
        el.attributes['data-node-types'] = el.vertices.map((v) => v.nodeType).join(',');
      }
      svg += `  <${el.tagName}`;
      for (const [key, val] of Object.entries(el.attributes)) {
        svg += ` ${key}="${escapeXml(val)}"`;
      }
      svg += ` />\n`;
    });

    svg += `</svg>`;
    return svg;
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

  // Calculate canvas bounds encompassing the ViewBox frame AND all vector elements
  public getWorkingCanvasBounds(padding: number = 80): {
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

  private createDefaultCanvas() {
    this.canvas = {
      width: 800,
      height: 600,
      viewBox: '0 0 800 600',
      backgroundColor: '#ffffff',
    };
    this.elements = [];
  }

  // Parse Path 'd' attribute string into structured vertices.
  public parsePathD(d: string, nodeTypesStr: string = ''): PathVertex[] {
    const vertices: PathVertex[] = [];
    if (!d) return vertices;

    // Tokenize command letters and numbers
    const commandRegex = /([a-zA-Z])|([-+]?(?:\d+\.\d+|\d+|\.\d+)(?:[eE][-+]?\d+)?)/g;
    let match: RegExpExecArray | null;
    let currentCmd = '';
    const tokens: (string | number)[] = [];

    while ((match = commandRegex.exec(d)) !== null) {
      if (match[1]) {
        tokens.push(match[1]);
      } else if (match[2]) {
        tokens.push(parseFloat(match[2]));
      }
    }

    let i = 0;
    let curX = 0;
    let curY = 0;
    let vIndex = 0;

    while (i < tokens.length) {
      const token = tokens[i];
      if (typeof token === 'string') {
        currentCmd = token;
        i++;
      }

      const isRelative = currentCmd === currentCmd.toLowerCase() && currentCmd !== 'z';
      const cmdUpper = currentCmd.toUpperCase();

      if (cmdUpper === 'M' || cmdUpper === 'L') {
        if (i + 1 >= tokens.length) break;
        let x = tokens[i] as number;
        let y = tokens[i + 1] as number;
        i += 2;
        if (isRelative) {
          x += curX;
          y += curY;
        }
        curX = x;
        curY = y;

        vertices.push({
          id: `v_${vIndex++}`,
          x,
          y,
          nodeType: 'asymmetric',
          command: cmdUpper as 'M' | 'L',
        });
      } else if (cmdUpper === 'H') {
        if (i >= tokens.length) break;
        let x = tokens[i] as number;
        i += 1;
        if (isRelative) x += curX;
        curX = x;
        vertices.push({
          id: `v_${vIndex++}`,
          x: curX,
          y: curY,
          nodeType: 'asymmetric',
          command: 'L',
        });
      } else if (cmdUpper === 'V') {
        if (i >= tokens.length) break;
        let y = tokens[i] as number;
        i += 1;
        if (isRelative) y += curY;
        curY = y;
        vertices.push({
          id: `v_${vIndex++}`,
          x: curX,
          y: curY,
          nodeType: 'asymmetric',
          command: 'L',
        });
      } else if (cmdUpper === 'C') {
        if (i + 5 >= tokens.length) break;
        let x1 = tokens[i] as number;
        let y1 = tokens[i + 1] as number;
        let x2 = tokens[i + 2] as number;
        let y2 = tokens[i + 3] as number;
        let x = tokens[i + 4] as number;
        let y = tokens[i + 5] as number;
        i += 6;

        if (isRelative) {
          x1 += curX; y1 += curY;
          x2 += curX; y2 += curY;
          x += curX;  y += curY;
        }

        if (vertices.length > 0) {
          const prev = vertices[vertices.length - 1];
          prev.handleOut = { x: x1, y: y1 };
        }

        curX = x;
        curY = y;

        vertices.push({
          id: `v_${vIndex++}`,
          x,
          y,
          handleIn: { x: x2, y: y2 },
          nodeType: 'asymmetric',
          command: 'C',
        });
      } else if (cmdUpper === 'S') {
        if (i + 3 >= tokens.length) break;
        let x2 = tokens[i] as number;
        let y2 = tokens[i + 1] as number;
        let x = tokens[i + 2] as number;
        let y = tokens[i + 3] as number;
        i += 4;

        if (isRelative) {
          x2 += curX; y2 += curY;
          x += curX;  y += curY;
        }

        let x1 = curX;
        let y1 = curY;
        if (vertices.length > 0) {
          const prev = vertices[vertices.length - 1];
          if (prev.handleOut) {
            x1 = 2 * curX - prev.handleOut.x;
            y1 = 2 * curY - prev.handleOut.y;
          }
          prev.handleOut = { x: x1, y: y1 };
        }

        curX = x;
        curY = y;

        vertices.push({
          id: `v_${vIndex++}`,
          x,
          y,
          handleIn: { x: x2, y: y2 },
          nodeType: 'asymmetric',
          command: 'C',
        });
      } else if (cmdUpper === 'Z') {
        // Closing command
      } else {
        i++;
      }
    }

    // Restore nodeType from the encoded attribute
    if (nodeTypesStr) {
      const types = nodeTypesStr.split(',');
      vertices.forEach((v, idx) => {
        const t = types[idx] as NodeType;
        if (t === 'symmetric' || t === 'smooth' || t === 'asymmetric' || t === 'sharp') {
          v.nodeType = t;
        }
      });
    }

    return vertices;
  }

  // Convert vertices back into SVG 'd' string with proper per-subpath closing and Bézier curves
  public compilePathD(vertices: PathVertex[], isClosed?: boolean): string {
    if (!vertices || vertices.length === 0) return '';

    // Group vertices by subpath (each subpath begins with command 'M' or first vertex)
    const subpaths: PathVertex[][] = [];
    let currentSubpath: PathVertex[] = [];

    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      if ((v.command === 'M' || i === 0) && currentSubpath.length > 0) {
        subpaths.push(currentSubpath);
        currentSubpath = [];
      }
      currentSubpath.push(v);
    }
    if (currentSubpath.length > 0) {
      subpaths.push(currentSubpath);
    }

    const dParts: string[] = [];

    for (const sp of subpaths) {
      if (sp.length === 0) continue;
      let spD = `M ${formatNum(sp[0].x)} ${formatNum(sp[0].y)}`;

      for (let i = 1; i < sp.length; i++) {
        const v = sp[i];
        const prev = sp[i - 1];
        if (prev.handleOut || v.handleIn) {
          const h1 = prev.handleOut || { x: prev.x, y: prev.y };
          const h2 = v.handleIn || { x: v.x, y: v.y };
          spD += ` C ${formatNum(h1.x)} ${formatNum(h1.y)} ${formatNum(h2.x)} ${formatNum(h2.y)} ${formatNum(v.x)} ${formatNum(v.y)}`;
        } else {
          spD += ` L ${formatNum(v.x)} ${formatNum(v.y)}`;
        }
      }

      if (isClosed && sp.length > 1) {
        const first = sp[0];
        const last = sp[sp.length - 1];
        if (last.handleOut || first.handleIn) {
          const h1 = last.handleOut || { x: last.x, y: last.y };
          const h2 = first.handleIn || { x: first.x, y: first.y };
          spD += ` C ${formatNum(h1.x)} ${formatNum(h1.y)} ${formatNum(h2.x)} ${formatNum(h2.y)} ${formatNum(first.x)} ${formatNum(first.y)} Z`;
        } else {
          spD += ' Z';
        }
      }

      dParts.push(spD);
    }

    return dParts.join(' ');
  }

  /**
   * Determine whether an element is topologically closed ('Z' subpath, explicit flag, or closed SVG shape).
   */
  public isElementClosed(el: VectorElement): boolean {
    if (el.isClosed !== undefined) return el.isClosed;
    if (el.tagName && ['rect', 'circle', 'ellipse', 'star', 'polygon'].includes(el.tagName)) return true;
    if (el.attributes?.d && /z/i.test(el.attributes.d)) return true;
    return false;
  }

  // Convert shape tags (rect, circle, ellipse, star, line, polygon) to path vertices
  public convertShapeToVertices(tag: string, attrs: Record<string, string>): PathVertex[] {
    const vertices: PathVertex[] = [];
    let idx = 0;
    const mkV = (x: number, y: number, hIn?: Point, hOut?: Point, nodeType: NodeType = 'asymmetric'): PathVertex => ({
      id: `v_${idx++}`,
      x,
      y,
      handleIn: hIn,
      handleOut: hOut,
      nodeType: nodeType,
      command: idx === 1 ? 'M' : (hIn || hOut ? 'C' : 'L')
    });

    if (tag === 'rect') {
      const x = parseFloat(attrs.x || '0');
      const y = parseFloat(attrs.y || '0');
      const w = parseFloat(attrs.width || '100');
      const h = parseFloat(attrs.height || '100');
      const rx = parseFloat(attrs.rx || '0');
      const ry = parseFloat(attrs.ry || attrs.rx || '0');

      if (rx > 0 || ry > 0) {
        const k = 0.5522847498;
        const ox = rx * k;
        const oy = ry * k;
        vertices.push(mkV(x + rx, y, undefined, undefined, 'asymmetric'));
        vertices.push(mkV(x + w - rx, y, undefined, { x: x + w - rx + ox, y: y }, 'smooth'));
        vertices.push(mkV(x + w, y + ry, { x: x + w, y: y + ry - oy }, undefined, 'smooth'));
        vertices.push(mkV(x + w, y + h - ry, undefined, { x: x + w, y: y + h - ry + oy }, 'smooth'));
        vertices.push(mkV(x + w - rx, y + h, { x: x + w - rx + ox, y: y + h }, undefined, 'smooth'));
        vertices.push(mkV(x + rx, y + h, undefined, { x: x + rx - ox, y: y + h }, 'smooth'));
        vertices.push(mkV(x, y + h - ry, { x: x, y: y + h - ry + oy }, undefined, 'smooth'));
        vertices.push(mkV(x, y + ry, undefined, { x: x, y: y + ry - oy }, 'smooth'));
      } else {
        vertices.push(mkV(x, y));
        vertices.push(mkV(x + w, y));
        vertices.push(mkV(x + w, y + h));
        vertices.push(mkV(x, y + h));
      }
    } else if (tag === 'circle' || tag === 'ellipse') {
      const cx = parseFloat(attrs.cx || '50');
      const cy = parseFloat(attrs.cy || '50');
      const rx = tag === 'circle' ? parseFloat(attrs.r || '50') : parseFloat(attrs.rx || '50');
      const ry = tag === 'circle' ? parseFloat(attrs.r || '50') : parseFloat(attrs.ry || '50');
      const k = 0.5522847498;
      const ox = rx * k;
      const oy = ry * k;

      // 4 points (top 12h, right 3h, bottom 6h, left 9h)
      vertices.push(mkV(cx, cy - ry, { x: cx - ox, y: cy - ry }, { x: cx + ox, y: cy - ry }, 'symmetric'));
      vertices.push(mkV(cx + rx, cy, { x: cx + rx, y: cy - oy }, { x: cx + rx, y: cy + oy }, 'symmetric'));
      vertices.push(mkV(cx, cy + ry, { x: cx + ox, y: cy + ry }, { x: cx - ox, y: cy + ry }, 'symmetric'));
      vertices.push(mkV(cx - rx, cy, { x: cx - rx, y: cy + oy }, { x: cx - rx, y: cy - oy }, 'symmetric'));
    } else if (tag === 'star') {
      const cx = parseFloat(attrs.cx || '50');
      const cy = parseFloat(attrs.cy || '50');
      const rx = parseFloat(attrs.rx || attrs.r || '50');
      const ry = parseFloat(attrs.ry || attrs.r || '50');
      const points = parseInt(attrs.points || '5', 10);
      const innerRatio = parseFloat(attrs.innerRatio || '0.4');

      for (let k = 0; k < points * 2; k++) {
        const angle = -Math.PI / 2 + (k * Math.PI) / points;
        const isOuter = k % 2 === 0;
        const curRx = isOuter ? rx : rx * innerRatio;
        const curRy = isOuter ? ry : ry * innerRatio;
        vertices.push(mkV(cx + curRx * Math.cos(angle), cy + curRy * Math.sin(angle)));
      }
    } else if (tag === 'line') {
      const x1 = parseFloat(attrs.x1 || '0');
      const y1 = parseFloat(attrs.y1 || '0');
      const x2 = parseFloat(attrs.x2 || '100');
      const y2 = parseFloat(attrs.y2 || '100');
      vertices.push(mkV(x1, y1));
      vertices.push(mkV(x2, y2));
    } else if (tag === 'polygon' || tag === 'polyline') {
      const pts = (attrs.points || '').trim().split(/\s+|,/);
      for (let i = 0; i < pts.length - 1; i += 2) {
        const x = parseFloat(pts[i]);
        const y = parseFloat(pts[i + 1]);
        if (!isNaN(x) && !isNaN(y)) {
          vertices.push(mkV(x, y));
        }
      }
    }

    return vertices;
  }
}

function formatNum(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
