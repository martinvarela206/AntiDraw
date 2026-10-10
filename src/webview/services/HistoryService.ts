import { VectorModel, Point } from '../engine/VectorModel.js';
import { SelectionTool } from '../engine/SelectionTool.js';
import { CanvasManager } from '../engine/CanvasManager.js';
import { DocumentState, DocumentStateFactory } from '../core/model/DocumentState.js';

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
 * ARCHITECTURAL RATIONALE: Dedicated Vector History Service (HistoryService - L3)
 *
 * 1. O(1) In-Memory Structural Sharing (VectorCraft Parity):
 *    Stack entries store immutable `DocumentState` references rather than repeatedly executing
 *    heavy `JSON.stringify()` / `JSON.parse()` cycles on every user interaction.
 *
 * 2. Unified Canvas & Metadata Snapshotting:
 *    In addition to VectorElement[], snapshots capture companion canvas state:
 *    - `guides`: Metric guidelines, orientations, angles, and guideline pivots.
 *    - `customPivot` & `elementPivots`: Object transformation anchors.
 *
 * 3. Monotonic Revisions:
 *    Each snapshot advances state revision for instant O(1) dirty checking and host sync.
 *
 * 4. Bounded Memory Window:
 *    Maintains a FIFO sliding window (`maxHistory = 30`) with low memory footprint thanks to
 *    reference sharing across unmodified elements.
 */
export class HistoryService {
  private undoStack: DocumentState[] = [];
  private redoStack: DocumentState[] = [];
  private readonly maxHistory: number = 30;
  private currentRevision: number = 1;

  constructor(private ctx: HistoryServiceContext) {}

  public get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public get undoStackSnapshots(): string[] {
    return this.undoStack.map((s) =>
      JSON.stringify({
        elements: s.elements,
        guides: s.guides,
        elementPivots: Array.from(s.elementPivots.entries()),
        customPivot: s.customPivot,
      })
    );
  }

  public get redoStackSnapshots(): string[] {
    return this.redoStack.map((s) =>
      JSON.stringify({
        elements: s.elements,
        guides: s.guides,
        elementPivots: Array.from(s.elementPivots.entries()),
        customPivot: s.customPivot,
      })
    );
  }

  public createSnapshot(): DocumentState {
    return DocumentStateFactory.create({
      revision: this.currentRevision++,
      canvas: this.ctx.model.canvas,
      elements: this.ctx.model.elements,
      guides: this.ctx.canvasMgr.guides,
      elementPivots: this.ctx.selectionTool.elementPivots,
      customPivot: this.ctx.selectionTool.customPivot,
      selection: this.ctx.selectionTool.selectedElementIds,
    });
  }

  public pushUndo(): void {
    const snapshot = this.createSnapshot();
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  public undo(): boolean {
    if (this.undoStack.length === 0) return false;
    const currentSnapshot = this.createSnapshot();
    this.redoStack.push(currentSnapshot);
    const prevState = this.undoStack.pop()!;
    this.applyState(prevState);
    return true;
  }

  public redo(): boolean {
    if (this.redoStack.length === 0) return false;
    const currentSnapshot = this.createSnapshot();
    this.undoStack.push(currentSnapshot);
    const nextState = this.redoStack.pop()!;
    this.applyState(nextState);
    return true;
  }

  public applyState(state: DocumentState): void {
    this.ctx.model.elements = state.elements.map((el) => ({
      ...el,
      attributes: { ...el.attributes },
      vertices: el.vertices ? el.vertices.map((v) => ({ ...v })) : undefined,
    }));
    this.ctx.canvasMgr.guides = [...state.guides];
    this.ctx.selectionTool.elementPivots = new Map(state.elementPivots);
    this.ctx.selectionTool.customPivot = state.customPivot ? { ...state.customPivot } : null;

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
      this.undoStack = (metadata.undoStack as string[])
        .slice(-this.maxHistory)
        .map((str) => this.parseSnapshotString(str))
        .filter((s): s is DocumentState => s !== null);
    }
    if (Array.isArray(metadata.redoStack)) {
      this.redoStack = (metadata.redoStack as string[])
        .slice(-this.maxHistory)
        .map((str) => this.parseSnapshotString(str))
        .filter((s): s is DocumentState => s !== null);
    }
  }

  private parseSnapshotString(str: string): DocumentState | null {
    try {
      const parsed = typeof str === 'string' ? JSON.parse(str) : str;
      if (Array.isArray(parsed)) {
        return DocumentStateFactory.create({
          revision: this.currentRevision++,
          canvas: this.ctx.model.canvas,
          elements: parsed,
          guides: this.ctx.canvasMgr.guides,
        });
      }
      return DocumentStateFactory.create({
        revision: this.currentRevision++,
        canvas: this.ctx.model.canvas,
        elements: parsed.elements || [],
        guides: parsed.guides || [],
        elementPivots: parsed.elementPivots,
        customPivot: parsed.customPivot,
      });
    } catch {
      return null;
    }
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
