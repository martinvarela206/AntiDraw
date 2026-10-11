/**
 * ARCHITECTURAL RATIONALE: Explicit Path Commands (PathCommands - L3)
 * VectorCraft Architecture Alignment & Strict Primitive Boundary
 *
 * Invariant:
 * Only explicit path commands (such as path.convertToCurves) are permitted to convert
 * a pure parametric shape into a freeform <path d="..."> element.
 */

import { CommandRegistry, CommandContext, ExecutionResult } from './CommandRegistry.js';
import { VectorElement } from '../engine/VectorModel.js';

export interface CreatePathParams {
  element: VectorElement;
  select?: boolean;
}

export function registerPathCommands(registry: CommandRegistry): void {
  /**
   * path.create: Inserta un trazado libre Bézier o polilínea en el modelo.
   */
  registry.register<CreatePathParams>({
    id: 'path.create',
    label: 'Crear Trazado',
    category: 'path',
    isEnabled: (ctx: CommandContext) => !!ctx.model,
    execute: (ctx: CommandContext, params?: CreatePathParams): ExecutionResult => {
      if (!params || !params.element) {
        return { success: false, error: 'Elemento de trazado no provisto' };
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
   * path.convertToCurves: Conversión EXPLÍCITA y deliberada de primitivas SVG a <path> libre.
   */
  registry.register({
    id: 'path.convertToCurves',
    label: 'Convertir a Curvas',
    category: 'path',
    shortcut: 'Ctrl+Q',
    isEnabled: (ctx: CommandContext) => {
      if (!ctx.model || !ctx.selectionTool) return false;
      const selected = ctx.model.elements.filter((el: VectorElement) =>
        ctx.selectionTool.isSelected(el.id)
      );
      return selected.some((el: VectorElement) => ctx.model.isParametricElement(el));
    },
    execute: (ctx: CommandContext): ExecutionResult => {
      if (typeof ctx.handleConvertToCurves === 'function') {
        ctx.handleConvertToCurves();
        return { success: true, undoable: true };
      }
      if (ctx.actionDispatcher?.convertToCurves) {
        ctx.actionDispatcher.convertToCurves();
        return { success: true, undoable: true };
      }
      return { success: false, error: 'Manejador de convertToCurves no disponible' };
    },
  });

  /**
   * path.convertToPrimitives: Reconocimiento geométrico inverso de <path> a primitiva SVG pura.
   */
  registry.register({
    id: 'path.convertToPrimitives',
    label: 'Simplificar a Primitivas SVG',
    category: 'path',
    isEnabled: (ctx: CommandContext) => {
      if (!ctx.model || !ctx.selectionTool) return false;
      const selected = ctx.model.elements.filter((el: VectorElement) =>
        ctx.selectionTool.isSelected(el.id)
      );
      return selected.some(
        (el: VectorElement) =>
          !ctx.model.isParametricElement(el) &&
          el.tagName === 'path' &&
          ctx.model.detectPrimitiveFromPath(el) !== null
      );
    },
    execute: (ctx: CommandContext): ExecutionResult => {
      if (typeof ctx.handleConvertToPrimitives === 'function') {
        ctx.handleConvertToPrimitives();
        return { success: true, undoable: true };
      }
      if (ctx.actionDispatcher?.convertToPrimitives) {
        ctx.actionDispatcher.convertToPrimitives();
        return { success: true, undoable: true };
      }
      return { success: false, error: 'Manejador de convertToPrimitives no disponible' };
    },
  });

  /**
   * path.toggleClosed: Alterna entre trazado abierto y cerrado.
   */
  registry.register<{ elementId?: string }>({
    id: 'path.toggleClosed',
    label: 'Cerrar / Abrir Trazado',
    category: 'path',
    isEnabled: (ctx: CommandContext, params) => {
      if (!ctx.model) return false;
      const targetId = params?.elementId || Array.from(ctx.selectionTool?.selectedElementIds || [])[0];
      if (!targetId) return false;
      const el = ctx.model.elements.find((e: VectorElement) => e.id === targetId);
      return !!el && el.tagName === 'path';
    },
    execute: (ctx: CommandContext, params): ExecutionResult => {
      const targetId = params?.elementId || Array.from(ctx.selectionTool?.selectedElementIds || [])[0];
      const el = ctx.model.elements.find((e: VectorElement) => e.id === targetId);
      if (!el || !el.vertices) {
        return { success: false, error: 'Trazado no encontrado o sin vértices' };
      }

      if (typeof ctx.pushUndo === 'function') ctx.pushUndo();
      el.isClosed = !el.isClosed;
      el.attributes.d = ctx.model.compilePathD(el.vertices, el.isClosed);

      if (typeof ctx.render === 'function') ctx.render();
      if (typeof ctx.syncToHost === 'function') ctx.syncToHost();

      return { success: true, value: el, undoable: true };
    },
  });
}
