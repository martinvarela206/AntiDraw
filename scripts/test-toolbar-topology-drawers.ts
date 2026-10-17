import { Toolbar } from '../src/webview/ui/Toolbar.js';
import { ToolType } from '../src/webview/tools/ToolType.js';
import { KeyboardShortcutController } from '../src/webview/controllers/KeyboardShortcutController.js';

export async function runToolbarTopologyDrawersTests(): Promise<boolean> {
  console.log('\n--- Running Toolbar Topology Sibling Drawers (A: Cut & B: Construct) Suite ---');

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, desc: string): void {
    if (condition) {
      console.log(`  ✅ [PASS] ${desc}`);
      passedCount++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}`);
      failedCount++;
    }
  }

  // DOM Mock setup for headless Node testing
  function createMockElement(tag: string): any {
    const listeners: Record<string, Function[]> = {};
    const attrs: Record<string, string> = {};
    let rawInnerHTML = '';

    const el: any = {
      tagName: tag.toUpperCase(),
      className: '',
      get innerHTML() {
        return rawInnerHTML;
      },
      set innerHTML(html: string) {
        rawInnerHTML = html;
        el.children = [];
      },
      title: '',
      children: [] as any[],
      getAttribute: (k: string) => attrs[k] || null,
      setAttribute: (k: string, v: string) => {
        attrs[k] = v;
      },
      hasAttribute: (k: string) => k in attrs,
      appendChild: (child: any) => {
        child.parentElement = el;
        el.children.push(child);
        return child;
      },
      remove: () => {
        if (el.parentElement) {
          el.parentElement.children = el.parentElement.children.filter((c: any) => c !== el);
        }
      },
      addEventListener: (evt: string, cb: Function) => {
        if (!listeners[evt]) listeners[evt] = [];
        listeners[evt].push(cb);
      },
      removeEventListener: (evt: string, cb: Function) => {
        if (listeners[evt]) {
          listeners[evt] = listeners[evt].filter((l) => l !== cb);
        }
      },
      dispatchEvent: (evtObj: any) => {
        const cbs = listeners[evtObj.type] || [];
        cbs.forEach((cb) => cb({ ...evtObj, preventDefault: () => {}, stopPropagation: () => {} }));
      },
      click: () => {
        el.dispatchEvent({ type: 'click' });
      },
      contains: (target: any) => {
        if (el === target) return true;
        return el.children.some((c: any) => (c.contains ? c.contains(target) : c === target));
      },
      querySelector: (selector: string): any => {
        for (const child of el.children) {
          if (selector.startsWith('.')) {
            const cls = selector.slice(1);
            if (child.className && child.className.split(' ').includes(cls)) return child;
          } else if (selector.startsWith('[data-drawer-id="')) {
            const val = selector.match(/data-drawer-id="([^"]+)"/)?.[1];
            if (child.getAttribute && child.getAttribute('data-drawer-id') === val) return child;
          } else if (selector.startsWith('[data-tool="')) {
            const val = selector.match(/data-tool="([^"]+)"/)?.[1];
            if (child.getAttribute && child.getAttribute('data-tool') === val) return child;
          }
          if (child.querySelector) {
            const found = child.querySelector(selector);
            if (found) return found;
          }
        }
        return null;
      },
      querySelectorAll: (selector: string): any[] => {
        const results: any[] = [];
        function walk(node: any) {
          for (const child of node.children || []) {
            if (selector.startsWith('.')) {
              const cls = selector.slice(1);
              if (child.className && child.className.split(' ').includes(cls)) results.push(child);
            } else if (selector.startsWith('[data-tool]')) {
              if (child.getAttribute && child.getAttribute('data-tool')) results.push(child);
            }
            walk(child);
          }
        }
        walk(el);
        return results;
      },
    };
    return el;
  }

  const container = createMockElement('div');
  (globalThis as any).document = {
    createElement: (tag: string) => createMockElement(tag),
    querySelectorAll: (selector: string) => container.querySelectorAll(selector),
    querySelector: (selector: string) => container.querySelector(selector),
  };
  const windowListeners: Record<string, Function[]> = {};
  (globalThis as any).window = {
    addEventListener: (evt: string, cb: Function) => {
      if (!windowListeners[evt]) windowListeners[evt] = [];
      windowListeners[evt].push(cb);
    },
    removeEventListener: (evt: string, cb: Function) => {
      if (windowListeners[evt]) windowListeners[evt] = windowListeners[evt].filter((l) => l !== cb);
    },
    dispatchEvent: (e: any) => {
      const list = windowListeners[e.type] || [];
      for (const fn of list) fn(e);
      return true;
    },
  };
  let changedTool: ToolType | null = null;
  const toolbar = new Toolbar(
    container,
    (tool) => {
      changedTool = tool;
    }
  );

  // -----------------------------------------------------------
  // Test 1: Sibling Drawers Declaration and Structure
  // -----------------------------------------------------------
  assert(toolbar.drawerCut !== undefined, 'Drawer A (Partition / Slicing) is defined');
  assert(toolbar.drawerCut.id === 'drawer-cut', 'Drawer A has canonical id "drawer-cut"');
  assert(
    toolbar.drawerCut.tools.map((t) => t.id).join(',') === 'scissors,knife,eraser',
    'Drawer A contains exactly Scissors (C), Knife, and Eraser (Shift+E)'
  );

  assert(toolbar.drawerConstruct !== undefined, 'Drawer B (Construction / Synthesis) is defined');
  assert(toolbar.drawerConstruct.id === 'drawer-construct', 'Drawer B has canonical id "drawer-construct"');
  assert(
    toolbar.drawerConstruct.tools.map((t) => t.id).join(',') === 'smartFill,shapeBuilder',
    'Drawer B contains exactly Smart Fill and Shape Builder'
  );

  // -----------------------------------------------------------
  // Test 2: DOM Rendering of Drawers and Separators
  // -----------------------------------------------------------
  const cutDrawerEl = container.querySelector('[data-drawer-id="drawer-cut"]');
  const constructDrawerEl = container.querySelector('[data-drawer-id="drawer-construct"]');
  assert(cutDrawerEl !== null, 'Drawer A wrapper element rendered in Toolbar DOM');
  assert(constructDrawerEl !== null, 'Drawer B wrapper element rendered in Toolbar DOM');

  const dividers = container.querySelectorAll('.toolbar-divider');
  assert(dividers.length >= 3, `Visual dividers rendered to separate functional groups (found ${dividers.length})`);

  // Initial active slots
  assert(toolbar.drawerCut.activeChildId === 'scissors', 'Drawer A initial active child is "scissors"');
  assert(toolbar.drawerConstruct.activeChildId === 'smartFill', 'Drawer B initial active child is "smartFill"');

  // -----------------------------------------------------------
  // Test 3: Activating Tools in Drawer A updates Drawer State and Slot
  // -----------------------------------------------------------
  toolbar.setTool('scissors');
  assert(toolbar.activeTool === 'scissors', 'Toolbar activeTool is "scissors"');
  assert(changedTool === 'scissors', 'onToolChange callback received "scissors"');
  assert(toolbar.drawerCut.activeChildId === 'scissors', 'Drawer A activeChildId set to "scissors"');

  // Switch to Knife
  toolbar.setTool('knife');
  assert(toolbar.activeTool === 'knife', 'Toolbar activeTool is "knife"');
  assert(toolbar.drawerCut.activeChildId === 'knife', 'Drawer A slot updated to "knife"');
  const knifeMainBtn = container.querySelector('[data-tool="knife"]');
  assert(knifeMainBtn !== null, 'Drawer A main button now displays knife as active slot tool');

  // Switch to Eraser
  toolbar.setTool('eraser');
  assert(toolbar.activeTool === 'eraser', 'Toolbar activeTool is "eraser"');
  assert(toolbar.drawerCut.activeChildId === 'eraser', 'Drawer A slot updated to "eraser"');

  // -----------------------------------------------------------
  // Test 4: Activating Tools in Drawer B updates Drawer State and Slot
  // -----------------------------------------------------------
  toolbar.setTool('smartFill');
  assert(toolbar.activeTool === 'smartFill', 'Toolbar activeTool is "smartFill"');
  assert(toolbar.drawerConstruct.activeChildId === 'smartFill', 'Drawer B activeChildId set to "smartFill"');

  // Switch to Shape Builder
  toolbar.setTool('shapeBuilder');
  assert(toolbar.activeTool === 'shapeBuilder', 'Toolbar activeTool is "shapeBuilder"');
  assert(toolbar.drawerConstruct.activeChildId === 'shapeBuilder', 'Drawer B slot updated to "shapeBuilder"');
  const shapeBuilderBtn = container.querySelector('[data-tool="shapeBuilder"]');
  assert(shapeBuilderBtn !== null, 'Drawer B main button now displays shapeBuilder as active slot tool');

  // -----------------------------------------------------------
  // Test 5: Drawer Flyout Open, Toggle and Close Cycle
  // -----------------------------------------------------------
  assert(toolbar.openDrawerId === null, 'All drawers closed initially');
  toolbar.openDrawer('drawer-cut');
  assert(toolbar.openDrawerId === 'drawer-cut', 'Drawer A flyout opened via openDrawer');

  const flyoutCut = container.querySelector('.tool-drawer-flyout');
  assert(flyoutCut !== null, 'Flyout container rendered in DOM when drawer is open');

  const scissorsChildBtn = container.querySelector('[data-tool="scissors"]');
  const knifeChildBtn = container.querySelector('[data-tool="knife"]');
  const eraserChildBtn = container.querySelector('[data-tool="eraser"]');
  assert(
    scissorsChildBtn !== null && knifeChildBtn !== null && eraserChildBtn !== null,
    'All 3 sibling tools rendered as clickable buttons inside Drawer A flyout'
  );

  // Toggle closes flyout
  toolbar.toggleDrawer('drawer-cut');
  assert(toolbar.openDrawerId === null, 'Toggling open drawer closes it');

  // Open Drawer B flyout
  toolbar.openDrawer('drawer-construct');
  assert(toolbar.openDrawerId === 'drawer-construct', 'Drawer B flyout opened');
  const smartFillChildBtn = container.querySelector('[data-tool="smartFill"]');
  const shapeBuilderChildBtn = container.querySelector('[data-tool="shapeBuilder"]');
  assert(
    smartFillChildBtn !== null && shapeBuilderChildBtn !== null,
    'Both construction tools rendered inside Drawer B flyout'
  );

  // closeDrawers closes
  toolbar.closeDrawers();
  assert(toolbar.openDrawerId === null, 'closeDrawers closes all drawers');

  // -----------------------------------------------------------
  // Test 6: Keyboard Shortcut Dispatch for Scissors (C) & Eraser (Shift+E)
  // -----------------------------------------------------------
  const mockContext = {
    toolbar,
    selectionTool: { selectedElementIds: new Set(), marqueeRect: null },
    canvasMgr: { selectedGuideId: null },
    shapeToolHandler: { shapeStartPt: null },
    nodeToolHandler: {},
    copySelection: () => {},
  } as any;

  const keyController = new KeyboardShortcutController(mockContext);

  function createKeyEvt(key: string, props: Partial<KeyboardEvent> = {}): KeyboardEvent {
    let defaultPrevented = false;
    return {
      key,
      code: key,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault: () => {
        defaultPrevented = true;
      },
      ...props,
    } as any;
  }

  // Press 'c' -> activates scissors
  (keyController as any).handleKeyDown(createKeyEvt('c'));
  assert(toolbar.activeTool === 'scissors', 'Key "c" activates Scissors tool ("scissors")');
  assert(toolbar.drawerCut.activeChildId === 'scissors', 'Drawer A slot synced to "scissors" on key "c"');

  // Press 'Shift+E' -> activates eraser
  (keyController as any).handleKeyDown(createKeyEvt('E', { shiftKey: true }));
  assert(toolbar.activeTool === 'eraser', 'Key "Shift+E" activates Eraser tool ("eraser")');
  assert(toolbar.drawerCut.activeChildId === 'eraser', 'Drawer A slot synced to "eraser" on key "Shift+E"');

  // Press 'e' without Shift -> activates ellipse
  (keyController as any).handleKeyDown(createKeyEvt('e', { shiftKey: false }));
  assert(toolbar.activeTool === 'ellipse', 'Key "e" without Shift activates Ellipse tool ("ellipse")');

  console.log(`\nToolbar Topology Drawers Tests complete: ${passedCount} passed, ${failedCount} failed.`);
  return failedCount === 0;
}
