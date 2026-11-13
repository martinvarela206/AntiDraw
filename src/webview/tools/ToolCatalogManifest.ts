/**
 * CAPA L2: Manifiesto Único y Fuente de Verdad Canónica de Herramientas (SSOT - ToolCatalogManifest)
 *
 * Centraliza la declaración tipada de todas las herramientas de AntiDraw:
 * - Identificador único de dominio (ToolType)
 * - Nombre legible y descripción funcional
 * - Categoría taxonómica (selección, vector, forma, topología, utilidad)
 * - Atajo de teclado principal y atajos alternativos internacionales
 * - Icono vectorial asociado en ToolIcons / ICONS
 * - Inspector de propiedades primario
 * - Estado de implementación funcional (implemented, experimental, planned)
 *
 * Esta fuente única nutre a:
 * 1. QuickHelpInspector (cheatsheets dinámicos de teclado y modificadores).
 * 2. KeymapRegistry (registro formal de eventos de teclado y accesibilidad).
 * 3. Documentación, especificaciones y tablas del manual de usuario sin divergencias.
 */

import { ToolType } from './ToolType.js';

export type ToolCategory = 'selection' | 'vector' | 'shape' | 'topology' | 'utility';
export type ToolFunctionalStatus = 'implemented' | 'experimental' | 'planned';

export interface ToolCatalogEntry {
  readonly id: ToolType;
  readonly name: string;
  readonly category: ToolCategory;
  readonly primaryShortcut: string;
  readonly alternativeShortcuts: readonly string[];
  readonly iconName: string;
  readonly status: ToolFunctionalStatus;
  readonly inspectorId: string;
  readonly description: string;
  readonly docSection?: string;
}

