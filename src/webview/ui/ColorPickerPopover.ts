import { GlobalSwatchManager } from '../engine/color/GlobalSwatchManager.js';

export interface ColorPickerResult {
  hex: string;
  hex8: string;
  rgb: { r: number; g: number; b: number };
  alpha: number;
}

export interface ColorPickerOptions {
  anchor?: HTMLElement;
  anchorEl?: HTMLElement;
  initialColor: string;
  initialOpacity?: number;
  showAlpha?: boolean;
  swatches?: string[];
  onChange?: (color: ColorPickerResult) => void;
  onCommit?: (color: ColorPickerResult) => void;
  onClose?: () => void;
}

/**
 * ARCHITECTURAL RATIONALE: In-DOM Interactive Color Picker Popover (ColorPickerPopover)
 *
 * 1. Immune to Webview Focus Stealing:
 *    Native `<input type="color">` spawns OS-level native dialogs that steal focus from
 *    VS Code's sandboxed webview iframe, firing immediate `blur` events and closing the picker
 *    instantly before the user can select a shade.
 *    By rendering completely in-DOM attached to `document.body`, the popover stays 100% active,
 *    controllable, and responsive.
 *
 * 2. Persistent Selection & Outside Click Dismissal:
 *    The selector stays visible while dragging in the 2D Saturation-Value box, adjusting the
 *    Hue or Alpha sliders, typing hex values, or selecting swatches. It closes ONLY when the
 *    user explicitly clicks outside the popover or presses Escape.
 *
 * 3. Figma Studio Quiet Chrome Tokens:
 *    Styled to match Figma Studio aesthetics with full Dark/Light theme variable support,
 *    micro-precision typography, checkerboard transparency background, and optional Eyedropper API.
 */
export class ColorPickerPopover {
  private static instance: ColorPickerPopover | null = null;

  private container: HTMLDivElement | null = null;
  private currentOptions: ColorPickerOptions | null = null;

  // Color state
  private hue: number = 0; // 0..360
  private sat: number = 1; // 0..1
  private val: number = 1; // 0..1
  private alpha: number = 1; // 0..1

  // DOM element references
  private svBox: HTMLDivElement | null = null;
  private svHandle: HTMLDivElement | null = null;
  private hueSlider: HTMLDivElement | null = null;
  private hueHandle: HTMLDivElement | null = null;
  private alphaSlider: HTMLDivElement | null = null;
  private alphaHandle: HTMLDivElement | null = null;
  private previewColor: HTMLDivElement | null = null;
  private hexInput: HTMLInputElement | null = null;
  private alphaInput: HTMLInputElement | null = null;

  // Dragging states
  private isDraggingSV: boolean = false;
  private isDraggingHue: boolean = false;
  private isDraggingAlpha: boolean = false;

  private constructor() {}

  public static getInstance(): ColorPickerPopover {
    if (!ColorPickerPopover.instance) {
      ColorPickerPopover.instance = new ColorPickerPopover();
    }
    return ColorPickerPopover.instance;
  }

  public static isOpen(): boolean {
    return ColorPickerPopover.instance !== null && ColorPickerPopover.instance.container !== null;
  }

  public static show(options: ColorPickerOptions): ColorPickerPopover {
    const picker = ColorPickerPopover.getInstance();
    picker.open(options);
    return picker;
  }

  public static hide(): void {
    if (ColorPickerPopover.instance) {
      ColorPickerPopover.instance.close();
    }
  }

  public open(options: ColorPickerOptions): void {
    const targetAnchor = options.anchor || options.anchorEl;
    if (!targetAnchor) return;

    const currentAnchor = this.currentOptions?.anchor || this.currentOptions?.anchorEl;
    // If already open with the same anchor, toggle it off
    if (this.container && currentAnchor === targetAnchor) {
      this.close();
      return;
    }

    if (this.container) {
      this.close();
    }

    this.currentOptions = options;
    this.parseInitialColor(options.initialColor, options.initialOpacity);
    this.renderPopover();
    this.positionPopover(targetAnchor);
    this.attachEventListeners();
  }

