import { VsCodeBridge } from '../bridge/VsCodeBridge.js';
import { VectorModel } from '../engine/VectorModel.js';
import { CanvasManager } from '../engine/CanvasManager.js';
import { SelectionTool } from '../engine/SelectionTool.js';
import { HistoryService } from './HistoryService.js';
import { ViewportController } from '../engine/ViewportController.js';
import { TopBar } from '../ui/TopBar.js';
import { DocumentState, DocumentStateFactory } from '../core/model/DocumentState.js';

export interface HostSyncContext {
  model: VectorModel;
  canvasMgr: CanvasManager;
  selectionTool: SelectionTool;
  historyService: HistoryService;
  getViewportCtrl: () => ViewportController | undefined;
  getCanvasContainer: () => HTMLElement | undefined;
  getTopBar: () => TopBar | undefined;
  applyCanvasSize: () => void;
  render: () => void;
  recenterViewBox: () => void;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Host Sync & Serialization Service (HostSyncService - L3)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Isolates SVG document serialization, sidecar JSON metadata synchronization,
 *    and bidirectional VS Code Host IPC messaging away from `main.ts`.
 *
 * 2. Sidecar Metadata Segregation (FEAT-Sidecar):
 *    Editor persistence (guidelines, custom origins, grid settings, snap states, undo history)
 *    is segregated into a companion JSON file rather than polluting pristine SVG XML.
 *
 * 3. Debounced Telemetry & Sync:
 *    High-frequency viewport mutations (continuous zoom/pan) are debounced cleanly
 *    to prevent overwhelming the extension host process IPC channel.
 */
export class HostSyncService {
  private vscodeBridge: VsCodeBridge = VsCodeBridge.getInstance();
  private metadataSyncTimeout: any = null;
  private hasInitialCentered: boolean = false;
  private savedState: DocumentState | null = null;

  constructor(private ctx: HostSyncContext) {
    this.bindHostEvents();
    this.initStatusGridAlignment();
  }

  public notifyReady(): void {
    this.vscodeBridge.notifyReady();
  }

  public markSaved(): void {
    this.savedState = this.ctx.historyService.createSnapshot();
  }

  public isDirty(): boolean {
    if (!this.savedState) return false;
    const current = this.ctx.historyService.createSnapshot();
    return DocumentStateFactory.isDirty(current, this.savedState);
  }

  public getSavedState(): DocumentState | null {
    return this.savedState;
  }

  public syncToHost(): boolean {
    const svgText = this.ctx.model.toSvgString();
    const success = this.vscodeBridge.updateDocument(svgText);
    if (!success) {
      console.warn('[HostSyncService] Document sync aborted: SVG integrity validation failed.');
      return false;
    }
    this.syncMetadataToHost();
    this.markSaved();
    return true;
  }

  public syncMetadataToHost(): void {
    const elementsMetadata: Record<string, Record<string, string>> = {};
    for (const el of this.ctx.model.elements) {
      const elData: Record<string, string> = {};
      for (const [k, v] of Object.entries(el.attributes)) {
        if (k.startsWith('data-')) {
          elData[k] = v;
        }
      }
      if (Object.keys(elData).length > 0) {
        elementsMetadata[el.id] = elData;
      }
    }

    const viewportCtrl = this.ctx.getViewportCtrl();

    this.vscodeBridge.updateMetadata({
      grids: this.ctx.canvasMgr.grids,
      guides: this.ctx.canvasMgr.guides,
      ruler: this.ctx.canvasMgr.rulerConfig,
      showRulers: this.ctx.canvasMgr.showRulers,
      showGrid: this.ctx.canvasMgr.showGrid,
      showGuides: this.ctx.canvasMgr.showGuides,
      gridSpacing: this.ctx.canvasMgr.gridSpacing,
      gridAlignmentMode: this.ctx.canvasMgr.gridAlignmentMode,
      snapToPixelGrid: this.ctx.canvasMgr.snapToPixelGrid,
      snapToGrid: this.ctx.canvasMgr.snapToGrid,
      snapToGuides: this.ctx.canvasMgr.snapToGuides,
      snapToNodes: this.ctx.canvasMgr.snapToNodes,
      snapToVertices: this.ctx.canvasMgr.snapToNodes,
      snapToEdges: this.ctx.canvasMgr.snapToEdges,
      snapToViewBox: this.ctx.canvasMgr.snapToViewBox,
      snapAngular: this.ctx.canvasMgr.snapAngular,
      shapeConfig: this.ctx.canvasMgr.shapeConfig,
      undoStack: this.ctx.historyService.undoStackSnapshots,
      redoStack: this.ctx.historyService.redoStackSnapshots,
      zoom: this.ctx.canvasMgr.zoom,
      cameraOffset: viewportCtrl ? { x: viewportCtrl.cameraOffset.x, y: viewportCtrl.cameraOffset.y } : undefined,
      isAspectRatioLocked: this.ctx.selectionTool.isAspectRatioLocked,
      scaleStroke: this.ctx.selectionTool.scaleStroke,
      scaleCorners: this.ctx.selectionTool.scaleCorners,
      elementPivots: Object.fromEntries(this.ctx.selectionTool.elementPivots),
      canvas: { currentColor: this.ctx.model.canvas.currentColor },
      swatches: this.ctx.model.swatches,
      elements: elementsMetadata,
    });
  }

  public syncMetadataToHostDebounced(): void {
    if (this.metadataSyncTimeout !== null) {
      clearTimeout(this.metadataSyncTimeout);
    }
    this.metadataSyncTimeout = setTimeout(() => {
      this.syncMetadataToHost();
      this.metadataSyncTimeout = null;
    }, 300);
  }

