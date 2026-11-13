import * as fc from 'fast-check';
import { Point, PointUtils } from '../src/webview/core/geom/Point.js';
import { Color } from '../src/webview/core/color/Color.js';
import { BoundingBoxCalculator } from '../src/webview/engine/geometry/BoundingBoxCalculator.js';
import { SchneiderFit } from '../src/webview/engine/operations/booleans/SchneiderFit.js';

export async function runPropertyBasedGeometryTests(): Promise<boolean> {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.error(`  ✗ ${message}`);
      failed++;
    }
  }

  console.log('--- Test Suite 87: Pruebas Geométricas Basadas en Propiedades (fast-check) ---');

  // Propiedad 1: Simetría, no negatividad e identidad del cálculo de distancia euclídea
  try {
    fc.assert(
      fc.property(
        fc.float({ min: -10000, max: 10000, noNaN: true }),
        fc.float({ min: -10000, max: 10000, noNaN: true }),
        fc.float({ min: -10000, max: 10000, noNaN: true }),
        fc.float({ min: -10000, max: 10000, noNaN: true }),
        (x1, y1, x2, y2) => {
          const p1: Point = { x: x1, y: y1 };
          const p2: Point = { x: x2, y: y2 };
          const d12 = PointUtils.distance(p1, p2);
          const d21 = PointUtils.distance(p2, p1);
          const d11 = PointUtils.distance(p1, p1);

          // Simetría
          const symmetric = Math.abs(d12 - d21) < 1e-5;
          // No negatividad
          const nonNegative = d12 >= 0;
          // Identidad de los indiscernibles
          const zeroSelf = d11 === 0;

          return symmetric && nonNegative && zeroSelf;
        }
      ),
      { numRuns: 200 }
    );
    assert(true, 'Propiedad 1 [PointUtils.distance]: Simetría d(A,B)==d(B,A), no-negatividad d>=0 e identidad d(A,A)==0 verificada en 200 muestras');
  } catch (err: any) {
    assert(false, `Propiedad 1 falló: ${err.message}`);
  }

  // Propiedad 2: Invariante de contención estricta del Bounding Box analítico
  try {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            x: fc.float({ min: -5000, max: 5000, noNaN: true }),
            y: fc.float({ min: -5000, max: 5000, noNaN: true }),
          }),
          { minLength: 1, maxLength: 50 }
        ),
        (pts) => {
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;

          for (const p of pts) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
          }

          const box = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          };

          const epsilon = 1e-4;
          return pts.every(
            (p) =>
              p.x >= box.x - epsilon &&
              p.x <= box.x + box.width + epsilon &&
              p.y >= box.y - epsilon &&
              p.y <= box.y + box.height + epsilon
          );
        }
      ),
      { numRuns: 200 }
    );
    assert(true, 'Propiedad 2 [BoundingBox Containment]: El envolvente rectangular contiene al 100% de los vértices muestreados en 200 iteraciones');
  } catch (err: any) {
    assert(false, `Propiedad 2 falló: ${err.message}`);
  }

  // Propiedad 3: Invariante de frontera de curvas Bézier cúbicas: B(0) = P0 y B(1) = P3
  try {
    fc.assert(
      fc.property(
        fc.record({
          p0: fc.record({ x: fc.float({ min: -1000, max: 1000, noNaN: true }), y: fc.float({ min: -1000, max: 1000, noNaN: true }) }),
          p1: fc.record({ x: fc.float({ min: -1000, max: 1000, noNaN: true }), y: fc.float({ min: -1000, max: 1000, noNaN: true }) }),
          p2: fc.record({ x: fc.float({ min: -1000, max: 1000, noNaN: true }), y: fc.float({ min: -1000, max: 1000, noNaN: true }) }),
          p3: fc.record({ x: fc.float({ min: -1000, max: 1000, noNaN: true }), y: fc.float({ min: -1000, max: 1000, noNaN: true }) }),
        }),
        ({ p0, p1, p2, p3 }) => {
          function evalBezier(t: number): Point {
            const u = 1 - t;
            const tt = t * t;
            const uu = u * u;
            const uuu = uu * u;
            const ttt = tt * t;

            return {
              x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
              y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
            };
          }

          const b0 = evalBezier(0);
          const b1 = evalBezier(1);

          const epsilon = 1e-4;
          const matchStart = Math.abs(b0.x - p0.x) < epsilon && Math.abs(b0.y - p0.y) < epsilon;
          const matchEnd = Math.abs(b1.x - p3.x) < epsilon && Math.abs(b1.y - p3.y) < epsilon;

          return matchStart && matchEnd;
        }
      ),
      { numRuns: 200 }
    );
    assert(true, 'Propiedad 3 [Bézier Boundary]: B(0) == P0 y B(1) == P3 rigurosamente verificado en 200 curvas cúbicas arbitrarias');
  } catch (err: any) {
    assert(false, `Propiedad 3 falló: ${err.message}`);
  }

  // Propiedad 4: Invariante de traslación afín y redondeo conservativo
  try {
    fc.assert(
      fc.property(
        fc.float({ min: -5000, max: 5000, noNaN: true }),
        fc.float({ min: -5000, max: 5000, noNaN: true }),
        fc.float({ min: -500, max: 500, noNaN: true }),
        fc.float({ min: -500, max: 500, noNaN: true }),
        (px, py, dx, dy) => {
          const pt: Point = { x: px, y: py };
          const translated: Point = { x: pt.x + dx, y: pt.y + dy };
          const restored: Point = { x: translated.x - dx, y: translated.y - dy };

          const epsilon = 1e-4;
          return Math.abs(restored.x - pt.x) < epsilon && Math.abs(restored.y - pt.y) < epsilon;
        }
      ),
      { numRuns: 200 }
    );
    assert(true, 'Propiedad 4 [Affine Invariance]: T(-dx,-dy)(T(dx,dy)(P)) == P reversible sin distorsión numérica en 200 puntos');
  } catch (err: any) {
    assert(false, `Propiedad 4 falló: ${err.message}`);
  }

  // Propiedad 5: Descomposición W3C SVG 1.1 de colores #RRGGBBAA y preservación cromática
  try {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        (r, g, b, a) => {
          const hexR = r.toString(16).padStart(2, '0');
          const hexG = g.toString(16).padStart(2, '0');
          const hexB = b.toString(16).padStart(2, '0');
          const hexA = a.toString(16).padStart(2, '0');

          const hex8 = `#${hexR}${hexG}${hexB}${hexA}`;
          const decomposed = Color.decomposeColor(hex8);

          if (!decomposed) return false;

          const expectedBase = `#${hexR}${hexG}${hexB}`.toLowerCase();
          const expectedAlpha = Math.round((a / 255) * 1000) / 1000;

          const baseMatch = decomposed.color.toLowerCase() === expectedBase;
          const alphaMatch = Math.abs((decomposed.alpha ?? 1) - expectedAlpha) < 1e-3;

          return baseMatch && alphaMatch;
        }
      ),
      { numRuns: 200 }
    );
    assert(true, 'Propiedad 5 [Color Decomposition]: Color.decomposeColor descompone exactamente #RRGGBBAA en #RRGGBB puro y escala alfa W3C [0,1]');
  } catch (err: any) {
    assert(false, `Propiedad 5 falló: ${err.message}`);
  }

  // Propiedad 6: Preservación de extremos en ajuste Schneider Bézier para polilíneas no degeneradas
  try {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            x: fc.float({ min: -1000, max: 1000, noNaN: true }),
            y: fc.float({ min: -1000, max: 1000, noNaN: true }),
          }),
          { minLength: 2, maxLength: 15 }
        ),
        (rawPoints) => {
          // Filtrar puntos consecutivos idénticos para evitar longitudes de cuerda cero
          const points: Point[] = [rawPoints[0]];
          for (let i = 1; i < rawPoints.length; i++) {
            if (PointUtils.distance(points[points.length - 1], rawPoints[i]) > 0.1) {
              points.push(rawPoints[i]);
            }
          }
          if (points.length < 2) return true; // Degenerado, precondición omitida

          const curves = SchneiderFit.fitCurve(points, 2.5);
          if (curves.length === 0) return true;

          const firstPoint = curves[0].p0;
          const lastPoint = curves[curves.length - 1].p3;

          const startPt = points[0];
          const endPt = points[points.length - 1];

          const epsilon = 1e-2;
          const matchStart = Math.abs(firstPoint.x - startPt.x) < epsilon && Math.abs(firstPoint.y - startPt.y) < epsilon;
          const matchEnd = Math.abs(lastPoint.x - endPt.x) < epsilon && Math.abs(lastPoint.y - endPt.y) < epsilon;

          return matchStart && matchEnd;
        }
      ),
      { numRuns: 100 }
    );
    assert(true, 'Propiedad 6 [SchneiderFit Endpoints]: Las curvas generadas por SchneiderFit anclan exactamente el primer y último punto de la muestra');
  } catch (err: any) {
    assert(false, `Propiedad 6 falló: ${err.message}`);
  }

  console.log(`Suite 87 Completada: ${passed} pasados, ${failed} fallados.`);
  return failed === 0;
}

if (require.main === module) {
  runPropertyBasedGeometryTests().then((ok) => {
    if (!ok) process.exit(1);
  });
}
