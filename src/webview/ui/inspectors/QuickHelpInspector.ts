import { ToolIcons } from '../../icons/ToolIcons.js';

export interface ShortcutItem {
  keys: string[];
  description: string;
  badge?: string;
}

export interface ToolHelpConfig {
  title: string;
  toolId: string;
  icon: string;
  shortcuts: ShortcutItem[];
}

/**
 * ARCHITECTURAL RATIONALE: Modular Quick Help & Keyboard Modifier Inspector (FEAT)
 *
 * 1. Discoverability & Technical Precision:
 *    Complex vector manipulation operations (such as constrained orthogonal translations,
 *    homographic perspective distortions, symmetric Bézier node manipulations, and magnetic snapping)
 *    rely heavily on keyboard modifiers (Ctrl, Shift, Alt) combined with pointer gestures.
 *    Providing dynamic, context-aware quick reference tables directly within the properties panel
 *    maximizes operator efficiency and eliminates hidden modal interaction friction.
 *
 * 2. Decoupled Context-Aware Presentation:
 *    Isolated from geometric and aesthetic inspectors to adhere strictly to the Single
 *    Responsibility Principle (SRP). Updates reactively whenever the active tool changes,
 *    without causing reflows or re-renders of active input fields in companion inspectors.
 *
 * 3. State Preservation:
 *    Maintains collapse/expand accordion preference in memory so operators with smaller displays
 *    can toggle the section without losing layout state across selection changes.
 */
export class QuickHelpInspector {
  private static isCollapsed: boolean = false;

