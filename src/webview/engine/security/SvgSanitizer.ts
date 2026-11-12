/**
 * ARCHITECTURAL RATIONALE: Dedicated SVG Ingestion Sanitizer (SvgSanitizer - L0/L1)
 *
 * 1. Single Responsibility Principle (SRP) & Zero-Trust Ingestion:
 *    Any SVG opened from a workspace is untrusted user input that may originate from
 *    external repositories or untrusted collaborators. SvgSanitizer inspects the parsed
 *    XML DOM tree before any elements or custom defs are ingested into VectorModel or
 *    projected into the Webview Chromium DOM.
 *
 * 2. W3C Tag Whitelist & Malicious Element Neutralization:
 *    Strictly purges executable tags: <script>, <foreignObject>, <iframe>, <embed>,
 *    <object>, <audio>, <video>, <applet>, <meta>, <link>, <form>, <input>, etc.
 *
 * 3. Event Handler Eradication (CWE-79 / Stored XSS Prevention):
 *    Systematically strips all attributes matching /^on[a-z]+/i (e.g. onload, onclick,
 *    onerror, onmouseover, onfocus) from every node in the document.
 *
 * 4. Dangerous URI Scheme Stripping:
 *    Neutralizes href, xlink:href, and src attributes containing executable schemes
 *    (javascript:, vbscript:, data:text/html) while preserving legitimate internal
 *    fragment anchors (#id), safe data URIs (data:image/*), and local relative assets.
 *
 * 5. Style Sheet Boundary Protection:
 *    Neutralizes CSS @import directives and dangerous url() schemes inside <style> tags
 *    to prevent external resource exfiltration and styling hijack.
 */

export interface SanitizationResult {
  removedElementsCount: number;
  removedAttributesCount: number;
  neutralizedStylesCount: number;
}

export class SvgSanitizer {
  /**
   * Blacklisted SVG and HTML elements capable of code execution, external loading,
   * or container breakout.
   */
  private static readonly DISALLOWED_ELEMENT_TAGS = new Set([
    'script',
    'foreignobject',
    'iframe',
    'embed',
    'object',
    'applet',
    'audio',
    'video',
    'meta',
    'link',
    'form',
    'input',
    'button',
    'select',
    'textarea',
    'frame',
    'frameset',
  ]);

  /**
   * Neutralizes DOCTYPE declarations and internal/external XML entities
   * to protect against XML Entity Expansion (Billion Laughs / DoS) and XXE attacks.
   */
  public static stripDoctypeAndEntities(xml: string): { sanitizedXml: string; strippedCount: number } {
    if (!xml || typeof xml !== 'string') return { sanitizedXml: '', strippedCount: 0 };
    let strippedCount = 0;

    // Match <!DOCTYPE ... [ ... ]> or <!DOCTYPE ... >
    let sanitized = xml.replace(/<!DOCTYPE\s+[^>[\]]*(?:\[[\s\S]*?\])?\s*>/gi, () => {
      strippedCount++;
      return '<!-- [AntiDraw: Sanitized DOCTYPE] -->';
    });

    // Neutralize any standalone or stray <!ENTITY ...> declarations
    sanitized = sanitized.replace(/<!ENTITY\s+[\s\S]*?>/gi, () => {
      strippedCount++;
      return '<!-- [AntiDraw: Sanitized ENTITY] -->';
    });

    return { sanitizedXml: sanitized, strippedCount };
  }

  /**
   * Sanitizes an XML/SVG Document instance in place.
   * Compatible with browser DOMParser documents and LinkeDOM / xmldom documents.
   */
  public static sanitizeDocument(doc: Document): SanitizationResult {
    const result: SanitizationResult = {
      removedElementsCount: 0,
      removedAttributesCount: 0,
      neutralizedStylesCount: 0,
    };

    if (!doc) {
      return result;
    }

    if (doc.doctype) {
      try {
        doc.doctype.remove();
        result.removedElementsCount++;
      } catch {
        // Ignore if doctype cannot be removed
      }
    }

    if (!doc.documentElement) {
      return result;
    }

    // Traverse all elements starting from documentElement with depth limit
    this.sanitizeNodeRecursive(doc.documentElement, result, 0, 64);

    return result;
  }

