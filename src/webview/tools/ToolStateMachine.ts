/**
 * CAPA L2: Máquina de Estados Determinista Pura de Herramientas (ITool / ToolStateMachine)
 *
 * Formaliza el ciclo de vida de herramientas de edición vectorial como un reductor determinista puro:
 *   (State, Event) -> NextState
 *
 * Características clave:
 * 1. Eventos canónicos tipados: POINTER_DOWN, POINTER_MOVE, POINTER_UP, KEY_DOWN, KEY_UP, CANCEL.
 * 2. Soporte nativo para coalescencia de eventos de puntero (`getCoalescedEvents`) permitiendo
 *    trazos fluidos a alta frecuencia de muestreo (120Hz/240Hz stylus/tableta) sin latencia ni jitter.
 * 3. Proyección matemática canónica de coordenadas (Pantalla -> Documento -> Local).
 */

import { Point } from '../core/geom/Point.js';
import { AffineMatrix } from '../core/geom/TransformMatrix.js';
import { ToolType } from './ToolType.js';
import { CoordinateSpaceTransformer, CameraViewportTransform } from './CoordinateSpaceTransformer.js';

export type ToolActionType =
  | 'ACTIVATE'
  | 'DEACTIVATE'
  | 'POINTER_DOWN'
  | 'POINTER_MOVE'
  | 'POINTER_UP'
  | 'DOUBLE_CLICK'
  | 'KEY_DOWN'
  | 'KEY_UP'
  | 'CANCEL';

export interface ToolPointerPayload {
  screenPoint: Point;
  documentPoint: Point;
  localPoint?: Point;
  coalescedDocumentPoints?: Point[];
  buttons: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  pointerId?: number;
  pointerType?: string;
  pressure?: number;
}

export interface ToolKeyPayload {
  key: string;
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  repeat: boolean;
}

export interface ToolEvent<T = any> {
  type: ToolActionType;
  toolType: ToolType;
  timestamp: number;
  payload: T;
}

export interface ToolSessionState {
  readonly activeTool: ToolType;
  readonly isInteracting: boolean;
  readonly phase: 'idle' | 'tracking' | 'dragging' | 'committing' | 'cancelled';
  readonly startDocumentPoint: Point | null;
  readonly currentDocumentPoint: Point | null;
  readonly activeModifiers: {
    readonly shift: boolean;
    readonly ctrl: boolean;
    readonly alt: boolean;
    readonly meta: boolean;
  };
  readonly activeKeyCodes: ReadonlySet<string>;
  readonly customData?: Readonly<Record<string, any>>;
}

export interface ToolStateTransition {
  readonly previousState: ToolSessionState;
  readonly nextState: ToolSessionState;
  readonly event: ToolEvent;
  readonly absorbed: boolean;
  readonly sideEffects?: readonly ToolSideEffect[];
}

export type ToolSideEffect =
  | { type: 'RENDER' }
  | { type: 'RENDER_OVERLAY' }
  | { type: 'PUSH_UNDO'; description?: string }
  | { type: 'SYNC_TO_HOST' }
  | { type: 'CHANGE_TOOL'; targetTool: ToolType }
  | { type: 'CHANGE_CURSOR'; cursor: string }
  | { type: 'CANCEL_INTERACTION' };

export class ToolStateMachine {
  private _state: ToolSessionState;
  private _transitionLog: ToolStateTransition[] = [];
  private static readonly MAX_LOG_SIZE = 50;

  constructor(initialTool: ToolType = 'select') {
    this._state = {
      activeTool: initialTool,
      isInteracting: false,
      phase: 'idle',
      startDocumentPoint: null,
      currentDocumentPoint: null,
      activeModifiers: { shift: false, ctrl: false, alt: false, meta: false },
      activeKeyCodes: new Set<string>(),
    };
  }

  public get state(): ToolSessionState {
    return this._state;
  }

  public get transitionLog(): readonly ToolStateTransition[] {
    return this._transitionLog;
  }

  /**
   * Extrae los puntos de puntero coalescidos (W3C Pointer Events getCoalescedEvents).
   * Si la API está disponible en el navegador/evento nativo, procesa cada muestra intermedia
   * a través de la transformación de coordenadas de cámara.
   */
  public static extractCoalescedPoints(
    e: PointerEvent,
    camera: CameraViewportTransform,
    elementTransform?: AffineMatrix
  ): { docPoints: Point[]; localPoints?: Point[] } {
    const rawEvents = (typeof e.getCoalescedEvents === 'function')
      ? e.getCoalescedEvents()
      : [e];

    const docPoints: Point[] = [];
    const localPoints: Point[] = [];

    for (const ce of rawEvents) {
      const screenPt: Point = { x: ce.clientX, y: ce.clientY };
      const docPt = CoordinateSpaceTransformer.screenToDocument(screenPt, camera);
      docPoints.push(docPt);
      if (elementTransform) {
        localPoints.push(CoordinateSpaceTransformer.documentToLocal(docPt, elementTransform));
      }
    }

    return {
      docPoints,
      localPoints: elementTransform ? localPoints : undefined,
    };
  }

