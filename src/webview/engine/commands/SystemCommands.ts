/**
 * CAPA L3: Catálogo de Comandos del Sistema (SystemCommands)
 * Registra comandos estándar de edición, objetos y vista en el CommandRegistry.
 */

import { CommandRegistry, CommandSpec, CommandContext } from './CommandRegistry.js';
import { registerAllDomainCommands } from '../../commands/index.js';
import { ExportModal } from '../../ui/ExportModal.js';
import { SceneLayerService } from '../scene/SceneLayerService.js';
import { ContextElementService } from '../scene/ContextElementService.js';
import { ContextualVectorGridService } from '../scene/ContextualVectorGridService.js';
import { ContextualGridModal } from '../../ui/ContextualGridModal.js';
import { VectorElement } from '../VectorModel.js';
import { SpineCurveService } from '../stroke/SpineCurveService.js';
import { BlendEngine } from '../blend/BlendEngine.js';
import { WarpEngine, WarpArcOptions } from '../warp/WarpEngine.js';
import { BoundingBoxCalculator } from '../geometry/BoundingBoxCalculator.js';

export function registerSystemCommands(registry: CommandRegistry): void {
  // Registrar comandos de dominio formalizados (shape.*, path.*, transform.*, node.*)
  registerAllDomainCommands(registry);

  // --- EDICIÓN ---
  registry.register({
    id: 'edit.undo',
    label: 'Deshacer',
    category: 'edit',
    shortcut: 'Ctrl+Z',
    isEnabled: (ctx: CommandContext) => ctx.historyService?.canUndo ?? true,
    execute: (ctx: CommandContext) => {
      if (typeof ctx.undo === 'function') {
        ctx.undo();
        return { success: true };
      }
      return { success: false, error: 'Función undo no disponible en contexto' };
    },
  });

  registry.register({
    id: 'edit.redo',
    label: 'Rehacer',
    category: 'edit',
    shortcut: 'Ctrl+Y',
    isEnabled: (ctx: CommandContext) => ctx.historyService?.canRedo ?? true,
    execute: (ctx: CommandContext) => {
      if (typeof ctx.redo === 'function') {
        ctx.redo();
        return { success: true };
      }
      return { success: false, error: 'Función redo no disponible en contexto' };
    },
  });

  registry.register({
    id: 'edit.copy',
    label: 'Copiar',
    category: 'edit',
    shortcut: 'Ctrl+C',
    isEnabled: (ctx: CommandContext) =>
      (ctx.selectionTool?.selectedElementIds?.size > 0) || !!ctx.canvasMgr?.selectedGuideId,
    execute: (ctx: CommandContext) => {
      if (typeof ctx.copySelection === 'function') {
        ctx.copySelection();
        return { success: true };
      }
      return { success: false, error: 'Función copySelection no disponible' };
    },
  });

  registry.register({
    id: 'edit.cut',
    label: 'Cortar',
    category: 'edit',
    shortcut: 'Ctrl+X',
    isEnabled: (ctx: CommandContext) =>
      (ctx.selectionTool?.selectedElementIds?.size > 0) || !!ctx.canvasMgr?.selectedGuideId,
    execute: (ctx: CommandContext) => {
      if (typeof ctx.cutSelection === 'function') {
        ctx.cutSelection();
        return { success: true };
      }
      return { success: false, error: 'Función cutSelection no disponible' };
    },
  });

  registry.register({
    id: 'edit.paste',
    label: 'Pegar',
    category: 'edit',
    shortcut: 'Ctrl+V',
    isEnabled: (ctx: CommandContext) => !!ctx.clipboardService?.hasContent,
    execute: (ctx: CommandContext) => {
      if (typeof ctx.pasteClipboard === 'function') {
        ctx.pasteClipboard();
        return { success: true };
      }
      return { success: false, error: 'Función pasteClipboard no disponible' };
    },
  });

  registry.register({
    id: 'edit.duplicate',
    label: 'Duplicar',
    category: 'edit',
    shortcut: 'Ctrl+D',
    isEnabled: (ctx: CommandContext) =>
      (ctx.selectionTool?.selectedElementIds?.size > 0) || !!ctx.canvasMgr?.selectedGuideId,
    execute: (ctx: CommandContext) => {
      if (typeof ctx.duplicateSelection === 'function') {
        ctx.duplicateSelection();
        return { success: true };
      }
      return { success: false, error: 'Función duplicateSelection no disponible' };
    },
  });

  registry.register({
    id: 'edit.deleteSelected',
    label: 'Eliminar Selección',
    category: 'edit',
    shortcut: 'Delete',
    isEnabled: (ctx: CommandContext) => {
      const hasGuide = !!ctx.canvasMgr?.selectedGuideId;
      const hasNode =
        ctx.toolbar?.activeTool === 'node' && !!ctx.nodeEditorTool?.selectedVertexId;
      const hasVectors = (ctx.selectionTool?.selectedElementIds?.size || 0) > 0;
      return hasGuide || hasNode || hasVectors;
    },
    execute: (ctx: CommandContext) => {
      // 1. Eliminar guía seleccionada
      if (ctx.canvasMgr?.selectedGuideId) {
        ctx.canvasMgr.removeGuide(ctx.canvasMgr.selectedGuideId);
        ctx.propertyPanel?.resetPanelMode();
        ctx.render?.();
        ctx.syncMetadataToHost?.();
        return { success: true };
      }

      // 2. Eliminar vértice seleccionado
      if (
        ctx.toolbar?.activeTool === 'node' &&
        ctx.nodeEditorTool?.selectedVertexId &&
        ctx.nodeToolHandler?.deleteSelectedVertex
      ) {
        if (ctx.nodeToolHandler.deleteSelectedVertex()) {
          ctx.propertyPanel?.update(null, 'node');
          return { success: true };
        }
      }

      // 3. Eliminar elementos vectoriales seleccionados
      if (ctx.selectionTool?.selectedElementIds?.size > 0 && ctx.model) {
        ctx.pushUndo?.();
        ctx.model.elements = ctx.model.elements.filter(
          (el: any) => !ctx.selectionTool.isSelected(el.id)
        );
        ctx.selectionTool.deselectAll();
        ctx.propertyPanel?.resetPanelMode();
        ctx.render?.();
        ctx.syncToHost?.();
        return { success: true };
      }

      return { success: false, error: 'Nada para eliminar' };
    },
  });

  // --- OBJETOS Y GEOMETRÍA ---
  registry.register({
    id: 'object.convertToCurves',
    label: 'Convertir a Curvas',
    category: 'object',
    shortcut: 'Ctrl+Q',
    isEnabled: (ctx: CommandContext) => {
      if (!ctx.model || !ctx.selectionTool) return false;
      const selected = ctx.model.elements.filter((el: any) => ctx.selectionTool.isSelected(el.id));
      return selected.some((el: any) => ctx.model.isParametricElement(el));
    },
    execute: (ctx: CommandContext) => {
      if (typeof ctx.handleConvertToCurves === 'function') {
        ctx.handleConvertToCurves();
        return { success: true };
      }
      return { success: false, error: 'Función handleConvertToCurves no disponible' };
    },
  });

  registry.register({
    id: 'object.convertToPrimitives',
    label: 'Simplificar a Primitivas SVG',
    category: 'object',
    isEnabled: (ctx: CommandContext) => {
      if (!ctx.model || !ctx.selectionTool) return false;
      const selected = ctx.model.elements.filter((el: any) => ctx.selectionTool.isSelected(el.id));
      return selected.some(
        (el: any) =>
          !ctx.model.isParametricElement(el) &&
          el.tagName === 'path' &&
          ctx.model.detectPrimitiveFromPath(el) !== null
      );
    },
    execute: (ctx: CommandContext) => {
      if (typeof ctx.handleConvertToPrimitives === 'function') {
        ctx.handleConvertToPrimitives();
        return { success: true };
      }
      return { success: false, error: 'Función handleConvertToPrimitives no disponible' };
    },
  });

  registry.register<{ action: 'front' | 'forward' | 'backward' | 'back' }>({
    id: 'object.reorderZ',
    label: 'Reordenar Capa',
    category: 'object',
    isEnabled: (ctx: CommandContext) => (ctx.selectionTool?.selectedElementIds?.size || 0) > 0,
    execute: (ctx: CommandContext, params) => {
      if (!params || !params.action) {
        return { success: false, error: 'Parámetro de acción Z no provisto' };
      }
      if (typeof ctx.handleZOrder === 'function') {
        ctx.handleZOrder(params.action);
        return { success: true };
      }
      return { success: false, error: 'Función handleZOrder no disponible' };
    },
  });

  registry.register<{ element: any }>({
    id: 'shape.create',
    label: 'Crear Figura Geométrica',
    category: 'shape',
    isEnabled: (ctx: CommandContext) => !!ctx.model,
    execute: (ctx: CommandContext, params) => {
      if (!params || !params.element) {
        return { success: false, error: 'Elemento geométrico no provisto' };
      }
      ctx.pushUndo?.();
      ctx.model.elements.push(params.element);
      ctx.selectionTool?.select(params.element.id);
      ctx.render?.();
      ctx.syncToHost?.();
      return { success: true };
    },
  });

  registry.register<{ op: 'union' | 'subtract' | 'intersect' | 'exclude' | 'combine' | 'fragment' }>({
    id: 'object.boolean',
    label: 'Operación Booleana',
    category: 'object',
    isEnabled: (ctx: CommandContext) => (ctx.selectionTool?.selectedElementIds?.size || 0) >= 2,
    execute: (ctx: CommandContext, params) => {
      if (!params || !params.op) {
        return { success: false, error: 'Operación booleana no provista' };
      }
      if (ctx.actionDispatcher?.executeBoolean) {
        ctx.actionDispatcher.executeBoolean(params.op);
        return { success: true };
      }
      return { success: false, error: 'ActionDispatcher no disponible' };
    },
  });

  registry.register({
    id: 'object.group',
    label: 'Agrupar',
    category: 'object',
    shortcut: 'Ctrl+G',
    isEnabled: (ctx: CommandContext) => (ctx.selectionTool?.selectedElementIds?.size || 0) >= 2,
    execute: (ctx: CommandContext) => {
      if (ctx.actionDispatcher?.groupSelection) {
        ctx.actionDispatcher.groupSelection();
        return { success: true };
      }
      return { success: false, error: 'ActionDispatcher no disponible' };
    },
  });

  registry.register({
    id: 'object.ungroup',
    label: 'Desagrupar',
    category: 'object',
    shortcut: 'Ctrl+Shift+G',
    isEnabled: (ctx: CommandContext) => {
      if (!ctx.selectionTool?.selectedElementIds || ctx.selectionTool.selectedElementIds.size === 0) return false;
      const ids: string[] = Array.from(ctx.selectionTool.selectedElementIds);
      return ids.some((id: string) => {
        const el = ctx.model?.getElementById ? ctx.model.getElementById(id) : ctx.model?.elements?.find((e: any) => e.id === id);
        return el && el.tagName === 'g';
      });
    },
    execute: (ctx: CommandContext) => {
      if (ctx.actionDispatcher?.ungroupSelection) {
        ctx.actionDispatcher.ungroupSelection();
        return { success: true };
      }
      return { success: false, error: 'ActionDispatcher no disponible' };
    },
  });

  // --- VISTA ---
  registry.register({
    id: 'view.zoomFit',
    label: 'Ajustar al Lienzo',
    category: 'view',
    shortcut: 'Ctrl+0',
    execute: (ctx: CommandContext) => {
      if (typeof ctx.recenterViewBox === 'function') {
        ctx.recenterViewBox();
        return { success: true };
      }
      return { success: false, error: 'Función recenterViewBox no disponible' };
    },
  });

  // --- CAPAS Y ORDEN Z (SCENE LAYERS) ---
  const executeLockAllAbove = (ctx: CommandContext) => {
    if (!ctx.model || !ctx.selectionTool) {
      return { success: false, error: 'Contexto no disponible' };
    }
    const res = SceneLayerService.lockAllAbove(ctx.model.elements, ctx.selectionTool.selectedElementIds);
    if (res.affectedCount > 0) {
      ctx.pushUndo?.();
      ctx.layoutMgr?.vectorExplorerPanel?.update();
      ctx.render?.();
      ctx.syncToHost?.();
    }
    return { success: true, value: res };
  };

  registry.register({
    id: 'layer.lockAllAbove',
    label: 'Bloquear Capas Superiores',
    category: 'layer',
    shortcut: 'Ctrl+Alt+L',
    isEnabled: (ctx: CommandContext) => (ctx.selectionTool?.selectedElementIds?.size || 0) > 0,
    execute: executeLockAllAbove,
  });

  registry.register({
    id: 'object.lockAllAbove',
    label: 'Bloquear Capas Superiores',
    category: 'object',
    shortcut: 'Ctrl+Alt+L',
    isEnabled: (ctx: CommandContext) => (ctx.selectionTool?.selectedElementIds?.size || 0) > 0,
    execute: executeLockAllAbove,
  });

  const executeHideAllAbove = (ctx: CommandContext) => {
    if (!ctx.model || !ctx.selectionTool) {
      return { success: false, error: 'Contexto no disponible' };
    }
    const res = SceneLayerService.hideAllAbove(ctx.model.elements, ctx.selectionTool.selectedElementIds);
    if (res.affectedCount > 0) {
      ctx.pushUndo?.();
      ctx.layoutMgr?.vectorExplorerPanel?.update();
      ctx.render?.();
      ctx.syncToHost?.();
    }
    return { success: true, value: res };
  };

  registry.register({
    id: 'layer.hideAllAbove',
    label: 'Ocultar Capas Superiores',
    category: 'layer',
    shortcut: 'Ctrl+Alt+3',
    isEnabled: (ctx: CommandContext) => (ctx.selectionTool?.selectedElementIds?.size || 0) > 0,
    execute: executeHideAllAbove,
  });

  registry.register({
    id: 'object.hideAllAbove',
    label: 'Ocultar Capas Superiores',
    category: 'object',
    shortcut: 'Ctrl+Alt+3',
    isEnabled: (ctx: CommandContext) => (ctx.selectionTool?.selectedElementIds?.size || 0) > 0,
    execute: executeHideAllAbove,
  });

  registry.register({
    id: 'layer.unlockAll',
    label: 'Desbloquear Todo',
    category: 'layer',
    shortcut: 'Ctrl+Alt+2',
    execute: (ctx: CommandContext) => {
      if (!ctx.model) return { success: false, error: 'Modelo no disponible' };
      const res = SceneLayerService.unlockAll(ctx.model.elements);
      if (res.affectedCount > 0) {
        ctx.pushUndo?.();
        ctx.layoutMgr?.vectorExplorerPanel?.update();
        ctx.render?.();
        ctx.syncToHost?.();
      }
      return { success: true, value: res };
    },
  });

  registry.register({
    id: 'layer.showAll',
    label: 'Mostrar Todo',
    category: 'layer',
    shortcut: 'Ctrl+Alt+Shift+3',
    execute: (ctx: CommandContext) => {
      if (!ctx.model) return { success: false, error: 'Modelo no disponible' };
      const res = SceneLayerService.showAll(ctx.model.elements);
      if (res.affectedCount > 0) {
        ctx.pushUndo?.();
        ctx.layoutMgr?.vectorExplorerPanel?.update();
        ctx.render?.();
        ctx.syncToHost?.();
      }
      return { success: true, value: res };
    },
  });

  // --- GUÍAS Y ELEMENTOS CONTEXTUALES ---
  registry.register({
    id: 'vector.convertToContext',
    label: 'Convertir a Guía / Elemento Contextual',
    category: 'object',
    isEnabled: (ctx: CommandContext) => (ctx.selectionTool?.selectedElementIds?.size || 0) > 0,
    execute: (ctx: CommandContext) => {
      if (!ctx.model || !ctx.selectionTool) return { success: false, error: 'Contexto no disponible' };
      const selected = ctx.model.elements.filter((el: VectorElement) => ctx.selectionTool.isSelected(el.id));
      if (selected.length === 0) return { success: false, error: 'Ningún elemento seleccionado' };

      ctx.pushUndo?.();
      for (const el of selected) {
        ContextElementService.convertToContextElement(el);
      }
      ctx.layoutMgr?.vectorExplorerPanel?.update();
      ctx.render?.();
      ctx.syncToHost?.();
      return { success: true, value: { count: selected.length } };
    },
  });

  registry.register({
    id: 'vector.convertToOrdinary',
    label: 'Desconvertir a Vector Ordinario',
    category: 'object',
    isEnabled: (ctx: CommandContext) => (ctx.selectionTool?.selectedElementIds?.size || 0) > 0,
    execute: (ctx: CommandContext) => {
      if (!ctx.model || !ctx.selectionTool) return { success: false, error: 'Contexto no disponible' };
      const selected = ctx.model.elements.filter((el: VectorElement) => ctx.selectionTool.isSelected(el.id));
      if (selected.length === 0) return { success: false, error: 'Ningún elemento seleccionado' };

      ctx.pushUndo?.();
      for (const el of selected) {
        ContextElementService.convertToOrdinaryVector(el);
      }
      ctx.layoutMgr?.vectorExplorerPanel?.update();
      ctx.render?.();
      ctx.syncToHost?.();
      return { success: true, value: { count: selected.length } };
    },
  });

  registry.register({
    id: 'vector.convertToContextualGrid',
    label: 'Convertir a Grilla Vectorial Contextual',
    category: 'object',
    isEnabled: (ctx: CommandContext) => (ctx.selectionTool?.selectedElementIds?.size || 0) > 0,
    execute: (ctx: CommandContext) => {
      if (!ctx.model || !ctx.selectionTool) return { success: false, error: 'Contexto no disponible' };
      const selected = ctx.model.elements.filter((el: VectorElement) => ctx.selectionTool.isSelected(el.id));
      if (selected.length === 0) return { success: false, error: 'Ningún elemento seleccionado' };

      ctx.pushUndo?.();
      for (const el of selected) {
        ContextualVectorGridService.convertToContextualGrid(el);
      }

      // Pre-compute and profile discrete snap points
      const cacheResult = ContextualVectorGridService.precomputeSnapPoints(selected);

      // If dense grid triggers FPS risk, present the safeguard modal
      if (cacheResult.fpsRisk && typeof document !== 'undefined') {
        ContextualGridModal.show({
          totalPoints: cacheResult.points.length,
          computationTimeMs: cacheResult.computationTimeMs,
          onContinueVisualOnly: () => {
            ContextualVectorGridService.enableVisualOnlyReference();
            ctx.render?.();
          },
          onUndo: () => {
            for (const el of selected) {
              ContextualVectorGridService.convertToOrdinaryVector(el);
            }
            ContextualVectorGridService.clearCache();
            ctx.layoutMgr?.vectorExplorerPanel?.update();
            ctx.render?.();
            ctx.syncToHost?.();
          },
        });
      }

      ctx.layoutMgr?.vectorExplorerPanel?.update();
      ctx.render?.();
      ctx.syncToHost?.();
      return { success: true, value: cacheResult };
    },
  });

  registry.register({
    id: 'vector.unconvertContextualGrid',
    label: 'Desconvertir Grilla a Vectores Ordinarios',
    category: 'object',
    isEnabled: (ctx: CommandContext) => (ctx.selectionTool?.selectedElementIds?.size || 0) > 0,
    execute: (ctx: CommandContext) => {
      if (!ctx.model || !ctx.selectionTool) return { success: false, error: 'Contexto no disponible' };
      const selected = ctx.model.elements.filter((el: VectorElement) => ctx.selectionTool.isSelected(el.id));
      if (selected.length === 0) return { success: false, error: 'Ningún elemento seleccionado' };

      ctx.pushUndo?.();
      for (const el of selected) {
        ContextualVectorGridService.convertToOrdinaryVector(el);
      }
      ContextualVectorGridService.clearCache();
      ctx.layoutMgr?.vectorExplorerPanel?.update();
      ctx.render?.();
      ctx.syncToHost?.();
      return { success: true, value: { count: selected.length } };
    },
  });

  registry.register({
    id: 'guide.convertToVector',
    label: 'Convertir Guía a Vector Ordinario',
    category: 'object',
    execute: (ctx: CommandContext) => {
      if (!ctx.model || !ctx.canvasMgr) return { success: false, error: 'Contexto no disponible' };
      const guidesToConvert = ctx.canvasMgr.getSelectedGuides();
      if (guidesToConvert.length === 0 && ctx.canvasMgr.selectedGuideId) {
        const single = ctx.canvasMgr.getGuide(ctx.canvasMgr.selectedGuideId);
        if (single) guidesToConvert.push(single);
      }
      if (guidesToConvert.length === 0) return { success: false, error: 'Ninguna guía seleccionada' };

      const vb = ctx.model.getViewBoxBounds();
      ctx.pushUndo?.();

      const newIds: string[] = [];
      for (const guide of guidesToConvert) {
        const vec = ContextElementService.convertGuideToVector(guide, {
          x: vb.minX,
          y: vb.minY,
          width: vb.width,
          height: vb.height,
        });
        if (vec) {
          ctx.canvasMgr.removeGuide(guide.id);
          ctx.model.addElement(vec);
          newIds.push(vec.id);
        }
      }

      if (newIds.length > 0 && ctx.selectionTool) {
        ctx.selectionTool.deselectAll();
        for (const id of newIds) {
          ctx.selectionTool.select(id);
        }
      }

      ctx.layoutMgr?.vectorExplorerPanel?.update();
      ctx.render?.();
      ctx.renderOverlay?.();
      ctx.syncToHost?.();
      return { success: true, value: { convertedCount: newIds.length } };
    },
  });

  registry.register({
    id: 'guide.toggleLock',
    label: 'Bloquear Guías',
    category: 'view',
    shortcut: 'Ctrl+Alt+;',
    execute: (ctx: CommandContext) => {
      if (!ctx.canvasMgr) return { success: false, error: 'CanvasManager no disponible' };
      ctx.canvasMgr.lockGuides = !ctx.canvasMgr.lockGuides;
      if (ctx.canvasMgr.lockGuides) {
        ctx.canvasMgr.clearSelectedGuides();
        if (ctx.selectionTool && ctx.model) {
          const selected = ctx.model.elements.filter((el: VectorElement) => ctx.selectionTool.isSelected(el.id));
          for (const el of selected) {
            if (ContextElementService.isContextElement(el)) {
              ctx.selectionTool.deselect(el.id);
            }
          }
        }
      }
      ctx.renderOverlay?.();
      ctx.render?.();
      ctx.syncToHost?.();
      return { success: true, value: { lockGuides: ctx.canvasMgr.lockGuides } };
    },
  });

  // --- TRAZO Y MODULACIÓN (SPINE CURVE) ---
  registry.register({
    id: 'stroke.applySketchModulation',
    label: 'Aplicar Modulación de Tinta (Boceto)',
    category: 'object',
    execute: (ctx: CommandContext) => {
      if (!ctx.model || !ctx.selectionTool) return { success: false, error: 'Contexto no disponible' };
      const selected = ctx.model.elements.filter((el: VectorElement) => ctx.selectionTool.isSelected(el.id));
      if (selected.length === 0) return { success: false, error: 'Ningún elemento seleccionado' };
      ctx.pushUndo?.();
      for (const el of selected) {
        SpineCurveService.applySketchModulation(el);
      }
      ctx.render?.();
      ctx.syncToHost?.();
      return { success: true, value: { affectedCount: selected.length } };
    },
  });

  registry.register({
    id: 'stroke.applyTaperedProfile',
    label: 'Aplicar Perfil Ahusado',
    category: 'object',
    execute: (ctx: CommandContext) => {
      if (!ctx.model || !ctx.selectionTool) return { success: false, error: 'Contexto no disponible' };
      const selected = ctx.model.elements.filter((el: VectorElement) => ctx.selectionTool.isSelected(el.id));
      if (selected.length === 0) return { success: false, error: 'Ningún elemento seleccionado' };
      ctx.pushUndo?.();
      for (const el of selected) {
        SpineCurveService.applyTaperedProfile(el);
      }
      ctx.render?.();
      ctx.syncToHost?.();
      return { success: true, value: { affectedCount: selected.length } };
    },
  });

  registry.register({
    id: 'stroke.resetWidthProfile',
    label: 'Restablecer Perfil a Uniforme',
    category: 'object',
    execute: (ctx: CommandContext) => {
      if (!ctx.model || !ctx.selectionTool) return { success: false, error: 'Contexto no disponible' };
      const selected = ctx.model.elements.filter((el: VectorElement) => ctx.selectionTool.isSelected(el.id));
      if (selected.length === 0) return { success: false, error: 'Ningún elemento seleccionado' };
      ctx.pushUndo?.();
      for (const el of selected) {
        SpineCurveService.setWidthProfile(el, null);
      }
      ctx.render?.();
      ctx.syncToHost?.();
      return { success: true, value: { affectedCount: selected.length } };
    },
  });

  // --- FUSIÓN PARAMÉTRICA (BLEND TOOL - MDWiki 8.8) ---
  registry.register({
    id: 'blend.create',
    label: 'Crear Fusión Paramétrica (Blend)',
    category: 'object',
    shortcut: 'Ctrl+Alt+B',
    execute: (ctx: CommandContext) => {
      if (!ctx.model || !ctx.selectionTool) return { success: false, error: 'Contexto no disponible' };
      const selected = ctx.model.elements.filter((el: VectorElement) => ctx.selectionTool.isSelected(el.id));
      if (selected.length !== 2) return { success: false, error: 'Se requieren exactamente 2 figuras seleccionadas para fusionar' };

      ctx.pushUndo?.();
      const blendGroup = BlendEngine.createBlendGroup(selected[0], selected[1]);
      const idxA = ctx.model.elements.findIndex((e: VectorElement) => e.id === selected[0].id);
      const idxB = ctx.model.elements.findIndex((e: VectorElement) => e.id === selected[1].id);
      const minIdx = Math.max(0, Math.min(idxA, idxB));

      ctx.model.elements = ctx.model.elements.filter((e: VectorElement) => e.id !== selected[0].id && e.id !== selected[1].id);
      ctx.model.elements.splice(minIdx, 0, blendGroup);

      ctx.selectionTool.deselectAll();
      ctx.selectionTool.select(blendGroup.id);
      ctx.render?.();
      ctx.syncToHost?.();
      return { success: true, value: { blendGroupId: blendGroup.id } };
    },
  });

  registry.register({
    id: 'blend.toggleReverseB',
    label: 'Invertir Sentido de Recorrido B (Anti-Twisting)',
    category: 'object',
    execute: (ctx: CommandContext) => {
      if (!ctx.model || !ctx.selectionTool) return { success: false, error: 'Contexto no disponible' };
      const selected = ctx.model.elements.filter((el: VectorElement) => ctx.selectionTool.isSelected(el.id));
      const blend = selected.find((el: VectorElement) => BlendEngine.isBlendGroup(el));
      if (!blend) return { success: false, error: 'Ningún grupo de fusión seleccionado' };

      ctx.pushUndo?.();
      BlendEngine.toggleReverseDirectionB(blend);
      ctx.render?.();
      ctx.syncToHost?.();
      return { success: true };
    },
  });

  registry.register({
    id: 'blend.expand',
    label: 'Expandir Fusión a Vectores Independientes',
    category: 'object',
    execute: (ctx: CommandContext) => {
      if (!ctx.model || !ctx.selectionTool) return { success: false, error: 'Contexto no disponible' };
      const selected = ctx.model.elements.filter((el: VectorElement) => ctx.selectionTool.isSelected(el.id));
      const blend = selected.find((el: VectorElement) => BlendEngine.isBlendGroup(el));
      if (!blend) return { success: false, error: 'Ningún grupo de fusión seleccionado' };

      ctx.pushUndo?.();
      const expanded = BlendEngine.expandBlendGroup(blend);
      const idx = ctx.model.elements.findIndex((e: VectorElement) => e.id === blend.id);
      if (idx >= 0) {
        ctx.model.elements.splice(idx, 1, ...expanded);
        ctx.selectionTool.deselectAll();
        expanded.forEach((e: VectorElement) => ctx.selectionTool.select(e.id));
      }
      ctx.render?.();
      ctx.syncToHost?.();
      return { success: true, value: { expandedCount: expanded.length } };
    },
  });

  // --- DEFORMACIÓN ENVOLVENTE (WARP ARC) ---
  registry.register<WarpArcOptions>({
    id: 'warp.applyArc',
    label: 'Aplicar Distorsión en Arco (Warp Arc)',
    category: 'object',
    isEnabled: (ctx: CommandContext) => (ctx.selectionTool?.selectedElementIds?.size || 0) > 0,
    execute: (ctx: CommandContext, params) => {
      if (!ctx.model || !ctx.selectionTool) return { success: false, error: 'Contexto no disponible' };
      if (!params || typeof params.bend !== 'number') {
        return { success: false, error: 'Parámetro de curvatura bend requerido' };
      }

      const selected = ctx.model.elements.filter((el: VectorElement) => ctx.selectionTool.isSelected(el.id));
      if (selected.length === 0) return { success: false, error: 'Ningún elemento seleccionado' };

      ctx.pushUndo?.();

      // Convert any rigid parametric primitives to curves before warping
      selected.forEach((el: VectorElement) => {
        if (ctx.model.isParametricElement(el)) {
          ctx.model.convertToCurves(el);
        }
      });

      const groupBox = BoundingBoxCalculator.getGroupBoundingBox(selected);
      if (!groupBox) return { success: false, error: 'No se pudo calcular bounding box' };

      selected.forEach((el: VectorElement) => {
        WarpEngine.warpElement(el, params, groupBox);
      });

      ctx.render?.();
      ctx.syncToHost?.();
      return { success: true, value: { warpedCount: selected.length } };
    },
  });

  registry.register({
    id: 'warp.reset',
    label: 'Restaurar Curvatura de Arco Original',
    category: 'object',
    isEnabled: (ctx: CommandContext) => {
      if (!ctx.model || !ctx.selectionTool) return false;
      const selected = ctx.model.elements.filter((el: VectorElement) => ctx.selectionTool.isSelected(el.id));
      return selected.some((el: VectorElement) => !!el.attributes['data-warp-base']);
    },
    execute: (ctx: CommandContext) => {
      if (!ctx.model || !ctx.selectionTool) return { success: false, error: 'Contexto no disponible' };
      const selected = ctx.model.elements.filter((el: VectorElement) => ctx.selectionTool.isSelected(el.id));
      const warped = selected.filter((el: VectorElement) => !!el.attributes['data-warp-base']);
      if (warped.length === 0) return { success: false, error: 'Ningún elemento deformado con arco' };

      ctx.pushUndo?.();
      warped.forEach((el: VectorElement) => {
        WarpEngine.resetWarp(el);
      });

      ctx.render?.();
      ctx.syncToHost?.();
      return { success: true, value: { resetCount: warped.length } };
    },
  });
}

