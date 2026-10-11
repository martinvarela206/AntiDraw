/**
 * CAPA L3: Registro y Bus Central de Comandos (CommandRegistry)
 * VectorCraft Architecture Alignment (03-Motor-de-Comandos-y-Herramientas)
 *
 * Implements the "Everything is a Command" paradigm:
 * 1. Unified central dispatch for tools, menus, shortcuts, and automated actions.
 * 2. Deterministic preconditions evaluation (isEnabled).
 * 3. Atomic batch transactions (command.batch) producing a single undo step.
 * 4. Fault isolation via CrashGuard barrier.
 */

import { CrashGuard } from '../engine/guard/CrashGuard.js';

export interface CommandContext {
  model: any;
  selectionTool?: any;
  canvasMgr?: any;
  actionDispatcher?: any;
  historyService?: any;
  viewportCtrl?: any;
  propertyPanel?: any;
  toolbar?: any;
  undo?: () => void;
  redo?: () => void;
  pushUndo?: () => void;
  render?: () => void;
  syncToHost?: () => void;
  syncMetadataToHost?: () => void;
  [key: string]: any;
}

export interface ExecutionResult<T = any> {
  success: boolean;
  value?: T;
  error?: string;
  undoable?: boolean;
}

export interface CommandSpec<TParams = any, TResult = any> {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly category?: 'edit' | 'object' | 'view' | 'layer' | 'shape' | 'path' | 'node' | 'transform';
  readonly shortcut?: string;
  readonly isEnabled?: (ctx: CommandContext, params?: TParams) => boolean;
  readonly execute: (ctx: CommandContext, params?: TParams) => ExecutionResult<TResult>;
}

export type CommandExecutionListener = (commandId: string, result: ExecutionResult) => void;

export class CommandRegistry {
  private static instance: CommandRegistry | null = null;
  private readonly commands = new Map<string, CommandSpec>();
  private defaultContext: CommandContext | null = null;
  private readonly executionListeners: CommandExecutionListener[] = [];

  public static getInstance(): CommandRegistry {
    if (!CommandRegistry.instance) {
      CommandRegistry.instance = new CommandRegistry();
    }
    return CommandRegistry.instance;
  }

  public setContext(ctx: CommandContext): void {
    this.defaultContext = ctx;
  }

  public getContext(): CommandContext | null {
    return this.defaultContext;
  }

  public register<TParams = any, TResult = any>(spec: CommandSpec<TParams, TResult>): void {
    if (this.commands.has(spec.id)) {
      console.warn(`[AntiDraw CommandRegistry] Sobrescribiendo comando: ${spec.id}`);
    }
    this.commands.set(spec.id, spec as CommandSpec);
  }

  public unregister(id: string): boolean {
    return this.commands.delete(id);
  }

  public get(id: string): CommandSpec | undefined {
    return this.commands.get(id);
  }

  public has(id: string): boolean {
    return this.commands.has(id);
  }

  public getAll(): CommandSpec[] {
    return Array.from(this.commands.values());
  }

  public getByCategory(category: string): CommandSpec[] {
    return this.getAll().filter((c) => c.category === category);
  }

  public isEnabled(id: string, params?: any, contextOverride?: Partial<CommandContext>): boolean {
    const spec = this.get(id);
    if (!spec) return false;

    const ctx = this.resolveContext(contextOverride);
    if (!ctx) return false;

    if (spec.isEnabled) {
      try {
        return spec.isEnabled(ctx, params);
      } catch (err) {
        console.error(`[AntiDraw CommandRegistry] Error evaluando isEnabled en '${id}':`, err);
        return false;
      }
    }

    return true;
  }

  public execute<TParams = any, TResult = any>(
    id: string,
    params?: TParams,
    contextOverride?: Partial<CommandContext>
  ): ExecutionResult<TResult> {
    const spec = this.get(id);
    if (!spec) {
      return { success: false, error: `Comando no registrado: '${id}'` };
    }

    const ctx = this.resolveContext(contextOverride);
    if (!ctx) {
      return { success: false, error: `Contexto no disponible para comando: '${id}'` };
    }

    if (spec.isEnabled && !spec.isEnabled(ctx, params)) {
      return { success: false, error: `Comando '${id}' no habilitado en estado actual` };
    }

    const execResult = CrashGuard.runSafe<ExecutionResult<TResult>>(
      `CommandRegistry.execute(${id})`,
      () => spec.execute(ctx, params),
      (err) => {
        console.error(`[AntiDraw CommandRegistry] Fallo al ejecutar '${id}':`, err);
      }
    );

    if (!execResult) {
      return { success: false, error: `Excepción no controlada durante '${id}'` };
    }

    this.notifyExecution(id, execResult);
    return execResult;
  }

  /**
   * Ejecuta un lote atómico de comandos bajo una única unidad transaccional de deshacer.
   */
  public executeBatch(
    commands: Array<{ id: string; params?: any }>,
    contextOverride?: Partial<CommandContext>
  ): ExecutionResult<any[]> {
    if (!commands || commands.length === 0) {
      return { success: true, value: [] };
    }

    const ctx = this.resolveContext(contextOverride);
    if (!ctx) {
      return { success: false, error: 'Contexto no disponible para executeBatch' };
    }

    // Un único paso de deshacer para todo el lote
    if (typeof ctx.pushUndo === 'function') {
      ctx.pushUndo();
    }

    // Contexto temporal suprimiendo pushUndo individual durante el lote
    const batchCtx: CommandContext = {
      ...ctx,
      pushUndo: () => {}, // Suprimido para conservar atomicidad
      render: () => {},   // Postpuesto hasta completar el lote
      syncToHost: () => {}, // Postpuesto hasta completar el lote
    };

    const results: any[] = [];
    for (const item of commands) {
      const res = this.execute(item.id, item.params, batchCtx);
      if (!res.success) {
        return {
          success: false,
          error: `Error en batch en comando '${item.id}': ${res.error}`,
          value: results,
        };
      }
      results.push(res.value);
    }

    // Sincronización y render final tras la transacción atómica
    if (typeof ctx.render === 'function') ctx.render();
    if (typeof ctx.syncToHost === 'function') ctx.syncToHost();

    return { success: true, value: results };
  }

  public onExecuted(listener: CommandExecutionListener): () => void {
    this.executionListeners.push(listener);
    return () => {
      const idx = this.executionListeners.indexOf(listener);
      if (idx >= 0) this.executionListeners.splice(idx, 1);
    };
  }

  private notifyExecution(id: string, result: ExecutionResult): void {
    for (const listener of this.executionListeners) {
      try {
        listener(id, result);
      } catch (err) {
        console.error(`[AntiDraw CommandRegistry] Error en listener para '${id}':`, err);
      }
    }
  }

  private resolveContext(override?: Partial<CommandContext>): CommandContext | null {
    if (!this.defaultContext && !override) return null;
    return {
      ...(this.defaultContext || ({} as CommandContext)),
      ...(override || {}),
    };
  }
}
