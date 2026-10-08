/**
 * CAPA L2: Contratos de Herramientas Declarativas (ActionIntent)
 * Inspirado en vectorcraft_tools::intent.
 *
 * Desacopla las herramientas de interacción de la mutación destructiva directa
 * del documento. En lugar de invocar `pushUndo()`, `render()` y `syncToHost()`,
 * la herramienta evalúa los eventos del ratón/teclado y emite una intención declarativa.
 */

import { OverlayDescriptor } from './OverlayDescriptor.js';

export type ActionIntentKind = 'none' | 'begin' | 'preview' | 'commit' | 'cancel' | 'exec';

export interface BaseActionIntent {
  readonly kind: ActionIntentKind;
}

export interface NoneIntent extends BaseActionIntent {
  readonly kind: 'none';
}

export interface BeginIntent extends BaseActionIntent {
  readonly kind: 'begin';
  readonly actionId?: string;
  readonly payload?: any;
}

export interface PreviewIntent extends BaseActionIntent {
  readonly kind: 'preview';
  readonly actionId?: string;
  readonly payload?: any;
  readonly overlays?: OverlayDescriptor[];
}

export interface CommitIntent extends BaseActionIntent {
  readonly kind: 'commit';
  readonly commandId: string;
  readonly params: any;
  readonly description?: string;
}

export interface CancelIntent extends BaseActionIntent {
  readonly kind: 'cancel';
  readonly reason?: string;
}

export interface ExecIntent extends BaseActionIntent {
  readonly kind: 'exec';
  readonly commandId: string;
  readonly params?: any;
}

export type ActionIntent =
  | NoneIntent
  | BeginIntent
  | PreviewIntent
  | CommitIntent
  | CancelIntent
  | ExecIntent;

export const ActionIntentFactory = {
  none(): NoneIntent {
    return { kind: 'none' };
  },

  begin(actionId?: string, payload?: any): BeginIntent {
    return { kind: 'begin', actionId, payload };
  },

  preview(actionId?: string, payload?: any, overlays?: OverlayDescriptor[]): PreviewIntent {
    return { kind: 'preview', actionId, payload, overlays };
  },

  commit(commandId: string, params: any, description?: string): CommitIntent {
    return { kind: 'commit', commandId, params, description };
  },

  cancel(reason?: string): CancelIntent {
    return { kind: 'cancel', reason };
  },

  exec(commandId: string, params?: any): ExecIntent {
    return { kind: 'exec', commandId, params };
  },
};
