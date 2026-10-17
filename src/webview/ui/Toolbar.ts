import { ToolIcons } from '../icons/ToolIcons.js';
import { ToolType } from '../tools/ToolType.js';

export type { ToolType };

export interface SingleToolItem {
  type: 'tool';
  id: ToolType;
  title: string;
  icon: string;
}

export interface DrawerToolItem {
  id: ToolType;
  title: string;
  icon: string;
  shortcut?: string;
}

export interface DrawerGroupItem {
  type: 'drawer';
  id: string;
  title: string;
  activeChildId: ToolType;
  tools: DrawerToolItem[];
}

export type ToolbarItem = SingleToolItem | DrawerGroupItem;

/**
 * ARCHITECTURAL RATIONALE: Modular Topology Tool Drawers & High-Fidelity Functional Grouping (FEAT-TOPOLOGY-UI)
 *
 * 1. Functional Grouping & Topology Drawer Siblings:
 *    Organizes vector topology and path operations into two cohesive sibling drawers:
 *    - Drawer A (Partition & Slicing): Scissors ('scissors' / C), Knife ('knife'), Eraser ('eraser' / Shift+E).
 *    - Drawer B (Construction & Synthesis): Smart Fill ('smartFill'), Shape Builder ('shapeBuilder').
 *
 * 2. Visual Invariance & State Memory:
 *    Each drawer maintains a persistent slot in the left toolbar representing its currently active child tool.
 *    Selecting any tool from a drawer updates its default active slot, and double-click or long-press/flyout
 *    provides non-intrusive access to sibling operations.
 *
 * 3. 100% Backward & Forward Contract Compatibility:
 *    Preserves `setTool`, `deselectAll`, `onToolChange`, and `onToolDoubleClick` callback contracts.
 */
export class Toolbar {
  public activeTool: ToolType = 'select';
  public openDrawerId: string | null = null;
  private container: HTMLElement;
  private onToolChangeCallback: (tool: ToolType) => void;
  private onToolDoubleClickCallback?: (tool: ToolType) => void;

  public readonly drawerCut: DrawerGroupItem = {
    type: 'drawer',
    id: 'drawer-cut',
    title: 'Corte y Partición (Tijeras C, Cuchilla, Borrador Shift+E)',
    activeChildId: 'scissors',
    tools: [
      { id: 'scissors', title: 'Scissors Tool (C)', icon: ToolIcons.scissorsTool, shortcut: 'C' },
      { id: 'knife', title: 'Knife Tool', icon: ToolIcons.knifeTool },
      { id: 'eraser', title: 'Eraser Tool (Shift+E)', icon: ToolIcons.eraserTool, shortcut: 'Shift+E' },
    ],
  };

  public readonly drawerConstruct: DrawerGroupItem = {
    type: 'drawer',
    id: 'drawer-construct',
    title: 'Construcción y Composición (Relleno Inteligente, Constructor de Formas)',
    activeChildId: 'smartFill',
    tools: [
      { id: 'smartFill', title: 'Smart Fill Tool', icon: ToolIcons.smartFillTool },
      { id: 'shapeBuilder', title: 'Shape Builder Tool', icon: ToolIcons.shapeBuilderTool },
    ],
  };

  private outsideClickListener?: (e: MouseEvent) => void;
  private outsideKeyDownListener?: (e: KeyboardEvent) => void;

  constructor(
    container: HTMLElement,
    onToolChange: (tool: ToolType) => void,
    onToolDoubleClick?: (tool: ToolType) => void
  ) {
    this.container = container;
    this.onToolChangeCallback = onToolChange;
    this.onToolDoubleClickCallback = onToolDoubleClick;
    this.setupGlobalListeners();
    this.render();
  }

