import { Point } from '../../engine/VectorModel.js';
import { BoundingBox } from '../../engine/geometry/BoundingBoxCalculator.js';
import { I18nService } from '../../i18n/index.js';

export type SelectionHudMode = 'move' | 'scale' | 'rotate';

/**
 * ARCHITECTURAL RATIONALE: Contextual Floating Selection Mini-HUD (SOLID / SRP)
 *
 * 1. Single Responsibility:
 *    Encapsulates rendering and hit-testing for the on-canvas contextual mode badge:
 *    `[ ✥ Mover | ⤢ Escalar | ⟳ Rotar ]`.
 *
 * 2. Ergonomic Mouse-Only Mode Switching:
 *    Eliminates geometric click ambiguity (where bounding box resize corners overlap
 *    identical element vertices needed for precision snapping). Allows instant 1-click
 *    mode toggling without requiring keyboard hotkeys (W/R/E) or traveling across the screen
 *    to the sidebar property panel.
 *
 * 3. Physical Screen-Space Invariance:
 *    Projects at constant screen-pixel dimensions (204px width x 26px height) regardless of
 *    canvas zoom scale, providing comfortable, reliable click targets at 10% or 1000% zoom.
 */
export class SelectionMiniHud {
  public static readonly HUD_WIDTH = 204;
  public static readonly HUD_HEIGHT = 26;
  public static readonly HUD_RADIUS = 13;
  public static readonly SEGMENT_WIDTH = 68;
  public static readonly VERTICAL_OFFSET = 23; // Screen pixels above bounding box top edge

  /**
   * Tests whether a canvas coordinate point hits any button within the floating Mini-HUD.
   *
   * @param groupBox Axis-aligned selection bounding box
   * @param pt Point in canvas coordinates
   * @param zoom Current canvas viewport zoom level
   * @returns 'move' | 'scale' | 'rotate' if a button was hit, or null
   */
  public hitTest(
    groupBox: BoundingBox,
    pt: Point,
    zoom: number
  ): SelectionHudMode | null {
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
   */
  public getHoverCursor(
    groupBox: BoundingBox,
    pt: Point,
    zoom: number
  ): string | null {
    const hit = this.hitTest(groupBox, pt, zoom);
    return hit ? 'pointer' : null;
  }

  /**
   * Generates high-fidelity SVG overlay markup for the floating Mini-HUD pill.
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
