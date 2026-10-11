import { ToolIcons } from '../icons/ToolIcons.js';
import { ToolType } from '../tools/ToolType.js';

export type { ToolType };

export class Toolbar {
  public activeTool: ToolType = 'select';
  private container: HTMLElement;
  private onToolChangeCallback: (tool: ToolType) => void;
  private onToolDoubleClickCallback?: (tool: ToolType) => void;

  constructor(
    container: HTMLElement,
    onToolChange: (tool: ToolType) => void,
    onToolDoubleClick?: (tool: ToolType) => void
  ) {
    this.container = container;
    this.onToolChangeCallback = onToolChange;
    this.onToolDoubleClickCallback = onToolDoubleClick;
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
      { id: 'select', title: 'Selection Tool (V)', icon: ToolIcons.selectTool },
      { id: 'stroke', title: 'Stroke Tool (T)', icon: ToolIcons.strokeTool },
      { id: 'node', title: 'Node Edit Tool (N)', icon: ToolIcons.nodeTool },
      { id: 'pen', title: 'Bézier Curve Tool (P)', icon: ToolIcons.penTool },
      { id: 'line', title: 'Line Tool (L)', icon: ToolIcons.lineTool },
      { id: 'polyline', title: 'Polyline Tool (Y)', icon: ToolIcons.polylineTool },
      { id: 'rect', title: 'Rectangle Tool (R)', icon: ToolIcons.rectTool },
      { id: 'circle', title: 'Circle Tool (O)', icon: ToolIcons.circleTool },
      { id: 'ellipse', title: 'Ellipse Tool (E)', icon: ToolIcons.ellipseTool },
      { id: 'polygon', title: 'Polygon Tool (G)', icon: ToolIcons.polygonTool },
      { id: 'star', title: 'Star Tool (S)', icon: ToolIcons.starTool },
      { id: 'addVertex', title: 'Add Vertex Tool (+)', icon: ToolIcons.addVertexTool },
      { id: 'canvas', title: 'Canvas Tool (C)', icon: ToolIcons.canvasTool },
      { id: 'zoom', title: 'Zoom/Pan Tool (Z)', icon: ToolIcons.zoomTool },
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
      btn.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onToolDoubleClickCallback?.(t.id);
      });
      this.container.appendChild(btn);
    });
  }
}
