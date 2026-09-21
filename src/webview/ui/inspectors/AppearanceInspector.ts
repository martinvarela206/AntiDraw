import { VectorElement, VectorModel, GradientConfig, GradientStop } from '../../engine/VectorModel.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';
import { bindInspectorMouseDown } from './CanvasInspector.js';

/**
 * ARCHITECTURAL RATIONALE: Bi-directional Conversion Between SVG Miter Limit and Degrees
 *
 * 1. Why Degrees Instead of Dimensionless Ratio:
 *    In SVG, stroke-miterlimit is a dimensionless ratio m = 1 / sin(theta / 2), where theta is the interior
 *    angle between segments. For human designers, setting "miterlimit: 4" or "miterlimit: 10" is completely
 *    opaque and requires mental trigonometry. By exposing the limit directly in degrees (e.g. 29°),
 *    the designer immediately understands: "any corner sharper than 29° will be clipped to bevel;
 *    corners wider than 29° will remain sharp".
 *
 * 2. Exact Formula:
 *    - Given miterlimit m: theta_deg = 2 * asin(1 / m) * (180 / PI).
 *      Default m=4 -> ~28.96° -> 29°.
 *    - Given angle in degrees theta_deg: m = 1 / sin((theta_deg * PI) / 360).
 *      theta=15° -> m=7.66. theta=6° -> m=19.1.
 *
 * 3. Numerical Stability & Clamping:
 *    - Clamped to [1°, 170°] to avoid division by zero or infinite miter lengths at 0°.
 */
export function miterLimitToDegrees(limit: number): number {
  const m = Math.max(1, limit);
  const sinHalf = 1 / m;
  const halfAngleRad = Math.asin(Math.min(1, Math.max(0, sinHalf)));
  const angleDeg = (halfAngleRad * 2 * 180) / Math.PI;
  return Math.round(angleDeg);
}

export function degreesToMiterLimit(degrees: number): number {
  const deg = Math.max(1, Math.min(170, degrees));
  const halfAngleRad = (deg * Math.PI) / 360;
  const sinHalf = Math.sin(halfAngleRad);
  if (sinHalf <= 0.0001) return 100;
  const limit = 1 / sinHalf;
  return Math.round(limit * 100) / 100;
}

/**
 * AppearanceInspector
 *
 * Encapsulates the UI rendering and interactive event handlers for:
 * 1. Fill (Relleno):
 *    - Fill types: Solid Color, Linear Gradient, Radial Gradient, None (open path locking).
 *    - Interactive gradient editor (color stops, offset %, opacity %, stop color/hex, add/delete/reverse stops).
 *    - Linear gradient angle (° degrees and cardinal presets).
 *    - Radial gradient geometric controls (center X/Y %, radii Rx/Ry %, rotation angle °, focus X/Y %).
 * 2. Stroke (Trazo):
 *    - Color and Hex inputs.
 *    - Stroke Width and Dasharray pattern.
 *    - Linecap (butt, round, square).
 *    - Linejoin (miter, round, bevel) and interactive Miter Limit Angle in degrees (°).
 *    - Universal native markers (marker-start, marker-mid, marker-end).
 *    - Stroke-to-Path / Outline Stroke generator trigger.
 */
