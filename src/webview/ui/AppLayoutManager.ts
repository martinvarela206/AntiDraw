import { CanvasManager } from '../engine/CanvasManager.js';
import { VectorModel } from '../engine/VectorModel.js';
import { SelectionTool } from '../engine/SelectionTool.js';
import { GridCanvasRenderer } from './GridCanvasRenderer.js';
import { Toolbar, ToolType } from './Toolbar.js';
import { TopBar, TopBarCallbacks } from './TopBar.js';
import { RulerView, RulerViewCallbacks } from './RulerView.js';
import { PropertyPanel, PropertyPanelCallbacks } from './PropertyPanel.js';
import { VectorExplorerPanel, VectorExplorerCallbacks } from './VectorExplorerPanel.js';
import { DropPosition } from '../engine/layout/LayerReorderService.js';
import { ToolIcons } from '../icons/ToolIcons.js';
import { I18nService } from '../i18n/I18nService.js';

export interface AppLayoutConfig {
  canvasMgr: CanvasManager;
  model: VectorModel;
  selectionTool: SelectionTool;
  onToolChange: (tool: ToolType) => void;
  onToolDoubleClick?: (tool: ToolType) => void;
  topBarCallbacks: TopBarCallbacks;
  rulerCallbacks: RulerViewCallbacks;
  propertyPanelCallbacks: PropertyPanelCallbacks;
  onScroll: () => void;
  onExplorerSelectElement?: (id: string, multiSelect?: boolean) => void;
  onExplorerToggleVisibility?: (id: string) => void;
  onExplorerToggleLock?: (id: string) => void;
  onExplorerReorder?: (sourceId: string, targetId: string, position: DropPosition) => void;
  onExplorerRecenter?: () => void;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated DOM Layout & UI Orchestrator (AppLayoutManager)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Separates DOM structure injection, SVG canvas/overlay instantiation, and UI component
 *    construction (Toolbar, TopBar, RulerView, PropertyPanel) from the application event loop.
 *
 * 2. Guaranteed Coordinate Alignment:
 *    Programmatically builds and appends `svg-canvas`, `grid-svg`, and `overlay-svg` into
 *    `canvas-wrapper` within the same coordinate origin to ensure pixel-perfect parity across
 *    native browser transforms, CSS styling, and pointer events.
 *
 * 3. High-Performance Viewport-Bounded Canvas:
 *    Isolates the dynamic HTML5 2D canvas (`grid-canvas`) inside `canvas-scroll-area` to
 *    achieve hardware-accelerated grid rendering without DOM reflows during zoom and pan operations.
 */
export class AppLayoutManager {
  public canvasContainer!: HTMLElement;
  public canvasScrollArea!: HTMLElement;
  public canvasWrapper!: HTMLElement;
  public svgCanvas!: SVGSVGElement;
  public gridSvg!: SVGSVGElement;
  public overlaySvg!: SVGSVGElement;
  public gridCanvas!: HTMLCanvasElement;
  public gridCanvasRenderer!: GridCanvasRenderer;

  public toolbar!: Toolbar;
  public topBar!: TopBar;
  public rulerView!: RulerView;
  public propertyPanel!: PropertyPanel;
  public vectorExplorerPanel!: VectorExplorerPanel;

  constructor(private config: AppLayoutConfig) {
    this.buildLayout();
  }

