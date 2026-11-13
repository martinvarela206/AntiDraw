import { IsomorphicXmlParserFactory } from './XmlParser.js';
import { VectorElement, VectorModel } from '../VectorModel.js';

export interface SvgMetadataCleanerOptions {
  stripThirdPartyNamespaces?: boolean;
  stripThirdPartyAttributes?: boolean;
  stripComments?: boolean;
  stripEditorTags?: boolean;
  stripInternalDataAttrs?: boolean;
  stripUnusedDefs?: boolean;
}

export interface SvgCleanResult {
  cleanedSvg: string;
  strippedNamespaces: string[];
  strippedTags: string[];
  strippedAttributesCount: number;
  commentsRemovedCount: number;
  unusedDefsRemovedCount: number;
}

const KNOWN_FOREIGN_NAMESPACES: Record<string, string> = {
  inkscape: 'http://www.inkscape.org/namespaces/inkscape',
  sodipodi: 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd',
  sketch: 'http://www.bohemiancoding.com/sketch/ns',
  figma: 'https://www.figma.com/format/svg',
  adobe: 'http://ns.adobe.com/AdobeIllustrator/10.0/',
  i: 'http://ns.adobe.com/AdobeIllustrator/10.0/',
  a: 'http://ns.adobe.com/GenericCustomNamespace/1.0/',
  serif: 'http://www.serif.com/',
  dc: 'http://purl.org/dc/elements/1.1/',
  cc: 'http://creativecommons.org/ns#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  v: 'http://schemas.microsoft.com/visio/2003/SVGExtensions/',
  custom: 'http://schemas.android.com/apk/res/android',
};

const KNOWN_EDITOR_TAG_PREFIXES = [
  'sodipodi:',
  'inkscape:',
  'i:',
  'adobe:',
  'sketch:',
  'figma:',
  'serif:',
  'rdf:',
  'dc:',
  'cc:',
];

const KNOWN_EDITOR_TAG_NAMES = new Set([
  'sodipodi:namedview',
  'inkscape:perspective',
  'inkscape:grid',
  'inkscape:path-effect',
  'i:pgf',
  'adobe:pgf',
  'metadata',
]);

/**
 * ARCHITECTURAL RATIONALE: Explicit On-Demand Metadata Sanitizer (SvgMetadataCleaner - L1/L3)
 *
 * Implements non-destructive preservation by default, paired with explicit user-triggered
 * sanitization to eliminate foreign editor bloat (Inkscape, Figma, Illustrator, Sketch)
 * without silent data corruption during normal edits.
 */
