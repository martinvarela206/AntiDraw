const esbuild = require('esbuild');
const { syncIcons } = require('./scripts/sync-icons.js');
const { resolveVsCodeTargets } = require('./scripts/vscode-target-resolver.js');
const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
const hasSourcemap = !isProduction && !process.argv.includes('--no-sourcemap');
const isMinify = isProduction || process.argv.includes('--minify');

async function main() {
  syncIcons();
  const targets = resolveVsCodeTargets();
  console.log(
    `[AntiDraw:Build] Derived targets from engines.vscode (${targets.rawEngineString}): Node ${targets.nodeTarget} (Electron ${targets.electronVersion}), Webview ${targets.chromeTarget} [production=${isProduction}, sourcemap=${hasSourcemap}, minify=${isMinify}]`
  );

  const extensionCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: isMinify,
    sourcemap: hasSourcemap,
    platform: 'node',
    target: [targets.nodeTarget],
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'info',
  });

  const webviewCtx = await esbuild.context({
    entryPoints: ['src/webview/main.ts'],
    bundle: true,
    format: 'iife',
    minify: isMinify,
    sourcemap: hasSourcemap,
    platform: 'browser',
    target: [targets.chromeTarget],
    outfile: 'dist/webview.js',
    logLevel: 'info',
    loader: {
      '.svg': 'text',
    },
  });

  if (isWatch) {
    await extensionCtx.watch();
    await webviewCtx.watch();
    console.log('Watching for changes...');
  } else {
    await extensionCtx.rebuild();
    await webviewCtx.rebuild();
    await extensionCtx.dispose();
    await webviewCtx.dispose();
    console.log('Build completed successfully.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
