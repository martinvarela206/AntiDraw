import { IVectorModelSerializerContext } from './SvgSerializer.js';
import { VectorElement } from '../VectorModel.js';
import { IsomorphicXmlParserFactory } from './XmlParser.js';
import { formatNum } from '../geometry/PathGeometryCompiler.js';

export interface SurgicalPatchOptions {
  excludeContextual?: boolean;
  preserveComments?: boolean;
  preserveNamespaces?: boolean;
  surgical?: boolean;
  precision?: number;
}

/**
 * ARCHITECTURAL RATIONALE: Surgical SVG Modification Pipeline (SurgicalSvgModifier)
 *
 * Implements localized in-place patching of SVG documents:
 * Preserves XML comments, indentation, exact attribute ordering, foreign namespaces (inkscape:,
 * sodipodi:, sketch:, etc.), and currentColor declarations across save cycles without destructive
 * document rewrites.
 */
export class SurgicalSvgModifier {
  public static patchSvgDocument(
    originalSvgText: string,
    ctx: IVectorModelSerializerContext,
    options: SurgicalPatchOptions = {}
  ): string {
    if (!originalSvgText || !originalSvgText.trim()) {
      return '';
    }

    const hasXmlDeclaration = originalSvgText.trim().startsWith('<?xml');

    try {
      const doc = IsomorphicXmlParserFactory.parse(originalSvgText, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');

      if (!svgEl) {
        return originalSvgText;
      }

      const precision = options.precision ?? (ctx.canvas as any).precision ?? 3;

      // 1. Sync Root Canvas Attributes (only if mutated)
      if (ctx.canvas.width && !svgEl.hasAttribute('width')) {
        svgEl.setAttribute('width', formatNum(ctx.canvas.width, precision));
      }
      if (ctx.canvas.height && !svgEl.hasAttribute('height')) {
        svgEl.setAttribute('height', formatNum(ctx.canvas.height, precision));
      }
      if (ctx.canvas.viewBox && svgEl.getAttribute('viewBox') !== ctx.canvas.viewBox) {
        const cleanVb = ctx.canvas.viewBox
          .trim()
          .split(/\s+/)
          .map((n) => formatNum(parseFloat(n), precision))
          .join(' ');
        svgEl.setAttribute('viewBox', cleanVb);
      }

      // 2. Flatten model elements for fast ID lookup
      const collectElements = (list: VectorElement[]): VectorElement[] => {
        const res: VectorElement[] = [];
        for (const el of list) {
          if (options.excludeContextual && el.attributes?.['data-contextual'] === 'true') {
            continue;
          }
          res.push(el);
          if (el.children && el.children.length > 0) {
            res.push(...collectElements(el.children));
          }
        }
        return res;
      };

      const modelElements = collectElements(ctx.elements);
      const modelMap = new Map<string, VectorElement>();
      for (const el of modelElements) {
        if (el.id) {
          modelMap.set(el.id, el);
        }
      }

      // 3. In-Place Attribute Patching for Existing Elements & Tracking
      const touchedDomIds = new Set<string>();

      for (const el of modelElements) {
        if (!el.id) continue;

        let domNode: Element | null = null;
        try {
          domNode = doc.getElementById ? doc.getElementById(el.id) : null;
          if (!domNode) {
            domNode = doc.querySelector(`[id="${el.id}"]`);
          }
        } catch (_err) {
          // Fallback if ID contains special selector characters
          domNode = null;
        }

        if (domNode) {
          touchedDomIds.add(el.id);

          // If path, update geometry from vertices if compiled
          if (el.vertices && el.vertices.length > 0 && (el.tagName === 'path' || el.shapeType === 'path')) {
            const compiledD = ctx.compilePathD(el.vertices, el.isClosed, precision);
            if (compiledD) {
              domNode.setAttribute('d', compiledD);
            }
          }

          // Patch mutated visual & geometric attributes
          const standardSvgAttrs = [
            'd',
            'transform',
            'fill',
            'stroke',
            'stroke-width',
            'stroke-linecap',
            'stroke-linejoin',
            'stroke-dasharray',
            'opacity',
            'fill-opacity',
            'stroke-opacity',
            'x',
            'y',
            'width',
            'height',
            'cx',
            'cy',
            'r',
            'rx',
            'ry',
            'x1',
            'y1',
            'x2',
            'y2',
            'points',
          ];

          const NUMERIC_ATTRS = new Set([
            'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry',
            'x1', 'y1', 'x2', 'y2', 'stroke-width', 'opacity', 'fill-opacity',
            'stroke-opacity'
          ]);

          for (const attrName of standardSvgAttrs) {
            let val = el.attributes[attrName];

            // Fidelity preservation: restore currentColor if tracked
            if (attrName === 'fill' && el.attributes['data-original-fill'] === 'currentColor') {
              if (val === ctx.canvas.currentColor || val === '#000000') {
                val = 'currentColor';
              }
            } else if (attrName === 'stroke' && el.attributes['data-original-stroke'] === 'currentColor') {
              if (val === ctx.canvas.currentColor || val === '#000000') {
                val = 'currentColor';
              }
            }

            if (val !== undefined && val !== null) {
              if (NUMERIC_ATTRS.has(attrName)) {
                const num = parseFloat(val);
                if (Number.isFinite(num) && !val.endsWith('%') && !val.endsWith('em') && !val.endsWith('pt')) {
                  val = formatNum(num, precision);
                }
              } else if (attrName === 'points') {
                val = val
                  .trim()
                  .split(/\s+/)
                  .map((pt) =>
                    pt
                      .split(',')
                      .map((c) => formatNum(parseFloat(c), precision))
                      .join(',')
                  )
                  .join(' ');
              } else if (attrName === 'transform') {
                val = val.replace(
                  /[-+]?(?:\d+\.\d+|\d+|\.\d+)(?:[eE][-+]?\d+)?/g,
                  (numStr) => formatNum(parseFloat(numStr), precision)
                );
              }
              domNode.setAttribute(attrName, val);
            }
          }

          // Clean proprietary internal data-* attributes from exported SVG
          for (let i = domNode.attributes.length - 1; i >= 0; i--) {
            const a = domNode.attributes[i];
            if (a.name.startsWith('data-')) {
              domNode.removeAttribute(a.name);
            }
          }
        } else {
          // Newly created element: mount surgically at the end of root svg
          const newEl = doc.createElementNS('http://www.w3.org/2000/svg', el.tagName);
          if (el.id) newEl.setAttribute('id', el.id);

          if (el.vertices && el.vertices.length > 0 && el.tagName === 'path') {
            const compiledD = ctx.compilePathD(el.vertices, el.isClosed);
            if (compiledD) newEl.setAttribute('d', compiledD);
          }

          for (const [k, v] of Object.entries(el.attributes)) {
            if (!k.startsWith('data-') && v !== undefined && v !== null) {
              newEl.setAttribute(k, v);
            }
          }

          svgEl.appendChild(newEl);
        }
      }

      // 4. Prune Deleted Shape Elements (preserving defs, styles, metadata, comments, namedviews)
      const SHAPE_TAGS = new Set([
        'path',
        'rect',
        'circle',
        'ellipse',
        'line',
        'polygon',
        'polyline',
        'text',
        'image',
      ]);

      const checkAndPrune = (node: Element) => {
        const tag = node.tagName.toLowerCase();
        const id = node.getAttribute('id');

        if (id && SHAPE_TAGS.has(tag) && id !== '__artboard_bg__') {
          if (!modelMap.has(id)) {
            node.remove();
            return;
          }
        }

        const children = Array.from(node.children);
        for (const child of children) {
          // Skip pruning inside defs or metadata blocks
          const childTag = child.tagName.toLowerCase();
          if (childTag !== 'defs' && childTag !== 'metadata' && childTag !== 'style') {
            checkAndPrune(child);
          }
        }
      };

      checkAndPrune(svgEl);

      // 5. Serialize patched document
      let serialized = '';
      if (typeof (doc as any).toString === 'function') {
        serialized = (doc as any).toString();
      } else if (typeof (globalThis as any).XMLSerializer !== 'undefined') {
        serialized = new (globalThis as any).XMLSerializer().serializeToString(doc);
      }

      // Strip unwanted <?xml ... ?> if original didn't declare it
      if (!hasXmlDeclaration) {
        serialized = serialized.replace(/^<\?xml[^>]*>\s*/i, '');
      }

      return serialized;
    } catch (e) {
      console.warn('[AntiDraw:SurgicalSvgModifier] Fallo en parcheo quirúrgico, devolviendo texto original:', e);
      return originalSvgText;
    }
  }
}