  /**
   * Reduce un evento de forma determinista pura.
   */
  public dispatch(event: ToolEvent): ToolStateTransition {
    const prevState = this._state;
    const { nextState, absorbed, sideEffects } = ToolStateMachine.reduce(prevState, event);
    this._state = nextState;

    const transition: ToolStateTransition = {
      previousState: prevState,
      nextState,
      event,
      absorbed,
      sideEffects,
    };

    this._transitionLog.push(transition);
    if (this._transitionLog.length > ToolStateMachine.MAX_LOG_SIZE) {
      this._transitionLog.shift();
    }

    return transition;
  }

  /**
   * Reductor determinista puro: (State, Event) -> NextState
   */
  public static reduce(
    state: ToolSessionState,
    event: ToolEvent
  ): { nextState: ToolSessionState; absorbed: boolean; sideEffects?: ToolSideEffect[] } {
    switch (event.type) {
      case 'ACTIVATE': {
        const nextState: ToolSessionState = {
          ...state,
          activeTool: event.toolType,
          isInteracting: false,
          phase: 'idle',
          startDocumentPoint: null,
          currentDocumentPoint: null,
        };
        return { nextState, absorbed: true, sideEffects: [{ type: 'RENDER_OVERLAY' }] };
      }

      case 'DEACTIVATE': {
        const nextState: ToolSessionState = {
          ...state,
          isInteracting: false,
          phase: 'idle',
          startDocumentPoint: null,
          currentDocumentPoint: null,
        };
        return { nextState, absorbed: true, sideEffects: [{ type: 'CANCEL_INTERACTION' }, { type: 'RENDER_OVERLAY' }] };
      }

      case 'POINTER_DOWN': {
        const payload = event.payload as ToolPointerPayload;
        const nextModifiers = {
          shift: payload.shiftKey,
          ctrl: payload.ctrlKey,
          alt: payload.altKey,
          meta: payload.metaKey,
        };

        const nextState: ToolSessionState = {
          ...state,
          isInteracting: true,
          phase: 'tracking',
          startDocumentPoint: payload.documentPoint,
          currentDocumentPoint: payload.documentPoint,
          activeModifiers: nextModifiers,
        };

        return { nextState, absorbed: true, sideEffects: [{ type: 'RENDER_OVERLAY' }] };
      }

      case 'POINTER_MOVE': {
        const payload = event.payload as ToolPointerPayload;
        const nextModifiers = {
          shift: payload.shiftKey,
          ctrl: payload.ctrlKey,
          alt: payload.altKey,
          meta: payload.metaKey,
        };

        let nextPhase = state.phase;
        if (state.isInteracting) {
          if (state.startDocumentPoint) {
            const dx = payload.documentPoint.x - state.startDocumentPoint.x;
            const dy = payload.documentPoint.y - state.startDocumentPoint.y;
            // Distancia umbral para considerar inicio formal de arrastre (3px)
            if (dx * dx + dy * dy > 9) {
              nextPhase = 'dragging';
            }
          }
        }

        const nextState: ToolSessionState = {
          ...state,
          phase: nextPhase,
          currentDocumentPoint: payload.documentPoint,
          activeModifiers: nextModifiers,
        };

        return { nextState, absorbed: true, sideEffects: [{ type: 'RENDER_OVERLAY' }] };
      }

      case 'POINTER_UP': {
        const payload = event.payload as ToolPointerPayload;
        const wasDragging = state.phase === 'dragging';

        const nextState: ToolSessionState = {
          ...state,
          isInteracting: false,
          phase: 'idle',
          currentDocumentPoint: payload.documentPoint,
        };

        const sideEffects: ToolSideEffect[] = [{ type: 'RENDER_OVERLAY' }];
        if (wasDragging) {
          sideEffects.push({ type: 'RENDER' });
          sideEffects.push({ type: 'PUSH_UNDO' });
          sideEffects.push({ type: 'SYNC_TO_HOST' });
        }

        return { nextState, absorbed: true, sideEffects };
      }

      case 'KEY_DOWN': {
        const payload = event.payload as ToolKeyPayload;
        const nextKeys = new Set(state.activeKeyCodes);
        nextKeys.add(payload.code);

        const nextModifiers = {
          shift: payload.shiftKey,
          ctrl: payload.ctrlKey,
          alt: payload.altKey,
          meta: payload.metaKey,
        };

        const nextState: ToolSessionState = {
          ...state,
          activeModifiers: nextModifiers,
          activeKeyCodes: nextKeys,
        };

        return { nextState, absorbed: true, sideEffects: [{ type: 'RENDER_OVERLAY' }] };
      }

      case 'KEY_UP': {
        const payload = event.payload as ToolKeyPayload;
        const nextKeys = new Set(state.activeKeyCodes);
        nextKeys.delete(payload.code);

        const nextModifiers = {
          shift: payload.shiftKey,
          ctrl: payload.ctrlKey,
          alt: payload.altKey,
          meta: payload.metaKey,
        };

        const nextState: ToolSessionState = {
          ...state,
          activeModifiers: nextModifiers,
          activeKeyCodes: nextKeys,
        };

        return { nextState, absorbed: true, sideEffects: [{ type: 'RENDER_OVERLAY' }] };
      }

      case 'CANCEL': {
        const nextState: ToolSessionState = {
          ...state,
          isInteracting: false,
          phase: 'idle',
          startDocumentPoint: null,
          currentDocumentPoint: null,
        };
        return {
          nextState,
          absorbed: true,
          sideEffects: [{ type: 'CANCEL_INTERACTION' }, { type: 'RENDER_OVERLAY' }],
        };
      }

      default:
        return { nextState: state, absorbed: false };
    }
  }
}
