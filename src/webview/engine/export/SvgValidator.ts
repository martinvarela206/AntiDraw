/**
 * ARCHITECTURAL RATIONALE: Pre-write Validation & Safe Save Guardian (SvgValidator - L2 Engine)
 *
 * VectorCraft Lesson (Module 07 / 08 - Robustness & Atomic Writes):
 * A graphical editor must never corrupt or wipe out user files due to runtime exceptions,
 * partial serializations, or malformed XML generation.
 *
 * Before any `updateDocument` payload is transmitted across the VS Code webview boundary,
 * `SvgValidator.validate` performs strict syntactic and structural validation:
 * 1. Type and presence verification (non-null string).
 * 2. Minimum length sanity check (preventing empty `""` or truncated fragments).
 * 3. Root `<svg>` and `</svg>` tag envelope matching.
 * 4. Structural XML parser audit (`DOMParser` with `<parsererror>` detection or fallback).
 */

export interface SvgValidationResult {
  isValid: boolean;
  error?: string;
}

export class SvgValidator {
  private static readonly MIN_SVG_LENGTH = 20;

  /**
   * Evaluates the integrity of an SVG string before allowing file persistence.
   */
  public static validate(svgContent: string | null | undefined): SvgValidationResult {
    if (svgContent === null || svgContent === undefined) {
      return { isValid: false, error: 'SVG content cannot be null or undefined' };
    }

    if (typeof svgContent !== 'string') {
      return { isValid: false, error: `Expected string for SVG content, received ${typeof svgContent}` };
    }

    const trimmed = svgContent.trim();
    if (trimmed.length < SvgValidator.MIN_SVG_LENGTH) {
      return {
        isValid: false,
        error: `SVG content is suspiciously too short (${trimmed.length} characters, minimum is ${SvgValidator.MIN_SVG_LENGTH})`
      };
    }

    const lower = trimmed.toLowerCase();
    const hasOpeningTag = lower.includes('<svg');
    const hasClosingTag = lower.includes('</svg>');

    if (!hasOpeningTag) {
      return { isValid: false, error: 'Missing root <svg> opening element' };
    }

    if (!hasClosingTag) {
      return { isValid: false, error: 'Missing root </svg> closing element' };
    }

    // Structural XML verification in Browser/Webview environment
    if (typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(trimmed, 'image/svg+xml');
        const parserError = doc.querySelector('parsererror');

        if (parserError) {
          const detail = (parserError.textContent || 'XML parsing failure').replace(/\s+/g, ' ').trim();
          return {
            isValid: false,
            error: `XML structural validation failed: ${detail.slice(0, 150)}`
          };
        }

        if (!doc.documentElement || doc.documentElement.tagName.toLowerCase() !== 'svg') {
          return {
            isValid: false,
            error: `Root XML element must be <svg>, found <${doc.documentElement ? doc.documentElement.tagName : 'unknown'}>`
          };
        }
      } catch (err: any) {
        return {
          isValid: false,
          error: `DOMParser runtime exception: ${err?.message || String(err)}`
        };
      }
    } else {
      // Safe fallback for Node.js test/benchmark environments without DOMParser
      const regexOpening = /<svg[\s>]/i;
      const regexClosing = /<\/svg\s*>/i;

      if (!regexOpening.test(trimmed) || !regexClosing.test(trimmed)) {
        return {
          isValid: false,
          error: 'Syntactic regex validation failed for SVG root tag bounds'
        };
      }
    }

    return { isValid: true };
  }
}
