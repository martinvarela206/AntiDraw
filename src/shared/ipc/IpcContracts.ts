/**
 * ARCHITECTURAL RATIONALE: Bi-directional IPC Protocol Schema & Strict Contracts (IpcContracts - L1/L4)
 *
 * 1. Single Responsibility Principle (SRP) & Zero-Trust Boundary:
 *    The postMessage boundary between VS Code Extension Host (Node.js) and Webview (Chromium)
 *    is a critical security perimeter. The host has full filesystem/OS privileges, while the
 *    webview executes untrusted SVG-driven client code. Untyped or unvalidated IPC messages
 *    can lead to crashes, arbitrary file writes, or protocol confusion.
 *
 * 2. Formal Schema Validation:
 *    Provides deterministic runtime type guards and validation for every message type flowing
 *    in either direction:
 *    - WebviewToHostMessage (Client -> Host)
 *    - HostToWebviewMessage (Host -> Client)
 *
 * 3. Safe Schema Sanitization:
 *    Enforces protocol-level constraints (e.g., openExternal accepts only http/https URLs,
 *    string fields have type and presence validation, and malformed messages are dropped).
 */

export interface DropShadowConfig {
  enabled: boolean;
  dx: number;
  dy: number;
  blur: number;
  color: string;
  opacity: number;
  filterRegionPadding?: number;
}

export interface InnerShadowConfig {
  enabled: boolean;
  dx: number;
  dy: number;
  blur: number;
  color: string;
  opacity: number;
}

export interface ElementBlendConfig {
  mode: 'specified-steps' | 'smooth-color' | 'specified-distance';
  steps: number;
  distance?: number;
  alignToPath?: boolean;
  reverseA?: boolean;
  reverseB?: boolean;
  startElementId?: string;
  endElementId?: string;
}

export interface PatternLockConfig {
  lockScale?: boolean;
  lockPosition?: boolean;
  lockRotation?: boolean;
  patternId?: string;
  scale?: number;
  rotation?: number;
}

export interface ElementMarkerConfig {
  startMarkerId?: string;
  midMarkerId?: string;
  endMarkerId?: string;
  size?: number;
  offset?: number;
  units?: 'strokeWidth' | 'userSpaceOnUse';
  align?: 'auto' | 'auto-start-reverse';
  color?: string;
}

export type CanvasGridType = 'orthogonal' | 'cartesian' | 'isometric' | 'axonometric' | 'polar';

export interface CanvasGridConfig {
  id: string;
  name?: string;
  type?: CanvasGridType;
  spacing: number;
  subdivisions?: number;
  color?: string;
  opacity?: number;
  enabled?: boolean;
  visible?: boolean;
  angle?: number;
  alignmentMode?: 'origin' | 'cell-center';
  [key: string]: any;
}

export interface CanvasGuideConfig {
  id: string;
  axis?: 'x' | 'y';
  pos?: number;
  orientation?: 'horizontal' | 'vertical' | 'angled';
  position?: number;
  angle?: number;
  pivotX?: number;
  pivotY?: number;
  color?: string;
  visible?: boolean;
  locked?: boolean;
  mode?: 'move' | 'rotate';
  [key: string]: any;
}

export interface ElementMetadata {
  attributes?: Record<string, string>;
  dropShadow?: DropShadowConfig;
  innerShadow?: InnerShadowConfig;
  blendConfig?: ElementBlendConfig;
  patternLocks?: PatternLockConfig;
  markerConfig?: ElementMarkerConfig;
  appearanceStack?: any;
  customPivot?: { x: number; y: number };
  [key: string]: any;
}