  public close(): void {
    if (!this.container) return;

    const commitResult = this.getCurrentResult();
    const onCommit = this.currentOptions?.onCommit;
    const onClose = this.currentOptions?.onClose;

    this.detachEventListeners();

    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.currentOptions = null;

    if (onCommit) {
      onCommit(commitResult);
    }
    if (onClose) {
      onClose();
    }
  }

  private parseInitialColor(rawColor: string, rawOpacity?: number): void {
    let colorStr = (rawColor || '#4f46e5').trim().toLowerCase();
    let initialAlpha = rawOpacity !== undefined ? Math.max(0, Math.min(1, rawOpacity)) : 1;

    if (colorStr === 'none' || colorStr === 'transparent') {
      colorStr = '#000000';
      initialAlpha = 0;
    } else if (colorStr === 'currentcolor') {
      colorStr = '#000000';
    }

    // Check for 8-digit hex (#rrggbbaa)
    if (colorStr.startsWith('#') && colorStr.length === 9) {
      const aHex = colorStr.slice(7, 9);
      initialAlpha = parseInt(aHex, 16) / 255;
      colorStr = colorStr.slice(0, 7);
    } else if (colorStr.startsWith('#') && colorStr.length === 4) {
      // #rgba
      const aHex = colorStr.slice(3, 4);
      initialAlpha = parseInt(aHex + aHex, 16) / 255;
      colorStr = '#' + colorStr[1] + colorStr[1] + colorStr[2] + colorStr[2];
    }

    const rgb = GlobalSwatchManager.hexToRgb(colorStr) || { r: 79, g: 70, b: 229 };
    const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);

