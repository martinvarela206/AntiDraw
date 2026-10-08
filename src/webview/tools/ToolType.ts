/**
 * CAPA L2: Dominio de Tipos de Herramientas Canónicas de AntiDraw (ToolType)
 *
 * Define el identificador canónico de cada herramienta interactiva soportada
 * en el espacio de edición vectorial.
 *
 * Mantenido como tipo de dominio puro para desacoplar el motor y manejadores
 * de herramientas de cualquier componente visual de UI (Toolbar, paneles, etc.).
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
