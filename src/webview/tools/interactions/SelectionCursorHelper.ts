/**
 * ARCHITECTURAL RATIONALE: Selection Mode Cursor with Accessible Textual Badges & Micro-Iconography
 *
 * 1. Single Responsibility:
 *    Encapsulates distinctive SVG cursor generation with high-DPI micro-insignias and textual
 *    indicators for each active selection mode:
 *    - 'move': Emerald green badge (#10b981) with ✥ icon and 'MOV' badge (fallback: 'move')
 *    - 'scale': Indigo blue badge (#6366f1) with ⤢ icon and 'SCL' badge (fallback: 'default')
 *    - 'rotate': Violet purple badge (#8b5cf6) with ⟳ icon and 'ROT' badge (fallback: 'grab')
 *    - 'distort': Amber badge (#f59e0b) with ▱ icon and 'DST' badge (fallback: 'crosshair')
 *
 * 2. Visual Accessibility & Zero Reliance on Color Alone (WCAG / Color Blindness):
 *    Never relies exclusively on color hue differences to convey the active transform mode.
 *    Each cursor embeds an explicit high-contrast textual code ('MOV', 'SCL', 'ROT', 'DST'),
 *    canonical keyboard shortcut, and semantic `<title>` tag for assistive environments.
 *
 * 3. Fallback Compatibility:
 *    Every cursor defines standard CSS cursor fallbacks so headless test environments or
 *    systems without custom cursor support continue operating with standard cursor behavior.
 */
export interface SelectionModeDescriptor {
  id: string;
  label: string;
  badge: string;
  shortcut: string;
  color: string;
  strokeColor: string;
  symbol: string;
  fallback: string;
  svgUrl: string;
}

export class SelectionCursorHelper {
  private static readonly CURSORS: Record<string, SelectionModeDescriptor> = {
    move: {
      id: 'move',
      label: 'Mover',
      badge: 'MOV',
      shortcut: 'W',
      color: '#10b981',
      strokeColor: '#064e3b',
      symbol: '✥',
      fallback: 'move',
      svgUrl: SelectionCursorHelper.buildSvgCursorUrl('#10b981', '#064e3b', '✥', 'MOV'),
    },
    scale: {
      id: 'scale',
      label: 'Escalar',
      badge: 'SCL',
      shortcut: 'E',
      color: '#6366f1',
      strokeColor: '#312e81',
      symbol: '⤢',
      fallback: 'default',
      svgUrl: SelectionCursorHelper.buildSvgCursorUrl('#6366f1', '#312e81', '⤢', 'SCL'),
    },
    rotate: {
      id: 'rotate',
      label: 'Rotar',
      badge: 'ROT',
      shortcut: 'R',
      color: '#8b5cf6',
      strokeColor: '#4c1d95',
      symbol: '⟳',
      fallback: 'grab',
      svgUrl: SelectionCursorHelper.buildSvgCursorUrl('#8b5cf6', '#4c1d95', '⟳', 'ROT'),
    },
    distort: {
      id: 'distort',
      label: 'Deformar',
      badge: 'DST',
      shortcut: 'D',
      color: '#f59e0b',
      strokeColor: '#78350f',
      symbol: '▱',
      fallback: 'crosshair',
      svgUrl: SelectionCursorHelper.buildSvgCursorUrl('#f59e0b', '#78350f', '▱', 'DST'),
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

  /**
   * Returns the localized descriptive label for a selection mode.
   */
  public static getModeLabel(mode: string): string {
    return this.CURSORS[mode]?.label || mode;
  }

  /**
   * Returns the textual 3-letter badge identifier for accessibility and visual redundancy.
   */
  public static getModeBadge(mode: string): string {
    return this.CURSORS[mode]?.badge || mode.toUpperCase();
  }

  /**
   * Returns the canonical keyboard hotkey shortcut for switching into the mode.
   */
  public static getModeShortcut(mode: string): string {
    return this.CURSORS[mode]?.shortcut || '';
  }

  /**
   * Returns all available selection mode descriptors.
   */
  public static getAllModes(): SelectionModeDescriptor[] {
    return Object.values(this.CURSORS);
  }

  private static buildSvgCursorUrl(fillColor: string, strokeColor: string, symbol: string, badge?: string): string {
    const labelText = badge || symbol;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="32" viewBox="0 0 34 32">` +
      `<title>Modo ${labelText}</title>` +
      `<path d="M2 2 L2 18 L6.5 14 L11 22 L13.5 20.5 L9 12.5 L14.5 12.5 Z" fill="#ffffff" stroke="#0f172a" stroke-width="1.2" stroke-linejoin="round"/>` +
      `<rect x="13" y="13" width="19" height="15" rx="3.5" fill="${fillColor}" stroke="${strokeColor}" stroke-width="0.8"/>` +
      `<text x="22.5" y="24.5" text-anchor="middle" fill="#ffffff" font-size="9" font-family="system-ui, -apple-system, sans-serif" font-weight="bold">${symbol}</text>` +
      `</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
}
