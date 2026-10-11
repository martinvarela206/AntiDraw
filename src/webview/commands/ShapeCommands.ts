/**
 * ARCHITECTURAL RATIONALE: Parametric Shape Commands (ShapeCommands - L3)
 * VectorCraft Architecture Alignment & Pure SVG Primitive Preservation (FEAT-01/FEAT-02)
 *
 * Invariant:
 * Pure SVG primitives (<rect>, <circle>, <ellipse>, <line>, <polygon>, <polyline>)
 * MUST NEVER be downgraded or converted to <path> by any parametric shape command.
 * Their native tags, geometry attributes, and companion metadata are strictly preserved.
 */

import { CommandRegistry, CommandContext, ExecutionResult } from './CommandRegistry.js';
import { VectorElement } from '../engine/VectorModel.js';

export interface CreateShapeParams {
  element: VectorElement;
  select?: boolean;
}

export interface UpdateParametricParams {
  elementId: string;
  attributes?: Record<string, string>;
  cornerRadius?: number;
  syncVertices?: boolean;
}

export function registerShapeCommands(registry: CommandRegistry): void {
  /**
   * shape.create: Inserta una primitiva SVG pura en el modelo documental.
   */
  registry.register<CreateShapeParams>({
    id: 'shape.create',
    label: 'Crear Primitiva Geométrica',
    category: 'shape',
    isEnabled: (ctx: CommandContext) => !!ctx.model,
    execute: (ctx: CommandContext, params?: CreateShapeParams): ExecutionResult => {
      if (!params || !params.element) {
        return { success: false, error: 'Elemento geométrico no provisto' };
      }
      const el = params.element;

      if (typeof ctx.pushUndo === 'function') ctx.pushUndo();
      ctx.model.elements.push(el);

      if (params.select !== false && ctx.selectionTool) {
        ctx.selectionTool.select(el.id);
      }

      if (typeof ctx.render === 'function') ctx.render();
      if (typeof ctx.syncToHost === 'function') ctx.syncToHost();

      return { success: true, value: el, undoable: true };
    },
  });

  /**
   * shape.updateParametric: Modifica atributos de una forma paramétrica conservando
   * estrictamente su etiqueta nativa SVG (<rect>, <circle>, <ellipse>, etc.).
   */
  registry.register<UpdateParametricParams>({
    id: 'shape.updateParametric',
    label: 'Actualizar Forma Paramétrica',
    category: 'shape',
    isEnabled: (ctx: CommandContext, params?: UpdateParametricParams) => {
      if (!ctx.model || !params?.elementId) return false;
      const el = ctx.model.elements.find((e: VectorElement) => e.id === params.elementId);
      return !!el && ctx.model.isParametricElement(el);
    },
    execute: (ctx: CommandContext, params?: UpdateParametricParams): ExecutionResult => {
      if (!params || !params.elementId) {
        return { success: false, error: 'ID de elemento no especificado' };
      }
      const el = ctx.model.elements.find((e: VectorElement) => e.id === params.elementId);
      if (!el) {
        return { success: false, error: `Elemento '${params.elementId}' no encontrado` };
      }

      if (typeof ctx.pushUndo === 'function') ctx.pushUndo();

      // Aplicar nuevos atributos asegurando conservación de pureza
      if (params.attributes) {
        Object.assign(el.attributes, params.attributes);
      }

      if (params.cornerRadius !== undefined && ctx.model.isRect(el)) {
        el.attributes['rx'] = params.cornerRadius.toString();
        if (el.attributes['ry']) delete el.attributes['ry'];
      }

      // Re-sincronizar vértices manteniendo tag nativo intacto
      if (params.syncVertices !== false) {
        const newVerts = ctx.model.convertShapeToVertices(el.shapeType || el.tagName, el.attributes);
        if (newVerts && newVerts.length > 0) {
          el.vertices = newVerts;
          el.attributes.d = ctx.model.compilePathD(newVerts, ctx.model.isElementClosed(el));
        }
      }

      ctx.model.syncParametricAttributes(el);

      if (typeof ctx.render === 'function') ctx.render();
      if (typeof ctx.syncToHost === 'function') ctx.syncToHost();

      return { success: true, value: el, undoable: true };
    },
  });

  /**
   * shape.setCornerRadius: Actualiza curvatura de esquinas de un <rect> preservando su tag nativo.
   */
  registry.register<{ elementId: string; radius: number }>({
    id: 'shape.setCornerRadius',
    label: 'Ajustar Radio de Esquinas',
    category: 'shape',
    isEnabled: (ctx: CommandContext, params) => {
      if (!ctx.model || !params?.elementId) return false;
      const el = ctx.model.elements.find((e: VectorElement) => e.id === params.elementId);
      return !!el && ctx.model.isRect(el);
    },
    execute: (ctx: CommandContext, params): ExecutionResult => {
      if (!params || !params.elementId || params.radius === undefined) {
        return { success: false, error: 'Parámetros de radio no válidos' };
      }
      return registry.execute('shape.updateParametric', {
        elementId: params.elementId,
        cornerRadius: Math.max(0, params.radius),
      });
    },
  });
}
