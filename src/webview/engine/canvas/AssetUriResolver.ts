/**
 * CAPA L1: Asset URI Resolver & Live In-Memory Cache (AssetUriResolver)
 * Resolves local file paths and assets for SVG rendering with zero L3/L4 dependencies.
 */

export class AssetUriResolver {
  private static liveAssetCache: Map<string, string> = new Map();
  private static baseWebviewUri: string | null = null;

  public static setBaseWebviewUri(uri: string | null): void {
    this.baseWebviewUri = uri;
  }

  public static getBaseWebviewUri(): string | null {
    return this.baseWebviewUri;
  }

  public static cacheLiveAsset(key: string, resolvedUri: string): void {
    if (!key || !resolvedUri) return;
    this.liveAssetCache.set(key, resolvedUri);
    const clean = key.replace(/^\.\//, '');
    this.liveAssetCache.set(clean, resolvedUri);
    const fileName = clean.split('/').pop();
    if (fileName) {
      this.liveAssetCache.set(fileName, resolvedUri);
    }
  }

  public static resolveLiveAssetUri(href: string): string {
    if (!href) return '';
    if (this.liveAssetCache.has(href)) {
      return this.liveAssetCache.get(href)!;
    }
    const clean = href.replace(/^\.\//, '');
    if (this.liveAssetCache.has(clean)) {
      return this.liveAssetCache.get(clean)!;
    }
    const fileName = clean.split('/').pop();
    if (fileName && this.liveAssetCache.has(fileName)) {
      return this.liveAssetCache.get(fileName)!;
    }
    if (this.baseWebviewUri && (href.startsWith('./') || !href.includes(':'))) {
      return `${this.baseWebviewUri}/${clean}`;
    }
    return href;
  }

  public static clearCache(): void {
    this.liveAssetCache.clear();
  }
}
