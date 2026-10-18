import { Point } from '../../engine/VectorModel.js';
import { BoundingBox } from '../../engine/geometry/BoundingBoxCalculator.js';
import { I18nService } from '../../i18n/index.js';

export type SelectionHudMode = 'move' | 'scale' | 'rotate';

/**
 * ARCHITECTURAL RATIONALE: Contextual Floating Selection Mini-HUD (SOLID / SRP)
 *
 * 1. Single Responsibility:
 *    Encapsulates DOM lifecycle, active mode state synchronization, and user interaction
 *    for the workspace-anchored contextual mode pill: `[ ✥ Mover | ⤢ Escalar | ⟳ Rotar ]`.
 *
 * 2. Unobstructed Canvas Workspace (Anti-Collision UX):
 *    Anchored inside `#canvas-container` immediately beneath the top ruler (`.ruler-top-container`).
 *    By eliminating on-canvas SVG overlay badges floating directly above the selection bounding box,
 *    it guarantees 100% collision-free access to vertices, Bézier tangent handles, and upper geometry
 *    in both Selection (`SelectToolHandler`) and Node editing (`NodeToolHandler`) tools.
 *
 * 3. Physical Screen-Space Invariance & Accessibility:
 *    Rendered as hardware-accelerated, crisp HTML elements with Figma-grade frosted glass styling.
 *    Provides comfortable 24px click targets regardless of canvas zoom scale, with instant 1-click
 *    mode toggling without requiring hotkeys or traveling to the right inspector panel.
 */
export class SelectionMiniHud {
  public static readonly HUD_WIDTH = 204;
  public static readonly HUD_HEIGHT = 26;
  public static readonly HUD_RADIUS = 13;
  public static readonly SEGMENT_WIDTH = 68;
  public static readonly VERTICAL_OFFSET = 23; // Historical screen pixels above bounding box

  private containerEl: HTMLElement | null = null;
  private currentMode: SelectionHudMode = 'scale';
  private onSelectCallback: ((mode: SelectionHudMode) => void) | null = null;
  private isDockedMode: boolean = true;
  private unsubscribeI18n: (() => void) | null = null;

  constructor() {
    if (typeof I18nService !== 'undefined' && I18nService.onLanguageChange) {
      this.unsubscribeI18n = I18nService.onLanguageChange(() => {
        const el = this.getContainer();
        if (el) {
          this.rebuildButtons(el);
        }
      });
    }
  }

