import { IsomorphicXmlParserFactory } from './XmlParser.js';

export interface XmlDiffResult {
  areEqual: boolean;
  differences: string[];
}

export interface CanonicalXmlComparisonOptions {
  numericTolerance?: number;
  ignoreWhitespace?: boolean;
  ignoredAttributes?: string[];
  canonicalSortAttributes?: boolean;
}

/**
 * ARCHITECTURAL RATIONALE: Canonical XML Tree Comparison Service (CanonicalXmlComparator)
 *
 * Provides deterministic, whitespace-independent, and floating-point resilient comparison
 * of SVG documents for round-trip validation and zero-loss semantic verification.
 *
 * Features:
 * 1. Attribute Order Invariance: Compares attributes as sorted canonical maps.
 * 2. Numeric Epsilon Tolerance: Accommodates sub-pixel floating point rounding differences.
 * 3. Path Data (d) Semantic Equivalence: Tokenizes SVG path commands and verifies coordinates numerically.
 * 4. Structural Hierarchy Alignment: Recursively validates element tags, nesting, and text contents.
 */
export class CanonicalXmlComparator {
  public static compare(
    xmlA: string,
    xmlB: string,
    options: CanonicalXmlComparisonOptions = {}
  ): XmlDiffResult {
    const opts: Required<CanonicalXmlComparisonOptions> = {
      numericTolerance: options.numericTolerance ?? 0.01,
      ignoreWhitespace: options.ignoreWhitespace ?? true,
      ignoredAttributes: options.ignoredAttributes ?? [],
      canonicalSortAttributes: options.canonicalSortAttributes ?? true,
    };

    const diffs: string[] = [];

    try {
      const docA = IsomorphicXmlParserFactory.parse(xmlA.trim(), 'image/svg+xml');
      const docB = IsomorphicXmlParserFactory.parse(xmlB.trim(), 'image/svg+xml');

      const rootA = docA.querySelector('svg') || docA.documentElement;
      const rootB = docB.querySelector('svg') || docB.documentElement;

      if (!rootA && !rootB) {
        return { areEqual: true, differences: [] };
      }
      if (!rootA || !rootB) {
        diffs.push(`Root element mismatch: docA has <${rootA?.tagName}>, docB has <${rootB?.tagName}>`);
        return { areEqual: false, differences: diffs };
      }

      this.compareElements(rootA, rootB, 'svg', opts, diffs);
    } catch (err: any) {
      diffs.push(`XML Parsing exception during canonical comparison: ${err.message}`);
    }

    return {
      areEqual: diffs.length === 0,
      differences: diffs,
    };
  }

  private static compareElements(
    elA: Element,
    elB: Element,
    path: string,
    opts: Required<CanonicalXmlComparisonOptions>,
    diffs: string[]
  ): void {
    const tagA = elA.tagName.toLowerCase();
    const tagB = elB.tagName.toLowerCase();

    if (tagA !== tagB) {
      diffs.push(`Tag name mismatch at ${path}: <${tagA}> !== <${tagB}>`);
      return;
    }

    // Compare attributes
    this.compareAttributes(elA, elB, path, opts, diffs);

    // Compare child elements (excluding comments and whitespace-only text)
    const childrenA = Array.from(elA.children);
    const childrenB = Array.from(elB.children);

    if (childrenA.length !== childrenB.length) {
      diffs.push(
        `Child count mismatch at ${path}: ${childrenA.length} children in A vs ${childrenB.length} children in B`
      );
    }

    const minCount = Math.min(childrenA.length, childrenB.length);
    for (let i = 0; i < minCount; i++) {
      const childA = childrenA[i];
      const childB = childrenB[i];
      const childPath = `${path} > ${childA.tagName.toLowerCase()}[${i}]`;
      this.compareElements(childA, childB, childPath, opts, diffs);
    }

    // If text element, compare textContent
    if (tagA === 'text' || tagA === 'tspan') {
      const textA = (elA.textContent || '').trim();
      const textB = (elB.textContent || '').trim();
      if (textA !== textB) {
        diffs.push(`Text content mismatch at ${path}: "${textA}" !== "${textB}"`);
      }
    }
  }

