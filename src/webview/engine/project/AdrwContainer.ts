export interface ArtboardDef {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor?: string;
  sourcePageIndex?: number;
}

export interface AdrwProjectMetadata {
  name: string;
  created: number;
  modified: number;
  generator: string;
  sourceSvg?: string;
}

export interface AdrwContainer {
  format: 'antidraw';
  version: '1.0';
  metadata: AdrwProjectMetadata;
  canvas: {
    width: number;
    height: number;
    viewBox: string;
    backgroundColor: string;
  };
  artboards: ArtboardDef[];
  activeArtboardId: string;
  svgContent: string;
  companionMetadata?: any;
}

/**
 * ARCHITECTURAL RATIONALE: AntiDraw Native Project Container (.adrw)
 *
 * 1. Isolated Project Container (.adrw vs .svg):
 *    - .adrw is a robust JSON project bundle holding multi-artboard definitions,
 *      infinite canvas metadata, companion layers, and project state.
 *    - Opening an .svg file converts/generates an .adrw container so designers work
 *      strictly within the project environment without destructively modifying source SVGs.
 *
 * 2. Inkscape Multi-Page Ingestion (<inkscape:page>):
 *    - Automatically identifies and ingests <inkscape:page> elements into native ArtboardDef
 *      structures preserving coordinates, dimensions, and custom labels.
 *
 * 3. Lossless Multi-Artboard W3C SVG Extraction:
 *    - Extracts pure, clean W3C SVGs for each Artboard with precise viewBox bounding,
 *      free of proprietary attributes, ready for production use or web delivery.
 */
export class AdrwProjectService {
  /**
   * Parses Inkscape multi-page tags (<inkscape:page ... />) from raw SVG markup.
   */
  public static extractInkscapePages(svgText: string): ArtboardDef[] {
    const artboards: ArtboardDef[] = [];
    if (!svgText) return artboards;

    // Match inkscape:page tags
    const pageRegex = /<inkscape:page\b([^>]*?)(?:\/>|>(.*?)<\/inkscape:page>)/gis;
    let match: RegExpExecArray | null;
    let pageIdx = 1;

    while ((match = pageRegex.exec(svgText)) !== null) {
      const attrsStr = match[1] || '';

      const getAttr = (name: string): string | null => {
        const attrRegex = new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`, 'i');
        const m = attrRegex.exec(attrsStr);
        return m ? m[1] : null;
      };

      const x = parseFloat(getAttr('x') || '0') || 0;
      const y = parseFloat(getAttr('y') || '0') || 0;
      const width = parseFloat(getAttr('width') || '800') || 800;
      const height = parseFloat(getAttr('height') || '600') || 600;
      const label = getAttr('inkscape:label') || getAttr('label') || getAttr('id') || `Página ${pageIdx}`;
      const id = getAttr('id') || `artboard_page_${pageIdx}_${Date.now().toString(36)}`;

      artboards.push({
        id,
        name: label,
        x,
        y,
        width,
        height,
        backgroundColor: '#ffffff',
        sourcePageIndex: pageIdx,
      });

      pageIdx++;
    }

    return artboards;
  }

  /**
   * Extracts canvas dimensions and viewBox from SVG root tag.
   */
  public static extractSvgCanvasMetrics(svgText: string): {
    width: number;
    height: number;
    viewBox: string;
  } {
    const defaultMetrics = { width: 800, height: 600, viewBox: '0 0 800 600' };
    if (!svgText) return defaultMetrics;

    const rootMatch = /<svg\b([^>]*)>/i.exec(svgText);
    if (!rootMatch) return defaultMetrics;

    const attrs = rootMatch[1];
    const getAttr = (name: string): string | null => {
      const attrRegex = new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`, 'i');
      const m = attrRegex.exec(attrs);
      return m ? m[1] : null;
    };

    const vb = getAttr('viewBox');
    let width = parseFloat(getAttr('width') || '');
    let height = parseFloat(getAttr('height') || '');

    if (vb) {
      const parts = vb.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && !isNaN(parts[2]) && !isNaN(parts[3])) {
        if (isNaN(width) || width <= 0) width = parts[2];
        if (isNaN(height) || height <= 0) height = parts[3];
        return {
          width: width || 800,
          height: height || 600,
          viewBox: vb,
        };
      }
    }

    width = isNaN(width) || width <= 0 ? 800 : width;
    height = isNaN(height) || height <= 0 ? 600 : height;

