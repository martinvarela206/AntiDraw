/**
 * ARCHITECTURAL RATIONALE: Image Optimization & Dual Viewport Comparison Modal
 *
 * Inspired by classic Adobe Fireworks / Photoshop "Save for Web & Devices":
 * 1. Dual 2-Up split viewport (Original vs Optimized) with synchronized zoom & pan.
 * 2. Instant real-time feedback with debounced OffscreenCanvas processing.
 * 3. Granular controls: Format, scale, color quantization, smoothing, quality, alpha matte.
 * 4. Dual persistence modes: Linked asset on disk vs Embedded SVG Data URI.
 * 5. Full bilingual i18n support (ES/EN) and strict keyboard accessibility (Escape, Enter).
 */

import { I18nService } from '../i18n/index.js';
import {
  ImageProcessorService,
  ImageSourceMeta,
  ImageOptimizationConfig,
  OptimizedImageResult,
} from '../services/ImageProcessorService.js';

export class ImageOptimizationModal {
  private static activeModal: HTMLElement | null = null;

  public static show(sourceMeta: ImageSourceMeta): Promise<OptimizedImageResult | null> {
    return new Promise((resolve) => {
      if (this.activeModal) {
        this.activeModal.remove();
        this.activeModal = null;
      }

      // Compute initial dimensions: if resolution exceeds 1920px, downscale by default
      const origW = sourceMeta.width;
      const origH = sourceMeta.height;
      const maxDefaultDim = 1920;
      let initW = origW;
      let initH = origH;
      if (origW > maxDefaultDim || origH > maxDefaultDim) {
        if (origW >= origH) {
          initW = maxDefaultDim;
          initH = Math.max(1, Math.round((origH * maxDefaultDim) / origW));
        } else {
          initH = maxDefaultDim;
          initW = Math.max(1, Math.round((origW * maxDefaultDim) / origH));
        }
      }

      const defaultFormat = sourceMeta.format === 'jpeg' ? 'jpeg' : sourceMeta.hasAlpha ? 'png' : 'webp';

      const config: ImageOptimizationConfig = {
        destination: 'linked',
        format: defaultFormat,
        width: initW,
        height: initH,
        maintainAspectRatio: true,
        quality: 0.8,
        colorMode: 'rgb',
        paletteColors: 256,
        smoothing: 0,
        transparency: sourceMeta.hasAlpha,
        matteColor: '#ffffff',
      };

      const backdrop = document.createElement('div');
      backdrop.className = 'ad-modal-backdrop';

      const container = document.createElement('div');
      container.className = 'ad-img-opt-container';

      // Load original image in memory for processing
      const sourceImg = new Image();
      sourceImg.crossOrigin = 'anonymous';
      sourceImg.src = sourceMeta.base64;

      let currentZoom = 1.0;
      let currentResult: OptimizedImageResult | null = null;
      let isDebouncing = false;
      let debounceTimer: any = null;

      // 1. HEADER
      const headerEl = document.createElement('div');
      headerEl.className = 'ad-img-opt-header';
      headerEl.innerHTML = `
        <div class="ad-img-opt-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          <span>${I18nService.t('imageOptimization.modalTitle')}</span>
        </div>
        <button type="button" class="btn btn-close" id="ad-img-opt-close" title="${I18nService.t('common.close')}" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px; line-height: 1;">&times;</button>
      `;
      container.appendChild(headerEl);

      // 2. BODY
      const bodyEl = document.createElement('div');
      bodyEl.className = 'ad-img-opt-body';

      // Left area: Preview Area
      const previewAreaEl = document.createElement('div');
      previewAreaEl.className = 'ad-img-opt-preview-area';

      // Toolbar over preview
      const toolbarEl = document.createElement('div');
      toolbarEl.className = 'ad-img-opt-toolbar';
      toolbarEl.innerHTML = `
        <button type="button" class="btn-tool" id="ad-img-opt-zoom-in" title="${I18nService.t('imageOptimization.zoomIn')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
        </button>
        <button type="button" class="btn-tool" id="ad-img-opt-zoom-out" title="${I18nService.t('imageOptimization.zoomOut')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
        </button>
        <button type="button" class="btn-tool" id="ad-img-opt-zoom-100" title="${I18nService.t('imageOptimization.zoom100')}">1:1</button>
        <button type="button" class="btn-tool" id="ad-img-opt-zoom-fit" title="${I18nService.t('imageOptimization.zoomFit')}">Fit</button>
        <span id="ad-img-opt-zoom-level" style="font-size: 11px; color: var(--text-muted); margin-left: 8px;">100%</span>
      `;
      previewAreaEl.appendChild(toolbarEl);

      // Split Viewport (2-up)
      const viewportSplitEl = document.createElement('div');
      viewportSplitEl.className = 'ad-img-opt-viewport-split';

      // Pane 1: Original
      const origPane = document.createElement('div');
      origPane.className = 'ad-img-opt-pane';
      origPane.innerHTML = `
        <div class="ad-img-opt-pane-header">
          <span>${I18nService.t('imageOptimization.originalLabel')}</span>
          <span style="color: var(--text-muted); font-size: 10px;">${sourceMeta.format.toUpperCase()}</span>
        </div>
        <div class="ad-img-opt-pane-content" id="ad-img-opt-orig-viewport">
          <img id="ad-img-opt-orig-img" src="${sourceMeta.base64}" alt="Original" />
        </div>
        <div class="ad-img-opt-pane-footer" id="ad-img-opt-orig-footer">
          <span>${origW} &times; ${origH} px</span>
          <span style="font-weight: 600;">${ImageProcessorService.formatBytes(sourceMeta.sizeBytes)}</span>
        </div>
      `;
      viewportSplitEl.appendChild(origPane);

      // Pane 2: Optimized Preview
      const optPane = document.createElement('div');
      optPane.className = 'ad-img-opt-pane';
      optPane.innerHTML = `
        <div class="ad-img-opt-pane-header">
          <span>${I18nService.t('imageOptimization.previewLabel')}</span>
          <span id="ad-img-opt-res-format" style="color: var(--accent-color); font-size: 10px;">${config.format.toUpperCase()}</span>
        </div>
        <div class="ad-img-opt-pane-content" id="ad-img-opt-prev-viewport">
          <img id="ad-img-opt-prev-img" src="${sourceMeta.base64}" alt="Preview" />
        </div>
        <div class="ad-img-opt-pane-footer" id="ad-img-opt-prev-footer">
          <span id="ad-img-opt-prev-dims">${config.width} &times; ${config.height} px</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span id="ad-img-opt-prev-size" style="font-weight: 600; color: #10b981;">Calculando...</span>
            <span id="ad-img-opt-prev-savings" class="ad-img-opt-savings-badge" style="display: none;">0%</span>
          </div>
        </div>
      `;
      viewportSplitEl.appendChild(optPane);

      previewAreaEl.appendChild(viewportSplitEl);
      bodyEl.appendChild(previewAreaEl);

      // Right area: Controls Sidebar
      const sidebarEl = document.createElement('div');
      sidebarEl.className = 'ad-img-opt-sidebar';
      sidebarEl.innerHTML = `
        <!-- Section 1: Storage Destination -->
        <div class="ad-img-opt-section">
          <div class="ad-img-opt-section-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
            <span>${I18nService.t('imageOptimization.storageSection')}</span>
          </div>
          <div class="ad-img-opt-radio-group">
            <label class="ad-img-opt-radio-label">
              <input type="radio" name="ad-opt-dest" value="linked" checked />
              <div>
                <div style="font-weight: 500;">${I18nService.t('imageOptimization.storageLinked')}</div>
                <div style="font-size: 10px; color: var(--text-muted);">${I18nService.t('imageOptimization.storageLinkedHint')}</div>
              </div>
            </label>
            <label class="ad-img-opt-radio-label">
              <input type="radio" name="ad-opt-dest" value="embedded" />
              <div>
                <div style="font-weight: 500;">${I18nService.t('imageOptimization.storageEmbedded')}</div>
                <div style="font-size: 10px; color: var(--text-muted);">${I18nService.t('imageOptimization.storageEmbeddedHint')}</div>
              </div>
            </label>
          </div>
        </div>

        <!-- Section 2: Format -->
        <div class="ad-img-opt-section">
          <div class="ad-img-opt-section-title">
            <span>${I18nService.t('imageOptimization.formatSection')}</span>
          </div>
          <div class="ad-img-opt-row">
            <label for="ad-opt-fmt-select">${I18nService.t('imageOptimization.formatSection')}:</label>
            <select id="ad-opt-fmt-select" style="background: var(--bg-input, #222); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 8px; font-size: 12px; width: 140px;">
              <option value="webp" ${config.format === 'webp' ? 'selected' : ''}>WebP (Moderno)</option>
              <option value="png" ${config.format === 'png' ? 'selected' : ''}>PNG (Con Alfa)</option>
              <option value="jpeg" ${config.format === 'jpeg' ? 'selected' : ''}>JPEG (Foto)</option>
            </select>
          </div>
        </div>

        <!-- Section 3: Transformations (Dimensions) -->
        <div class="ad-img-opt-section">
          <div class="ad-img-opt-section-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
            <span>${I18nService.t('imageOptimization.transformSection')}</span>
          </div>
          <div class="ad-img-opt-row">
            <label for="ad-opt-width">${I18nService.t('imageOptimization.width')}:</label>
            <input type="number" id="ad-opt-width" value="${config.width}" min="1" max="10000" style="background: var(--bg-input, #222); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 6px; font-size: 12px; width: 90px;" />
          </div>
          <div class="ad-img-opt-row">
            <label for="ad-opt-height">${I18nService.t('imageOptimization.height')}:</label>
            <input type="number" id="ad-opt-height" value="${config.height}" min="1" max="10000" style="background: var(--bg-input, #222); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 6px; font-size: 12px; width: 90px;" />
          </div>
          <div class="ad-img-opt-row">
            <label for="ad-opt-scale-percent">${I18nService.t('imageOptimization.percent')}:</label>
            <input type="number" id="ad-opt-scale-percent" value="${Math.round((config.width / origW) * 100)}" min="1" max="500" style="background: var(--bg-input, #222); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 6px; font-size: 12px; width: 70px;" /> %
          </div>
          <div class="ad-img-opt-row" style="margin-top: 2px;">
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px;">
              <input type="checkbox" id="ad-opt-lock-aspect" checked />
              <span>${I18nService.t('imageOptimization.maintainAspect')}</span>
            </label>
          </div>
        </div>

        <!-- Section 4: Color & Palette -->
        <div class="ad-img-opt-section">
          <div class="ad-img-opt-section-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a7 7 0 0 0 0 14h2a2 2 0 0 0 2-2 2 2 0 0 1 2-2h1a5 5 0 0 0 0-10H12z"></path></svg>
            <span>${I18nService.t('imageOptimization.colorSection')}</span>
          </div>
          <div class="ad-img-opt-row">
            <label for="ad-opt-color-mode">${I18nService.t('common.type')}:</label>
            <select id="ad-opt-color-mode" style="background: var(--bg-input, #222); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 8px; font-size: 12px; width: 140px;">
              <option value="rgb">${I18nService.t('imageOptimization.colorModeRgb')}</option>
              <option value="palette">${I18nService.t('imageOptimization.colorModePalette')}</option>
            </select>
          </div>
          <div class="ad-img-opt-row" id="ad-opt-palette-row" style="display: none;">
            <label for="ad-opt-palette-count">${I18nService.t('imageOptimization.paletteColors')}:</label>
            <select id="ad-opt-palette-count" style="background: var(--bg-input, #222); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 8px; font-size: 12px; width: 90px;">
              <option value="256" selected>256</option>
              <option value="128">128</option>
              <option value="64">64</option>
              <option value="32">32</option>
              <option value="16">16</option>
            </select>
          </div>
          <div class="ad-img-opt-row">
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px;">
              <input type="checkbox" id="ad-opt-transparency" ${config.transparency ? 'checked' : ''} />
              <span>${I18nService.t('imageOptimization.transparency')}</span>
            </label>
          </div>
          <div class="ad-img-opt-row" id="ad-opt-matte-row" style="${config.transparency ? 'display: none;' : ''}">
            <label for="ad-opt-matte-color">${I18nService.t('imageOptimization.matteColor')}:</label>
            <input type="color" id="ad-opt-matte-color" value="${config.matteColor}" style="border: none; width: 32px; height: 24px; cursor: pointer; border-radius: 4px; background: transparent;" />
          </div>
        </div>

        <!-- Section 5: Advanced (Quality & Smoothing) -->
        <div class="ad-img-opt-section">
          <div class="ad-img-opt-section-title">
            <span>${I18nService.t('imageOptimization.advancedSection')}</span>
          </div>
          <div class="ad-img-opt-row" id="ad-opt-quality-row" style="${config.format === 'png' ? 'opacity: 0.5; pointer-events: none;' : ''}">
            <label for="ad-opt-quality">${I18nService.t('imageOptimization.quality')}:</label>
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="range" id="ad-opt-quality" min="5" max="100" value="80" style="width: 100px;" />
              <span id="ad-opt-quality-val" style="font-size: 11px; width: 32px;">80%</span>
            </div>
          </div>
          <div class="ad-img-opt-row">
            <label for="ad-opt-smoothing">${I18nService.t('imageOptimization.smoothing')}:</label>
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="range" id="ad-opt-smoothing" min="0" max="10" value="0" style="width: 100px;" />
              <span id="ad-opt-smoothing-val" style="font-size: 11px; width: 32px;">0</span>
            </div>
          </div>
        </div>
      `;
      bodyEl.appendChild(sidebarEl);
      container.appendChild(bodyEl);

      // 3. FOOTER ACTIONS
      const footerEl = document.createElement('div');
      footerEl.className = 'ad-img-opt-footer';
      footerEl.innerHTML = `
        <div style="font-size: 11px; color: var(--text-muted);">
          <span>Original: ${sourceMeta.fileName}</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn" id="ad-img-opt-btn-orig" style="padding: 6px 14px; font-size: 12px; background: rgba(255, 255, 255, 0.08); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 4px; cursor: pointer;">
            ${I18nService.t('imageOptimization.keepOriginal')}
          </button>
          <button type="button" class="btn" id="ad-img-opt-btn-cancel" style="padding: 6px 14px; font-size: 12px; background: rgba(255, 255, 255, 0.08); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 4px; cursor: pointer;">
            ${I18nService.t('imageOptimization.cancel')}
          </button>
          <button type="button" class="btn" id="ad-img-opt-btn-save" style="padding: 6px 16px; font-size: 12px; background: var(--accent-color, #007acc); color: #fff; font-weight: 600; border: none; border-radius: 4px; cursor: pointer;">
            ${I18nService.t('imageOptimization.saveAndInsert')}
          </button>
        </div>
      `;
      container.appendChild(footerEl);

      backdrop.appendChild(container);
      document.body.appendChild(backdrop);
      this.activeModal = backdrop;

      // DOM Elements Query
      const origImg = container.querySelector('#ad-img-opt-orig-img') as HTMLImageElement;
      const prevImg = container.querySelector('#ad-img-opt-prev-img') as HTMLImageElement;
      const resFormatEl = container.querySelector('#ad-img-opt-res-format') as HTMLElement;
      const prevDimsEl = container.querySelector('#ad-img-opt-prev-dims') as HTMLElement;
      const prevSizeEl = container.querySelector('#ad-img-opt-prev-size') as HTMLElement;
      const prevSavingsEl = container.querySelector('#ad-img-opt-prev-savings') as HTMLElement;
      const zoomLevelEl = container.querySelector('#ad-img-opt-zoom-level') as HTMLElement;

      const fmtSelect = container.querySelector('#ad-opt-fmt-select') as HTMLSelectElement;
      const widthInput = container.querySelector('#ad-opt-width') as HTMLInputElement;
      const heightInput = container.querySelector('#ad-opt-height') as HTMLInputElement;
      const percentInput = container.querySelector('#ad-opt-scale-percent') as HTMLInputElement;
      const lockAspectCheck = container.querySelector('#ad-opt-lock-aspect') as HTMLInputElement;
      const colorModeSelect = container.querySelector('#ad-opt-color-mode') as HTMLSelectElement;
      const paletteRow = container.querySelector('#ad-opt-palette-row') as HTMLElement;
      const paletteCountSelect = container.querySelector('#ad-opt-palette-count') as HTMLSelectElement;
      const transparencyCheck = container.querySelector('#ad-opt-transparency') as HTMLInputElement;
      const matteRow = container.querySelector('#ad-opt-matte-row') as HTMLElement;
      const matteColorInput = container.querySelector('#ad-opt-matte-color') as HTMLInputElement;
      const qualityRow = container.querySelector('#ad-opt-quality-row') as HTMLElement;
      const qualitySlider = container.querySelector('#ad-opt-quality') as HTMLInputElement;
      const qualityVal = container.querySelector('#ad-opt-quality-val') as HTMLElement;
      const smoothingSlider = container.querySelector('#ad-opt-smoothing') as HTMLInputElement;
      const smoothingVal = container.querySelector('#ad-opt-smoothing-val') as HTMLElement;

      // Update Zoom Function
      const applyZoom = (zoom: number) => {
        currentZoom = Math.min(4.0, Math.max(0.1, zoom));
        zoomLevelEl.textContent = `${Math.round(currentZoom * 100)}%`;
        origImg.style.transform = `scale(${currentZoom})`;
        prevImg.style.transform = `scale(${currentZoom})`;
      };

      container.querySelector('#ad-img-opt-zoom-in')?.addEventListener('click', () => applyZoom(currentZoom + 0.25));
      container.querySelector('#ad-img-opt-zoom-out')?.addEventListener('click', () => applyZoom(currentZoom - 0.25));
      container.querySelector('#ad-img-opt-zoom-100')?.addEventListener('click', () => applyZoom(1.0));
      container.querySelector('#ad-img-opt-zoom-fit')?.addEventListener('click', () => applyZoom(0.8));

      // Synchronized Pan Scrolling
      const origViewport = container.querySelector('#ad-img-opt-orig-viewport') as HTMLElement;
      const prevViewport = container.querySelector('#ad-img-opt-prev-viewport') as HTMLElement;
      let isSyncingScroll = false;

      origViewport.addEventListener('scroll', () => {
        if (isSyncingScroll) return;
        isSyncingScroll = true;
        prevViewport.scrollTop = origViewport.scrollTop;
        prevViewport.scrollLeft = origViewport.scrollLeft;
        isSyncingScroll = false;
      });

      prevViewport.addEventListener('scroll', () => {
        if (isSyncingScroll) return;
        isSyncingScroll = true;
        origViewport.scrollTop = prevViewport.scrollTop;
        origViewport.scrollLeft = prevViewport.scrollLeft;
        isSyncingScroll = false;
      });

      // Recalculate Preview with Debounce
      const triggerProcess = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        prevSizeEl.textContent = 'Calculando...';
        debounceTimer = setTimeout(async () => {
          try {
            const res = await ImageProcessorService.processImage(sourceImg, config, sourceMeta.sizeBytes);
            currentResult = res;
            prevImg.src = res.previewUrl;
            resFormatEl.textContent = res.format.toUpperCase();
            prevDimsEl.textContent = `${res.width} × ${res.height} px`;
            prevSizeEl.textContent = ImageProcessorService.formatBytes(res.sizeBytes);
            if (res.savingsPercent > 0) {
              prevSavingsEl.style.display = 'inline-block';
              prevSavingsEl.textContent = `-${res.savingsPercent}%`;
            } else {
              prevSavingsEl.style.display = 'none';
            }
          } catch (err) {
            console.error('Error generating preview:', err);
          }
        }, 120);
      };

      // Form Event Listeners
      container.querySelectorAll('input[name="ad-opt-dest"]').forEach((radio) => {
        radio.addEventListener('change', (e) => {
          config.destination = (e.target as HTMLInputElement).value as 'linked' | 'embedded';
        });
      });

      fmtSelect.addEventListener('change', () => {
        config.format = fmtSelect.value as 'webp' | 'png' | 'jpeg';
        qualityRow.style.opacity = config.format === 'png' ? '0.4' : '1';
        qualityRow.style.pointerEvents = config.format === 'png' ? 'none' : 'auto';
        matteRow.style.display = (!config.transparency || config.format === 'jpeg') ? 'flex' : 'none';
        triggerProcess();
      });

      widthInput.addEventListener('input', () => {
        const w = Math.max(1, parseInt(widthInput.value, 10) || 1);
        config.width = w;
        if (config.maintainAspectRatio && origW > 0) {
          config.height = Math.max(1, Math.round((w * origH) / origW));
          heightInput.value = String(config.height);
        }
        percentInput.value = String(Math.round((w / origW) * 100));
        triggerProcess();
      });

      heightInput.addEventListener('input', () => {
        const h = Math.max(1, parseInt(heightInput.value, 10) || 1);
        config.height = h;
        if (config.maintainAspectRatio && origH > 0) {
          config.width = Math.max(1, Math.round((h * origW) / origH));
          widthInput.value = String(config.width);
        }
        percentInput.value = String(Math.round((config.width / origW) * 100));
        triggerProcess();
      });

      percentInput.addEventListener('input', () => {
        const pct = Math.max(1, parseInt(percentInput.value, 10) || 100);
        config.width = Math.max(1, Math.round((origW * pct) / 100));
        config.height = Math.max(1, Math.round((origH * pct) / 100));
        widthInput.value = String(config.width);
        heightInput.value = String(config.height);
        triggerProcess();
      });

      lockAspectCheck.addEventListener('change', () => {
        config.maintainAspectRatio = lockAspectCheck.checked;
      });

      colorModeSelect.addEventListener('change', () => {
        config.colorMode = colorModeSelect.value as 'rgb' | 'palette';
        paletteRow.style.display = config.colorMode === 'palette' ? 'flex' : 'none';
        triggerProcess();
      });

      paletteCountSelect.addEventListener('change', () => {
        config.paletteColors = parseInt(paletteCountSelect.value, 10) || 256;
        triggerProcess();
      });

      transparencyCheck.addEventListener('change', () => {
        config.transparency = transparencyCheck.checked;
        matteRow.style.display = (!config.transparency || config.format === 'jpeg') ? 'flex' : 'none';
        triggerProcess();
      });

      matteColorInput.addEventListener('input', () => {
        config.matteColor = matteColorInput.value;
        triggerProcess();
      });

      qualitySlider.addEventListener('input', () => {
        const q = parseInt(qualitySlider.value, 10);
        config.quality = q / 100;
        qualityVal.textContent = `${q}%`;
        triggerProcess();
      });

      smoothingSlider.addEventListener('input', () => {
        const s = parseInt(smoothingSlider.value, 10);
        config.smoothing = s;
        smoothingVal.textContent = String(s);
        triggerProcess();
      });

      sidebarEl.querySelectorAll('input[name="ad-opt-dest"]').forEach((radio) => {
        radio.addEventListener('change', () => {
          const checked = sidebarEl.querySelector('input[name="ad-opt-dest"]:checked') as HTMLInputElement;
          if (checked) {
            config.destination = checked.value as 'linked' | 'embedded';
          }
        });
      });

      // Cleanup
      const closeModal = () => {
        if (this.activeModal) {
          this.activeModal.remove();
          this.activeModal = null;
        }
      };

      // Actions
      container.querySelector('#ad-img-opt-close')?.addEventListener('click', () => {
        closeModal();
        resolve(null);
      });

      container.querySelector('#ad-img-opt-btn-cancel')?.addEventListener('click', () => {
        closeModal();
        resolve(null);
      });

      container.querySelector('#ad-img-opt-btn-orig')?.addEventListener('click', () => {
        closeModal();
        // Return original image wrapped in result
        resolve({
          base64: sourceMeta.base64,
          blob: new Blob([], { type: 'image/' + sourceMeta.format }),
          sizeBytes: sourceMeta.sizeBytes,
          width: sourceMeta.width,
          height: sourceMeta.height,
          format: (sourceMeta.format === 'unknown' ? 'png' : sourceMeta.format) as any,
          destination: config.destination,
          previewUrl: sourceMeta.base64,
          savingsPercent: 0,
        });
      });

      container.querySelector('#ad-img-opt-btn-save')?.addEventListener('click', async () => {
        closeModal();
        if (currentResult) {
          currentResult.destination = config.destination;
          resolve(currentResult);
        } else {
          // If not ready, run synchronous process
          const res = await ImageProcessorService.processImage(sourceImg, config, sourceMeta.sizeBytes);
          res.destination = config.destination;
          resolve(res);
        }
      });

      // Keyboard Esc / Enter
      const keyHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          window.removeEventListener('keydown', keyHandler);
          closeModal();
          resolve(null);
        }
      };
      window.addEventListener('keydown', keyHandler);

      // Initial Process Run once source image is loaded
      if (sourceImg.complete) {
        triggerProcess();
      } else {
        sourceImg.onload = () => triggerProcess();
      }
    });
  }
}