  /**
   * Resolves or caches the DOM container `#selection-mini-hud`.
   */
  public getContainer(): HTMLElement | null {
    if (this.containerEl && typeof document !== 'undefined' && document.body?.contains && document.body.contains(this.containerEl)) {
      return this.containerEl;
    }
    if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
      this.containerEl = document.getElementById('selection-mini-hud');
    }
    return this.containerEl;
  }

  /**
   * Configures whether the HUD operates in top-ruler docked mode (default) or legacy on-canvas mode.
   */
  public setDockedMode(docked: boolean): void {
    this.isDockedMode = docked;
  }

  public getIsDockedMode(): boolean {
    return this.isDockedMode;
  }

  /**
   * Displays the floating Mini-HUD docked below the top ruler.
   *
   * @param mode Current active selection mode ('move' | 'scale' | 'rotate')
   * @param onSelect Callback invoked when a mode button is clicked
   */
  public show(
    mode: SelectionHudMode,
    onSelect: (mode: SelectionHudMode) => void
  ): void {
    this.currentMode = mode;
    this.onSelectCallback = onSelect;

    const el = this.getContainer();
    if (!el) return;

    if (el.children.length === 0) {
      this.rebuildButtons(el);
    } else {
      this.updateActiveButton(el);
    }
    el.style.display = 'flex';
  }

  /**
   * Hides the floating Mini-HUD.
   */
  public hide(): void {
    const el = this.getContainer();
    if (el) {
      el.style.display = 'none';
    }
  }

  /**
   * Returns whether the floating Mini-HUD is currently visible in the DOM.
   */
  public isVisible(): boolean {
    const el = this.getContainer();
    return !!el && el.style.display !== 'none';
  }

  /**
   * Returns current active mode.
   */
  public getMode(): SelectionHudMode {
    return this.currentMode;
  }

  /**
   * Updates the active mode visually without altering callbacks.
   */
  public setMode(mode: SelectionHudMode): void {
    this.currentMode = mode;
    const el = this.getContainer();
    if (el) {
      this.updateActiveButton(el);
    }
  }

  /**
   * Rebuilds the HTML buttons inside the container element with proper localized text.
   */
  private rebuildButtons(container: HTMLElement): void {
    container.innerHTML = `
      <button type="button" class="mini-hud-btn ${this.currentMode === 'move' ? 'active' : ''}" data-mode="move" title="${I18nService.t('miniHud.moveTitle')}">
        <span class="mini-hud-icon">✥</span> ${I18nService.t('miniHud.move')}
      </button>
      <button type="button" class="mini-hud-btn ${this.currentMode === 'scale' ? 'active' : ''}" data-mode="scale" title="${I18nService.t('miniHud.scaleTitle')}">
        <span class="mini-hud-icon">⤢</span> ${I18nService.t('miniHud.scale')}
      </button>
      <button type="button" class="mini-hud-btn ${this.currentMode === 'rotate' ? 'active' : ''}" data-mode="rotate" title="${I18nService.t('miniHud.rotateTitle')}">
        <span class="mini-hud-icon">⟳</span> ${I18nService.t('miniHud.rotate')}
      </button>
    `;

    const buttons = container.querySelectorAll<HTMLButtonElement>('.mini-hud-btn');
    buttons.forEach((btn) => {
      const handleTrigger = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const targetMode = btn.dataset.mode as SelectionHudMode;
        if (targetMode) {
          this.currentMode = targetMode;
          this.updateActiveButton(container);
          this.onSelectCallback?.(targetMode);
        }
      };

      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      btn.addEventListener('click', handleTrigger);
    });
  }

  /**
   * Updates CSS `.active` classes on buttons matching `this.currentMode`.
   */
  private updateActiveButton(container: HTMLElement): void {
    const buttons = container.querySelectorAll<HTMLButtonElement>('.mini-hud-btn');
    buttons.forEach((btn) => {
      if (btn.dataset.mode === this.currentMode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  /**
   * Tests whether a canvas coordinate point hits any button within the floating Mini-HUD.
   * In docked mode (default), returns null so canvas coordinates never collide with geometry or vertices.
   *
   * @param groupBox Axis-aligned selection bounding box
   * @param pt Point in canvas coordinates
   * @param zoom Current canvas viewport zoom level
   * @param forceAnalytical If true, forces analytical calculation regardless of docked state
   * @returns 'move' | 'scale' | 'rotate' if hit, or null
   */
  public hitTest(
    groupBox: BoundingBox,
    pt: Point,
    zoom: number,
    forceAnalytical: boolean = false
  ): SelectionHudMode | null {
    if (this.isDockedMode && !forceAnalytical) {
      return null;
    }

    const z = zoom || 1;
    const hudCx = groupBox.cx;
    const hudCy = groupBox.y - SelectionMiniHud.VERTICAL_OFFSET / z;

    // Convert canvas distance to screen-pixel offsets relative to HUD center
    const relX = (pt.x - hudCx) * z;
    const relY = (pt.y - hudCy) * z;

    const halfW = SelectionMiniHud.HUD_WIDTH / 2;
    const halfH = SelectionMiniHud.HUD_HEIGHT / 2;

    if (Math.abs(relY) > halfH || Math.abs(relX) > halfW) {
      return null;
    }

    // Segment 1 (Move): [-102, -34)
    if (relX < -SelectionMiniHud.SEGMENT_WIDTH / 2) {
      return 'move';
    }
    // Segment 2 (Scale): [-34, 34]
    if (relX <= SelectionMiniHud.SEGMENT_WIDTH / 2) {
      return 'scale';
    }
    // Segment 3 (Rotate): (34, 102]
    return 'rotate';
  }

  /**
   * Returns 'pointer' cursor if hovering over any segment of the Mini-HUD.
   * In docked mode, returns null so canvas hovering does not alter cursor.
   */
  public getHoverCursor(
    groupBox: BoundingBox,
    pt: Point,
    zoom: number,
    forceAnalytical: boolean = false
  ): string | null {
    if (this.isDockedMode && !forceAnalytical) {
      return null;
    }
    const hit = this.hitTest(groupBox, pt, zoom, forceAnalytical);
    return hit ? 'pointer' : null;
  }

  /**
   * Generates high-fidelity SVG overlay markup for the floating Mini-HUD pill.
   * Retained for standalone testing and rendering compatibility.
   */
  public renderOverlay(
    groupBox: BoundingBox,
    currentMode: string,
    zoom: number
  ): string {
    const z = zoom || 1;
    const hudCx = groupBox.cx;
    const hudCy = groupBox.y - SelectionMiniHud.VERTICAL_OFFSET / z;

    const isMove = currentMode === 'move';
    const isScale = currentMode === 'scale';
    const isRotate = currentMode === 'rotate';

    const moveTextColor = isMove ? '#ffffff' : '#94a3b8';
    const scaleTextColor = isScale ? '#ffffff' : '#94a3b8';
    const rotateTextColor = isRotate ? '#ffffff' : '#94a3b8';

    const moveFontWeight = isMove ? '700' : '600';
    const scaleFontWeight = isScale ? '700' : '600';
    const rotateFontWeight = isRotate ? '700' : '600';

    return `
      <g class="selection-mini-hud" transform="translate(${hudCx}, ${hudCy}) scale(${1 / z})" style="pointer-events: none; user-select: none;">
        <!-- Drop shadow backing plate -->
        <rect x="-103" y="-14" width="206" height="28" rx="14" ry="14" fill="#030712" fill-opacity="0.38" />

        <!-- Downward anchor caret notch pointing to bounding box -->
        <polygon points="-4,13 4,13 0,16.5" fill="#0b0f19" stroke="#334155" stroke-width="1" />
        <line x1="-3.5" y1="13" x2="3.5" y2="13" stroke="#0b0f19" stroke-width="1.8" />

        <!-- Base pill container background -->
        <rect x="-102" y="-13" width="204" height="26" rx="13" ry="13" fill="#0b0f19" fill-opacity="0.95" stroke="#334155" stroke-width="1.2" />

        <!-- Active Mode Pill Segment Highlights -->
        ${
          isMove
            ? `<path d="M -34 -13 L -89 -13 A 13 13 0 0 0 -102 0 A 13 13 0 0 0 -89 13 L -34 13 Z" fill="#10b981" fill-opacity="0.95" />`
            : ''
        }
        ${
          isScale
            ? `<rect x="-34" y="-13" width="68" height="26" fill="#6366f1" fill-opacity="0.95" rx="2" />`
            : ''
        }
        ${
          isRotate
            ? `<path d="M 34 -13 L 89 -13 A 13 13 0 0 1 102 0 A 13 13 0 0 1 89 13 L 34 13 Z" fill="#8b5cf6" fill-opacity="0.95" />`
            : ''
        }

        <!-- Dividers between inactive segments -->
        ${!isMove && !isScale ? `<line x1="-34" y1="-8" x2="-34" y2="8" stroke="#334155" stroke-width="1" />` : ''}
        ${!isScale && !isRotate ? `<line x1="34" y1="-8" x2="34" y2="8" stroke="#334155" stroke-width="1" />` : ''}

        <!-- Button 1: Move (✥ Move) -->
        <g class="mini-hud-btn mini-hud-move">
          <title>${I18nService.t('miniHud.moveTitle')}</title>
          <text x="-68" y="4" text-anchor="middle" fill="${moveTextColor}" font-size="11" font-weight="${moveFontWeight}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">✥ ${I18nService.t('miniHud.move')}</text>
        </g>

        <!-- Button 2: Scale (⤢ Scale) -->
        <g class="mini-hud-btn mini-hud-scale">
          <title>${I18nService.t('miniHud.scaleTitle')}</title>
          <text x="0" y="4" text-anchor="middle" fill="${scaleTextColor}" font-size="11" font-weight="${scaleFontWeight}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">⤢ ${I18nService.t('miniHud.scale')}</text>
        </g>

        <!-- Button 3: Rotate (⟳ Rotate) -->
        <g class="mini-hud-btn mini-hud-rotate">
          <title>${I18nService.t('miniHud.rotateTitle')}</title>
          <text x="68" y="4" text-anchor="middle" fill="${rotateTextColor}" font-size="11" font-weight="${rotateFontWeight}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">⟳ ${I18nService.t('miniHud.rotate')}</text>
        </g>
      </g>
    `;
  }
}
