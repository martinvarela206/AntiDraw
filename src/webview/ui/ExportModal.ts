import { VectorModel } from '../engine/VectorModel.js';
import { SelectionTool } from '../engine/SelectionTool.js';
import {
  AssetExporter,
  ExportConfig,
  ExportFormat,
  ExportScale,
  ExportTarget,
  ExportResult,
} from '../engine/export/AssetExporter.js';
import { I18nService } from '../i18n/index.js';

/**
 * ARCHITECTURAL RATIONALE: Interactive Multi-Scale Asset Export Modal (ExportModal)
 *
 * VectorCraft Ergonomic Pattern:
 * Provides a dedicated, keyboard-accessible dialog to configure asset resolution,
 * density scale multipliers, target bounding domain, and output formats.
 */
export class ExportModal {
  private static activeModal: HTMLElement | null = null;

  public static show(
    model: VectorModel,
    selectionTool?: SelectionTool
  ): Promise<ExportResult | null> {
    return new Promise((resolve) => {
      if (this.activeModal) {
        this.activeModal.remove();
        this.activeModal = null;
      }

      const hasSelection = !!(selectionTool && selectionTool.selectedElementIds.size > 0);
      let currentTarget: ExportTarget = hasSelection ? 'selection' : 'artboard';
      let currentFormat: ExportFormat = 'png';
      let currentScale: ExportScale = 2;

      const backdrop = document.createElement('div');
      backdrop.className = 'ad-modal-backdrop';

      const container = document.createElement('div');
      container.className = 'ad-modal-container ad-export-modal-container';
      container.style.maxWidth = '460px';

      // Title
      const titleEl = document.createElement('div');
      titleEl.className = 'ad-modal-title';
      titleEl.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>${I18nService.t('exportModal.title')}</span>
      `;
      container.appendChild(titleEl);

      // Body Form
      const formEl = document.createElement('div');
      formEl.style.display = 'flex';
      formEl.style.flexDirection = 'column';
      formEl.style.gap = '14px';
      formEl.style.marginTop = '4px';

      // 1. Target Domain
      const targetGroup = document.createElement('div');
      const selLabel = I18nService.t('exportModal.selectionTarget').replace('{count}', String(hasSelection ? selectionTool!.selectedElementIds.size : 0));
      const noSelTitle = I18nService.t('exportModal.noSelectionTooltip');
      targetGroup.innerHTML = `
        <label style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); display: block; margin-bottom: 6px;">${I18nService.t('exportModal.targetDomain')}</label>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn ${currentTarget === 'selection' ? 'active' : ''}" id="ad-exp-target-sel" style="flex: 1; padding: 6px 10px; font-size: 12px;" ${!hasSelection ? `disabled title="${noSelTitle}"` : ''}>
            ${selLabel}
          </button>
          <button type="button" class="btn ${currentTarget === 'artboard' ? 'active' : ''}" id="ad-exp-target-art" style="flex: 1; padding: 6px 10px; font-size: 12px;">
            ${I18nService.t('exportModal.artboardTarget')}
          </button>
        </div>
      `;
      formEl.appendChild(targetGroup);

      // 2. Format Selection
      const formatGroup = document.createElement('div');
      formatGroup.innerHTML = `
        <label style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); display: block; margin-bottom: 6px;">${I18nService.t('exportModal.format')}</label>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn active" id="ad-exp-fmt-png" style="flex: 1; padding: 6px 10px; font-size: 12px;">${I18nService.t('exportModal.pngAlpha')}</button>
          <button type="button" class="btn" id="ad-exp-fmt-webp" style="flex: 1; padding: 6px 10px; font-size: 12px;">${I18nService.t('exportModal.webp')}</button>
          <button type="button" class="btn" id="ad-exp-fmt-svg" style="flex: 1; padding: 6px 10px; font-size: 12px;">${I18nService.t('exportModal.svgVector')}</button>
        </div>
      `;
      formEl.appendChild(formatGroup);

      // 3. Density Multiplier (Scale)
      const scaleGroup = document.createElement('div');
      scaleGroup.id = 'ad-exp-scale-container';
      scaleGroup.innerHTML = `
        <label style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); display: block; margin-bottom: 6px;">${I18nService.t('exportModal.scaleFactor')}</label>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn" id="ad-exp-scale-1" style="flex: 1; padding: 6px 8px; font-size: 12px;">1x</button>
          <button type="button" class="btn active" id="ad-exp-scale-2" style="flex: 1; padding: 6px 8px; font-size: 12px;">${I18nService.t('exportModal.scaleRetina')}</button>
          <button type="button" class="btn" id="ad-exp-scale-3" style="flex: 1; padding: 6px 8px; font-size: 12px;">3x</button>
          <button type="button" class="btn" id="ad-exp-scale-4" style="flex: 1; padding: 6px 8px; font-size: 12px;">4x</button>
        </div>
      `;
      formEl.appendChild(scaleGroup);

      // 4. Filename input & Dimension Preview
      const previewGroup = document.createElement('div');
      previewGroup.innerHTML = `
        <div style="margin-bottom: 8px;">
          <label style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); display: block; margin-bottom: 4px;">${I18nService.t('exportModal.filenameLabel')}</label>
          <input type="text" id="ad-exp-filename" class="ad-input" value="asset" style="width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 4px;" />
        </div>
        <div id="ad-exp-dim-preview" style="font-size: 11px; color: var(--text-muted); background: rgba(0,0,0,0.25); padding: 8px 12px; border-radius: 4px; border-left: 3px solid var(--accent-color);">
          ${I18nService.t('exportModal.calculating')}
        </div>
      `;
      formEl.appendChild(previewGroup);

      container.appendChild(formEl);

      // Actions
      const actionsEl = document.createElement('div');
      actionsEl.className = 'ad-modal-actions';
      actionsEl.style.marginTop = '16px';
      actionsEl.style.display = 'flex';
      actionsEl.style.justifyContent = 'flex-end';
      actionsEl.style.gap = '8px';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn';
      cancelBtn.textContent = I18nService.t('exportModal.cancel');

      const exportBtn = document.createElement('button');
      exportBtn.type = 'button';
      exportBtn.className = 'btn btn-primary';
      exportBtn.textContent = I18nService.t('exportModal.exportDownload');

      actionsEl.appendChild(cancelBtn);
      actionsEl.appendChild(exportBtn);
      container.appendChild(actionsEl);

      backdrop.appendChild(container);
      document.body.appendChild(backdrop);
      this.activeModal = backdrop;

      // Update dimension preview
      const updatePreview = () => {
        const selIds = selectionTool ? selectionTool.selectedElementIds : undefined;
        const prep = AssetExporter.prepareSvg(model, currentTarget, selIds);
        const calcScale = currentFormat === 'svg' ? 1 : currentScale;
        const finalW = Math.round(prep.width * calcScale);
        const finalH = Math.round(prep.height * calcScale);
        const previewEl = container.querySelector('#ad-exp-dim-preview');
        const filenameInput = container.querySelector('#ad-exp-filename') as HTMLInputElement;

        if (filenameInput && (!filenameInput.value || filenameInput.value === 'asset' || filenameInput.value === 'artboard' || filenameInput.value === 'selection')) {
          filenameInput.value = prep.defaultName;
        }

        const scaleLabel = currentFormat === 'svg' ? 'Vector' : `@${calcScale}x`;
        if (previewEl) {
          const resText = I18nService.t('exportModal.outputResolution')
            .replace('{w}', String(finalW))
            .replace('{h}', String(finalH))
            .replace('{scale}', scaleLabel)
            .replace('{fmt}', currentFormat.toUpperCase());
          previewEl.innerHTML = resText;
        }

        const scaleContainer = container.querySelector('#ad-exp-scale-container') as HTMLElement;
        if (scaleContainer) {
          scaleContainer.style.opacity = currentFormat === 'svg' ? '0.4' : '1';
          scaleContainer.style.pointerEvents = currentFormat === 'svg' ? 'none' : 'auto';
        }
      };

      // Event bindings
      const bindBtnGroup = (ids: string[], activeId: string, onChange: (id: string) => void) => {
        ids.forEach((id) => {
          const btn = container.querySelector(`#${id}`) as HTMLElement;
          btn?.addEventListener('click', () => {
            ids.forEach((otherId) => {
              const otherBtn = container.querySelector(`#${otherId}`);
              otherBtn?.classList.toggle('active', otherId === id);
            });
            onChange(id);
            updatePreview();
          });
        });
      };

      bindBtnGroup(['ad-exp-target-sel', 'ad-exp-target-art'], currentTarget === 'selection' ? 'ad-exp-target-sel' : 'ad-exp-target-art', (id) => {
        currentTarget = id === 'ad-exp-target-sel' ? 'selection' : 'artboard';
      });

      bindBtnGroup(['ad-exp-fmt-png', 'ad-exp-fmt-webp', 'ad-exp-fmt-svg'], 'ad-exp-fmt-png', (id) => {
        if (id === 'ad-exp-fmt-png') currentFormat = 'png';
        else if (id === 'ad-exp-fmt-webp') currentFormat = 'webp';
        else currentFormat = 'svg';
      });

      bindBtnGroup(['ad-exp-scale-1', 'ad-exp-scale-2', 'ad-exp-scale-3', 'ad-exp-scale-4'], 'ad-exp-scale-2', (id) => {
        if (id === 'ad-exp-scale-1') currentScale = 1;
        else if (id === 'ad-exp-scale-2') currentScale = 2;
        else if (id === 'ad-exp-scale-3') currentScale = 3;
        else currentScale = 4;
      });

      const cleanup = () => {
        backdrop.remove();
        ExportModal.activeModal = null;
      };

      cancelBtn.addEventListener('click', () => {
        cleanup();
        resolve(null);
      });

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          cleanup();
          resolve(null);
        }
      });

      exportBtn.addEventListener('click', async () => {
        exportBtn.disabled = true;
        exportBtn.textContent = 'Procesando...';

        const filenameInput = container.querySelector('#ad-exp-filename') as HTMLInputElement;
        const config: ExportConfig = {
          target: currentTarget,
          format: currentFormat,
          scale: currentScale,
          filename: filenameInput ? filenameInput.value : undefined,
        };

        const selIds = selectionTool ? selectionTool.selectedElementIds : undefined;
        const result = await AssetExporter.exportAsset(model, config, selIds);
        AssetExporter.triggerDownload(result);

        cleanup();
        resolve(result);
      });

      updatePreview();
    });
  }
}