  private static readonly TOOL_HELP_MAP: Record<string, ToolHelpConfig> = {
    select: {
      title: 'Herramienta Selección',
      toolId: 'select',
      icon: ToolIcons.selectTool,
      shortcuts: [
        { keys: ['Clic'], description: 'Selecciona elemento bajo el cursor o deselecciona en vacío' },
        { keys: ['Shift', 'Clic'], description: 'Añade o remueve el elemento de la selección múltiple' },
        { keys: ['Arrastre'], description: 'Mueve los elementos seleccionados sobre el lienzo' },
        { keys: ['Ctrl', 'Arrastre'], description: 'Restringe el movimiento a ejes ortogonales (horizontal o vertical)' },
        { keys: ['Alt', 'Arrastre'], description: 'Duplica los elementos seleccionados creando un clon' },
        { keys: ['Arrastre en vacío'], description: 'Selección por área mediante caja elástica (Marquee)' },
        { keys: ['Shift', 'Marquee'], description: 'Selección por área acumulativa / aditiva' },
        { keys: ['Alt', 'Marquee'], description: 'Modo intersección: selecciona objetos que toquen el marco' },
        { keys: ['Doble clic'], description: 'Conmuta a la herramienta Edición de Nodos (N)' },
        { keys: ['Tirador esquina'], description: 'Escala libremente el elemento o grupo seleccionado' },
        { keys: ['Shift', 'Escala'], description: 'Escala proporcional manteniendo relación de aspecto' },
        { keys: ['Alt', 'Escala'], description: 'Escala simétricamente expandiendo desde el centro/pivote' },
        { keys: ['Arrastrar'], description: 'Traslada elementos seleccionados con snap a nodos, bordes y guías' },
        { keys: ['Shift', 'Arrastrar'], description: 'Restringe el desplazamiento al eje horizontal o vertical' },
        { keys: ['Alt', 'Arrastre en vacío'], description: 'Marquesina de selección por toque/cruce (touch-select)' },
        { keys: ['Shift', 'Arrastre tirador'], description: 'Escala proporcional preservando relación de aspecto' },
        { keys: ['Alt', 'Arrastre tirador'], description: 'Escala simétrica concéntrica desde el centro' },
        { keys: ['Shift', 'Arrastre rotar'], description: 'Fuerza el ángulo de rotación a múltiplos de 15°' },
        { keys: ['Clic pausado'], description: 'Cicla modos: Escala → Rotación → Deformación libre (Perspectiva)' },
        { keys: ['Doble clic'], description: 'Entra directamente al modo de edición de nodos' },
        { keys: ['Ctrl+C / Ctrl+V'], description: 'Copia y pega con desplazamiento automático de 15px' },
        { keys: ['Ctrl+D'], description: 'Duplica instantáneamente los elementos seleccionados' },
        { keys: ['Supr / Backspace'], description: 'Elimina los elementos seleccionados' },
      ],
    },
    node: {
      title: 'Edición de Nodos',
      toolId: 'node',
      icon: ToolIcons.nodeTool,
      shortcuts: [
        { keys: ['Clic en nodo'], description: 'Selecciona el vértice y muestra tiradores Bézier' },
        { keys: ['Shift / Ctrl', 'Clic'], description: 'Selección aditiva de múltiples vértices' },
        { keys: ['Arrastrar nodo'], description: 'Mueve el vértice con snap a grillas, guías y nodos' },
        { keys: ['Shift', 'Arrastrar tirador'], description: 'Fuerza el ángulo del tirador a pasos de 45°' },
        { keys: ['Ctrl', 'Arrastre a extremo'], description: 'Suelda y cierra el contorno al unir extremos opuestos' },
        { keys: ['Alt', 'Arrastre en vacío'], description: 'Selección de nodos por área en modo toque/intersección' },
        { keys: ['Doble clic en segmento'], description: 'Inserta un nuevo vértice en el punto exacto de la curva' },
        { keys: ['Doble clic en nodo'], description: 'Alterna el tipo de nodo (asimétrico ↔ uniforme ↔ simétrico)' },
        { keys: ['Supr / Backspace'], description: 'Elimina los nodos seleccionados preservando el trazo' },
      ],
    },
    pen: {
      title: 'Pluma Bézier',
      toolId: 'pen',
      icon: ToolIcons.penTool,
      shortcuts: [
        { keys: ['Clic'], description: 'Añade un vértice recto (nodo cúspide sin tiradores)' },
        { keys: ['Clic + Arrastre'], description: 'Extrae tiradores tangenciales para crear curvas suaves' },
        { keys: ['Alt', 'Arrastrar tirador'], description: 'Quiebra la tangencia del nodo (tirador asimétrico)' },
        { keys: ['Clic en inicio'], description: 'Cierra el contorno finalizando el trazado' },
        { keys: ['Enter / Doble clic'], description: 'Finaliza el trazado dejándolo abierto' },
        { keys: ['Escape'], description: 'Cancela el trazado en curso' },
      ],
    },
    polyline: {
      title: 'Polilínea',
      toolId: 'polyline',
      icon: ToolIcons.polylineTool,
      shortcuts: [
        { keys: ['Clic'], description: 'Añade un nuevo vértice con segmento recto puro' },
        { keys: ['Clic en inicio'], description: 'Cierra la polilínea transformándola en polígono' },
        { keys: ['Enter / Doble clic'], description: 'Finaliza el trazo poligonal abierto' },
        { keys: ['Escape'], description: 'Cancela el dibujo actual' },
      ],
    },
    line: {
      title: 'Línea Recta',
      toolId: 'line',
      icon: ToolIcons.lineTool,
      shortcuts: [
        { keys: ['Clic + Arrastre'], description: 'Traza un segmento de recta nativo <line>' },
        { keys: ['Shift', 'Arrastre'], description: 'Fuerza el ángulo a múltiplos de 45° (horizontal/vertical/diagonal)' },
        { keys: ['Espacio', 'en vuelo'], description: 'Desplaza la línea completa en pantalla sin alterar su longitud' },
      ],
    },
    rect: {
      title: 'Rectángulo',
      toolId: 'rect',
      icon: ToolIcons.rectTool,
      shortcuts: [
        { keys: ['Clic + Arrastre'], description: 'Dibuja un rectángulo libre desde la esquina opuesta' },
        { keys: ['Shift', 'Arrastre'], description: 'Bloquea proporción 1:1 (cuadrado perfecto en vuelo)' },
        { keys: ['Alt', 'Arrastre'], description: 'Proyecta simétricamente expandiendo desde el centro geométrico' },
        { keys: ['Espacio', 'en vuelo'], description: 'Desplaza la posición de la forma en pantalla sin perder su tamaño' },
      ],
    },
    circle: {
      title: 'Círculo',
      toolId: 'circle',
      icon: ToolIcons.circleTool,
      shortcuts: [
        { keys: ['Clic + Arrastre'], description: 'Dibuja un círculo nativo <circle> (1:1 intrínseco)' },
        { keys: ['Alt', 'Arrastre'], description: 'Expande el círculo concéntricamente desde su centro' },
        { keys: ['Espacio', 'en vuelo'], description: 'Desplaza la posición del círculo en pantalla sin alterar su radio' },
      ],
    },
    ellipse: {
      title: 'Elipse',
      toolId: 'ellipse',
      icon: ToolIcons.ellipseTool,
      shortcuts: [
        { keys: ['Clic + Arrastre'], description: 'Dibuja una elipse paramétrica libre desde la esquina opuesta' },
        { keys: ['Shift', 'Arrastre'], description: 'Bloquea proporción 1:1 (círculo perfecto en vuelo)' },
        { keys: ['Alt', 'Arrastre'], description: 'Proyecta simétricamente expandiendo desde el centro geométrico' },
        { keys: ['Espacio', 'en vuelo'], description: 'Desplaza la posición de la elipse en pantalla sin perder su tamaño' },
      ],
    },
    polygon: {
      title: 'Polígono Regular',
      toolId: 'polygon',
      icon: ToolIcons.polygonTool,
      shortcuts: [
        { keys: ['Clic + Arrastre'], description: 'Dibuja un polígono regular con los lados configurados' },
        { keys: ['Alt', 'Arrastre'], description: 'Proyecta el polígono expandiéndolo desde su centro' },
        { keys: ['Espacio', 'en vuelo'], description: 'Desplaza el polígono en pantalla sin alterar su tamaño' },
      ],
    },
    star: {
      title: 'Estrella Paramétrica',
      toolId: 'star',
      icon: ToolIcons.starTool,
      shortcuts: [
        { keys: ['Clic + Arrastre'], description: 'Dibuja una estrella con las puntas y radio configurados' },
        { keys: ['Alt', 'Arrastre'], description: 'Proyecta la estrella expandiéndola desde su centro' },
        { keys: ['Espacio', 'en vuelo'], description: 'Desplaza la estrella en pantalla sin alterar su tamaño' },
      ],
    },
    stroke: {
      title: 'Herramienta Trazo',
      toolId: 'stroke',
      icon: ToolIcons.strokeTool,
      shortcuts: [
        { keys: ['Clic en vector'], description: 'Inspecciona y edita grosor, remates, uniones y guiones' },
        { keys: ['Clic en vacío'], description: 'Deselecciona el vector inspeccionado' },
      ],
    },
    addVertex: {
      title: 'Añadir Vértice',
      toolId: 'addVertex',
      icon: ToolIcons.addVertexTool,
      shortcuts: [
        { keys: ['Clic en trazado'], description: 'Inserta un nuevo nodo manteniendo la curvatura analítica exacta' },
      ],
    },
    canvas: {
      title: 'Lienzo y ViewBox',
      toolId: 'canvas',
      icon: ToolIcons.canvasTool,
      shortcuts: [
        { keys: ['Arrastrar bordes'], description: 'Redimensiona interactivamente el ViewBox de dibujo' },
        { keys: ['Shift', 'Arrastre'], description: 'Redimensiona manteniendo la proporción de aspecto' },
        { keys: ['Alt', 'Arrastre'], description: 'Redimensiona de forma simétrica desde el centro' },
      ],
    },
    zoom: {
      title: 'Zoom y Paneo',
      toolId: 'zoom',
      icon: ToolIcons.zoomTool,
      shortcuts: [
        { keys: ['Clic'], description: 'Aumenta el nivel de zoom centrado en el cursor' },
        { keys: ['Alt', 'Clic'], description: 'Disminuye el nivel de zoom' },
        { keys: ['Arrastre'], description: 'Zoom de ventana al área encuadrada' },
        { keys: ['Espacio', 'Arrastre'], description: 'Paneo libre por el área de trabajo (también botón central)' },
        { keys: ['Ctrl', 'Rueda ratón'], description: 'Zoom continuo hacia dentro o hacia fuera' },
        { keys: ['Shift', 'Rueda ratón'], description: 'Desplazamiento horizontal del lienzo' },
      ],
    },
    ruler: {
      title: 'Reglas y Guías',
      toolId: 'ruler',
      icon: ToolIcons.rulersVisibility,
      shortcuts: [
        { keys: ['Arrastre desde regla'], description: 'Crea una nueva guía métrica horizontal o vertical' },
        { keys: ['Ctrl / Shift', 'Arrastre'], description: 'Fuerza el giro angular de la guía a saltos de 15°' },
        { keys: ['Doble clic esquina'], description: 'Restablece el origen (0,0) a la esquina del ViewBox' },
        { keys: ['Arrastre esquina'], description: 'Fija un nuevo origen de coordenadas (0,0) personalizado' },
        { keys: ['Doble clic en guía'], description: 'Abre el inspector para configurar posición y ángulo' },
        { keys: ['Supr / Backspace'], description: 'Elimina la línea de guía seleccionada' },
      ],
    },
  };

