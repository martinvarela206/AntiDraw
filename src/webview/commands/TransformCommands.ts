/**
 * ARCHITECTURAL RATIONALE: Spatial & Hierarchy Transform Commands (TransformCommands - L3)
 * VectorCraft Architecture Alignment (Everything is a Command)
 */

import { CommandRegistry, CommandContext, ExecutionResult } from './CommandRegistry.js';

export function registerTransformCommands(registry: CommandRegistry): void {
  /**
   * transform.flip: Reflejo simétrico horizontal o vertical respecto al centro de selección.
   */
  registry.register<{ axis: 'horizontal' | 'vertical' }>({
    id: 'transform.flip',
    label: 'Reflejar Eje',
    category: 'transform',
    isEnabled: (ctx: CommandContext) => (ctx.selectionTool?.selectedElementIds?.size || 0) > 0,
    execute: (ctx: CommandContext, params): ExecutionResult => {
      if (!params || !params.axis) {
        return { success: false, error: 'Eje de reflejo no especificado' };
      }
      if (ctx.actionDispatcher?.flip) {
        ctx.actionDispatcher.flip(params.axis);
        return { success: true, undoable: true };
      }
      return { success: false, error: 'Manejador de flip no disponible' };
    },
  });

  /**
   * transform.align: Alineación espacial respecto a la caja contenedora colectiva o lienzo.
   */
  registry.register<{ type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' }>({
    id: 'transform.align',
    label: 'Alinear Elementos',
    category: 'transform',
    isEnabled: (ctx: CommandContext) => (ctx.selectionTool?.selectedElementIds?.size || 0) > 0,
    execute: (ctx: CommandContext, params): ExecutionResult => {
      if (!params || !params.type) {
        return { success: false, error: 'Tipo de alineación no especificado' };
      }
      if (ctx.actionDispatcher?.align) {
        ctx.actionDispatcher.align(params.type);
        return { success: true, undoable: true };
      }
      return { success: false, error: 'Manejador de align no disponible' };
    },
  });

  /**
   * transform.reorderZ: Reordenamiento de capas en el DOM/árbol Z-order.
   */
  registry.register<{ action: 'front' | 'forward' | 'backward' | 'back' }>({
    id: 'transform.reorderZ',
    label: 'Reordenar Capa',
    category: 'layer',
    isEnabled: (ctx: CommandContext) => (ctx.selectionTool?.selectedElementIds?.size || 0) > 0,
    execute: (ctx: CommandContext, params): ExecutionResult => {
      if (!params || !params.action) {
        return { success: false, error: 'Acción de reordenamiento no especificada' };
      }
      if (typeof ctx.handleZOrder === 'function') {
        ctx.handleZOrder(params.action);
        return { success: true, undoable: true };
      }
      if (ctx.actionDispatcher?.reorderZ) {
        ctx.actionDispatcher.reorderZ(params.action);
        return { success: true, undoable: true };
      }
      return { success: false, error: 'Manejador de reorderZ no disponible' };
    },
  });

  /**
   * transform.boolean: Operación constructiva de geometría sólida (CSG).
   */
  registry.register<{ op: 'union' | 'subtract' | 'intersect' | 'exclude' | 'combine' | 'fragment' }>({
    id: 'transform.boolean',
    label: 'Operación Booleana',
    category: 'object',
    isEnabled: (ctx: CommandContext) => (ctx.selectionTool?.selectedElementIds?.size || 0) >= 2,
    execute: (ctx: CommandContext, params): ExecutionResult => {
      if (!params || !params.op) {
        return { success: false, error: 'Operación booleana no provista' };
      }
      if (ctx.actionDispatcher?.executeBoolean) {
        ctx.actionDispatcher.executeBoolean(params.op);
        return { success: true, undoable: true };
      }
      return { success: false, error: 'ActionDispatcher no disponible' };
    },
  });
}
