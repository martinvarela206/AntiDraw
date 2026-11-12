import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { SessionStateStorage } from './SessionStateStorage.js';

/**
 * ARCHITECTURAL RATIONALE: Standardized Sidecar Versioning & Cryptographic Integrity (.svg.json)
 *
 * 1. Single Extension Standardization:
 *    Standardizes on `.svg.json` (e.g. `icon.svg.json`), resolving previous contradictions
 *    between `.json` and `.svg.json`, with automated backward-compatible migration from legacy `.json`.
 *
 * 2. Cryptographic SVG Content Hashing (SHA-256):
 *    Embeds `svgHash` computed over normalized SVG content. If external vector tools (Illustrator,
 *    Inkscape, Figma, text editors) alter the SVG on disk, AntiDraw detects hash divergence.
 *
 * 3. Desynchronization Defense & Safe Fallback:
 *    Prevents injecting stale companion element coordinates or obsolete appearance stacks into
 *    externally modified SVGs. Falls back to pure W3C markup parsing and geometric shape re-detection.
 *
 * 4. Schema Versioning (schemaVersion: 1):
 *    Formal envelope schema enabling forwards-compatible migrations without breaking existing sidecars.
 */

export interface ISidecarPayload {
  schemaVersion: number;
  svgHash: string;
  metadata: Record<string, any>;
}

export class SidecarIntegrityService {
  public static readonly CURRENT_SCHEMA_VERSION = 1;

  /**
   * Resolves the canonical .svg.json URI for a given SVG URI.
   */
  public static getSidecarUri(svgUri: vscode.Uri): vscode.Uri {
    return svgUri.with({ path: `${svgUri.path}.json` });
  }

  /**
   * Resolves the legacy .json URI (replacing .svg with .json) for backward-compatible fallback.
   */
  public static getLegacySidecarUri(svgUri: vscode.Uri): vscode.Uri {
    const jsonPath = svgUri.path.replace(/\.svg$/i, '.json');
    return svgUri.with({ path: jsonPath });
  }

  /**
   * Computes a deterministic SHA-256 hash of SVG markup, normalizing line endings and trimming.
   */
  public static computeSvgHash(svgContent: string): string {
    const normalized = (svgContent || '').replace(/\r\n/g, '\n').trim();
    return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
  }

  /**
   * Packages clean persistent metadata into a versioned and hashed sidecar payload.
   */
  public static packageSidecar(svgContent: string, metadata: any): ISidecarPayload {
    const { persistent } = SessionStateStorage.splitMetadata(metadata);
    return {
      schemaVersion: this.CURRENT_SCHEMA_VERSION,
      svgHash: this.computeSvgHash(svgContent),
      metadata: persistent,
    };
  }

  /**
   * Unpackages and validates sidecar data against the current SVG content.
   */
  public static unpackageSidecar(
    rawText: string,
    currentSvgContent: string
  ): {
    isValid: boolean;
    metadata: Record<string, any> | null;
    isDesynchronized: boolean;
    isLegacy: boolean;
    storedHash?: string;
    computedHash?: string;
  } {
    try {
      const parsed = JSON.parse(rawText);
      if (!parsed || typeof parsed !== 'object') {
        return { isValid: false, metadata: null, isDesynchronized: false, isLegacy: false };
      }

      // Check if it's the standardized versioned format
      if (typeof parsed.schemaVersion === 'number' && typeof parsed.svgHash === 'string') {
        const computedHash = this.computeSvgHash(currentSvgContent);
        const isDesynchronized = parsed.svgHash !== computedHash;
        const metadata = parsed.metadata || {};
        return {
          isValid: true,
          metadata,
          isDesynchronized,
          isLegacy: false,
          storedHash: parsed.svgHash,
          computedHash,
        };
      }

      // Legacy sidecar format: flat dictionary of metadata without versioning envelope
      const { persistent } = SessionStateStorage.splitMetadata(parsed);
      return {
        isValid: true,
        metadata: persistent,
        isDesynchronized: false,
        isLegacy: true,
      };
    } catch (_err) {
      return { isValid: false, metadata: null, isDesynchronized: false, isLegacy: false };
    }
  }
}
