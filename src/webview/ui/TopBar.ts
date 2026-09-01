import { ToolIcons } from '../icons/ToolIcons.js';
import { CanvasManager } from '../engine/CanvasManager.js';

export interface TopBarCallbacks {
  onAlign: (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  onBoolean?: (op: 'union' | 'subtract' | 'intersect' | 'exclude' | 'combine' | 'fragment') => void;
  onZOrder: (action: 'front' | 'forward' | 'backward' | 'back') => void;
  onToggleGrid: () => void;
  onToggleGuides: () => void;
  onToggleSnap: (type: 'grid' | 'guide' | 'vertex') => void;
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
      <!-- Alignments -->
      <div class="top-bar-group">
        <button class="btn-icon" id="btn-align-left" title="Align Left">${ToolIcons.alignLeft}</button>
        <button class="btn-icon" id="btn-align-center" title="Align Center">${ToolIcons.alignCenter}</button>
        <button class="btn-icon" id="btn-align-right" title="Align Right">${ToolIcons.alignRight}</button>
        <button class="btn-icon" id="btn-align-top" title="Align Top">${ToolIcons.alignTop}</button>
        <button class="btn-icon" id="btn-align-middle" title="Align Middle">${ToolIcons.alignMiddle}</button>
        <button class="btn-icon" id="btn-align-bottom" title="Align Bottom">${ToolIcons.alignBottom}</button>
      </div>

      <!-- Z-Ordering -->
      <div class="top-bar-group">
        <button class="btn-icon" id="btn-z-front" title="Bring to Front">${ToolIcons.bringFront}</button>
        <button class="btn-icon" id="btn-z-forward" title="Bring Forward">${ToolIcons.bringForward}</button>
        <button class="btn-icon" id="btn-z-backward" title="Send Backward">${ToolIcons.sendBackward}</button>
        <button class="btn-icon" id="btn-z-back" title="Send to Back">${ToolIcons.sendBack}</button>
      </div>

      <div class="top-bar-divider"></div>

      <!-- Grid, Guides & Snapping -->
      <div class="top-bar-group">
        <button class="btn-icon ${this.canvasMgr.showGrid ? 'active' : ''}" id="btn-toggle-grid" title="Toggle Grid Overlay">${ToolIcons.grid}</button>
        <button class="btn-icon ${this.canvasMgr.showGuides ? 'active' : ''}" id="btn-toggle-guides" title="Toggle Guide Lines">${ToolIcons.guide}</button>
        <button class="btn-icon ${this.canvasMgr.snapToGrid ? 'active' : ''}" id="btn-snap-grid" title="Snap to Grid (Lines &amp; Intersections)">${ToolIcons.snapGrid}</button>
        <button class="btn-icon ${this.canvasMgr.snapToGuides ? 'active' : ''}" id="btn-snap-guide" title="Snap to Guide Lines &amp; Intersections">${ToolIcons.snapGuide}</button>
        <button class="btn-icon ${this.canvasMgr.snapToVertices ? 'active' : ''}" id="btn-snap-vertex" title="Snap to Vertices">${ToolIcons.snapVertex}</button>
      </div>
    `;

    // Bind event listeners
    this.bindClick('btn-align-left', () => this.callbacks.onAlign('left'));
    this.bindClick('btn-align-center', () => this.callbacks.onAlign('center'));
    this.bindClick('btn-align-right', () => this.callbacks.onAlign('right'));
    this.bindClick('btn-align-top', () => this.callbacks.onAlign('top'));
    this.bindClick('btn-align-middle', () => this.callbacks.onAlign('middle'));
    this.bindClick('btn-align-bottom', () => this.callbacks.onAlign('bottom'));

    this.bindClick('btn-z-front', () => this.callbacks.onZOrder('front'));
    this.bindClick('btn-z-forward', () => this.callbacks.onZOrder('forward'));
    this.bindClick('btn-z-backward', () => this.callbacks.onZOrder('backward'));
    this.bindClick('btn-z-back', () => this.callbacks.onZOrder('back'));

    this.bindClick('btn-toggle-grid', () => this.callbacks.onToggleGrid());
    this.bindClick('btn-toggle-guides', () => this.callbacks.onToggleGuides());
    this.bindClick('btn-snap-grid', () => this.callbacks.onToggleSnap('grid'));
    this.bindClick('btn-snap-guide', () => this.callbacks.onToggleSnap('guide'));
    this.bindClick('btn-snap-vertex', () => this.callbacks.onToggleSnap('vertex'));
  }

  private bindClick(id: string, fn: () => void): void {
    const el = this.container.querySelector(`#${id}`);
    if (el) el.addEventListener('click', fn);
  }
}