  private static compareAttributes(
    elA: Element,
    elB: Element,
    path: string,
    opts: Required<CanonicalXmlComparisonOptions>,
    diffs: string[]
  ): void {
    const attrsA: Record<string, string> = {};
    const attrsB: Record<string, string> = {};

    for (let i = 0; i < elA.attributes.length; i++) {
      const a = elA.attributes[i];
      if (!opts.ignoredAttributes.includes(a.name)) {
        attrsA[a.name] = a.value;
      }
    }
    for (let i = 0; i < elB.attributes.length; i++) {
      const b = elB.attributes[i];
      if (!opts.ignoredAttributes.includes(b.name)) {
        attrsB[b.name] = b.value;
      }
    }

    const allKeys = new Set([...Object.keys(attrsA), ...Object.keys(attrsB)]);

    for (const key of allKeys) {
      const valA = attrsA[key];
      const valB = attrsB[key];

      if (valA === undefined) {
        diffs.push(`Missing attribute '${key}' in A at ${path} (B has: "${valB}")`);
        continue;
      }
      if (valB === undefined) {
        diffs.push(`Missing attribute '${key}' in B at ${path} (A has: "${valA}")`);
        continue;
      }

      if (key === 'd') {
        // Path command comparison with numeric tolerance
        if (!this.arePathDataEquivalent(valA, valB, opts.numericTolerance)) {
          diffs.push(`Path 'd' attribute divergence at ${path}: \n  A: "${valA}"\n  B: "${valB}"`);
        }
      } else if (key === 'transform') {
        // Normalized transform comparison
        if (!this.areTransformsEquivalent(valA, valB, opts.numericTolerance)) {
          diffs.push(`Transform divergence at ${path}: \n  A: "${valA}"\n  B: "${valB}"`);
        }
      } else if (this.isNumeric(valA) && this.isNumeric(valB)) {
        const numA = parseFloat(valA);
        const numB = parseFloat(valB);
        if (Math.abs(numA - numB) > opts.numericTolerance) {
          diffs.push(`Numeric attribute '${key}' mismatch at ${path}: ${valA} !== ${valB}`);
        }
      } else if (this.isColor(valA) && this.isColor(valB)) {
        if (this.normalizeColor(valA) !== this.normalizeColor(valB)) {
          diffs.push(`Color attribute '${key}' mismatch at ${path}: ${valA} !== ${valB}`);
        }
      } else {
        const cleanA = opts.ignoreWhitespace ? valA.replace(/\s+/g, ' ').trim() : valA;
        const cleanB = opts.ignoreWhitespace ? valB.replace(/\s+/g, ' ').trim() : valB;
        if (cleanA !== cleanB) {
          diffs.push(`Attribute '${key}' value mismatch at ${path}: "${cleanA}" !== "${cleanB}"`);
        }
      }
    }
  }

  private static isNumeric(val: string): boolean {
    return /^[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?$/.test(val.trim());
  }

  private static isColor(val: string): boolean {
    const v = val.trim().toLowerCase();
    return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v);
  }

  private static normalizeColor(val: string): string {
    let v = val.trim().toLowerCase();
    if (v.startsWith('#') && v.length === 4) {
      // #rgb -> #rrggbb
      v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    }
    return v;
  }

  public static arePathDataEquivalent(dA: string, dB: string, tolerance: number): boolean {
    const tokensA = this.tokenizePathD(dA);
    const tokensB = this.tokenizePathD(dB);

    if (tokensA.length !== tokensB.length) return false;

    for (let i = 0; i < tokensA.length; i++) {
      const tA = tokensA[i];
      const tB = tokensB[i];

      if (this.isNumeric(tA) && this.isNumeric(tB)) {
        if (Math.abs(parseFloat(tA) - parseFloat(tB)) > tolerance) {
          return false;
        }
      } else if (tA.toUpperCase() !== tB.toUpperCase()) {
        return false;
      }
    }

    return true;
  }

  private static tokenizePathD(d: string): string[] {
    const regex = /([a-zA-Z])|([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)/g;
    const tokens: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(d)) !== null) {
      tokens.push(match[0]);
    }
    return tokens;
  }

  public static areTransformsEquivalent(tA: string, tB: string, tolerance: number): boolean {
    const tokensA = this.tokenizePathD(tA);
    const tokensB = this.tokenizePathD(tB);

    if (tokensA.length !== tokensB.length) return false;

    for (let i = 0; i < tokensA.length; i++) {
      const a = tokensA[i];
      const b = tokensB[i];
      if (this.isNumeric(a) && this.isNumeric(b)) {
        if (Math.abs(parseFloat(a) - parseFloat(b)) > tolerance) return false;
      } else if (a.toLowerCase() !== b.toLowerCase()) {
        return false;
      }
    }
    return true;
  }
}
