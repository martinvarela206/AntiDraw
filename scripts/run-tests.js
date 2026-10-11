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

  const allSuccess = ok1 && ok2 && ok3;
  process.exit(allSuccess ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
