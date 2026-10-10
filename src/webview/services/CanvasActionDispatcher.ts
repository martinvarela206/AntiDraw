import { VectorModel, VectorElement } from '../engine/VectorModel.js';
import { SelectionTool } from '../engine/SelectionTool.js';
import { BooleanOperations } from '../engine/BooleanOperations.js';
import { ConfirmationModal } from '../ui/ConfirmationModal.js';
import { CrashGuard } from './CrashGuard.js';

export interface CanvasActionDispatcherContext {
  model: VectorModel;
  selectionTool: SelectionTool;
  pushUndo: () => void;
  render: () => void;
  syncToHost: () => void;
  onResetPropertyPanel: () => void;
  onUpdatePropertyPanel: (activeTool: string) => void;
  getActiveTool: () => string;
  crashGuard?: CrashGuard;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Canvas Action Dispatcher (CanvasActionDispatcher)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Isolates the orchestration of vector transformations, constructive solid geometry (Boolean operations),
 *    spatial alignments, layer reordering (Z-order), stroke-to-path extrusion, and parametric curve
 *    conversions from AntiDrawApp.
 *
 * 2. Predictable Undo Snapshot Invariance:
 *    Guarantees that transactional undo points are pushed immediately prior to destructive or constructive
 *    model mutations, preventing state desynchronization.
 *
 * 3. In-Place Element Swapping & Selection Preservation:
 *    Ensures generated boolean shapes and converted primitives seamlessly replace source elements
 *    in-place within `model.elements`, maintaining DOM z-index hierarchies and re-establishing active selections.
 */
export class CanvasActionDispatcher {
  constructor(private ctx: CanvasActionDispatcherContext) {}

  public align(type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
    const selectedIds = Array.from(this.ctx.selectionTool.selectedElementIds);
    const selectedEls: VectorElement[] = [];
    selectedIds.forEach((id) => {
      const el = this.ctx.model.elements.find((e) => e.id === id);
      if (el) selectedEls.push(el);
    });

    if (selectedEls.length > 0) {
      this.ctx.pushUndo();
      const aligned = BooleanOperations.alignElements(
        selectedEls,
        type,
        this.ctx.model.canvas.width,
        this.ctx.model.canvas.height
      );
      aligned.forEach((aEl) => {
        const target = this.ctx.model.elements.find((e) => e.id === aEl.id);
        if (target) {
          target.vertices = aEl.vertices;
          target.attributes.d = this.ctx.model.compilePathD(target.vertices || [], this.ctx.model.isElementClosed(target));
          if (this.ctx.model.isParametricElement(target)) {
            this.ctx.model.syncParametricAttributes(target);
          }
        }
      });
      this.ctx.render();
      this.ctx.syncToHost();
    }
  }

  public executeBoolean(op: 'union' | 'subtract' | 'intersect' | 'exclude' | 'combine' | 'fragment'): void {
    const run = () => {
      const selectedIds = Array.from(this.ctx.selectionTool.selectedElementIds);
      const selectedEls: VectorElement[] = [];
      selectedIds.forEach((id) => {
        const el = this.ctx.model.elements.find((e) => e.id === id);
        if (el) selectedEls.push(el);
      });

      if (selectedEls.length < 2) return;
      this.ctx.pushUndo();

      if (op === 'union') {
        const result = BooleanOperations.union(selectedEls, this.ctx.model);
        if (result) {
          const removeIds = new Set(selectedEls.map((e) => e.id));
          this.ctx.model.elements = this.ctx.model.elements.filter((e) => !removeIds.has(e.id));
          this.ctx.model.elements.push(result);
          this.ctx.selectionTool.select(result.id);
          this.ctx.onResetPropertyPanel();
          this.ctx.render();
          this.ctx.syncToHost();
        }
      } else if (op === 'subtract') {
        // 1st selected vector cuts the last selected vector; cutter is NOT deleted
        const trimRes = BooleanOperations.subtract(selectedEls, this.ctx.model);
        if (trimRes) {
          const targetIdx = this.ctx.model.elements.findIndex((e) => e.id === trimRes.targetId);
          if (targetIdx >= 0) {
            this.ctx.model.elements[targetIdx] = trimRes.trimmed;
          }
          this.ctx.selectionTool.select(trimRes.trimmed.id);
          this.ctx.onResetPropertyPanel();
          this.ctx.render();
          this.ctx.syncToHost();
        }
      } else if (op === 'intersect') {
        const result = BooleanOperations.intersect(selectedEls, this.ctx.model);
        if (result) {
          const removeIds = new Set(selectedEls.map((e) => e.id));
          this.ctx.model.elements = this.ctx.model.elements.filter((e) => !removeIds.has(e.id));
          this.ctx.model.elements.push(result);
          this.ctx.selectionTool.select(result.id);
          this.ctx.onResetPropertyPanel();
          this.ctx.render();
          this.ctx.syncToHost();
        }
      } else if (op === 'exclude') {
        const result = BooleanOperations.exclude(selectedEls, this.ctx.model);
        if (result) {
          const removeIds = new Set(selectedEls.map((e) => e.id));
          this.ctx.model.elements = this.ctx.model.elements.filter((e) => !removeIds.has(e.id));
          this.ctx.model.elements.push(result);
          this.ctx.selectionTool.select(result.id);
          this.ctx.onResetPropertyPanel();
          this.ctx.render();
          this.ctx.syncToHost();
        }
      } else if (op === 'combine') {
        /**
         * ARCHITECTURAL RATIONALE: Compound Path (Combine) with Source Removal (FIX-07)
         * Combines multiple vector contours into a single unified <path fill-rule="evenodd">
         * and removes the source shapes so inner contours render as actual cutouts/holes.
         */
        const result = BooleanOperations.combine(selectedEls, this.ctx.model);
        if (result) {
          const removeIds = new Set(selectedEls.map((e) => e.id));
          this.ctx.model.elements = this.ctx.model.elements.filter((e) => !removeIds.has(e.id));
          this.ctx.model.elements.push(result);
          this.ctx.selectionTool.select(result.id);
          this.ctx.onResetPropertyPanel();
          this.ctx.render();
          this.ctx.syncToHost();
        }
      } else if (op === 'fragment') {
        // Divide into intersection + exclusion simultaneously, removing originals
        const frags = BooleanOperations.fragment(selectedEls, this.ctx.model);
        if (frags && frags.length > 0) {
          const removeIds = new Set(selectedEls.map((e) => e.id));
          this.ctx.model.elements = this.ctx.model.elements.filter((e) => !removeIds.has(e.id));
          frags.forEach((f) => this.ctx.model.elements.push(f));
          this.ctx.selectionTool.deselectAll();
          frags.forEach((f) => this.ctx.selectionTool.selectedElementIds.add(f.id));
          this.ctx.onResetPropertyPanel();
          this.ctx.render();
          this.ctx.syncToHost();
        }
      }
    };

    if (this.ctx.crashGuard) {
      this.ctx.crashGuard.execute(`Boolean (${op})`, run);
    } else {
      run();
    }
  }

