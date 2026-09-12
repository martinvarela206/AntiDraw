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
    stroke: string,
    strokeWidth: string,
    strokeDash: string,
    strokeLinecap: string,
    strokeLinejoin: string,
    miterAngleDeg: number,
    markerStart: string,
    markerMid: string,
    markerEnd: string,
    grad: GradientConfig,
    fillType: 'solid' | 'linear' | 'radial' | 'none',
    gradientCss: string
  ): string {
    return `
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Fill (Relleno)</span>
          ${!isClosed ? '<span style="font-size:10px; color:#94a3b8; font-weight:normal; text-transform:none;">Trazado abierto</span>' : ''}
        </div>
        ${!isClosed ? `
        <div class="prop-row">
          <span class="prop-label">Type</span>
          <select class="prop-input" id="el-fill-type" disabled style="cursor:not-allowed; opacity:0.6;" title="Los vectores abiertos no admiten relleno. Cierra el trazado formalmente para habilitar el relleno.">
            <option value="none" selected>None (Trazado abierto)</option>
          </select>
        </div>
        <div style="font-size:11px; color:#94a3b8; margin-top:4px; line-height:1.4;">
          Los vectores abiertos tienen el relleno bloqueado a <code>none</code> para evitar cierres simulados.
        </div>
        <div style="margin-top:6px;">
          <button class="prop-input" id="btn-prop-close-path" style="width:100%; cursor:pointer; background:#3b82f6; color:#fff; text-align:center; font-weight:600; padding:4px 8px; font-size:11px;" title="Cerrar trazado formalmente uniendo extremos libres con Z">Cerrar Trazado (Z)</button>
        </div>
        ` : `
        <div class="prop-row">
          <span class="prop-label">Type</span>
          <select class="prop-input" id="el-fill-type" style="cursor:pointer;">
            <option value="solid" ${fillType === 'solid' ? 'selected' : ''}>Solid Color</option>
            <option value="linear" ${fillType === 'linear' ? 'selected' : ''}>Linear Gradient</option>
            <option value="radial" ${fillType === 'radial' ? 'selected' : ''}>Radial Gradient</option>
            <option value="none" ${fillType === 'none' ? 'selected' : ''}>None</option>
          </select>
        </div>

        <!-- Solid Fill Container -->
        <div id="fill-solid-controls" style="${fillType === 'solid' ? '' : 'display: none;'}">
          <div class="prop-row">
            <span class="prop-label">Color</span>
            <div class="color-picker-row">
              <input type="color" class="color-swatch" id="el-fill-color" value="${fill === 'none' || fill.startsWith('url') ? '#4f46e5' : fill}" />
              <input type="text" class="prop-input" id="el-fill-hex" value="${fill.startsWith('url') ? '#4f46e5' : fill}" />
            </div>
          </div>
        </div>

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
                </div>
              </div>
              <button class="prop-input" id="btn-reset-radial-radius" style="width: auto; padding: 2px 8px; height: 26px; cursor: pointer; flex-shrink: 0;" title="Restablecer radios al 50% (círculo simétrico)">50%</button>
            </div>
            <div class="prop-row" style="gap: 6px;">
              <span class="prop-label" style="width: 46px;" title="Giro o rotación angular del gradiente radial elíptico en grados">Giro</span>
              <div class="prop-coord-box" style="flex: 1;" title="Ángulo de rotación del gradiente radial (°)">
                <span class="prop-coord-sublabel">∠</span>
                <input type="number" class="prop-coord-input" id="radial-rotation" value="${Math.round(grad.rotation ?? 0)}" min="-360" max="360" step="5" />
                <span class="prop-coord-sublabel">°</span>
              </div>
              <button class="prop-input" id="btn-reset-radial-rotation" style="width: 26px; height: 26px; padding: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;" title="Restablecer rotación a 0°">⟲</button>
            </div>
            <div class="prop-row" style="gap: 6px;">
              <span class="prop-label" style="width: 46px;" title="Foco de iluminación del gradiente radial">Foco</span>
              <div class="prop-coord-group">
                <div class="prop-coord-box" title="Foco X del gradiente radial (%)">
                  <span class="prop-coord-sublabel">X</span>
                  <input type="number" class="prop-coord-input" id="radial-fx" value="${Math.round((grad.fx ?? grad.cx ?? 0.5) * 100)}" min="-100" max="200" step="5" />
                  <span class="prop-coord-sublabel">%</span>
                </div>
                <div class="prop-coord-box" title="Foco Y del gradiente radial (%)">
                  <span class="prop-coord-sublabel">Y</span>
                  <input type="number" class="prop-coord-input" id="radial-fy" value="${Math.round((grad.fy ?? grad.cy ?? 0.5) * 100)}" min="-100" max="200" step="5" />
                  <span class="prop-coord-sublabel">%</span>
                </div>
              </div>
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
        `}
      </div>

      <div class="panel-section">
        <div class="panel-title">Stroke</div>
        <div class="prop-row">
          <span class="prop-label">Color</span>
          <div class="color-picker-row">
            <input type="color" class="color-swatch" id="el-stroke-color" value="${stroke === 'none' ? '#ffffff' : stroke}" />
            <input type="text" class="prop-input" id="el-stroke-hex" value="${stroke}" />
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Width</span>
          <input type="number" class="prop-input" id="el-stroke-width" value="${strokeWidth}" min="0" step="0.5" />
        </div>
        <div class="prop-row">
          <span class="prop-label">Dashes</span>
          <input type="text" class="prop-input" id="el-stroke-dash" value="${strokeDash}" placeholder="e.g. 4 2" />
        </div>
        <div class="prop-row">
          <span class="prop-label">Cap</span>
          <select class="prop-input" id="el-stroke-cap" style="cursor:pointer;">
            <option value="butt" ${strokeLinecap === 'butt' ? 'selected' : ''}>Butt</option>
            <option value="round" ${strokeLinecap === 'round' ? 'selected' : ''}>Round</option>
            <option value="square" ${strokeLinecap === 'square' ? 'selected' : ''}>Square</option>
          </select>
        </div>
        <div class="prop-row">
          <span class="prop-label">Join</span>
          <div style="display:flex; gap:4px; flex:1; align-items:center;">
            <select class="prop-input" id="el-stroke-join" style="cursor:pointer; flex:1;">
              <option value="miter" ${strokeLinejoin === 'miter' ? 'selected' : ''}>Miter</option>
              <option value="round" ${strokeLinejoin === 'round' ? 'selected' : ''}>Round</option>
              <option value="bevel" ${strokeLinejoin === 'bevel' ? 'selected' : ''}>Bevel</option>
            </select>
            <div id="container-stroke-miterlimit" style="${strokeLinejoin === 'miter' ? 'display:flex;' : 'display:none;'} align-items:center; gap:2px; width:65px;" title="Ángulo mínimo de inglete en grados (°): esquinas más agudas que este valor se cortan a bisel. Valores menores permiten puntas más afiladas.">
              <input type="number" class="prop-input" id="el-stroke-miter-angle" value="${miterAngleDeg}" min="1" max="170" step="1" style="width:45px; padding:2px 4px; text-align:right;" />
              <span style="font-size:11px; color:var(--text-muted); font-weight:600;">°</span>
            </div>
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Start Mkr</span>
          <select class="prop-input" id="el-marker-start" style="cursor:pointer;" title="Marcador de inicio de trazo (marker-start)">
            <option value="none" ${markerStart === 'none' ? 'selected' : ''}>None</option>
            <option value="arrow-open" ${markerStart === 'arrow-open' ? 'selected' : ''}>Arrow (Open)</option>
            <option value="arrow-filled" ${markerStart === 'arrow-filled' ? 'selected' : ''}>Arrow (Filled)</option>
            <option value="circle-dot" ${markerStart === 'circle-dot' ? 'selected' : ''}>Circle Dot</option>
            <option value="square-block" ${markerStart === 'square-block' ? 'selected' : ''}>Square</option>
            <option value="bar-cap" ${markerStart === 'bar-cap' ? 'selected' : ''}>Bar Cap</option>
          </select>
        </div>
        <div class="prop-row">
          <span class="prop-label">Mid Mkr</span>
          <select class="prop-input" id="el-marker-mid" style="cursor:pointer;" title="Marcador en vértices intermedios (marker-mid)">
            <option value="none" ${markerMid === 'none' ? 'selected' : ''}>None</option>
            <option value="arrow-filled" ${markerMid === 'arrow-filled' ? 'selected' : ''}>Arrow (Directional)</option>
            <option value="circle-dot" ${markerMid === 'circle-dot' ? 'selected' : ''}>Circle Dot</option>
            <option value="square-block" ${markerMid === 'square-block' ? 'selected' : ''}>Square</option>
          </select>
        </div>
        <div class="prop-row">
          <span class="prop-label">End Mkr</span>
          <select class="prop-input" id="el-marker-end" style="cursor:pointer;" title="Marcador de final de trazo (marker-end)">
            <option value="none" ${markerEnd === 'none' ? 'selected' : ''}>None</option>
            <option value="arrow-open" ${markerEnd === 'arrow-open' ? 'selected' : ''}>Arrow (Open)</option>
            <option value="arrow-filled" ${markerEnd === 'arrow-filled' ? 'selected' : ''}>Arrow (Filled)</option>
            <option value="circle-dot" ${markerEnd === 'circle-dot' ? 'selected' : ''}>Circle Dot</option>
            <option value="square-block" ${markerEnd === 'square-block' ? 'selected' : ''}>Square</option>
            <option value="bar-cap" ${markerEnd === 'bar-cap' ? 'selected' : ''}>Bar Cap</option>
          </select>
        </div>
        <div class="prop-row" style="margin-top: 8px;">
          <button class="prop-input" id="btn-stroke-to-path" style="cursor:pointer; background:var(--bg-active); text-align:center; font-weight:600; color:var(--text-main); padding:6px;" title="Convertir geométricamente el trazo en un contorno cerrado independiente con relleno (Outline Stroke)">
            ⤹ Convertir Trazo a Vector
          </button>
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

    const applyFillChanges = () => {
      if (!isClosed) {
        el.attributes['fill'] = 'none';
        delete el.attributes['data-gradient'];
      } else if (fillType === 'none') {
        el.attributes['fill'] = 'none';
        delete el.attributes['data-gradient'];
      } else if (fillType === 'solid') {
        el.attributes['fill'] = elFillColor?.value || '#4f46e5';
        delete el.attributes['data-gradient'];
      } else {
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

    if (fillTypeSelect && isClosed) {
      fillTypeSelect.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        fillType = fillTypeSelect.value as any;
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
      });
    }

    if (elFillColor && isClosed) {
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
    if (elFillHex && isClosed) {
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

    // Stroke controls
    const elStrokeColor = container.querySelector<HTMLInputElement>('#el-stroke-color');
    const elStrokeHex = container.querySelector<HTMLInputElement>('#el-stroke-hex');
    const elStrokeWidth = container.querySelector<HTMLInputElement>('#el-stroke-width');
    const elStrokeDash = container.querySelector<HTMLInputElement>('#el-stroke-dash');
    const elStrokeCap = container.querySelector<HTMLSelectElement>('#el-stroke-cap');
    const elStrokeJoin = container.querySelector<HTMLSelectElement>('#el-stroke-join');

    if (elStrokeColor) {
      elStrokeColor.addEventListener('input', () => {
        el.attributes['stroke'] = elStrokeColor.value;
        if (elStrokeHex) elStrokeHex.value = elStrokeColor.value;
        callbacks.onUpdateElement(el);
      });
    }
    if (elStrokeHex) {
      elStrokeHex.addEventListener('change', () => {
        el.attributes['stroke'] = elStrokeHex.value;
        if (elStrokeColor) elStrokeColor.value = elStrokeHex.value;
        callbacks.onUpdateElement(el);
      });
    }
    if (elStrokeWidth) {
      elStrokeWidth.addEventListener('input', () => {
        el.attributes['stroke-width'] = elStrokeWidth.value;
        callbacks.onUpdateElement(el);
      });
    }
    if (elStrokeDash) {
      elStrokeDash.addEventListener('change', () => {
        el.attributes['stroke-dasharray'] = elStrokeDash.value;
        callbacks.onUpdateElement(el);
      });
    }
    if (elStrokeCap) {
      elStrokeCap.addEventListener('change', () => {
        el.attributes['stroke-linecap'] = elStrokeCap.value;
        callbacks.onUpdateElement(el);
      });
    }
    if (elStrokeJoin) {
      elStrokeJoin.addEventListener('change', () => {
        el.attributes['stroke-linejoin'] = elStrokeJoin.value;
        const miterContainer = container.querySelector<HTMLElement>('#container-stroke-miterlimit');
        if (miterContainer) {
          miterContainer.style.display = elStrokeJoin.value === 'miter' ? 'flex' : 'none';
        }
        callbacks.onUpdateElement(el);
      });
    }

    const elStrokeMiterAngle = container.querySelector<HTMLInputElement>('#el-stroke-miter-angle');
    if (elStrokeMiterAngle) {
      const applyMiterAngle = () => {
        const deg = Math.max(1, Math.min(170, parseFloat(elStrokeMiterAngle.value) || 29));
        const limit = degreesToMiterLimit(deg);
        el.attributes['stroke-miterlimit'] = limit.toString();
        callbacks.onUpdateElement(el);
      };
      elStrokeMiterAngle.addEventListener('input', applyMiterAngle);
      elStrokeMiterAngle.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        applyMiterAngle();
      });
    }

    const elMarkerStart = container.querySelector<HTMLSelectElement>('#el-marker-start');
    const elMarkerMid = container.querySelector<HTMLSelectElement>('#el-marker-mid');
    const elMarkerEnd = container.querySelector<HTMLSelectElement>('#el-marker-end');

    if (elMarkerStart) {
      elMarkerStart.addEventListener('change', () => {
        const val = elMarkerStart.value;
        if (val === 'none') {
          delete el.attributes['marker-start'];
        } else if (val === 'circle-dot' || val === 'square-block') {
          el.attributes['marker-start'] = `url(#ad-marker-${val})`;
        } else {
          el.attributes['marker-start'] = `url(#ad-marker-${val}-start)`;
        }
        callbacks.onUpdateElement(el);
      });
    }

    if (elMarkerMid) {
      elMarkerMid.addEventListener('change', () => {
        const val = elMarkerMid.value;
        if (val === 'none') {
          delete el.attributes['marker-mid'];
        } else if (val === 'arrow-filled') {
          el.attributes['marker-mid'] = 'url(#ad-marker-arrow-filled-mid)';
        } else {
          el.attributes['marker-mid'] = `url(#ad-marker-${val})`;
        }
        callbacks.onUpdateElement(el);
      });
    }

    if (elMarkerEnd) {
      elMarkerEnd.addEventListener('change', () => {
        const val = elMarkerEnd.value;
        if (val === 'none') {
          delete el.attributes['marker-end'];
        } else if (val === 'circle-dot' || val === 'square-block') {
          el.attributes['marker-end'] = `url(#ad-marker-${val})`;
        } else {
          el.attributes['marker-end'] = `url(#ad-marker-${val}-end)`;
        }
        callbacks.onUpdateElement(el);
      });
    }

    bindInspectorMouseDown(container, 'btn-stroke-to-path', () => {
      if (callbacks.onStrokeToPath) callbacks.onStrokeToPath();
    });

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
