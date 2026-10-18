/**
 * ARCHITECTURAL RATIONALE: Image Storage Choice Modal (Linked vs Embedded)
 *
 * Provides a clear, user-centric ingestion gate whenever an image is added to AntiDraw:
 * 1. Choice Clarity: Explains the architectural trade-offs between Linked (external relative file,
 *    keeping SVG lightweight, clean Git diffs) and Embedded (self-contained Base64 Data URI).
 * 2. Visual Inspection: Live thumbnail preview, filename, dimensions, and formatted byte size.
 * 3. Threshold Awareness: Highlights when an asset is heavy (> 1.5MB) with an optimization recommendation.
 * 4. Progressive Disclosure: Direct 1-click execution for either storage mode, or 1-click handoff
 *    to the Save for Web ImageOptimizationModal for granular downscaling, quantization, and compression.
 * 5. Full Bilingual Symmetry (ES/EN) and strict keyboard ergonomics (Escape, Enter).
 */

import { I18nService } from '../i18n/index.js';
import { ImageProcessorService, ImageSourceMeta } from '../services/ImageProcessorService.js';

export type ImageStorageChoice = 'linked' | 'embedded' | 'optimize';

export class ImageStorageChoiceModal {
  private static activeModal: HTMLElement | null = null;

  public static show(meta: ImageSourceMeta): Promise<ImageStorageChoice | null> {
    return new Promise((resolve) => {
      if (this.activeModal) {
        this.activeModal.remove();
        this.activeModal = null;
      }

      const overlay = document.createElement('div');
      overlay.className = 'ad-img-choice-overlay';
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 10001;
        background: rgba(0, 0, 0, 0.72);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        font-family: var(--font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      `;

      const dialog = document.createElement('div');
      dialog.className = 'ad-img-choice-dialog';
      dialog.style.cssText = `
        width: 100%;
        max-width: 500px;
        background: var(--bg-panel, #1e1e1e);
        border: 1px solid var(--border-color, #333);
        border-radius: 12px;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6);
        color: var(--text-main, #e0e0e0);
        overflow: hidden;
        display: flex;
        flex-direction: column;
      `;

      const isHeavy = ImageProcessorService.isExceedingThreshold(meta.sizeBytes, meta.width, meta.height);
      const formattedSize = ImageProcessorService.formatBytes(meta.sizeBytes);
      const formatLabel = meta.format.toUpperCase();

      // 1. Header
      const header = document.createElement('div');
      header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 18px;
        border-bottom: 1px solid var(--border-color, #333);
        background: rgba(255, 255, 255, 0.02);
      `;
      header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--accent-color, #3794ff);">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          <span style="font-size: 14px; font-weight: 600;">${I18nService.t('imageOptimization.choiceTitle')}</span>
        </div>
        <button type="button" id="ad-img-choice-close-x" style="background: none; border: none; color: var(--text-muted, #888); cursor: pointer; padding: 4px; display: flex; align-items: center; border-radius: 4px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;

      // 2. Body
      const body = document.createElement('div');
      body.style.cssText = `
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      `;

      // Metadata card with thumbnail
      const metaCard = document.createElement('div');
      metaCard.style.cssText = `
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 10px 12px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid var(--border-color, #333);
        border-radius: 8px;
      `;
      metaCard.innerHTML = `
        <img src="${meta.base64}" alt="Preview" style="width: 56px; height: 56px; object-fit: contain; background: rgba(0, 0, 0, 0.2); border-radius: 6px; border: 1px solid var(--border-color, #444);" />
        <div style="flex: 1; min-width: 0; font-size: 12px; display: flex; flex-direction: column; gap: 3px;">
          <div style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-main, #fff);" title="${meta.fileName}">${meta.fileName}</div>
          <div style="color: var(--text-muted, #aaa); font-size: 11px;">
            ${meta.width} × ${meta.height} px • ${formattedSize} • ${formatLabel}
          </div>
          ${
            isHeavy
              ? `<div style="color: #ff9800; font-size: 11px; font-weight: 500; display: flex; align-items: center; gap: 4px;">
                  <span>${I18nService.t('imageOptimization.largeImageWarning').replace('{size}', formattedSize)}</span>
                </div>`
              : ''
          }
        </div>
      `;
      body.appendChild(metaCard);

      // Question label
      const questionLabel = document.createElement('div');
      questionLabel.style.cssText = 'font-size: 12px; font-weight: 500; color: var(--text-muted, #ccc); margin-top: 2px;';
      questionLabel.textContent = I18nService.t('imageOptimization.choiceQuestion');
      body.appendChild(questionLabel);

      // Option A: Linked (Referenciada)
      const linkedBtn = document.createElement('div');
      linkedBtn.className = 'ad-img-choice-card';
      linkedBtn.style.cssText = `
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 14px;
        background: rgba(255, 255, 255, 0.04);
        border: 1.5px solid var(--accent-color, #3794ff);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s ease;
      `;
      linkedBtn.innerHTML = `
        <div style="font-size: 20px; line-height: 1; margin-top: 2px;">🔗</div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 3px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 13px; font-weight: 600; color: var(--text-main, #fff);">${I18nService.t('imageOptimization.choiceLinkedTitle')}</span>
            <span style="font-size: 10px; font-weight: 600; background: rgba(55, 148, 255, 0.2); color: var(--accent-color, #3794ff); padding: 1px 6px; border-radius: 10px;">${I18nService.t('imageOptimization.recommendedBadge')}</span>
          </div>
          <span style="font-size: 11px; color: var(--text-muted, #aaa); line-height: 1.35;">${I18nService.t('imageOptimization.choiceLinkedDesc')}</span>
        </div>
      `;

      // Option B: Embedded (Incrustada)
      const embeddedBtn = document.createElement('div');
      embeddedBtn.className = 'ad-img-choice-card';
      embeddedBtn.style.cssText = `
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 14px;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid var(--border-color, #333);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s ease;
      `;
      embeddedBtn.innerHTML = `
        <div style="font-size: 20px; line-height: 1; margin-top: 2px;">📦</div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 3px;">
          <div style="font-size: 13px; font-weight: 600; color: var(--text-main, #fff);">${I18nService.t('imageOptimization.choiceEmbeddedTitle')}</div>
          <span style="font-size: 11px; color: var(--text-muted, #aaa); line-height: 1.35;">${I18nService.t('imageOptimization.choiceEmbeddedDesc')}</span>
        </div>
      `;

      // Hover feedback
      const attachHover = (el: HTMLElement, isSelected: boolean) => {
        el.addEventListener('mouseenter', () => {
          el.style.background = 'rgba(255, 255, 255, 0.08)';
        });
        el.addEventListener('mouseleave', () => {
          el.style.background = isSelected ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.02)';
        });
      };
      attachHover(linkedBtn, true);
      attachHover(embeddedBtn, false);

      body.appendChild(linkedBtn);
      body.appendChild(embeddedBtn);

      // 3. Footer
      const footer = document.createElement('div');
      footer.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 18px;
        border-top: 1px solid var(--border-color, #333);
        background: rgba(255, 255, 255, 0.02);
      `;

      // Optimize button
      const optimizeBtn = document.createElement('button');
      optimizeBtn.type = 'button';
      optimizeBtn.style.cssText = `
        background: none;
        border: 1px solid var(--border-color, #444);
        color: var(--text-main, #ddd);
        padding: 6px 12px;
        font-size: 11px;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
      `;
      optimizeBtn.innerHTML = `<span>${I18nService.t('imageOptimization.choiceOptimizeBtn')}</span>`;

      // Cancel button
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.style.cssText = `
        background: transparent;
        border: none;
        color: var(--text-muted, #888);
        padding: 6px 12px;
        font-size: 12px;
        border-radius: 6px;
        cursor: pointer;
      `;
      cancelBtn.textContent = I18nService.t('imageOptimization.cancel');

      footer.appendChild(optimizeBtn);
      footer.appendChild(cancelBtn);

      dialog.appendChild(header);
      dialog.appendChild(body);
      dialog.appendChild(footer);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      this.activeModal = overlay;

      const closeModal = (choice: ImageStorageChoice | null) => {
        window.removeEventListener('keydown', handleKeydown);
        if (this.activeModal) {
          this.activeModal.remove();
          this.activeModal = null;
        }
        resolve(choice);
      };

      const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeModal(null);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          closeModal('linked');
        }
      };
      window.addEventListener('keydown', handleKeydown);

      linkedBtn.addEventListener('click', () => closeModal('linked'));
      embeddedBtn.addEventListener('click', () => closeModal('embedded'));
      optimizeBtn.addEventListener('click', () => closeModal('optimize'));
      cancelBtn.addEventListener('click', () => closeModal(null));
      header.querySelector('#ad-img-choice-close-x')?.addEventListener('click', () => closeModal(null));

      // Click outside dialog to cancel
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(null);
      });
    });
  }
}