  public reorderZ(action: 'front' | 'forward' | 'backward' | 'back'): void {
    const selectedIds = Array.from(this.ctx.selectionTool.selectedElementIds);
    if (selectedIds.length === 0) return;
    this.ctx.pushUndo();
    selectedIds.forEach((id) => {
      this.ctx.model.elements = BooleanOperations.reorder(this.ctx.model.elements, id, action);
    });
    this.ctx.render();
    this.ctx.syncToHost();
  }

  /**
   * ARCHITECTURAL RATIONALE: Stroke to Path (Outline Stroke) Invocation
   * Why this exists:
   * Replaces an open or closed stroked vector with an extruded planar polygon whose fill is the original stroke color.
   *
   * Edge Cases & Safety Handled:
   * 1. Preserves Undo/Redo stack prior to mutating the element.
   * 2. Swaps the element in-place in `model.elements` keeping layer ordering intact rather than appending to end.
   * 3. Seamlessly updates `selectionTool` with the new element ID and re-renders the property panel with the new closed polygon.
   * 4. Discarded alternative: leaving the stroke in place and creating a duplicate path. Discarded because standard graphic suites
   *    (Corel Draw "Convert Outline to Object", Illustrator "Outline Stroke") replace the stroked vector directly, avoiding
   *    accidental duplicate geometry and z-fighting.
   */
  public strokeToPath(): void {
    const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
    if (!selectedEl) return;
    this.ctx.pushUndo();
    const newElements = BooleanOperations.outlineStrokeElements(selectedEl, this.ctx.model);
    if (newElements.length > 0) {
      const idx = this.ctx.model.elements.findIndex((el) => el.id === selectedEl.id);
      if (idx >= 0) {
        this.ctx.model.elements.splice(idx, 1, ...newElements);
        this.ctx.selectionTool.deselectAll();
        newElements.forEach((el) => this.ctx.selectionTool.select(el.id));
        this.ctx.onResetPropertyPanel();
        this.ctx.render();
        this.ctx.syncToHost();
      }
    }
  }

  /**
   * ARCHITECTURAL RATIONALE: Explicit Parametric Shape to Curves Conversion (FEAT-01 & FEAT-09)
   *
   * Translates native SVG parametric primitives (<rect>, <circle>, <ellipse>, <line>, <polyline>, <polygon>)
   * into standard editable <path> elements with independent Bézier anchor nodes and tangents.
   * Blocks conversion until the designer explicitly confirms the modal dialog.
   */
  public async convertToCurves(): Promise<void> {
    const selected = this.ctx.model.elements.filter((el) => this.ctx.selectionTool.isSelected(el.id));
    const parametricEls = selected.filter((el) => this.ctx.model.isParametricElement(el));
    if (parametricEls.length === 0) return;

    const names = parametricEls.map((el) => `<${el.shapeType || el.tagName}>`).join(', ');
    const confirmed = await ConfirmationModal.confirm({
      title: 'Convertir Primitiva a Curvas',
      message: `¿Deseas convertir ${parametricEls.length === 1 ? `la primitiva ${names}` : `las ${parametricEls.length} primitivas (${names})`} a trazado libre <path>?`,
      details: 'Esta acción desestructurará la figura en nodos y curvas de Bézier libres. Se perderán los controles paramétricos de radios, esquinas o sectores.',
      confirmText: 'Convertir a Curvas',
      cancelText: 'Cancelar',
    });
    if (!confirmed) return;

    this.ctx.pushUndo();
    parametricEls.forEach((el) => {
      this.ctx.model.convertToCurves(el);
    });
    this.ctx.onResetPropertyPanel();
    this.ctx.onUpdatePropertyPanel(this.ctx.getActiveTool());
    this.ctx.render();
    this.ctx.syncToHost();
  }

