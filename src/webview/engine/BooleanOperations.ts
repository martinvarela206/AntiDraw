import { VectorElement, PathVertex } from './VectorModel.js';

export class BooleanOperations {
  // Combine multiple selected paths into a single path element
  public static combine(elements: VectorElement[]): VectorElement | null {
    if (!elements || elements.length === 0) return null;

    const baseEl = elements[0];
    const combinedVertices: PathVertex[] = [];

    elements.forEach((el) => {
      if (el.vertices) {
        combinedVertices.push(...el.vertices);
      }
    });

    const fill = baseEl.attributes.fill || '#4f46e5';
    const stroke = baseEl.attributes.stroke || '#ffffff';

    return {
      id: `combined_${Date.now().toString(36)}`,
      tagName: 'path',
      attributes: {
        ...baseEl.attributes,
        id: `combined_${Date.now().toString(36)}`,
        fill,
        stroke,
        'fill-rule': 'evenodd',
      },
      vertices: combinedVertices,
      isClosed: true,
    };
  }

  // Perform Union operation on vectors
  public static union(el1: VectorElement, el2: VectorElement): VectorElement {
    const combined = this.combine([el1, el2])!;
    combined.attributes['fill-rule'] = 'nonzero';
    return combined;
  }

  // Perform Subtract (Difference) operation on vectors
  public static subtract(el1: VectorElement, el2: VectorElement): VectorElement {
    const combined = this.combine([el1, el2])!;
    combined.attributes['fill-rule'] = 'evenodd';
    return combined;
  }

  // Perform Intersect operation on vectors
  public static intersect(el1: VectorElement, el2: VectorElement): VectorElement {
    const combined = this.combine([el1, el2])!;
    combined.attributes['fill-rule'] = 'evenodd';
    return combined;
  }

  // Perform Exclude (XOR) operation on vectors
  public static exclude(el1: VectorElement, el2: VectorElement): VectorElement {
    const combined = this.combine([el1, el2])!;
    combined.attributes['fill-rule'] = 'evenodd';
    return combined;
  }

  // Align elements: left, center, right, top, middle, bottom
  public static alignElements(
    elements: VectorElement[],
    type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom',
    canvasWidth: number,
    canvasHeight: number
  ): VectorElement[] {
    if (!elements || elements.length === 0) return elements;

    // Determine target align reference bounds
    let targetX = 0;
    let targetY = 0;

    if (elements.length === 1) {
      if (type === 'left') targetX = 0;
      if (type === 'center') targetX = canvasWidth / 2;
      if (type === 'right') targetX = canvasWidth;
      if (type === 'top') targetY = 0;
      if (type === 'middle') targetY = canvasHeight / 2;
      if (type === 'bottom') targetY = canvasHeight;
    }

    return elements.map((el) => {
      if (!el.vertices || el.vertices.length === 0) return el;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      el.vertices.forEach((v) => {
        minX = Math.min(minX, v.x);
        minY = Math.min(minY, v.y);
        maxX = Math.max(maxX, v.x);
        maxY = Math.max(maxY, v.y);
      });

      const w = maxX - minX;
      const h = maxY - minY;
      const cx = minX + w / 2;
      const cy = minY + h / 2;

      let dx = 0;
      let dy = 0;

      if (type === 'left') dx = targetX - minX;
      if (type === 'center') dx = targetX - cx;
      if (type === 'right') dx = targetX - maxX;
      if (type === 'top') dy = targetY - minY;
      if (type === 'middle') dy = targetY - cy;
      if (type === 'bottom') dy = targetY - maxY;

      const newVertices = el.vertices.map((v) => ({
        ...v,
        x: v.x + dx,
        y: v.y + dy,
        handleIn: v.handleIn ? { x: v.handleIn.x + dx, y: v.handleIn.y + dy } : undefined,
        handleOut: v.handleOut ? { x: v.handleOut.x + dx, y: v.handleOut.y + dy } : undefined,
      }));

      return { ...el, vertices: newVertices };
    });
  }

  // Z-Order re-ordering
  public static reorder(
    elements: VectorElement[],
    targetId: string,
    action: 'front' | 'forward' | 'backward' | 'back'
  ): VectorElement[] {
    const index = elements.findIndex((e) => e.id === targetId);
    if (index === -1) return elements;

    const list = [...elements];
    const [target] = list.splice(index, 1);

    if (action === 'front') {
      list.push(target);
    } else if (action === 'back') {
      list.unshift(target);
    } else if (action === 'forward') {
      const newIdx = Math.min(index + 1, list.length);
      list.splice(newIdx, 0, target);
    } else if (action === 'backward') {
      const newIdx = Math.max(index - 1, 0);
      list.splice(newIdx, 0, target);
    }

    return list;
  }
}