  public updateStatusGridAlignment(): void {
    const originBtn = document.getElementById('status-grid-align-origin');
    const centerBtn = document.getElementById('status-grid-align-center');
    const mode = this.ctx.canvasMgr.gridAlignmentMode;
    if (originBtn) {
      if (mode === 'origin') {
        originBtn.classList.add('active');
      } else {
        originBtn.classList.remove('active');
      }
    }
    if (centerBtn) {
      if (mode === 'cell-center') {
        centerBtn.classList.add('active');
      } else {
        centerBtn.classList.remove('active');
      }
    }
  }

  private initStatusGridAlignment(): void {
    const originBtn = document.getElementById('status-grid-align-origin');
    const centerBtn = document.getElementById('status-grid-align-center');
    originBtn?.addEventListener('click', () => {
      this.ctx.canvasMgr.gridAlignmentMode = 'origin';
      this.updateStatusGridAlignment();
      this.ctx.render();
      this.syncMetadataToHost();
    });
    centerBtn?.addEventListener('click', () => {
      this.ctx.canvasMgr.gridAlignmentMode = 'cell-center';
      this.updateStatusGridAlignment();
      this.ctx.render();
      this.syncMetadataToHost();
    });
    this.updateStatusGridAlignment();
  }

  private bindHostEvents(): void {
    this.vscodeBridge.onLoadSvg((payload) => {
      if (payload.metadata) {
        this.ctx.canvasMgr.guides = Array.isArray(payload.metadata.guides) ? payload.metadata.guides : [];
        if (payload.metadata.ruler) {
          this.ctx.canvasMgr.rulerConfig = { ...this.ctx.canvasMgr.rulerConfig, ...payload.metadata.ruler };
        }
        if (payload.metadata.showRulers !== undefined) this.ctx.canvasMgr.showRulers = payload.metadata.showRulers;
        if (Array.isArray(payload.metadata.grids)) this.ctx.canvasMgr.grids = payload.metadata.grids;
        if (payload.metadata.showGrid !== undefined) this.ctx.canvasMgr.showGrid = payload.metadata.showGrid;
        if (payload.metadata.showGuides !== undefined) this.ctx.canvasMgr.showGuides = payload.metadata.showGuides;
        if (payload.metadata.gridSpacing !== undefined) this.ctx.canvasMgr.gridSpacing = payload.metadata.gridSpacing;
        if (payload.metadata.gridAlignmentMode !== undefined) {
          this.ctx.canvasMgr.gridAlignmentMode = payload.metadata.gridAlignmentMode;
          this.updateStatusGridAlignment();
        }
        if (payload.metadata.snapToPixelGrid !== undefined) this.ctx.canvasMgr.snapToPixelGrid = payload.metadata.snapToPixelGrid;
        if (payload.metadata.snapToGrid !== undefined) this.ctx.canvasMgr.snapToGrid = payload.metadata.snapToGrid;
        if (payload.metadata.snapToGuides !== undefined) this.ctx.canvasMgr.snapToGuides = payload.metadata.snapToGuides;
        if (payload.metadata.snapToNodes !== undefined) this.ctx.canvasMgr.snapToNodes = payload.metadata.snapToNodes;
        else if (payload.metadata.snapToVertices !== undefined) this.ctx.canvasMgr.snapToNodes = payload.metadata.snapToVertices;
        if (payload.metadata.snapToEdges !== undefined) this.ctx.canvasMgr.snapToEdges = payload.metadata.snapToEdges;
        if (payload.metadata.snapToViewBox !== undefined) this.ctx.canvasMgr.snapToViewBox = payload.metadata.snapToViewBox;
        if (payload.metadata.snapAngular !== undefined) this.ctx.canvasMgr.snapAngular = payload.metadata.snapAngular;
        if (payload.metadata.shapeConfig) {
          this.ctx.canvasMgr.shapeConfig = { ...this.ctx.canvasMgr.shapeConfig, ...payload.metadata.shapeConfig };
        }
        this.ctx.historyService.loadFromMetadata(payload.metadata);
        if (payload.metadata.zoom !== undefined) {
          this.ctx.canvasMgr.zoom = payload.metadata.zoom;
        }
        if (payload.metadata.isAspectRatioLocked !== undefined) {
          this.ctx.selectionTool.isAspectRatioLocked = payload.metadata.isAspectRatioLocked;
        }
        if (payload.metadata.scaleStroke !== undefined) {
          this.ctx.selectionTool.scaleStroke = payload.metadata.scaleStroke;
        }
        if (payload.metadata.scaleCorners !== undefined) {
          this.ctx.selectionTool.scaleCorners = payload.metadata.scaleCorners;
        }
        if (payload.metadata.elementPivots) {
          this.ctx.selectionTool.elementPivots = new Map(Object.entries(payload.metadata.elementPivots));
        }

        const container = this.ctx.getCanvasContainer();
        container?.classList.toggle('no-rulers', !this.ctx.canvasMgr.showRulers);

        const topBar = this.ctx.getTopBar();
        topBar?.update();
      } else {
        this.ctx.canvasMgr.guides = [];
      }

      this.ctx.model.loadSvgString(payload.text, payload.metadata);
      this.ctx.applyCanvasSize();
      this.ctx.render();
      this.markSaved();

      if (!this.hasInitialCentered) {
        this.hasInitialCentered = true;
        setTimeout(() => {
          const viewportCtrl = this.ctx.getViewportCtrl();
          if (payload.metadata?.cameraOffset && viewportCtrl) {
            viewportCtrl.cameraOffset = { ...payload.metadata.cameraOffset };
            viewportCtrl.applyCameraTransform();
            viewportCtrl.syncRulerScroll();
          } else {
            this.ctx.recenterViewBox();
          }
        }, 40);
      }
    });
  }
}
