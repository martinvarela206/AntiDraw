import { Language, Translations } from './types.js';
import { es } from './es.js';
import { en } from './en.js';
import { zhCn } from './zh-cn.js';

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

  public static initialize(initialLang?: string): void {
    if (this.initialized && !initialLang) return;

    // 1. Check user preference stored in localStorage
    let saved: string | null = null;
    try {
      if (typeof localStorage !== 'undefined') {
        saved = localStorage.getItem('antidraw_language');
      }
    } catch (_) {}

    if (saved === 'es' || saved === 'en' || saved === 'zh-cn') {
      this.language = saved;
      this.initialized = true;
      return;
    }

    // 2. Explicit argument (e.g. from VS Code host environment)
    if (initialLang) {
      const lower = initialLang.toLowerCase();
      this.language = lower.startsWith('zh') ? 'zh-cn' : (lower.startsWith('es') ? 'es' : 'en');
      this.initialized = true;
      return;
    }

    // 3. Document body attribute injected by extension HTML template
    if (typeof document !== 'undefined' && document.body) {
      const bodyLang = document.body.getAttribute('data-vscode-language');
      if (bodyLang) {
        const lower = bodyLang.toLowerCase();
        this.language = lower.startsWith('zh') ? 'zh-cn' : (lower.startsWith('es') ? 'es' : 'en');
        this.initialized = true;
        return;
      }
    }

    // 4. Browser / system navigator language
    if (typeof navigator !== 'undefined' && navigator.language) {
      const lower = navigator.language.toLowerCase();
      this.language = lower.startsWith('zh') ? 'zh-cn' : (lower.startsWith('es') ? 'es' : 'en');
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
    const current = this.getLanguage();
    const nextLang: Language = current === 'es' ? 'en' : (current === 'en' ? 'zh-cn' : 'es');
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
    if (lang === 'zh-cn') return zhCn;
    if (lang === 'es') return es;
    return en;
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