  /**
   * ARCHITECTURAL RATIONALE: Batch Path to Primitive Optimizer (FEAT-05)
   * Scans all selected non-parametric <path> elements, performs inverse geometric recognition,
   * converts them to their canonical native SVG primitives (<line>, <polyline>, <polygon>, <rect>, <circle>, <ellipse>),
   * purges path d attributes, recalculates vertex bounds, and records undo state.
   */
  public convertToPrimitives(): void {
    const selected = this.ctx.model.elements.filter((el) => this.ctx.selectionTool.isSelected(el.id));
    const convertibleEls = selected.filter(
      (el) => !this.ctx.model.isParametricElement(el) && el.tagName === 'path' && this.ctx.model.detectPrimitiveFromPath(el) !== null
    );
    if (convertibleEls.length === 0) return;

    this.ctx.pushUndo();
    convertibleEls.forEach((el) => {
      this.ctx.model.convertPathToPrimitive(el);
    });
    this.ctx.onResetPropertyPanel();
    this.ctx.onUpdatePropertyPanel(this.ctx.getActiveTool());
    this.ctx.render();
    this.ctx.syncToHost();
  }

  /**
   * ARCHITECTURAL RATIONALE: Rigorous Horizontal & Vertical Reflection (ITEM-06)
   * Reflects all selected vector elements across the central axis of their collective bounding box.
   * Modulates vertex coordinates and Bézier control handles symmetrically:
   *   Horizontal (Mirror X): x' = 2 * cx - x, y' = y, handleIn.x' = 2 * cx - handleIn.x
   *   Vertical (Mirror Y):   x' = x, y' = 2 * cy - y, handleIn.y' = 2 * cy - handleIn.y
   * Compensates custom selection pivots and synchronizes parametric attributes.
   */
  public flip(axis: 'horizontal' | 'vertical'): void {
    const selectedIds = Array.from(this.ctx.selectionTool.selectedElementIds);
    const selectedEls: VectorElement[] = [];
    selectedIds.forEach((id) => {
      const el = this.ctx.model.elements.find((e) => e.id === id);
      if (el) selectedEls.push(el);
    });

    if (selectedEls.length === 0) return;

    const groupBox = this.ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 0);
    if (!groupBox) return;

    this.ctx.pushUndo();

    const mirrorAxisX = groupBox.x + groupBox.width / 2;
    const mirrorAxisY = groupBox.y + groupBox.height / 2;

    selectedEls.forEach((el) => {
      if (el.vertices && el.vertices.length > 0) {
        el.vertices = el.vertices.map((v) => {
          const next = {
            ...v,
            x: axis === 'horizontal' ? 2 * mirrorAxisX - v.x : v.x,
            y: axis === 'vertical' ? 2 * mirrorAxisY - v.y : v.y,
          };
          if (v.handleIn) {
            next.handleIn = {
              x: axis === 'horizontal' ? 2 * mirrorAxisX - v.handleIn.x : v.handleIn.x,
              y: axis === 'vertical' ? 2 * mirrorAxisY - v.handleIn.y : v.handleIn.y,
            };
          }
          if (v.handleOut) {
            next.handleOut = {
              x: axis === 'horizontal' ? 2 * mirrorAxisX - v.handleOut.x : v.handleOut.x,
              y: axis === 'vertical' ? 2 * mirrorAxisY - v.handleOut.y : v.handleOut.y,
            };
          }
          return next;
        });

        const isClosed = this.ctx.model.isElementClosed(el);
        el.attributes.d = this.ctx.model.compilePathD(el.vertices, isClosed);
        if (this.ctx.model.isParametricElement(el)) {
          this.ctx.model.syncParametricAttributes(el);
        }
      }
    });

    if (this.ctx.selectionTool.customPivot) {
      if (axis === 'horizontal') {
        this.ctx.selectionTool.customPivot.x = 2 * mirrorAxisX - this.ctx.selectionTool.customPivot.x;
      } else {
        this.ctx.selectionTool.customPivot.y = 2 * mirrorAxisY - this.ctx.selectionTool.customPivot.y;
      }
    }

    this.ctx.onResetPropertyPanel();
    this.ctx.onUpdatePropertyPanel(this.ctx.getActiveTool());
    this.ctx.render();
    this.ctx.syncToHost();
  }
}

