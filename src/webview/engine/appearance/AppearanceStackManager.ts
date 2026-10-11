import { VectorElement } from '../VectorModel.js';

export interface StrokeLayer {
  id: string;
  stroke: string;
  strokeWidth: number;
  strokeLinecap?: 'butt' | 'round' | 'square';
  strokeLinejoin?: 'miter' | 'round' | 'bevel';
  strokeDash?: string;
  opacity?: number;
  position?: 'below' | 'above';
}

export interface AppearanceStack {
  strokes: StrokeLayer[];
}

/**
 * ARCHITECTURAL RATIONALE: Multi-Layer Appearance Stack Manager (AppearanceStackManager)
 *
 * Modeled after VectorCraft's `crates/doc/src/appearance.rs`:
 * 1. Multi-Stroke Architecture:
 *    Allows a single vector element (e.g. a road, border, or decorative contour) to possess multiple
 *    independent stroke layers rendered at distinct thicknesses, dashes, and colors without duplicating
 *    the underlying mathematical geometry.
 *
 * 2. Stacking Order (Below vs. Above):
 *    - 'below' (default for under-strokes): rendered beneath the primary element stroke (e.g., a 10px black casing under a 4px white road).
 *    - 'above': rendered atop the primary stroke (e.g., an orange dashed centerline).
 *
 * 3. Pristine W3C SVG Serialization:
 *    Layers are represented in output SVG as synchronized sibling elements within a clean `<g id="ad-appearance-${id}">` group
 *    or exported with `fill="none"`. All geometric edits (moving nodes, scaling, rotation) automatically apply to all
 *    appearance layers simultaneously since they reference the master geometry.
 */
export class AppearanceStackManager {
  /**
   * Reads and parses the appearance stack from an element's attributes.
   */
  public static getStack(el: VectorElement): AppearanceStack {
    const raw = el.attributes['data-appearance-stack'];
    if (!raw) return { strokes: [] };
    try {
      const parsed = JSON.parse(raw);
      return { strokes: Array.isArray(parsed.strokes) ? parsed.strokes : [] };
    } catch {
      return { strokes: [] };
    }
  }

  /**
   * Persists the appearance stack to the element's attributes.
   */
  public static saveStack(el: VectorElement, stack: AppearanceStack): void {
    if (!stack || stack.strokes.length === 0) {
      delete el.attributes['data-appearance-stack'];
    } else {
      el.attributes['data-appearance-stack'] = JSON.stringify(stack);
    }
  }

  /**
   * Evaluates if the element has active secondary appearance layers.
   */
  public static hasLayers(el: VectorElement): boolean {
    const stack = this.getStack(el);
    return stack.strokes.length > 0;
  }

  /**
   * Adds a new stroke layer to the element's appearance stack.
   */
  public static addStrokeLayer(el: VectorElement, partial?: Partial<StrokeLayer>): StrokeLayer {
    const stack = this.getStack(el);
    const primaryWidth = parseFloat(el.attributes['stroke-width'] || '2') || 2;
    const primaryStroke = el.attributes['stroke'] || '#ffffff';

    const newLayer: StrokeLayer = {
      id: `stroke-layer-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`,
      stroke: partial?.stroke || (primaryStroke === '#000000' ? '#ffffff' : '#000000'),
      strokeWidth: partial?.strokeWidth !== undefined ? partial.strokeWidth : Math.max(1, primaryWidth * 2),
      strokeLinecap: partial?.strokeLinecap || (el.attributes['stroke-linecap'] as any) || 'butt',
      strokeLinejoin: partial?.strokeLinejoin || (el.attributes['stroke-linejoin'] as any) || 'miter',
      strokeDash: partial?.strokeDash || '',
      opacity: partial?.opacity !== undefined ? partial.opacity : 1,
      position: partial?.position || 'below',
    };

    stack.strokes.push(newLayer);
    this.saveStack(el, stack);
    return newLayer;
  }

  /**
   * Updates an existing stroke layer by ID.
   */
  public static updateStrokeLayer(el: VectorElement, layerId: string, updates: Partial<StrokeLayer>): boolean {
    const stack = this.getStack(el);
    const layer = stack.strokes.find((s) => s.id === layerId);
    if (!layer) return false;

    Object.assign(layer, updates);
    this.saveStack(el, stack);
    return true;
  }

  /**
   * Removes a stroke layer by ID.
   */
  public static removeStrokeLayer(el: VectorElement, layerId: string): boolean {
    const stack = this.getStack(el);
    const initialLen = stack.strokes.length;
    stack.strokes = stack.strokes.filter((s) => s.id !== layerId);
    if (stack.strokes.length !== initialLen) {
      this.saveStack(el, stack);
      return true;
    }
    return false;
  }

  /**
   * Compiles the secondary stroke layer elements into standard SVG tags for rendering.
   */
  public static compileLayerTags(el: VectorElement, layer: StrokeLayer): string {
    const tagName = el.tagName?.toLowerCase() || 'path';
    const cleanAttrs: Record<string, string> = {};

    // Copy geometric attributes from the master element
    const geomAttrs = [
      'd', 'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry',
      'x1', 'y1', 'x2', 'y2', 'points', 'transform'
    ];
    for (const attr of geomAttrs) {
      if (el.attributes[attr] !== undefined) {
        cleanAttrs[attr] = el.attributes[attr];
      }
    }

    // Set appearance stroke properties for this layer
    cleanAttrs['id'] = `${el.id}__stroke_${layer.id}`;
    cleanAttrs['class'] = 'ad-appearance-stroke-slave';
    cleanAttrs['fill'] = 'none';
    cleanAttrs['stroke'] = layer.stroke;
    cleanAttrs['stroke-width'] = layer.strokeWidth.toString();
    if (layer.strokeLinecap) cleanAttrs['stroke-linecap'] = layer.strokeLinecap;
    if (layer.strokeLinejoin) cleanAttrs['stroke-linejoin'] = layer.strokeLinejoin;
    if (layer.strokeDash) cleanAttrs['stroke-dasharray'] = layer.strokeDash;
    if (layer.opacity !== undefined && layer.opacity < 1) cleanAttrs['stroke-opacity'] = layer.opacity.toString();

    const attrStr = Object.entries(cleanAttrs)
      .map(([k, v]) => ` ${k}="${v}"`)
      .join('');

    return `  <${tagName}${attrStr} />\n`;
  }
}
