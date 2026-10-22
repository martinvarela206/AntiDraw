import { Language, Translations } from './types.js';
import { es } from './es.js';
import { en } from './en.js';
import { zhCn } from './zh-cn.js';
import { de } from './de.js';
import { fr } from './fr.js';
import { ru } from './ru.js';
import { ja } from './ja.js';

type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

export type TranslationKey = NestedKeyOf<Translations>;

export class I18nService {
  private static language: Language = 'es';
  private static listeners: Set<(lang: Language) => void> = new Set();
  private static initialized = false;

  private static resolveLocale(localeStr: string): Language {
    const lower = localeStr.toLowerCase();
    if (lower.startsWith('es')) return 'es';
    if (lower.startsWith('zh')) return 'zh-cn';
    if (lower.startsWith('de')) return 'de';
    if (lower.startsWith('fr')) return 'fr';
    if (lower.startsWith('ru')) return 'ru';
    if (lower.startsWith('ja')) return 'ja';
    return 'en';
  }

  public static initialize(initialLang?: string): void {
    if (this.initialized && !initialLang) return;

    // 1. Check user preference stored in localStorage
    let saved: string | null = null;
    try {
      if (typeof localStorage !== 'undefined') {
        saved = localStorage.getItem('antidraw_language');
      }
    } catch (_) {}

    const validLanguages: Language[] = ['es', 'en', 'zh-cn', 'de', 'fr', 'ru', 'ja'];
    if (saved && validLanguages.includes(saved as Language)) {
      this.language = saved as Language;
      this.initialized = true;
      return;
    }

    // 2. Explicit argument (e.g. from VS Code host environment)
    if (initialLang) {
      this.language = this.resolveLocale(initialLang);
      this.initialized = true;
      return;
    }

    // 3. Document body attribute injected by extension HTML template
    if (typeof document !== 'undefined' && document.body) {
      const bodyLang = document.body.getAttribute('data-vscode-language');
      if (bodyLang) {
        this.language = this.resolveLocale(bodyLang);
        this.initialized = true;
        return;
      }
    }

    // 4. Browser / system navigator language
    if (typeof navigator !== 'undefined' && navigator.language) {
      this.language = this.resolveLocale(navigator.language);
    } else {
      this.language = 'en';
    }

    this.initialized = true;
  }

  public static getLanguage(): Language {
    if (!this.initialized) {
      this.initialize();
    }
    return this.language;
  }

  public static setLanguage(lang: Language): void {
    if (this.language === lang && this.initialized) return;
    this.language = lang;
    this.initialized = true;

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('antidraw_language', lang);
      }
    } catch (_) {}

    this.listeners.forEach((cb) => {
      try {
        cb(lang);
      } catch (err) {
        console.error('[I18nService] Error notifying listener:', err);
      }
    });
  }

  public static toggleLanguage(): Language {
    const languages: Language[] = ['es', 'en', 'zh-cn', 'de', 'fr', 'ru', 'ja'];
    const current = this.getLanguage();
    const idx = languages.indexOf(current);
    const nextLang = languages[(idx + 1) % languages.length];
    this.setLanguage(nextLang);
    return nextLang;
  }

  public static onLanguageChange(listener: (lang: Language) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public static getDict(): Translations {
    const lang = this.getLanguage();
    switch (lang) {
      case 'es': return es;
      case 'zh-cn': return zhCn;
      case 'de': return de;
      case 'fr': return fr;
      case 'ru': return ru;
      case 'ja': return ja;
      case 'en':
      default:
        return en;
    }
  }

  public static t(path: TranslationKey | string, params?: Record<string, string | number>): string {
    const dict = this.getDict();
    const parts = path.split('.');
    let curr: any = dict;

    for (const p of parts) {
      if (curr && typeof curr === 'object' && p in curr) {
        curr = curr[p];
      } else {
        // Fallback if path missing
        curr = null;
        break;
      }
    }

    // Fallback to English if key missing in current dict
    if (curr === null || typeof curr !== 'string') {
      let fallbackCurr: any = en;
      for (const p of parts) {
        if (fallbackCurr && typeof fallbackCurr === 'object' && p in fallbackCurr) {
          fallbackCurr = fallbackCurr[p];
        } else {
          fallbackCurr = null;
          break;
        }
      }
      if (fallbackCurr !== null && typeof fallbackCurr === 'string') {
        curr = fallbackCurr;
      }
    }

    let text = typeof curr === 'string' ? curr : path;

    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }

    return text;
  }
}