  /**
   * Renderiza el componente de ayuda rápida en el contenedor especificado.
   */
  public static render(container: HTMLElement, activeTool: string, isGuideOrRuler: boolean = false): void {
    const key = isGuideOrRuler ? 'ruler' : (this.TOOL_HELP_MAP[activeTool] ? activeTool : 'select');
    const config = this.TOOL_HELP_MAP[key] || this.TOOL_HELP_MAP.select;

    const rowsHtml = config.shortcuts
      .map((item) => {
        const keysHtml = item.keys
          .map((k) => `<kbd class="quick-help-kbd">${k}</kbd>`)
          .join('<span class="quick-help-plus">+</span>');

        return `
          <div class="quick-help-row">
            <div class="quick-help-keys">${keysHtml}</div>
            <div class="quick-help-desc">${item.description}</div>
          </div>
        `;
      })
      .join('');

    const chevronRotation = this.isCollapsed ? 'style="transform: rotate(-90deg);"' : '';
    const contentDisplay = this.isCollapsed ? 'style="display: none;"' : '';

    container.innerHTML = `
      <div class="panel-section quick-help-section">
        <div class="panel-title quick-help-header" id="btn-toggle-quick-help" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; margin-bottom: 0; user-select: none;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="quick-help-tool-icon">${config.icon}</span>
            <span>Ayuda Rápida: ${config.title}</span>
          </div>
          <svg class="quick-help-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" ${chevronRotation}>
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
        <div class="quick-help-content" id="quick-help-content" ${contentDisplay}>
          <div class="quick-help-table">
            ${rowsHtml}
          </div>
        </div>
      </div>
    `;

    const toggleBtn = container.querySelector('#btn-toggle-quick-help');
    if (toggleBtn) {
      toggleBtn.addEventListener('mousedown', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.isCollapsed = !this.isCollapsed;
        this.render(container, activeTool, isGuideOrRuler);
      });
    }
  }
}
