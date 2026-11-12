/**
 * CAPA L0 / L2: Transformación Canónica de Espacios de Coordenadas
 *
 * AntiDraw opera en tres espacios de coordenadas bidimensionales estrictamente jerárquicos:
 * 1. Screen Space (Pantalla / Viewport / Client):
 *    Coordenadas físicas relativas al cliente/navegador (e.g. `clientX`, `clientY`).
 *    Sujetas a DPI, zoom del sistema operativo y posición de la ventana.
 * 2. Document Space (Lienzo SVG / World):
 *    Coordenadas en el sistema de referencia global del documento SVG (`viewBox`).
 *    Independientes del zoom de la cámara, el panning y el escalado de visualización.
 * 3. Local / Element Space (Objeto):
 *    Coordenadas locales de un elemento tras aplicar su matriz de transformación afín interna
 *    o su traslación de grupo (`<g transform="...">`).
 */

import { Point } from '../core/geom/Point.js';
import { AffineMatrix } from '../core/geom/TransformMatrix.js';

export interface CameraViewportTransform {
  zoom: number;
  cameraOffset: Point;
  viewBox: { x: number; y: number; width: number; height: number };
  screenCtm?: DOMMatrix | AffineMatrix | null;
}

export class CoordinateSpaceTransformer {
  /**
   * Transforma un punto de Pantalla (Screen / Client) a Documento (SVG World).
   */
  public static screenToDocument(
    screenPt: Point,
    camera: CameraViewportTransform
  ): Point {
    // Si disponemos de CTM de pantalla (SVG DOM), invertimos la matriz
    if (camera.screenCtm) {
      if ('inverse' in camera.screenCtm && typeof camera.screenCtm.inverse === 'function') {
        const inv = camera.screenCtm.inverse();
        return {
          x: inv.a * screenPt.x + inv.c * screenPt.y + inv.e,
          y: inv.b * screenPt.x + inv.d * screenPt.y + inv.f,
        };
      }
      if (camera.screenCtm instanceof AffineMatrix) {
        const inv = camera.screenCtm.invert();
        if (inv) return inv.applyToPoint(screenPt);
      }
    }

    // Proyección analítica basada en cámara (zoom y cameraOffset)
    const zoom = camera.zoom || 1.0;
    const docX = (screenPt.x - camera.cameraOffset.x) / zoom + camera.viewBox.x;
    const docY = (screenPt.y - camera.cameraOffset.y) / zoom + camera.viewBox.y;
    return { x: docX, y: docY };
  }

  /**
   * Transforma un punto de Documento (SVG World) a Pantalla (Screen / Client).
   */
  public static documentToScreen(
    docPt: Point,
    camera: CameraViewportTransform
  ): Point {
    if (camera.screenCtm) {
      if (camera.screenCtm instanceof AffineMatrix) {
        return camera.screenCtm.applyToPoint(docPt);
      }
      const ctm = camera.screenCtm as DOMMatrix;
      return {
        x: ctm.a * docPt.x + ctm.c * docPt.y + ctm.e,
        y: ctm.b * docPt.x + ctm.d * docPt.y + ctm.f,
      };
    }

    const zoom = camera.zoom || 1.0;
    const screenX = (docPt.x - camera.viewBox.x) * zoom + camera.cameraOffset.x;
    const screenY = (docPt.y - camera.viewBox.y) * zoom + camera.cameraOffset.y;
    return { x: screenX, y: screenY };
  }

  /**
   * Transforma un punto de Documento a Espacio Local de un elemento.
   */
  public static documentToLocal(
    docPt: Point,
    elementTransform: AffineMatrix
  ): Point {
    const inv = elementTransform.invert();
    return inv ? inv.applyToPoint(docPt) : docPt;
  }

  /**
   * Transforma un punto de Espacio Local de un elemento a Documento.
   */
  public static localToDocument(
    localPt: Point,
    elementTransform: AffineMatrix
  ): Point {
    return elementTransform.applyToPoint(localPt);
  }

  /**
   * Pipeline completo de 3 niveles: Pantalla -> Documento -> Local
   */
  public static screenToLocal(
    screenPt: Point,
    camera: CameraViewportTransform,
    elementTransform: AffineMatrix
  ): Point {
    const docPt = this.screenToDocument(screenPt, camera);
    return this.documentToLocal(docPt, elementTransform);
  }

  /**
   * Pipeline inverso completo de 3 niveles: Local -> Documento -> Pantalla
   */
  public static localToScreen(
    localPt: Point,
    elementTransform: AffineMatrix,
    camera: CameraViewportTransform
  ): Point {
    const docPt = this.localToDocument(localPt, elementTransform);
    return this.documentToScreen(docPt, camera);
  }
}
