import { VectorElement, PathVertex } from '../../engine/VectorModel.js';
import { ToolIcons } from '../../icons/ToolIcons.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';
import { bindInspectorMouseDown } from './CanvasInspector.js';
import { I18nService } from '../../i18n/index.js';

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
   * Generates HTML markup for single or multi-selected vertex properties.
   */
  public static renderHtml(
    el: VectorElement,
    v: PathVertex,
    selectedCount: number = 1,
    isParametric: boolean = false
  ): string {
    const isMulti = selectedCount > 1;
    const isSharp = v.nodeType === 'sharp' || (!v.handleIn && !v.handleOut);
    const isClosed =
      el.isClosed ??
      (!el.tagName ||
        ['rect', 'circle', 'ellipse', 'star', 'polygon'].includes(el.tagName) ||
        (el.attributes.d ? /z/i.test(el.attributes.d) : false));

    return `
      <div class="panel-section">
        <div class="panel-title">${isMulti ? `${selectedCount} ${I18nService.t('common.nodes')} ${I18nService.t('common.selected')}` : I18nService.t('inspector.vertexCoordinates')}</div>
        ${!isMulti ? `
        <div class="prop-row">
          <span class="prop-label">Position X</span>
          <input type="number" class="prop-input" id="node-pos-x" value="${Math.round(v.x)}" readonly />
        </div>
        <div class="prop-row">
          <span class="prop-label">Position Y</span>
          <input type="number" class="prop-input" id="node-pos-y" value="${Math.round(v.y)}" readonly />
        </div>
        ` : `
        <div style="font-size:11px; color:var(--text-muted); line-height:1.5;">
          ${selectedCount} ${I18nService.t('common.nodes')}
        </div>
        `}
      </div>
      <div class="panel-section">
        <div class="panel-title">${I18nService.t('inspector.nodeType')} ${isMulti ? `(${I18nService.t('inspector.batch')})` : ''}</div>
        ${isParametric ? `
        <div style="margin-bottom: 8px; padding: 6px 8px; background: rgba(59, 130, 246, 0.08); border: 1px dashed rgba(59, 130, 246, 0.3); border-radius: 4px;">
          <button class="prop-input" id="btn-convert-to-curves-node" style="cursor:pointer; background:var(--accent-color, #3b82f6); color:#fff; border:none; border-radius:4px; padding:5px 8px; font-weight:600; font-size:11px; display:flex; align-items:center; justify-content:center; gap:6px; width:100%;" title="${I18nService.t('inspector.convertToCurves')}">
            <span>${ToolIcons.lightning}</span>
            <span>${I18nService.t('inspector.convertToCurves')}</span>
          </button>
        </div>
        ` : ''}
        <div class="prop-row" style="justify-content: flex-start; gap: 8px; ${isParametric ? 'opacity: 0.35; filter: grayscale(1); pointer-events: none;' : ''}">
          <button class="btn-icon ${isSharp && !isMulti ? 'active' : ''}" id="btn-node-sharp" ${isParametric ? 'disabled' : ''} title="${I18nService.t('inspector.nodeSharp')}">
            ${ToolIcons.nodeSharp}
          </button>
          <button class="btn-icon ${!isSharp && !isMulti && v.nodeType === 'asymmetric' ? 'active' : ''}" id="btn-node-asym" ${isParametric ? 'disabled' : ''} title="${I18nService.t('inspector.nodeAsymmetric')}">
            ${ToolIcons.nodeAsymmetric}
          </button>
          <button class="btn-icon ${!isSharp && !isMulti && v.nodeType === 'smooth' ? 'active' : ''}" id="btn-node-smooth" ${isParametric ? 'disabled' : ''} title="${I18nService.t('inspector.nodeSmooth')}">
            ${ToolIcons.nodeSmooth}
          </button>
          <button class="btn-icon ${!isSharp && !isMulti && v.nodeType === 'symmetric' ? 'active' : ''}" id="btn-node-sym" ${isParametric ? 'disabled' : ''} title="${I18nService.t('inspector.nodeSymmetric')}">
            ${ToolIcons.nodeSymmetric}
          </button>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-title">${I18nService.t('inspector.nodeActions')}</div>
        <div class="prop-row" style="flex-direction:column; gap:6px;">
          ${!isClosed ? `
            <button class="prop-input" id="btn-close-curve" style="cursor:pointer; background:var(--accent-color); color:#fff; text-align:center; font-weight:600;" title="Z">
              ⟳ Z
            </button>
          ` : `
            <div style="font-size:11px; color:var(--text-muted); text-align:center; padding: 3px 0; display:flex; align-items:center; justify-content:center; gap:6px;">${ToolIcons.check} (${I18nService.t('common.closed')})</div>
          `}
          ${isMulti ? `
          <button class="prop-input" id="btn-join-nodes" style="cursor:${isParametric ? 'not-allowed' : 'pointer'}; background:var(--bg-active); text-align:center; font-weight:600; color:var(--text-primary); display:inline-flex; align-items:center; justify-content:center; gap:6px; ${isParametric ? 'opacity: 0.35; filter: grayscale(1); pointer-events: none;' : ''}" ${isParametric ? 'disabled' : ''} title="${I18nService.t('inspector.joinNodes')} (Ctrl+J)">
            ${ToolIcons.joinNodes} ${I18nService.t('inspector.joinNodes')} (Ctrl+J)
          </button>
          ` : `
          <button class="prop-input" id="btn-split-node" style="cursor:${isParametric ? 'not-allowed' : 'pointer'}; background:var(--bg-active); text-align:center; ${isParametric ? 'opacity: 0.35; filter: grayscale(1); pointer-events: none;' : ''}" ${isParametric ? 'disabled' : ''} title="${I18nService.t('inspector.splitNode')}">
            ${ToolIcons.splitNode} ${I18nService.t('inspector.splitNode')}
          </button>
          `}
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-title">${I18nService.t('inspector.segmentConversion')}</div>
        <div class="prop-row" style="display:flex; gap:6px;">
          <button class="prop-input" id="btn-segment-to-line" style="cursor:pointer; background:var(--bg-active); text-align:center; flex:1;" title="${I18nService.t('inspector.toLine')} (L)">
            ${I18nService.t('inspector.toLine')}
          </button>
          <button class="prop-input" id="btn-segment-to-curve" style="cursor:${isParametric ? 'not-allowed' : 'pointer'}; background:var(--bg-active); text-align:center; flex:1; ${isParametric ? 'opacity: 0.35; filter: grayscale(1); pointer-events: none;' : ''}" ${isParametric ? 'disabled' : ''} title="${I18nService.t('inspector.toCurve')} (C)">
            ${I18nService.t('inspector.toCurve')}
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Binds mouse interaction events for node operations.
   * Uses mousedown + preventDefault + stopPropagation to preserve canvas focus.
   */
  public static bindEvents(
    container: HTMLElement,
    callbacks: PropertyPanelCallbacks,
    el?: VectorElement
  ): void {
    bindInspectorMouseDown(container, 'btn-convert-to-curves-node', () => {
      if (callbacks.onConvertToCurves && el) {
        callbacks.onConvertToCurves(el);
      }
    });
    bindInspectorMouseDown(container, 'btn-node-sharp', () => callbacks.onNodeTypeChange('sharp'));
    bindInspectorMouseDown(container, 'btn-node-asym', () => callbacks.onNodeTypeChange('asymmetric'));
    bindInspectorMouseDown(container, 'btn-node-smooth', () => callbacks.onNodeTypeChange('smooth'));
    bindInspectorMouseDown(container, 'btn-node-sym', () => callbacks.onNodeTypeChange('symmetric'));
    bindInspectorMouseDown(container, 'btn-close-curve', () => {
      if (callbacks.onClosePath) callbacks.onClosePath();
    });
    bindInspectorMouseDown(container, 'btn-split-node', () => callbacks.onSplitNode());
    bindInspectorMouseDown(container, 'btn-join-nodes', () => {
      if (callbacks.onJoinNodes) callbacks.onJoinNodes();
    });
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