export class AppearanceInspector {
  public static renderHtml(
    el: VectorElement,
    isClosed: boolean,
    fill: string,
    grad: GradientConfig,
    fillType: 'solid' | 'linear' | 'radial' | 'none',
    gradientCss: string
  ): string {
    const hasFill = fill !== 'none' && fill !== '' && fillType !== 'none';

    return `
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span>Fill (Relleno)</span>
            ${!isClosed ? '<span style="font-size:10px; color:#94a3b8; font-weight:normal; text-transform:none;">(Abierto)</span>' : ''}
          </div>
          <div style="display:flex; gap:4px; align-items:center;">
            ${hasFill ? `
              <button class="prop-input" id="btn-remove-fill" style="cursor:pointer; width:auto; padding:1px 6px; font-size:11px; color:#ef4444;" title="Quitar relleno (establecer fill='none')">− Quitar</button>
            ` : `
              <button class="prop-input" id="btn-add-fill" style="cursor:pointer; width:auto; padding:1px 6px; font-size:11px; color:#10b981; font-weight:600;" title="Añadir relleno sólido">+ Añadir</button>
            `}
          </div>
        </div>

        <div class="prop-row">
          <span class="prop-label">Type</span>
          <select class="prop-input" id="el-fill-type" style="cursor:pointer;">
            <option value="none" ${!hasFill ? 'selected' : ''}>None (Sin relleno)</option>
            <option value="solid" ${hasFill && fillType === 'solid' ? 'selected' : ''}>Solid Color</option>
            <option value="linear" ${hasFill && fillType === 'linear' ? 'selected' : ''}>Linear Gradient</option>
            <option value="radial" ${hasFill && fillType === 'radial' ? 'selected' : ''}>Radial Gradient</option>
          </select>
        </div>

        ${!hasFill ? `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; padding:6px 8px; background:rgba(255,255,255,0.02); border:1px dashed var(--border-color); border-radius:4px;">
          <span style="font-size:11px; color:#94a3b8;">Sin relleno (fill="none")</span>
          <div style="display:flex; gap:4px;">
            ${!isClosed ? `<button class="prop-input" id="btn-prop-close-path" style="cursor:pointer; background:#3b82f6; color:#fff; font-weight:600; padding:2px 6px; font-size:10px;" title="Cerrar trazado formalmente uniendo extremos libres con Z">Cerrar (Z)</button>` : ''}
            <button class="prop-input" id="btn-add-fill-body" style="cursor:pointer; background:var(--accent-color); color:#fff; font-weight:600; padding:2px 6px; font-size:10px;" title="Añadir color de relleno sólido">+ Añadir Relleno</button>
          </div>
        </div>
        ` : ''}

        <!-- Solid Fill Container -->
        <div id="fill-solid-controls" style="${hasFill && fillType === 'solid' ? '' : 'display: none;'}">
          <div class="prop-row">
            <span class="prop-label">Color</span>
            <div class="color-picker-row">
              <input type="color" class="color-swatch" id="el-fill-color" value="${fill === 'none' || fill.startsWith('url') ? '#4f46e5' : fill}" />
              <input type="text" class="prop-input" id="el-fill-hex" value="${fill.startsWith('url') || fill === 'none' ? '#4f46e5' : fill}" />
            </div>
          </div>
        </div>

        <!-- Gradient Controls Container -->

        <!-- Gradient Controls Container -->
        <div id="fill-gradient-controls" style="${fillType === 'linear' || fillType === 'radial' ? '' : 'display: none;'} margin-top: 6px;">
          <!-- Gradient Preview Bar -->
          <div style="margin-bottom: 8px;">
            <div id="gradient-bar-preview" style="height: 18px; border-radius: 4px; border: 1px solid var(--border-subtle); background: ${gradientCss}; margin-bottom: 6px;"></div>
            <div style="display: flex; gap: 4px; justify-content: space-between; align-items: center;">
              <button class="prop-input" id="btn-add-gradient-stop" style="cursor: pointer; width: auto; padding: 3px 8px; font-size: 10px; font-weight: 600;" title="Añadir parada de color">+ Parada</button>
              <button class="prop-input" id="btn-reverse-gradient" style="cursor: pointer; width: auto; padding: 3px 8px; font-size: 11px; font-weight: 600;" title="Invertir dirección del degradado">⇄ Invertir</button>
              <button class="prop-input" id="btn-delete-gradient-stop" style="cursor: pointer; width: auto; padding: 3px 8px; font-size: 10px; color: #ef4444;" title="Eliminar parada activa" ${grad.stops.length <= 2 ? 'disabled' : ''}>🗑</button>
            </div>
          </div>

          <!-- Angle Control (for Linear) -->
          <div id="gradient-angle-row" class="prop-row" style="${fillType === 'linear' ? '' : 'display: none;'}">
            <span class="prop-label">Angle (°)</span>
            <input type="number" class="prop-input" id="gradient-angle" value="${grad.angle ?? 0}" min="0" max="360" step="15" />
            <select class="prop-input" id="gradient-angle-preset" style="width: 70px; cursor: pointer;">
              <option value="0" ${grad.angle === 0 ? 'selected' : ''}>0° →</option>
              <option value="90" ${grad.angle === 90 ? 'selected' : ''}>90° ↓</option>
              <option value="180" ${grad.angle === 180 ? 'selected' : ''}>180° ←</option>
              <option value="270" ${grad.angle === 270 ? 'selected' : ''}>270° ↑</option>
              <option value="45" ${grad.angle === 45 ? 'selected' : ''}>45° ↘</option>
              <option value="135" ${grad.angle === 135 ? 'selected' : ''}>135° ↙</option>
            </select>
          </div>

          <!-- Radial Gradient Geometric Controls (for Radial) -->
          <div id="fill-radial-controls" style="${fillType === 'radial' ? '' : 'display: none;'}">
            <div class="prop-row" style="gap: 6px;">
              <span class="prop-label" style="width: 46px;" title="Posición del centro del gradiente radial">Centro</span>
              <div class="prop-coord-group">
                <div class="prop-coord-box" title="Posición X del centro del gradiente (%)">
                  <span class="prop-coord-sublabel">X</span>
                  <input type="number" class="prop-coord-input" id="radial-cx" value="${Math.round((grad.cx ?? 0.5) * 100)}" min="-100" max="200" step="5" />
                  <span class="prop-coord-sublabel">%</span>
                </div>
                <div class="prop-coord-box" title="Posición Y del centro del gradiente (%)">
                  <span class="prop-coord-sublabel">Y</span>
                  <input type="number" class="prop-coord-input" id="radial-cy" value="${Math.round((grad.cy ?? 0.5) * 100)}" min="-100" max="200" step="5" />
                  <span class="prop-coord-sublabel">%</span>
                </div>
              </div>
              <button class="prop-input" id="btn-reset-radial-center" style="width: 26px; height: 26px; padding: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;" title="Centrar al 50%, 50%">⟲</button>
            </div>
            <div class="prop-row" style="gap: 6px;">
              <span class="prop-label" style="width: 46px;" title="Radios de dispersión elíptica del gradiente radial (Rx / Ry)">Radios</span>
              <div class="prop-coord-group">
                <div class="prop-coord-box" title="Radio eje X (%)">
                  <span class="prop-coord-sublabel">Rx</span>
                  <input type="number" class="prop-coord-input" id="radial-rx" value="${Math.round((grad.rx ?? grad.r ?? 0.5) * 100)}" min="1" max="500" step="5" />
                  <span class="prop-coord-sublabel">%</span>
                </div>
                <div class="prop-coord-box" title="Radio eje Y (%)">
                  <span class="prop-coord-sublabel">Ry</span>
                  <input type="number" class="prop-coord-input" id="radial-ry" value="${Math.round((grad.ry ?? grad.rx ?? grad.r ?? 0.5) * 100)}" min="1" max="500" step="5" />
                  <span class="prop-coord-sublabel">%</span>
        <!-- Solid Color Controls -->
        <div id="fill-solid-controls" style="${fillType === 'solid' ? '' : 'display:none;'}">
          <div class="prop-row">
            <span class="prop-label">Color</span>
            <div class="color-picker-row">
              <input type="color" class="color-swatch" id="el-fill-color" value="${fill === 'none' ? '#000000' : fill}" />
              <input type="text" class="prop-input" id="el-fill-hex" value="${fill}" />
            </div>
          </div>
        </div>

        <!-- Gradient Controls -->
        <div id="fill-gradient-controls" style="${fillType === 'linear' || fillType === 'radial' ? '' : 'display:none;'}">
          <!-- Gradient Bar Preview -->
          <div style="margin: 6px 0 8px 0;">
            <div id="gradient-bar-preview" style="height: 16px; border-radius: 3px; border: 1px solid var(--border-color); background: ${gradientCss}; cursor: pointer; position: relative;" title="Clic para añadir una parada de color">
              ${grad.stops.map((s, idx) => `
                <div class="grad-stop-marker" data-stop-idx="${idx}" style="position: absolute; top: -2px; bottom: -2px; left: calc(${s.offset * 100}% - 4px); width: 8px; border: 1.5px solid #fff; border-radius: 2px; background: ${s.color}; box-shadow: 0 0 2px rgba(0,0,0,0.8); cursor: pointer;" title="Parada ${idx + 1}: ${Math.round(s.offset * 100)}%"></div>
              `).join('')}
            </div>
          </div>

          <!-- Linear Angle Controls -->
          <div id="container-linear-angle" style="${fillType === 'linear' ? '' : 'display:none;'}">
            <div class="prop-row">
              <span class="prop-label">Ángulo</span>
              <div style="display:flex; gap:4px; flex:1; align-items:center;">
                <input type="number" class="prop-input" id="gradient-angle" value="${grad.angle ?? 0}" min="0" max="360" step="15" style="width:55px;" />
                <select class="prop-input" id="gradient-angle-presets" style="cursor:pointer; flex:1;">
                  <option value="0" ${(grad.angle ?? 0) === 0 ? 'selected' : ''}>0° (→)</option>
                  <option value="45" ${(grad.angle ?? 0) === 45 ? 'selected' : ''}>45° (↗)</option>
                  <option value="90" ${(grad.angle ?? 0) === 90 ? 'selected' : ''}>90° (↑)</option>
                  <option value="135" ${(grad.angle ?? 0) === 135 ? 'selected' : ''}>135° (↖)</option>
                  <option value="180" ${(grad.angle ?? 0) === 180 ? 'selected' : ''}>180° (←)</option>
                  <option value="225" ${(grad.angle ?? 0) === 225 ? 'selected' : ''}>225° (↙)</option>
                  <option value="270" ${(grad.angle ?? 0) === 270 ? 'selected' : ''}>270° (↓)</option>
                  <option value="315" ${(grad.angle ?? 0) === 315 ? 'selected' : ''}>315° (↘)</option>
                </select>
                <button class="prop-input" id="btn-reverse-gradient" style="width: 26px; height: 26px; padding: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;" title="Invertir paradas de color">⇄</button>
              </div>
            </div>
          </div>

          <!-- Radial Center / Radius / Focus Controls -->
          <div id="container-radial-params" style="${fillType === 'radial' ? '' : 'display:none;'}">
            <!-- Center Position (cx, cy) -->
            <div class="prop-row">
              <span class="prop-label">Centro</span>
              <div style="display:flex; gap:4px; flex:1; align-items:center;">
                <span style="font-size:10px; color:var(--text-muted);">X</span>
                <input type="number" class="prop-input" id="gradient-radial-cx" value="${Math.round((grad.cx ?? 0.5) * 100)}" min="-100" max="200" step="5" style="width:48px;" title="Posición horizontal del centro (50% = centro del vector)" />
                <span style="font-size:10px; color:var(--text-muted); margin-left:4px;">Y</span>
                <input type="number" class="prop-input" id="gradient-radial-cy" value="${Math.round((grad.cy ?? 0.5) * 100)}" min="-100" max="200" step="5" style="width:48px;" title="Posición vertical del centro (50% = centro del vector)" />
                <button class="prop-input" id="btn-reset-radial-center" style="width: 26px; height: 26px; padding: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;" title="Restablecer centro a (50%, 50%)">⟲</button>
              </div>
            </div>
            <!-- Radius (r) -->
            <div class="prop-row">
              <span class="prop-label">Radio</span>
              <div style="display:flex; gap:4px; flex:1; align-items:center;">
                <input type="number" class="prop-input" id="gradient-radial-r" value="${Math.round((grad.r ?? 0.5) * 100)}" min="5" max="300" step="5" style="width:55px;" title="Radio de difusión radial (50% = cubre hasta los bordes del vector)" />
                <span style="font-size:11px; color:var(--text-muted);">%</span>
                <button class="prop-input" id="btn-reverse-radial-gradient" style="width: 26px; height: 26px; padding: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer; margin-left: auto;" title="Invertir paradas de color">⇄</button>
              </div>
            </div>
            <!-- Focal Point (fx, fy) -->
            <div class="prop-row">
              <span class="prop-label">Foco</span>
              <div style="display:flex; gap:4px; flex:1; align-items:center;">
                <span style="font-size:10px; color:var(--text-muted);">X</span>
                <input type="number" class="prop-input" id="gradient-radial-fx" value="${Math.round((grad.fx ?? grad.cx ?? 0.5) * 100)}" min="-100" max="200" step="5" style="width:48px;" title="Punto focal de iluminación horizontal (fx)" />
                <span style="font-size:10px; color:var(--text-muted); margin-left:4px;">Y</span>
                <input type="number" class="prop-input" id="gradient-radial-fy" value="${Math.round((grad.fy ?? grad.cy ?? 0.5) * 100)}" min="-100" max="200" step="5" style="width:48px;" title="Punto focal de iluminación vertical (fy)" />
                <button class="prop-input" id="btn-sync-radial-focus" style="width: 26px; height: 26px; padding: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;" title="Igualar foco al centro">⟲</button>
              </div>
            </div>

            <!-- Fill Transformation Locks & Aspect Reset Controls -->
            <div style="margin: 8px 0 6px 0; padding: 6px 0; border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle); display: flex; flex-direction: column; gap: 5px;">
              <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 2px;">
                Fijación y Ajuste de Relleno
              </div>

              <!-- Lock Escala -->
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                <span class="prop-label" style="width: auto; flex: 1; font-size: 11px;" title="Bloquear escala: el relleno escala con el vector. Desbloqueado: conserva dimensiones fijas en pantalla.">Escala</span>
                <button class="prop-input" id="btn-lock-fill-scale" style="width: 28px; height: 24px; padding: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 12px;" title="${grad.lockScale !== false ? 'Escala bloqueada (acompaña al vector). Clic para desbloquear y mantener tamaño fijo.' : 'Escala desbloqueada (mantiene tamaño fijo en pantalla). Clic para bloquear.'}">
                  ${grad.lockScale !== false ? '🔒' : '🔓'}
                </button>
                <button class="prop-input" id="btn-reset-fill-scale" style="width: 28px; height: 24px; padding: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 12px;" title="Restablecer escala del relleno a las dimensiones del vector">
                  ⟲
                </button>
              </div>

              <!-- Lock Posición -->
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                <span class="prop-label" style="width: auto; flex: 1; font-size: 11px;" title="Bloquear posición: el relleno se traslada con el vector. Desbloqueado: permanece fijo en el lienzo.">Posición</span>
                <button class="prop-input" id="btn-lock-fill-pos" style="width: 28px; height: 24px; padding: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 12px;" title="${grad.lockPosition !== false ? 'Posición bloqueada (acompaña al vector). Clic para desbloquear y fijar al lienzo.' : 'Posición desbloqueada (fijo en el lienzo). Clic para bloquear.'}">
                  ${grad.lockPosition !== false ? '🔒' : '🔓'}
                </button>
                <button class="prop-input" id="btn-reset-fill-pos" style="width: 28px; height: 24px; padding: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 12px;" title="Recentrar posición del relleno en el centro del vector">
                  ⟲
                </button>
              </div>

              <!-- Lock Rotación -->
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                <span class="prop-label" style="width: auto; flex: 1; font-size: 11px;" title="Bloquear rotación: el relleno gira con el vector. Desbloqueado: conserva orientación fija en el lienzo.">Rotación</span>
                <button class="prop-input" id="btn-lock-fill-rot" style="width: 28px; height: 24px; padding: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 12px;" title="${grad.lockRotation !== false ? 'Rotación bloqueada (gira con el vector). Clic para desbloquear y fijar orientación al lienzo.' : 'Rotación desbloqueada (orientación fija en el lienzo). Clic para bloquear.'}">
                  ${grad.lockRotation !== false ? '🔒' : '🔓'}
                </button>
                <button class="prop-input" id="btn-reset-fill-rot" style="width: 28px; height: 24px; padding: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 12px;" title="Restablecer rotación del relleno a 0° relativo al vector">
                  ⟲
                </button>
              </div>
            </div>

            <!-- Active Stop Selector & Inspector -->
            <div class="prop-row">
              <span class="prop-label">Stop</span>
              <select class="prop-input" id="gradient-active-stop-select" style="cursor:pointer;">
                ${grad.stops.map((s, idx) => `<option value="${idx}">Parada ${idx + 1} (${Math.round(s.offset * 100)}%)</option>`).join('')}
              </select>
            </div>
            <div class="prop-row">
              <span class="prop-label">Offset %</span>
              <input type="number" class="prop-input" id="gradient-stop-offset" value="${Math.round((grad.stops[0]?.offset ?? 0) * 100)}" min="0" max="100" step="5" />
              <span class="prop-label" style="width:40px; text-align:right;">Opac%</span>
              <input type="number" class="prop-input" id="gradient-stop-opacity" value="${Math.round((grad.stops[0]?.opacity ?? 1) * 100)}" min="0" max="100" step="5" />
            </div>
            <div class="prop-row">
              <span class="prop-label">Color</span>
              <div class="color-picker-row">
                <input type="color" class="color-swatch" id="gradient-stop-color" value="${grad.stops[0]?.color ?? '#4f46e5'}" />
                <input type="text" class="prop-input" id="gradient-stop-color-hex" value="${grad.stops[0]?.color ?? '#4f46e5'}" />
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  public static bindEvents(
    container: HTMLElement,
    el: VectorElement,
    model: VectorModel,
    isClosed: boolean,
    grad: GradientConfig,
    fillType: 'solid' | 'linear' | 'radial' | 'none',
    callbacks: PropertyPanelCallbacks,
    onReRender: () => void
  ): void {
    let activeStopIdx = 0;

    const fillTypeSelect = container.querySelector<HTMLSelectElement>('#el-fill-type');
    const solidControls = container.querySelector<HTMLElement>('#fill-solid-controls');
    const gradControls = container.querySelector<HTMLElement>('#fill-gradient-controls');
    const angleRow = container.querySelector<HTMLElement>('#gradient-angle-row');
    const radialControls = container.querySelector<HTMLElement>('#fill-radial-controls');
    const elFillColor = container.querySelector<HTMLInputElement>('#el-fill-color');
    const elFillHex = container.querySelector<HTMLInputElement>('#el-fill-hex');

    const computeGradientCss = (g: GradientConfig): string => {
      const sorted = [...g.stops].sort((a, b) => a.offset - b.offset);
      const stopsStr = sorted.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ');
      return `linear-gradient(90deg, ${stopsStr})`;
    };

    const btnRemoveFill = container.querySelector<HTMLButtonElement>('#btn-remove-fill');
    if (btnRemoveFill) {
      btnRemoveFill.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        el.attributes['fill'] = 'none';
        delete el.attributes['data-gradient'];
        callbacks.onUpdateElement(el);
        onReRender();
      });
    }

    const btnAddFill = container.querySelector<HTMLButtonElement>('#btn-add-fill');
    const btnAddFillBody = container.querySelector<HTMLButtonElement>('#btn-add-fill-body');
    const onAddFillClicked = () => {
      if (callbacks.onPushUndo) callbacks.onPushUndo();
      if (!isClosed && el.vertices && el.vertices.length > 2) {
        if (callbacks.onClosePath) {
          callbacks.onClosePath();
        } else {
          el.isClosed = true;
          el.attributes.d = model.compilePathD(el.vertices, true);
        }
      }
      el.attributes['fill'] = elFillColor?.value || '#4f46e5';
      delete el.attributes['data-gradient'];
      callbacks.onUpdateElement(el);
      onReRender();
    };
    if (btnAddFill) btnAddFill.addEventListener('click', onAddFillClicked);
    if (btnAddFillBody) btnAddFillBody.addEventListener('click', onAddFillClicked);

    const btnClosePath = container.querySelector<HTMLButtonElement>('#btn-prop-close-path');
    if (btnClosePath) {
      btnClosePath.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        if (callbacks.onClosePath) {
          callbacks.onClosePath();
        } else if (el.vertices && el.vertices.length > 2) {
          el.isClosed = true;
          el.attributes.d = model.compilePathD(el.vertices, true);
          callbacks.onUpdateElement(el);
          onReRender();
        }
      });
    }

    const applyFillChanges = () => {
      if (fillType === 'none') {
        el.attributes['fill'] = 'none';
        delete el.attributes['data-gradient'];
      } else if (fillType === 'solid') {
        if (!isClosed && el.vertices && el.vertices.length > 2) {
          el.isClosed = true;
          el.attributes.d = model.compilePathD(el.vertices, true);
        }
        el.attributes['fill'] = elFillColor?.value || '#4f46e5';
        delete el.attributes['data-gradient'];
      } else {
        if (!isClosed && el.vertices && el.vertices.length > 2) {
          el.isClosed = true;
          el.attributes.d = model.compilePathD(el.vertices, true);
        }
        grad.type = fillType === 'radial' ? 'radial' : 'linear';
        el.attributes['data-gradient'] = JSON.stringify(grad);
        el.attributes['fill'] = `url(#ad-grad-${el.id})`;
        const barPreview = container.querySelector<HTMLElement>('#gradient-bar-preview');
        if (barPreview) {
          barPreview.style.background = computeGradientCss(grad);
        }
      }
      callbacks.onUpdateElement(el);
    };

