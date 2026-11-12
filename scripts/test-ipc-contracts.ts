import { IpcValidator } from '../src/shared/ipc/IpcContracts.js';

export function runIpcContractsTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running IPC Protocol Schema & Strict Contracts Suite');
  console.log('======================================================');

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, desc: string): void {
    if (condition) {
      console.log(`  ✅ [PASS] ${desc}`);
      passedCount++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}`);
      failedCount++;
    }
  }

  // --- Webview -> Host Validation ---
  const validReady = IpcValidator.validateWebviewToHost({ type: 'ready' });
  assert(validReady.isValid && validReady.message?.type === 'ready', 'Valid ready message passes');

  const validUpdateDoc = IpcValidator.validateWebviewToHost({
    type: 'updateDocument',
    text: '<svg></svg>',
  });
  assert(validUpdateDoc.isValid && validUpdateDoc.message?.type === 'updateDocument', 'Valid updateDocument message passes');

  const invalidUpdateDoc = IpcValidator.validateWebviewToHost({
    type: 'updateDocument',
    text: 12345, // invalid type
  });
  assert(!invalidUpdateDoc.isValid, 'Invalid updateDocument with non-string text is rejected');

  const validMeta = IpcValidator.validateWebviewToHost({
    type: 'updateMetadata',
    metadata: { showGrid: true, gridSpacing: 10 },
  });
  assert(validMeta.isValid && validMeta.message?.type === 'updateMetadata', 'Valid updateMetadata passes');

  const invalidMeta = IpcValidator.validateWebviewToHost({
    type: 'updateMetadata',
    metadata: 'not-an-object',
  });
  assert(!invalidMeta.isValid, 'Invalid updateMetadata with string is rejected');

  const validExport = IpcValidator.validateWebviewToHost({
    type: 'exportFile',
    filename: 'icon.svg',
    content: '<svg></svg>',
    format: 'svg',
  });
  assert(validExport.isValid && validExport.message?.type === 'exportFile', 'Valid exportFile passes');

  const invalidExport = IpcValidator.validateWebviewToHost({
    type: 'exportFile',
    filename: 'icon.svg',
    // missing content & format
  });
  assert(!invalidExport.isValid, 'exportFile missing content and format is rejected');

  const validUrl = IpcValidator.validateWebviewToHost({
    type: 'openExternal',
    url: 'https://github.com/martinvarela206/AntiDraw',
  });
  assert(validUrl.isValid, 'openExternal with https URL is accepted');

  const evilUrl = IpcValidator.validateWebviewToHost({
    type: 'openExternal',
    url: 'javascript:alert(1)',
  });
  assert(!evilUrl.isValid, 'openExternal with javascript: URL is strictly rejected');

  const fileUrl = IpcValidator.validateWebviewToHost({
    type: 'openExternal',
    url: 'file:///C:/Windows/System32',
  });
  assert(!fileUrl.isValid, 'openExternal with file: URL is strictly rejected');

  const unknownWebviewType = IpcValidator.validateWebviewToHost({
    type: 'maliciousOrUnknownCommand',
    payload: 'exploit',
  });
  assert(!unknownWebviewType.isValid, 'Unknown webview message type is rejected');

  const nullMsg = IpcValidator.validateWebviewToHost(null);
  assert(!nullMsg.isValid, 'Null message is rejected');

  // --- Host -> Webview Validation ---
  const validLoadSvg = IpcValidator.validateHostToWebview({
    type: 'loadSvg',
    text: '<svg viewBox="0 0 100 100"></svg>',
    fileName: 'logo.svg',
    locale: 'en',
  });
  assert(validLoadSvg.isValid && validLoadSvg.message?.type === 'loadSvg', 'Valid loadSvg message passes');

  const invalidLoadSvg = IpcValidator.validateHostToWebview({
    type: 'loadSvg',
    // missing text
  });
  assert(!invalidLoadSvg.isValid, 'loadSvg missing text field is rejected');

  const validImgResponse = IpcValidator.validateHostToWebview({
    type: 'saveLinkedImageResponse',
    requestId: 'req_123',
    success: true,
    relativePath: './img.png',
  });
  assert(validImgResponse.isValid && validImgResponse.message?.type === 'saveLinkedImageResponse', 'Valid saveLinkedImageResponse passes');

  const invalidImgResponse = IpcValidator.validateHostToWebview({
    type: 'saveLinkedImageResponse',
    requestId: 12345, // invalid type
    success: 'yes', // invalid boolean
  });
  assert(!invalidImgResponse.isValid, 'saveLinkedImageResponse with wrong types is rejected');

  const validImgSelected = IpcValidator.validateHostToWebview({
    type: 'imageFileSelected',
    base64: 'data:image/png;base64,AAA=',
    fileName: 'photo.png',
    sizeBytes: 1024,
    sourceUri: 'file:///tmp/photo.png',
  });
  assert(validImgSelected.isValid && validImgSelected.message?.type === 'imageFileSelected', 'Valid imageFileSelected passes');

  const unknownHostType = IpcValidator.validateHostToWebview({
    type: 'internalHostSecretEvent',
  });
  assert(!unknownHostType.isValid, 'Unknown host message type is rejected');

  console.log('------------------------------------------------------');
  console.log(`Summary: ${passedCount} passed, ${failedCount} failed of ${passedCount + failedCount} assertions.`);
  const allPassed = failedCount === 0;
  if (allPassed) {
    console.log('🎉 IpcContracts passed all schema validation checks!');
  }
  return allPassed;
}
