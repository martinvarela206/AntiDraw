/**
 * ARCHITECTURAL RATIONALE: Centralized Theme Management Service (ThemeService - L3)
 *
 * Adheres strictly to the figma-ux-ui engineering standard:
 * 1. Dual-Theme Support: Seamless switching between 'dark' and 'light' modes.
 * 2. Persistent State: Caches preference in localStorage (`antidraw_theme`).
 * 3. Reactive Subscriber Architecture: Notifies canvas renderers, rulers, and status bar
 *    without coupling them directly to DOM mutation observers.
 * 4. DOM Invariant: Enforces document.documentElement.setAttribute('data-theme', theme).
 */

export type AppTheme = 'dark' | 'light';

export class ThemeService {
  private static readonly STORAGE_KEY = 'antidraw_theme';
  private static currentTheme: AppTheme = 'dark';
  private static subscribers: Set<(theme: AppTheme) => void> = new Set();
  private static initialized: boolean = false;

  public static init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Detect persisted theme or fallback to dark
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY) as AppTheme | null;
      if (saved === 'dark' || saved === 'light') {
        this.currentTheme = saved;
      } else {
        this.currentTheme = 'dark';
      }
    } catch {
      this.currentTheme = 'dark';
    }

    this.applyThemeToDOM();
  }

  public static getTheme(): AppTheme {
    if (!this.initialized) {
      this.init();
    }
    return this.currentTheme;
  }

  public static isDark(): boolean {
    return this.getTheme() === 'dark';
  }

  public static isLight(): boolean {
    return this.getTheme() === 'light';
  }

  public static setTheme(theme: AppTheme): void {
    if (this.currentTheme === theme && this.initialized) return;
    this.currentTheme = theme;
    this.initialized = true;
    try {
      localStorage.setItem(this.STORAGE_KEY, theme);
    } catch {
      // Ignore if localStorage is restricted
    }
    this.applyThemeToDOM();
    this.notifySubscribers();
  }

  public static toggleTheme(): AppTheme {
    const nextTheme: AppTheme = this.getTheme() === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme);
    return nextTheme;
  }

  public static onThemeChange(callback: (theme: AppTheme) => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private static applyThemeToDOM(): void {
    document.documentElement.setAttribute('data-theme', this.currentTheme);
  }

  private static notifySubscribers(): void {
    for (const sub of this.subscribers) {
      try {
        sub(this.currentTheme);
      } catch (err) {
        console.error('[ThemeService] Subscriber error:', err);
      }
    }
  }
}
