/**
 * CAPA L0: Fundamentos Matemáticos (Zero DOM)
 * Representación inmutable de un rectángulo delimitador (Bounding Box / AABB).
 */

import { Point } from './Point.js';

export class Rect {
  public readonly x: number;
  public readonly y: number;
  public readonly width: number;
  public readonly height: number;

  constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
    this.x = x;
    this.y = y;
    this.width = Math.max(0, width);
    this.height = Math.max(0, height);
  }

  public get minX(): number {
    return this.x;
  }

  public get minY(): number {
    return this.y;
  }

  public get maxX(): number {
    return this.x + this.width;
  }

  public get maxY(): number {
    return this.y + this.height;
  }

  public get left(): number {
    return this.minX;
  }

  public get top(): number {
    return this.minY;
  }

  public get right(): number {
    return this.maxX;
  }

  public get bottom(): number {
    return this.maxY;
  }

  public get centerX(): number {
    return this.x + this.width / 2;
  }

  public get centerY(): number {
    return this.y + this.height / 2;
  }

  public get center(): Point {
    return { x: this.centerX, y: this.centerY };
  }

  public get isEmpty(): boolean {
    return this.width <= 0 || this.height <= 0;
  }

  /**
   * Crea un Rect a partir de dos puntos (ej: inicio y fin de arrastre).
   */
  public static fromCorners(p1: Point, p2: Point): Rect {
    const minX = Math.min(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxX = Math.max(p1.x, p2.x);
    const maxY = Math.max(p1.y, p2.y);
    return new Rect(minX, minY, maxX - minX, maxY - minY);
  }

  /**
   * Calcula el Rect envolvente mínimo a partir de un conjunto arbitrario de puntos.
   */
  public static fromPoints(pts: Point[]): Rect {
    if (!pts || pts.length === 0) {
      return new Rect(0, 0, 0, 0);
    }
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

    if (!isFinite(minX) || !isFinite(minY)) {
      return new Rect(0, 0, 0, 0);
    }

    return new Rect(minX, minY, maxX - minX, maxY - minY);
  }

  /**
   * Crea un Rect centrado en un punto dado.
   */
  public static fromCenter(center: Point, width: number, height: number): Rect {
    return new Rect(center.x - width / 2, center.y - height / 2, width, height);
  }

  /**
   * Determina si un punto se encuentra dentro de los límites del rectángulo.
   */
  public containsPoint(p: Point, inclusive: boolean = true): boolean {
    if (inclusive) {
      return p.x >= this.minX && p.x <= this.maxX && p.y >= this.minY && p.y <= this.maxY;
    }
    return p.x > this.minX && p.x < this.maxX && p.y > this.minY && p.y < this.maxY;
  }

  /**
   * Determina si este rectángulo se intersecta con otro.
   */
  public intersects(other: Rect): boolean {
    return !(
      other.maxX < this.minX ||
      other.minX > this.maxX ||
      other.maxY < this.minY ||
      other.minY > this.maxY
    );
  }

  /**
   * Retorna la unión (caja mínima que contiene a ambos rectángulos).
   */
  public union(other: Rect): Rect {
    if (this.isEmpty) return other;
    if (other.isEmpty) return this;

    const minX = Math.min(this.minX, other.minX);
    const minY = Math.min(this.minY, other.minY);
    const maxX = Math.max(this.maxX, other.maxX);
    const maxY = Math.max(this.maxY, other.maxY);

    return new Rect(minX, minY, maxX - minX, maxY - minY);
  }

  /**
   * Expande o contrae el rectángulo por un margen dado en todas direcciones.
   */
  public expand(amount: number): Rect {
    return new Rect(
      this.x - amount,
      this.y - amount,
      Math.max(0, this.width + amount * 2),
      Math.max(0, this.height + amount * 2)
    );
  }

  /**
   * Retorna una representación clonal.
   */
  public clone(): Rect {
    return new Rect(this.x, this.y, this.width, this.height);
  }

  /**
   * Retorna los 4 puntos de esquina en orden [TopLeft, TopRight, BottomRight, BottomLeft].
   */
  public toCorners(): [Point, Point, Point, Point] {
    return [
      { x: this.minX, y: this.minY },
      { x: this.maxX, y: this.minY },
      { x: this.maxX, y: this.maxY },
      { x: this.minX, y: this.maxY },
    ];
  }
}
