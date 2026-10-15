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
  const ok11 = await runSuite(path.join(__dirname, 'test-temporal-edge-anchor.ts'), 'runTemporalEdgeAnchorTests');
  const ok12 = await runSuite(path.join(__dirname, 'test-multi-candidate-snapping.ts'), 'runMultiCandidateSnappingTests');
  const ok13 = await runSuite(path.join(__dirname, 'test-universal-intersections.ts'), 'runUniversalIntersectionsTests');
  const ok14 = await runSuite(path.join(__dirname, 'test-node-subgroup-transform.ts'), 'runNodeSubgroupTransformTests');
  const ok15 = await runSuite(path.join(__dirname, 'test-node-join-fusion.ts'), 'runNodeJoinFusionTests');
  const ok16 = await runSuite(path.join(__dirname, 'test-rect-autopromote.ts'), 'runRectAutoPromoteTests');
  const ok17 = await runSuite(path.join(__dirname, 'test-ellipse-autopromote.ts'), 'runEllipseAutoPromoteTests');
  const ok18 = await runSuite(path.join(__dirname, 'test-shape-keyboard-sides.ts'), 'runShapeKeyboardSidesTests');
  const ok19 = await runSuite(path.join(__dirname, 'test-star-inner-ratio-ctrl.ts'), 'runStarInnerRatioCtrlTests');
  const ok20 = await runSuite(path.join(__dirname, 'test-toolbar-topology-drawers.ts'), 'runToolbarTopologyDrawersTests');
  const ok21 = await runSuite(path.join(__dirname, 'test-smart-fill.ts'), 'runSmartFillTests');

  const allSuccess = ok1 && ok2 && ok3 && ok4 && ok5 && ok6 && ok7 && ok8 && ok9 && ok10 && ok11 && ok12 && ok13 && ok14 && ok15 && ok16 && ok17 && ok18 && ok19 && ok20 && ok21;
  process.exit(allSuccess ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
