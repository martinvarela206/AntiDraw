const esbuild = require('esbuild');
const path = require('path');
const os = require('os');
const fs = require('fs');

async function main() {
  const tmpOut = path.join(os.tmpdir(), `antidraw-bench-${Date.now()}.cjs`);

  try {
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'benchmarks.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile: tmpOut,
      logLevel: 'error',
    });

    const { runAllBenchmarks } = require(tmpOut);
    const success = runAllBenchmarks();
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
