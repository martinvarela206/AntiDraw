/**
 * CAPA L3: Motor de Sesión y Guardas (CrashGuard)
 * Inspirado en vectorcraft_engine::guard::catch_panic.
 *
 * Envoltorio de contención que captura cualquier excepción inesperada en el ciclo
 * de interacción o ejecución de comandos, ejecuta el rollback correspondiente
 * y notifica al usuario sin permitir que la sesión del Webview se rompa o se congele.
 * 
 * Inversión de dependencias: Desacoplado de VsCodeBridge (L4) mediante el puerto INotifier.
 */

import { INotifier } from './INotifier.js';

export type FallbackCallback = (error: unknown) => void;

export class CrashGuard {
  private static defaultNotifier: INotifier | null = null;

  constructor(private readonly notifier: INotifier | null = null) {}

  /**
   * Configura el notificador global por defecto (ej. conectado en CoreServiceRegistry).
   */
  public static setNotifier(notifier: INotifier | null): void {
    CrashGuard.defaultNotifier = notifier;
  }

  public static getNotifier(): INotifier | null {
    return CrashGuard.defaultNotifier;
  }

  /**
   * Ejecuta una acción síncrona dentro de una barrera de protección de instancia.
   */
  public runSafe<T>(
    actionName: string,
    task: () => T,
    fallback?: FallbackCallback
  ): T | null {
    try {
      return task();
    } catch (error) {
      this.handleException(actionName, error, fallback);
      return null;
    }
  }

  /**
   * Ejecuta una acción asíncrona dentro de una barrera de protección de instancia.
   */
  public async runSafeAsync<T>(
    actionName: string,
    task: () => Promise<T>,
    fallback?: FallbackCallback
  ): Promise<T | null> {
    try {
      return await task();
    } catch (error) {
      this.handleException(actionName, error, fallback);
      return null;
    }
  }

  /**
   * Ejecuta una acción síncrona dentro de una barrera estática.
   */
  public static runSafe<T>(
    actionName: string,
    task: () => T,
    fallback?: FallbackCallback
  ): T | null {
    try {
      return task();
    } catch (error) {
      CrashGuard.handleStaticException(actionName, error, fallback);
      return null;
    }
  }

  /**
   * Ejecuta una acción asíncrona dentro de una barrera estática.
   */
  public static async runSafeAsync<T>(
    actionName: string,
    task: () => Promise<T>,
    fallback?: FallbackCallback
  ): Promise<T | null> {
    try {
      return await task();
    } catch (error) {
      CrashGuard.handleStaticException(actionName, error, fallback);
      return null;
    }
  }

  private handleException(
    actionName: string,
    error: unknown,
    fallback?: FallbackCallback
  ): void {
    CrashGuard.dispatchException(
      actionName,
      error,
      fallback,
      this.notifier || CrashGuard.defaultNotifier
    );
  }

  private static handleStaticException(
    actionName: string,
    error: unknown,
    fallback?: FallbackCallback
  ): void {
    CrashGuard.dispatchException(actionName, error, fallback, CrashGuard.defaultNotifier);
  }

  private static dispatchException(
    actionName: string,
    error: unknown,
    fallback?: FallbackCallback,
    notifier?: INotifier | null
  ): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[AntiDraw CrashGuard] Error controlado en '${actionName}':`, error);

    try {
      if (fallback) {
        fallback(error);
      }
    } catch (fallbackError) {
      console.error(
        `[AntiDraw CrashGuard] El callback de recuperación en '${actionName}' también falló:`,
        fallbackError
      );
    }

    try {
      if (notifier) {
        notifier.showInfo(
          `AntiDraw contuvo un error en '${actionName}': ${errorMsg}. Tu trabajo no se ha perdido.`
        );
      }
    } catch {
      // Ignorar fallo si el notificador falla
    }
  }
}
