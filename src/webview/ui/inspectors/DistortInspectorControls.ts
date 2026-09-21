import { SelectionTool } from '../../engine/SelectionTool.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';

/**
 * ARCHITECTURAL RATIONALE: Modular Distort & Homography Inspector Component
 *
 * 1. Single Responsibility Principle (SRP):
 *    Decouples 2D Homography corner editing, corner selection buttons, and skew reset controls
 *    from general affine bounding-box transformation logic in GeometryInspector and MultiSelectionInspector.
 *
 * 2. Shared Parity:
 *    Ensures identical interactive behavior, corner picking, coordinate validation, and resets
 *    for both single element deformation and multi-element group homography without code duplication.
 *
 * 3. File Size Hygiene:
 *    Prevents GeometryInspector.ts and MultiSelectionInspector.ts from exceeding the 500-line threshold.
 */
export class DistortInspectorControls {
  public static renderHtml(
    selectionTool: SelectionTool,
    x: number,
    y: number,
    w: number,
    h: number,
    idPrefix: string = ''
  ): string {
    if (selectionTool.selectionMode !== 'distort') return '';
    const activeKey = selectionTool.activeDistortCorner || 'nw';
    const quad = selectionTool.currentDistortQuad;
    let cX = quad ? quad[activeKey].x : x;
    let cY = quad ? quad[activeKey].y : y;
    if (!quad) {
      if (activeKey === 'ne') { cX = x + w; cY = y; }
      else if (activeKey === 'se') { cX = x + w; cY = y + h; }
      else if (activeKey === 'sw') { cX = x; cY = y + h; }
    }
    cX = Math.round(cX * 10) / 10;
    cY = Math.round(cY * 10) / 10;
    const isCornerSelected = (k: string) =>
      selectionTool.selectedDistortCorners
        ? selectionTool.selectedDistortCorners.has(k as any) || activeKey === k
        : activeKey === k;

    return `
    <div style="border-top:1px solid var(--border-color); padding-top:6px; margin-top:6px;">
      <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
        <span>Deformación Libre</span>
        <span style="font-size:10px; opacity:0.7;">Homografía 2D</span>
      </div>
      <div class="prop-row" style="margin-top:4px;">
        <span class="prop-label" style="font-size:11px;">Esquina</span>
        <div style="display:flex; gap:3px; flex:1;">
          <button class="prop-input ${idPrefix}btn-distort-corner" data-corner="nw" style="flex:1; padding:2px; font-size:10px; ${isCornerSelected('nw') ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Esquina Noroeste (Superior Izquierda) - Shift+clic para multiselección">NO</button>
          <button class="prop-input ${idPrefix}btn-distort-corner" data-corner="ne" style="flex:1; padding:2px; font-size:10px; ${isCornerSelected('ne') ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Esquina Noreste (Superior Derecha) - Shift+clic para multiselección">NE</button>
          <button class="prop-input ${idPrefix}btn-distort-corner" data-corner="se" style="flex:1; padding:2px; font-size:10px; ${isCornerSelected('se') ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Esquina Sureste (Inferior Derecha) - Shift+clic para multiselección">SE</button>
          <button class="prop-input ${idPrefix}btn-distort-corner" data-corner="sw" style="flex:1; padding:2px; font-size:10px; ${isCornerSelected('sw') ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Esquina Suroeste (Inferior Izquierda) - Shift+clic para multiselección">SO</button>
        </div>
      </div>
      <div class="prop-row">
        <span class="prop-label">X</span>
        <input type="number" step="any" class="prop-input" id="${idPrefix}distort-corner-x" value="${cX}" />
        <span class="prop-label" style="width:20px; text-align:right;">Y</span>
        <input type="number" step="any" class="prop-input" id="${idPrefix}distort-corner-y" value="${cY}" />
      </div>
      <div class="prop-row" style="margin-top:4px; gap:4px;">
        <button class="prop-input" id="${idPrefix}btn-reset-active-corner" style="flex:1; padding:4px; cursor:pointer; font-size:11px;" title="Restaurar la posición original ortogonal de la esquina seleccionada">⟲ Esquina</button>
        <button class="prop-input" id="${idPrefix}btn-reset-all-corners" style="flex:1; padding:4px; cursor:pointer; font-size:11px;" title="Restaurar todas las esquinas a la forma ortogonal original">⟲ Todas</button>
      </div>
      <div class="prop-row" style="margin-top:6px; border-top:1px dashed var(--border-color); padding-top:4px;">
        <span class="prop-label" style="font-size:11px;">Cizalla</span>
        <button class="prop-input" id="${idPrefix}btn-reset-skew" style="flex:1; padding:2px 4px; cursor:pointer; font-size:11px;" title="Restaurar inclinación / cizallamiento a su estado original">⟲ Restaurar Cizalla</button>
      </div>
    </div>`;
  }

  public static bindEvents(
    container: HTMLElement,
    selectionTool: SelectionTool,
    callbacks: PropertyPanelCallbacks,
    onReRender: () => void,
    idPrefix: string = ''
  ): void {
    const btnDistortCorners = container.querySelectorAll<HTMLButtonElement>(
      idPrefix ? `.${idPrefix}btn-distort-corner, .btn-distort-corner` : '.btn-distort-corner'
    );
    btnDistortCorners.forEach((btn) => {
      btn.addEventListener('click', (e: MouseEvent) => {
        const corner = btn.getAttribute('data-corner') as 'nw' | 'ne' | 'se' | 'sw';
        if (corner) {
          if (e.shiftKey) {
            if (selectionTool.selectedDistortCorners.has(corner)) {
              selectionTool.selectedDistortCorners.delete(corner);
            } else {
              selectionTool.selectedDistortCorners.add(corner);
            }
          } else {
            selectionTool.selectedDistortCorners.clear();
            selectionTool.selectedDistortCorners.add(corner);
          }
          selectionTool.activeDistortCorner = corner;
          callbacks.onRenderOverlay?.();
          onReRender();
        }
      });
    });

    const distortX = container.querySelector<HTMLInputElement>(`#${idPrefix}distort-corner-x`);
    const distortY = container.querySelector<HTMLInputElement>(`#${idPrefix}distort-corner-y`);
    const applyDistortCoord = () => {
      const valX = parseFloat(distortX?.value || '');
      const valY = parseFloat(distortY?.value || '');
      if (!isNaN(valX) && !isNaN(valY)) {
        callbacks.onDistortCornerChange?.(selectionTool.activeDistortCorner || 'nw', { x: valX, y: valY });
      }
    };
    distortX?.addEventListener('change', applyDistortCoord);
    distortY?.addEventListener('change', applyDistortCoord);

    const btnResetActiveCorner = container.querySelector<HTMLButtonElement>(`#${idPrefix}btn-reset-active-corner`);
    btnResetActiveCorner?.addEventListener('click', () => {
      callbacks.onResetDistortCorner?.(selectionTool.activeDistortCorner || 'nw');
    });

    const btnResetAllCorners = container.querySelector<HTMLButtonElement>(`#${idPrefix}btn-reset-all-corners`);
    btnResetAllCorners?.addEventListener('click', () => {
      callbacks.onResetAllDistortCorners?.();
    });

    const btnResetSkew = container.querySelector<HTMLButtonElement>(`#${idPrefix}btn-reset-skew`);
    btnResetSkew?.addEventListener('click', () => {
      callbacks.onResetSkew?.();
    });
  }
}
