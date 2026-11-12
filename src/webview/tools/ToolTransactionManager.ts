/**
 * CAPA L2: Gestor de Transacciones Atómicas de Herramientas (ToolTransactionManager)
 *
 * Formaliza el ciclo de vida de interacción interactiva de herramientas vectoriales
 * en cuatro acciones discriminadas unívocas:
 *   1. Begin: Inicia una transacción con identificador unívoco (`txId`), capturando
 *      el estado inicial del documento / selección.
 *   2. Preview: Emite estados transitorios efímeros (*ghost shapes*, deformaciones en tiempo real,
 *      overlays), sin mutar destructivamente el modelo SVG ni contaminar el stack de undo.
 *   3. Commit: Consolida atómicamente la transacción, aplicando las mutaciones al modelo,
 *      registrando el punto de deshacer (`pushUndo`) y sincronizando con el host.
 *   4. Cancel: Aborta la transacción revirtiendo cualquier estado preliminar y restaurando
 *      el estado limpio previo sin efectos residuales.
 */

import { DocumentState } from '../core/model/DocumentState.js';
import { VectorModel, VectorElement } from '../engine/VectorModel.js';
import { OverlayDescriptor } from '../engine/canvas/OverlayDescriptor.js';

export type TransactionActionType = 'Begin' | 'Preview' | 'Commit' | 'Cancel';

export interface BaseTransactionAction<TKind extends TransactionActionType> {
  readonly action: TKind;
  readonly txId: string;
  readonly toolType: string;
  readonly timestamp: number;
}

export interface BeginAction extends BaseTransactionAction<'Begin'> {
  readonly description?: string;
  readonly initialSelection?: readonly string[];
  readonly payload?: any;
}

export interface PreviewAction extends BaseTransactionAction<'Preview'> {
  readonly ghostElements?: readonly VectorElement[];
  readonly overlayDescriptors?: readonly OverlayDescriptor[];
  readonly payload?: any;
}

export interface CommitAction extends BaseTransactionAction<'Commit'> {
  readonly description: string;
  readonly modifiedElements?: readonly VectorElement[];
  readonly deletedElementIds?: readonly string[];
  readonly addedElements?: readonly VectorElement[];
  readonly payload?: any;
}

export interface CancelAction extends BaseTransactionAction<'Cancel'> {
  readonly reason: 'escape' | 'pointer_cancel' | 'error' | 'user_abort' | string;
}

export type TransactionAction = BeginAction | PreviewAction | CommitAction | CancelAction;

export interface ActiveToolTransaction {
  readonly txId: string;
  readonly toolType: string;
  readonly startTime: number;
  readonly description?: string;
  readonly initialDocumentState?: DocumentState;
  readonly initialSelection: readonly string[];
  previewCount: number;
  latestPreview?: PreviewAction;
}

export interface TransactionListener {
  onBegin?(tx: ActiveToolTransaction): void;
  onPreview?(tx: ActiveToolTransaction, action: PreviewAction): void;
  onCommit?(tx: ActiveToolTransaction, action: CommitAction): void;
  onCancel?(tx: ActiveToolTransaction, action: CancelAction): void;
}

export class ToolTransactionManager {
  private static instanceCounter = 0;
  private currentTransaction: ActiveToolTransaction | null = null;
  private listeners: Set<TransactionListener> = new Set();
  private auditLog: Array<{ txId: string; action: TransactionActionType; timestamp: number; meta?: any }> = [];
  private static readonly MAX_LOG_SIZE = 100;

  /**
   * Genera un identificador de transacción unívoco monotónico.
   */
  public static generateTxId(toolType: string): string {
    ToolTransactionManager.instanceCounter++;
    return `tx_${toolType}_${Date.now()}_${ToolTransactionManager.instanceCounter}`;
  }

  public get activeTransaction(): ActiveToolTransaction | null {
    return this.currentTransaction;
  }

  public get isTransactionActive(): boolean {
    return this.currentTransaction !== null;
  }

  public get historyAuditLog(): readonly { txId: string; action: TransactionActionType; timestamp: number; meta?: any }[] {
    return this.auditLog;
  }

