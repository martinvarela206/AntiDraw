const esbuild = require('esbuild');
const path = require('path');
const os = require('os');
const fs = require('fs');

async function runSuite(entryFile, exportFnName) {
  const tmpOut = path.join(os.tmpdir(), `antidraw-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.cjs`);

  try {
    await esbuild.build({
      entryPoints: [entryFile],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile: tmpOut,
      logLevel: 'error',
      loader: {
        '.svg': 'text',
      },
    });

    const mod = require(tmpOut);
    return await mod[exportFnName]();
  } finally {
    if (fs.existsSync(tmpOut)) {
      try {
        fs.unlinkSync(tmpOut);
      } catch (_) {}
    }
  }
}

async function main() {
  const ok1 = await runSuite(path.join(__dirname, 'test-validator.ts'), 'runValidatorTests');
  const ok2 = await runSuite(path.join(__dirname, 'test-metadata-fusion.ts'), 'runMetadataFusionTests');
  const ok3 = await runSuite(path.join(__dirname, 'test-clipboard.ts'), 'runClipboardTests');
  const ok4 = await runSuite(path.join(__dirname, 'test-export.ts'), 'runExportTests');
  const ok5 = await runSuite(path.join(__dirname, 'test-error-boundary.ts'), 'runErrorBoundaryTests');
  const ok6 = await runSuite(path.join(__dirname, 'test-fuzzing.ts'), 'runFuzzingTests');
  const ok7 = await runSuite(path.join(__dirname, 'test-drag-modifiers.ts'), 'runDragModifiersTests');
  const ok8 = await runSuite(path.join(__dirname, 'test-toolbar-dblclick.ts'), 'runToolbarDblClickTests');
  const ok9 = await runSuite(path.join(__dirname, 'test-selection-modes.ts'), 'runSelectionModesTests');
  const ok10 = await runSuite(path.join(__dirname, 'test-pixel-perfect.ts'), 'runPixelPerfectTests');

  const allSuccess = ok1 && ok2 && ok3 && ok4 && ok5 && ok6 && ok7 && ok8 && ok9 && ok10;
  process.exit(allSuccess ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
