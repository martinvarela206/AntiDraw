/**
 * AntiDraw HostSaveValidator
 * 
 * Capa de validación estricta de guardado en el Host (L0/L3/L4).
 * Previene la corrupción de archivos SVG y .adrw verificando:
 * 1. Estructura básica XML/SVG mínima no truncada.
 * 2. Ausencia de valores geométricos o numéricos corruptos (NaN, Infinity, undefined, [object Object]).
 * 3. Protección contra vaciado catastrófico o caída anómala de nodos vectoriales.
 */

export interface SvgValidationResult {
  isValid: boolean;
  error?: string;
  stats?: {
    nodeCount: number;
    previousNodeCount: number;
  };
}

export interface SaveValidationOptions {
  /** Permite guardar un documento intencionalmente vacío de formas (por defecto false) */
  allowEmpty?: boolean;
  /** Proporción máxima permitida de pérdida de nodos antes de alertar (por defecto 0.85 = 85%) */
  maxDropRatio?: number;
}

export class HostSaveValidator {
  private static readonly GEOMETRIC_TAG_REGEX = /<(?:\w+:)?(path|rect|circle|ellipse|line|polyline|polygon|text|image|use|g)\b[^>]*>/gi;

  // Regex específico para atributos geométricos críticos
  private static readonly GEOM_ATTR_CORRUPT_REGEX = /\b(d|points|transform|x|y|cx|cy|r|rx|ry|x1|y1|x2|y2|width|height|viewBox)\s*=\s*(["'])(?:(?!\2)[\s\S])*?((?:\[object\s+Object\]|\b(?:NaN|-?Infinity|undefined)\b))(?:(?!\2)[\s\S])*?\2/i;

  // Regex general para cualquier atributo en una etiqueta XML/SVG que contenga valores corruptos
  private static readonly TAG_CORRUPT_REGEX = /<[a-zA-Z0-9_:-]+(?:\s+[^>]*?)?\s+([a-zA-Z0-9_:-]+)\s*=\s*(["'])(?:(?!\2)[\s\S])*?((?:\[object\s+Object\]|\b(?:NaN|-?Infinity|undefined)\b))(?:(?!\2)[\s\S])*?\2[^>]*>/i;

  /**
   * Cuenta los elementos geométricos y estructurales presentes en el SVG.
   */
  public static countGeometricNodes(svg: string): number {
    if (!svg || typeof svg !== 'string') return 0;
    const matches = svg.match(HostSaveValidator.GEOMETRIC_TAG_REGEX);
    return matches ? matches.length : 0;
  }

  /**
   * Valida la integridad de un SVG antes de permitir su escritura en disco.
   *
   * @param newSvg Contenido SVG a validar.
   * @param previousSvg Contenido SVG previo (opcional) para comprobación de pérdida de nodos.
   * @param options Opciones adicionales de tolerancia.
   */
  public static validateSvgIntegrity(
    newSvg: unknown,
    previousSvg?: string,
    options: SaveValidationOptions = {}
  ): SvgValidationResult {
    if (typeof newSvg !== 'string') {
      return {
        isValid: false,
        error: 'El contenido del documento debe ser una cadena de texto válida.',
      };
    }

    const trimmed = newSvg.trim();
    if (trimmed.length < 20) {
      return {
        isValid: false,
        error: 'El documento SVG es demasiado corto o está truncado (< 20 caracteres).',
      };
    }

    const lower = trimmed.toLowerCase();
    if (!lower.includes('<svg') || !lower.includes('</svg>')) {
      return {
        isValid: false,
        error: 'El documento SVG carece de las etiquetas requeridas <svg> o </svg>.',
      };
    }

    // Detección de atributos geométricos corruptos (NaN, Infinity, undefined, [object Object])
    const geomCorruptMatch = trimmed.match(HostSaveValidator.GEOM_ATTR_CORRUPT_REGEX);
    if (geomCorruptMatch) {
      const attrName = geomCorruptMatch[1];
      const corruptToken = geomCorruptMatch[3];
      return {
        isValid: false,
        error: `Atributo geométrico corrupto detectado: '${attrName}' contiene el valor inválido '${corruptToken}'.`,
      };
    }

    const tagCorruptMatch = trimmed.match(HostSaveValidator.TAG_CORRUPT_REGEX);
    if (tagCorruptMatch) {
      const attrName = tagCorruptMatch[1];
      const corruptToken = tagCorruptMatch[3];
      return {
        isValid: false,
        error: `Valor numérico corrupto detectado en etiqueta SVG: atributo '${attrName}' contiene '${corruptToken}'.`,
      };
    }

    // Comprobación de conteo de nodos y protección contra caída catastrófica
    const newNodeCount = HostSaveValidator.countGeometricNodes(trimmed);
    const prevNodeCount = previousSvg ? HostSaveValidator.countGeometricNodes(previousSvg) : 0;

    const stats = {
      nodeCount: newNodeCount,
      previousNodeCount: prevNodeCount,
    };

    if (previousSvg && prevNodeCount > 0) {
      // Detección de vaciado total accidental
      if (newNodeCount === 0 && prevNodeCount >= 2 && !options.allowEmpty) {
        return {
          isValid: false,
          error: `Documento vaciado por completo: el documento previo contenía ${prevNodeCount} elementos y el nuevo contiene 0. Guardado bloqueado para evitar pérdida de datos.`,
          stats,
        };
      }

      // Detección de pérdida anómala masiva (por defecto >= 85% de pérdida en documentos de >= 10 nodos)
      const maxDropRatio = options.maxDropRatio ?? 0.85;
      if (prevNodeCount >= 10 && (!options.allowEmpty || newNodeCount > 0)) {
        const dropRatio = (prevNodeCount - newNodeCount) / prevNodeCount;
        if (dropRatio >= maxDropRatio) {
          return {
            isValid: false,
            error: `Pérdida anómala de elementos geométricos: caída drástica de ${prevNodeCount} a ${newNodeCount} nodos (${Math.round(dropRatio * 100)}% de pérdida). Guardado bloqueado por seguridad.`,
            stats,
          };
        }
      }
    }

    return {
      isValid: true,
      stats,
    };
  }
}