  private static sanitizeNodeRecursive(
    element: Element,
    result: SanitizationResult,
    depth: number = 0,
    maxDepth: number = 64
  ): void {
    if (depth > maxDepth) {
      console.warn(
        `[AntiDraw:SvgSanitizer] Profundidad máxima (${maxDepth}) alcanzada en <${element.tagName}>. Truncando recursión.`
      );
      element.remove();
      result.removedElementsCount++;
      return;
    }
    // 1. Check if the element itself is disallowed
    const tagName = (element.tagName || '').toLowerCase().replace(/^.*:/, '');
    if (this.DISALLOWED_ELEMENT_TAGS.has(tagName)) {
      element.remove();
      result.removedElementsCount++;
      return;
    }

    // 2. Sanitize inline attributes
    const attrsToRemove: string[] = [];
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      const attrName = attr.name.toLowerCase();
      const attrValue = (attr.value || '').trim();

      // Eradicate event handlers (onload, onclick, onerror, etc.)
      if (/^on[a-z]/i.test(attrName)) {
        attrsToRemove.push(attr.name);
        continue;
      }

      // Check href, xlink:href, src for dangerous URI schemes
      if (attrName === 'href' || attrName === 'xlink:href' || attrName === 'src') {
        if (this.isDangerousUri(attrValue)) {
          attrsToRemove.push(attr.name);
          continue;
        }

        // For <use> elements, restrict external HTTP/HTTPS remote references
        if (tagName === 'use' && /^(https?:|\/\/)/i.test(attrValue)) {
          attrsToRemove.push(attr.name);
          continue;
        }
      }
    }

    for (const name of attrsToRemove) {
      element.removeAttribute(name);
      result.removedAttributesCount++;
    }

    // 3. Special handling for <style> elements
    if (tagName === 'style') {
      const originalText = element.textContent || '';
      const sanitizedText = this.sanitizeCssText(originalText);
      if (sanitizedText !== originalText) {
        element.textContent = sanitizedText;
        result.neutralizedStylesCount++;
      }
    }

    // 4. Recurse down children safely (copying children list to handle live mutations)
    const children = Array.from(element.children);
    for (const child of children) {
      this.sanitizeNodeRecursive(child, result, depth + 1, maxDepth);
    }
  }

  /**
   * Detects executable or dangerous URI schemes.
   */
  public static isDangerousUri(uri: string): boolean {
    if (!uri) return false;
    // Normalize decoded string to prevent evasion through URL encoding or whitespace tricks
    const decoded = decodeURIComponent(uri.replace(/[\u0000-\u001F\s]/g, '')).toLowerCase();
    if (decoded.startsWith('javascript:') || decoded.startsWith('vbscript:')) {
      return true;
    }
    if (decoded.startsWith('data:text/html') || decoded.startsWith('data:application/javascript')) {
      return true;
    }
    return false;
  }

  /**
   * Neutralizes CSS @import and executable url(javascript:...) calls.
   */
  public static sanitizeCssText(css: string): string {
    if (!css) return '';
    // Strip @import rules: @import url(...); or @import "...";
    let cleaned = css.replace(/@import\s+[^;]+;?/gi, '/* [AntiDraw: Sanitized @import] */');
    // Neutralize dangerous url(...) containing javascript, vbscript or data:text/html
    cleaned = cleaned.replace(
      /url\s*\(\s*(['"]?)\s*(?:javascript|vbscript|data:\s*text\/html)[\s\S]*?\1\s*\)/gi,
      'none'
    );
    // Neutralize any stray javascript: or vbscript: tokens
    cleaned = cleaned.replace(/(?:javascript|vbscript)\s*:[^;}"']*/gi, '/* [Sanitized] */');
    return cleaned;
  }
}
