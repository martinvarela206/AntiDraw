import type { CompanionMetadata } from '../../bridge/VsCodeBridge.js';

export interface CssRuleEntry {
  selector: string;
  specificity: number;
  declarations: Record<string, string>;
  variables: Record<string, string>;
}

export interface MatchedStylesResult {
  declarations: Record<string, string>;
  variables: Record<string, string>;
}

export class CssStyleResolver {
  private globalVariables: Record<string, string> = {};
  private rules: CssRuleEntry[] = [];

  constructor() {}

  /**
   * Registers a global CSS variable (--name -> value).
   */
  public setGlobalVariable(name: string, value: string): void {
    const key = name.startsWith('--') ? name : `--${name}`;
    this.globalVariables[key] = value.trim();
  }

  /**
   * Retrieves a global CSS variable if defined.
   */
  public getGlobalVariable(name: string): string | undefined {
    const key = name.startsWith('--') ? name : `--${name}`;
    return this.globalVariables[key];
  }

  /**
   * Returns a copy of all registered global CSS variables.
   */
  public getAllGlobalVariables(): Record<string, string> {
    return { ...this.globalVariables };
  }

  /**
   * Returns whether any CSS rules or custom properties have been registered.
   */
  public hasRulesOrVariables(): boolean {
    return this.rules.length > 0 || Object.keys(this.globalVariables).length > 0;
  }

  /**
   * Parses raw CSS stylesheet text, extracting CSS variables and rules with specificity weights.
   */
  public parseCssText(cssText: string): void {
    if (!cssText || !cssText.trim()) return;

    // Strip comments (/* ... */)
    const sanitizedCss = cssText.replace(/\/\*[\s\S]*?\*\//g, '');

    // Match rules: selector { declarations }
    const ruleRegex = /([^{]+)\{([^}]+)\}/g;
    let match: RegExpExecArray | null;

    while ((match = ruleRegex.exec(sanitizedCss)) !== null) {
      const rawSelectors = match[1].trim();
      const rawBody = match[2].trim();

      const decls: Record<string, string> = {};
      const vars: Record<string, string> = {};

      // Parse declarations: prop: val;
      const declPairs = rawBody.split(';');
      for (const pair of declPairs) {
        const colon = pair.indexOf(':');
        if (colon <= 0) continue;
        const prop = pair.substring(0, colon).trim().toLowerCase();
        const val = pair.substring(colon + 1).trim();
        if (!prop || !val) continue;

        if (prop.startsWith('--')) {
          vars[prop] = val;
          // Also set in global variables if root-like
          if (rawSelectors.includes(':root') || rawSelectors.includes('svg') || rawSelectors.includes('*')) {
            this.globalVariables[prop] = val;
          }
        } else {
          decls[prop] = val;
        }
      }

      // Split multiple comma-separated selectors (e.g., '.cls-1, .cls-2')
      const selectorList = rawSelectors.split(',').map((s) => s.trim()).filter(Boolean);
      for (const sel of selectorList) {
        const specificity = this.calculateSpecificity(sel);
        this.rules.push({
          selector: sel,
          specificity,
          declarations: { ...decls },
          variables: { ...vars },
        });

        // If selector is root or global, register variables directly
        if (sel === ':root' || sel === 'svg' || sel === '*' || sel === 'html') {
          Object.assign(this.globalVariables, vars);
        }
      }
    }

    // Sort rules by specificity ascending so higher specificity rules can override lower ones
    this.rules.sort((a, b) => a.specificity - b.specificity);
  }

  /**
   * Computes a numeric specificity score for simple SVG CSS selectors:
   * - Universal / root (:root, *, svg): 0
   * - Element tag (e.g. rect, path): 1
   * - Class selector (e.g. .icon): 10
   * - Compound tag + class (e.g. rect.icon): 11
   * - Attribute selector (e.g. [data-role]): 10
   * - ID selector (e.g. #hero): 100
   * - ID + class / tag: > 100
   */
  public calculateSpecificity(selector: string): number {
    let score = 0;
    const clean = selector.trim();
    if (clean === ':root' || clean === 'svg' || clean === '*' || clean === 'html') {
      return 0;
    }

    // Count IDs (#...)
    const idMatches = clean.match(/#[a-zA-Z0-9_-]+/g);
    if (idMatches) {
      score += idMatches.length * 100;
    }

    // Count classes (....)
    const classMatches = clean.match(/\.[a-zA-Z0-9_-]+/g);
    if (classMatches) {
      score += classMatches.length * 10;
    }

    // Count attribute selectors ([...])
    const attrMatches = clean.match(/\[[^\]]+\]/g);
    if (attrMatches) {
      score += attrMatches.length * 10;
    }

    // Check for tag name
    const tagMatch = clean.match(/^[a-zA-Z0-9_-]+/);
    if (tagMatch) {
      score += 1;
    }

    return score;
  }

  /**
   * Matches all applicable CSS rules for a given element and returns merged declarations and variables.
   */
  public matchElement(
    tagName: string,
    id: string | null,
    classes: string[]
  ): MatchedStylesResult {
    if (this.rules.length === 0) {
      return {
        declarations: {},
        variables: this.globalVariables,
      };
    }

    const mergedDecls: Record<string, string> = {};
    const mergedVars: Record<string, string> = { ...this.globalVariables };

    const lowerTag = tagName.toLowerCase();
    const classSet = new Set(classes.map((c) => c.toLowerCase()));

    for (const rule of this.rules) {
      const sel = rule.selector.trim().toLowerCase();

      let isMatch = false;

      if (sel === '*' || sel === lowerTag) {
        isMatch = true;
      } else if (sel.startsWith('#') && id) {
        isMatch = sel.substring(1) === id.toLowerCase();
      } else if (sel.startsWith('.')) {
        isMatch = classSet.has(sel.substring(1));
      } else if (sel.includes('.')) {
        // Compound: e.g. 'rect.icon'
        const [targetTag, targetClass] = sel.split('.');
        if ((!targetTag || targetTag === lowerTag) && classSet.has(targetClass)) {
          isMatch = true;
        }
      }

      if (isMatch) {
        Object.assign(mergedDecls, rule.declarations);
        Object.assign(mergedVars, rule.variables);
      }
    }

    return {
      declarations: mergedDecls,
      variables: mergedVars,
    };
  }

  /**
   * Recursively resolves CSS variables formatted as var(--var-name, fallback) within a string.
   */
  public resolveVariables(
    value: string,
    localVars?: Record<string, string>,
    depth: number = 0
  ): string {
    if (!value || typeof value !== 'string' || !value.includes('var(') || depth > 8) {
      return value;
    }

    const varRegex = /var\(\s*(--[a-zA-Z0-9_-]+)(?:\s*,\s*([^)]+))?\s*\)/g;
    let hasMatch = false;

    const replaced = value.replace(varRegex, (_match, varName, fallback) => {
      hasMatch = true;
      const vName = varName.trim();
      const val = localVars?.[vName] ?? this.globalVariables[vName];

      if (val !== undefined && val !== null && val.trim() !== '') {
        return this.resolveVariables(val.trim(), localVars, depth + 1);
      }

      if (fallback !== undefined && fallback !== null) {
        return this.resolveVariables(fallback.trim(), localVars, depth + 1);
      }

      return '';
    });

    // If unresolved or nested, recurse once more if changed
    if (hasMatch && replaced.includes('var(')) {
      return this.resolveVariables(replaced, localVars, depth + 1);
    }

    return replaced;
  }