export const TOOL_CATALOG_MANIFEST: readonly ToolCatalogEntry[] = [
  // --- SELECCIÓN Y EDICIÓN ESTRUCTURAL ---
  {
    id: 'select',
    name: 'Selección y Transformación',
    category: 'selection',
    primaryShortcut: 'V',
    alternativeShortcuts: [],
    iconName: 'selectTool',
    status: 'implemented',
    inspectorId: 'GeometryInspector',
    description: 'Selecciona, traslada, rota, escala y deforma elementos vectoriales individualmente o en lote con soporte para Objeto Clave.',
    docSection: '§2.1 Herramienta Selección',
  },
  {
    id: 'node',
    name: 'Edición de Nodos y Curvas',
    category: 'selection',
    primaryShortcut: 'A',
    alternativeShortcuts: ['N'],
    iconName: 'nodeTool',
    status: 'implemented',
    inspectorId: 'NodeInspector',
    description: 'Edición quirúrgica de vértices, manecillas Bézier (handleIn/handleOut), conversión de tipos de nodo y unión con Ctrl+J.',
    docSection: '§2.2 Herramienta Nodos',
  },

  // --- TRAZADO VECTORIAL Y DIBUJO ---
  {
    id: 'pen',
    name: 'Pluma Bézier',
    category: 'vector',
    primaryShortcut: 'P',
    alternativeShortcuts: [],
    iconName: 'penTool',
    status: 'implemented',
    inspectorId: 'StrokeInspector',
    description: 'Trazado determinista de curvas cúbicas y segmentos rectos con colocación interactiva de puntos de anclaje y tangentes.',
    docSection: '§2.3 Herramienta Pluma',
  },
  {
    id: 'stroke',
    name: 'Trazo Libre y Espina Dorsal',
    category: 'vector',
    primaryShortcut: 'T',
    alternativeShortcuts: [],
    iconName: 'strokeTool',
    status: 'implemented',
    inspectorId: 'StrokeInspector',
    description: 'Dibujo a mano alzada con suavizado Schneider C1, perfiles de grosor variable w(t) y modulación multi-armónica.',
    docSection: '§2.4 Herramienta Trazo Libre',
  },
  {
    id: 'polyline',
    name: 'Polilínea Ortogonal y Abierta',
    category: 'vector',
    primaryShortcut: 'Y',
    alternativeShortcuts: [],
    iconName: 'polylineTool',
    status: 'implemented',
    inspectorId: 'StrokeInspector',
    description: 'Creación rápida de cadenas poli-segmentadas continuas con auto-cierre determinista en vértice inicial con Z.',
    docSection: '§2.5 Herramienta Polilínea',
  },
  {
    id: 'line',
    name: 'Segmento de Línea',
    category: 'vector',
    primaryShortcut: '\\',
    alternativeShortcuts: ['Shift+L', '|'],
    iconName: 'lineTool',
    status: 'implemented',
    inspectorId: 'LineInspector',
    description: 'Segmentos rectos paramétricos de dos extremos con ángulo, longitud restringible por Shift (0°, 45°, 90°) y marcadores de flecha.',
    docSection: '§2.6 Herramienta Línea',
  },

  // --- FORMAS PARAMÉTRICAS ---
  {
    id: 'rect',
    name: 'Rectángulo y Esquinas Vivas',
    category: 'shape',
    primaryShortcut: 'M',
    alternativeShortcuts: ['R'],
    iconName: 'rectTool',
    status: 'implemented',
    inspectorId: 'RectInspector',
    description: 'Rectángulos y cuadrados proporcionales con radio independiente o uniforme de 4 esquinas (tl, tr, br, bl).',
    docSection: '§2.7 Herramienta Rectángulo',
  },
  {
    id: 'ellipse',
    name: 'Elipse y Círculo',
    category: 'shape',
    primaryShortcut: 'L',
    alternativeShortcuts: ['E', 'O'],
    iconName: 'ellipseTool',
    status: 'implemented',
    inspectorId: 'EllipseInspector',
    description: 'Elipses y arcos con radios rx/ry, sectores circulares abiertos, cuñas y auto-promoción a <path> puro.',
    docSection: '§2.8 Herramienta Elipse',
  },
  {
    id: 'circle',
    name: 'Círculo Perfecto',
    category: 'shape',
    primaryShortcut: 'O',
    alternativeShortcuts: [],
    iconName: 'ellipseTool',
    status: 'implemented',
    inspectorId: 'EllipseInspector',
    description: 'Primitiva circular de radio isotrópico restringido con arrastre desde centro.',
    docSection: '§2.9 Herramienta Círculo',
  },
  {
    id: 'polygon',
    name: 'Polígono Regular Paramétrico',
    category: 'shape',
    primaryShortcut: 'G',
    alternativeShortcuts: [],
    iconName: 'polygonTool',
    status: 'implemented',
    inspectorId: 'PrimitiveInspector',
    description: 'Polígonos regulares de N lados (3 a 64) ajustables en vivo mediante flechas ↑ / ↓ durante la creación interactiva.',
    docSection: '§2.10 Herramienta Polígono',
  },
  {
    id: 'star',
    name: 'Estrella y Poligrama Paramétrico',
    category: 'shape',
    primaryShortcut: 'S',
    alternativeShortcuts: [],
    iconName: 'starTool',
    status: 'implemented',
    inspectorId: 'PrimitiveInspector',
    description: 'Estrellas regulares con control interactivo de puntas (3 a 64) y profundidad del radio interior modulable con Ctrl.',
    docSection: '§2.11 Herramienta Estrella',
  },

  // --- TOPOLOGÍA Y OPERACIONES DE CONSTRUCCIÓN / CORTE ---
  {
    id: 'scissors',
    name: 'Tijeras de División Vectorial',
    category: 'topology',
    primaryShortcut: 'C',
    alternativeShortcuts: ['K'],
    iconName: 'scissorsTool',
    status: 'implemented',
    inspectorId: 'GeometryInspector',
    description: 'Divide trazados abiertos o cerrados con precisión en el punto de corte exacto sobre el contorno P(t).',
    docSection: '§2.12 Herramienta Tijeras',
  },
  {
    id: 'knife',
    name: 'Cuchilla de Partición Libre',
    category: 'topology',
    primaryShortcut: 'K',
    alternativeShortcuts: [],
    iconName: 'knifeTool',
    status: 'implemented',
    inspectorId: 'GeometryInspector',
    description: 'Secciona vectores seleccionados a lo largo de un trazo de corte recto o libre, bisecando contornos cerrados.',
    docSection: '§2.13 Herramienta Cuchilla',
  },
  {
    id: 'eraser',
    name: 'Borrador Vectorial',
    category: 'topology',
    primaryShortcut: 'Shift+E',
    alternativeShortcuts: [],
    iconName: 'eraserTool',
    status: 'implemented',
    inspectorId: 'GeometryInspector',
    description: 'Sustrae áreas vectoriales interactivamente mediante un disco de radio configurable, recalculando contornos con CAG.',
    docSection: '§2.14 Herramienta Borrador',
  },
  {
    id: 'smartFill',
    name: 'Bote de Relleno Inteligente',
    category: 'topology',
    primaryShortcut: 'F',
    alternativeShortcuts: [],
    iconName: 'smartFillTool',
    status: 'implemented',
    inspectorId: 'AppearanceInspector',
    description: 'Detecta regiones cerradas formadas por la intersección de contornos superpuestos (DCEL) y sintetiza nuevas formas cerradas.',
    docSection: '§2.15 Herramienta Relleno Inteligente',
  },
  {
    id: 'shapeBuilder',
    name: 'Constructor de Formas (Shape Builder)',
    category: 'topology',
    primaryShortcut: 'Shift+M',
    alternativeShortcuts: [],
    iconName: 'shapeBuilderTool',
    status: 'implemented',
    inspectorId: 'GeometryInspector',
    description: 'Fusiona o sustrae interactivamente fragmentos de geometrías superpuestas arrastrando el cursor a través de las regiones candidatas.',
    docSection: '§2.16 Herramienta Constructor de Formas',
  },

  // --- MULTIMEDIA Y UTILIDADES ---
  {
    id: 'image',
    name: 'Imagen y Textura Vectorial',
    category: 'utility',
    primaryShortcut: 'I',
    alternativeShortcuts: [],
    iconName: 'imageTool',
    status: 'implemented',
    inspectorId: 'AppearanceInspector',
    description: 'Ingesta inteligente de imágenes PNG/JPEG/WebP como elementos <image> independientes o rellenos de textura <pattern>.',
    docSection: '§2.17 Herramienta Imagen',
  },
  {
    id: 'addVertex',
    name: 'Inserción Rápida de Vértice',
    category: 'utility',
    primaryShortcut: '+',
    alternativeShortcuts: ['='],
    iconName: 'addVertexTool',
    status: 'implemented',
    inspectorId: 'NodeInspector',
    description: 'Inserta un nuevo vértice de control sobre el segmento seleccionado en la posición exacta del cursor.',
    docSection: '§2.18 Herramienta Insertar Vértice',
  },
  {
    id: 'canvas',
    name: 'Ajuste de Lienzo y Artboard',
    category: 'utility',
    primaryShortcut: 'C',
    alternativeShortcuts: [],
    iconName: 'canvasTool',
    status: 'implemented',
    inspectorId: 'CanvasInspector',
    description: 'Configuración de dimensiones, viewBox, color de fondo, cuadrículas y guías magnéticas del artboard.',
    docSection: '§2.19 Herramienta Lienzo',
  },
  {
    id: 'zoom',
    name: 'Zoom y Lupa Dinámica',
    category: 'utility',
    primaryShortcut: 'Z',
    alternativeShortcuts: [],
    iconName: 'zoomTool',
    status: 'implemented',
    inspectorId: 'CanvasInspector',
    description: 'Amplía o reduce el encuadre del lienzo mediante clics o selección de recuadro, con recienteo instantáneo con Ctrl+0.',
    docSection: '§2.20 Herramienta Zoom',
  },
];

