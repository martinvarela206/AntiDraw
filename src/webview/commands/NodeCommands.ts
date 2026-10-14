/**
 * ARCHITECTURAL RATIONALE: Node & Vertex Editing Commands (NodeCommands - L3)
 * VectorCraft Architecture Alignment (Everything is a Command)
 */

import { CommandRegistry, CommandContext, ExecutionResult } from './CommandRegistry.js';

export function registerNodeCommands(registry: CommandRegistry): void {
  /**
   * node.delete: Elimina el vértice o ancla Bézier seleccionado actualmente.
   */
  registry.register({
    id: 'node.delete',
    label: 'Eliminar Nodo',
    category: 'node',
    shortcut: 'Delete',
    isEnabled: (ctx: CommandContext) => {
      return (
        ctx.toolbar?.activeTool === 'node' &&
        !!ctx.nodeEditorTool?.selectedVertexId &&
        typeof ctx.nodeToolHandler?.deleteSelectedVertex === 'function'
      );
    },
    execute: (ctx: CommandContext): ExecutionResult => {
      if (ctx.nodeToolHandler?.deleteSelectedVertex) {
        const deleted = ctx.nodeToolHandler.deleteSelectedVertex();
        if (deleted) {
          ctx.propertyPanel?.update(null, 'node');
          return { success: true, undoable: true };
        }
      }
      return { success: false, error: 'No se pudo eliminar el nodo' };
    },
  });

  /**
   * node.setType: Modifica el tipo de nodo Bézier (sharp, smooth, symmetric, asymmetric).
   */
  registry.register<{ type: 'sharp' | 'asymmetric' | 'smooth' | 'symmetric' }>({
    id: 'node.setType',
    label: 'Cambiar Tipo de Nodo',
    category: 'node',
    isEnabled: (ctx: CommandContext) => {
      return (
        ctx.toolbar?.activeTool === 'node' &&
        !!ctx.nodeEditorTool?.selectedVertexId &&
        typeof ctx.nodeToolHandler?.setNodeType === 'function'
      );
    },
    execute: (ctx: CommandContext, params): ExecutionResult => {
      if (!params || !params.type) {
        return { success: false, error: 'Tipo de nodo no especificado' };
      }
      if (ctx.nodeToolHandler?.setNodeType) {
        ctx.nodeToolHandler.setNodeType(params.type);
        ctx.propertyPanel?.update(null, 'node');
        return { success: true, undoable: true };
      }
      return { success: false, error: 'Manejador de setNodeType no disponible' };
    },
  });

  /**
   * node.join: Une y suelda vértices seleccionados coincidentes (Ctrl+J).
   */
  registry.register({
    id: 'node.join',
    label: 'Unir / Fusionar Nodos',
    category: 'node',
    shortcut: 'Ctrl+J',
    isEnabled: (ctx: CommandContext) => {
      return (
        ctx.toolbar?.activeTool === 'node' &&
        typeof ctx.nodeToolHandler?.handleJoinSelectedNodes === 'function'
      );
    },
    execute: (ctx: CommandContext): ExecutionResult => {
      if (ctx.nodeToolHandler?.handleJoinSelectedNodes) {
        const joined = ctx.nodeToolHandler.handleJoinSelectedNodes();
        if (joined) {
          ctx.propertyPanel?.update(null, 'node');
          return { success: true, undoable: true };
        }
      }
      return { success: false, error: 'No se pudieron unir los nodos' };
    },
  });
}