  /**
   * Resolves 'currentColor' in fill or stroke properties against the cascading color context.
   */
  public static resolveCurrentColor(
    colorValue: string | undefined,
    inheritedColor: string | undefined,
    canvasDefault: string = '#000000'
  ): { resolved: string; isCurrentColor: boolean } {
    if (!colorValue) return { resolved: '', isCurrentColor: false };
    const trimmed = colorValue.trim();
    if (trimmed.toLowerCase() === 'currentcolor') {
      const activeColor = inheritedColor && inheritedColor.trim() ? inheritedColor.trim() : canvasDefault;
      return { resolved: activeColor, isCurrentColor: true };
    }
    return { resolved: trimmed, isCurrentColor: false };
  }

  /**
   * Factory method: Scans an XML Document for all <style> nodes and populates a new CssStyleResolver.
   */
  public static fromDocument(
    doc: Document,
    companionMetadata?: CompanionMetadata | null
  ): CssStyleResolver {
    const resolver = new CssStyleResolver();

    if (companionMetadata?.canvas?.currentColor) {
      resolver.setGlobalVariable('--currentColor', companionMetadata.canvas.currentColor);
    }

    const styleNodes: Element[] = [];
    if (typeof doc.getElementsByTagName === 'function') {
      try {
        const found = doc.getElementsByTagName('style');
        if (found && found.length > 0) {
          for (let i = 0; i < found.length; i++) {
            styleNodes.push(found[i]);
          }
        }
      } catch (_e) {
        // Fallback
      }
    } else if (typeof doc.querySelectorAll === 'function') {
      try {
        const found = doc.querySelectorAll('style');
        if (found && found.length > 0) {
          for (let i = 0; i < found.length; i++) {
            styleNodes.push(found[i]);
          }
        }
      } catch (_e) {
        // Fallback
      }
    }

    for (const styleEl of styleNodes) {
      const text = styleEl.textContent || (styleEl as any).innerHTML || '';
      if (text) {
        resolver.parseCssText(text);
      }
    }

    return resolver;
  }
}