    const syncActiveStopInputs = () => {
      const stop = grad.stops[activeStopIdx] || grad.stops[0];
      if (!stop) return;
      const stopOffset = container.querySelector<HTMLInputElement>('#gradient-stop-offset');
      const stopOpacity = container.querySelector<HTMLInputElement>('#gradient-stop-opacity');
      const stopColor = container.querySelector<HTMLInputElement>('#gradient-stop-color');
      const stopColorHex = container.querySelector<HTMLInputElement>('#gradient-stop-color-hex');
      const stopSelect = container.querySelector<HTMLSelectElement>('#gradient-active-stop-select');
      const delStopBtn = container.querySelector<HTMLButtonElement>('#btn-delete-gradient-stop');

      if (stopOffset) stopOffset.value = Math.round(stop.offset * 100).toString();
      if (stopOpacity) stopOpacity.value = Math.round(stop.opacity * 100).toString();
      if (stopColor) stopColor.value = stop.color;
      if (stopColorHex) stopColorHex.value = stop.color;
      if (stopSelect) {
        stopSelect.innerHTML = grad.stops
          .map((s, idx) => `<option value="${idx}" ${idx === activeStopIdx ? 'selected' : ''}>Parada ${idx + 1} (${Math.round(s.offset * 100)}%)</option>`)
          .join('');
      }
      if (delStopBtn) delStopBtn.disabled = grad.stops.length <= 2;
    };

