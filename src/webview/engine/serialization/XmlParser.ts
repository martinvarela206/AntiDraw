/**
 * CAPA L1 / L2: Abstracción Isomórfica del Parser XML (IXmlParser)
 *
 * Desacopla la interpretación de árboles XML/SVG del entorno de ejecución:
 * - Webview (Navegador Chromium / VS Code Webview): Utiliza la API nativa de alta fidelidad `DOMParser`.
 * - Entornos Headless / Node.js (Tests, CLI, exportadores server-side): Utiliza implementaciones
 *   ligeras tipo `linkedom` o adaptadores inyectados sin depender de globals implícitos (`globalThis.DOMParser`).
 */

export interface IXmlParser {
  parseFromString(xmlString: string, mimeType?: string): Document;
}

export class NativeBrowserXmlParser implements IXmlParser {
  public parseFromString(xmlString: string, mimeType: string = 'image/svg+xml'): Document {
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      return parser.parseFromString(xmlString, mimeType as any);
    }
    throw new Error('[AntiDraw:XmlParser] DOMParser no está disponible en este entorno de ejecución.');
  }
}

export class HeadlessNodeXmlParser implements IXmlParser {
  private linkedomParser: ((xml: string, mime: string) => Document) | null = null;

  constructor(customParser?: (xml: string, mime: string) => Document) {
    if (customParser) {
      this.linkedomParser = customParser;
    }
  }

  public parseFromString(xmlString: string, mimeType: string = 'image/svg+xml'): Document {
    if (this.linkedomParser) {
      return this.linkedomParser(xmlString, mimeType);
    }

    // Intenta cargar linkedom dinámicamente si está en Node.js
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { DOMParser: LinkedDOMParser } = require('linkedom');
      const parser = new LinkedDOMParser();
      return parser.parseFromString(xmlString, mimeType) as unknown as Document;
    } catch (_err) {
      if (typeof (globalThis as any).DOMParser !== 'undefined') {
        const parser = new (globalThis as any).DOMParser();
        return parser.parseFromString(xmlString, mimeType);
      }
      throw new Error(
        '[AntiDraw:HeadlessNodeXmlParser] No se pudo instanciar un parser XML. Asegúrese de que linkedom esté disponible o configure un parser personalizado.'
      );
    }
  }
}

export class IsomorphicXmlParserFactory {
  private static defaultParser: IXmlParser | null = null;

  public static setDefaultParser(parser: IXmlParser | null): void {
    IsomorphicXmlParserFactory.defaultParser = parser;
  }

  public static getParser(): IXmlParser {
    if (IsomorphicXmlParserFactory.defaultParser) {
      return IsomorphicXmlParserFactory.defaultParser;
    }

    // Detección automática de entorno
    if (typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
      return new NativeBrowserXmlParser();
    }

    if (typeof (globalThis as any).DOMParser !== 'undefined') {
      return new NativeBrowserXmlParser();
    }

    return new HeadlessNodeXmlParser();
  }

  public static parse(xmlString: string, mimeType: string = 'image/svg+xml'): Document {
    return IsomorphicXmlParserFactory.getParser().parseFromString(xmlString, mimeType);
  }
}
