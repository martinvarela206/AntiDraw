import { ToolIcons } from '../../icons/ToolIcons.js';
import { I18nService } from '../../i18n/index.js';

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
 * 3. State Preservation & Universal Localization (i18n):
 *    Maintains collapse/expand accordion preference in memory and renders full bilingual
 *    cheatsheets in both Spanish and English depending on active application locale.
 */
export class QuickHelpInspector {
  private static isCollapsed: boolean = false;

  private static readonly TOOL_HELP_MAP_ES: Record<string, ToolHelpConfig> = {
    select: {
      title: 'Herramienta Selección',
      toolId: 'select',
      icon: ToolIcons.selectTool,
      shortcuts: [
        { keys: ['V'], description: 'Activa la herramienta Selección (conmuta desde cualquier otra herramienta)' },
        { keys: ['Mini-HUD'], description: 'Píldora flotante bajo la regla superior para alternar con 1 clic: Mover, Escalar, Rotar' },
        { keys: ['Clic pausado'], description: 'Cicla modos: Escala → Rotación → Deformación libre (Perspectiva)' },
        { keys: ['D'], description: 'Deformación Libre / Perspectiva: activa/desactiva tiradores de homografía 3x3' },
        { keys: ['Botón ▱'], description: 'Botón dedicado en inspector para activar/desactivar Deformación Libre' },
        { keys: ['Clic'], description: 'Selecciona elemento bajo el cursor o deselecciona en vacío' },
        { keys: ['Shift', 'Clic'], description: 'Añade o remueve el elemento de la selección múltiple' },
        { keys: ['Arrastre'], description: 'Mueve los elementos seleccionados sobre el lienzo' },
        { keys: ['Ctrl', 'Arrastre'], description: 'Restringe el movimiento a ejes ortogonales (horizontal o vertical)' },
        { keys: ['Alt', 'Arrastre'], description: 'Duplica los elementos seleccionados creando un clon' },
        { keys: ['Arrastre en vacío'], description: 'Selección por área mediante caja elástica (Marquee)' },
        { keys: ['Shift', 'Marquee'], description: 'Selección por área acumulativa / aditiva' },
        { keys: ['Alt', 'Marquee'], description: 'Modo intersección: selecciona objetos que toquen el marco' },
        { keys: ['Doble clic'], description: 'Conmuta a la herramienta Edición de Nodos (A)' },
        { keys: ['Tirador esquina'], description: 'Escala libremente el elemento o grupo seleccionado' },
        { keys: ['Shift', 'Escala'], description: 'Escala proporcional manteniendo relación de aspecto' },
        { keys: ['Alt', 'Escala'], description: 'Escala simétricamente expandiendo desde el centro/pivote' },
        { keys: ['Arrastrar'], description: 'Traslada elementos seleccionados con snap a nodos, bordes y guías' },
        { keys: ['Shift', 'Arrastrar'], description: 'Restringe el desplazamiento al eje horizontal o vertical' },
        { keys: ['Alt', 'Arrastre en vacío'], description: 'Marquesina de selección por toque/cruce (touch-select)' },
        { keys: ['Shift', 'Arrastre tirador'], description: 'Escala proporcional preservando relación de aspecto' },
        { keys: ['Alt', 'Arrastre tirador'], description: 'Escala simétrica concéntrica desde el centro' },
        { keys: ['Shift', 'Arrastre rotar'], description: 'Fuerza el ángulo de rotación a múltiplos de 15°' },
        { keys: ['Ctrl+C / Ctrl+V'], description: 'Copia y pega con desplazamiento automático de 15px' },
        { keys: ['Ctrl+D'], description: 'Duplica instantáneamente los elementos seleccionados' },
        { keys: ['Doble clic icono (V)'], description: 'Abre el diálogo de transformación numérica (posición X/Y y desplazamiento)' },
        { keys: ['Supr / Backspace'], description: 'Elimina los elementos seleccionados' },
      ],
    },
    node: {
      title: 'Edición de Nodos',
      toolId: 'node',
      icon: ToolIcons.nodeTool,
      shortcuts: [
        { keys: ['A'], description: 'Activa la herramienta Edición de Nodos' },
        { keys: ['Clic en nodo'], description: 'Selecciona el vértice y muestra tiradores Bézier' },
        { keys: ['Shift / Ctrl', 'Clic'], description: 'Selección aditiva de múltiples vértices' },
        { keys: ['Arrastrar nodo'], description: 'Mueve el vértice con snap a grillas, guías y nodos' },
        { keys: ['Shift', 'Arrastrar tirador'], description: 'Fuerza el ángulo del tirador a pasos de 45°' },
        { keys: ['Ctrl', 'Arrastre a extremo'], description: 'Suelda y cierra el contorno al unir extremos opuestos' },
        { keys: ['Alt', 'Arrastre en vacío'], description: 'Selección de nodos por área en modo toque/intersección' },
        { keys: ['Doble clic en segmento'], description: 'Inserta un nuevo vértice en el punto exacto de la curva' },
        { keys: ['Doble clic en nodo'], description: 'Alterna el tipo de nodo (asimétrico ↔ uniforme ↔ simétrico)' },
        { keys: ['Ctrl', 'J'], description: 'Une y suelda vértices seleccionados coincidentes eliminando segmentos espurios' },
        { keys: ['Mini-HUD'], description: 'Alterna micro-Bounding Box entre Mover, Escalar y Rotar (subselección N ≥ 2)' },
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
        { keys: ['Doble clic icono (Z)'], description: 'Ajuste automático de zoom al área de trabajo (Fit to Screen)' },
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
    smartFill: {
      title: 'Relleno Inteligente',
      toolId: 'smartFill',
      icon: ToolIcons.smartFillTool,
      shortcuts: [
        { keys: ['F'], description: 'Activa la herramienta Relleno Inteligente' },
        { keys: ['Clic'], description: 'Detecta la región cerrada delimitada por trazados superpuestos y genera un nuevo vector <path>' },
        { keys: ['Shift', 'Clic'], description: 'Fusión aditiva secuencial de regiones contiguas' },
        { keys: ['Arrastre'], description: 'Barrido continuo para acumular y unir múltiples regiones' },
        { keys: ['Hover'], description: 'Previsualiza en tiempo real la región poligonal cerrada que se rellenará' },
        { keys: ['Esc'], description: 'Cancela la previsualización y resetea el estado de interacción' },
      ],
    },
    scissors: {
      title: 'Tijeras',
      toolId: 'scissors',
      icon: ToolIcons.scissorsTool,
      shortcuts: [
        { keys: ['C'], description: 'Activa la herramienta Tijeras' },
        { keys: ['Clic en segmento'], description: 'Corta el trazado dividiéndolo en dos vectores independientes' },
        { keys: ['Esc'], description: 'Cancela la operación de corte' },
      ],
    },
    knife: {
      title: 'Cuchilla',
      toolId: 'knife',
      icon: ToolIcons.knifeTool,
      shortcuts: [
        { keys: ['K'], description: 'Activa la herramienta Cuchilla' },
        { keys: ['Arrastre'], description: 'Traza una línea de corte libre que divide los vectores atravesados' },
        { keys: ['Shift', 'Arrastre'], description: 'Corta en línea recta forzada' },
        { keys: ['Esc'], description: 'Cancela el corte' },
      ],
    },
    eraser: {
      title: 'Borrador',
      toolId: 'eraser',
      icon: ToolIcons.eraserTool,
      shortcuts: [
        { keys: ['Shift', 'E'], description: 'Activa la herramienta Borrador vectorial' },
        { keys: ['Arrastre'], description: 'Elimina segmentos vectoriales atravesados' },
        { keys: ['Esc'], description: 'Cancela la operación de borrado' },
      ],
    },
    shapeBuilder: {
      title: 'Creador de Formas',
      toolId: 'shapeBuilder',
      icon: ToolIcons.shapeBuilderTool,
      shortcuts: [
        { keys: ['M'], description: 'Activa la herramienta Creador de Formas' },
        { keys: ['Arrastre'], description: 'Conecta y fusiona regiones vectoriales superpuestas en un único objeto' },
        { keys: ['Alt', 'Arrastre'], description: 'Resta o elimina las regiones atravesadas' },
        { keys: ['Esc'], description: 'Cancela la interacción' },
      ],
    },
    image: {
      title: 'Herramienta Imagen',
      toolId: 'image',
      icon: ToolIcons.imageTool,
      shortcuts: [
        { keys: ['I'], description: 'Activa la herramienta Inserción de Imágenes' },
        { keys: ['Clic'], description: 'Abre el explorador de archivos para importar imagen PNG/JPEG/WebP' },
        { keys: ['Arrastre'], description: 'Define la caja delimitadora y proporciones de la imagen insertada' },
      ],
    },
  };

  private static readonly TOOL_HELP_MAP_EN: Record<string, ToolHelpConfig> = {
    select: {
      title: 'Selection Tool',
      toolId: 'select',
      icon: ToolIcons.selectTool,
      shortcuts: [
        { keys: ['V'], description: 'Activates Selection Tool (switches from any tool)' },
        { keys: ['Mini-HUD'], description: 'Floating pill on bounding box to switch with 1 click: Move, Scale, Rotate' },
        { keys: ['Paused click'], description: 'Cycles modes: Scale → Rotate → Free Distort (Perspective)' },
        { keys: ['D'], description: 'Free Distort / Perspective: Toggles 3x3 homography quad handles' },
        { keys: ['Button ▱'], description: 'Dedicated button in inspector to toggle Free Distortion' },
        { keys: ['Click'], description: 'Selects element under cursor or deselects on empty space' },
        { keys: ['Shift', 'Click'], description: 'Adds or removes element from multiple selection' },
        { keys: ['Drag'], description: 'Moves selected elements on canvas' },
        { keys: ['Ctrl', 'Drag'], description: 'Constrains movement to orthogonal axes (horizontal or vertical)' },
        { keys: ['Alt', 'Drag'], description: 'Duplicates selected elements creating a clone' },
        { keys: ['Empty Drag'], description: 'Area selection via marquee elastic box' },
        { keys: ['Shift', 'Marquee'], description: 'Additive cumulative area selection' },
        { keys: ['Alt', 'Marquee'], description: 'Touch/intersection mode: selects objects intersecting frame' },
        { keys: ['Double click'], description: 'Switches to Node Editing Tool (A)' },
        { keys: ['Corner handle'], description: 'Free scale selected element or group' },
        { keys: ['Shift', 'Scale'], description: 'Proportional scale maintaining aspect ratio' },
        { keys: ['Alt', 'Scale'], description: 'Symmetric scale expanding from center/pivot' },
        { keys: ['Drag'], description: 'Translates selected elements with snap to nodes, edges and guides' },
        { keys: ['Shift', 'Drag'], description: 'Constrains displacement to horizontal or vertical axis' },
        { keys: ['Alt', 'Empty Drag'], description: 'Touch/crossing selection marquee (touch-select)' },
        { keys: ['Shift', 'Drag Handle'], description: 'Proportional scale preserving aspect ratio' },
        { keys: ['Alt', 'Drag Handle'], description: 'Concentric symmetric scale from center' },
        { keys: ['Shift', 'Drag Rotate'], description: 'Constrains rotation angle to 15° multiples' },
        { keys: ['Ctrl+C / Ctrl+V'], description: 'Copy and paste with 15px auto-offset' },
        { keys: ['Ctrl+D'], description: 'Duplicates selected elements instantly' },
        { keys: ['Double click icon (V)'], description: 'Opens numeric transformation dialog (X/Y position and displacement)' },
        { keys: ['Del / Backspace'], description: 'Deletes selected elements' },
      ],
    },
    node: {
      title: 'Node Editing',
      toolId: 'node',
      icon: ToolIcons.nodeTool,
      shortcuts: [
        { keys: ['A'], description: 'Activates Node Editing Tool' },
        { keys: ['Click on node'], description: 'Selects vertex and displays Bézier handles' },
        { keys: ['Shift / Ctrl', 'Click'], description: 'Additive selection of multiple vertices' },
        { keys: ['Drag node'], description: 'Moves vertex with snap to grids, guides and nodes' },
        { keys: ['Shift', 'Drag handle'], description: 'Constrains handle angle to 45° steps' },
        { keys: ['Ctrl', 'Drag to end'], description: 'Welds and closes contour upon joining opposite ends' },
        { keys: ['Alt', 'Empty Drag'], description: 'Area node selection in touch/intersection mode' },
        { keys: ['Double click on segment'], description: 'Inserts a new vertex at exact curve position' },
        { keys: ['Double click on node'], description: 'Toggles node type (asymmetric ↔ smooth ↔ symmetric)' },
        { keys: ['Ctrl', 'J'], description: 'Joins and welds coincident selected vertices removing zero-length segments' },
        { keys: ['Mini-HUD'], description: 'Toggles micro-Bounding Box between Move, Scale and Rotate (N ≥ 2)' },
        { keys: ['Del / Backspace'], description: 'Deletes selected nodes preserving stroke' },
      ],
    },
    pen: {
      title: 'Bézier Pen',
      toolId: 'pen',
      icon: ToolIcons.penTool,
      shortcuts: [
        { keys: ['Click'], description: 'Adds a straight vertex (sharp cusp node without handles)' },
        { keys: ['Click + Drag'], description: 'Extracts tangential handles to create smooth curves' },
        { keys: ['Alt', 'Drag handle'], description: 'Breaks node tangency (asymmetric handle)' },
        { keys: ['Click on start'], description: 'Closes contour completing the path' },
        { keys: ['Enter / Double click'], description: 'Finishes path leaving it open' },
        { keys: ['Escape'], description: 'Cancels active drawing path' },
      ],
    },
    polyline: {
      title: 'Polyline',
      toolId: 'polyline',
      icon: ToolIcons.polylineTool,
      shortcuts: [
        { keys: ['Click'], description: 'Adds a new vertex with pure straight segment' },
        { keys: ['Click on start'], description: 'Closes polyline transforming it into polygon' },
        { keys: ['Enter / Double click'], description: 'Finishes open polygonal path' },
        { keys: ['Escape'], description: 'Cancels current drawing' },
      ],
    },
    line: {
      title: 'Straight Line',
      toolId: 'line',
      icon: ToolIcons.lineTool,
      shortcuts: [
        { keys: ['Click + Drag'], description: 'Draws a native <line> straight segment' },
        { keys: ['Shift', 'Drag'], description: 'Constrains angle to 45° multiples (horizontal/vertical/diagonal)' },
        { keys: ['Space while dragging'], description: 'Repositions entire line on screen without altering length' },
      ],
    },
    rect: {
      title: 'Rectangle',
      toolId: 'rect',
      icon: ToolIcons.rectTool,
      shortcuts: [
        { keys: ['Click + Drag'], description: 'Draws a free rectangle from opposite corner' },
        { keys: ['Shift', 'Drag'], description: 'Locks 1:1 aspect ratio (perfect square)' },
        { keys: ['Alt', 'Drag'], description: 'Projects symmetrically expanding from geometric center' },
        { keys: ['Space while dragging'], description: 'Repositions shape on screen without losing its size' },
      ],
    },
    circle: {
      title: 'Circle',
      toolId: 'circle',
      icon: ToolIcons.circleTool,
      shortcuts: [
        { keys: ['Click + Drag'], description: 'Draws a native <circle> (1:1 intrinsic)' },
        { keys: ['Alt', 'Drag'], description: 'Expands circle concentrically from center' },
        { keys: ['Space while dragging'], description: 'Repositions circle on screen without altering radius' },
      ],
    },
    ellipse: {
      title: 'Ellipse',
      toolId: 'ellipse',
      icon: ToolIcons.ellipseTool,
      shortcuts: [
        { keys: ['Click + Drag'], description: 'Draws a free parametric ellipse from opposite corner' },
        { keys: ['Shift', 'Drag'], description: 'Locks 1:1 aspect ratio (perfect circle)' },
        { keys: ['Alt', 'Drag'], description: 'Projects symmetrically expanding from geometric center' },
        { keys: ['Space while dragging'], description: 'Repositions ellipse on screen without losing its size' },
      ],
    },
    polygon: {
      title: 'Regular Polygon',
      toolId: 'polygon',
      icon: ToolIcons.polygonTool,
      shortcuts: [
        { keys: ['Click + Drag'], description: 'Draws a regular polygon with configured side count' },
        { keys: ['Alt', 'Drag'], description: 'Projects polygon expanding from center' },
        { keys: ['Space while dragging'], description: 'Repositions polygon on screen without altering size' },
      ],
    },
    star: {
      title: 'Parametric Star',
      toolId: 'star',
      icon: ToolIcons.starTool,
      shortcuts: [
        { keys: ['Click + Drag'], description: 'Draws star with configured points and inner radius' },
        { keys: ['Alt', 'Drag'], description: 'Projects star expanding from center' },
        { keys: ['Space while dragging'], description: 'Repositions star on screen without altering size' },
      ],
    },
    stroke: {
      title: 'Stroke Tool',
      toolId: 'stroke',
      icon: ToolIcons.strokeTool,
      shortcuts: [
        { keys: ['Click on vector'], description: 'Inspects and edits width, line caps, joins and dashes' },
        { keys: ['Click on empty space'], description: 'Deselects inspected vector' },
      ],
    },
    addVertex: {
      title: 'Add Vertex',
      toolId: 'addVertex',
      icon: ToolIcons.addVertexTool,
      shortcuts: [
        { keys: ['Click on path'], description: 'Inserts new node maintaining exact analytical curvature' },
      ],
    },
    canvas: {
      title: 'Canvas & ViewBox',
      toolId: 'canvas',
      icon: ToolIcons.canvasTool,
      shortcuts: [
        { keys: ['Drag borders'], description: 'Interactively resizes drawing ViewBox' },
        { keys: ['Shift', 'Drag'], description: 'Resizes maintaining aspect ratio' },
        { keys: ['Alt', 'Drag'], description: 'Resizes symmetrically from center' },
      ],
    },
    zoom: {
      title: 'Zoom & Pan',
      toolId: 'zoom',
      icon: ToolIcons.zoomTool,
      shortcuts: [
        { keys: ['Click'], description: 'Increases zoom level centered on cursor' },
        { keys: ['Alt', 'Click'], description: 'Decreases zoom level' },
        { keys: ['Drag'], description: 'Window zoom to marquee area' },
        { keys: ['Space', 'Drag'], description: 'Free pan across workspace (also middle mouse button)' },
        { keys: ['Ctrl', 'Mouse Wheel'], description: 'Continuous zoom in or out' },
        { keys: ['Shift', 'Mouse Wheel'], description: 'Horizontal canvas scrolling' },
        { keys: ['Double click icon (Z)'], description: 'Auto-fit zoom to workspace (Fit to Screen)' },
      ],
    },
    ruler: {
      title: 'Rulers & Guides',
      toolId: 'ruler',
      icon: ToolIcons.rulersVisibility,
      shortcuts: [
        { keys: ['Drag from ruler'], description: 'Creates new horizontal or vertical metric guide' },
        { keys: ['Ctrl / Shift', 'Drag'], description: 'Constrains guide rotation to 15° steps' },
        { keys: ['Double click corner'], description: 'Resets origin (0,0) to ViewBox corner' },
        { keys: ['Drag corner'], description: 'Sets custom coordinate origin (0,0)' },
        { keys: ['Double click guide'], description: 'Opens inspector to configure position and angle' },
        { keys: ['Del / Backspace'], description: 'Deletes selected guide line' },
      ],
    },
    smartFill: {
      title: 'Smart Fill Tool',
      toolId: 'smartFill',
      icon: ToolIcons.smartFillTool,
      shortcuts: [
        { keys: ['F'], description: 'Activates Smart Fill Tool' },
        { keys: ['Click'], description: 'Detects the enclosed region bounded by overlapping paths and generates a new vector <path>' },
        { keys: ['Shift', 'Click'], description: 'Additive sequential fusion of adjacent regions' },
        { keys: ['Drag'], description: 'Continuous sweep to accumulate and merge multiple planar regions' },
        { keys: ['Hover'], description: 'Real-time preview of the candidate enclosed region before clicking' },
        { keys: ['Esc'], description: 'Cancels the active region preview and resets interaction state' },
      ],
    },
    scissors: {
      title: 'Scissors',
      toolId: 'scissors',
      icon: ToolIcons.scissorsTool,
      shortcuts: [
        { keys: ['C'], description: 'Activates Scissors Tool' },
        { keys: ['Click on segment'], description: 'Splits path into two independent vectors at clicked point' },
        { keys: ['Esc'], description: 'Cancels slicing operation' },
      ],
    },
    knife: {
      title: 'Knife',
      toolId: 'knife',
      icon: ToolIcons.knifeTool,
      shortcuts: [
        { keys: ['K'], description: 'Activates Knife Tool' },
        { keys: ['Drag'], description: 'Draws freehand cut line slicing through intersected shapes' },
        { keys: ['Shift', 'Drag'], description: 'Forces straight cutting line' },
        { keys: ['Esc'], description: 'Cancels active cut' },
      ],
    },
    eraser: {
      title: 'Eraser',
      toolId: 'eraser',
      icon: ToolIcons.eraserTool,
      shortcuts: [
        { keys: ['Shift', 'E'], description: 'Activates Vector Eraser Tool' },
        { keys: ['Drag'], description: 'Erases intersected vector segments along stroke path' },
        { keys: ['Esc'], description: 'Cancels eraser interaction' },
      ],
    },
    shapeBuilder: {
      title: 'Shape Builder',
      toolId: 'shapeBuilder',
      icon: ToolIcons.shapeBuilderTool,
      shortcuts: [
        { keys: ['M'], description: 'Activates Shape Builder Tool' },
        { keys: ['Drag'], description: 'Connects and merges overlapping vector regions into unified geometry' },
        { keys: ['Alt', 'Drag'], description: 'Subtracts or deletes crossed candidate regions' },
        { keys: ['Esc'], description: 'Cancels interaction' },
      ],
    },
    image: {
      title: 'Image Tool',
      toolId: 'image',
      icon: ToolIcons.imageTool,
      shortcuts: [
        { keys: ['I'], description: 'Activates Image Ingestion Tool' },
        { keys: ['Click'], description: 'Opens system file browser to import PNG/JPEG/WebP image' },
        { keys: ['Drag'], description: 'Defines target placement and bounding box on canvas' },
      ],
    },
  };

  private static readonly TOOL_HELP_MAP_ZH: Record<string, ToolHelpConfig> = {
    select: {
      title: '选择工具',
      toolId: 'select',
      icon: ToolIcons.selectTool,
      shortcuts: [
        { keys: ['V'], description: '激活选择工具（从任意工具快速切换）' },
        { keys: ['Mini-HUD'], description: '定界框上方悬浮胶囊：一键切换 移动、缩放、旋转 模式' },
        { keys: ['停顿单击'], description: '循环切换模式：缩放 → 旋转 → 自由变形（透视）' },
        { keys: ['D'], description: '自由变形 / 透视：切换 3x3 单应性四边形控制手柄' },
        { keys: ['▱ 按钮'], description: '检查器中的专用按钮，切换自由变形' },
        { keys: ['单击'], description: '选中光标下的元素，或在空白处单击取消选择' },
        { keys: ['Shift', '单击'], description: '添加到多选或从当前选择中移除' },
        { keys: ['拖拽'], description: '在画布上移动选中的元素' },
        { keys: ['Ctrl', '拖拽'], description: '锁定正交方向移动（水平或垂直）' },
        { keys: ['Alt', '拖拽'], description: '复制选中元素生成克隆副本' },
        { keys: ['空白处拖拽'], description: '框选：通过弹性矩形框进行区域选择' },
        { keys: ['Shift', '框选'], description: '累加框选：扩展当前选中集合' },
        { keys: ['Alt', '框选'], description: '相交模式：选中所有与选框相交的对象' },
        { keys: ['双击'], description: '切换至节点编辑工具 (A)' },
        { keys: ['角部手柄'], description: '自由缩放选中的元素或图层组' },
        { keys: ['Shift', '缩放'], description: '等比缩放，锁定宽高比' },
        { keys: ['Alt', '缩放'], description: '以中心/原点为基准对称缩放' },
        { keys: ['拖拽'], description: '移动选中元素，支持吸附到节点、边与参考线' },
        { keys: ['Shift', '拖拽'], description: '限制仅在水平或垂直轴到位移' },
        { keys: ['Alt', '空白处拖拽'], description: '相交框选（触摸选择模式）' },
        { keys: ['Shift', '拖拽手柄'], description: '等比缩放，锁定长宽比' },
        { keys: ['Alt', '拖拽手柄'], description: '以中心为基准同心对称缩放' },
        { keys: ['Shift', '拖拽旋转'], description: '强制旋转角度为 15° 的倍数' },
        { keys: ['Ctrl+C / Ctrl+V'], description: '复制并粘贴（自动位移 15px）' },
        { keys: ['Ctrl+D'], description: '原地即时复制选中元素' },
        { keys: ['双击工具图标 (V)'], description: '打开精确数值变换对话框（X/Y 坐标与位移）' },
        { keys: ['Del / Backspace'], description: '删除选中的元素' },
      ],
    },
    node: {
      title: '节点编辑',
      toolId: 'node',
      icon: ToolIcons.nodeTool,
      shortcuts: [
        { keys: ['A'], description: '激活节点编辑工具' },
        { keys: ['单击节点'], description: '选中顶点并显示贝塞尔控制手柄' },
        { keys: ['Shift / Ctrl', '单击'], description: '追加多选顶点' },
        { keys: ['拖拽节点'], description: '移动顶点，吸附至网格、参考线与临近节点' },
        { keys: ['Shift', '拖拽手柄'], description: '强制手柄角度以 45° 步长对齐' },
        { keys: ['Ctrl', '拖拽至端点'], description: '闭合连接：将端点重合焊接闭合路径' },
        { keys: ['Alt', '空白处拖拽'], description: '相交框选顶点' },
        { keys: ['双击线段'], description: '在曲线精确点击处插入新顶点' },
        { keys: ['双击节点'], description: '切换节点类型（尖角 ↔ 平滑 ↔ 对称）' },
        { keys: ['Ctrl', 'J'], description: '合并并焊接重合的选中顶点，消除无效线段' },
        { keys: ['Mini-HUD'], description: '多顶点选中时 (N ≥ 2) 切换定界框为 移动、缩放 或 旋转' },
        { keys: ['Del / Backspace'], description: '删除选中的节点并保持路径连续' },
      ],
    },
    pen: {
      title: '贝塞尔钢笔',
      toolId: 'pen',
      icon: ToolIcons.penTool,
      shortcuts: [
        { keys: ['单击'], description: '添加尖角顶点（无手柄的锐利锚点）' },
        { keys: ['单击 + 拖拽'], description: '拉出切线手柄以创建平滑贝塞尔曲线' },
        { keys: ['Alt', '拖拽手柄'], description: '折断手柄联动关系（转换为非对称角节点）' },
        { keys: ['单击起点'], description: '闭合轮廓，完成当前路径绘制' },
        { keys: ['Enter / 双击'], description: '结束绘制，保持开放路径' },
        { keys: ['Escape'], description: '取消当前正在绘制的路径' },
      ],
    },
    polyline: {
      title: '折线工具',
      toolId: 'polyline',
      icon: ToolIcons.polylineTool,
      shortcuts: [
        { keys: ['单击'], description: '添加新顶点，生成纯直线段' },
        { keys: ['单击起点'], description: '闭合折线，将其转换为多边形' },
        { keys: ['Enter / 双击'], description: '结束绘制，保留开放折线' },
        { keys: ['Escape'], description: '取消当前绘制' },
      ],
    },
    line: {
      title: '直线工具',
      toolId: 'line',
      icon: ToolIcons.lineTool,
      shortcuts: [
        { keys: ['单击 + 拖拽'], description: '绘制原生 SVG <line> 直线段' },
        { keys: ['Shift', '拖拽'], description: '锁定角度为 45° 倍数（水平/垂直/对角线）' },
        { keys: ['空格键 (拖拽中)'], description: '在屏幕上平移整条线的位置而不改变其长度' },
      ],
    },
    rect: {
      title: '矩形工具',
      toolId: 'rect',
      icon: ToolIcons.rectTool,
      shortcuts: [
        { keys: ['单击 + 拖拽'], description: '从对角起点自由绘制矩形' },
        { keys: ['Shift', '拖拽'], description: '锁定 1:1 比例（绘制正方形）' },
        { keys: ['Alt', '拖拽'], description: '从几何中心向外对称展开绘制' },
        { keys: ['空格键 (拖拽中)'], description: '平移矩形位置而不改变其实时尺寸' },
      ],
    },
    circle: {
      title: '圆形工具',
      toolId: 'circle',
      icon: ToolIcons.circleTool,
      shortcuts: [
        { keys: ['单击 + 拖拽'], description: '绘制原生 SVG <circle> 圆形（固定 1:1）' },
        { keys: ['Alt', '拖拽'], description: '从圆心向外同心展开绘制' },
        { keys: ['空格键 (拖拽中)'], description: '平移圆心位置而不改变其半径' },
      ],
    },
    ellipse: {
      title: '椭圆工具',
      toolId: 'ellipse',
      icon: ToolIcons.ellipseTool,
      shortcuts: [
        { keys: ['单击 + 拖拽'], description: '从对角起点自由绘制参数化椭圆' },
        { keys: ['Shift', '拖拽'], description: '锁定 1:1 比例（绘制正圆）' },
        { keys: ['Alt', '拖拽'], description: '从几何中心向外对称展开绘制' },
        { keys: ['空格键 (拖拽中)'], description: '平移椭圆位置而不改变其实时尺寸' },
      ],
    },
    polygon: {
      title: '正多边形',
      toolId: 'polygon',
      icon: ToolIcons.polygonTool,
      shortcuts: [
        { keys: ['单击 + 拖拽'], description: '根据设定的边数绘制正多边形' },
        { keys: ['Alt', '拖拽'], description: '从几何中心向外展开绘制多边形' },
        { keys: ['空格键 (拖拽中)'], description: '平移多边形位置而不改变其尺寸' },
      ],
    },
    star: {
      title: '参数化星形',
      toolId: 'star',
      icon: ToolIcons.starTool,
      shortcuts: [
        { keys: ['单击 + 拖拽'], description: '根据配置的角数与内外半径比绘制星形' },
        { keys: ['Alt', '拖拽'], description: '从几何中心向外展开绘制星形' },
        { keys: ['空格键 (拖拽中)'], description: '平移星形位置而不改变其尺寸' },
      ],
    },
    stroke: {
      title: '描边工具',
      toolId: 'stroke',
      icon: ToolIcons.strokeTool,
      shortcuts: [
        { keys: ['单击矢量图形'], description: '检查并编辑描边粗细、端点样式、拐角与虚线设置' },
        { keys: ['空白处单击'], description: '取消对当前矢量描边的检查' },
      ],
    },
    addVertex: {
      title: '添加顶点',
      toolId: 'addVertex',
      icon: ToolIcons.addVertexTool,
      shortcuts: [
        { keys: ['单击路径'], description: '在保持精确解析曲率的同时插入新节点' },
      ],
    },
    canvas: {
      title: '画布与 ViewBox',
      toolId: 'canvas',
      icon: ToolIcons.canvasTool,
      shortcuts: [
        { keys: ['拖拽边框'], description: '交互式调整 SVG ViewBox 视口尺寸' },
        { keys: ['Shift', '拖拽'], description: '保持纵横比等比缩放画布' },
        { keys: ['Alt', '拖拽'], description: '以画布中心为基准对称缩放' },
      ],
    },
    zoom: {
      title: '缩放与平移',
      toolId: 'zoom',
      icon: ToolIcons.zoomTool,
      shortcuts: [
        { keys: ['单击'], description: '以光标为中心放大视图' },
        { keys: ['Alt', '单击'], description: '缩小视图' },
        { keys: ['拖拽'], description: '框选区域快速放大至选框窗口' },
        { keys: ['空格', '拖拽'], description: '自由平移画布工作区（亦可使用鼠标中键）' },
        { keys: ['Ctrl', '鼠标滚轮'], description: '连续平滑放大 / 缩小视图' },
        { keys: ['Shift', '鼠标滚轮'], description: '水平平移画布' },
        { keys: ['双击工具图标 (Z)'], description: '缩放以适应工作区（适屏显示）' },
      ],
    },
    ruler: {
      title: '标尺与参考线',
      toolId: 'ruler',
      icon: ToolIcons.rulersVisibility,
      shortcuts: [
        { keys: ['从标尺拖拽'], description: '创建新的水平或垂直度量参考线' },
        { keys: ['Ctrl / Shift', '拖拽'], description: '将参考线旋转角度锁定为 15° 的倍数' },
        { keys: ['双击原点角部'], description: '将坐标原点 (0,0) 重置为 ViewBox 左上角' },
        { keys: ['从原点角拖拽'], description: '自定义并设定全新的全局坐标原点 (0,0)' },
        { keys: ['双击参考线'], description: '打开检查器面板以精确定位坐标与旋转角度' },
        { keys: ['Del / Backspace'], description: '删除选中的参考线' },
      ],
    },
    smartFill: {
      title: '智能填充',
      toolId: 'smartFill',
      icon: ToolIcons.smartFillTool,
      shortcuts: [
        { keys: ['F'], description: '激活智能填充工具' },
        { keys: ['单击'], description: '探测重叠路径封闭区域并生成独立的新矢量 <path>' },
        { keys: ['Shift', '单击'], description: '连续追加合并相邻封闭区域' },
        { keys: ['拖拽'], description: '画笔式连续扫掠以累加并合并多个区域' },
        { keys: ['悬停'], description: '实时预览即将被填充的多边形闭合区域' },
        { keys: ['Esc'], description: '取消预览并重置交互状态' },
      ],
    },
    scissors: {
      title: '剪刀工具',
      toolId: 'scissors',
      icon: ToolIcons.scissorsTool,
      shortcuts: [
        { keys: ['C'], description: '激活剪刀工具' },
        { keys: ['单击线段'], description: '精确切断路径，将其拆分为两条独立矢量路径' },
        { keys: ['Esc'], description: '取消剪切操作' },
      ],
    },
    knife: {
      title: '美工刀',
      toolId: 'knife',
      icon: ToolIcons.knifeTool,
      shortcuts: [
        { keys: ['K'], description: '激活美工刀工具' },
        { keys: ['拖拽'], description: '自由划出切割线，分割穿过的所有矢量图形' },
        { keys: ['Shift', '拖拽'], description: '锁定以强制直线形式切割' },
        { keys: ['Esc'], description: '取消切割' },
      ],
    },
    eraser: {
      title: '橡皮擦',
      toolId: 'eraser',
      icon: ToolIcons.eraserTool,
      shortcuts: [
        { keys: ['Shift', 'E'], description: '激活矢量橡皮擦工具' },
        { keys: ['拖拽'], description: '擦除并剔除穿过的矢量线段与区域' },
        { keys: ['Esc'], description: '取消擦除操作' },
      ],
    },
    shapeBuilder: {
      title: '形状生成器',
      toolId: 'shapeBuilder',
      icon: ToolIcons.shapeBuilderTool,
      shortcuts: [
        { keys: ['M'], description: '激活形状生成器工具' },
        { keys: ['拖拽'], description: '划过连接并合并重叠的矢量候选区域为统一几何体' },
        { keys: ['Alt', '拖拽'], description: '划过减去或删除穿过的候选区域' },
        { keys: ['Esc'], description: '取消交互' },
      ],
    },
    image: {
      title: '图像工具',
      toolId: 'image',
      icon: ToolIcons.imageTool,
      shortcuts: [
        { keys: ['I'], description: '激活图像导入工具' },
        { keys: ['单击'], description: '打开系统文件选择器以导入 PNG/JPEG/WebP 图片' },
        { keys: ['拖拽'], description: '在画布上定义插入图像的目标定界框与长宽尺寸' },
      ],
    },
  };

  /**
   * Renderiza el componente de ayuda rápida en el contenedor especificado.
   */
  public static render(container: HTMLElement, activeTool: string, isGuideOrRuler: boolean = false): void {
    const lang = I18nService.getLanguage();
    let map = this.TOOL_HELP_MAP_EN;
    if (lang === 'es') map = this.TOOL_HELP_MAP_ES;
    else if (lang === 'zh-cn') map = this.TOOL_HELP_MAP_ZH;

    const key = isGuideOrRuler ? 'ruler' : (map[activeTool] ? activeTool : 'select');
    const config = map[key] || map.select;

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
    let headerPrefix = 'Quick Help: ';
    if (lang === 'es') headerPrefix = 'Ayuda Rápida: ';
    else if (lang === 'zh-cn') headerPrefix = '快捷帮助: ';
    else if (lang === 'de') headerPrefix = 'Schnellhilfe: ';
    else if (lang === 'fr') headerPrefix = 'Aide rapide : ';
    else if (lang === 'ru') headerPrefix = 'Краткая справка: ';
    else if (lang === 'ja') headerPrefix = 'クイックヘルプ: ';

    container.innerHTML = `
      <div class="panel-section quick-help-section">
        <div class="panel-title quick-help-header" id="btn-toggle-quick-help" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; margin-bottom: 0; user-select: none;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="quick-help-tool-icon">${config.icon}</span>
            <span>${headerPrefix}${config.title}</span>
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

  public static get TOOL_HELP_MAP(): Record<string, ToolHelpConfig> {
    return QuickHelpInspector.TOOL_HELP_MAP_ES;
  }
}

