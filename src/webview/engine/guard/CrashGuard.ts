/**
 * CAPA L3: Motor de Sesión y Guardas (CrashGuard)
 * Inspirado en vectorcraft_engine::guard::catch_panic.
 *
 * Envoltorio de contención que captura cualquier excepción inesperada en el ciclo
 * de interacción o ejecución de comandos, ejecuta el rollback correspondiente
 * y notifica al usuario sin permitir que la sesión del Webview se rompa o se congele.
 * 
 * Inversión de dependencias: Desacoplado de VsCodeBridge (L4) mediante el puerto INotifier.
 * Resiliencia: Soporte para unhandledrejection, liberación forzada de pointerCapture
 * y reseteo garantizado de banderas de interacción (isDragging).
 */

import { INotifier } from './INotifier.js';

export type FallbackCallback = (error: unknown) => void;

export interface IInteractionCleanup {
  resetInteractionFlags: () => void;
  releasePointerCapture: () => void;
}

export class CrashGuard {
  private static defaultNotifier: INotifier | null = null;
  private static defaultCleanup: IInteractionCleanup | null = null;
  private static globalInstalled: boolean = false;
  private static uninstallGlobalHandler: (() => void) | null = null;

  constructor(
    private readonly notifier: INotifier | null = null,
    private readonly cleanup: IInteractionCleanup | null = null
  ) {}

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
   * Configura los callbacks de limpieza de interacción global (liberación de puntero y reseteo de isDragging).
   */
  public static setInteractionCleanup(cleanup: IInteractionCleanup | null): void {
    CrashGuard.defaultCleanup = cleanup;
  }

  public static getInteractionCleanup(): IInteractionCleanup | null {
    return CrashGuard.defaultCleanup;
  }

  /**
   * Instala listeners globales para 'unhandledrejection' y 'error', garantizando
   * que cualquier promesa rechazada no controlada en el webview no congele el lienzo.
   *
   * @param target Objeto global (por defecto window si existe).
   * @returns Función de desinstalación de los listeners.
   */
  public static installGlobalHandlers(target?: any): () => void {
    const globalTarget = target || (typeof window !== 'undefined' ? window : null);
    if (!globalTarget || typeof globalTarget.addEventListener !== 'function') {
      return () => {};
    }

    const onUnhandledRejection = (event: any) => {
      const reason = event?.reason ?? event;
      CrashGuard.dispatchException(
        'unhandledrejection',
        reason,
        undefined,
        CrashGuard.defaultNotifier,
        CrashGuard.defaultCleanup
      );
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
    };

    const onError = (event: any) => {
      const error = event?.error ?? event?.message ?? event;
      CrashGuard.dispatchException(
        'window.error',
        error,
        undefined,
        CrashGuard.defaultNotifier,
        CrashGuard.defaultCleanup
      );
    };

    globalTarget.addEventListener('unhandledrejection', onUnhandledRejection);
    globalTarget.addEventListener('error', onError);
    CrashGuard.globalInstalled = true;

    const uninstall = () => {
      globalTarget.removeEventListener('unhandledrejection', onUnhandledRejection);
      globalTarget.removeEventListener('error', onError);
      CrashGuard.globalInstalled = false;
      CrashGuard.uninstallGlobalHandler = null;
    };

    CrashGuard.uninstallGlobalHandler = uninstall;
    return uninstall;
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
      this.notifier || CrashGuard.defaultNotifier,
      this.cleanup || CrashGuard.defaultCleanup
    );
  }

  private static handleStaticException(
    actionName: string,
    error: unknown,
    fallback?: FallbackCallback
  ): void {
    CrashGuard.dispatchException(
      actionName,
      error,
      fallback,
      CrashGuard.defaultNotifier,
      CrashGuard.defaultCleanup
    );
  }

  private static dispatchException(
    actionName: string,
    error: unknown,
    fallback?: FallbackCallback,
    notifier?: INotifier | null,
    cleanup?: IInteractionCleanup | null
  ): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[AntiDraw CrashGuard] Error controlado en '${actionName}':`, error);

    // 1. Liberación garantizada de captura de puntero y reseteo forzado de interacción
    if (cleanup) {
      try {
        cleanup.releasePointerCapture();
      } catch (cleanupErr) {
        console.error('[AntiDraw CrashGuard] Fallo al liberar captura de puntero:', cleanupErr);
      }
      try {
        cleanup.resetInteractionFlags();
      } catch (cleanupErr) {
        console.error('[AntiDraw CrashGuard] Fallo al resetear banderas de interacción:', cleanupErr);
      }
    }

    // 2. Ejecutar callback de recuperación
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

    // 3. Notificación al usuario mediante el puerto
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
