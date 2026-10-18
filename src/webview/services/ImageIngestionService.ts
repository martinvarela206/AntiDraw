/**
 * ARCHITECTURAL RATIONALE: High-Integrity Image Ingestion & Workflow Orchestrator
 *
 * Coordinates image workflow for AntiDraw:
 * 1. File ingestion from 3 channels: Toolbar Image tool, Drag & Drop, and Clipboard Paste (Ctrl+V).
 * 2. Smart Ingestion Thresholding with instant pass-through or Save for Web optimization dialog.
 * 3. Dual Storage Execution: Local asset file saving via host bridge vs Embedded SVG Data URI.
 * 4. Contextual Application:
 *    - If vector element is selected: applies image as responsive <pattern> texture fill.
 *    - If no element is selected: places standalone <image> element at drop point or canvas center.
 * 5. Full Undo/Redo history tracking and Host synchronization.
 */

import { VectorModel, VectorElement } from '../engine/VectorModel.js';
import { SelectionTool } from '../engine/SelectionTool.js';
import { HistoryService } from './HistoryService.js';
import { HostSyncService } from './HostSyncService.js';
import { VsCodeBridge } from '../bridge/VsCodeBridge.js';
import { ToastNotification } from '../ui/ToastNotification.js';
import { I18nService } from '../i18n/index.js';
import { ImageProcessorService } from './ImageProcessorService.js';
import { ImageOptimizationModal } from '../ui/ImageOptimizationModal.js';
import { PrimitiveDetector } from '../engine/primitives/PrimitiveDetector.js';

export interface ImageIngestionContext {
  model: VectorModel;
  selectionTool: SelectionTool;
  getHistoryService: () => HistoryService;
  getHostSyncService: () => HostSyncService;
  renderCanvas: () => void;
  screenToSvgCoord?: (clientX: number, clientY: number) => { x: number; y: number };
}

export class ImageIngestionService {
  private static instance: ImageIngestionService | null = null;
  private ctx!: ImageIngestionContext;
  private fileInputEl: HTMLInputElement | null = null;

  public static initialize(ctx: ImageIngestionContext): ImageIngestionService {
    if (!this.instance) {
      this.instance = new ImageIngestionService();
    }
    this.instance.ctx = ctx;
    this.instance.setupEventListeners();
    return this.instance;
  }

  public static getInstance(): ImageIngestionService | null {
    return this.instance;
  }