export const TOOL_CATALOG_BY_ID: Readonly<Record<ToolType, ToolCatalogEntry>> = TOOL_CATALOG_MANIFEST.reduce(
  (acc, entry) => {
    acc[entry.id] = entry;
    return acc;
  },
  {} as Record<ToolType, ToolCatalogEntry>
);

export class ToolCatalogManifest {
  /**
   * Obtiene la lista completa de todas las herramientas catalogadas.
   */
  public static getAllTools(): readonly ToolCatalogEntry[] {
    return TOOL_CATALOG_MANIFEST;
  }

  /**
   * Obtiene la especificación tipada de una herramienta por su identificador.
   */
  public static getTool(id: ToolType): ToolCatalogEntry | undefined {
    return TOOL_CATALOG_BY_ID[id];
  }

  /**
   * Localiza una herramienta por cualquiera de sus atajos de teclado asociados.
   */
  public static findByShortcut(shortcutKey: string): ToolCatalogEntry | undefined {
    const keyUpper = shortcutKey.trim().toUpperCase();
    return TOOL_CATALOG_MANIFEST.find(
      (entry) =>
        entry.primaryShortcut.toUpperCase() === keyUpper ||
        entry.alternativeShortcuts.some((alt) => alt.toUpperCase() === keyUpper)
    );
  }

  /**
   * Filtra herramientas por categoría funcional.
   */
  public static getByCategory(category: ToolCategory): ToolCatalogEntry[] {
    return TOOL_CATALOG_MANIFEST.filter((t) => t.category === category);
  }

  /**
   * Filtra herramientas por estado de implementación.
   */
  public static getByStatus(status: ToolFunctionalStatus): ToolCatalogEntry[] {
    return TOOL_CATALOG_MANIFEST.filter((t) => t.status === status);
  }

  /**
   * Genera la tabla canónica en Markdown estructurado para sincronización documental
   * y manuales de usuario (garantía anti-divergencias).
   */
  public static generateManualMarkdownTable(): string {
    const rows = [
      '| # | Herramienta | ID | Atajo Principal | Atajos Alternativos | Categoría | Estado | Inspector | Descripción |',
      '|---|---|---|---|---|---|---|---|---|',
    ];

    TOOL_CATALOG_MANIFEST.forEach((t, idx) => {
      const altStr = t.alternativeShortcuts.length > 0 ? t.alternativeShortcuts.map((s) => `\`${s}\``).join(', ') : '—';
      rows.push(
        `| ${idx + 1} | **${t.name}** | \`${t.id}\` | \`${t.primaryShortcut}\` | ${altStr} | \`${t.category}\` | **${t.status}** | \`${t.inspectorId}\` | ${t.description} |`
      );
    });

    return rows.join('\n');
  }
}
