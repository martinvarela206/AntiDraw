/**
 * ARCHITECTURAL RATIONALE: Centralized International Keymap Registry (KeymapRegistry - L3)
 *
 * 1. Dual-Resolution Key Evaluation (event.code vs event.key):
 *    - `event.code` represents physical key position on the keyboard (e.g. `KeyV`, `KeyA`, `BracketLeft`).
 *    - `event.key` represents semantic character output (e.g. 'v', 'a', '[').
 *    Evaluating both ensures complete compatibility across US QWERTY, Spanish ISO, German QWERTZ,
 *    French AZERTY, and custom keyboard layouts.
 *
 * 2. macOS Universal Meta / Command (⌘) Mapping:
 *    Normalizes `event.ctrlKey` and `event.metaKey` into a unified `ctrlOrMeta` modifier flag,
 *    ensuring standard VS Code shortcuts work identically on Windows/Linux (Ctrl) and macOS (Cmd).
 *
 * 3. AltGr / Spanish Keyboard Collision Elimination:
 *    On Windows and Linux, international layouts (Spanish, German, Nordic) generate synthetic
 *    `ctrlKey: true` and `altKey: true` when pressing `AltGr` to type brackets, braces, and @/~/| symbols.
 *    By inspecting `event.getModifierState('AltGraph')`, `KeymapRegistry` strictly suppresses
 *    false-positive `Ctrl+Alt` command executions when the user types international text characters.
 *
 * 4. Everything is a Command (SSOT):
 *    Centralizes all tool activations, viewport zooms, node operations, z-order reordering,
 *    and system clipboard actions into a declarative catalog queried by `KeyboardShortcutController`.
 */

export interface KeybindingDef {
  commandId?: string;
  toolId?: string;
  code?: string | string[];
  key?: string | string[];
  ctrlOrMeta?: boolean;
  shift?: boolean;
  alt?: boolean;
  allowInInput?: boolean;
  description?: string;
}

export class KeymapRegistry {
  private static instance: KeymapRegistry | null = null;
  private bindings: KeybindingDef[] = [];

  public static getInstance(): KeymapRegistry {
    if (!KeymapRegistry.instance) {
      KeymapRegistry.instance = new KeymapRegistry();
      KeymapRegistry.instance.registerDefaultBindings();
    }
    return KeymapRegistry.instance;
  }

  /**
   * Detects whether the active event is an AltGraph (AltGr) modifier event.
   */
  public static isAltGraph(e: KeyboardEvent): boolean {
    return typeof e.getModifierState === 'function' && e.getModifierState('AltGraph');
  }

  /**
   * Unified Ctrl (Windows/Linux) or Cmd (macOS) modifier detection.
   */
  public static isCtrlOrMeta(e: KeyboardEvent): boolean {
    return !!(e.ctrlKey || e.metaKey);
  }

  /**
   * Tests whether an incoming KeyboardEvent matches a specified KeybindingDef.
   */
  public static matches(e: KeyboardEvent, binding: KeybindingDef): boolean {
    const isAltGr = KeymapRegistry.isAltGraph(e);

    // 1. Modifiers evaluation
    const expectedCtrl = !!binding.ctrlOrMeta;
    const actualCtrl = KeymapRegistry.isCtrlOrMeta(e);

    // If AltGraph is pressed, it is NOT an intentional Ctrl shortcut unless explicitly bound
    if (isAltGr && actualCtrl && !binding.alt) {
      return false;
    }

    if (expectedCtrl !== actualCtrl) {
      return false;
    }

    const expectedShift = !!binding.shift;
    const actualShift = !!e.shiftKey;
    if (expectedShift !== actualShift) {
      return false;
    }

    const expectedAlt = !!binding.alt;
    // On Windows, AltGr triggers both Ctrl and Alt. If binding wants Alt without AltGr, filter out.
    const actualAlt = !!e.altKey && !isAltGr;
    if (expectedAlt !== actualAlt) {
      return false;
    }

    // 2. Physical code or semantic key evaluation (dual-match)
    let codeMatched = false;
    if (binding.code) {
      const codes = Array.isArray(binding.code) ? binding.code : [binding.code];
      if (e.code && codes.includes(e.code)) {
        codeMatched = true;
      }
    }

    let keyMatched = false;
    if (binding.key) {
      const keys = Array.isArray(binding.key) ? binding.key : [binding.key];
      const eventKeyLower = e.key ? e.key.toLowerCase() : '';
      if (keys.some((k) => k.toLowerCase() === eventKeyLower)) {
        keyMatched = true;
      }
    }

    // If both code and key are defined, matching either one is sufficient for international ergonomics
    if (binding.code && binding.key) {
      return codeMatched || keyMatched;
    }
    if (binding.code) return codeMatched;
    if (binding.key) return keyMatched;

    return false;
  }

