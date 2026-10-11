/**
 * CAPA L3: Comandos de Operaciones Booleanas y Pathfinder (BooleanCommands)
 * VectorCraft Architecture Alignment (04-Geometria-Bezier-y-Operaciones-Booleanas)
 *
 * Formaliza la suite completa de operaciones constructivas de área (Pathfinder):
 * - boolean.union: Combina figuras solapadas en un único contorno externo.
 * - boolean.subtract: Sustrae las figuras cortadoras del objeto base inferior.
 * - boolean.intersect: Conserva únicamente las zonas coincidentes.
 * - boolean.exclude: Elimina zonas solapadas conservando áreas exteriores (XOR).
 * - boolean.combine: Agrupa contornos en un trazado compuesto con fill-rule evenodd.
 * - boolean.fragment: Divide y extrae todos los fragmentos independientes.
 */

import { CommandRegistry, CommandContext, ExecutionResult } from './CommandRegistry.js';
import { BooleanOperationType } from '../engine/boolean/BooleanPreflightService.js';

export function registerBooleanCommands(registry: CommandRegistry): void {
  const registerOp = (
    id: string,
    label: string,
    op: BooleanOperationType,
    shortcut?: string
  ) => {
    registry.register({
      id,
      label,
      category: 'object',
      shortcut,
      isEnabled: (ctx: CommandContext) => (ctx.selectionTool?.selectedElementIds?.size || 0) >= 2,
      execute: (ctx: CommandContext): ExecutionResult => {
        if (ctx.actionDispatcher?.executeBoolean) {
          ctx.actionDispatcher.executeBoolean(op);
          return { success: true, undoable: true };
        }
        return { success: false, error: 'Manejador executeBoolean no disponible' };
      },
    });
  };

  registerOp('boolean.union', 'Unir (Soldar Formas)', 'union');
  registerOp('boolean.subtract', 'Menos Frente (Sustraer)', 'subtract');
  registerOp('boolean.intersect', 'Formar Intersección', 'intersect');
  registerOp('boolean.exclude', 'Excluir (XOR)', 'exclude');
  registerOp('boolean.combine', 'Combinar Contornos (Compound Path)', 'combine');
  registerOp('boolean.fragment', 'Dividir (Fragmentar Intersecciones)', 'fragment');

  // Alias retrocompatible para despacho dinámico por parámetro
  registry.register<{ op: BooleanOperationType }>({
    id: 'boolean.op',
    label: 'Operación Booleana Genérica',
    category: 'object',
    isEnabled: (ctx: CommandContext) => (ctx.selectionTool?.selectedElementIds?.size || 0) >= 2,
    execute: (ctx: CommandContext, params): ExecutionResult => {
      if (!params || !params.op) {
        return { success: false, error: 'Parámetro de operación booleana no provisto' };
      }
      if (ctx.actionDispatcher?.executeBoolean) {
        ctx.actionDispatcher.executeBoolean(params.op);
        return { success: true, undoable: true };
      }
      return { success: false, error: 'Manejador executeBoolean no disponible' };
    },
  });
}
