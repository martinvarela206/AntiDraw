/**
 * CAPA L3: Motor de Comandos (CommandSpec)
 * Inspirado en vectorcraft_engine::cmd::CommandSpec.
 *
 * Contrato estricto para comandos del sistema. Todo cambio en el documento
 * o navegación en la interfaz expone una especificación formal con ID estable,
 * atajo, etiqueta y función de habilitación determinista.
 */

export interface CommandContext {
  model: any;
  selectionTool?: any;
  canvasMgr?: any;
  actionDispatcher?: any;
  historyService?: any;
  viewportCtrl?: any;
  propertyPanel?: any;
  [key: string]: any;
}

export interface ExecutionResult<T = any> {
  success: boolean;
  value?: T;
  error?: string;
  undoable?: boolean;
}

export interface CommandSpec<TParams = any, TResult = any> {
  /**
   * Identificador canónico y estable del comando (ej: 'edit.undo', 'object.group').
   */
  readonly id: string;

  /**
   * Etiqueta humana para menús y paneles (ej: 'Deshacer', 'Agrupar').
   */
  readonly label: string;

  /**
   * Descripción o tooltip de la acción.
   */
  readonly description?: string;

  /**
   * Categoría funcional del comando.
   */
  readonly category?: 'edit' | 'object' | 'view' | 'layer' | 'shape' | 'path';

  /**
   * Atajo de teclado por defecto (ej: 'Ctrl+Z', 'Ctrl+G').
   */
  readonly shortcut?: string;

  /**
   * Evalúa si el comando está disponible para ejecutarse en el estado actual.
   */
  readonly isEnabled?: (ctx: CommandContext, params?: TParams) => boolean;

  /**
   * Ejecuta la lógica del comando de manera atómica.
   */
  readonly execute: (ctx: CommandContext, params?: TParams) => ExecutionResult<TResult>;
}
