import { VectorElement, VectorModel } from '../VectorModel.js';

export interface GlobalSwatch {
  id: string;
  name: string;
  color: string;
}

/**
 * ARCHITECTURAL RATIONALE: Global Swatches & Reactive Color System (vectorcraft-color alignment)
 *
 * Modeled after VectorCraft's `vectorcraft-doc::swatches`:
 * 1. Reactive Global Swatches:
 *    When a designer updates a global swatch (e.g. 'Brand Blue'), all elements across the entire document
 *    that reference this swatch via `data-fill-swatch` or `data-stroke-swatch` are updated in batch in a
 *    single undo step.
 *
 * 2. Cascading Tints (Matices hacia blanco):
 *    Supports tint percentages [0%..100%] calculated relative to pure white (#ffffff), preserving the
 *    harmonic relationship when the base swatch changes.
 *
 * 3. W3C SVG Purity & Companion JSON Isolation:
 *    The actual SVG `fill` and `stroke` attributes always contain the rendered hex color, ensuring standard
 *    SVG viewers display the document identically without understanding proprietary attributes.
 *    The binding metadata (`data-fill-swatch`, `data-stroke-swatch`, `data-*-tint`) and document swatches
 *    are persisted cleanly in the companion `.json` file.
 */
export class GlobalSwatchManager {
  /**
   * Converts a 3 or 6 digit hex string to { r, g, b } [0..255].
   */
  public static hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    if (!hex || typeof hex !== 'string') return null;
    let clean = hex.trim().replace(/^#/, '');
    if (clean.length === 3) {
      clean = clean
        .split('')
        .map((c) => c + c)
        .join('');
    }
    if (clean.length !== 6) return null;
    const num = parseInt(clean, 16);
    if (isNaN(num)) return null;
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    };
  }

  /**
   * Converts RGB components to a standard 6-digit hex color string.
   */
  public static rgbToHex(r: number, g: number, b: number): string {
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    const h = (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
    return '#' + h.toString(16).padStart(6, '0');
  }

  /**
   * Calculates a tint of a base color towards white (#ffffff).
   * 100% = 100% base color (no tint).
   * 50% = 50% base color + 50% white.
   * 0% = 100% white.
   */
  public static computeTint(baseHex: string, tintPercent: number = 100): string {
    const rgb = this.hexToRgb(baseHex);
    if (!rgb) return baseHex;

    const t = Math.max(0, Math.min(100, tintPercent)) / 100;
    const r = rgb.r * t + 255 * (1 - t);
    const g = rgb.g * t + 255 * (1 - t);
    const b = rgb.b * t + 255 * (1 - t);

    return this.rgbToHex(r, g, b);
  }

  /**
   * Returns a standard curated palette of starter swatches.
   */
  public static getDefaultSwatches(): GlobalSwatch[] {
    return [
      { id: 'swatch-primary', name: 'Primary Blue', color: '#3b82f6' },
      { id: 'swatch-indigo', name: 'Indigo', color: '#6366f1' },
      { id: 'swatch-emerald', name: 'Emerald', color: '#10b981' },
      { id: 'swatch-amber', name: 'Amber', color: '#f59e0b' },
      { id: 'swatch-rose', name: 'Rose', color: '#f43f5e' },
      { id: 'swatch-slate', name: 'Slate Dark', color: '#1e293b' },
      { id: 'swatch-gray', name: 'Neutral Gray', color: '#64748b' },
      { id: 'swatch-white', name: 'White', color: '#ffffff' },
    ];
  }

  /**
   * Updates a swatch's color and reactively cascades the change to all referencing elements in the model.
   * Returns the count of elements updated.
   */
  public static updateSwatchColor(
    model: VectorModel,
    swatchId: string,
    newColor: string
  ): number {
    if (!model.swatches) model.swatches = [];
    const swatch = model.swatches.find((s) => s.id === swatchId);
    if (!swatch) return 0;

    swatch.color = newColor.toLowerCase();
    let affectedCount = 0;

    for (const el of model.elements) {
      let changed = false;

      // Check fill reference
      if (el.attributes['data-fill-swatch'] === swatchId) {
        const tint = parseFloat(el.attributes['data-fill-tint'] || '100') || 100;
        el.attributes.fill = this.computeTint(swatch.color, tint);
        changed = true;
      }

      // Check stroke reference
      if (el.attributes['data-stroke-swatch'] === swatchId) {
        const tint = parseFloat(el.attributes['data-stroke-tint'] || '100') || 100;
        el.attributes.stroke = this.computeTint(swatch.color, tint);
        changed = true;
      }

      if (changed) affectedCount++;
    }

    return affectedCount;
  }

  /**
   * Binds a global swatch to an element's fill or stroke.
   */
  public static assignSwatch(
    el: VectorElement,
    swatch: GlobalSwatch,
    target: 'fill' | 'stroke',
    tintPercent: number = 100
  ): void {
    const effectiveColor = this.computeTint(swatch.color, tintPercent);
    if (target === 'fill') {
      el.attributes.fill = effectiveColor;
      el.attributes['data-fill-swatch'] = swatch.id;
      if (tintPercent !== 100) {
        el.attributes['data-fill-tint'] = tintPercent.toString();
      } else {
        delete el.attributes['data-fill-tint'];
      }
    } else {
      el.attributes.stroke = effectiveColor;
      el.attributes['data-stroke-swatch'] = swatch.id;
      if (tintPercent !== 100) {
        el.attributes['data-stroke-tint'] = tintPercent.toString();
      } else {
        delete el.attributes['data-stroke-tint'];
      }
    }
  }

  /**
   * Unlinks an element from a swatch without altering its current visual hex color.
   */
  public static unlinkSwatch(el: VectorElement, target: 'fill' | 'stroke'): void {
    if (target === 'fill') {
      delete el.attributes['data-fill-swatch'];
      delete el.attributes['data-fill-tint'];
    } else {
      delete el.attributes['data-stroke-swatch'];
      delete el.attributes['data-stroke-tint'];
    }
  }

  /**
   * Scans the document to discover all unique colors and extracts them into swatches.
   */
  public static extractColorsFromDocument(model: VectorModel): GlobalSwatch[] {
    if (!model.swatches) model.swatches = [];
    const existingHexes = new Set(model.swatches.map((s) => s.color.toLowerCase()));
    const discovered = new Set<string>();

    for (const el of model.elements) {
      const fill = el.attributes.fill;
      if (fill && fill.startsWith('#') && !fill.includes('url')) {
        discovered.add(fill.toLowerCase());
      }
      const stroke = el.attributes.stroke;
      if (stroke && stroke.startsWith('#') && stroke !== 'none') {
        discovered.add(stroke.toLowerCase());
      }
    }

    let count = model.swatches.length + 1;
    for (const hex of discovered) {
      if (!existingHexes.has(hex)) {
        const id = `swatch-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`;
        const newSwatch: GlobalSwatch = {
          id,
          name: `Color #${count++}`,
          color: hex,
        };
        model.swatches.push(newSwatch);
        existingHexes.add(hex);
      }
    }

    return model.swatches;
  }
}
