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
  public maxHistory: number = 1000;
  private currentRevision: number = 1;

  constructor(private ctx: HistoryServiceContext) {}

  public get undoCount(): number {
    return this.undoStack.length;
  }

  public get redoCount(): number {
    return this.redoStack.length;
  }

  public optimizeHistory(keepCount: number = 100): void {
    if (this.undoStack.length > keepCount) {
      this.undoStack = this.undoStack.slice(-keepCount);
    }
    if (this.redoStack.length > keepCount) {
      this.redoStack = this.redoStack.slice(-keepCount);
    }
  }

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

  public isVisuallyIdentical(s1: DocumentState, s2: DocumentState): boolean {
    if (
      s1.canvas.width !== s2.canvas.width ||
      s1.canvas.height !== s2.canvas.height ||
      s1.canvas.currentColor !== s2.canvas.currentColor
    ) {
      return false;
    }
    if (s1.guides.length !== s2.guides.length) return false;
    for (let i = 0; i < s1.guides.length; i++) {
      const g1 = s1.guides[i];
      const g2 = s2.guides[i];
      if (g1.id !== g2.id || g1.pos !== g2.pos || g1.axis !== g2.axis || g1.angle !== g2.angle) {
        return false;
      }
    }
    if (s1.elements.length !== s2.elements.length) return false;
    for (let i = 0; i < s1.elements.length; i++) {
      const e1 = s1.elements[i];
      const e2 = s2.elements[i];
      if (e1.id !== e2.id || e1.tagName !== e2.tagName) return false;
      const k1 = Object.keys(e1.attributes);
      const k2 = Object.keys(e2.attributes);
      if (k1.length !== k2.length) return false;
      for (const k of k1) {
        if (e1.attributes[k] !== e2.attributes[k]) return false;
      }
      const v1Len = e1.vertices?.length || 0;
      const v2Len = e2.vertices?.length || 0;
      if (v1Len !== v2Len) return false;
      if (e1.vertices && e2.vertices) {
        for (let v = 0; v < v1Len; v++) {
          const v1 = e1.vertices[v];
          const v2 = e2.vertices[v];
          if (v1.x !== v2.x || v1.y !== v2.y || v1.command !== v2.command) return false;
          if (v1.handleIn?.x !== v2.handleIn?.x || v1.handleIn?.y !== v2.handleIn?.y) return false;
          if (v1.handleOut?.x !== v2.handleOut?.x || v1.handleOut?.y !== v2.handleOut?.y) return false;
        }
      }
    }
    return true;
  }

  public pushUndo(): void {
    const snapshot = this.createSnapshot();
    // Do not push redundant snapshots that produce zero visual changes
    if (
      this.undoStack.length > 0 &&
      this.isVisuallyIdentical(this.undoStack[this.undoStack.length - 1], snapshot)
    ) {
      return;
    }
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

    let prevState = this.undoStack.pop()!;
    // Advance past any non-visual snapshots to ensure each Undo press produces a real visual rollback
    while (
      prevState &&
      this.isVisuallyIdentical(prevState, currentSnapshot) &&
      this.undoStack.length > 0
    ) {
      prevState = this.undoStack.pop()!;
    }

    this.applyState(prevState);
    return true;
  }

  public redo(): boolean {
    if (this.redoStack.length === 0) return false;
    const currentSnapshot = this.createSnapshot();
    this.undoStack.push(currentSnapshot);

    let nextState = this.redoStack.pop()!;
    while (
      nextState &&
      this.isVisuallyIdentical(nextState, currentSnapshot) &&
      this.redoStack.length > 0
    ) {
      nextState = this.redoStack.pop()!;
    }

    this.applyState(nextState);
    return true;
  }

  public applyState(state: DocumentState): void {
    this.ctx.model.elements = state.elements.map((el) => ({
      ...el,
      attributes: { ...el.attributes },
      vertices: el.vertices
        ? el.vertices.map((v) => ({
            ...v,
            handleIn: v.handleIn ? { ...v.handleIn } : undefined,
            handleOut: v.handleOut ? { ...v.handleOut } : undefined,
          }))
        : undefined,
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
