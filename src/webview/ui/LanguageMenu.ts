import { Language } from '../i18n/types.js';
import { I18nService } from '../i18n/I18nService.js';

export const FlagIcons: Record<Language, string> = {
  es: `<svg class="lang-flag" width="18" height="13" viewBox="0 0 18 13" fill="none" xmlns="http://www.w3.org/2000/svg" style="border-radius:2px; flex-shrink:0; box-shadow: 0 0 0 1px rgba(0,0,0,0.2);">
    <rect width="18" height="13" rx="1" fill="#AA151B"/>
    <rect y="3.25" width="18" height="6.5" fill="#F1BF00"/>
    <rect x="3.5" y="4.5" width="2" height="4" rx="0.5" fill="#AA151B"/>
  </svg>`,

  en: `<svg class="lang-flag" width="18" height="13" viewBox="0 0 18 13" fill="none" xmlns="http://www.w3.org/2000/svg" style="border-radius:2px; flex-shrink:0; box-shadow: 0 0 0 1px rgba(0,0,0,0.2);">
    <clipPath id="uk-flag-clip"><rect width="18" height="13" rx="1"/></clipPath>
    <g clip-path="url(#uk-flag-clip)">
      <rect width="18" height="13" fill="#012169"/>
      <path d="M0 0 L18 13 M18 0 L0 13" stroke="#FFFFFF" stroke-width="2.6"/>
      <path d="M0 0 L18 13 M18 0 L0 13" stroke="#C8102E" stroke-width="1.3"/>
      <path d="M9 0 V13 M0 6.5 H18" stroke="#FFFFFF" stroke-width="4.2"/>
      <path d="M9 0 V13 M0 6.5 H18" stroke="#C8102E" stroke-width="2.6"/>
    </g>
  </svg>`,

  'zh-cn': `<svg class="lang-flag" width="18" height="13" viewBox="0 0 18 13" fill="none" xmlns="http://www.w3.org/2000/svg" style="border-radius:2px; flex-shrink:0; box-shadow: 0 0 0 1px rgba(0,0,0,0.2);">
    <clipPath id="cn-flag-clip"><rect width="18" height="13" rx="1"/></clipPath>
    <g clip-path="url(#cn-flag-clip)">
      <rect width="18" height="13" fill="#DE2910"/>
      <polygon points="3.5,1.8 4.1,3.4 5.7,3.4 4.4,4.3 4.9,5.8 3.5,4.9 2.1,5.8 2.6,4.3 1.3,3.4 2.9,3.4" fill="#FFDE00"/>
      <circle cx="7.2" cy="2.2" r="0.65" fill="#FFDE00"/>
      <circle cx="8.3" cy="3.6" r="0.65" fill="#FFDE00"/>
      <circle cx="8.3" cy="5.2" r="0.65" fill="#FFDE00"/>
      <circle cx="7.2" cy="6.6" r="0.65" fill="#FFDE00"/>
    </g>
  </svg>`,

  de: `<svg class="lang-flag" width="18" height="13" viewBox="0 0 18 13" fill="none" xmlns="http://www.w3.org/2000/svg" style="border-radius:2px; flex-shrink:0; box-shadow: 0 0 0 1px rgba(0,0,0,0.2);">
    <rect width="18" height="4.33" fill="#000000"/>
    <rect y="4.33" width="18" height="4.34" fill="#DD0000"/>
    <rect y="8.67" width="18" height="4.33" fill="#FFCE00"/>
  </svg>`,

  fr: `<svg class="lang-flag" width="18" height="13" viewBox="0 0 18 13" fill="none" xmlns="http://www.w3.org/2000/svg" style="border-radius:2px; flex-shrink:0; box-shadow: 0 0 0 1px rgba(0,0,0,0.2);">
    <rect width="6" height="13" fill="#002395"/>
    <rect x="6" width="6" height="13" fill="#FFFFFF"/>
    <rect x="12" width="6" height="13" fill="#ED2939"/>
  </svg>`,

  ru: `<svg class="lang-flag" width="18" height="13" viewBox="0 0 18 13" fill="none" xmlns="http://www.w3.org/2000/svg" style="border-radius:2px; flex-shrink:0; box-shadow: 0 0 0 1px rgba(0,0,0,0.2);">
    <rect width="18" height="4.33" fill="#FFFFFF"/>
    <rect y="4.33" width="18" height="4.34" fill="#0039A6"/>
    <rect y="8.67" width="18" height="4.33" fill="#D52B1E"/>
  </svg>`,

  ja: `<svg class="lang-flag" width="18" height="13" viewBox="0 0 18 13" fill="none" xmlns="http://www.w3.org/2000/svg" style="border-radius:2px; flex-shrink:0; box-shadow: 0 0 0 1px rgba(0,0,0,0.2);">
    <rect width="18" height="13" fill="#FFFFFF"/>
    <circle cx="9" cy="6.5" r="3.8" fill="#BC002D"/>
  </svg>`,
};

