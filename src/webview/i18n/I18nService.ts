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
  private static language: Language = 'en';
  private static ideLanguage: Language = 'en';
  private static isAutoMode: boolean = true;
  private static listeners: Set<(lang: Language) => void> = new Set();
  private static initialized = false;

  public static resolveLocale(localeStr: string): Language {
    if (!localeStr) return 'en';
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

    // 1. Determine IDE language from argument, DOM injection or navigator
    if (initialLang) {
      this.ideLanguage = this.resolveLocale(initialLang);
    } else if (typeof document !== 'undefined' && document.body) {
      const bodyLang = document.body.getAttribute('data-vscode-language');
      if (bodyLang) {
        this.ideLanguage = this.resolveLocale(bodyLang);
      } else if (typeof navigator !== 'undefined' && navigator.language) {
        this.ideLanguage = this.resolveLocale(navigator.language);
      }
    } else if (typeof navigator !== 'undefined' && navigator.language) {
      this.ideLanguage = this.resolveLocale(navigator.language);
    }

    // 2. Check manual user override in localStorage
    let saved: string | null = null;
    try {
      if (typeof localStorage !== 'undefined') {
        saved = localStorage.getItem('antidraw_language');
      }
    } catch (_) {}

    const validLanguages: Language[] = ['es', 'en', 'zh-cn', 'de', 'fr', 'ru', 'ja'];
    if (saved && saved !== 'auto' && validLanguages.includes(saved as Language)) {
      this.isAutoMode = false;
      this.language = saved as Language;
    } else {
      // Default to IDE's language
      this.isAutoMode = true;
      this.language = this.ideLanguage;
    }

    this.initialized = true;
  }

  public static setIdeLanguage(locale: string): void {
    const resolved = this.resolveLocale(locale);
    this.ideLanguage = resolved;
    if (this.isAutoMode) {
      this.setLanguage('auto', false);
    }
  }

  public static getIdeLanguage(): Language {
    if (!this.initialized) {
      this.initialize();
    }
    return this.ideLanguage;
  }

  public static isAuto(): boolean {
    if (!this.initialized) {
      this.initialize();
    }
    return this.isAutoMode;
  }

  public static getLanguage(): Language {
    if (!this.initialized) {
      this.initialize();
    }
    return this.language;
  }

  public static setLanguage(lang: Language | 'auto', persist: boolean = true): void {
    const prevLang = this.language;
    if (lang === 'auto') {
      this.isAutoMode = true;
      this.language = this.ideLanguage;
      if (persist) {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('antidraw_language');
          }
        } catch (_) {}
      }
    } else {
      this.isAutoMode = false;
      this.language = lang;
      if (persist) {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('antidraw_language', lang);
          }
        } catch (_) {}
      }
    }
    this.initialized = true;

    this.listeners.forEach((cb) => {
      try {
        cb(this.language);
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