export class SvgMetadataCleaner {
  public static cleanSvg(
    svgText: string,
    options: SvgMetadataCleanerOptions = {}
  ): SvgCleanResult {
    const {
      stripThirdPartyNamespaces = true,
      stripThirdPartyAttributes = true,
      stripComments = true,
      stripEditorTags = true,
      stripInternalDataAttrs = true,
      stripUnusedDefs = true,
    } = options;

    const strippedNamespaces: string[] = [];
    const strippedTags: string[] = [];
    let strippedAttributesCount = 0;
    let commentsRemovedCount = 0;
    let unusedDefsRemovedCount = 0;

    if (!svgText || !svgText.trim()) {
      return {
        cleanedSvg: '',
        strippedNamespaces,
        strippedTags,
        strippedAttributesCount,
        commentsRemovedCount,
        unusedDefsRemovedCount,
      };
    }

    const doc = IsomorphicXmlParserFactory.parse(svgText, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) {
      return {
        cleanedSvg: svgText,
        strippedNamespaces,
        strippedTags,
        strippedAttributesCount,
        commentsRemovedCount,
        unusedDefsRemovedCount,
      };
    }

    const nodesToRemove: Node[] = [];

    // Recursive DOM tree traversal visiting all nodes (elements, comments, text)
    const visit = (node: Node) => {
      // 1. Comments
      if (node.nodeType === 8) {
        if (stripComments) {
          nodesToRemove.push(node);
          commentsRemovedCount++;
        }
        return;
      }

      // 2. Elements
      if (node.nodeType === 1) {
        const el = node as Element;
        const tagName = (el.tagName || el.nodeName || '').toLowerCase();
        const isEditorTag =
          KNOWN_EDITOR_TAG_NAMES.has(tagName) ||
          KNOWN_EDITOR_TAG_PREFIXES.some((prefix) => tagName.startsWith(prefix));

        if (stripEditorTags && isEditorTag && el !== svgEl) {
          nodesToRemove.push(el);
          strippedTags.push(tagName);
          return; // Stop descending into removed subtree
        }

        // 3. Clean Attributes on this Element
        if (el.attributes) {
          const attrsToRemove: string[] = [];
          for (let i = 0; i < el.attributes.length; i++) {
            const attr = el.attributes[i];
            const name = attr.name;
            const lowerName = name.toLowerCase();

            let shouldRemove = false;

            // Foreign editor attributes (inkscape:label, sodipodi:nodetypes, sketch:type, etc.)
            if (stripThirdPartyAttributes) {
              if (
                KNOWN_EDITOR_TAG_PREFIXES.some((p) => lowerName.startsWith(p)) ||
                (lowerName.includes(':') &&
                  !lowerName.startsWith('xmlns:') &&
                  !lowerName.startsWith('xlink:') &&
                  !lowerName.startsWith('xml:'))
              ) {
                shouldRemove = true;
              }
            }

            // Internal data-* attributes (data-antidraw-id, data-original-stroke, etc.)
            if (stripInternalDataAttrs) {
              if (lowerName.startsWith('data-') || lowerName.startsWith('antidraw:')) {
                shouldRemove = true;
              }
            }

            // Foreign namespace declarations (xmlns:inkscape, xmlns:sodipodi, etc.)
            if (stripThirdPartyNamespaces && lowerName.startsWith('xmlns:')) {
              const nsPrefix = lowerName.slice(6);
              if (nsPrefix in KNOWN_FOREIGN_NAMESPACES || !['xlink', 'svg'].includes(nsPrefix)) {
                shouldRemove = true;
                if (!strippedNamespaces.includes(lowerName)) {
                  strippedNamespaces.push(lowerName);
                }
              }
            }

            if (shouldRemove) {
              attrsToRemove.push(name);
            }
          }

          for (const attrName of attrsToRemove) {
            el.removeAttribute(attrName);
            strippedAttributesCount++;
          }
        }

        // Traverse children
        const childNodes = Array.from(el.childNodes || []);
        for (const child of childNodes) {
          visit(child);
        }
      }
    };

    // Traverse starting from doc root children (including root comments)
    for (const child of Array.from(doc.childNodes || [])) {
      visit(child);
    }

    // Execute queued node removals
    for (const n of nodesToRemove) {
      if (n.parentNode) {
        n.parentNode.removeChild(n);
      }
    }

    // 4. Prune Unused <defs>
    if (stripUnusedDefs) {
      const defsList = Array.from(doc.querySelectorAll('defs'));
      for (const defs of defsList) {
        const defChildren = Array.from(defs.children || []);
        if (defChildren.length === 0) continue;

        // Serialize full doc excluding defs to check reference presence
        const bodyContent = Array.from(doc.querySelectorAll('svg > *:not(defs)'))
          .map((n) => (n as any).outerHTML || (n as any).textContent || '')
          .join(' ');

        for (const defItem of defChildren) {
          const id = defItem.getAttribute('id');
          if (id) {
            const isReferenced =
              bodyContent.includes(`url(#${id})`) ||
              bodyContent.includes(`href="#${id}"`) ||
              bodyContent.includes(`xlink:href="#${id}"`) ||
              bodyContent.includes(`"#${id}"`);

            if (!isReferenced && defItem.parentNode) {
              defItem.parentNode.removeChild(defItem);
              unusedDefsRemovedCount++;
            }
          }
        }

        // If defs became completely empty, prune the <defs> tag itself
        if ((defs.children || []).length === 0 && defs.parentNode) {
          defs.parentNode.removeChild(defs);
        }
      }
    }

    // 5. Serialize Sanitized Document
    let cleanedSvg = '';
    if (typeof (doc as any).toString === 'function' && (doc as any).toString() !== '[object Object]') {
      cleanedSvg = (doc as any).toString();
    } else if (typeof XMLSerializer !== 'undefined') {
      cleanedSvg = new XMLSerializer().serializeToString(doc);
    } else {
      cleanedSvg = (doc as any).outerHTML || (doc.documentElement as any)?.outerHTML || '';
    }

    // 6. Regex Post-Pass: Ensure any namespace or comment missed by DOM serializer is stripped
    if (stripThirdPartyNamespaces) {
      cleanedSvg = cleanedSvg.replace(
        /\s*xmlns:(inkscape|sodipodi|sketch|figma|adobe|i|a|serif|dc|cc|rdf|v)="[^"]*"/gi,
        ''
      );
    }
    if (stripThirdPartyAttributes) {
      cleanedSvg = cleanedSvg.replace(
        /\s*(inkscape|sodipodi|sketch|figma|i|adobe|serif):[a-zA-Z0-9_-]+="[^"]*"/gi,
        ''
      );
    }
    if (stripInternalDataAttrs) {
      cleanedSvg = cleanedSvg.replace(/\s*data-[a-zA-Z0-9_-]+="[^"]*"/gi, '');
      cleanedSvg = cleanedSvg.replace(/\s*antidraw:[a-zA-Z0-9_-]+="[^"]*"/gi, '');
    }
    if (stripComments) {
      cleanedSvg = cleanedSvg.replace(/<!--[\s\S]*?-->/g, '');
    }

    // Clean empty lines
    cleanedSvg = cleanedSvg.replace(/\n\s*\n\s*\n/g, '\n\n').trim();

    return {
      cleanedSvg,
      strippedNamespaces,
      strippedTags,
      strippedAttributesCount,
      commentsRemovedCount,
      unusedDefsRemovedCount,
    };
  }

  public static cleanModel(
    model: VectorModel,
    options: SvgMetadataCleanerOptions = {}
  ): SvgCleanResult {
    const { stripThirdPartyAttributes = true, stripInternalDataAttrs = true } = options;

    let strippedAttributesCount = 0;

    const sanitizeElement = (el: VectorElement) => {
      if (el.attributes) {
        const keys = Object.keys(el.attributes);
        for (const k of keys) {
          const lowerK = k.toLowerCase();
          let remove = false;
          if (stripInternalDataAttrs && (lowerK.startsWith('data-') || lowerK.startsWith('antidraw:'))) {
            remove = true;
          }
          if (
            stripThirdPartyAttributes &&
            KNOWN_EDITOR_TAG_PREFIXES.some((p) => lowerK.startsWith(p))
          ) {
            remove = true;
          }
          if (remove) {
            delete el.attributes[k];
            strippedAttributesCount++;
          }
        }
      }

      if (el.children && el.children.length > 0) {
        for (const child of el.children) {
          sanitizeElement(child);
        }
      }
    };

    for (const el of model.elements) {
      sanitizeElement(el);
    }

    let cleanedSvg = '';
    let result: SvgCleanResult = {
      cleanedSvg: '',
      strippedNamespaces: [],
      strippedTags: [],
      strippedAttributesCount,
      commentsRemovedCount: 0,
      unusedDefsRemovedCount: 0,
    };

    if (model.sourceSvgText) {
      result = this.cleanSvg(model.sourceSvgText, options);
      result.strippedAttributesCount += strippedAttributesCount;
      model.sourceSvgText = result.cleanedSvg;
      cleanedSvg = result.cleanedSvg;
    } else {
      cleanedSvg = model.serializeSvg({ surgical: false, excludeContextual: true });
      result.cleanedSvg = cleanedSvg;
    }

    return result;
  }
}