    if (fillTypeSelect) {
      fillTypeSelect.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        fillType = fillTypeSelect.value as any;
        if (fillType === 'none') {
          el.attributes['fill'] = 'none';
          delete el.attributes['data-gradient'];
          callbacks.onUpdateElement(el);
          onReRender();
          return;
        }
        if (solidControls) solidControls.style.display = fillType === 'solid' ? '' : 'none';
        if (gradControls) gradControls.style.display = (fillType === 'linear' || fillType === 'radial') ? '' : 'none';
        if (angleRow) angleRow.style.display = fillType === 'linear' ? '' : 'none';
        if (radialControls) radialControls.style.display = fillType === 'radial' ? '' : 'none';
        if (fillType === 'radial') {
          grad.cx = grad.cx ?? 0.5;
          grad.cy = grad.cy ?? 0.5;
          grad.r = grad.r ?? 0.5;
          grad.rx = grad.rx ?? grad.r ?? 0.5;
          grad.ry = grad.ry ?? grad.rx ?? 0.5;
          grad.rotation = grad.rotation ?? 0;
        }
        applyFillChanges();
        onReRender();
      });
    }

    if (elFillColor) {
      elFillColor.addEventListener('input', () => {
        if (fillType === 'solid') {
          el.attributes['fill'] = elFillColor.value;
          if (elFillHex) elFillHex.value = elFillColor.value;
          callbacks.onUpdateElement(el);
        }
      });
      elFillColor.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
      });
    }
    if (elFillHex) {
      elFillHex.addEventListener('change', () => {
        if (fillType === 'solid') {
          if (callbacks.onPushUndo) callbacks.onPushUndo();
          el.attributes['fill'] = elFillHex.value;
          if (elFillColor) elFillColor.value = elFillHex.value;
          callbacks.onUpdateElement(el);
        }
      });
    }

    const stopSelect = container.querySelector<HTMLSelectElement>('#gradient-active-stop-select');
    if (stopSelect) {
      stopSelect.addEventListener('change', () => {
        activeStopIdx = parseInt(stopSelect.value, 10) || 0;
        syncActiveStopInputs();
      });
    }

    const stopOffset = container.querySelector<HTMLInputElement>('#gradient-stop-offset');
    if (stopOffset) {
      stopOffset.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const pct = Math.max(0, Math.min(100, parseFloat(stopOffset.value) || 0));
        if (grad.stops[activeStopIdx]) {
          grad.stops[activeStopIdx].offset = pct / 100;
          applyFillChanges();
          syncActiveStopInputs();
        }
      });
    }

    const stopOpacity = container.querySelector<HTMLInputElement>('#gradient-stop-opacity');
    if (stopOpacity) {
      stopOpacity.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const pct = Math.max(0, Math.min(100, parseFloat(stopOpacity.value) || 0));
        if (grad.stops[activeStopIdx]) {
          grad.stops[activeStopIdx].opacity = pct / 100;
          applyFillChanges();
        }
      });
    }

    const stopColor = container.querySelector<HTMLInputElement>('#gradient-stop-color');
    const stopColorHex = container.querySelector<HTMLInputElement>('#gradient-stop-color-hex');
    if (stopColor) {
      stopColor.addEventListener('input', () => {
        if (grad.stops[activeStopIdx]) {
          grad.stops[activeStopIdx].color = stopColor.value;
          if (stopColorHex) stopColorHex.value = stopColor.value;
          applyFillChanges();
        }
      });
      stopColor.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
      });
    }
    if (stopColorHex) {
      stopColorHex.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        if (grad.stops[activeStopIdx]) {
          grad.stops[activeStopIdx].color = stopColorHex.value;
          if (stopColor) stopColor.value = stopColorHex.value;
          applyFillChanges();
        }
      });
    }

    const addStopBtn = container.querySelector<HTMLButtonElement>('#btn-add-gradient-stop');
    if (addStopBtn) {
      addStopBtn.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const curOffset = grad.stops[activeStopIdx]?.offset ?? 0;
        const newOffset = Math.round(((curOffset + 1) / 2) * 100) / 100;
        grad.stops.push({
          id: `stop_${Date.now().toString(36)}`,
          offset: Math.min(newOffset, 0.95),
          color: '#f59e0b',
          opacity: 1,
        });
        activeStopIdx = grad.stops.length - 1;
        applyFillChanges();
        syncActiveStopInputs();
      });
    }

    const delStopBtn = container.querySelector<HTMLButtonElement>('#btn-delete-gradient-stop');
    if (delStopBtn) {
      delStopBtn.addEventListener('click', () => {
        if (grad.stops.length <= 2) return;
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        grad.stops.splice(activeStopIdx, 1);
        activeStopIdx = Math.max(0, activeStopIdx - 1);
        applyFillChanges();
        syncActiveStopInputs();
      });
    }

    const revBtn = container.querySelector<HTMLButtonElement>('#btn-reverse-gradient');
    if (revBtn) {
      revBtn.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        grad.stops.forEach((s) => {
          s.offset = Math.round((1 - s.offset) * 100) / 100;
        });
        grad.stops.sort((a, b) => a.offset - b.offset);
        applyFillChanges();
        syncActiveStopInputs();
      });
    }

    const gradAngle = container.querySelector<HTMLInputElement>('#gradient-angle');
    const gradAnglePreset = container.querySelector<HTMLSelectElement>('#gradient-angle-preset');
    if (gradAngle) {
      gradAngle.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        grad.angle = parseFloat(gradAngle.value) || 0;
        if (gradAnglePreset) gradAnglePreset.value = gradAngle.value;
        applyFillChanges();
      });
    }
    if (gradAnglePreset) {
      gradAnglePreset.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        grad.angle = parseFloat(gradAnglePreset.value) || 0;
        if (gradAngle) gradAngle.value = gradAnglePreset.value;
        applyFillChanges();
      });
    }

    // Radial Gradient Numeric Controls Event Listeners
    const radialCx = container.querySelector<HTMLInputElement>('#radial-cx');
    const radialCy = container.querySelector<HTMLInputElement>('#radial-cy');
    const btnResetRadialCenter = container.querySelector<HTMLButtonElement>('#btn-reset-radial-center');
    const radialFx = container.querySelector<HTMLInputElement>('#radial-fx');
    const radialFy = container.querySelector<HTMLInputElement>('#radial-fy');

    const updateRadialCenter = () => {
      if (callbacks.onPushUndo) callbacks.onPushUndo();
      const cxPct = parseFloat(radialCx?.value || '50') || 50;
      const cyPct = parseFloat(radialCy?.value || '50') || 50;
      const newCx = Math.round((cxPct / 100) * 1000) / 1000;
      const newCy = Math.round((cyPct / 100) * 1000) / 1000;
      if (grad.fx === undefined || grad.fx === grad.cx) {
        grad.fx = newCx;
        grad.fy = newCy;
        if (radialFx) radialFx.value = Math.round(newCx * 100).toString();
        if (radialFy) radialFy.value = Math.round(newCy * 100).toString();
      }
      grad.cx = newCx;
      grad.cy = newCy;
      applyFillChanges();
    };

    if (radialCx) radialCx.addEventListener('change', updateRadialCenter);
    if (radialCy) radialCy.addEventListener('change', updateRadialCenter);
    if (btnResetRadialCenter) {
      btnResetRadialCenter.addEventListener('click', () => {
        if (radialCx) radialCx.value = '50';
        if (radialCy) radialCy.value = '50';
        updateRadialCenter();
      });
    }

    const radialRx = container.querySelector<HTMLInputElement>('#radial-rx');
    const radialRy = container.querySelector<HTMLInputElement>('#radial-ry');
    const btnResetRadialRadius = container.querySelector<HTMLButtonElement>('#btn-reset-radial-radius');

    const updateRadialRadii = () => {
      if (callbacks.onPushUndo) callbacks.onPushUndo();
      const rxPct = Math.max(1, parseFloat(radialRx?.value || '50') || 50);
      const ryPct = Math.max(1, parseFloat(radialRy?.value || '50') || 50);
      grad.rx = Math.round((rxPct / 100) * 1000) / 1000;
      grad.ry = Math.round((ryPct / 100) * 1000) / 1000;
      grad.r = grad.rx;
      applyFillChanges();
    };

    if (radialRx) radialRx.addEventListener('change', updateRadialRadii);
    if (radialRy) radialRy.addEventListener('change', updateRadialRadii);
    if (btnResetRadialRadius) {
      btnResetRadialRadius.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        if (radialRx) radialRx.value = '50';
        if (radialRy) radialRy.value = '50';
        grad.rx = 0.5;
        grad.ry = 0.5;
        grad.r = 0.5;
        applyFillChanges();
      });
    }

    const radialRotation = container.querySelector<HTMLInputElement>('#radial-rotation');
    const btnResetRadialRotation = container.querySelector<HTMLButtonElement>('#btn-reset-radial-rotation');
    if (radialRotation) {
      radialRotation.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const rotVal = parseFloat(radialRotation.value || '0') || 0;
        grad.rotation = Math.round((((rotVal % 360) + 360) % 360) * 10) / 10;
        applyFillChanges();
      });
    }
    if (btnResetRadialRotation) {
      btnResetRadialRotation.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        if (radialRotation) radialRotation.value = '0';
        grad.rotation = 0;
        applyFillChanges();
      });
    }

    const btnSyncRadialFocus = container.querySelector<HTMLButtonElement>('#btn-sync-radial-focus');
    const updateRadialFocus = () => {
      if (callbacks.onPushUndo) callbacks.onPushUndo();
      const fxPct = parseFloat(radialFx?.value || '50') || 50;
      const fyPct = parseFloat(radialFy?.value || '50') || 50;
      grad.fx = Math.round((fxPct / 100) * 1000) / 1000;
      grad.fy = Math.round((fyPct / 100) * 1000) / 1000;
      applyFillChanges();
    };

    if (radialFx) radialFx.addEventListener('change', updateRadialFocus);
    if (radialFy) radialFy.addEventListener('change', updateRadialFocus);
    if (btnSyncRadialFocus) {
      btnSyncRadialFocus.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        grad.fx = grad.cx ?? 0.5;
        grad.fy = grad.cy ?? 0.5;
        if (radialFx) radialFx.value = Math.round((grad.fx) * 100).toString();
        if (radialFy) radialFy.value = Math.round((grad.fy) * 100).toString();
        applyFillChanges();
      });
    }

    // Fill Transformation Locks & Reset Event Listeners
    const btnLockScale = container.querySelector<HTMLButtonElement>('#btn-lock-fill-scale');
    if (btnLockScale) {
      btnLockScale.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        grad.lockScale = grad.lockScale !== false ? false : true;
        btnLockScale.textContent = grad.lockScale ? '🔒' : '🔓';
        btnLockScale.title = grad.lockScale
          ? 'Escala bloqueada (acompaña al vector). Clic para desbloquear y mantener tamaño fijo.'
          : 'Escala desbloqueada (mantiene tamaño fijo en pantalla). Clic para bloquear.';
        applyFillChanges();
      });
    }

    const btnResetScale = container.querySelector<HTMLButtonElement>('#btn-reset-fill-scale');
    if (btnResetScale) {
      btnResetScale.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        if (grad.type === 'radial') {
          grad.rx = 0.5;
          grad.ry = 0.5;
          grad.r = 0.5;
          const rxInput = container.querySelector<HTMLInputElement>('#radial-rx');
          const ryInput = container.querySelector<HTMLInputElement>('#radial-ry');
          if (rxInput) rxInput.value = '50';
          if (ryInput) ryInput.value = '50';
        } else {
          grad.r = 0.5;
        }
        applyFillChanges();
        callbacks.onRenderOverlay?.();
      });
    }

    const btnLockPos = container.querySelector<HTMLButtonElement>('#btn-lock-fill-pos');
    if (btnLockPos) {
      btnLockPos.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        grad.lockPosition = grad.lockPosition !== false ? false : true;
        btnLockPos.textContent = grad.lockPosition ? '🔒' : '🔓';
        btnLockPos.title = grad.lockPosition
          ? 'Posición bloqueada (acompaña al vector). Clic para desbloquear y fijar al lienzo.'
          : 'Posición desbloqueada (fijo en el lienzo). Clic para bloquear.';
        applyFillChanges();
      });
    }

    const btnResetPos = container.querySelector<HTMLButtonElement>('#btn-reset-fill-pos');
    if (btnResetPos) {
      btnResetPos.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        grad.cx = 0.5;
        grad.cy = 0.5;
        if (grad.type === 'radial') {
          grad.fx = 0.5;
          grad.fy = 0.5;
          const cxInput = container.querySelector<HTMLInputElement>('#radial-cx');
          const cyInput = container.querySelector<HTMLInputElement>('#radial-cy');
          const fxInput = container.querySelector<HTMLInputElement>('#radial-fx');
          const fyInput = container.querySelector<HTMLInputElement>('#radial-fy');
          if (cxInput) cxInput.value = '50';
          if (cyInput) cyInput.value = '50';
          if (fxInput) fxInput.value = '50';
          if (fyInput) fyInput.value = '50';
        }
        applyFillChanges();
        callbacks.onRenderOverlay?.();
      });
    }

    const btnLockRot = container.querySelector<HTMLButtonElement>('#btn-lock-fill-rot');
    if (btnLockRot) {
      btnLockRot.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        grad.lockRotation = grad.lockRotation !== false ? false : true;
        btnLockRot.textContent = grad.lockRotation ? '🔒' : '🔓';
        btnLockRot.title = grad.lockRotation
          ? 'Rotación bloqueada (gira con el vector). Clic para desbloquear y fijar orientación al lienzo.'
          : 'Rotación desbloqueada (orientación fija en el lienzo). Clic para bloquear.';
        applyFillChanges();
      });
    }

    const btnResetRot = container.querySelector<HTMLButtonElement>('#btn-reset-fill-rot');
    if (btnResetRot) {
      btnResetRot.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        if (grad.type === 'radial') {
          grad.rotation = 0;
          const rotInput = container.querySelector<HTMLInputElement>('#radial-rotation');
          if (rotInput) rotInput.value = '0';
        } else {
          grad.angle = 0;
          const angleInput = container.querySelector<HTMLInputElement>('#gradient-angle');
          const anglePreset = container.querySelector<HTMLSelectElement>('#gradient-angle-preset');
          if (angleInput) angleInput.value = '0';
          if (anglePreset) anglePreset.value = '0';
        }
        applyFillChanges();
        callbacks.onRenderOverlay?.();
      });
    }

    const closePathBtn = container.querySelector<HTMLButtonElement>('#btn-prop-close-path');
    if (closePathBtn) {
      bindInspectorMouseDown(container, 'btn-prop-close-path', () => {
        if (callbacks.onClosePath) {
          callbacks.onClosePath();
        }
      });
    }
  }
}
