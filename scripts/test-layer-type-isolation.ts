import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export async function runLayerTypeIsolationTests(): Promise<boolean> {
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

  console.log('--- Test Suite 85: Aislamiento de Tipos por Capa (Core & Operations DOM-Free) ---');

  // 1. Verificar tsconfig.core.json
  const coreTsConfigPath = path.resolve(process.cwd(), 'tsconfig.core.json');
  assert(fs.existsSync(coreTsConfigPath), 'tsconfig.core.json existe en la raíz del proyecto');

  const coreTsConfig = JSON.parse(fs.readFileSync(coreTsConfigPath, 'utf8'));
  const libs = coreTsConfig.compilerOptions?.lib || [];
  assert(libs.includes('ES2022') && !libs.includes('DOM') && !libs.includes('dom'), 'tsconfig.core.json desactiva explícitamente bibliotecas DOM ("lib": ["ES2022"])');
  assert(Array.isArray(coreTsConfig.include) && coreTsConfig.include.some((p: string) => p.includes('core')), 'tsconfig.core.json incluye src/webview/core/**/*');
  assert(Array.isArray(coreTsConfig.include) && coreTsConfig.include.some((p: string) => p.includes('operations')), 'tsconfig.core.json incluye src/webview/engine/operations/**/*');

  // 2. Ejecutar compilación pura de tsconfig.core.json
  try {
    execSync('npx tsc -p tsconfig.core.json', { stdio: 'pipe' });
    assert(true, 'npx tsc -p tsconfig.core.json compila con código de salida 0 sin librerías DOM');
  } catch (err: any) {
    assert(false, `npx tsc -p tsconfig.core.json falló: ${err?.message}`);
  }

  // 3. Verificar exportación de tipos puros en VectorTypes.ts
  const vectorTypesPath = path.resolve(process.cwd(), 'src/webview/core/model/VectorTypes.ts');
  assert(fs.existsSync(vectorTypesPath), 'src/webview/core/model/VectorTypes.ts existe');
  const vectorTypesContent = fs.readFileSync(vectorTypesPath, 'utf8');

  const requiredTypes = [
    'Point',
    'PointUtils',
    'NodeType',
    'PathVertex',
    'PathSegment',
    'RectCorners',
    'ParametricShapeType',
    'VectorElement',
    'CanvasSettings',
    'DropShadowConfig',
    'InnerShadowConfig',
    'GradientStop',
    'GradientConfig',
    'GuideLine',
  ];

  for (const t of requiredTypes) {
    assert(vectorTypesContent.includes(t), `VectorTypes.ts declara o exporta ${t}`);
  }

  // 4. Auditar archivos en core/ y engine/operations/ para asegurar cero dependencias DOM
  function getTsFiles(dir: string): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(getTsFiles(filePath));
      } else if (file.endsWith('.ts')) {
        results.push(filePath);
      }
    }
    return results;
  }

  const coreFiles = getTsFiles(path.resolve(process.cwd(), 'src/webview/core'));
  const opFiles = getTsFiles(path.resolve(process.cwd(), 'src/webview/engine/operations'));
  const filesToCheck = [...coreFiles, ...opFiles];

  const domDisallowedPatterns = [
    /\bwindow\./,
    /\bdocument\./,
    /\bHTMLElement\b/,
    /\bSVGElement\b/,
    /\bDOMParser\b/,
    /\bXMLSerializer\b/
  ];

  let domViolations = 0;
  for (const file of filesToCheck) {
    let content = fs.readFileSync(file, 'utf8');
    // Strip comments
    content = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const pattern of domDisallowedPatterns) {
      if (pattern.test(content)) {
        console.error(`  Violación DOM en ${path.relative(process.cwd(), file)}: patrón ${pattern}`);
        domViolations++;
      }
    }
  }

  assert(domViolations === 0, `Archivos de core y operations tienen 0 referencias al DOM (encontradas: ${domViolations})`);

  // 5. VectorModel.ts preserva retrocompatibilidad reexportando VectorTypes
  const vectorModelPath = path.resolve(process.cwd(), 'src/webview/engine/VectorModel.ts');
  const vectorModelContent = fs.readFileSync(vectorModelPath, 'utf8');
  assert(vectorModelContent.includes("export * from '../core/model/VectorTypes.js';"), 'VectorModel.ts re-exporta VectorTypes.js para retrocompatibilidad total');

  console.log(`Suite 85 Completada: ${passed} pasados, ${failed} fallados.`);
  return failed === 0;
}

if (require.main === module) {
  runLayerTypeIsolationTests().then((ok) => {
    if (!ok) process.exit(1);
  });
}