export interface CompanionMetadata {
  grids?: CanvasGridConfig[];
  guides?: CanvasGuideConfig[];
  ruler?: any;
  showRulers?: boolean;
  showGrid?: boolean;
  showGuides?: boolean;
  lockGuides?: boolean;
  gridSpacing?: number;
  gridAlignmentMode?: 'origin' | 'cell-center';
  snapToPixelGrid?: boolean;
  snapToGrid?: boolean;
  snapToGuides?: boolean;
  snapToNodes?: boolean;
  snapToEdges?: boolean;
  snapToVertices?: boolean;
  snapToViewBox?: boolean;
  snapAngular?: boolean;
  shapeConfig?: any;
  undoStack?: string[];
  redoStack?: string[];
  elements?: Record<string, ElementMetadata | Record<string, string>>;
  scaleStroke?: boolean;
  scaleCorners?: boolean;
  isAspectRatioLocked?: boolean;
  swatches?: any[];
  canvas?: any;
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// 1. Webview -> Host Messages
// ---------------------------------------------------------------------------

export interface ReadyMessage {
  type: 'ready';
  requestId?: string;
  clientVersion?: string;
}

export interface UpdateDocumentMessage {
  type: 'updateDocument';
  text: string;
  revision?: number;
  requestId?: string;
}

export interface UpdateMetadataMessage {
  type: 'updateMetadata';
  metadata: CompanionMetadata;
  revision?: number;
  requestId?: string;
}

export interface ExportFileMessage {
  type: 'exportFile';
  filename?: string;
  content: string;
  format: string;
  requestId?: string;
}

export interface SaveLinkedImageMessage {
  type: 'saveLinkedImage';
  requestId?: string;
  imageId?: string;
  extension?: string;
  base64Data: string;
}

export interface OpenImageFileDialogMessage {
  type: 'openImageFileDialog';
  requestId?: string;
}

export interface ReadImageUriMessage {
  type: 'readImageUri';
  requestId?: string;
  uri: string;
}

export interface ShowInfoMessage {
  type: 'showInfo';
  message: string;
  requestId?: string;
}

export interface ShowErrorMessage {
  type: 'showError';
  message: string;
  requestId?: string;
}

export interface OpenExternalMessage {
  type: 'openExternal';
  url: string;
  requestId?: string;
}

export type WebviewToHostMessage =
  | ReadyMessage
  | UpdateDocumentMessage
  | UpdateMetadataMessage
  | ExportFileMessage
  | SaveLinkedImageMessage
  | OpenImageFileDialogMessage
  | ReadImageUriMessage
  | ShowInfoMessage
  | ShowErrorMessage
  | OpenExternalMessage;

// ---------------------------------------------------------------------------
// 2. Host -> Webview Messages
// ---------------------------------------------------------------------------

export interface LoadSvgMessage {
  type: 'loadSvg';
  text: string;
  metadata?: CompanionMetadata | null;
  locale?: string;
  fileName?: string;
  documentUri?: string;
  documentDirUri?: string;
  documentDirWebviewUri?: string;
  revision?: number;
  requestId?: string;
}

export interface SaveLinkedImageResponseMessage {
  type: 'saveLinkedImageResponse';
  requestId: string;
  success: boolean;
  relativePath?: string;
  webviewUri?: string;
  fileName?: string;
  error?: string;
}

export interface ImageFileSelectedMessage {
  type: 'imageFileSelected';
  requestId?: string;
  base64: string;
  fileName: string;
  sizeBytes: number;
  sourceUri: string;
}

export interface ReadImageUriResponseMessage {
  type: 'readImageUriResponse';
  requestId: string;
  success: boolean;
  base64?: string;
  fileName?: string;
  sizeBytes?: number;
  error?: string;
}

export type HostToWebviewMessage =
  | LoadSvgMessage
  | SaveLinkedImageResponseMessage
  | ImageFileSelectedMessage
  | ReadImageUriResponseMessage;

// ---------------------------------------------------------------------------
// 3. Validation Results & Type Guards
// ---------------------------------------------------------------------------

export interface ValidationResult<T> {
  isValid: boolean;
  error?: string;
  message?: T;
}

export class IpcValidator {
  /**
   * Validates messages sent from the Webview sandbox to the Extension Host.
   */
  public static validateWebviewToHost(data: unknown): ValidationResult<WebviewToHostMessage> {
    if (!data || typeof data !== 'object') {
      return { isValid: false, error: 'IPC message must be a non-null object' };
    }

    const msg = data as Record<string, unknown>;
    const type = msg.type;

    if (typeof type !== 'string' || !type.trim()) {
      return { isValid: false, error: 'IPC message missing required string field: type' };
    }

    switch (type) {
      case 'ready':
        return {
          isValid: true,
          message: {
            type: 'ready',
            requestId: typeof msg.requestId === 'string' ? msg.requestId : undefined,
            clientVersion: typeof msg.clientVersion === 'string' ? msg.clientVersion : undefined,
          },
        };

      case 'updateDocument': {
        if (typeof msg.text !== 'string') {
          return { isValid: false, error: 'updateDocument requires string field "text"' };
        }
        return {
          isValid: true,
          message: {
            type: 'updateDocument',
            text: msg.text,
            revision: typeof msg.revision === 'number' ? msg.revision : undefined,
            requestId: typeof msg.requestId === 'string' ? msg.requestId : undefined,
          },
        };
      }

      case 'updateMetadata': {
        if (!msg.metadata || typeof msg.metadata !== 'object') {
          return { isValid: false, error: 'updateMetadata requires object field "metadata"' };
        }
        return {
          isValid: true,
          message: {
            type: 'updateMetadata',
            metadata: msg.metadata as CompanionMetadata,
            revision: typeof msg.revision === 'number' ? msg.revision : undefined,
            requestId: typeof msg.requestId === 'string' ? msg.requestId : undefined,
          },
        };
      }

      case 'exportFile': {
        if (typeof msg.content !== 'string' || typeof msg.format !== 'string') {
          return { isValid: false, error: 'exportFile requires string fields "content" and "format"' };
        }
        return {
          isValid: true,
          message: {
            type: 'exportFile',
            filename: typeof msg.filename === 'string' ? msg.filename : undefined,
            content: msg.content,
            format: msg.format,
          },
        };
      }

      case 'saveLinkedImage': {
        if (typeof msg.base64Data !== 'string') {
          return { isValid: false, error: 'saveLinkedImage requires string field "base64Data"' };
        }
        return {
          isValid: true,
          message: {
            type: 'saveLinkedImage',
            requestId: typeof msg.requestId === 'string' ? msg.requestId : undefined,
            imageId: typeof msg.imageId === 'string' ? msg.imageId : undefined,
            extension: typeof msg.extension === 'string' ? msg.extension : undefined,
            base64Data: msg.base64Data,
          },
        };
      }

      case 'openImageFileDialog': {
        return {
          isValid: true,
          message: {
            type: 'openImageFileDialog',
            requestId: typeof msg.requestId === 'string' ? msg.requestId : undefined,
          },
        };
      }

      case 'readImageUri': {
        if (typeof msg.uri !== 'string' || !msg.uri.trim()) {
          return { isValid: false, error: 'readImageUri requires non-empty string field "uri"' };
        }
        return {
          isValid: true,
          message: {
            type: 'readImageUri',
            requestId: typeof msg.requestId === 'string' ? msg.requestId : undefined,
            uri: msg.uri,
          },
        };
      }

      case 'showInfo': {
        if (typeof msg.message !== 'string') {
          return { isValid: false, error: 'showInfo requires string field "message"' };
        }
        return { isValid: true, message: { type: 'showInfo', message: msg.message } };
      }

      case 'showError': {
        if (typeof msg.message !== 'string') {
          return { isValid: false, error: 'showError requires string field "message"' };
        }
        return { isValid: true, message: { type: 'showError', message: msg.message } };
      }

      case 'openExternal': {
        if (typeof msg.url !== 'string' || !msg.url.trim()) {
          return { isValid: false, error: 'openExternal requires non-empty string field "url"' };
        }
        // Restrict openExternal to http/https protocols for security
        if (!/^https?:\/\//i.test(msg.url.trim())) {
          return { isValid: false, error: 'openExternal only allows http:// or https:// URLs' };
        }
        return { isValid: true, message: { type: 'openExternal', url: msg.url.trim() } };
      }

      default:
        return { isValid: false, error: `Unrecognized webview message type: "${String(type)}"` };
    }
  }

