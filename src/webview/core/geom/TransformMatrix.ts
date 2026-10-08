/**
 * CAPA L0: Fundamentos Matemáticos (Zero DOM)
 * Representación inmutable de matrices de transformación afín 2D (3x3 con fila base [0, 0, 1]).
 * Equivalente al operador afín de SVG `matrix(a, b, c, d, e, f)`.
 */

import { Point } from './Point.js';

export interface QuadCorners {
  nw: Point;
  ne: Point;
  se: Point;
  sw: Point;
}

export interface BoundingBoxBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export class AffineMatrix {
  // [ a, c, tx ]
  // [ b, d, ty ]
  // [ 0, 0,  1 ]
  public readonly a: number;
  public readonly b: number;
  public readonly c: number;
  public readonly d: number;
  public readonly tx: number;
  public readonly ty: number;

  constructor(
    a: number = 1,
    b: number = 0,
    c: number = 0,
    d: number = 1,
    tx: number = 0,
    ty: number = 0
  ) {
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.tx = tx;
    this.ty = ty;
  }

  /**
   * Crea la matriz identidad (sin transformación).
   */
  public static identity(): AffineMatrix {
    return new AffineMatrix(1, 0, 0, 1, 0, 0);
  }

  /**
   * Crea una matriz de traslación.
   */
  public static translation(tx: number, ty: number): AffineMatrix {
    return new AffineMatrix(1, 0, 0, 1, tx, ty);
  }

  /**
   * Crea una matriz de rotación en radianes alrededor del origen (o alrededor de center).
   */
  public static rotation(radians: number, center?: Point): AffineMatrix {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    if (!center || (center.x === 0 && center.y === 0)) {
      return new AffineMatrix(cos, sin, -sin, cos, 0, 0);
    }
    // T(cx, cy) * R(theta) * T(-cx, -cy)
    return AffineMatrix.translation(center.x, center.y)
      .multiply(new AffineMatrix(cos, sin, -sin, cos, 0, 0))
      .multiply(AffineMatrix.translation(-center.x, -center.y));
  }

  /**
   * Crea una matriz de escalado.
   */
  public static scaling(sx: number, sy: number, center?: Point): AffineMatrix {
    if (!center || (center.x === 0 && center.y === 0)) {
      return new AffineMatrix(sx, 0, 0, sy, 0, 0);
    }
    return AffineMatrix.translation(center.x, center.y)
      .multiply(new AffineMatrix(sx, 0, 0, sy, 0, 0))
      .multiply(AffineMatrix.translation(-center.x, -center.y));
  }

  /**
   * Multiplica esta matriz por otra (this * other).
   */
  public multiply(other: AffineMatrix): AffineMatrix {
    return new AffineMatrix(
      this.a * other.a + this.c * other.b,
      this.b * other.a + this.d * other.b,
      this.a * other.c + this.c * other.d,
      this.b * other.c + this.d * other.d,
      this.a * other.tx + this.c * other.ty + this.tx,
      this.b * other.tx + this.d * other.ty + this.ty
    );
  }

  /**
   * Aplica la transformación afín a un punto 2D.
   */
  public applyToPoint(p: Point): Point {
    return {
      x: this.a * p.x + this.c * p.y + this.tx,
      y: this.b * p.x + this.d * p.y + this.ty,
    };
  }

  /**
   * Calcula el determinante de la matriz.
   */
  public determinant(): number {
    return this.a * this.d - this.b * this.c;
  }

  /**
   * Invierte la matriz (retorna null si es singular / no invertible).
   */
  public invert(): AffineMatrix | null {
    const det = this.determinant();
    if (Math.abs(det) < 1e-12) {
      return null;
    }
    const invDet = 1 / det;
    return new AffineMatrix(
      this.d * invDet,
      -this.b * invDet,
      -this.c * invDet,
      this.a * invDet,
      (this.c * this.ty - this.d * this.tx) * invDet,
      (this.b * this.tx - this.a * this.ty) * invDet
    );
  }

  /**
   * Retorna la representación CSS/SVG `matrix(a, b, c, d, e, f)`.
   */
  public toSvgString(): string {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.tx}, ${this.ty})`;
  }
}
