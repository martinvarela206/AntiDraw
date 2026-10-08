/**
 * CAPA L3: Registro y Bus Central de Comandos (CommandRegistry)
 * Inspirado en vectorcraft_engine::cmd::registry.
 *
 * Desacopla la invocación de acciones de la interfaz gráfica y los atajos
 * de teclado. Proporciona validación determinista de precondiciones (`isEnabled`),
 * aislamiento de fallos con `CrashGuard` y trazabilidad centralizada.
 */

import { CrashGuard } from '../guard/CrashGuard.js';
import { CommandSpec, CommandContext, ExecutionResult } from './CommandSpec.js';

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

  /**
   * Configura o actualiza el contexto de ejecución por defecto compartido.
   */
  public setContext(ctx: CommandContext): void {
    this.defaultContext = ctx;
  }

  /**
   * Obtiene el contexto actual registrado.
   */
  public getContext(): CommandContext | null {
    return this.defaultContext;
  }

  /**
   * Registra una especificación de comando en el bus universal.
   */
  public register<TParams = any, TResult = any>(spec: CommandSpec<TParams, TResult>): void {
    if (this.commands.has(spec.id)) {
      console.warn(`[AntiDraw CommandRegistry] Sobrescribiendo comando registrado previamente: ${spec.id}`);
    }
    this.commands.set(spec.id, spec as CommandSpec);
  }

  /**
   * Desregistra un comando por su identificador único.
   */
  public unregister(id: string): boolean {
    return this.commands.delete(id);
  }

  /**
   * Obtiene la especificación de un comando si está registrado.
   */
  public get(id: string): CommandSpec | undefined {
    return this.commands.get(id);
  }

  /**
   * Verifica si existe un comando registrado con el ID especificado.
   */
  public has(id: string): boolean {
    return this.commands.has(id);
  }

  /**
   * Retorna una lista con todos los comandos registrados en el sistema.
   */
  public getAll(): CommandSpec[] {
    return Array.from(this.commands.values());
  }

  /**
   * Retorna todos los comandos agrupados por una categoría específica.
   */
  public getByCategory(category: string): CommandSpec[] {
    return this.getAll().filter((c) => c.category === category);
  }

  /**
   * Determina si el comando especificado puede ejecutarse en el estado actual.
   */
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

  /**
   * Ejecuta el comando especificado dentro de la barrera de contención CrashGuard.
   */
  public execute<TParams = any, TResult = any>(
    id: string,
    params?: TParams,
    contextOverride?: Partial<CommandContext>
  ): ExecutionResult<TResult> {
    const spec = this.get(id);
    if (!spec) {
      return {
        success: false,
        error: `Comando desconocido o no registrado: '${id}'`,
      };
    }

    const ctx = this.resolveContext(contextOverride);
    if (!ctx) {
      return {
        success: false,
        error: `Contexto no disponible para ejecutar el comando: '${id}'`,
      };
    }

    if (spec.isEnabled && !spec.isEnabled(ctx, params)) {
      return {
        success: false,
        error: `El comando '${id}' no está habilitado en el estado actual`,
      };
    }

    const execResult = CrashGuard.runSafe<ExecutionResult<TResult>>(
      `CommandRegistry.execute(${id})`,
      () => spec.execute(ctx, params),
      (err) => {
        console.error(`[AntiDraw CommandRegistry] Fallo al ejecutar comando '${id}':`, err);
      }
    );

    if (!execResult) {
      return {
        success: false,
        error: `Excepción no controlada durante la ejecución de '${id}'`,
      };
    }

    this.notifyExecution(id, execResult);
    return execResult;
  }

  /**
   * Suscribe un listener a todas las ejecuciones de comandos.
   * Retorna una función para cancelar la suscripción.
   */
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
        console.error(`[AntiDraw CommandRegistry] Error en listener de ejecución para '${id}':`, err);
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