  /**
   * Validates messages sent from the Extension Host to the Webview sandbox.
   */
  public static validateHostToWebview(data: unknown): ValidationResult<HostToWebviewMessage> {
    if (!data || typeof data !== 'object') {
      return { isValid: false, error: 'IPC message must be a non-null object' };
    }

    const msg = data as Record<string, unknown>;
    const type = msg.type;

    if (typeof type !== 'string' || !type.trim()) {
      return { isValid: false, error: 'IPC message missing required string field: type' };
    }

    switch (type) {
      case 'loadSvg': {
        if (typeof msg.text !== 'string') {
          return { isValid: false, error: 'loadSvg requires string field "text"' };
        }
        return {
          isValid: true,
          message: {
            type: 'loadSvg',
            text: msg.text,
            metadata: (msg.metadata && typeof msg.metadata === 'object' ? msg.metadata : null) as CompanionMetadata | null,
            locale: typeof msg.locale === 'string' ? msg.locale : undefined,
            fileName: typeof msg.fileName === 'string' ? msg.fileName : undefined,
            documentUri: typeof msg.documentUri === 'string' ? msg.documentUri : undefined,
            documentDirUri: typeof msg.documentDirUri === 'string' ? msg.documentDirUri : undefined,
            documentDirWebviewUri: typeof msg.documentDirWebviewUri === 'string' ? msg.documentDirWebviewUri : undefined,
            revision: typeof msg.revision === 'number' ? msg.revision : undefined,
            requestId: typeof msg.requestId === 'string' ? msg.requestId : undefined,
          },
        };
      }

      case 'saveLinkedImageResponse': {
        if (typeof msg.requestId !== 'string' || typeof msg.success !== 'boolean') {
          return { isValid: false, error: 'saveLinkedImageResponse requires "requestId" (string) and "success" (boolean)' };
        }
        return {
          isValid: true,
          message: {
            type: 'saveLinkedImageResponse',
            requestId: msg.requestId,
            success: msg.success,
            relativePath: typeof msg.relativePath === 'string' ? msg.relativePath : undefined,
            webviewUri: typeof msg.webviewUri === 'string' ? msg.webviewUri : undefined,
            fileName: typeof msg.fileName === 'string' ? msg.fileName : undefined,
            error: typeof msg.error === 'string' ? msg.error : undefined,
          },
        };
      }

      case 'imageFileSelected': {
        if (
          typeof msg.base64 !== 'string' ||
          typeof msg.fileName !== 'string' ||
          typeof msg.sizeBytes !== 'number' ||
          typeof msg.sourceUri !== 'string'
        ) {
          return {
            isValid: false,
            error: 'imageFileSelected requires base64 (string), fileName (string), sizeBytes (number), sourceUri (string)',
          };
        }
        return {
          isValid: true,
          message: {
            type: 'imageFileSelected',
            requestId: typeof msg.requestId === 'string' ? msg.requestId : undefined,
            base64: msg.base64,
            fileName: msg.fileName,
            sizeBytes: msg.sizeBytes,
            sourceUri: msg.sourceUri,
          },
        };
      }

      case 'readImageUriResponse': {
        if (typeof msg.requestId !== 'string' || typeof msg.success !== 'boolean') {
          return { isValid: false, error: 'readImageUriResponse requires "requestId" (string) and "success" (boolean)' };
        }
        return {
          isValid: true,
          message: {
            type: 'readImageUriResponse',
            requestId: msg.requestId,
            success: msg.success,
            base64: typeof msg.base64 === 'string' ? msg.base64 : undefined,
            fileName: typeof msg.fileName === 'string' ? msg.fileName : undefined,
            sizeBytes: typeof msg.sizeBytes === 'number' ? msg.sizeBytes : undefined,
            error: typeof msg.error === 'string' ? msg.error : undefined,
          },
        };
      }

      default:
        return { isValid: false, error: `Unrecognized host message type: "${String(type)}"` };
    }
  }
}
