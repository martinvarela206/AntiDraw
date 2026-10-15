import { ToolIcons } from '../icons/ToolIcons.js';
import { CanvasManager } from '../engine/CanvasManager.js';

export interface TopBarCallbacks {
  onUndo?: () => void;
  onRedo?: () => void;
  onAlign: (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  onFlip?: (axis: 'horizontal' | 'vertical') => void;
  onBoolean?: (op: 'union' | 'subtract' | 'intersect' | 'exclude' | 'combine' | 'fragment') => void;
  onZOrder: (action: 'front' | 'forward' | 'backward' | 'back') => void;
  onToggleVectorExplorer?: () => void;
  onToggleRulers?: () => void;
  onToggleGrid: () => void;
  onToggleGuides: () => void;
  onToggleSnap: (type: 'pixel' | 'grid' | 'guide' | 'vertex' | 'nodes' | 'edges' | 'viewbox' | 'angular') => void;
}

export class TopBar {
  private container: HTMLElement;
  private canvasMgr: CanvasManager;
  private callbacks: TopBarCallbacks;

  constructor(container: HTMLElement, canvasMgr: CanvasManager, callbacks: TopBarCallbacks) {
    this.container = container;
    this.canvasMgr = canvasMgr;
    this.callbacks = callbacks;
    this.render();
  }

