import * as path from 'path';
import * as fs from 'fs';

export function run(): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('--- AntiDraw E2E Test Suite (@vscode/test-electron) ---');
      const testFile = path.resolve(__dirname, './extension.test.js');
      if (fs.existsSync(testFile)) {
        const testMod = require(testFile);
        if (typeof testMod.run === 'function') {
          await testMod.run();
        }
      }
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}
