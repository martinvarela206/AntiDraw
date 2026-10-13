/**
 * ARCHITECTURAL RATIONALE: Selection Mode Cursor with Micro-Badge Iconography (Benchmark CorelDraw/VectorCraft)
 *
 * 1. Single Responsibility:
 *    Encapsulates distinctive SVG cursor generation with high-DPI micro-insignias for each
 *    active selection mode:
 *    - 'move': Emerald green badge (#10b981) with ✥ icon (fallback: 'move')
 *    - 'scale': Indigo blue badge (#6366f1) with ⤢ icon (fallback: 'default')
 *    - 'rotate': Violet purple badge (#8b5cf6) with ⟳ icon (fallback: 'grab')
 *
 * 2. Visual Predictability (Zero Mode Ambiguity):
 *    Provides immediate visual feedback directly at the pointer hotspot (2, 2) before the
 *    operator clicks or drags, eliminating guesswork between moving, scaling, or rotating.
 *
 * 3. Fallback Compatibility:
 *    Every cursor defines standard CSS cursor fallbacks so headless test environments or
 *    systems without custom cursor support continue operating with standard cursor behavior.
 */
export class SelectionCursorHelper {
  private static readonly CURSORS: Record<string, { svgUrl: string; fallback: string }> = {
    move: {
      svgUrl: SelectionCursorHelper.buildSvgCursorUrl('#10b981', '#064e3b', '✥'),
      fallback: 'move',
    },
    scale: {
      svgUrl: SelectionCursorHelper.buildSvgCursorUrl('#6366f1', '#312e81', '⤢'),
      fallback: 'default',
    },
    rotate: {
      svgUrl: SelectionCursorHelper.buildSvgCursorUrl('#8b5cf6', '#4c1d95', '⟳'),
      fallback: 'grab',
    },
  };

  /**
   * Generates a CSS cursor specification string with SVG data-URI and native fallback.
   * Format: `url("data:image/svg+xml,...") 2 2, <fallback>`
   */
  public static getModeCursor(mode: string): string {
    const config = this.CURSORS[mode];
    if (!config) return 'default';
    return `url("${config.svgUrl}") 2 2, ${config.fallback}`;
  }

  /**
   * Returns the primary CSS fallback cursor name for testing or fallback queries.
   */
  public static getFallbackCursor(mode: string): string {
    return this.CURSORS[mode]?.fallback || 'default';
  }

  private static buildSvgCursorUrl(fillColor: string, strokeColor: string, symbol: string): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
      `<path d="M2 2 L2 18 L6.5 14 L11 22 L13.5 20.5 L9 12.5 L14.5 12.5 Z" fill="#ffffff" stroke="#0f172a" stroke-width="1.2" stroke-linejoin="round"/>` +
      `<rect x="13" y="13" width="17" height="15" rx="3.5" fill="${fillColor}" stroke="${strokeColor}" stroke-width="0.8"/>` +
      `<text x="21.5" y="24.5" text-anchor="middle" fill="#ffffff" font-size="10" font-family="system-ui, -apple-system, sans-serif" font-weight="bold">${symbol}</text>` +
      `</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
}
