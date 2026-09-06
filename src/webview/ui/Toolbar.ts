import { ToolIcons } from '../icons/ToolIcons.js';

export type ToolType =
  | 'select'
  | 'node'
  | 'polyline'
  | 'pen'
  | 'rect'
  | 'ellipse'
  | 'line'
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
      { id: 'node', title: 'Node Edit Tool (N)', icon: ToolIcons.node },
      { id: 'polyline', title: 'Polyline Tool (Y)', icon: ToolIcons.polyline },
      { id: 'pen', title: 'Bézier Curve Tool (P)', icon: ToolIcons.pen },
      { id: 'rect', title: 'Rectangle Tool (R)', icon: ToolIcons.rect },
      { id: 'ellipse', title: 'Ellipse/Circle Tool (E)', icon: ToolIcons.ellipse },
      { id: 'line', title: 'Line Tool (L)', icon: ToolIcons.line },
      { id: 'star', title: 'Star/Polygon Tool (S)', icon: ToolIcons.star },
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
