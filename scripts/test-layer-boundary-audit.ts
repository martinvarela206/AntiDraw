import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { AssetUriResolver } from '../src/webview/engine/canvas/AssetUriResolver.js';

export async function runLayerBoundaryAuditTests(): Promise<boolean> {
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

  console.log('--- Test Suite 86: Auditoría Automatizada de Capas (dependency-cruiser L0-L4) ---');

  // 1. Configuración de dependency-cruiser
  const depCruiserConfigPath = path.resolve(process.cwd(), '.dependency-cruiser.cjs');
  assert(fs.existsSync(depCruiserConfigPath), '.dependency-cruiser.cjs existe en la raíz del proyecto');

  const configContent = fs.readFileSync(depCruiserConfigPath, 'utf8');
  assert(configContent.includes('no-l0-upward'), 'Regla no-l0-upward configurada (prohibición de importaciones L0 -> L1..L4)');
  assert(configContent.includes('no-l1-upward'), 'Regla no-l1-upward configurada (prohibición de importaciones L1 -> L2..L4)');
  assert(configContent.includes('no-l2-upward'), 'Regla no-l2-upward configurada (prohibición de importaciones L2 -> L3..L4)');

  // 2. Ejecutar depcruise sobre src/webview
  try {
    const output = execSync('npx depcruise --config .dependency-cruiser.cjs src/webview', {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    assert(output.includes('no dependency violations found'), 'depcruise reporta 0 violaciones arquitectónicas en src/webview');
  } catch (err: any) {
    assert(false, `depcruise falló con violaciones de capas: ${err?.stdout || err?.message}`);
  }

  // 3. AssetUriResolver L1 Purity
  AssetUriResolver.clearCache();
  AssetUriResolver.cacheLiveAsset('./images/icon.png', 'vscode-webview://assets/icon.png');
  assert(
    AssetUriResolver.resolveLiveAssetUri('./images/icon.png') === 'vscode-webview://assets/icon.png',
    'AssetUriResolver resuelve URI cacheados en memoria sin tocar el DOM'
  );
  AssetUriResolver.setBaseWebviewUri('vscode-webview://workspace');
  assert(
    AssetUriResolver.resolveLiveAssetUri('local/photo.jpg') === 'vscode-webview://workspace/local/photo.jpg',
    'AssetUriResolver resuelve rutas relativas con baseWebviewUri en L1'
  );

  // 4. Verificación de reubicación canónica
  const systemCommandsCanonical = path.resolve(process.cwd(), 'src/webview/commands/SystemCommands.ts');
  const workspaceLayoutCanonical = path.resolve(process.cwd(), 'src/webview/services/WorkspaceLayoutService.ts');
  const sessionCanonical = path.resolve(process.cwd(), 'src/webview/services/Session.ts');
  const toolFactoryCanonical = path.resolve(process.cwd(), 'src/webview/services/ToolFactory.ts');

  assert(fs.existsSync(systemCommandsCanonical), 'SystemCommands.ts reside canónicamente en src/webview/commands (L3)');
  assert(fs.existsSync(workspaceLayoutCanonical), 'WorkspaceLayoutService.ts reside canónicamente en src/webview/services (L3)');
  assert(fs.existsSync(sessionCanonical), 'Session.ts reside canónicamente en src/webview/services (L3)');
  assert(fs.existsSync(toolFactoryCanonical), 'ToolFactory.ts reside canónicamente en src/webview/services (L3)');

  console.log(`Suite 86 Completada: ${passed} pasados, ${failed} fallados.`);
  return failed === 0;
}

if (require.main === module) {
  runLayerBoundaryAuditTests().then((ok) => {
    if (!ok) process.exit(1);
  });
}