  private setupGlobalListeners(): void {
    if (typeof window === 'undefined') return;

    this.outsideClickListener = (e: MouseEvent) => {
      if (!this.openDrawerId) return;
      const target = e.target as HTMLElement | null;
      if (target && (this.container.contains(target) || target.closest('.tool-drawer-flyout'))) return;
      this.closeDrawers();
    };

    this.outsideKeyDownListener = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.openDrawerId) {
        this.closeDrawers();
      }
    };

    window.addEventListener('mousedown', this.outsideClickListener);
    window.addEventListener('keydown', this.outsideKeyDownListener);
  }

  public setTool(tool: ToolType): void {
    if (this.drawerCut.tools.some((t) => t.id === tool)) {
      this.drawerCut.activeChildId = tool;
    }
    if (this.drawerConstruct.tools.some((t) => t.id === tool)) {
      this.drawerConstruct.activeChildId = tool;
    }

    this.activeTool = tool;
    this.openDrawerId = null;
    document.querySelectorAll('.tool-drawer-flyout').forEach((el) => el.remove?.());
    this.render();
    this.onToolChangeCallback(tool);
  }

  public deselectAll(): void {
    this.activeTool = '' as any;
    this.openDrawerId = null;
    document.querySelectorAll('.tool-drawer-flyout').forEach((el) => el.remove?.());
    this.render();
  }

  public openDrawer(drawerId: string): void {
    this.openDrawerId = drawerId;
    this.render();
  }

  public closeDrawers(): void {
    if (this.openDrawerId !== null) {
      this.openDrawerId = null;
      document.querySelectorAll('.tool-drawer-flyout').forEach((el) => el.remove?.());
      this.render();
    }
  }

  public toggleDrawer(drawerId: string): void {
    if (this.openDrawerId === drawerId) {
      this.closeDrawers();
    } else {
      this.openDrawer(drawerId);
    }
  }

  public isToolInDrawer(tool: ToolType, drawerId: string): boolean {
    if (drawerId === this.drawerCut.id) {
      return this.drawerCut.tools.some((t) => t.id === tool);
    }
    if (drawerId === this.drawerConstruct.id) {
      return this.drawerConstruct.tools.some((t) => t.id === tool);
    }
    return false;
  }

  private getToolbarItems(): (ToolbarItem | { type: 'divider' })[] {
    return [
      // 1. Selección y Manipulación
      { type: 'tool', id: 'select', title: 'Selection Tool (V)', icon: ToolIcons.selectTool },
      { type: 'tool', id: 'stroke', title: 'Stroke Tool (T)', icon: ToolIcons.strokeTool },
      { type: 'tool', id: 'node', title: 'Node Edit Tool (N)', icon: ToolIcons.nodeTool },
      { type: 'divider' },

      // 2. Curvas y Trazado
      { type: 'tool', id: 'pen', title: 'Bézier Curve Tool (P)', icon: ToolIcons.penTool },
      { type: 'tool', id: 'line', title: 'Line Tool (L)', icon: ToolIcons.lineTool },
      { type: 'tool', id: 'polyline', title: 'Polyline Tool (Y)', icon: ToolIcons.polylineTool },
      { type: 'divider' },

      // 3. Primitivas Paramétricas
      { type: 'tool', id: 'rect', title: 'Rectangle Tool (R)', icon: ToolIcons.rectTool },
      { type: 'tool', id: 'circle', title: 'Circle Tool (O)', icon: ToolIcons.circleTool },
      { type: 'tool', id: 'ellipse', title: 'Ellipse Tool (E)', icon: ToolIcons.ellipseTool },
      { type: 'tool', id: 'polygon', title: 'Polygon Tool (G)', icon: ToolIcons.polygonTool },
      { type: 'tool', id: 'star', title: 'Star Tool (S)', icon: ToolIcons.starTool },
      { type: 'divider' },

      // 4. Operaciones de Topología (Sub-cajones Hermanos A y B)
      this.drawerCut,
      this.drawerConstruct,
      { type: 'divider' },

      // 5. Utilidades y Espacio de Trabajo
      { type: 'tool', id: 'addVertex', title: 'Add Vertex Tool (+)', icon: ToolIcons.addVertexTool },
      { type: 'tool', id: 'zoom', title: 'Zoom/Pan Tool (Z)', icon: ToolIcons.zoomTool },
    ];
  }

  public render(): void {
    this.container.innerHTML = '';
    const items = this.getToolbarItems();

    items.forEach((item) => {
      if (item.type === 'divider') {
        const divider = document.createElement('div');
        divider.className = 'toolbar-divider';
        this.container.appendChild(divider);
        return;
      }

      if (item.type === 'tool') {
        const isActive = this.activeTool === item.id;
        const btn = document.createElement('button');
        btn.className = `btn-icon ${isActive ? 'active' : ''}`;
        btn.setAttribute('data-tool', item.id);
        btn.setAttribute('data-active', isActive ? 'true' : 'false');
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        btn.title = item.title;
        btn.innerHTML = item.icon;

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.setTool(item.id);
        });

        btn.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.onToolDoubleClickCallback?.(item.id);
        });

        this.container.appendChild(btn);
        return;
      }

      if (item.type === 'drawer') {
        const drawer = item;
        const currentChild = drawer.tools.find((t) => t.id === drawer.activeChildId) || drawer.tools[0];
        const isDrawerActive = this.isToolInDrawer(this.activeTool, drawer.id);
        const isOpen = this.openDrawerId === drawer.id;

        const wrapper = document.createElement('div');
        wrapper.className = `btn-drawer-wrapper ${isDrawerActive ? 'drawer-active' : ''}`;
        wrapper.setAttribute('data-drawer-id', drawer.id);

        const mainBtn = document.createElement('button');
        mainBtn.className = `btn-icon ${isDrawerActive ? 'active' : ''}`;
        mainBtn.setAttribute('data-tool', currentChild.id);
        mainBtn.setAttribute('data-drawer-tool', drawer.id);
        mainBtn.setAttribute('data-active', isDrawerActive ? 'true' : 'false');
        mainBtn.setAttribute('aria-pressed', isDrawerActive ? 'true' : 'false');
        mainBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        mainBtn.title = `${currentChild.title} [Clic largo o botón derecho para alternar grupo]`;
        mainBtn.innerHTML = `${currentChild.icon}<span class="drawer-indicator"></span>`;

        // Long press trigger for drawer flyout
        let longPressTimer: any = null;
        let didLongPress = false;

        mainBtn.addEventListener('pointerdown', (e) => {
          if (e.button === 0) {
            didLongPress = false;
            longPressTimer = setTimeout(() => {
              didLongPress = true;
              this.openDrawer(drawer.id);
            }, 250);
          }
        });

        const cancelLongPress = () => {
          if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
        };
        mainBtn.addEventListener('pointerup', cancelLongPress);
        mainBtn.addEventListener('pointerleave', cancelLongPress);

        // Click interaction
        mainBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (didLongPress) {
            didLongPress = false;
            return;
          }
          cancelLongPress();
          if (isDrawerActive) {
            // Already active in this drawer: toggle flyout
            this.toggleDrawer(drawer.id);
          } else {
            // Switch to drawer's active child
            this.setTool(drawer.activeChildId);
          }
        });

        // Context menu opens flyout immediately
        mainBtn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          cancelLongPress();
          this.toggleDrawer(drawer.id);
        });

        mainBtn.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          cancelLongPress();
          this.onToolDoubleClickCallback?.(currentChild.id);
        });

        wrapper.appendChild(mainBtn);

        // Render flyout if open
        if (isOpen) {
          document.querySelectorAll('.tool-drawer-flyout').forEach((el) => el.remove?.());

          const flyout = document.createElement('div');
          flyout.className = 'tool-drawer-flyout';
          flyout.setAttribute('role', 'menu');
          flyout.setAttribute('data-flyout-for', drawer.id);

          drawer.tools.forEach((child) => {
            const isChildActive = this.activeTool === child.id;
            const childBtn = document.createElement('button');
            childBtn.className = `btn-icon ${isChildActive ? 'active' : ''}`;
            childBtn.setAttribute('data-tool', child.id);
            childBtn.setAttribute('data-active', isChildActive ? 'true' : 'false');
            childBtn.setAttribute('aria-pressed', isChildActive ? 'true' : 'false');
            childBtn.title = child.title;
            childBtn.innerHTML = child.icon;

            childBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              drawer.activeChildId = child.id;
              this.setTool(child.id);
            });

            flyout.appendChild(childBtn);
          });

          wrapper.appendChild(flyout);
        }

        this.container.appendChild(wrapper);
      }
    });
  }
}
