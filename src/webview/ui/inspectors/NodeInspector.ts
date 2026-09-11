import { VectorElement, PathVertex } from '../../engine/VectorModel.js';
import { ToolIcons } from '../../icons/ToolIcons.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';
import { bindInspectorMouseDown } from './CanvasInspector.js';

/**
 * NodeInspector
 *
 * Encapsulates the UI rendering, interactive event handlers, and high-frequency in-place
 * DOM mutations for individual vertex / node editing:
 * 1. Vertex Coordinates (Position X, Position Y)
 * 2. Node Types: sharp, asymmetric, smooth, symmetric
 * 3. Path & Node Actions: Auto-close curve (Z), split node into 2 vertices
 * 4. Segment Conversion: Convert segment to straight line (L) or Bézier curve (C)
 * 5. 60fps in-place mutation during active node dragging to eliminate DOM teardown/reflow.
 */
export class NodeInspector {
  /**
   * Generates HTML markup for single selected vertex properties.
   */
  public static renderHtml(el: VectorElement, v: PathVertex): string {
    const isSharp = v.nodeType === 'sharp' || (!v.handleIn && !v.handleOut);
    const isClosed =
      el.isClosed ??
      (!el.tagName ||
        ['rect', 'circle', 'ellipse', 'star', 'polygon'].includes(el.tagName) ||
        (el.attributes.d ? /z/i.test(el.attributes.d) : false));

    return `
      <div class="panel-section">
        <div class="panel-title">Vertex Coordinates</div>
        <div class="prop-row">
          <span class="prop-label">Position X</span>
          <input type="number" class="prop-input" id="node-pos-x" value="${Math.round(v.x)}" readonly />
        </div>
        <div class="prop-row">
          <span class="prop-label">Position Y</span>
          <input type="number" class="prop-input" id="node-pos-y" value="${Math.round(v.y)}" readonly />
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-title">Node Type</div>
        <div class="prop-row" style="justify-content: flex-start; gap: 8px;">
          <button class="btn-icon ${isSharp ? 'active' : ''}" id="btn-node-sharp" title="Sin tiradores (Cúspide / Recto)">
            ${ToolIcons.nodeSharp}
          </button>
          <button class="btn-icon ${!isSharp && v.nodeType === 'asymmetric' ? 'active' : ''}" id="btn-node-asym" title="Asymmetric Node (Independent Handles)">
            ${ToolIcons.nodeAsymmetric}
          </button>
          <button class="btn-icon ${!isSharp && v.nodeType === 'smooth' ? 'active' : ''}" id="btn-node-smooth" title="Uniform / Smooth Node">
            ${ToolIcons.nodeSmooth}
          </button>
          <button class="btn-icon ${!isSharp && v.nodeType === 'symmetric' ? 'active' : ''}" id="btn-node-sym" title="Symmetric Node">
            ${ToolIcons.nodeSymmetric}
          </button>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-title">Path &amp; Node Actions</div>
        <div class="prop-row" style="flex-direction:column; gap:6px;">
          ${!isClosed ? `
            <button class="prop-input" id="btn-close-curve" style="cursor:pointer; background:var(--accent-color); color:#fff; text-align:center; font-weight:600;" title="Auto-Cerrar trazado uniendo extremos con comando Z">
              ⟳ Auto-Cerrar Curva (Z)
            </button>
          ` : `
            <div style="font-size:11px; color:var(--text-muted); text-align:center; padding: 3px 0;">✓ Contorno cerrado (Z)</div>
          `}
          <button class="prop-input" id="btn-split-node" style="cursor:pointer; background:var(--bg-active); text-align:center;">
            ${ToolIcons.splitNode} Split Node into 2 Vertices
          </button>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-title">Segment Conversion</div>
        <div class="prop-row" style="display:flex; gap:6px;">
          <button class="prop-input" id="btn-segment-to-line" style="cursor:pointer; background:var(--bg-active); text-align:center; flex:1;" title="Convertir tramo a recta pura (L)">
            ― A Recta
          </button>
          <button class="prop-input" id="btn-segment-to-curve" style="cursor:pointer; background:var(--bg-active); text-align:center; flex:1;" title="Convertir tramo a curva Bézier (C)">
            ∿ A Curva
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Binds mouse interaction events for node operations.
   * Uses mousedown + preventDefault + stopPropagation to preserve canvas focus.
   */
  public static bindEvents(container: HTMLElement, callbacks: PropertyPanelCallbacks): void {
    bindInspectorMouseDown(container, 'btn-node-sharp', () => callbacks.onNodeTypeChange('sharp'));
    bindInspectorMouseDown(container, 'btn-node-asym', () => callbacks.onNodeTypeChange('asymmetric'));
    bindInspectorMouseDown(container, 'btn-node-smooth', () => callbacks.onNodeTypeChange('smooth'));
    bindInspectorMouseDown(container, 'btn-node-sym', () => callbacks.onNodeTypeChange('symmetric'));
    bindInspectorMouseDown(container, 'btn-close-curve', () => {
      if (callbacks.onClosePath) callbacks.onClosePath();
    });
    bindInspectorMouseDown(container, 'btn-split-node', () => callbacks.onSplitNode());
    bindInspectorMouseDown(container, 'btn-segment-to-line', () => {
      if (callbacks.onConvertSegmentToLine) callbacks.onConvertSegmentToLine();
    });
    bindInspectorMouseDown(container, 'btn-segment-to-curve', () => {
      if (callbacks.onConvertSegmentToCurve) callbacks.onConvertSegmentToCurve();
    });
  }

  /**
   * ARCHITECTURAL RATIONALE: High-Frequency In-Place DOM Mutation
   *
   * Why this exists:
   * During active node dragging, update() is called on every animation frame/mousemove event.
   * If renderNodeProperties() were invoked each time, it would completely wipe innerHTML,
   * forcing browser reflow, destroying active input cursor focus, and producing perceptible frame drops.
   * By mutating only the existing text inputs and active CSS classes in place, 60fps responsiveness
   * is preserved without flickering or focus loss.
   */
  public static updateInPlace(container: HTMLElement, v: PathVertex): void {
    const xInput = container.querySelector<HTMLInputElement>('#node-pos-x');
    const yInput = container.querySelector<HTMLInputElement>('#node-pos-y');
    if (xInput) xInput.value = Math.round(v.x).toString();
    if (yInput) yInput.value = Math.round(v.y).toString();

    const isSharp = v.nodeType === 'sharp' || (!v.handleIn && !v.handleOut);
    const sharpBtn = container.querySelector('#btn-node-sharp');
    const asymBtn = container.querySelector('#btn-node-asym');
    const smoothBtn = container.querySelector('#btn-node-smooth');
    const symBtn = container.querySelector('#btn-node-sym');

    if (sharpBtn) sharpBtn.classList.toggle('active', isSharp);
    if (asymBtn) asymBtn.classList.toggle('active', !isSharp && v.nodeType === 'asymmetric');
    if (smoothBtn) smoothBtn.classList.toggle('active', !isSharp && v.nodeType === 'smooth');
    if (symBtn) symBtn.classList.toggle('active', !isSharp && v.nodeType === 'symmetric');
  }
}