    this.hue = hsv.h;
    this.sat = hsv.s;
    this.val = hsv.v;
    this.alpha = initialAlpha;
  }

  private renderPopover(): void {
    const showAlpha = this.currentOptions?.showAlpha !== false;
    const defaultSwatches = [
      '#000000', '#ffffff', '#64748b', '#ef4444', '#f97316', '#f59e0b',
      '#10b981', '#06b6d4', '#0d99ff', '#6366f1', '#8b5cf6', '#ec4899',
    ];
    const globalSwatches = (this.currentOptions?.swatches && this.currentOptions.swatches.length > 0)
      ? this.currentOptions.swatches
      : defaultSwatches;

    const div = document.createElement('div');
    div.className = 'color-picker-popover';
    div.setAttribute('role', 'dialog');
    div.setAttribute('aria-label', 'Selector de Color');

    div.innerHTML = `
      <div class="color-picker-sv" id="cp-sv-box" style="background-color: hsl(${this.hue}, 100%, 50%);">
        <div class="color-picker-sv-white"></div>
        <div class="color-picker-sv-black"></div>
        <div class="color-picker-sv-handle" id="cp-sv-handle"></div>
      </div>

      <div class="color-picker-sliders-col">
        <div class="color-picker-slider-track color-picker-hue-track" id="cp-hue-slider">
          <div class="color-picker-slider-handle" id="cp-hue-handle"></div>
        </div>

        ${showAlpha ? `
        <div class="color-picker-slider-track color-picker-alpha-track" id="cp-alpha-slider">
          <div class="color-picker-alpha-gradient" id="cp-alpha-gradient"></div>
          <div class="color-picker-slider-handle" id="cp-alpha-handle"></div>
        </div>
        ` : ''}
      </div>

      <div class="color-picker-inputs-row">
        <div class="color-picker-preview-box">
          <div class="color-picker-preview-swatch" id="cp-preview-swatch"></div>
        </div>

        ${'EyeDropper' in window ? `
        <button type="button" class="color-picker-btn-icon" id="cp-btn-eyedropper" title="Muestrear color de pantalla (Cuentagotas)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 22s5-1 7-3l11-11a2.828 2.828 0 1 0-4-4L5 15c-2 2-3 7-3 7z"/>
            <path d="m14 6 4 4"/>
          </svg>
        </button>
        ` : ''}

        <div class="color-picker-hex-wrap">
          <span class="color-picker-hex-prefix">#</span>
          <input type="text" class="prop-input color-picker-hex-input" id="cp-hex-input" value="${this.getHexWithoutHash()}" maxlength="6" spellcheck="false" />
        </div>

        ${showAlpha ? `
        <div class="color-picker-alpha-wrap">
          <input type="number" class="prop-input color-picker-alpha-input" id="cp-alpha-input" value="${Math.round(this.alpha * 100)}" min="0" max="100" step="1" />
          <span class="color-picker-alpha-suffix">%</span>
        </div>
        ` : ''}
      </div>

      <div class="color-picker-swatches-section">
        <div class="color-picker-swatches-grid">
          ${globalSwatches.map((color) => `
            <button type="button" class="color-picker-chip" data-color="${color}" style="background-color: ${color};" title="${color}"></button>
          `).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(div);
    this.container = div;

    // Cache elements
    this.svBox = div.querySelector('#cp-sv-box');
    this.svHandle = div.querySelector('#cp-sv-handle');
    this.hueSlider = div.querySelector('#cp-hue-slider');
    this.hueHandle = div.querySelector('#cp-hue-handle');
    this.alphaSlider = div.querySelector('#cp-alpha-slider');
    this.alphaHandle = div.querySelector('#cp-alpha-handle');
    this.previewColor = div.querySelector('#cp-preview-swatch');
    this.hexInput = div.querySelector('#cp-hex-input');
    this.alphaInput = div.querySelector('#cp-alpha-input');

    this.updateUI();
  }

  private positionPopover(anchor: HTMLElement): void {
    if (!this.container) return;

    const popoverRect = this.container.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const margin = 8;

    // By default, try placing to the left of the anchor (common for right-side property panel)
    let left = anchorRect.left - popoverRect.width - margin;
    if (left < margin) {
      // If not enough room on left, try placing directly below
      left = anchorRect.left;
    }
    // Constrain to viewport horizontally
    left = Math.max(margin, Math.min(window.innerWidth - popoverRect.width - margin, left));

    let top = anchorRect.top;
    // Constrain to viewport vertically
    top = Math.max(margin, Math.min(window.innerHeight - popoverRect.height - margin, top));

    this.container.style.left = `${Math.round(left)}px`;
    this.container.style.top = `${Math.round(top)}px`;
  }

  private attachEventListeners(): void {
    if (!this.container) return;

    // Stop propagation of events inside the popover to prevent deselecting canvas or triggering tools
    const stopPropagation = (e: Event) => e.stopPropagation();
    this.container.addEventListener('pointerdown', stopPropagation);
    this.container.addEventListener('mousedown', stopPropagation);
    this.container.addEventListener('click', stopPropagation);
    this.container.addEventListener('dblclick', stopPropagation);

    // SV Box interactions
    if (this.svBox) {
      this.svBox.addEventListener('pointerdown', (e) => {
        this.isDraggingSV = true;
        this.svBox?.setPointerCapture(e.pointerId);
        this.updateSVFromPointer(e);
      });
      this.svBox.addEventListener('pointermove', (e) => {
        if (this.isDraggingSV) {
          this.updateSVFromPointer(e);
        }
      });
      const endSV = (e: PointerEvent) => {
        if (this.isDraggingSV) {
          this.isDraggingSV = false;
          try { this.svBox?.releasePointerCapture(e.pointerId); } catch (_) {}
        }
      };
      this.svBox.addEventListener('pointerup', endSV);
      this.svBox.addEventListener('pointercancel', endSV);
    }

    // Hue Slider interactions
    if (this.hueSlider) {
      this.hueSlider.addEventListener('pointerdown', (e) => {
        this.isDraggingHue = true;
        this.hueSlider?.setPointerCapture(e.pointerId);
        this.updateHueFromPointer(e);
      });
      this.hueSlider.addEventListener('pointermove', (e) => {
        if (this.isDraggingHue) {
          this.updateHueFromPointer(e);
        }
      });
      const endHue = (e: PointerEvent) => {
        if (this.isDraggingHue) {
          this.isDraggingHue = false;
          try { this.hueSlider?.releasePointerCapture(e.pointerId); } catch (_) {}
        }
      };
      this.hueSlider.addEventListener('pointerup', endHue);
      this.hueSlider.addEventListener('pointercancel', endHue);
    }

    // Alpha Slider interactions
    if (this.alphaSlider) {
      this.alphaSlider.addEventListener('pointerdown', (e) => {
        this.isDraggingAlpha = true;
        this.alphaSlider?.setPointerCapture(e.pointerId);
        this.updateAlphaFromPointer(e);
      });
      this.alphaSlider.addEventListener('pointermove', (e) => {
        if (this.isDraggingAlpha) {
          this.updateAlphaFromPointer(e);
        }
      });
      const endAlpha = (e: PointerEvent) => {
        if (this.isDraggingAlpha) {
          this.isDraggingAlpha = false;
          try { this.alphaSlider?.releasePointerCapture(e.pointerId); } catch (_) {}
        }
      };
      this.alphaSlider.addEventListener('pointerup', endAlpha);
      this.alphaSlider.addEventListener('pointercancel', endAlpha);
    }

    // Hex input
    if (this.hexInput) {
      this.hexInput.addEventListener('input', () => {
        let val = this.hexInput!.value.trim().replace(/^#/, '');
        if (val.length === 3 || val.length === 6) {
          const rgb = GlobalSwatchManager.hexToRgb(val);
          if (rgb) {
            const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
            this.hue = hsv.h;
            this.sat = hsv.s;
            this.val = hsv.v;
            this.updateUI(false);
            this.dispatchChange();
          }
        }
      });
    }

    // Alpha input
    if (this.alphaInput) {
      this.alphaInput.addEventListener('input', () => {
        const val = Math.max(0, Math.min(100, parseFloat(this.alphaInput!.value) || 0));
        this.alpha = val / 100;
        this.updateUI(true);
        this.dispatchChange();
      });
    }

    // Eyedropper button
    const btnEyedropper = this.container.querySelector<HTMLButtonElement>('#cp-btn-eyedropper');
    if (btnEyedropper && 'EyeDropper' in window) {
      btnEyedropper.addEventListener('click', async () => {
        try {
          const eyeDropper = new (window as any).EyeDropper();
          const res = await eyeDropper.open();
          if (res?.sRGBHex) {
            this.parseInitialColor(res.sRGBHex, this.alpha);
            this.updateUI();
            this.dispatchChange();
          }
        } catch (_) {
          // Eyedropper cancelled
        }
      });
    }

    // Swatches chips
    this.container.querySelectorAll<HTMLButtonElement>('.color-picker-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const chipColor = chip.getAttribute('data-color');
        if (chipColor) {
          this.parseInitialColor(chipColor, this.alpha);
          this.updateUI();
          this.dispatchChange();
        }
      });
    });

    // Document-level listeners for outside click and Escape
    window.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    window.addEventListener('keydown', this.onDocumentKeyDown, true);
  }

  private detachEventListeners(): void {
    window.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    window.removeEventListener('keydown', this.onDocumentKeyDown, true);
  }

  private onDocumentPointerDown = (e: PointerEvent | MouseEvent): void => {
    if (!this.container) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // If clicked inside popover or on the anchor button, ignore
    const anchor = this.currentOptions?.anchor || this.currentOptions?.anchorEl;
    if (this.container.contains(target) || (anchor && anchor.contains(target))) {
      return;
    }

    // Clicked outside! Close popover
    this.close();
  };

  private onDocumentKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.container) {
      this.close();
    }
  };

  private updateSVFromPointer(e: PointerEvent): void {
    if (!this.svBox) return;
    const rect = this.svBox.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    this.sat = rect.width > 0 ? x / rect.width : 0;
    this.val = rect.height > 0 ? 1 - y / rect.height : 0;

    this.updateUI();
    this.dispatchChange();
  }

  private updateHueFromPointer(e: PointerEvent): void {
    if (!this.hueSlider) return;
    const rect = this.hueSlider.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));

    this.hue = rect.width > 0 ? Math.round((x / rect.width) * 360) : 0;
    if (this.hue >= 360) this.hue = 0;

    this.updateUI();
    this.dispatchChange();
  }

  private updateAlphaFromPointer(e: PointerEvent): void {
    if (!this.alphaSlider) return;
    const rect = this.alphaSlider.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));

    this.alpha = rect.width > 0 ? Math.round((x / rect.width) * 100) / 100 : 1;

    this.updateUI();
    this.dispatchChange();
  }

  private updateUI(updateInputs: boolean = true): void {
    if (!this.container) return;

    // 1. SV Box background & handle position
    if (this.svBox) {
      this.svBox.style.backgroundColor = `hsl(${this.hue}, 100%, 50%)`;
    }
    if (this.svHandle) {
      this.svHandle.style.left = `${Math.round(this.sat * 100)}%`;
      this.svHandle.style.top = `${Math.round((1 - this.val) * 100)}%`;
    }

    // 2. Hue slider handle position
    if (this.hueHandle) {
      this.hueHandle.style.left = `${Math.round((this.hue / 360) * 100)}%`;
    }

    // 3. Alpha slider handle position and gradient
    const opaqueRgb = this.getCurrentRgb();
    const opaqueHex = GlobalSwatchManager.rgbToHex(opaqueRgb.r, opaqueRgb.g, opaqueRgb.b);

    const alphaGrad = this.container.querySelector<HTMLElement>('#cp-alpha-gradient');
    if (alphaGrad) {
      alphaGrad.style.background = `linear-gradient(to right, transparent, ${opaqueHex})`;
    }
    if (this.alphaHandle) {
      this.alphaHandle.style.left = `${Math.round(this.alpha * 100)}%`;
    }

    // 4. Preview color swatch
    if (this.previewColor) {
      this.previewColor.style.backgroundColor = `rgba(${opaqueRgb.r}, ${opaqueRgb.g}, ${opaqueRgb.b}, ${this.alpha})`;
    }

    // 5. Hex & Alpha inputs
    if (updateInputs) {
      if (this.hexInput && document.activeElement !== this.hexInput) {
        this.hexInput.value = this.getHexWithoutHash();
      }
      if (this.alphaInput && document.activeElement !== this.alphaInput) {
        this.alphaInput.value = Math.round(this.alpha * 100).toString();
      }
    }
  }

  private dispatchChange(): void {
    if (!this.currentOptions?.onChange) return;
    this.currentOptions.onChange(this.getCurrentResult());
  }

  private getCurrentRgb(): { r: number; g: number; b: number } {
    return this.hsvToRgb(this.hue, this.sat, this.val);
  }

  private getHexWithoutHash(): string {
    const rgb = this.getCurrentRgb();
    return GlobalSwatchManager.rgbToHex(rgb.r, rgb.g, rgb.b).slice(1).toUpperCase();
  }

  public getCurrentResult(): ColorPickerResult {
    const rgb = this.getCurrentRgb();
    const hex = GlobalSwatchManager.rgbToHex(rgb.r, rgb.g, rgb.b);
    const alphaHex = Math.round(this.alpha * 255).toString(16).padStart(2, '0');
    const hex8 = `${hex}${alphaHex}`;

    return {
      hex,
      hex8,
      rgb,
      alpha: this.alpha,
    };
  }

  // Color conversion math
  private hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
    h = ((h % 360) + 360) % 360;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;

    if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
    else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
    else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
    else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
    else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
    };
  }

  private rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (d !== 0) {
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
        case g: h = ((b - r) / d + 2) * 60; break;
        case b: h = ((r - g) / d + 4) * 60; break;
      }
    }

    return { h, s, v };
  }
}
