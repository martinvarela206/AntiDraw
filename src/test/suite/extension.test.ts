import * as assert from 'assert';
import * as vscode from 'vscode';

export async function run(): Promise<void> {
  console.log('Testing AntiDraw Extension E2E Activation...');

  // 1. Verify extension presence
  const ext = vscode.extensions.getExtension('martinvarela206.antidraw');
  assert.ok(ext, 'AntiDraw extension should be registered in extension host');

  if (!ext.isActive) {
    await ext.activate();
  }
  assert.strictEqual(ext.isActive, true, 'AntiDraw extension must activate successfully');

  // 2. Verify registered commands
  const allCommands = await vscode.commands.getCommands(true);
  assert.ok(allCommands.includes('antidraw.openEditor'), 'antidraw.openEditor command must be registered');
  assert.ok(allCommands.includes('antidraw.purgeMetadata'), 'antidraw.purgeMetadata command must be registered');

  console.log('  ✓ All E2E extension assertions passed cleanly');
}
