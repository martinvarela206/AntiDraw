import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';

export function runOrphanModulesArchitectureTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running Architectural Layer Assignment Suite');
  console.log('======================================================');

  let passed = 0;
  function it(desc: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${desc}`);
      throw err;
    }
  }

  const docPath = path.resolve(process.cwd(), 'Docs', 'AntiDraw_Documento_Maestro_Vol1_Estrategia_y_Arquitectura.md');
  const docContent = fs.readFileSync(docPath, 'utf8');

  it('Vol 1 explicitly maps SvgSerializer to Serialization Layer (L1/L2)', () => {
    assert(docContent.includes('SvgSerializer.ts'));
    assert(docContent.includes('CAPA L1 / L2: Serialización Isomórfica y Contenedores'));
  });

  it('Vol 1 explicitly maps AdrwContainer to Container Layer (L1/L2)', () => {
    assert(docContent.includes('AdrwContainer'));
    assert(docContent.includes('container/'));
  });

  it('Vol 1 explicitly maps SnappingEngine to Geometric Operations (L1)', () => {
    assert(docContent.includes('snapping/'));
    assert(docContent.includes('SnappingEngine'));
  });

  it('Vol 1 explicitly maps ClipboardService to Infrastructure Services (L3/L4)', () => {
    assert(docContent.includes('ClipboardService.ts'));
    assert(docContent.includes('CAPA L3 / L4: Servicios de Infraestructura e Integración'));
  });

  it('Vol 1 explicitly maps Grids and Guides to UI/Canvas Layers (L4)', () => {
    assert(docContent.includes('GridCanvasRenderer, guías interactivas'));
    assert(docContent.includes('ui/'));
  });

  console.log(`\nResults: ${passed} passed, 0 failed.`);
  return true;
}

if (process.argv[1]?.endsWith('test-orphan-modules-architecture.ts')) {
  runOrphanModulesArchitectureTests();
}
