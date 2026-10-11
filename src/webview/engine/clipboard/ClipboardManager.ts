import { VectorModel, VectorElement } from '../VectorModel.js';
import { SvgSerializer } from '../serialization/SvgSerializer.js';
import { BoundingBoxCalculator } from '../geometry/BoundingBoxCalculator.js';

/**
 * ARCHITECTURAL RATIONALE: Multi-Flavour System Clipboard Manager (ClipboardManager)
 *
 * VectorCraft Lesson (Module 07 / 09 - Multi-Flavour Clipboard):
 * When copying a vector graphic, a professional desktop editor never outputs a single plain string.
 * It publishes multiple MIME representations simultaneously into the OS clipboard:
 *
 * 1. `image/svg+xml`: Pristine W3C vector markup for vector suites (Figma, Inkscape, Illustrator).
 * 2. `text/plain`: Formatted SVG source code for text editors, IDEs, and VS Code code files.
 * 3. `image/png`: Offscreen memory-rendered alpha PNG for instant sharing in Slack, Discord, Word, WhatsApp.
 *
 * Provides a graceful degradation fallback to `navigator.clipboard.writeText` if browser security
 * policies or specific Webview sandbox flags restrict binary image blobs.
 */

export async function renderSvgToPngBlob(
  svgString: string,
  width: number,
  height: number
): Promise<Blob | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return null;
  }

  return new Promise<Blob | null>((resolve) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      const img = new Image();
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        try {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          canvas.toBlob((blob) => resolve(blob), 'image/png');
        } catch {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };

      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

export class ClipboardManager {
  /**
   * Builds an isolated, bounded SVG snippet string from an arbitrary selection of elements.
   */
  public static buildSelectionSvg(elements: VectorElement[]): { svgString: string; width: number; height: number } {
    const box = BoundingBoxCalculator.getGroupBoundingBox(elements);
    const pad = 4;
    const vbX = box ? Math.floor(box.x - pad) : 0;
    const vbY = box ? Math.floor(box.y - pad) : 0;
    const vbW = box ? Math.ceil(box.width + pad * 2) : 800;
    const vbH = box ? Math.ceil(box.height + pad * 2) : 600;

    const tempModel = new VectorModel();
    tempModel.canvas = {
      width: vbW,
      height: vbH,
      viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
      backgroundColor: 'none',
      currentColor: '#000000',
      preserveAspectRatio: 'xMidYMid meet',
    };
    tempModel.elements = elements;

    const svgString = SvgSerializer.toSvgString(tempModel);
    return { svgString, width: vbW, height: vbH };
  }

  /**
   * Publishes multi-flavour representations (SVG + Plain Text + PNG) to the OS clipboard.
   */
  public static async copySelectionMultiFlavour(elements: VectorElement[]): Promise<boolean> {
    if (!elements || elements.length === 0) return false;

    const { svgString, width, height } = this.buildSelectionSvg(elements);

    // If running in browser/webview with modern clipboard API
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      try {
        const textBlob = new Blob([svgString], { type: 'text/plain' });
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
        const pngBlob = await renderSvgToPngBlob(svgString, width, height);

        const clipboardPayload: Record<string, Blob> = {
          'text/plain': textBlob,
          'image/svg+xml': svgBlob,
        };

        if (pngBlob) {
          clipboardPayload['image/png'] = pngBlob;
        }

        const item = new ClipboardItem(clipboardPayload);
        await navigator.clipboard.write([item]);
        return true;
      } catch (err) {
        // Fallback: Attempt plain-text writeText if complex multi-MIME write was blocked
        try {
          if (navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(svgString);
            return true;
          }
        } catch (_) {}
      }
    }

    return false;
  }
}
