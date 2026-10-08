/**
 * CAPA L0: Fundamentos de Color (Zero DOM)
 * Representación inmutable y utilidades de conversión para colores RGBA, Hex y palabras clave SVG.
 */

export interface RGBA {
  r: number; // 0 - 255
  g: number; // 0 - 255
  b: number; // 0 - 255
  a?: number; // 0 - 1 (default 1)
}

export interface HSLA {
  h: number; // 0 - 360
  s: number; // 0 - 100
  l: number; // 0 - 100
  a?: number; // 0 - 1 (default 1)
}

export class Color {
  public readonly r: number;
  public readonly g: number;
  public readonly b: number;
  public readonly a: number;

  constructor(r: number = 0, g: number = 0, b: number = 0, a: number = 1) {
    this.r = Math.round(Math.max(0, Math.min(255, r)));
    this.g = Math.round(Math.max(0, Math.min(255, g)));
    this.b = Math.round(Math.max(0, Math.min(255, b)));
    this.a = Math.max(0, Math.min(1, a));
  }

  public static readonly BLACK = new Color(0, 0, 0, 1);
  public static readonly WHITE = new Color(255, 255, 255, 1);
  public static readonly TRANSPARENT = new Color(0, 0, 0, 0);

  /**
   * Determina si un valor de color corresponde a la palabra clave estándar `currentColor`.
   */
  public static isCurrentColor(val?: string | null): boolean {
    if (!val) return false;
    return val.trim().toLowerCase() === 'currentcolor';
  }

  /**
   * Determina si un valor de color corresponde a la ausencia de relleno o trazo (`none`).
   */
  public static isNone(val?: string | null): boolean {
    if (!val) return true;
    const trimmed = val.trim().toLowerCase();
    return trimmed === 'none' || trimmed === 'transparent' || trimmed === '';
  }

  /**
   * Parsea un string CSS/SVG a una instancia de Color.
   * Soporta: #hex3, #hex6, #hex8, rgb(r, g, b), rgba(r, g, b, a).
   */
  public static parse(colorStr: string): Color | null {
    if (!colorStr) return null;
    const str = colorStr.trim().toLowerCase();

    if (this.isNone(str)) {
      return Color.TRANSPARENT;
    }

    // Formato Hex (#rgb, #rrggbb, #rrggbbaa)
    if (str.startsWith('#')) {
      const hex = str.slice(1);
      if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16);
        const g = parseInt(hex[1] + hex[1], 16);
        const b = parseInt(hex[2] + hex[2], 16);
        return new Color(r, g, b, 1);
      }
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return new Color(r, g, b, 1);
      }
      if (hex.length === 8) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        const a = parseInt(hex.slice(6, 8), 16) / 255;
        return new Color(r, g, b, a);
      }
      return null;
    }

    // Formato rgb() o rgba()
    const rgbMatch = str.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1], 10);
      const g = parseInt(rgbMatch[2], 10);
      const b = parseInt(rgbMatch[3], 10);
      const a = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;
      return new Color(r, g, b, a);
    }

    return null;
  }

  /**
   * Convierte a formato hexadecimal estándar `#rrggbb`.
   */
  public toHex(): string {
    const toHexPart = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHexPart(this.r)}${toHexPart(this.g)}${toHexPart(this.b)}`;
  }

  /**
   * Convierte a formato CSS `rgba(r, g, b, a)`.
   */
  public toRgbaString(): string {
    return `rgba(${this.r}, ${this.g}, ${this.b}, ${this.a})`;
  }

  /**
   * Calcula la luminancia relativa perceptiva según WCAG (0.0 a 1.0).
   */
  public get relativeLuminance(): number {
    const sRGB = [this.r / 255, this.g / 255, this.b / 255].map((val) => {
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
  }

  /**
   * Determina si el color es oscuro (útil para contrastar texto blanco/negro en UI).
   */
  public get isDark(): boolean {
    return this.relativeLuminance < 0.5;
  }
}
