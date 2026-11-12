/**
 * AntiDraw Test Harness: Minimal VS Code API Mock
 */

export class Uri {
  public scheme: string;
  public authority: string;
  public path: string;
  public query: string;
  public fragment: string;
  public fsPath: string;

  constructor(path: string) {
    this.path = path.replace(/\\/g, '/');
    this.scheme = 'file';
    this.authority = '';
    this.query = '';
    this.fragment = '';
    this.fsPath = this.path;
  }

  public static file(path: string): Uri {
    return new Uri(path);
  }

  public static parse(uriStr: string): Uri {
    return new Uri(uriStr.replace(/^file:\/\//, ''));
  }

  public static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    const joined = [base.path.replace(/\/+$/, ''), ...pathSegments].join('/');
    return new Uri(joined);
  }

  public with(change: { path?: string }): Uri {
    return new Uri(change.path !== undefined ? change.path : this.path);
  }

  public toString(): string {
    return `file://${this.path}`;
  }
}

export class EventEmitter<T = any> {
  private listeners: ((e: T) => any)[] = [];

  public event = (listener: (e: T) => any): { dispose: () => void } => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const idx = this.listeners.indexOf(listener);
        if (idx !== -1) this.listeners.splice(idx, 1);
      },
    };
  };

  public fire(data: T): void {
    for (const listener of [...this.listeners]) {
      listener(data);
    }
  }

  public dispose(): void {
    this.listeners = [];
  }
}

export class Disposable {
  constructor(private readonly callOnDispose: () => any) {}
  public dispose(): void {
    if (this.callOnDispose) this.callOnDispose();
  }
  public static from(...disposables: { dispose: () => any }[]): Disposable {
    return new Disposable(() => {
      for (const d of disposables) {
        if (d && typeof d.dispose === 'function') d.dispose();
      }
    });
  }
}

export interface InMemoryFileSystem {
  files: Map<string, Uint8Array>;
}

export const mockFsStorage = new Map<string, Uint8Array>();

export const workspace = {
  workspaceFolders: [{ uri: new Uri('/test-workspace') }],
  fs: {
    readFile: async (uri: Uri): Promise<Uint8Array> => {
      const data = mockFsStorage.get(uri.path);
      if (!data) {
        throw new Error(`File not found: ${uri.path}`);
      }
      return data;
    },
    writeFile: async (uri: Uri, content: Uint8Array): Promise<void> => {
      mockFsStorage.set(uri.path, content);
    },
    delete: async (uri: Uri): Promise<void> => {
      mockFsStorage.delete(uri.path);
    },
    rename: async (source: Uri, target: Uri): Promise<void> => {
      const data = mockFsStorage.get(source.path);
      if (!data) throw new Error(`Source not found: ${source.path}`);
      mockFsStorage.set(target.path, data);
      mockFsStorage.delete(source.path);
    },
  },
};

export const window = {
  showInformationMessage: (_msg: string) => {},
  showErrorMessage: (_msg: string) => {},
  registerCustomEditorProvider: (_viewType: string, _provider: any, _options?: any) => {
    return new Disposable(() => {});
  },
};

export const env = {
  language: 'en',
  openExternal: async (_uri: Uri) => true,
};

export interface Memento {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: any): Thenable<void>;
  keys(): readonly string[];
}

export class MockMemento implements Memento {
  private storage = new Map<string, any>();

  public get<T>(key: string, defaultValue?: T): any {
    return this.storage.has(key) ? this.storage.get(key) : defaultValue;
  }

  public async update(key: string, value: any): Promise<void> {
    if (value === undefined) {
      this.storage.delete(key);
    } else {
      this.storage.set(key, value);
    }
  }

  public keys(): readonly string[] {
    return Array.from(this.storage.keys());
  }
}

export const CancellationTokenNone = {
  isCancellationRequested: false,
  onCancellationRequested: new EventEmitter().event,
};
