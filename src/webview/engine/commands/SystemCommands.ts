/**
 * CAPA L3: Catálogo de Comandos del Sistema (SystemCommands)
 * Registra comandos estándar de edición, objetos y vista en el CommandRegistry.
 */

import { CommandRegistry, CommandSpec, CommandContext } from './CommandRegistry.js';
import { registerAllDomainCommands } from '../../commands/index.js';

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
    label: 'Agrupar (Combinar Contornos)',
    category: 'object',
    shortcut: 'Ctrl+G',
    isEnabled: (ctx: CommandContext) => (ctx.selectionTool?.selectedElementIds?.size || 0) >= 2,
    execute: (ctx: CommandContext) => {
      if (ctx.actionDispatcher?.executeBoolean) {
        ctx.actionDispatcher.executeBoolean('combine');
        return { success: true };
      }
      return { success: false, error: 'ActionDispatcher no disponible' };
    },
  });

  registry.register({
    id: 'object.ungroup',
    label: 'Desagrupar (Fragmentar Contornos)',
    category: 'object',
    shortcut: 'Ctrl+Shift+G',
    isEnabled: (ctx: CommandContext) => (ctx.selectionTool?.selectedElementIds?.size || 0) > 0,
    execute: (ctx: CommandContext) => {
      if (ctx.actionDispatcher?.executeBoolean) {
        ctx.actionDispatcher.executeBoolean('fragment');
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
}