export interface LanguageOption {
  code: Language;
  name: string;
  localCode: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'es', name: 'Español', localCode: 'ES' },
  { code: 'en', name: 'English', localCode: 'EN' },
  { code: 'zh-cn', name: '简体中文', localCode: 'ZH-CN' },
  { code: 'de', name: 'Deutsch', localCode: 'DE' },
  { code: 'fr', name: 'Français', localCode: 'FR' },
  { code: 'ru', name: 'Русский', localCode: 'RU' },
  { code: 'ja', name: '日本語', localCode: 'JA' },
];

/**
 * ARCHITECTURAL RATIONALE: Language Selector Popover Menu
 *
 * Provides a sleek, Figma-inspired floating popover menu anchored to the status bar button.
 * Renders high-fidelity crisp SVG flags, localized language titles, language code badges,
 * and active checkmarks, with robust window capture-phase dismiss lifecycle.
 */
export class LanguageMenu {
  private element: HTMLElement;
  private triggerBtn: HTMLElement | null = null;
  private isOpen = false;

  constructor() {
    this.element = document.createElement('div');
    this.element.id = 'language-popover-menu';
    this.element.className = 'lang-popover-menu';
    this.element.style.display = 'none';
    document.body.appendChild(this.element);

    // Global capture-phase dismiss on click outside
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.isOpen) return;
        const target = e.target as Node;
        if (!this.element.contains(target) && (!this.triggerBtn || !this.triggerBtn.contains(target))) {
          this.hide();
        }
      },
      true
    );

    // Dismiss on Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.hide();
      }
    });

    // Update trigger button content when language changes globally
    I18nService.onLanguageChange((lang) => {
      if (this.triggerBtn) {
        this.updateButton(this.triggerBtn, lang);
      }
      if (this.isOpen) {
        this.renderItems();
      }
    });
  }

  public attach(btn: HTMLElement): void {
    this.triggerBtn = btn;
    this.updateButton(btn, I18nService.getLanguage());

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggle();
    });
  }

  public updateButton(btn: HTMLElement, lang: Language): void {
    const flagSvg = FlagIcons[lang] || FlagIcons.en;
    const label = lang.toUpperCase();
    const isAuto = I18nService.isAuto();

    btn.innerHTML = `
      <span class="status-btn-flag" style="display:inline-flex; align-items:center; margin-right:4px;">${flagSvg}</span>
      <span class="status-btn-lang-code" style="font-weight:700; letter-spacing:0.5px;">${label}</span>
      <svg class="status-lang-chevron" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left:3px; opacity:0.75; transition:transform 0.15s ease;">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    `;
    const baseTooltip = I18nService.t('statusbar.languageToggleTooltip');
    btn.title = isAuto ? `${baseTooltip} (Auto IDE)` : baseTooltip;
  }

  public toggle(): void {
    if (this.isOpen) {
      this.hide();
    } else {
      this.show();
    }
  }

  public show(): void {
    if (!this.triggerBtn) return;
    this.renderItems();
    this.element.style.display = 'flex';
    this.isOpen = true;
    this.triggerBtn.classList.add('active');

    // Anchor calculation: position floating menu right above status bar button
    const btnRect = this.triggerBtn.getBoundingClientRect();
    const menuRect = this.element.getBoundingClientRect();

    const top = Math.max(8, btnRect.top - menuRect.height - 6);
    // Align menu right with button right edge, clamped inside window
    const idealLeft = btnRect.right - menuRect.width;
    const clampedLeft = Math.max(8, Math.min(idealLeft, window.innerWidth - menuRect.width - 8));

    this.element.style.top = `${top}px`;
    this.element.style.left = `${clampedLeft}px`;

    const chevron = this.triggerBtn.querySelector('.status-lang-chevron') as HTMLElement;
    if (chevron) {
      chevron.style.transform = 'rotate(180deg)';
    }
  }

  public hide(): void {
    this.element.style.display = 'none';
    this.isOpen = false;
    if (this.triggerBtn) {
      this.triggerBtn.classList.remove('active');
      const chevron = this.triggerBtn.querySelector('.status-lang-chevron') as HTMLElement;
      if (chevron) {
        chevron.style.transform = 'rotate(0deg)';
      }
    }
  }

  private renderItems(): void {
    const currentLang = I18nService.getLanguage();
    const isAuto = I18nService.isAuto();
    const ideLang = I18nService.getIdeLanguage();
    const ideLangName = SUPPORTED_LANGUAGES.find((l) => l.code === ideLang)?.name || ideLang.toUpperCase();
    const autoLabel = I18nService.t('statusbar.languageAuto', { lang: ideLangName });
    const autoFlag = FlagIcons[ideLang] || FlagIcons.en;
    const headerTitle = I18nService.t('statusbar.languageSelect');

    const checkSvg = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;

    const autoItemHtml = `
      <div class="lang-menu-item ${isAuto ? 'active' : ''}" data-lang="auto" style="border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.08)); margin-bottom: 4px; padding-bottom: 6px;">
        <span class="lang-menu-flag">${autoFlag}</span>
        <span class="lang-menu-name" style="font-weight:600;">${autoLabel}</span>
        <span class="lang-menu-code">AUTO</span>
        <span class="lang-menu-check" style="${isAuto ? '' : 'visibility:hidden;'}">${checkSvg}</span>
      </div>
    `;

    const itemsHtml = SUPPORTED_LANGUAGES.map((opt) => {
      const isSelected = !isAuto && opt.code === currentLang;
      const flagSvg = FlagIcons[opt.code];

      return `
        <div class="lang-menu-item ${isSelected ? 'active' : ''}" data-lang="${opt.code}">
          <span class="lang-menu-flag">${flagSvg}</span>
          <span class="lang-menu-name">${opt.name}</span>
          <span class="lang-menu-code">${opt.localCode}</span>
          <span class="lang-menu-check" style="${isSelected ? '' : 'visibility:hidden;'}">${checkSvg}</span>
        </div>
      `;
    }).join('');

    this.element.innerHTML = `
      <div class="lang-menu-header">${headerTitle}</div>
      <div class="lang-menu-list" style="display:flex; flex-direction:column; gap:2px;">
        ${autoItemHtml}
        ${itemsHtml}
      </div>
    `;

    // Bind item click listeners
    const itemEls = this.element.querySelectorAll('.lang-menu-item');
    itemEls.forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const langCode = el.getAttribute('data-lang');
        if (langCode === 'auto') {
          I18nService.setLanguage('auto');
        } else if (langCode) {
          I18nService.setLanguage(langCode as Language);
        }
        this.hide();
      });
    });
  }
}
