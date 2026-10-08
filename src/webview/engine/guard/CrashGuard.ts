/**
 * CAPA L3: Motor de Sesión y Guardas (CrashGuard)
 * Inspirado en vectorcraft_engine::guard::catch_panic.
 *
 * Envoltorio de contención que captura cualquier excepción inesperada en el ciclo
 * de interacción o ejecución de comandos, ejecuta el rollback correspondiente
 * y notifica al usuario sin permitir que la sesión del Webview se rompa o se congele.
 */

import { VsCodeBridge } from '../../bridge/VsCodeBridge.js';

export type FallbackCallback = (error: unknown) => void;

export class CrashGuard {
  /**
   * Ejecuta una acción síncrona dentro de una barrera de protección.
   * Si la tarea lanza una excepción, se ejecuta el rollback, se notifica el fallo
   * y se retorna null sin propagar el crash al runtime de la ventana.
   */
  public static runSafe<T>(
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
   * Ejecuta una acción asíncrona dentro de una barrera de protección.
   */
  public static async runSafeAsync<T>(
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
   * Procesa de forma centralizada la excepción capturada.
   */
  private static handleException(
    actionName: string,
    error: unknown,
    fallback?: FallbackCallback
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
      VsCodeBridge.getInstance().showInfo(
        `AntiDraw contuvo un error en '${actionName}': ${errorMsg}. Tu trabajo no se ha perdido.`
      );
    } catch {
      // Ignorar fallo de notificación si el puente no está inicializado
    }
  }
}
