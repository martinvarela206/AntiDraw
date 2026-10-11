const esbuild = require('esbuild');
const path = require('path');
const os = require('os');
const fs = require('fs');

async function main() {
  const tmpOut = path.join(os.tmpdir(), `antidraw-test-${Date.now()}.cjs`);

  try {
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'test-validator.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile: tmpOut,
      logLevel: 'error',
    });

    const { runValidatorTests } = require(tmpOut);
    const success = runValidatorTests();
    process.exit(success ? 0 : 1);
  } finally {
    if (fs.existsSync(tmpOut)) {
      try {
        fs.unlinkSync(tmpOut);
      } catch (_) {}
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
