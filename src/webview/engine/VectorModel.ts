export interface Point {
  x: number;
  y: number;
}

export type NodeType = 'asymmetric' | 'smooth' | 'symmetric';

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

export class VectorModel {
  public canvas: CanvasSettings = {
    width: 800,
    height: 600,
    viewBox: '0 0 800 600',
    backgroundColor: '#ffffff',
  };

  public elements: VectorElement[] = [];

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

        // If closing segment L back to first vertex, don't duplicate
        if (vertices.length > 2 && Math.hypot(curX - vertices[0].x, curY - vertices[0].y) < 0.01) {
          // Closed back to start
        } else {
          vertices.push({
            id: `v_${vIndex++}`,
            x,
            y,
            nodeType: 'asymmetric',
            command: cmdUpper as 'M' | 'L',
          });
        }
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

        // If closing segment C back to first vertex, set handleIn on first vertex
        if (vertices.length > 2 && Math.hypot(curX - vertices[0].x, curY - vertices[0].y) < 0.01) {
          vertices[0].handleIn = { x: x2, y: y2 };
        } else {
          vertices.push({
            id: `v_${vIndex++}`,
            x,
            y,
            handleIn: { x: x2, y: y2 },
            nodeType: 'asymmetric',
            command: 'C',
          });
        }
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

        if (vertices.length > 2 && Math.hypot(curX - vertices[0].x, curY - vertices[0].y) < 0.01) {
          vertices[0].handleIn = { x: x2, y: y2 };
        } else {
          vertices.push({
            id: `v_${vIndex++}`,
            x,
            y,
            handleIn: { x: x2, y: y2 },
            nodeType: 'asymmetric',
            command: 'C',
          });
        }
      } else if (cmdUpper === 'Z') {
        // Closing command
      } else {
        i++;
      }
    }

    // Filter out trailing redundant vertex that duplicates start vertex
    if (vertices.length > 1) {
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) < 0.01) {
        if (last.handleIn) first.handleIn = last.handleIn;
        vertices.pop();
      }
    }

    // Restore nodeType from the encoded attribute
    if (nodeTypesStr) {
      const types = nodeTypesStr.split(',');
      vertices.forEach((v, idx) => {
        const t = types[idx] as NodeType;
        if (t === 'symmetric' || t === 'smooth' || t === 'asymmetric') {
          v.nodeType = t;
        }
      });
    }

    return vertices;
  }

  // Convert vertices back into SVG 'd' string with proper closing Bézier curves
  public compilePathD(vertices: PathVertex[], isClosed?: boolean): string {
    if (!vertices || vertices.length === 0) return '';
    let d = '';

    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      if (i === 0) {
        d += `M ${formatNum(v.x)} ${formatNum(v.y)}`;
      } else {
        const prev = vertices[i - 1];
        if (prev.handleOut || v.handleIn) {
          const h1 = prev.handleOut || { x: prev.x, y: prev.y };
          const h2 = v.handleIn || { x: v.x, y: v.y };
          d += ` C ${formatNum(h1.x)} ${formatNum(h1.y)} ${formatNum(h2.x)} ${formatNum(h2.y)} ${formatNum(v.x)} ${formatNum(v.y)}`;
        } else {
          d += ` L ${formatNum(v.x)} ${formatNum(v.y)}`;
        }
      }
    }

    // Properly close path loop
    if (isClosed && vertices.length > 1) {
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      if (last.handleOut || first.handleIn) {
        const h1 = last.handleOut || { x: last.x, y: last.y };
        const h2 = first.handleIn || { x: first.x, y: first.y };
        d += ` C ${formatNum(h1.x)} ${formatNum(h1.y)} ${formatNum(h2.x)} ${formatNum(h2.y)} ${formatNum(first.x)} ${formatNum(first.y)} Z`;
      } else {
        d += ' Z';
      }
    }

    return d;
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
