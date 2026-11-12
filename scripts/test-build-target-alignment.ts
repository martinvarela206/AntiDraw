import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';

export async function runBuildTargetAlignmentTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running Build Target Alignment Suite');
  console.log('======================================================');

  let passed = 0;
  async function test(desc: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${desc}:`, err);
      throw err;
    }
  }

  const {
    resolveVsCodeTargets,
    resolveTargetsFromEngineString,
    VSCODE_RUNTIME_MILESTONES,
  } = require('./vscode-target-resolver.js');

  await test('Correctly derives Node 16 and Chrome 108 for VS Code ^1.80.0 (baseline engines.vscode)', () => {
    const targets = resolveVsCodeTargets();
    assert.equal(targets.major, 1);
    assert.equal(targets.minor, 80);
    assert.equal(targets.electronVersion, 22);
    assert.equal(targets.nodeTarget, 'node16');
    assert.equal(targets.chromeTarget, 'chrome108');
  });

  await test('Correctly maps VS Code 1.82 milestone to Node 18 & Chrome 114 (Electron 25)', () => {
    const targets = resolveTargetsFromEngineString('>=1.82.0');
    assert.equal(targets.electronVersion, 25);
    assert.equal(targets.nodeTarget, 'node18');
    assert.equal(targets.chromeTarget, 'chrome114');
  });

  await test('Correctly maps VS Code 1.90 milestone to Node 20 & Chrome 122 (Electron 29)', () => {
    const targets = resolveTargetsFromEngineString('^1.90.0');
    assert.equal(targets.electronVersion, 29);
    assert.equal(targets.nodeTarget, 'node20');
    assert.equal(targets.chromeTarget, 'chrome122');
  });

  await test('Correctly maps VS Code 1.95 milestone to Node 20 & Chrome 128 (Electron 32)', () => {
    const targets = resolveTargetsFromEngineString('~1.95.2');
    assert.equal(targets.electronVersion, 32);
    assert.equal(targets.nodeTarget, 'node20');
    assert.equal(targets.chromeTarget, 'chrome128');
  });

  await test('Gracefully falls back to safest legacy baseline on unparseable engine strings', () => {
    const targets = resolveTargetsFromEngineString('invalid-range');
    assert.equal(targets.nodeTarget, 'node16');
    assert.equal(targets.chromeTarget, 'chrome108');
  });

  await test('esbuild.js explicitly specifies both node and chrome compilation targets', () => {
    const esbuildConfigPath = path.join(process.cwd(), 'esbuild.js');
    const content = fs.readFileSync(esbuildConfigPath, 'utf8');
    assert.ok(content.includes('resolveVsCodeTargets'), 'esbuild.js must import resolveVsCodeTargets');
    assert.ok(content.includes('target: [targets.nodeTarget]'), 'extensionCtx must configure target nodeTarget');
    assert.ok(content.includes('target: [targets.chromeTarget]'), 'webviewCtx must configure target chromeTarget');
  });

  console.log(`\nBuild Target Alignment Tests Completed: ${passed} passed`);
  return true;
}

if (process.argv[1] && process.argv[1].includes('test-build-target-alignment')) {
  runBuildTargetAlignmentTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
