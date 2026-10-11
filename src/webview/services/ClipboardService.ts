import { VectorModel, VectorElement } from '../engine/VectorModel.js';
import { SelectionTool } from '../engine/SelectionTool.js';
import { CanvasManager, GuideLine } from '../engine/CanvasManager.js';
import { ClipboardManager } from '../engine/clipboard/ClipboardManager.js';

export interface ClipboardServiceContext {
  model: VectorModel;
  selectionTool: SelectionTool;
  canvasMgr: CanvasManager;
  pushUndo: () => void;
  render: () => void;
  syncToHost: () => void;
  syncMetadataToHost: () => void;
  onResetPropertyPanel: () => void;
  onShowGuideSettings: (guide: GuideLine) => void;
  onUpdatePropertyPanel: () => void;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Vector Clipboard Service (ClipboardService)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Isolates in-memory clipboard buffer management, deep cloning, staggered offset calculation,
 *    unique ID regeneration, and guide/element duplication from the main application orchestrator.
 *
 * 2. Preserves Geometric Staggering:
 *    Pasting vectors or guides increments the position offset (+15px) and updates the internal
 *    clipboard buffer so subsequent paste operations produce visibly staggered duplicates
 *    instead of perfectly coincident stacks.
 *
 * 3. Comprehensive ID Regeneration:
 *    Ensures vector element IDs, vertex IDs, and internal SVG filter/gradient references
 *    (`ad-filter-shadow-*`, `ad-grad-*`, `ad-marker-*`) are uniquely rebound to prevent
 *    cross-element graphical mutations.
 */
export class ClipboardService {
  private clipboardElements: VectorElement[] = [];
  private clipboardGuides: GuideLine[] = [];

  constructor(private ctx: ClipboardServiceContext) {}

  public get hasContent(): boolean {
    return this.clipboardElements.length > 0 || this.clipboardGuides.length > 0;
  }

  public copy(): void {
    if (this.ctx.selectionTool.selectedElementIds.size > 0) {
      const selected = this.ctx.model.elements.filter((el) => this.ctx.selectionTool.isSelected(el.id));
      this.clipboardElements = JSON.parse(JSON.stringify(selected));

      // Asynchronously publish multi-flavour representations (SVG + Plain Text + PNG) to OS clipboard
      ClipboardManager.copySelectionMultiFlavour(selected).catch((err) => {
        console.warn('[ClipboardService] System clipboard export warning:', err);
      });
    } else {
      this.clipboardElements = [];
    }

    if (this.ctx.canvasMgr.selectedGuideId) {
      const guide = this.ctx.canvasMgr.guides.find((g) => g.id === this.ctx.canvasMgr.selectedGuideId);
      this.clipboardGuides = guide ? [JSON.parse(JSON.stringify(guide))] : [];
    } else {
      this.clipboardGuides = [];
    }
  }

  public cut(): void {
    this.copy();
    this.ctx.pushUndo();

    if (this.ctx.canvasMgr.selectedGuideId) {
      this.ctx.canvasMgr.removeGuide(this.ctx.canvasMgr.selectedGuideId);
      this.ctx.canvasMgr.selectedGuideId = null;
      this.ctx.canvasMgr.activeGuideTransformId = null;
      this.ctx.onResetPropertyPanel();
      this.ctx.syncMetadataToHost();
    }

    if (this.ctx.selectionTool.selectedElementIds.size > 0) {
      this.ctx.model.elements = this.ctx.model.elements.filter((el) => !this.ctx.selectionTool.isSelected(el.id));
      this.ctx.selectionTool.deselectAll();
      this.ctx.onResetPropertyPanel();
      this.ctx.syncToHost();
    }

    this.ctx.render();
  }

