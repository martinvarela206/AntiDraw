import { ToolIcons } from '../icons/ToolIcons.js';
import { ToolType } from '../tools/ToolType.js';
import { I18nService } from '../i18n/I18nService.js';

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

    I18nService.onLanguageChange(() => {
      this.render();
    });
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
    const t = (k: string) => I18nService.t(k);

    this.drawerCut.title = t('toolbar.drawerCutTooltip');
    this.drawerCut.tools[0].title = t('toolbar.scissors');
    this.drawerCut.tools[1].title = t('toolbar.knife');
    this.drawerCut.tools[2].title = t('toolbar.eraser');

    this.drawerConstruct.title = t('toolbar.drawerConstructTooltip');
    this.drawerConstruct.tools[0].title = t('toolbar.smartFill');
    this.drawerConstruct.tools[1].title = t('toolbar.shapeBuilder');

    return [
      // 1. Selección y Manipulación
      { type: 'tool', id: 'select', title: t('toolbar.select'), icon: ToolIcons.selectTool },
      { type: 'tool', id: 'stroke', title: t('panels.stroke'), icon: ToolIcons.strokeTool },
      { type: 'tool', id: 'node', title: t('toolbar.node'), icon: ToolIcons.nodeTool },
      { type: 'divider' },

      // 2. Curvas y Trazado
      { type: 'tool', id: 'pen', title: t('toolbar.pen'), icon: ToolIcons.penTool },
      { type: 'tool', id: 'line', title: t('toolbar.line'), icon: ToolIcons.lineTool },
      { type: 'tool', id: 'polyline', title: t('toolbar.polyline'), icon: ToolIcons.polylineTool },
      { type: 'divider' },

      // 3. Primitivas Paramétricas
      { type: 'tool', id: 'rect', title: t('toolbar.rect'), icon: ToolIcons.rectTool },
      { type: 'tool', id: 'circle', title: t('toolbar.circle'), icon: ToolIcons.circleTool },
      { type: 'tool', id: 'ellipse', title: t('toolbar.ellipse'), icon: ToolIcons.ellipseTool },
      { type: 'tool', id: 'polygon', title: t('toolbar.polygon'), icon: ToolIcons.polygonTool },
      { type: 'tool', id: 'star', title: t('toolbar.star'), icon: ToolIcons.starTool },
      { type: 'divider' },

      // 4. Operaciones de Topología (Sub-cajones Hermanos A y B)
      this.drawerCut,
      this.drawerConstruct,
      { type: 'divider' },

      // 5. Utilidades y Espacio de Trabajo
      { type: 'tool', id: 'addVertex', title: t('toolbar.addVertex'), icon: ToolIcons.addVertexTool },
      { type: 'tool', id: 'zoom', title: t('toolbar.zoom'), icon: ToolIcons.zoomTool },
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
        mainBtn.title = `${currentChild.title} ${I18nService.t('toolbar.drawerCutTooltip')}`;
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