    return {
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
    };
  }

  /**
   * Generates a new .adrw container from raw SVG text and optional companion metadata.
   */
  public static createFromSvg(
    svgText: string,
    fileName: string,
    companionMetadata?: any
  ): AdrwContainer {
    const baseName = fileName.replace(/\.(svg|adrw)$/i, '') || 'Untitled';
    const metrics = this.extractSvgCanvasMetrics(svgText);
    const inkscapePages = this.extractInkscapePages(svgText);

    let artboards: ArtboardDef[] = [];
    if (inkscapePages.length > 0) {
      artboards = inkscapePages;
    } else {
      artboards = [
        {
          id: `artboard_1_${Date.now().toString(36)}`,
          name: baseName,
          x: 0,
          y: 0,
          width: metrics.width,
          height: metrics.height,
          backgroundColor: '#ffffff',
          sourcePageIndex: 1,
        },
      ];
    }

    const container: AdrwContainer = {
      format: 'antidraw',
      version: '1.0',
      metadata: {
        name: baseName,
        created: Date.now(),
        modified: Date.now(),
        generator: 'AntiDraw v0.101.1',
        sourceSvg: fileName.endsWith('.svg') ? fileName : `${baseName}.svg`,
      },
      canvas: {
        width: metrics.width,
        height: metrics.height,
        viewBox: metrics.viewBox,
        backgroundColor: '#ffffff',
      },
      artboards,
      activeArtboardId: artboards[0].id,
      svgContent: svgText,
      companionMetadata: companionMetadata || null,
    };

    return container;
  }

  /**
   * Serializes an AdrwContainer into formatted JSON string.
   */
  public static serializeContainer(container: AdrwContainer): string {
    return JSON.stringify(container, null, 2);
  }

  /**
   * Deserializes a JSON string into an AdrwContainer, with auto-healing.
   */
  public static parseContainer(jsonText: string, fallbackFileName: string = 'Untitled'): AdrwContainer {
    try {
      const parsed = JSON.parse(jsonText);
      if (parsed && parsed.format === 'antidraw' && parsed.artboards && parsed.svgContent !== undefined) {
        return parsed as AdrwContainer;
      }
    } catch {
      // Fallback: check if text is raw SVG
    }

    // Auto-heal if raw SVG was passed as .adrw
    if (typeof jsonText === 'string' && jsonText.includes('<svg')) {
      return this.createFromSvg(jsonText, fallbackFileName);
    }

    // Default empty container
    const defaultSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">\n</svg>`;
    return this.createFromSvg(defaultSvg, fallbackFileName);
  }

  /**
   * Extracts clean, pure W3C SVG for a specific artboard.
   */
  public static extractArtboardSvg(container: AdrwContainer, artboardId?: string): string {
    const targetId = artboardId || container.activeArtboardId;
    const artboard = container.artboards.find((ab) => ab.id === targetId) || container.artboards[0];

    let svg = container.svgContent || '';
    if (!svg || !svg.includes('<svg')) {
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${artboard.x} ${artboard.y} ${artboard.width} ${artboard.height}" width="${artboard.width}" height="${artboard.height}">\n</svg>`;
      return svg;
    }

    // Replace viewBox, width, height in root <svg> tag
    svg = svg.replace(/<svg\b([^>]*)>/i, (_m, attrs) => {
      let cleanAttrs = attrs
        .replace(/\bviewBox=["'][^"']*["']/gi, '')
        .replace(/\bwidth=["'][^"']*["']/gi, '')
        .replace(/\bheight=["'][^"']*["']/gi, '')
        .trim();

      return `<svg ${cleanAttrs} viewBox="${artboard.x} ${artboard.y} ${artboard.width} ${artboard.height}" width="${artboard.width}" height="${artboard.height}">`;
    });

    // Strip proprietary attributes
    svg = svg.replace(/\s+data-[a-z0-9_-]+="[^"]*"/gi, '');
    // Strip inkscape:page tags
    svg = svg.replace(/<inkscape:page\b[^>]*\/?>(?:<\/inkscape:page>)?/gis, '');

    return svg;
  }

  /**
   * Extracts clean SVGs for all Artboards in the container.
   */
  public static extractAllArtboards(container: AdrwContainer): { filename: string; svgText: string; artboard: ArtboardDef }[] {
    const results: { filename: string; svgText: string; artboard: ArtboardDef }[] = [];
    const baseName = container.metadata?.name || 'artboard';

    container.artboards.forEach((ab, idx) => {
      const cleanAbName = ab.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
      const filename = container.artboards.length > 1
        ? `${baseName}_${cleanAbName || `page_${idx + 1}`}.svg`
        : `${baseName}.svg`;

      const svgText = this.extractArtboardSvg(container, ab.id);
      results.push({
        filename,
        svgText,
        artboard: ab,
      });
    });

    return results;
  }
}
