import * as fs from 'fs';
import * as path from 'path';
import {
  ToolCatalogManifest,
  TOOL_CATALOG_MANIFEST,
  ToolType,
} from '../src/webview/tools/ToolCatalogManifest.js';
import { ToolIcons } from '../src/webview/icons/ToolIcons.js';
import { QuickHelpInspector } from '../src/webview/ui/inspectors/QuickHelpInspector.js';

export async function runToolCatalogManifestTests(): Promise<boolean> {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.error(`  ✗ ${message}`);
      failed++;
    }
  }

  console.log('--- Test Suite 89: Manifiesto Único de Herramientas Tipado (SSOT) ---');

  // 1. Integridad y Cobertura Completa de ToolType
  const expectedToolTypes: ToolType[] = [
    'select',
    'node',
    'pen',
    'stroke',
    'line',
    'polyline',
    'rect',
    'circle',
    'ellipse',
    'polygon',
    'star',
    'scissors',
    'knife',
    'eraser',
    'smartFill',
    'shapeBuilder',
    'image',
    'addVertex',
    'canvas',
    'zoom',
  ];

  assert(
    TOOL_CATALOG_MANIFEST.length === expectedToolTypes.length,
    `El catálogo contiene exactamente ${expectedToolTypes.length} herramientas canónicas (encontradas: ${TOOL_CATALOG_MANIFEST.length})`
  );

  const missingTypes = expectedToolTypes.filter(
    (t) => !TOOL_CATALOG_MANIFEST.some((entry) => entry.id === t)
  );
  assert(missingTypes.length === 0, `Todas las variantes de ToolType están catalogadas en SSOT (faltantes: ${missingTypes.join(', ') || 'ninguna'})`);

  // 2. Validación de Contratos y Metadatos
  let metadataValid = true;
  for (const tool of TOOL_CATALOG_MANIFEST) {
    if (
      !tool.id ||
      !tool.name ||
      !tool.category ||
      !tool.primaryShortcut ||
      !tool.iconName ||
      !tool.status ||
      !tool.inspectorId ||
      !tool.description
    ) {
      metadataValid = false;
      console.error(`  Herramienta con metadatos incompletos: ${tool.id}`);
    }
  }
  assert(metadataValid, 'Cada herramienta posee id, name, category, shortcut, iconName, status, inspectorId y description');

  // 3. Resolución de Iconos Vectoriales
  let iconsValid = true;
  for (const tool of TOOL_CATALOG_MANIFEST) {
    const iconSvg = (ToolIcons as any)[tool.iconName];
    if (typeof iconSvg !== 'string' || !iconSvg.includes('<svg')) {
      iconsValid = false;
      console.error(`  Icono inválido o inexistente para ${tool.id}: ${tool.iconName}`);
    }
  }
  assert(iconsValid, 'El 100% de los iconos declarados en el catálogo resuelven a SVG válidos en ToolIcons');

  // 4. Búsqueda y Resolución Tipada
  const selectTool = ToolCatalogManifest.getTool('select');
  assert(selectTool?.primaryShortcut === 'V' && selectTool.inspectorId === 'GeometryInspector', 'getTool("select") retorna datos tipados exactos');

  const nodeToolByAlt = ToolCatalogManifest.findByShortcut('N');
  assert(nodeToolByAlt?.id === 'node', 'findByShortcut("N") resuelve atajo alternativo a herramienta "node"');

  const eraserByShift = ToolCatalogManifest.findByShortcut('Shift+E');
  assert(eraserByShift?.id === 'eraser', 'findByShortcut("Shift+E") resuelve atajo compuesto a herramienta "eraser"');

  const shapeBuilderByShift = ToolCatalogManifest.findByShortcut('Shift+M');
  assert(shapeBuilderByShift?.id === 'shapeBuilder', 'findByShortcut("Shift+M") resuelve atajo compuesto a herramienta "shapeBuilder"');

  // 5. Generación de Tabla de Manual de Usuario en Markdown
  const markdownTable = ToolCatalogManifest.generateManualMarkdownTable();
  assert(
    markdownTable.includes('| Herramienta | ID | Atajo Principal |') && markdownTable.split('\n').length >= 22,
    'generateManualMarkdownTable() genera tabla estructurada Markdown con encabezados y 20 filas'
  );
  assert(
    markdownTable.includes('`select`') &&
      markdownTable.includes('`shapeBuilder`') &&
      markdownTable.includes('`smartFill`'),
    'La tabla Markdown incluye identificadores de herramientas de corte, relleno y construcción'
  );

  // 6. Integración con QuickHelpInspector
  const mockContainer = {
    innerHTML: '',
    querySelector: () => null,
  } as unknown as HTMLElement;

  try {
    QuickHelpInspector.render(mockContainer, 'star');
    assert(mockContainer.innerHTML.includes('quick-help-section'), 'QuickHelpInspector.render renderiza sección de ayuda utilizando el catálogo');
  } catch (err: any) {
    assert(false, `QuickHelpInspector.render falló: ${err?.message}`);
  }

  console.log(`Suite 89 Completada: ${passed} pasados, ${failed} fallados.`);
  return failed === 0;
}

if (require.main === module) {
  runToolCatalogManifestTests().then((ok) => {
    if (!ok) process.exit(1);
  });
}
