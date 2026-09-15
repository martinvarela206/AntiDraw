import { VectorModel } from '../engine/VectorModel.js';
import { SelectionTool } from '../engine/SelectionTool.js';

export interface HistoryServiceContext {
  model: VectorModel;
  selectionTool: SelectionTool;
  onResetPropertyPanel: () => void;
  render: () => void;
  syncToHost: () => void;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Vector History Service (HistoryService)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Decouples undo/redo stack persistence, transaction snapshotting, depth limiting,
 *    and state restoration from the visual and event-dispatching layers of AntiDrawApp.
 *
 * 2. Immutable Deep-State Snapshotting:
 *    Stores deep JSON snapshots of `VectorElement[]` to guarantee total structural
 *    isolation between canvas manipulation frames without in-place mutation side-effects.
 *
 * 3. Bounded Memory Consumption:
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

  public pushUndo(): void {
    const state = JSON.stringify(this.ctx.model.elements);
    this.undoStack.push(state);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  public undo(): boolean {
    if (this.undoStack.length === 0) return false;
    const currentState = JSON.stringify(this.ctx.model.elements);
    this.redoStack.push(currentState);
    const prevState = this.undoStack.pop()!;
    this.ctx.model.elements = JSON.parse(prevState);
    this.ctx.selectionTool.deselectAll();
    this.ctx.onResetPropertyPanel();
    this.ctx.render();
    this.ctx.syncToHost();
    return true;
  }

  public redo(): boolean {
    if (this.redoStack.length === 0) return false;
    const currentState = JSON.stringify(this.ctx.model.elements);
    this.undoStack.push(currentState);
    const nextState = this.redoStack.pop()!;
    this.ctx.model.elements = JSON.parse(nextState);
    this.ctx.selectionTool.deselectAll();
    this.ctx.onResetPropertyPanel();
    this.ctx.render();
    this.ctx.syncToHost();
    return true;
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