  public update(): void {
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <!-- History (Undo / Redo) -->
      <div class="top-bar-group">
        <button class="btn-icon" id="btn-undo" title="Undo (Ctrl+Z)">${ToolIcons.undo}</button>
        <button class="btn-icon" id="btn-redo" title="Redo (Ctrl+Y)">${ToolIcons.redo}</button>
      </div>

      <div class="top-bar-divider"></div>

      <!-- Alignments -->
      <div class="top-bar-group">
        <button class="btn-icon" id="btn-align-left" title="Align Left">${ToolIcons.alignLeft}</button>
        <button class="btn-icon" id="btn-align-center" title="Align Center">${ToolIcons.alignCenter}</button>
        <button class="btn-icon" id="btn-align-right" title="Align Right">${ToolIcons.alignRight}</button>
        <button class="btn-icon" id="btn-align-top" title="Align Top">${ToolIcons.alignTop}</button>
        <button class="btn-icon" id="btn-align-middle" title="Align Middle">${ToolIcons.alignMiddle}</button>
        <button class="btn-icon" id="btn-align-bottom" title="Align Bottom">${ToolIcons.alignBottom}</button>
      </div>

      <!-- Flip / Mirror -->
      <div class="top-bar-group">
        <button class="btn-icon" id="btn-flip-h" title="Flip Horizontally (Mirror X)">${ToolIcons.flipHorizontal}</button>
        <button class="btn-icon" id="btn-flip-v" title="Flip Vertically (Mirror Y)">${ToolIcons.flipVertical}</button>
      </div>

      <!-- Z-Ordering -->
      <div class="top-bar-group">
        <button class="btn-icon" id="btn-z-front" title="Bring to Front">${ToolIcons.bringFront}</button>
        <button class="btn-icon" id="btn-z-forward" title="Bring Forward">${ToolIcons.bringForward}</button>
        <button class="btn-icon" id="btn-z-backward" title="Send Backward">${ToolIcons.sendBackward}</button>
        <button class="btn-icon" id="btn-z-back" title="Send to Back">${ToolIcons.sendBack}</button>
      </div>

      <div class="top-bar-divider"></div>

      <!-- Vector Explorer / Scene Tree -->
      <div class="top-bar-group">
        <button class="btn-icon ${this.canvasMgr.showVectorExplorer ? 'active' : ''}" id="btn-toggle-explorer" title="Toggle Vector Explorer (Scene Tree)">${ToolIcons.layers}</button>
      </div>

      <div class="top-bar-divider"></div>

      <!-- Grid, Guides & Snapping -->
      <div class="top-bar-group">
        <button class="btn-icon ${this.canvasMgr.showRulers ? 'active' : ''}" id="btn-toggle-rulers" title="Toggle Rulers">${ToolIcons.rulersVisibility}</button>
        <button class="btn-icon ${this.canvasMgr.showGrid ? 'active' : ''}" id="btn-toggle-grid" title="Toggle Grid Overlay">${ToolIcons.gridVisibility}</button>
        <button class="btn-icon ${this.canvasMgr.showGuides ? 'active' : ''}" id="btn-toggle-guides" title="Toggle Guide Lines">${ToolIcons.guidesVisibility}</button>
        <button class="btn-icon ${this.canvasMgr.snapToPixelGrid ? 'active' : ''}" id="btn-snap-pixel-grid" title="Snap to Pixel Grid (Pixel-Perfect)">${ToolIcons.snapPixel}</button>
        <button class="btn-icon ${this.canvasMgr.snapToGrid ? 'active' : ''}" id="btn-snap-grid" title="Snap to Grid (Lines &amp; Cells)">${ToolIcons.snapGrid}</button>
        <button class="btn-icon ${this.canvasMgr.snapToGuides ? 'active' : ''}" id="btn-snap-guide" title="Snap to Guides (Infinite Guidelines &amp; Intersections)">${ToolIcons.snapGuide}</button>
        <button class="btn-icon ${this.canvasMgr.snapToViewBox ? 'active' : ''}" id="btn-snap-view-box" title="Snap to ViewBox (Canvas Borders, Corners &amp; Center)">${ToolIcons.snapViewBox}</button>
        <button class="btn-icon ${this.canvasMgr.snapToNodes ? 'active' : ''}" id="btn-snap-nodes" title="Snap to Vector Nodes (Structural, Handles &amp; Positional)">${ToolIcons.snapVertex}</button>
        <button class="btn-icon ${this.canvasMgr.snapToEdges ? 'active' : ''}" id="btn-snap-edges" title="Snap to Vector Edges (Contours &amp; Paths)">${ToolIcons.snapEdge}</button>
        <button class="btn-icon ${this.canvasMgr.snapAngular ? 'active' : ''}" id="btn-snap-angular" title="Snap Angular (Multiples of 15°)">${ToolIcons.snapAngular}</button>
      </div>
    `;

    // Bind event listeners
    this.bindClick('btn-undo', () => this.callbacks.onUndo?.());
    this.bindClick('btn-redo', () => this.callbacks.onRedo?.());

    this.bindClick('btn-align-left', () => this.callbacks.onAlign('left'));
    this.bindClick('btn-align-center', () => this.callbacks.onAlign('center'));
    this.bindClick('btn-align-right', () => this.callbacks.onAlign('right'));
    this.bindClick('btn-align-top', () => this.callbacks.onAlign('top'));
    this.bindClick('btn-align-middle', () => this.callbacks.onAlign('middle'));
    this.bindClick('btn-align-bottom', () => this.callbacks.onAlign('bottom'));

    this.bindClick('btn-flip-h', () => this.callbacks.onFlip?.('horizontal'));
    this.bindClick('btn-flip-v', () => this.callbacks.onFlip?.('vertical'));

    this.bindClick('btn-z-front', () => this.callbacks.onZOrder('front'));
    this.bindClick('btn-z-forward', () => this.callbacks.onZOrder('forward'));
    this.bindClick('btn-z-backward', () => this.callbacks.onZOrder('backward'));
    this.bindClick('btn-z-back', () => this.callbacks.onZOrder('back'));

    this.bindClick('btn-toggle-explorer', () => this.callbacks.onToggleVectorExplorer?.());
    this.bindClick('btn-toggle-rulers', () => this.callbacks.onToggleRulers?.());
    this.bindClick('btn-toggle-grid', () => this.callbacks.onToggleGrid());
    this.bindClick('btn-toggle-guides', () => this.callbacks.onToggleGuides());
    this.bindClick('btn-snap-pixel-grid', () => this.callbacks.onToggleSnap('pixel'));
    this.bindClick('btn-snap-grid', () => this.callbacks.onToggleSnap('grid'));
    this.bindClick('btn-snap-guide', () => this.callbacks.onToggleSnap('guide'));
    this.bindClick('btn-snap-view-box', () => this.callbacks.onToggleSnap('viewbox'));
    this.bindClick('btn-snap-nodes', () => this.callbacks.onToggleSnap('nodes'));
    this.bindClick('btn-snap-edges', () => this.callbacks.onToggleSnap('edges'));
    this.bindClick('btn-snap-angular', () => this.callbacks.onToggleSnap('angular'));
  }

  private bindClick(id: string, fn: () => void): void {
    const el = this.container.querySelector(`#${id}`);
    if (el) el.addEventListener('click', fn);
  }
}
