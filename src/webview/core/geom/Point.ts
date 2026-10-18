/**
 * CAPA L0: Fundamentos Matemáticos (Zero DOM)
 * Representación inmutable y utilidades de cálculo para puntos bidimensionales.
 */

export interface Point {
  x: number;
  y: number;
}

export class PointUtils {
  /**
   * Crea un nuevo punto bidimensional.
   */
  public static create(x: number = 0, y: number = 0): Point {
    return { x, y };
  }

  /**
   * Clona un punto existente.
   */
  public static clone(p: Point): Point {
    return { x: p.x, y: p.y };
  }

  /**
   * Calcula la distancia euclidiana entre dos puntos.
   */
  public static distance(p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calcula la distancia euclidiana al cuadrado (optimización sin Math.sqrt).
   */
  public static distanceSq(p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return dx * dx + dy * dy;
  }

  /**
   * Suma dos puntos vectorialmente.
   */
  public static add(p1: Point, p2: Point): Point {
    return { x: p1.x + p2.x, y: p1.y + p2.y };
  }

  /**
   * Resta dos puntos vectorialmente (p1 - p2).
   */
  public static subtract(p1: Point, p2: Point): Point {
    return { x: p1.x - p2.x, y: p1.y - p2.y };
  }

  /**
   * Escala un punto por un factor numérico escalar.
   */
  public static scale(p: Point, factor: number): Point {
    return { x: p.x * factor, y: p.y * factor };
  }

  /**
   * Interpola linealmente entre dos puntos (lerp).
   */
  public static lerp(p1: Point, p2: Point, t: number): Point {
    return {
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
    };
  }

  /**
   * Determina si dos puntos son idénticos bajo una tolerancia numérica dada.
   */
  public static equals(p1: Point, p2: Point, tolerance: number = 1e-6): boolean {
    return Math.abs(p1.x - p2.x) <= tolerance && Math.abs(p1.y - p2.y) <= tolerance;
  }

  /**
   * Calcula el ángulo en radianes de p1 hacia p2.
   */
  public static angle(p1: Point, p2: Point): number {
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
  }

  /**
   * Calcula la magnitud (longitud euclidiana desde el origen).
   */
  public static magnitude(p: Point): number {
    return Math.sqrt(p.x * p.x + p.y * p.y);
  }

  /**
   * Normaliza un vector a longitud unitaria (o retorna (0, 0) si es nulo).
   */
  public static normalize(p: Point): Point {
    const mag = this.magnitude(p);
    if (mag <= 1e-12) return { x: 0, y: 0 };
    return { x: p.x / mag, y: p.y / mag };
  }

  /**
   * Constrains a target point relative to an origin point by snapping the ray angle
   * to discrete step increments (default 15° = Math.PI / 12).
   * Snapping to 15° increments inherently guarantees strict alignment along the X (0°, 180°)
   * and Y (90°, 270°) orthogonal axes while also supporting intermediate 15° multiples.
   */
  public static snapAngle(origin: Point, target: Point, stepRadians: number = Math.PI / 12): Point {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 1e-9) return { x: target.x, y: target.y };

    const rawAngle = Math.atan2(dy, dx);
    const snappedAngle = Math.round(rawAngle / stepRadians) * stepRadians;

    let nx = dist * Math.cos(snappedAngle);
    let ny = dist * Math.sin(snappedAngle);

    // Clean up floating point precision around orthogonal axes
    if (Math.abs(nx) < 1e-10) nx = 0;
    if (Math.abs(ny) < 1e-10) ny = 0;

    return {
      x: origin.x + nx,
      y: origin.y + ny,
    };
  }
}
