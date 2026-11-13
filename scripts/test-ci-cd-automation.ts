import * as fs from 'fs';
import * as path from 'path';

export async function runCiCdAutomationTests(): Promise<boolean> {
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

  console.log('--- Test Suite 88: Automatización de CI/CD en GitHub Actions & Canal Pre-Release ---');

  // 1. Verificación del workflow de CI (.github/workflows/ci.yml)
  const ciWorkflowPath = path.resolve(process.cwd(), '.github/workflows/ci.yml');
  assert(fs.existsSync(ciWorkflowPath), '.github/workflows/ci.yml existe en el repositorio');

  const ciContent = fs.readFileSync(ciWorkflowPath, 'utf8');
  assert(ciContent.includes('matrix.os'), 'Workflow de CI define matriz multi-SO (ubuntu-latest, windows-latest)');
  assert(ciContent.includes('pnpm/action-setup'), 'Workflow de CI configura pnpm formalmente');
  assert(ciContent.includes('pnpm run compile'), 'Workflow de CI ejecuta compilación TypeScript');
  assert(ciContent.includes('pnpm run lint:layers'), 'Workflow de CI ejecuta auditoría arquitectónica de capas L0-L4');
  assert(ciContent.includes('pnpm test'), 'Workflow de CI ejecuta suite completa de pruebas automáticas');
  assert(ciContent.includes('pnpm run build:prod'), 'Workflow de CI valida compilación de producción minificada');
  assert(ciContent.includes('pnpm run package'), 'Workflow de CI valida empaquetado VSIX limpio');

  // 2. Verificación del workflow de Release (.github/workflows/release.yml)
  const releaseWorkflowPath = path.resolve(process.cwd(), '.github/workflows/release.yml');
  assert(fs.existsSync(releaseWorkflowPath), '.github/workflows/release.yml existe en el repositorio');

  const releaseContent = fs.readFileSync(releaseWorkflowPath, 'utf8');
  assert(releaseContent.includes('workflow_dispatch'), 'Workflow de Release soporta disparo manual');
  assert(releaseContent.includes('pre_release:'), 'Workflow de Release soporta parámetro de canal pre-release');
  assert(releaseContent.includes('--pre-release'), 'Workflow de Release soporta empaquetado y publicación --pre-release');
  assert(releaseContent.includes('softprops/action-gh-release'), 'Workflow de Release publica releases oficiales en GitHub');
  assert(releaseContent.includes('vsce publish'), 'Workflow de Release publica a Visual Studio Marketplace');
  assert(releaseContent.includes('ovsx publish'), 'Workflow de Release publica a Open VSX');

  // 3. Verificación de scripts en package.json
  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  assert(Boolean(pkg.scripts?.['build:prod'] && pkg.scripts['build:prod'].includes('--production')), 'package.json define script "build:prod" con flag --production');
  assert(Boolean(pkg.scripts?.['package:pre-release'] && pkg.scripts['package:pre-release'].includes('--pre-release')), 'package.json define script "package:pre-release" con flag --pre-release');

  // 4. Verificación de exclusión de sourcemaps en .vscodeignore y esbuild.js
  const vscodeIgnorePath = path.resolve(process.cwd(), '.vscodeignore');
  const vscodeIgnoreContent = fs.readFileSync(vscodeIgnorePath, 'utf8');
  assert(vscodeIgnoreContent.includes('**/*.map'), '.vscodeignore excluye formalmente archivos de sourcemap (**/*.map)');

  const esbuildPath = path.resolve(process.cwd(), 'esbuild.js');
  const esbuildContent = fs.readFileSync(esbuildPath, 'utf8');
  assert(esbuildContent.includes('--production') && esbuildContent.includes('hasSourcemap'), 'esbuild.js desactiva sourcemaps automáticamente en modo producción');

  console.log(`Suite 88 Completada: ${passed} pasados, ${failed} fallados.`);
  return failed === 0;
}

if (require.main === module) {
  runCiCdAutomationTests().then((ok) => {
    if (!ok) process.exit(1);
  });
}
