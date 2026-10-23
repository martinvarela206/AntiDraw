import { I18nService } from '../i18n/I18nService.js';
import { VsCodeBridge } from '../bridge/VsCodeBridge.js';
import { ANTIDRAW_LOGO_DATA_URI } from './assets/AntiDrawLogo.js';

export const KOFI_URL = 'https://ko-fi.com/martinvarela206';

/**
 * ARCHITECTURAL RATIONALE: WelcomeModal (Cosmic Creator Support Modal)
 *
 * 1. High-Impact Aesthetic & Visual Identity:
 *    Reflects the futuristic, space-neon vector identity of AntiDraw, featuring
 *    the official orbital vector logo, radiant glowing Ko-fi cup, and cosmic curves.
 *
 * 2. Guaranteed Asset Availability:
 *    Uses embedded ANTIDRAW_LOGO_DATA_URI base64 data to eliminate broken image icons
 *    and ensure zero-latency rendering regardless of webview CSP or filesystem access.
 *
 * 3. 100% Internationalized:
 *    All titles, version tags, headlines, messages, and button labels are dynamically
 *    localized across English, Spanish, Chinese, German, French, Russian, and Japanese.
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

    const version = document.body.getAttribute('data-extension-version') || '0.98.0';
    const lastUpdateDate = document.body.getAttribute('data-extension-date') || '2026-10-22';

    const backdrop = document.createElement('div');
    backdrop.className = 'ad-modal-backdrop ad-welcome-backdrop';

    const card = document.createElement('div');
    card.className = 'ad-welcome-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'welcome-modal-title');

    card.innerHTML = `
      <!-- Ambient Decorative Vector Elements -->
      <div class="ad-welcome-vector-bg" aria-hidden="true">
        <svg class="ad-welcome-bg-svg" viewBox="0 0 400 600" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Top Left Neon Wave -->
          <path d="M-40 120 C40 80, 80 180, 160 110" stroke="url(#ad-bg-grad-cyan)" stroke-width="2.5" opacity="0.6"/>
          <circle cx="160" cy="110" r="4.5" fill="#00D2FF"/>
          <!-- Top Right Neon Node -->
          <rect x="330" y="45" width="8" height="8" rx="1.5" fill="#00D2FF" opacity="0.8"/>
          <!-- Bottom Left Magenta Wave & Node -->
          <path d="M-20 460 C60 520, 110 440, 180 540" stroke="url(#ad-bg-grad-pink)" stroke-width="2" opacity="0.5"/>
          <rect x="25" y="525" width="7" height="7" rx="1.5" fill="#FF2E93" opacity="0.7"/>
          <!-- Bottom Right Violet Glow Arc -->
          <path d="M260 580 C320 540, 360 480, 420 520" stroke="url(#ad-bg-grad-violet)" stroke-width="2.5" opacity="0.5"/>
          <defs>
            <linearGradient id="ad-bg-grad-cyan" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#00D2FF" stop-opacity="0.9"/>
              <stop offset="100%" stop-color="#7000FF" stop-opacity="0.2"/>
            </linearGradient>
            <linearGradient id="ad-bg-grad-pink" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#FF2E93" stop-opacity="0.8"/>
              <stop offset="100%" stop-color="#7000FF" stop-opacity="0.1"/>
            </linearGradient>
            <linearGradient id="ad-bg-grad-violet" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#7000FF" stop-opacity="0.8"/>
              <stop offset="100%" stop-color="#FF2E93" stop-opacity="0.2"/>
            </linearGradient>
          </defs>
        </svg>
      </div>

      <!-- Close Button (Top Right) -->
      <button type="button" class="ad-welcome-close-btn" id="btn-welcome-close" title="${I18nService.t('common.close')} (Esc)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <!-- Logo & Title Section -->
      <div class="ad-welcome-hero">
        <div class="ad-welcome-logo-container">
          <img src="${ANTIDRAW_LOGO_DATA_URI}" alt="AntiDraw" class="ad-welcome-main-logo" />
        </div>
        <h1 id="welcome-modal-title" class="ad-welcome-title">
          <span class="ad-welcome-title-anti">Anti</span><span class="ad-welcome-title-draw">Draw</span>
        </h1>
        <div class="ad-welcome-version-row">
          <span class="ad-welcome-divider-line"></span>
          <span class="ad-welcome-version-pill">${I18nService.t('welcomeModal.version', { version })}</span>
          <span class="ad-welcome-divider-line"></span>
        </div>
        <div class="ad-welcome-date-text">
          ${I18nService.t('welcomeModal.lastUpdate', { date: lastUpdateDate })}
        </div>
      </div>

      <!-- Radiant Ko-fi Cup Icon with Energy Sparks -->
      <div class="ad-welcome-cup-box" aria-hidden="true">
        <svg class="ad-welcome-cup-svg" width="46" height="46" viewBox="0 0 48 48" fill="none">
          <!-- Sparks / Radiance -->
          <line x1="24" y1="5" x2="24" y2="10" stroke="#00E5FF" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="13" y1="9" x2="17" y2="13" stroke="#00C2FF" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="35" y1="9" x2="31" y2="13" stroke="#D946EF" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="9" y1="20" x2="13" y2="20" stroke="#00C2FF" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="39" y1="20" x2="35" y2="20" stroke="#D946EF" stroke-width="2.5" stroke-linecap="round"/>
          <!-- Cup Outline -->
          <path d="M14 17H31V27C31 31.4 27.4 35 23 35H22C17.6 35 14 31.4 14 27V17Z" stroke="#00E5FF" stroke-width="3" fill="#0C1322"/>
          <!-- Cup Handle -->
          <path d="M31 20H34.5C36.4 20 38 21.6 38 23.5C38 25.4 36.4 27 34.5 27H31" stroke="#D946EF" stroke-width="3" stroke-linecap="round"/>
          <!-- Heart in Cup -->
          <path d="M22.5 23.8C21.6 22.6 19.8 22.9 19.3 24.2C18.6 26.1 22.5 28.2 22.5 28.2C22.5 28.2 26.4 26.1 25.7 24.2C25.2 22.9 23.4 22.6 22.5 23.8Z" fill="#FFFFFF"/>
        </svg>
      </div>

      <!-- Headline & Appeal Message -->
      <div class="ad-welcome-message-block">
        <div class="ad-welcome-lead">${I18nService.t('welcomeModal.headline')}</div>
        <div class="ad-welcome-highlight">${I18nService.t('welcomeModal.headlineHighlight')}</div>
        <p class="ad-welcome-body-text">${I18nService.t('welcomeModal.message')}</p>
      </div>

      <!-- Action Buttons -->
      <div class="ad-welcome-buttons-col">
        <button type="button" class="ad-welcome-kofi-pill-btn" id="btn-welcome-kofi">
          <div class="ad-welcome-kofi-cup-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF5E5B">
              <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.238-.209-.238-.209s-2.766-2.523-4.012-3.976c-1.325-1.547-.947-3.725.688-4.544 1.701-.852 3.562.646 3.562.646s1.861-1.498 3.562-.646c1.635.819 2.013 2.997.749 4.73zm8.337-1.157c-.511 2.696-2.732 2.768-2.732 2.768v-5.61s2.221.146 2.732 2.842z"/>
            </svg>
          </div>
          <span class="ad-welcome-kofi-text">${I18nService.t('welcomeModal.donateKoFi')}</span>
          <svg class="ad-welcome-external-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="7" y1="17" x2="17" y2="7"></line>
            <polyline points="7 7 17 7 17 17"></polyline>
          </svg>
        </button>

        <button type="button" class="ad-welcome-later-pill-btn" id="btn-welcome-dismiss">
          ${I18nService.t('welcomeModal.maybeLater')}
        </button>
      </div>
    `;

    backdrop.appendChild(card);
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

    // Close button (X)
    const closeXBtn = card.querySelector<HTMLButtonElement>('#btn-welcome-close');
    if (closeXBtn) {
      closeXBtn.addEventListener('click', (e) => {
        e.preventDefault();
        close();
      });
    }

    // Dismiss button ("Quizás más tarde")
    const dismissBtn = card.querySelector<HTMLButtonElement>('#btn-welcome-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', (e) => {
        e.preventDefault();
        close();
      });
      dismissBtn.focus();
    }

    // Ko-fi Button: Opens URL in external browser AND closes modal
    const kofiBtn = card.querySelector<HTMLButtonElement>('#btn-welcome-kofi');
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
}
