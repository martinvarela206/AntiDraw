import { VectorModel } from '../VectorModel.js';
import { VectorScene } from '../../core/model/VectorScene.js';
import { ImageIngestionService } from '../../services/ImageIngestionService.js';

/**
 * ARCHITECTURAL RATIONALE: Dedicated SVG Document DOM Renderer (SvgDomRenderer - L1)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Decouples the browser SVG DOM projection from `main.ts` and `CanvasManager.ts`.
 *    The core model (`VectorModel` or in-memory `VectorScene`) remains pure data.
 *    `SvgDomRenderer` is the sole authority responsible for mounting and updating
 *    the real persistent graphic nodes into the Chromium SVG canvas element (`#svgCanvas`).
 *
 * 2. Artboard Background Segregation:
 *    Ensures deterministic rendering of the non-destructive artboard backdrop
 *    (`__artboard_bg__`) aligned to the active ViewBox with correct fill transparency,
 *    preventing backdrop pollution into exported SVG markup.
 *
 * 3. Unified Scene & Model Compatibility:
 *    Supports rendering directly from both the legacy `VectorModel` and the new
 *    pure in-memory `VectorScene`, facilitating a seamless progressive migration.
 */
export class SvgDomRenderer {
  private static readonly SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * Renders the vector document onto the target SVGSVGElement.
   */
  public render(svgCanvas: SVGSVGElement, source: VectorModel | VectorScene): void {
    svgCanvas.innerHTML = '';

    if (source instanceof VectorScene) {
      this.renderFromScene(svgCanvas, source);
    } else {
      this.renderFromModel(svgCanvas, source);
    }
  }

  private renderFromModel(svgCanvas: SVGSVGElement, model: VectorModel): void {
    // Synchronize spatial index for sub-millisecond hit-testing and viewport culling
    model.rebuildSpatialIndex();

    // 1. Render Artboard background rect
    const vb = model.getViewBoxBounds();
    const bgRect = document.createElementNS(SvgDomRenderer.SVG_NS, 'rect');
    bgRect.setAttribute('id', '__artboard_bg__');
    bgRect.setAttribute('x', vb.minX.toString());
    bgRect.setAttribute('y', vb.minY.toString());
    bgRect.setAttribute('width', vb.width.toString());
    bgRect.setAttribute('height', vb.height.toString());

    const artboardBg = model.canvas.backgroundColor;
    bgRect.setAttribute('fill', artboardBg && artboardBg !== 'transparent' ? artboardBg : 'none');
    svgCanvas.appendChild(bgRect);

    svgCanvas.style.color = model.canvas.currentColor || '#000000';

    // 2. Render all vector elements (including ephemeral contextual guides on live canvas)
    const tempSvg = document.createElement('div');
    tempSvg.innerHTML = model.toSvgString({ excludeContextual: false });
    const parsedSvg = tempSvg.querySelector('svg');
    if (parsedSvg) {
      // Resolve any image tags for live DOM projection (preventing 404 broken image placeholders)
      parsedSvg.querySelectorAll('image').forEach((imgEl) => {
        const href = imgEl.getAttribute('href') || imgEl.getAttribute('xlink:href');
        if (href) {
          const resolved = ImageIngestionService.resolveLiveAssetUri(href);
          if (resolved) {
            imgEl.setAttribute('href', resolved);
            imgEl.setAttributeNS('http://www.w3.org/1999/xlink', 'href', resolved);
          }
        }
      });

      Array.from(parsedSvg.children).forEach((child) => {
        svgCanvas.appendChild(child.cloneNode(true));
      });
    }
  }

  private renderFromScene(svgCanvas: SVGSVGElement, scene: VectorScene): void {
    // 1. Render Artboard background rect
    const vbParts = scene.viewBox.trim().split(/\s+/).map(Number);
    const minX = vbParts[0] || 0;
    const minY = vbParts[1] || 0;
    const width = vbParts[2] || scene.width;
    const height = vbParts[3] || scene.height;

    const bgRect = document.createElementNS(SvgDomRenderer.SVG_NS, 'rect');
    bgRect.setAttribute('id', '__artboard_bg__');
    bgRect.setAttribute('x', minX.toString());
    bgRect.setAttribute('y', minY.toString());
    bgRect.setAttribute('width', width.toString());
    bgRect.setAttribute('height', height.toString());

    const artboardBg = scene.backgroundColor;
    bgRect.setAttribute('fill', artboardBg && artboardBg !== 'transparent' ? artboardBg : 'none');
    svgCanvas.appendChild(bgRect);

    // 2. Project flattened scene elements to DOM
    const elements = scene.getFlattenedElements();
    for (const el of elements) {
      const domEl = document.createElementNS(SvgDomRenderer.SVG_NS, el.tagName);
      for (const [key, value] of Object.entries(el.attributes)) {
        if (el.tagName === 'image' && (key === 'href' || key === 'xlink:href')) {
          const resolved = ImageIngestionService.resolveLiveAssetUri(value);
          domEl.setAttribute(key, resolved);
          domEl.setAttributeNS('http://www.w3.org/1999/xlink', 'href', resolved);
        } else {
          domEl.setAttribute(key, value);
        }
      }
      if (el.children && el.children.length > 0) {
        for (const child of el.children) {
          const childDom = document.createElementNS(SvgDomRenderer.SVG_NS, child.tagName);
          for (const [ck, cv] of Object.entries(child.attributes)) {
            if (child.tagName === 'image' && (ck === 'href' || ck === 'xlink:href')) {
              const resolved = ImageIngestionService.resolveLiveAssetUri(cv);
              childDom.setAttribute(ck, resolved);
              childDom.setAttributeNS('http://www.w3.org/1999/xlink', 'href', resolved);
            } else {
              childDom.setAttribute(ck, cv);
            }
          }
          if (child.textContent) {
            childDom.textContent = child.textContent;
          }
          domEl.appendChild(childDom);
        }
      } else if (el.textContent) {
        domEl.textContent = el.textContent;
      }
      svgCanvas.appendChild(domEl);
    }
  }
}
