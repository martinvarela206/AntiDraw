import { ToolIcons } from '../icons/ToolIcons.js';
import { CanvasManager } from '../engine/CanvasManager.js';
import { I18nService } from '../i18n/I18nService.js';

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
  onToggleLockGuides?: () => void;
  onToggleSnap: (type: 'pixel' | 'grid' | 'guide' | 'vertex' | 'nodes' | 'edges' | 'viewbox' | 'angular') => void;
  onExportSvg?: () => void;
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

    I18nService.onLanguageChange(() => {
      this.update();
    });
  }

  public update(): void {
    this.render();
  }

  private render(): void {
    const t = (k: string) => I18nService.t(k);

    this.container.innerHTML = `
      <!-- History (Undo / Redo) -->
      <div class="top-bar-group">
        <button class="btn-icon" id="btn-undo" title="${t('topbar.undo')}">${ToolIcons.undo}</button>
        <button class="btn-icon" id="btn-redo" title="${t('topbar.redo')}">${ToolIcons.redo}</button>
      </div>

      <div class="top-bar-divider"></div>

      <!-- Alignments -->
      <div class="top-bar-group">
        <button class="btn-icon" id="btn-align-left" title="${t('topbar.alignLeft')}">${ToolIcons.alignLeft}</button>
        <button class="btn-icon" id="btn-align-center" title="${t('topbar.alignCenter')}">${ToolIcons.alignCenter}</button>
        <button class="btn-icon" id="btn-align-right" title="${t('topbar.alignRight')}">${ToolIcons.alignRight}</button>
        <button class="btn-icon" id="btn-align-top" title="${t('topbar.alignTop')}">${ToolIcons.alignTop}</button>
        <button class="btn-icon" id="btn-align-middle" title="${t('topbar.alignMiddle')}">${ToolIcons.alignMiddle}</button>
        <button class="btn-icon" id="btn-align-bottom" title="${t('topbar.alignBottom')}">${ToolIcons.alignBottom}</button>
      </div>

      <!-- Flip / Mirror -->
      <div class="top-bar-group">
        <button class="btn-icon" id="btn-flip-h" title="${t('topbar.flipHorizontal')}">${ToolIcons.flipHorizontal}</button>
        <button class="btn-icon" id="btn-flip-v" title="${t('topbar.flipVertical')}">${ToolIcons.flipVertical}</button>
      </div>

      <!-- Z-Ordering -->
      <div class="top-bar-group">
        <button class="btn-icon" id="btn-z-front" title="${t('topbar.bringFront')}">${ToolIcons.bringFront}</button>
        <button class="btn-icon" id="btn-z-forward" title="${t('topbar.bringForward')}">${ToolIcons.bringForward}</button>
        <button class="btn-icon" id="btn-z-backward" title="${t('topbar.sendBackward')}">${ToolIcons.sendBackward}</button>
        <button class="btn-icon" id="btn-z-back" title="${t('topbar.sendBack')}">${ToolIcons.sendBack}</button>
      </div>

      <div class="top-bar-divider"></div>

      <!-- Vector Explorer / Scene Tree -->
      <div class="top-bar-group">
        <button class="btn-icon ${this.canvasMgr.showVectorExplorer ? 'active' : ''}" id="btn-toggle-explorer" title="${t('topbar.toggleLayers')}">${ToolIcons.layers}</button>
      </div>

      <div class="top-bar-divider"></div>

      <!-- Display & Visibility (Rulers, Grids, Guides) -->
      <div class="top-bar-group">
        <button class="btn-icon ${this.canvasMgr.showRulers ? 'active' : ''}" id="btn-toggle-rulers" title="${t('topbar.toggleRulers')}">${ToolIcons.rulersVisibility}</button>
        <button class="btn-icon ${this.canvasMgr.showGrid ? 'active' : ''}" id="btn-toggle-grid" title="${t('topbar.toggleGrid')}">${ToolIcons.gridVisibility}</button>
        <button class="btn-icon ${this.canvasMgr.showGuides ? 'active' : ''}" id="btn-toggle-guides" title="${t('topbar.toggleGuides')}">${ToolIcons.guidesVisibility}</button>
        <button class="btn-icon ${this.canvasMgr.lockGuides ? 'active' : ''}" id="btn-lock-guides" title="${this.canvasMgr.lockGuides ? t('topbar.unlockGuides') : t('topbar.lockGuides')}">${this.canvasMgr.lockGuides ? ToolIcons.lock : ToolIcons.unlock}</button>
      </div>

      <div class="top-bar-divider"></div>

      <!-- Snapping Targets -->
      <div class="top-bar-group">
        <button class="btn-icon ${this.canvasMgr.snapToPixelGrid ? 'active' : ''}" id="btn-snap-pixel-grid" title="${t('topbar.snapPixel')}">${ToolIcons.snapPixel}</button>
        <button class="btn-icon ${this.canvasMgr.snapToGrid ? 'active' : ''}" id="btn-snap-grid" title="${t('topbar.snapGrid')}">${ToolIcons.snapGrid}</button>
        <button class="btn-icon ${this.canvasMgr.snapToGuides ? 'active' : ''}" id="btn-snap-guide" title="${t('topbar.snapGuide')}">${ToolIcons.snapGuide}</button>
        <button class="btn-icon ${this.canvasMgr.snapToViewBox ? 'active' : ''}" id="btn-snap-view-box" title="${t('topbar.snapViewBox')}">${ToolIcons.snapViewBox}</button>
        <button class="btn-icon ${this.canvasMgr.snapToNodes ? 'active' : ''}" id="btn-snap-nodes" title="${t('topbar.snapNode')}">${ToolIcons.snapVertex}</button>
        <button class="btn-icon ${this.canvasMgr.snapToEdges ? 'active' : ''}" id="btn-snap-edges" title="${t('topbar.snapEdge')}">${ToolIcons.snapEdge}</button>
        <button class="btn-icon ${this.canvasMgr.snapAngular ? 'active' : ''}" id="btn-snap-angular" title="${t('topbar.snapAngular')}">${ToolIcons.snapAngular}</button>
      </div>

      <div class="top-bar-divider"></div>

      <!-- Export SVG Action -->
      <div class="top-bar-group">
        <button class="btn-icon" id="btn-export-svg" title="${t('topbar.exportSvg')}">${ToolIcons.export}</button>
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
    this.bindClick('btn-lock-guides', () => this.callbacks.onToggleLockGuides?.());
    this.bindClick('btn-snap-pixel-grid', () => this.callbacks.onToggleSnap('pixel'));
    this.bindClick('btn-snap-grid', () => this.callbacks.onToggleSnap('grid'));
    this.bindClick('btn-snap-guide', () => this.callbacks.onToggleSnap('guide'));
    this.bindClick('btn-snap-view-box', () => this.callbacks.onToggleSnap('viewbox'));
    this.bindClick('btn-snap-nodes', () => this.callbacks.onToggleSnap('nodes'));
    this.bindClick('btn-snap-edges', () => this.callbacks.onToggleSnap('edges'));
    this.bindClick('btn-snap-angular', () => this.callbacks.onToggleSnap('angular'));
    this.bindClick('btn-export-svg', () => this.callbacks.onExportSvg?.());
  }

  private bindClick(id: string, fn: () => void): void {
    const el = this.container.querySelector(`#${id}`);
    if (el) el.addEventListener('click', fn);
  }
}
