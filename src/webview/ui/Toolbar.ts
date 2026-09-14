import { ToolIcons } from '../icons/ToolIcons.js';

/**
 * ARCHITECTURAL RATIONALE: Direct Toolbar Access for Canonical SVG Primitives (FEAT-11)
 *
 * 1. Explicit Primitive Tooling vs. Modal Overloading:
 *    Earlier revisions unified line drawing into PolylineToolHandler and circle creation into
 *    the ellipse tool via keyboard modifiers (Ctrl+Drag). However, direct toolbar presence for
 *    the standard SVG primitive suite (<circle>, <ellipse>, <rect>, <line>, <polyline>, <polygon>)
 *    provides immediate, discoverable single-click access for technical draftspersons, eliminating
 *    hidden modal interactions.
 *
 * 2. Dedicated Tool Semantics:
 *    - 'line': Produces native <line x1 y1 x2 y2> primitives without multi-click vertex accumulation.
 *    - 'circle': Enforces 1:1 circular aspect ratio intrinsically, producing native <circle cx cy r>.
 *    - 'ellipse': Produces parametric <ellipse cx cy rx ry>.
 *    - 'rect': Produces parametric <rect x y width height>.
 *    - 'polyline': Multi-node straight open paths producing <polyline points="...">.
 *    - 'polygon': Multi-node closed regular or freeform shapes producing <polygon points="...">.
 */
export type ToolType =
  | 'select'
  | 'stroke'
  | 'node'
  | 'pen'
  | 'line'
  | 'polyline'
  | 'rect'
  | 'circle'
  | 'ellipse'
  | 'polygon'
  | 'star'
  | 'addVertex'
  | 'canvas'
  | 'zoom';

export class Toolbar {
  public activeTool: ToolType = 'select';
  private container: HTMLElement;
  private onToolChangeCallback: (tool: ToolType) => void;

  constructor(container: HTMLElement, onToolChange: (tool: ToolType) => void) {
    this.container = container;
    this.onToolChangeCallback = onToolChange;
    this.render();
  }

  public setTool(tool: ToolType): void {
    this.activeTool = tool;
    this.render();
    this.onToolChangeCallback(tool);
  }

  public deselectAll(): void {
    this.activeTool = '' as any;
    this.render();
  }

  private render(): void {
    const tools: { id: ToolType; title: string; icon: string }[] = [
      { id: 'select', title: 'Selection Tool (V)', icon: ToolIcons.select },
      { id: 'stroke', title: 'Stroke Tool (T)', icon: ToolIcons.stroke },
      { id: 'node', title: 'Node Edit Tool (N)', icon: ToolIcons.node },
      { id: 'pen', title: 'Bézier Curve Tool (P)', icon: ToolIcons.pen },
      { id: 'line', title: 'Line Tool (L)', icon: ToolIcons.line },
      { id: 'polyline', title: 'Polyline Tool (Y)', icon: ToolIcons.polyline },
      { id: 'rect', title: 'Rectangle Tool (R)', icon: ToolIcons.rect },
      { id: 'circle', title: 'Circle Tool (O)', icon: ToolIcons.circle },
      { id: 'ellipse', title: 'Ellipse Tool (E)', icon: ToolIcons.ellipse },
      { id: 'polygon', title: 'Polygon Tool (G)', icon: ToolIcons.polygon },
      { id: 'star', title: 'Star Tool (S)', icon: ToolIcons.star },
      { id: 'addVertex', title: 'Add Vertex Tool (+)', icon: ToolIcons.addVertex },
      { id: 'canvas', title: 'Canvas Tool (C)', icon: ToolIcons.canvas },
      { id: 'zoom', title: 'Zoom/Pan Tool (Z)', icon: ToolIcons.zoom },
    ];

    this.container.innerHTML = '';

    tools.forEach((t) => {
      const isActive = this.activeTool === t.id;
      const btn = document.createElement('button');
      btn.className = `btn-icon ${isActive ? 'active' : ''}`;
      btn.setAttribute('data-tool', t.id);
      btn.setAttribute('data-active', isActive ? 'true' : 'false');
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      btn.title = t.title;
      btn.innerHTML = t.icon;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.setTool(t.id);
      });
      this.container.appendChild(btn);
    });
  }
}
