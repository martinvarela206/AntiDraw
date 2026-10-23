import { I18nService } from '../i18n/I18nService.js';
import { VsCodeBridge } from '../bridge/VsCodeBridge.js';

export const KOFI_URL = 'https://ko-fi.com/martinvarela206';

/**
 * ARCHITECTURAL RATIONALE: WelcomeModal (Startup & Creator Support Modal)
 *
 * 1. Frictionless Onboarding & Awareness:
 *    Introduces AntiDraw version, update telemetry, and creator donation option
 *    upon webview startup in an elegant, non-intrusive modal dialog.
 *
 * 2. Ko-fi Dual Action (Open & Dismiss):
 *    Clicking the Ko-fi donation button immediately dispatches external browser opening
 *    via VsCodeBridge IPC / window.open AND safely dismisses the modal.
 *
 * 3. 100% Internationalized:
 *    All titles, badges, update strings, descriptions, and action labels dynamically
 *    reflect the active locale across all 7 supported languages.
 */
export class WelcomeModal {
  private static activeModal: HTMLElement | null = null;

  public static show(): void {
    if (typeof document === 'undefined' || !document.body) {
      return;
    }

    // Dismiss any existing active modal
    if (this.activeModal) {
      this.activeModal.remove();
      this.activeModal = null;
    }

    const version = document.body.getAttribute('data-extension-version') || '0.97.2';
    const lastUpdateDate = document.body.getAttribute('data-extension-date') || '2026-10-22';
    const iconUri = document.body.getAttribute('data-icon-uri');

    const backdrop = document.createElement('div');
    backdrop.className = 'ad-modal-backdrop ad-welcome-backdrop';

    const container = document.createElement('div');
    container.className = 'ad-modal-container ad-welcome-container';
    container.setAttribute('role', 'dialog');
    container.setAttribute('aria-modal', 'true');
    container.setAttribute('aria-labelledby', 'welcome-modal-title');

    // Logo Markup: Render icon image with crisp inline SVG fallback
    const logoMarkup = iconUri
      ? `<img src="${iconUri}" alt="AntiDraw" class="ad-welcome-logo-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
         <div class="ad-welcome-logo-fallback" style="display:none;">
           ${this.getSvgLogo()}
         </div>`
      : `<div class="ad-welcome-logo-fallback">${this.getSvgLogo()}</div>`;

    container.innerHTML = `
      <div class="ad-welcome-header">
        <div class="ad-welcome-logo-box">
          ${logoMarkup}
        </div>
        <div class="ad-welcome-meta">
          <div class="ad-welcome-title-row">
            <h2 id="welcome-modal-title" class="ad-welcome-title">AntiDraw</h2>
            <span class="ad-welcome-version-badge">${I18nService.t('welcomeModal.version', { version })}</span>
          </div>
          <div class="ad-welcome-date">${I18nService.t('welcomeModal.lastUpdate', { date: lastUpdateDate })}</div>
        </div>
      </div>

      <div class="ad-welcome-body">
        <p class="ad-welcome-message">${I18nService.t('welcomeModal.message')}</p>
      </div>

      <div class="ad-welcome-actions">
        <button type="button" class="ad-modal-btn ad-welcome-dismiss-btn" id="btn-welcome-dismiss">
          ${I18nService.t('welcomeModal.maybeLater')}
        </button>
        <button type="button" class="ad-modal-btn ad-welcome-kofi-btn" id="btn-welcome-kofi">
          <svg class="ad-kofi-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.238-.209-.238-.209s-2.766-2.523-4.012-3.976c-1.325-1.547-.947-3.725.688-4.544 1.701-.852 3.562.646 3.562.646s1.861-1.498 3.562-.646c1.635.819 2.013 2.997.749 4.73zm8.337-1.157c-.511 2.696-2.732 2.768-2.732 2.768v-5.61s2.221.146 2.732 2.842z"/>
          </svg>
          <span>${I18nService.t('welcomeModal.donateKoFi')}</span>
        </button>
      </div>
    `;

    backdrop.appendChild(container);
    document.body.appendChild(backdrop);
    this.activeModal = backdrop;

    const close = () => {
      window.removeEventListener('keydown', onKeyDown);
      backdrop.remove();
      if (this.activeModal === backdrop) {
        this.activeModal = null;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    // Backdrop click dismisses
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        close();
      }
    });

    // Dismiss button ("Quizás más tarde")
    const dismissBtn = container.querySelector<HTMLButtonElement>('#btn-welcome-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', (e) => {
        e.preventDefault();
        close();
      });
      dismissBtn.focus();
    }

    // Ko-fi Button: Opens URL in external browser AND closes modal
    const kofiBtn = container.querySelector<HTMLButtonElement>('#btn-welcome-kofi');
    if (kofiBtn) {
      kofiBtn.addEventListener('click', (e) => {
        e.preventDefault();
        try {
          if (typeof window !== 'undefined') {
            window.open(KOFI_URL, '_blank');
          }
          VsCodeBridge.getInstance().openExternal(KOFI_URL);
        } catch (err) {
          console.warn('[WelcomeModal] Failed to open external URL:', err);
        }
        close();
      });
    }
  }

  public static close(): void {
    if (this.activeModal) {
      this.activeModal.remove();
      this.activeModal = null;
    }
  }

  private static getSvgLogo(): string {
    return `
      <svg width="48" height="48" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="ad-logo-grad" x1="16" y1="16" x2="112" y2="112" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#00C0FF"/>
            <stop offset="50%" stop-color="#3B82F6"/>
            <stop offset="100%" stop-color="#8B5CF6"/>
          </linearGradient>
        </defs>
        <rect width="128" height="128" rx="28" fill="#0E1117"/>
        <!-- Orbital Vector Ring -->
        <ellipse cx="64" cy="64" rx="54" ry="24" stroke="url(#ad-logo-grad)" stroke-width="4" transform="rotate(-25 64 64)"/>
        <!-- Stylized Vector A -->
        <path d="M64 26L34 98H49L56 80H72L79 98H94L64 26ZM64 48L69 67H59L64 48Z" fill="url(#ad-logo-grad)"/>
        <!-- Orbit Handle Nodes -->
        <circle cx="20" cy="74" r="5" fill="#00C0FF"/>
        <rect x="102" y="48" width="9" height="9" rx="2" fill="#8B5CF6"/>
      </svg>
    `;
  }
}
