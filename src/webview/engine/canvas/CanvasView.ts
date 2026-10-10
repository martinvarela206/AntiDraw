import { Point } from '../../core/geom/Point.js';

export interface CanvasViewDelegate {
  getCanvasPoint: (e: PointerEvent | MouseEvent) => Point;
  onPointerDown: (e: PointerEvent, pt: Point) => void;
  onPointerMove: (e: PointerEvent, pt: Point) => void;
  onPointerUp: (e: PointerEvent, pt: Point) => void;
  onDoubleClick: (e: MouseEvent, pt: Point) => void;
  onCancelAction: () => void;
  onLostFocusOrCancel: () => void;
  isDragging: () => boolean;
  isMiddlePanning: () => boolean;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Canvas DOM View & Global Event Dispatcher (CanvasView - L1/L4)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Isolates the physical DOM hierarchy (`canvasContainer`, `canvasScrollArea`, `canvasWrapper`)
 *    and its native browser event listeners away from `main.ts`.
 *
 * 2. Hardware-Accelerated RAF Pointer Coalescing (FIX-12):
 *    High-polling mice (125Hz-1000Hz) dispatch hundreds of pointermove events per second.
 *    `CanvasView` coalesces in-flight pointermove events into a single `requestAnimationFrame`
 *    tick per screen refresh cycle, preventing event queue flooding and maintaining constant 60 FPS.
 *
 * 3. Cross-Boundary Pointer & Focus Cancellation:
 *    Attaches window-level dragging listeners and handles OS-level focus loss ('blur', 'pointercancel')
 *    cleanly, preventing frozen ghosts or stuck drag interactions.
 */
export class CanvasView {
  public readonly canvasContainer: HTMLElement;
  public readonly canvasScrollArea: HTMLElement;
  public readonly canvasWrapper: HTMLElement;

  private delegate: CanvasViewDelegate;
  private pointerMoveRafId: number | null = null;
  private latestPointerMoveEvent: PointerEvent | null = null;

  constructor(
    containers: {
      canvasContainer: HTMLElement;
      canvasScrollArea: HTMLElement;
      canvasWrapper: HTMLElement;
    },
    delegate: CanvasViewDelegate
  ) {
    this.canvasContainer = containers.canvasContainer;
    this.canvasScrollArea = containers.canvasScrollArea;
    this.canvasWrapper = containers.canvasWrapper;
    this.delegate = delegate;

    this.bindEvents();
  }

  public setCursor(cursor: string): void {
    this.canvasWrapper.style.cursor = cursor;
    if (!this.delegate.isMiddlePanning()) {
      this.canvasScrollArea.style.cursor = cursor === 'default' ? '' : cursor;
    }
  }

  public cancelRaf(): void {
    if (this.pointerMoveRafId !== null) {
      cancelAnimationFrame(this.pointerMoveRafId);
      this.pointerMoveRafId = null;
    }
    this.latestPointerMoveEvent = null;
  }

  public setPointerCapture(pointerId: number): void {
    try {
      this.canvasWrapper.setPointerCapture(pointerId);
    } catch (_err) {}
  }

  public releasePointerCapture(pointerId: number): void {
    try {
      if (this.canvasWrapper.hasPointerCapture(pointerId)) {
        this.canvasWrapper.releasePointerCapture(pointerId);
      }
    } catch (_err) {}
  }

  public hasPointerCapture(pointerId: number): boolean {
    try {
      return this.canvasWrapper.hasPointerCapture(pointerId);
    } catch (_err) {
      return false;
    }
  }

  private bindEvents(): void {
    // 1. Canvas Wrapper Pointer Events
    this.canvasWrapper.addEventListener('pointerdown', (e) => {
      if (e.button === 1) return; // Middle click bubbles for panning
      e.stopPropagation();
      const pt = this.delegate.getCanvasPoint(e);
      this.delegate.onPointerDown(e, pt);
    });

    this.canvasWrapper.addEventListener('pointermove', (e) => {
      e.stopPropagation();
      this.queuePointerMove(e);
    });

    this.canvasWrapper.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      const pt = this.delegate.getCanvasPoint(e);
      this.delegate.onPointerUp(e, pt);
    });

    this.canvasWrapper.addEventListener('pointercancel', () => {
      this.delegate.onLostFocusOrCancel();
    });

    this.canvasWrapper.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const pt = this.delegate.getCanvasPoint(e);
      this.delegate.onDoubleClick(e, pt);
    });

    // 2. Canvas Scroll Area Delegated Events (for gestures outside canvas bounds)
    this.canvasScrollArea.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button === 2) {
        e.preventDefault();
        this.delegate.onCancelAction();
        return;
      }
      if (e.button === 0) {
        const pt = this.delegate.getCanvasPoint(e);
        this.delegate.onPointerDown(e, pt);
      }
    });

    this.canvasScrollArea.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.delegate.isMiddlePanning() && !this.delegate.isDragging()) {
        this.queuePointerMove(e);
      }
    });

    this.canvasScrollArea.addEventListener('pointerup', (e: PointerEvent) => {
      if (e.button === 0 && this.delegate.isDragging()) {
        const pt = this.delegate.getCanvasPoint(e);
        this.delegate.onPointerUp(e, pt);
      }
    });

    this.canvasScrollArea.addEventListener('pointercancel', () => {
      this.delegate.onLostFocusOrCancel();
    });

    this.canvasScrollArea.addEventListener('dblclick', (e: MouseEvent) => {
      const pt = this.delegate.getCanvasPoint(e);
      this.delegate.onDoubleClick(e, pt);
    });

    // 3. Window Level Listeners for dragging across UI boundaries & OS events
    window.addEventListener('pointermove', (e) => {
      if (this.delegate.isDragging()) {
        this.queuePointerMove(e);
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (this.delegate.isDragging()) {
        const pt = this.delegate.getCanvasPoint(e);
        this.delegate.onPointerUp(e, pt);
      }
    });

    window.addEventListener('blur', () => {
      this.delegate.onLostFocusOrCancel();
    });

    window.addEventListener('pointercancel', () => {
      this.delegate.onLostFocusOrCancel();
    });
  }

  private queuePointerMove(e: PointerEvent): void {
    this.latestPointerMoveEvent = e;
    if (this.pointerMoveRafId === null) {
      this.pointerMoveRafId = requestAnimationFrame(() => {
        this.pointerMoveRafId = null;
        if (this.latestPointerMoveEvent) {
          const pt = this.delegate.getCanvasPoint(this.latestPointerMoveEvent);
          this.delegate.onPointerMove(this.latestPointerMoveEvent, pt);
        }
      });
    }
  }
}