  public register(binding: KeybindingDef): void {
    this.bindings.push(binding);
  }

  public getBindings(): readonly KeybindingDef[] {
    return this.bindings;
  }

  public findMatchingBinding(e: KeyboardEvent): KeybindingDef | undefined {
    return this.bindings.find((b) => KeymapRegistry.matches(e, b));
  }

  /**
   * Initializes canonical default keybindings for tools and commands.
   */
  public registerDefaultBindings(): void {
    this.bindings = [
      // --- Herramientas de Dibujo y Edición (Single-Key) ---
      { toolId: 'select', code: 'KeyV', key: 'v' },
      { toolId: 'node', code: ['KeyA', 'KeyN'], key: ['a', 'n'] },
      { toolId: 'stroke', code: 'KeyT', key: 't' },
      { toolId: 'pen', code: 'KeyP', key: 'p' },
      { toolId: 'line', code: ['Backslash', 'IntlBackslash'], key: ['\\', '|'] },
      { toolId: 'line', code: 'KeyL', key: ['l', 'L'], shift: true },
      { toolId: 'polyline', code: 'KeyY', key: 'y' },
      { toolId: 'rect', code: ['KeyM', 'KeyR'], key: ['m', 'r'] },
      { toolId: 'circle', code: 'KeyO', key: 'o' },
      { toolId: 'ellipse', code: ['KeyL', 'KeyE'], key: ['l', 'e'] },
      { toolId: 'polygon', code: 'KeyG', key: 'g' },
      { toolId: 'star', code: 'KeyS', key: 's' },
      { toolId: 'scissors', code: ['KeyC', 'KeyK'], key: ['c', 'k'] },
      { toolId: 'eraser', code: 'KeyE', key: 'e', shift: true },
      { toolId: 'smartFill', code: 'KeyF', key: 'f' },
      { toolId: 'shapeBuilder', code: 'KeyM', key: 'm', shift: true },
      { toolId: 'image', code: 'KeyI', key: 'i' },
      { toolId: 'addVertex', key: ['+', '='] },
      { toolId: 'zoom', code: 'KeyZ', key: 'z' },

      // --- Comandos de Portapapeles y Edición ---
      { commandId: 'edit.undo', code: 'KeyZ', key: 'z', ctrlOrMeta: true },
      { commandId: 'edit.redo', code: 'KeyZ', key: 'z', ctrlOrMeta: true, shift: true },
      { commandId: 'edit.redo', code: 'KeyY', key: 'y', ctrlOrMeta: true },
      { commandId: 'edit.copy', code: 'KeyC', key: 'c', ctrlOrMeta: true },
      { commandId: 'edit.cut', code: 'KeyX', key: 'x', ctrlOrMeta: true },
      { commandId: 'edit.paste', code: 'KeyV', key: 'v', ctrlOrMeta: true },
      { commandId: 'edit.duplicate', code: 'KeyD', key: 'd', ctrlOrMeta: true },
      { commandId: 'edit.deleteSelected', code: ['Delete', 'Backspace'], key: ['Delete', 'Backspace'] },

      // --- Nodos y Objetos ---
      { commandId: 'node.join', code: 'KeyJ', key: 'j', ctrlOrMeta: true },
      { commandId: 'object.convertToCurves', code: 'KeyQ', key: 'q', ctrlOrMeta: true },
      { commandId: 'object.group', code: 'KeyG', key: 'g', ctrlOrMeta: true },
      { commandId: 'object.ungroup', code: 'KeyG', key: 'g', ctrlOrMeta: true, shift: true },
      { commandId: 'file.exportAsset', code: 'KeyE', key: 'e', ctrlOrMeta: true, shift: true },
      { commandId: 'view.recenterViewBox', code: 'Digit0', key: '0', ctrlOrMeta: true },
      { commandId: 'blend.create', code: 'KeyB', key: 'b', ctrlOrMeta: true, shift: true },

      // --- Capas y Guías (Saneadas: sin combinaciones Ctrl+Alt para prevenir colisiones con AltGr) ---
      { commandId: 'guide.toggleLock', code: 'Semicolon', key: [';', ':'], ctrlOrMeta: true, shift: true },
      { commandId: 'layer.lockAllAbove', code: 'KeyL', key: 'l', ctrlOrMeta: true, shift: true },
      { commandId: 'layer.unlockAll', code: 'Digit2', key: '2', ctrlOrMeta: true, shift: true },
      { commandId: 'layer.hideAllAbove', code: ['Digit3', 'KeyH'], key: ['3', 'h', 'H'], ctrlOrMeta: true, shift: true },
      { commandId: 'layer.showAll', code: ['Digit4', 'KeyU'], key: ['4', 'u', 'U'], ctrlOrMeta: true, shift: true },
    ];
  }
}
