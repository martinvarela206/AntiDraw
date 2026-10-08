/**
 * CAPA L2: Contrato Declarativo de Herramienta Pura (ITool)
 * Inspirado en vectorcraft_tools::tool::Tool trait.
 *
 * Cada herramienta se comporta como una máquina de estados pura:
 * recibe eventos estructurados de puntero y teclado junto a un contexto
 * de consulta ambiental, y retorna una transición tipada que define la intención
 * del cambio (`ActionIntent`), el cursor deseado y los descriptores de overlay.
 */

import { Point } from '../../core/geom/Point.js';
import { ActionIntent } from './ActionIntent.js';
import { OverlayDescriptor } from './OverlayDescriptor.js';

export interface ToolPointerEvent {
  readonly point: Point;
  readonly rawEvent: PointerEvent;
  readonly buttons: number;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
}

export interface ToolEnvironmentContext {
  readonly model: any;
  readonly selectionTool: any;
  readonly canvasMgr: any;
  readonly zoom: number;
  snapPoint(pt: Point, otherVertices?: Point[], excludeGuideId?: string): Point;
  getOtherVertices(excludeIds?: string[]): Point[];
  isPointerOverRuler?(clientX: number, clientY: number, orientation?: 'horizontal' | 'vertical' | 'angled'): boolean;
}

export interface ToolTransitionResult {
  readonly intent: ActionIntent;
  readonly handled: boolean;
  readonly cursor?: string;
  readonly overlays?: OverlayDescriptor[];
}

export interface ITool {
  readonly id: string;
  readonly name: string;
  readonly defaultCursor?: string;

  onPointerDown(event: ToolPointerEvent, ctx: ToolEnvironmentContext): ToolTransitionResult;
  onPointerMove(event: ToolPointerEvent, ctx: ToolEnvironmentContext): ToolTransitionResult;
  onPointerUp(event: ToolPointerEvent, ctx: ToolEnvironmentContext): ToolTransitionResult;
  onDoubleClick?(event: MouseEvent, pt: Point, ctx: ToolEnvironmentContext): ToolTransitionResult;

  onKeyDown?(event: KeyboardEvent, ctx: ToolEnvironmentContext): ToolTransitionResult;
  onKeyUp?(event: KeyboardEvent, ctx: ToolEnvironmentContext): ToolTransitionResult;
  onCancel?(ctx: ToolEnvironmentContext): ToolTransitionResult;

  getOverlays?(ctx: ToolEnvironmentContext): OverlayDescriptor[];
  activate?(ctx: ToolEnvironmentContext): void;
  deactivate?(ctx: ToolEnvironmentContext): void;
}
