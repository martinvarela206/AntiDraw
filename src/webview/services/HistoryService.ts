import { VectorModel, VectorElement, Point } from '../engine/VectorModel.js';
import { SelectionTool } from '../engine/SelectionTool.js';
import { CanvasManager, GuideLine } from '../engine/CanvasManager.js';

export interface HistorySnapshot {
  elements: VectorElement[];
  guides?: GuideLine[];
  elementPivots?: [string, Point][];
  customPivot?: Point | null;
}

export interface HistoryServiceContext {
  model: VectorModel;
  selectionTool: SelectionTool;
  canvasMgr: CanvasManager;
  onResetPropertyPanel: () => void;
  render: () => void;
  syncToHost: () => void;
  syncMetadataToHost?: () => void;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Vector History Service (HistoryService)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Decouples undo/redo stack persistence, transaction snapshotting, depth limiting,
 *    and state restoration from the visual and event-dispatching layers of AntiDrawApp.
 *
 * 2. Unified Canvas & Metadata Deep Snapshotting (ITEM-05):
 *    In addition to VectorElement[], history snapshots encapsulate companion canvas state:
 *    - `guides`: Metric guidelines, orientations, angles, and custom guideline pivots.
 *    - `customPivot` & `elementPivots`: Arbitrary rotation centers and solidary object anchors.
 *    Restoring snapshots synchronizes both the active DOM representation and host companion metadata (.json).
 *
 * 3. Backward Compatible Parser:
 *    Handles legacy array-only snapshot strings seamlessly while transparently persisting the unified
 *    multi-subsystem state container.
 *
 * 4. Bounded Memory Consumption:
 *    Maintains a FIFO sliding window (`maxHistory = 20`) to eliminate unbounded memory growth
 *    during intensive vector workflows while supporting metadata serialization across sessions.
 */
export class HistoryService {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private readonly maxHistory: number = 20;

  constructor(private ctx: HistoryServiceContext) {}

  public get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public get undoStackSnapshots(): string[] {
    return this.undoStack;
  }

  public get redoStackSnapshots(): string[] {
    return this.redoStack;
  }

  private createSnapshot(): HistorySnapshot {
    return {
      elements: JSON.parse(JSON.stringify(this.ctx.model.elements)),
      guides: JSON.parse(JSON.stringify(this.ctx.canvasMgr.guides)),
      elementPivots: Array.from(this.ctx.selectionTool.elementPivots.entries()),
      customPivot: this.ctx.selectionTool.customPivot ? { ...this.ctx.selectionTool.customPivot } : null,
    };
  }

  public pushUndo(): void {
    const snapshot = this.createSnapshot();
    this.undoStack.push(JSON.stringify(snapshot));
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  public undo(): boolean {
    if (this.undoStack.length === 0) return false;
    const currentSnapshot = this.createSnapshot();
    this.redoStack.push(JSON.stringify(currentSnapshot));
    const prevStateStr = this.undoStack.pop()!;
    this.applySnapshot(prevStateStr);
    return true;
  }

  public redo(): boolean {
    if (this.redoStack.length === 0) return false;
    const currentSnapshot = this.createSnapshot();
    this.undoStack.push(JSON.stringify(currentSnapshot));
    const nextStateStr = this.redoStack.pop()!;
    this.applySnapshot(nextStateStr);
    return true;
  }

  private applySnapshot(stateStr: string): void {
    const parsed = JSON.parse(stateStr);
    if (Array.isArray(parsed)) {
      this.ctx.model.elements = parsed;
    } else {
      this.ctx.model.elements = parsed.elements || [];
      if (parsed.guides) {
        this.ctx.canvasMgr.guides = parsed.guides;
      }
      if (parsed.elementPivots) {
        this.ctx.selectionTool.elementPivots = new Map(parsed.elementPivots);
      }
      if (parsed.customPivot !== undefined) {
        this.ctx.selectionTool.customPivot = parsed.customPivot;
      }
    }
    this.ctx.selectionTool.deselectAll();
    this.ctx.canvasMgr.selectedGuideId = null;
    this.ctx.canvasMgr.activeGuideTransformId = null;
    this.ctx.onResetPropertyPanel();
    this.ctx.render();
    this.ctx.syncToHost();
    this.ctx.syncMetadataToHost?.();
  }

  public loadFromMetadata(metadata: { undoStack?: unknown; redoStack?: unknown }): void {
    if (Array.isArray(metadata.undoStack)) {
      this.undoStack = (metadata.undoStack as string[]).slice(-this.maxHistory);
    }
    if (Array.isArray(metadata.redoStack)) {
      this.redoStack = (metadata.redoStack as string[]).slice(-this.maxHistory);
    }
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