  private buildLayout(): void {
    const appEl = document.getElementById('app')!;
    // CSS grid structure inside #app
    appEl.innerHTML = `
      <div class="top-bar" id="top-bar"></div>
      <div class="left-toolbar" id="left-toolbar"></div>
      <div class="vector-explorer-panel hidden" id="vector-explorer-panel" style="display:none;"></div>
      <div class="canvas-container" id="canvas-container">
        <div class="ruler-corner" id="ruler-corner" title="${I18nService.t('statusbar.rulerCornerTooltip')}">
          ${ToolIcons.rulerCorner}
        </div>
        <div class="ruler-top-container" id="ruler-top-container">
          <canvas class="ruler-canvas" id="ruler-top-canvas"></canvas>
        </div>
        <div class="ruler-left-container" id="ruler-left-container">
          <canvas class="ruler-canvas" id="ruler-left-canvas"></canvas>
        </div>
        <div class="canvas-scroll-area" id="canvas-scroll-area">
          <div class="canvas-wrapper" id="canvas-wrapper">
            <canvas id="canvas-hit" style="position:absolute;top:0;left:0;display:none;"></canvas>
          </div>
        </div>
      </div>
      <div class="right-panel" id="right-panel"></div>
      <div class="status-bar">
        <div class="status-left">
          <span id="status-tool">Tool: Select</span>
          <span id="status-coords">X: 0, Y: 0</span>
        </div>
        <div class="status-right">
          <button class="status-btn" id="btn-canvas-props" title="${I18nService.t('statusbar.canvasPropsTooltip')}">${ToolIcons.canvasTool} <span id="status-canvas-text">${I18nService.t('toolbar.canvas')}</span></button>
          <div class="status-grid-align-group" style="display:inline-flex; gap:2px;">
            <button class="status-btn" id="status-grid-align-origin" title="${I18nService.t('statusbar.gridAlignOriginTooltip')}">${I18nService.t('statusbar.gridAlignOrigin')}</button>
            <button class="status-btn" id="status-grid-align-center" title="${I18nService.t('statusbar.gridAlignCenterTooltip')}">${I18nService.t('statusbar.gridAlignCenter')}</button>
          </div>
          <button class="status-btn" id="btn-recenter-viewbox" title="${I18nService.t('statusbar.recenterViewBox')}">${ToolIcons.target} <span id="status-recenter-text">${I18nService.t('statusbar.recenterViewBox')}</span></button>
          <span id="status-info">${I18nService.t('common.ready')}</span>
          <button class="status-zoom-btn" id="status-zoom" title="${I18nService.t('statusbar.zoomResetTooltip')}">100%</button>
          <button class="status-btn" id="btn-lang-toggle" title="${I18nService.t('statusbar.languageToggleTooltip')}" style="font-weight:700; padding:2px 8px; letter-spacing:0.5px; min-width:32px; text-align:center;">${I18nService.getLanguage().toUpperCase()}</button>
        </div>
      </div>
    `;

    this.canvasContainer = document.getElementById('canvas-container')!;
    this.canvasScrollArea = document.getElementById('canvas-scroll-area')!;
    this.canvasWrapper = document.getElementById('canvas-wrapper')!;

    // Create svg-canvas, grid-svg, and overlay-svg in JS and append to wrapper for guaranteed same-origin alignment
    const svgNS = 'http://www.w3.org/2000/svg';
    const svgEl = document.createElementNS(svgNS, 'svg') as SVGSVGElement;
    svgEl.id = 'svg-canvas';
    svgEl.style.cssText = 'position:absolute;top:0;left:0;display:block;overflow:visible;';
    this.canvasWrapper.appendChild(svgEl);
    this.svgCanvas = svgEl;

    const gridSvgEl = document.createElementNS(svgNS, 'svg') as SVGSVGElement;
    gridSvgEl.id = 'grid-svg';
    gridSvgEl.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;overflow:visible;display:none;';
    this.canvasWrapper.appendChild(gridSvgEl);
    this.gridSvg = gridSvgEl;

    const overlaySvgEl = document.createElementNS(svgNS, 'svg') as SVGSVGElement;
    overlaySvgEl.id = 'overlay-svg';
    overlaySvgEl.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;overflow:visible;will-change:transform;';
    this.canvasWrapper.appendChild(overlaySvgEl);
    this.overlaySvg = overlaySvgEl;

    // Viewport-bounded Grid Canvas: sized strictly to canvasScrollArea viewport to guarantee 60+ FPS zoom and 1px stroke invariance
    const gridCanvasEl = document.createElement('canvas');
    gridCanvasEl.id = 'grid-canvas';
    gridCanvasEl.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;will-change:transform;';
    this.canvasScrollArea.appendChild(gridCanvasEl);
    this.gridCanvas = gridCanvasEl;
    this.gridCanvasRenderer = new GridCanvasRenderer(this.gridCanvas);

    // Initialize Left Toolbar
    this.toolbar = new Toolbar(
      document.getElementById('left-toolbar')!,
      (tool) => this.config.onToolChange(tool),
      (tool) => this.config.onToolDoubleClick?.(tool)
    );

    // Initialize Top Bar
    this.topBar = new TopBar(
      document.getElementById('top-bar')!,
      this.config.canvasMgr,
      this.config.topBarCallbacks
    );

    // Initialize Rulers
    this.rulerView = new RulerView(
      this.canvasContainer,
      this.config.canvasMgr,
      this.config.model,
      this.config.rulerCallbacks
    );

    // Sync rulers with scroll area
    this.canvasScrollArea.addEventListener('scroll', () => {
      this.config.onScroll();
    });

    // Initialize Right Property Panel
    this.propertyPanel = new PropertyPanel(
      document.getElementById('right-panel')!,
      this.config.model,
      this.config.selectionTool,
      this.config.propertyPanelCallbacks
    );

    // Initialize Vector Explorer / Scene Tree
    this.vectorExplorerPanel = new VectorExplorerPanel(
      document.getElementById('vector-explorer-panel')!,
      this.config.model,
      this.config.canvasMgr,
      this.config.selectionTool,
      {
        onSelectElement: (id, multi) => {
          if (this.config.onExplorerSelectElement) {
            this.config.onExplorerSelectElement(id, multi);
          } else {
            if (multi) {
              if (this.config.selectionTool.selectedElementIds.has(id)) {
                this.config.selectionTool.selectedElementIds.delete(id);
              } else {
                this.config.selectionTool.selectedElementIds.add(id);
              }
            } else {
              this.config.selectionTool.selectedElementIds.clear();
              this.config.selectionTool.selectedElementIds.add(id);
            }
            this.vectorExplorerPanel.update();
          }
        },
        onToggleVisibility: (id) => {
          if (this.config.onExplorerToggleVisibility) {
            this.config.onExplorerToggleVisibility(id);
          } else {
            const el = this.config.model.getElementById(id);
            if (el) {
              el.attributes.display = el.attributes.display === 'none' ? 'inline' : 'none';
              this.vectorExplorerPanel.update();
            }
          }
        },
        onToggleLock: (id) => {
          if (this.config.onExplorerToggleLock) {
            this.config.onExplorerToggleLock(id);
          } else {
            const el = this.config.model.getElementById(id);
            if (el) {
              const locked = el.attributes['data-locked'] === 'true';
              el.attributes['data-locked'] = locked ? 'false' : 'true';
              this.vectorExplorerPanel.update();
            }
          }
        },
        onReorderElement: (sourceId, targetId, pos) => {
          this.config.onExplorerReorder?.(sourceId, targetId, pos);
        },
        onSelectGuide: (guide) => {
          this.config.canvasMgr.selectedGuideId = guide.id;
          this.vectorExplorerPanel.update();
        },
        onToggleGuideVisibility: (guide) => {
          guide.visible = guide.visible === false;
          this.vectorExplorerPanel.update();
        },
        onToggleGridVisibility: (gridId) => {
          const g = this.config.canvasMgr.grids.find((x) => x.id === gridId);
          if (g) {
            g.visible = !g.visible;
            this.vectorExplorerPanel.update();
          }
        },
        onRecenterViewBox: () => {
          this.config.onExplorerRecenter?.();
        },
        onClose: () => {
          this.config.canvasMgr.showVectorExplorer = false;
          this.vectorExplorerPanel.setVisible(false);
          this.topBar.update();
        },
      }
    );

    // Canvas settings trigger in Status Bar
    const btnCanvasProps = document.getElementById('btn-canvas-props');
    if (btnCanvasProps) {
      btnCanvasProps.addEventListener('click', () => {
        this.config.selectionTool.deselectAll();
        this.propertyPanel.resetPanelMode();
        this.toolbar.setTool('select');
      });
    }

    // Language toggle in Status Bar
    const btnLangToggle = document.getElementById('btn-lang-toggle');
    if (btnLangToggle) {
      btnLangToggle.addEventListener('click', () => {
        const nextLang = I18nService.toggleLanguage();
        btnLangToggle.textContent = nextLang.toUpperCase();
      });
    }

    I18nService.onLanguageChange((lang) => {
      if (btnLangToggle) btnLangToggle.textContent = lang.toUpperCase();
      const statusCanvasText = document.getElementById('status-canvas-text');
      if (statusCanvasText) statusCanvasText.textContent = I18nService.t('toolbar.canvas');
      const btnCanvas = document.getElementById('btn-canvas-props');
      if (btnCanvas) btnCanvas.title = I18nService.t('statusbar.canvasPropsTooltip');
      const statusRecenterText = document.getElementById('status-recenter-text');
      if (statusRecenterText) statusRecenterText.textContent = I18nService.t('statusbar.recenterViewBox');
      const btnRecenter = document.getElementById('btn-recenter-viewbox');
      if (btnRecenter) btnRecenter.title = I18nService.t('statusbar.recenterViewBox');
      const btnGridAlignOrigin = document.getElementById('status-grid-align-origin');
      if (btnGridAlignOrigin) {
        btnGridAlignOrigin.textContent = I18nService.t('statusbar.gridAlignOrigin');
        btnGridAlignOrigin.title = I18nService.t('statusbar.gridAlignOriginTooltip');
      }
      const btnGridAlignCenter = document.getElementById('status-grid-align-center');
      if (btnGridAlignCenter) {
        btnGridAlignCenter.textContent = I18nService.t('statusbar.gridAlignCenter');
        btnGridAlignCenter.title = I18nService.t('statusbar.gridAlignCenterTooltip');
      }
      const rulerCorner = document.getElementById('ruler-corner');
      if (rulerCorner) rulerCorner.title = I18nService.t('statusbar.rulerCornerTooltip');
      const statusZoom = document.getElementById('status-zoom');
      if (statusZoom) statusZoom.title = I18nService.t('statusbar.zoomResetTooltip');
      const statusInfo = document.getElementById('status-info');
      if (statusInfo && (statusInfo.innerText === 'Ready' || statusInfo.innerText === 'Listo')) {
        statusInfo.innerText = I18nService.t('common.ready');
      }
      this.propertyPanel.update();
      this.topBar.update();
      this.toolbar.render();
    });
  }
}
