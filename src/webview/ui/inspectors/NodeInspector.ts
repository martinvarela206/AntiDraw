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
 * 1. Vertex Coordinates (Position X, Position Y) - Full numerical precision
 * 2. Bézier Handles (Handle In X/Y, Handle Out X/Y) - Direct numerical curvature control
 * 3. Node Types: sharp, asymmetric, smooth, symmetric
 * 4. Path & Node Actions: Auto-close curve (Z), split node, join coincident nodes (Ctrl+J)
 * 5. State-Aware Segment Conversion: Conditionally displays To Line vs To Curve depending on active curvature
 * 6. 60fps in-place mutation during active node/handle dragging to eliminate DOM teardown/reflow.
 */
export class NodeInspector {
  /**
   * Generates HTML markup for single or multi-selected vertex properties.
   */
  public static renderHtml(
    el: VectorElement,
    v: PathVertex,
    selectedCount: number = 1,
    isParametric: boolean = false,
    segmentState?: 'line' | 'curve' | 'mixed' | 'none'
  ): string {
    const isMulti = selectedCount > 1;
    const isSharp = v.nodeType === 'sharp' || (!v.handleIn && !v.handleOut);
    const isClosed =
      el.isClosed ??
      (!el.tagName ||
        ['rect', 'circle', 'ellipse', 'star', 'polygon'].includes(el.tagName) ||
        (el.attributes.d ? /z/i.test(el.attributes.d) : false));

    let effSegmentState = segmentState;
    if (!effSegmentState || effSegmentState === 'none') {
      const isCurved = !!(v.handleIn || v.handleOut || v.command === 'C');
      effSegmentState = isCurved ? 'curve' : 'line';
    }

    return `
      <div class="panel-section">
        <div class="panel-title">${isMulti ? `${selectedCount} ${I18nService.t('common.nodes')} ${I18nService.t('common.selected')}` : I18nService.t('inspector.vertexCoordinates')}</div>
        ${!isMulti ? `
        <div class="prop-row">
          <span class="prop-label">Position X</span>
          <input type="number" class="prop-input" id="node-pos-x" value="${Math.round(v.x)}" />
          <span class="prop-label" style="width:16px; text-align:right;">Y</span>
          <input type="number" class="prop-input" id="node-pos-y" value="${Math.round(v.y)}" />
        </div>
        ` : `
        <div style="font-size:11px; color:var(--text-muted); line-height:1.5;">
          ${selectedCount} ${I18nService.t('common.nodes')}
        </div>
        `}
      </div>

      ${!isMulti && (v.handleIn || v.handleOut) ? `
      <div class="panel-section">
        <div class="panel-title">${I18nService.t('inspector.bezierHandles')}</div>
        ${v.handleIn ? `
        <div class="prop-row" style="margin-bottom:6px;">
          <span class="prop-label" style="width:64px; font-size:10px;">${I18nService.t('inspector.handleIn')} X</span>
          <input type="number" class="prop-input" id="node-handle-in-x" value="${Math.round(v.handleIn.x)}" />
          <span class="prop-label" style="width:16px; text-align:right;">Y</span>
          <input type="number" class="prop-input" id="node-handle-in-y" value="${Math.round(v.handleIn.y)}" />
        </div>
        ` : ''}
        ${v.handleOut ? `
        <div class="prop-row">
          <span class="prop-label" style="width:64px; font-size:10px;">${I18nService.t('inspector.handleOut')} X</span>
          <input type="number" class="prop-input" id="node-handle-out-x" value="${Math.round(v.handleOut.x)}" />
          <span class="prop-label" style="width:16px; text-align:right;">Y</span>
          <input type="number" class="prop-input" id="node-handle-out-y" value="${Math.round(v.handleOut.y)}" />
        </div>
        ` : ''}
      </div>
      ` : ''}

      <div class="panel-section">
        <div class="panel-title">${I18nService.t('inspector.nodeType')} ${isMulti ? `(${I18nService.t('inspector.batch')})` : ''}</div>
        ${isParametric ? `
        <div style="margin-bottom: 8px; padding: 6px 8px; background: rgba(59, 130, 246, 0.08); border: 1px dashed rgba(59, 130, 246, 0.3); border-radius: 4px;">
          <button class="tool-btn" id="btn-convert-to-curves-node" style="cursor:pointer; background:var(--accent-color, #3b82f6); color:#fff; border:none; border-radius:4px; padding:5px 8px; font-weight:600; font-size:11px; display:flex; align-items:center; justify-content:center; gap:6px; width:100%;" title="${I18nService.t('inspector.convertToCurves')}">
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
            <button class="tool-btn" id="btn-close-curve" title="${I18nService.t('inspector.closeCurve')}">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M 13 8 A 5 5 0 1 1 8 3 L 10 3" />
                <polyline points="8 1 10 3 8 5" />
              </svg>
              <span>${I18nService.t('inspector.closeCurve')}</span>
            </button>
          ` : ''}
          ${isMulti ? `
          <button class="tool-btn" id="btn-join-nodes" ${isParametric ? 'disabled' : ''} title="${I18nService.t('inspector.joinNodes')} (Ctrl+J)">
            ${ToolIcons.joinNodes}
            <span>${I18nService.t('inspector.joinNodes')} (Ctrl+J)</span>
          </button>
          ` : `
          <button class="tool-btn" id="btn-split-node" ${isParametric ? 'disabled' : ''} title="${I18nService.t('inspector.splitNode')}">
            ${ToolIcons.splitNode}
            <span>${I18nService.t('inspector.splitNode')}</span>
          </button>
          `}
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">${I18nService.t('inspector.segmentConversion')}</div>
        <div class="prop-row">
          ${effSegmentState === 'mixed' ? `
          <button class="tool-btn" id="btn-segment-mixed" disabled title="${I18nService.t('inspector.mixedSegments')}">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <path d="M 2 13 C 5 13 5 8 8 8 L 14 3" />
              <circle cx="2" cy="13" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="14" cy="3" r="1.5" fill="currentColor" stroke="none" />
            </svg>
            <span>${I18nService.t('inspector.mixedSegments')}</span>
          </button>
          ` : effSegmentState === 'curve' ? `
          <button class="tool-btn" id="btn-segment-to-line" title="${I18nService.t('inspector.toLine')} (L)">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <line x1="2" y1="14" x2="14" y2="2" />
              <circle cx="2" cy="14" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="14" cy="2" r="1.5" fill="currentColor" stroke="none" />
            </svg>
            <span>${I18nService.t('inspector.toLine')}</span>
          </button>
          ` : `
          <button class="tool-btn" id="btn-segment-to-curve" ${isParametric ? 'disabled' : ''} title="${I18nService.t('inspector.toCurve')} (C)">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <path d="M 2 13 C 6 13 6 3 14 3" />
              <circle cx="2" cy="13" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="14" cy="3" r="1.5" fill="currentColor" stroke="none" />
            </svg>
            <span>${I18nService.t('inspector.toCurve')}</span>
          </button>
          `}
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
    el?: VectorElement,
    v?: PathVertex
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

    const bindNumChange = (id: string, onChange: (val: number) => void) => {
      const input = container.querySelector<HTMLInputElement>(`#${id}`);
      if (input) {
        input.addEventListener('change', () => {
          const val = parseFloat(input.value);
          if (!isNaN(val)) onChange(val);
        });
      }
    };

