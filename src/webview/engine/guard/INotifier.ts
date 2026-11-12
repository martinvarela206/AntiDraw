/**
 * CAPA L3: Puerto de Notificación e Información de Errores (INotifier / IErrorReporter)
 * 
 * Desacopla la Capa L3 (CrashGuard, CommandRegistry, SessionEngine) de la Capa L4 (VsCodeBridge).
 * Permite inyectar cualquier mecanismo de notificación (VS Code Bridge, consola, logger headless o mock en tests).
 */

export interface INotifier {
  showInfo(message: string): void;
  showError(message: string): void;
  showWarning?(message: string): void;
}