  private setupEventListeners(): void {
    if (typeof window === 'undefined') return;

    // 1. Listen for host file dialog response
    VsCodeBridge.getInstance().onImageFileSelected((payload) => {
      this.processIncomingImage(payload.base64, payload.fileName, payload.sizeBytes);
    });

    // 2. Hidden HTML file input fallback
    this.fileInputEl = document.createElement('input');
    this.fileInputEl.type = 'file';
    this.fileInputEl.accept = 'image/*';
    this.fileInputEl.style.display = 'none';
    this.fileInputEl.addEventListener('change', async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        const file = files[0];
        const base64 = await ImageProcessorService.blobToBase64(file);
        this.processIncomingImage(base64, file.name, file.size);
      }
      if (this.fileInputEl) this.fileInputEl.value = '';
    });
    document.body.appendChild(this.fileInputEl);

    // 3. Global Drag & Drop on Canvas
    window.addEventListener('dragover', (e: DragEvent) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });

    window.addEventListener('drop', async (e: DragEvent) => {
      if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
      const file = e.dataTransfer.files[0];
      if (!file.type.startsWith('image/')) return;

      e.preventDefault();
      let dropPt: { x: number; y: number } | undefined;
      if (this.ctx.screenToSvgCoord) {
        dropPt = this.ctx.screenToSvgCoord(e.clientX, e.clientY);
      }

      const base64 = await ImageProcessorService.blobToBase64(file);
      this.processIncomingImage(base64, file.name, file.size, dropPt);
    });

    // 4. Clipboard Paste (Ctrl+V) for instant screenshots
    window.addEventListener('paste', async (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            const base64 = await ImageProcessorService.blobToBase64(blob);
            const fileName = `screenshot_${Date.now()}.${blob.type.includes('png') ? 'png' : 'webp'}`;
            this.processIncomingImage(base64, fileName, blob.size);
            break;
          }
        }
      }
    });
  }

  /**
   * Invoked when user activates the Image tool from toolbar.
   */
  public triggerImageSelection(): void {
    // Attempt host native dialog first
    try {
      VsCodeBridge.getInstance().openImageFileDialog();
    } catch (_e) {
      // Fallback to HTML input
      this.fileInputEl?.click();
    }
  }

  /**
   * Orchestrates image analysis, threshold check, modal optimization, and canvas application.
   */
  public async processIncomingImage(
    base64: string,
    fileName: string,
    sizeBytes?: number,
    dropPoint?: { x: number; y: number }
  ): Promise<void> {
    try {
      // 1. Analyze image source
      const meta = await ImageProcessorService.analyzeImage(base64, fileName, sizeBytes);

      let finalBase64 = meta.base64;
      let finalFormat = meta.format === 'unknown' ? 'png' : meta.format;
      let finalWidth = meta.width;
      let finalHeight = meta.height;
      let storageMode: 'linked' | 'embedded' = 'linked';

      // 2. Threshold Check
      const exceeds = ImageProcessorService.isExceedingThreshold(meta.sizeBytes, meta.width, meta.height);
      if (exceeds) {
        // Open dual-viewport Save for Web optimization dialog
        const modalResult = await ImageOptimizationModal.show(meta);
        if (!modalResult) {
          // User cancelled
          return;
        }
        finalBase64 = modalResult.base64;
        finalFormat = modalResult.format;
        finalWidth = modalResult.width;
        finalHeight = modalResult.height;
      }

      // 3. Asset Persistence (Linked in disk vs Embedded)
      let imageHref = finalBase64;
      const cleanExt = finalFormat === 'jpeg' ? 'jpg' : finalFormat;
      const imageId = `img_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

      if (storageMode === 'linked') {
        try {
          const saveRes = await VsCodeBridge.getInstance().saveLinkedImage(imageId, cleanExt, finalBase64);
          if (saveRes.success && saveRes.relativePath) {
            imageHref = saveRes.relativePath;
          }
        } catch (_err) {
          // Keep base64 fallback if host bridge fails or running outside VS Code
          imageHref = finalBase64;
        }
      }

      // 4. Contextual Application: Vector Background vs Standalone Canvas Element
      const selectedIds = Array.from(this.ctx.selectionTool.selectedElementIds);
      const targetElement = selectedIds.length > 0 ? this.ctx.model.getElementById(selectedIds[0]) : null;

      if (targetElement && targetElement.tagName !== 'image') {
        // APPLY AS TEXTURE / BACKGROUND PATTERN TO SELECTED VECTOR
        this.applyAsPatternTexture(targetElement, imageHref, finalWidth, finalHeight);
      } else {
        // INSERT AS STANDALONE IMAGE ELEMENT ON CANVAS
        this.insertStandaloneImage(imageHref, finalWidth, finalHeight, dropPoint);
      }
    } catch (err: any) {
      console.error('Error during image ingestion:', err);
      ToastNotification.show({
        message: `Error al procesar imagen: ${err?.message || err}`,
        type: 'error',
      });
    }
  }

  /**
   * Applies image as a responsive texture pattern to a vector element.
   */
  private applyAsPatternTexture(
    element: VectorElement,
    imageHref: string,
    imgW: number,
    imgH: number
  ): void {
    const patId = `pat_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const patternMarkup = `<pattern id="${patId}" patternContentUnits="objectBoundingBox" width="1" height="1"><image href="${imageHref}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" /></pattern>`;

    this.ctx.model.customDefs = (this.ctx.model.customDefs || '').trim() + '\n' + patternMarkup;
    element.attributes.fill = `url(#${patId})`;

    this.ctx.getHistoryService().pushUndo();
    this.ctx.getHostSyncService().syncToHost();
    this.ctx.renderCanvas();

    ToastNotification.show({
      message: I18nService.t('imageOptimization.toolImageBgTooltip') || 'Textura de imagen aplicada al vector seleccionado',
      type: 'info',
    });
  }

  /**
   * Inserts a standalone <image> element into the vector model.
   */
  private insertStandaloneImage(
    imageHref: string,
    imgW: number,
    imgH: number,
    dropPoint?: { x: number; y: number }
  ): void {
    // Determine canvas target dimensions so huge images scale nicely into ViewBox
    const vbParts = (this.ctx.model.canvas.viewBox || '0 0 800 600').split(/[\s,]+/).map(Number);
    const vbW = vbParts[2] || 800;
    const vbH = vbParts[3] || 600;

    let targetW = imgW;
    let targetH = imgH;

    // Constrain initial placement to at most 60% of canvas viewBox if larger
    const maxPlacementW = vbW * 0.6;
    const maxPlacementH = vbH * 0.6;
    if (targetW > maxPlacementW || targetH > maxPlacementH) {
      const scale = Math.min(maxPlacementW / targetW, maxPlacementH / targetH);
      targetW = Math.round(targetW * scale);
      targetH = Math.round(targetH * scale);
    }

    // Determine position: dropPoint or center of viewBox
    let posX = (vbParts[0] || 0) + (vbW - targetW) / 2;
    let posY = (vbParts[1] || 0) + (vbH - targetH) / 2;

    if (dropPoint) {
      posX = Math.round(dropPoint.x - targetW / 2);
      posY = Math.round(dropPoint.y - targetH / 2);
    }

    const imageId = `img_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const imageAttrs: Record<string, string> = {
      id: imageId,
      href: imageHref,
      x: String(posX),
      y: String(posY),
      width: String(targetW),
      height: String(targetH),
      preserveAspectRatio: 'xMidYMid meet',
    };

    const newElement: VectorElement = {
      id: imageId,
      tagName: 'image',
      attributes: imageAttrs,
      vertices: PrimitiveDetector.convertShapeToVertices('image', imageAttrs),
      isClosed: true,
    };

    this.ctx.model.elements.push(newElement);
    this.ctx.model.rebuildSpatialIndex();

    // Select the newly created element
    this.ctx.selectionTool.select(imageId);

    this.ctx.getHistoryService().pushUndo();
    this.ctx.getHostSyncService().syncToHost();
    this.ctx.renderCanvas();

    ToastNotification.show({
      message: I18nService.t('imageOptimization.toolImageTooltip') || 'Imagen insertada en el lienzo',
      type: 'info',
    });
  }
}