    if (v) {
      bindNumChange('node-pos-x', (val) => {
        if (callbacks.onUpdateNodePosition) {
          callbacks.onUpdateNodePosition(v.id, { x: val, y: v.y });
        }
      });
      bindNumChange('node-pos-y', (val) => {
        if (callbacks.onUpdateNodePosition) {
          callbacks.onUpdateNodePosition(v.id, { x: v.x, y: val });
        }
      });
      bindNumChange('node-handle-in-x', (val) => {
        if (callbacks.onUpdateNodeHandle && v.handleIn) {
          callbacks.onUpdateNodeHandle(v.id, 'handleIn', { x: val, y: v.handleIn.y });
        }
      });
      bindNumChange('node-handle-in-y', (val) => {
        if (callbacks.onUpdateNodeHandle && v.handleIn) {
          callbacks.onUpdateNodeHandle(v.id, 'handleIn', { x: v.handleIn.x, y: val });
        }
      });
      bindNumChange('node-handle-out-x', (val) => {
        if (callbacks.onUpdateNodeHandle && v.handleOut) {
          callbacks.onUpdateNodeHandle(v.id, 'handleOut', { x: val, y: v.handleOut.y });
        }
      });
      bindNumChange('node-handle-out-y', (val) => {
        if (callbacks.onUpdateNodeHandle && v.handleOut) {
          callbacks.onUpdateNodeHandle(v.id, 'handleOut', { x: v.handleOut.x, y: val });
        }
      });
    }
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
    if (xInput && document.activeElement !== xInput) xInput.value = Math.round(v.x).toString();
    if (yInput && document.activeElement !== yInput) yInput.value = Math.round(v.y).toString();

    const inX = container.querySelector<HTMLInputElement>('#node-handle-in-x');
    const inY = container.querySelector<HTMLInputElement>('#node-handle-in-y');
    if (inX && v.handleIn && document.activeElement !== inX) inX.value = Math.round(v.handleIn.x).toString();
    if (inY && v.handleIn && document.activeElement !== inY) inY.value = Math.round(v.handleIn.y).toString();

    const outX = container.querySelector<HTMLInputElement>('#node-handle-out-x');
    const outY = container.querySelector<HTMLInputElement>('#node-handle-out-y');
    if (outX && v.handleOut && document.activeElement !== outX) outX.value = Math.round(v.handleOut.x).toString();
    if (outY && v.handleOut && document.activeElement !== outY) outY.value = Math.round(v.handleOut.y).toString();

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