  public addListener(listener: TransactionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Inicia formalmente una nueva transacción atómica.
   * Si ya existía una transacción activa, se cancela preventivamente antes de comenzar.
   */
  public begin(
    toolType: string,
    options: {
      txId?: string;
      description?: string;
      initialDocumentState?: DocumentState;
      initialSelection?: readonly string[];
      payload?: any;
    } = {}
  ): BeginAction {
    if (this.currentTransaction) {
      this.cancel('auto_cancelled_by_new_transaction');
    }

    const txId = options.txId || ToolTransactionManager.generateTxId(toolType);
    const tx: ActiveToolTransaction = {
      txId,
      toolType,
      startTime: Date.now(),
      description: options.description,
      initialDocumentState: options.initialDocumentState,
      initialSelection: options.initialSelection || [],
      previewCount: 0,
    };

    this.currentTransaction = tx;

    const action: BeginAction = {
      action: 'Begin',
      txId,
      toolType,
      timestamp: tx.startTime,
      description: options.description,
      initialSelection: tx.initialSelection,
      payload: options.payload,
    };

    this.recordAudit(txId, 'Begin', { description: options.description });
    for (const listener of this.listeners) {
      try {
        listener.onBegin?.(tx);
      } catch (_e) {}
    }

    return action;
  }

  /**
   * Emite una actualización de preview efímera en la transacción en curso.
   */
  public preview(
    options: {
      ghostElements?: readonly VectorElement[];
      overlayDescriptors?: readonly OverlayDescriptor[];
      payload?: any;
    } = {}
  ): PreviewAction | null {
    if (!this.currentTransaction) {
      return null;
    }

    const tx = this.currentTransaction;
    tx.previewCount++;

    const action: PreviewAction = {
      action: 'Preview',
      txId: tx.txId,
      toolType: tx.toolType,
      timestamp: Date.now(),
      ghostElements: options.ghostElements,
      overlayDescriptors: options.overlayDescriptors,
      payload: options.payload,
    };

    tx.latestPreview = action;
    this.recordAudit(tx.txId, 'Preview', { previewCount: tx.previewCount });

    for (const listener of this.listeners) {
      try {
        listener.onPreview?.(tx, action);
      } catch (_e) {}
    }

    return action;
  }

  /**
   * Consolida atómicamente la transacción actual.
   */
  public commit(
    description: string,
    mutation?: {
      modifiedElements?: readonly VectorElement[];
      deletedElementIds?: readonly string[];
      addedElements?: readonly VectorElement[];
      payload?: any;
    }
  ): CommitAction | null {
    if (!this.currentTransaction) {
      return null;
    }

    const tx = this.currentTransaction;
    this.currentTransaction = null;

    const action: CommitAction = {
      action: 'Commit',
      txId: tx.txId,
      toolType: tx.toolType,
      timestamp: Date.now(),
      description,
      modifiedElements: mutation?.modifiedElements,
      deletedElementIds: mutation?.deletedElementIds,
      addedElements: mutation?.addedElements,
      payload: mutation?.payload,
    };

    this.recordAudit(tx.txId, 'Commit', { description, durationMs: action.timestamp - tx.startTime });

    for (const listener of this.listeners) {
      try {
        listener.onCommit?.(tx, action);
      } catch (_e) {}
    }

    return action;
  }

  /**
   * Aborta la transacción actual, descartando cambios efímeros.
   */
  public cancel(reason: string = 'user_abort'): CancelAction | null {
    if (!this.currentTransaction) {
      return null;
    }

    const tx = this.currentTransaction;
    this.currentTransaction = null;

    const action: CancelAction = {
      action: 'Cancel',
      txId: tx.txId,
      toolType: tx.toolType,
      timestamp: Date.now(),
      reason,
    };

    this.recordAudit(tx.txId, 'Cancel', { reason, durationMs: action.timestamp - tx.startTime });

    for (const listener of this.listeners) {
      try {
        listener.onCancel?.(tx, action);
      } catch (_e) {}
    }

    return action;
  }

  private recordAudit(txId: string, action: TransactionActionType, meta?: any): void {
    this.auditLog.push({ txId, action, timestamp: Date.now(), meta });
    if (this.auditLog.length > ToolTransactionManager.MAX_LOG_SIZE) {
      this.auditLog.shift();
    }
  }
}