  public paste(): void {
    const offset = 15;
    const newSelectedIds: string[] = [];

    if (this.clipboardElements.length > 0) {
      this.ctx.pushUndo();
      const pastedElements: VectorElement[] = this.clipboardElements.map((srcEl) => {
        const el: VectorElement = JSON.parse(JSON.stringify(srcEl));
        /**
         * HISTORICAL ARCHITECTURE (FIX-19):
         * Strict Synchronization of el.attributes.id with el.id on Clipboard Paste.
         * Why this was built:
         * Previously, pasting a cloned element reassigned `el.id` in memory but left `el.attributes.id`
         * untouched with the original element's ID. When serialized to SVG (`toSvgString`), attributes.id
         * was written, causing both the original and pasted elements to share identical ID attributes
         * in the SVG XML. Upon closing and reopening the file, DOMParser loaded both paths with the same ID,
         * resulting in phantom multi-selection coupling, inability to move or select elements independently,
         * and corruption of object tracking. Synchronizing `el.attributes.id = el.id` guarantees absolute
         * identifier independence across paste, serialization, and disk reload cycles.
         */
        el.id = `el_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
        el.attributes.id = el.id;

        if (el.vertices && el.vertices.length > 0) {
          el.vertices.forEach((v) => {
            v.id = `v_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
            v.x += offset;
            v.y += offset;
            if (v.handleIn) {
              v.handleIn.x += offset;
              v.handleIn.y += offset;
            }
            if (v.handleOut) {
              v.handleOut.x += offset;
              v.handleOut.y += offset;
            }
          });

          const isClosed = el.isClosed ?? (!el.tagName || ['rect', 'circle', 'ellipse', 'star', 'polygon'].includes(el.tagName) || (el.attributes.d ? /z/i.test(el.attributes.d) : false));
          el.attributes.d = this.ctx.model.compilePathD(el.vertices, isClosed);
        }

        if (el.attributes.x) el.attributes.x = (parseFloat(el.attributes.x) + offset).toString();
        if (el.attributes.y) el.attributes.y = (parseFloat(el.attributes.y) + offset).toString();
        if (el.attributes.cx) el.attributes.cx = (parseFloat(el.attributes.cx) + offset).toString();
        if (el.attributes.cy) el.attributes.cy = (parseFloat(el.attributes.cy) + offset).toString();

        if (el.attributes['filter'] && el.attributes['filter'].includes('ad-filter-shadow-')) {
          el.attributes['filter'] = `url(#ad-filter-shadow-${el.id})`;
        }

        if (el.attributes['fill'] && el.attributes['fill'].includes('ad-grad-')) {
          el.attributes['fill'] = `url(#ad-grad-${el.id})`;
        }

        ['marker-start', 'marker-mid', 'marker-end'].forEach((attr) => {
          if (el.attributes[attr] && el.attributes[attr].includes('ad-marker-')) {
            el.attributes[attr] = el.attributes[attr].replace(/(ad-marker-[^)]+)-[a-zA-Z0-9_-]+(\))/, `$1-${el.id}$2`);
          }
        });

        return el;
      });

      this.ctx.selectionTool.deselectAll();
      pastedElements.forEach((el) => {
        this.ctx.model.elements.push(el);
        this.ctx.selectionTool.selectedElementIds.add(el.id);
        newSelectedIds.push(el.id);
      });

      // Update clipboard elements so repeated pastes stagger automatically
      this.clipboardElements = JSON.parse(JSON.stringify(pastedElements));

      this.ctx.onResetPropertyPanel();
      this.ctx.onUpdatePropertyPanel();
      this.ctx.syncToHost();
    }

    if (this.clipboardGuides.length > 0) {
      const pastedGuides: GuideLine[] = this.clipboardGuides.map((srcGuide) => {
        const g: GuideLine = JSON.parse(JSON.stringify(srcGuide));
        g.id = `guide_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
        g.position += offset;
        g.pivotX += offset;
        g.pivotY += offset;
        return g;
      });

      pastedGuides.forEach((g) => {
        this.ctx.canvasMgr.guides.push(g);
        this.ctx.canvasMgr.selectedGuideId = g.id;
        this.ctx.onShowGuideSettings(g);
      });

      this.clipboardGuides = JSON.parse(JSON.stringify(pastedGuides));
      this.ctx.syncMetadataToHost();
    }

    this.ctx.render();
  }

  public duplicate(): void {
    this.copy();
    this.paste();
  }
}
