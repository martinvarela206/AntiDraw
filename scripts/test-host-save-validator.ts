import { HostSaveValidator } from '../src/shared/validation/HostSaveValidator.js';
import { AtomicFileWriter, IFileSystemBridge } from '../src/editor/AtomicFileWriter.js';

export async function runHostSaveValidatorTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running Host Save Validator & Atomic Write Suite');
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

  // --- 1. Basic Structure Validation ---
  const validSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80"/></svg>';
  const resValid = HostSaveValidator.validateSvgIntegrity(validSvg);
  assert(resValid.isValid, 'Valid standard SVG is accepted');
  assert(resValid.stats?.nodeCount === 1, 'Correct node count for 1 rect');

  const resNonString = HostSaveValidator.validateSvgIntegrity(null as any);
  assert(!resNonString.isValid && resNonString.error?.includes('cadena de texto'), 'Non-string SVG rejected');

  const resTooShort = HostSaveValidator.validateSvgIntegrity('<svg></svg>');
  assert(!resTooShort.isValid && resTooShort.error?.includes('demasiado corto'), 'Truncated/too short SVG rejected');

  const resMissingClose = HostSaveValidator.validateSvgIntegrity('<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0"/>');
  assert(!resMissingClose.isValid && resMissingClose.error?.includes('requeridas <svg> o </svg>'), 'Missing closing </svg> tag rejected');

  // --- 2. Numeric and Geometric Corruption in Attributes ---
  const nanPathSvg = '<svg viewBox="0 0 100 100"><path d="M 10 20 L NaN 40 Z"/></svg>';
  const resNanPath = HostSaveValidator.validateSvgIntegrity(nanPathSvg);
  assert(!resNanPath.isValid && resNanPath.error?.includes('d') && resNanPath.error?.includes('NaN'), 'Path d with NaN is rejected');

  const infTransformSvg = '<svg viewBox="0 0 100 100"><g transform="matrix(1, 0, 0, 1, Infinity, 0)"><circle cx="10" cy="10" r="5"/></g></svg>';
  const resInfTransform = HostSaveValidator.validateSvgIntegrity(infTransformSvg);
  assert(!resInfTransform.isValid && resInfTransform.error?.includes('Infinity'), 'Transform attribute with Infinity is rejected');

  const nanPointsSvg = '<svg viewBox="0 0 100 100"><polygon points="0,0 50,NaN 100,100"/></svg>';
  const resNanPoints = HostSaveValidator.validateSvgIntegrity(nanPointsSvg);
  assert(!resNanPoints.isValid && resNanPoints.error?.includes('points'), 'Polygon points with NaN is rejected');

  const undefinedCoordSvg = '<svg viewBox="0 0 100 100"><circle cx="undefined" cy="50" r="10"/></svg>';
  const resUndefinedCoord = HostSaveValidator.validateSvgIntegrity(undefinedCoordSvg);
  assert(!resUndefinedCoord.isValid && resUndefinedCoord.error?.includes('undefined'), 'Circle cx="undefined" is rejected');

  const objObjSvg = '<svg viewBox="0 0 100 100"><rect x="10" y="10" width="[object Object]" height="50"/></svg>';
  const resObjObj = HostSaveValidator.validateSvgIntegrity(objObjSvg);
  assert(!resObjObj.isValid && resObjObj.error?.includes('[object Object]'), 'Corrupt [object Object] attribute is rejected');

  // --- 3. Catastrophic Node Loss / Empty Document Protection ---
  const multiNodeSvg = `
    <svg viewBox="0 0 500 500">
      <path d="M 0 0 L 10 10"/>
      <rect x="0" y="0" width="10" height="10"/>
      <circle cx="5" cy="5" r="5"/>
      <ellipse cx="5" cy="5" rx="5" ry="2"/>
      <line x1="0" y1="0" x2="10" y2="10"/>
      <polygon points="0,0 10,0 10,10"/>
      <polyline points="0,0 5,5 10,10"/>
      <text x="0" y="0">Sample</text>
      <image href="test.png"/>
      <use href="#test"/>
      <g><rect x="1" y="1" width="2" height="2"/></g>
      <path d="M 20 20 L 30 30"/>
    </svg>
  `;
  const countedNodes = HostSaveValidator.countGeometricNodes(multiNodeSvg);
  assert(countedNodes === 13, `Counted geometric nodes accurately (expected 13, got ${countedNodes})`);

  const emptyDocSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"></svg>';
  const resWipeout = HostSaveValidator.validateSvgIntegrity(emptyDocSvg, multiNodeSvg);
  assert(!resWipeout.isValid && resWipeout.error?.includes('vaciado por completo'), 'Sudden complete document wipeout from 13 nodes to 0 is blocked');

  const resPermittedEmpty = HostSaveValidator.validateSvgIntegrity(emptyDocSvg, multiNodeSvg, { allowEmpty: true });
  assert(resPermittedEmpty.isValid, 'Empty document allowed when allowEmpty: true explicitly granted');

  // Catastrophic drop: 13 nodes dropped to 1 node (>90% drop)
  const singleNodeSvg = '<svg viewBox="0 0 500 500"><rect x="0" y="0" width="10" height="10"/></svg>';
  const resCatastrophic = HostSaveValidator.validateSvgIntegrity(singleNodeSvg, multiNodeSvg);
  assert(!resCatastrophic.isValid && resCatastrophic.error?.includes('Pérdida anómala de elementos'), 'Catastrophic node loss (13 to 1) is blocked');

  // Normal editing: 13 nodes dropped to 11 nodes (moderate drop)
  const normalEditSvg = `
    <svg viewBox="0 0 500 500">
      <path d="M 0 0 L 10 10"/>
      <rect x="0" y="0" width="10" height="10"/>
      <circle cx="5" cy="5" r="5"/>
      <ellipse cx="5" cy="5" rx="5" ry="2"/>
      <line x1="0" y1="0" x2="10" y2="10"/>
      <polygon points="0,0 10,0 10,10"/>
      <polyline points="0,0 5,5 10,10"/>
      <text x="0" y="0">Sample</text>
      <image href="test.png"/>
      <use href="#test"/>
      <g><rect x="1" y="1" width="2" height="2"/></g>
    </svg>
  `;
  const resNormalEdit = HostSaveValidator.validateSvgIntegrity(normalEditSvg, multiNodeSvg);
  assert(resNormalEdit.isValid, 'Normal editing node drop (13 to 12) is allowed');

  // --- 4. Atomic File Writer Execution & Rollback ---
  const callLog: string[] = [];
  let shouldFailRename = false;

  const mockFs: IFileSystemBridge = {
    writeFile: async (uri, _content) => {
      callLog.push(`write:${uri.path}`);
    },
    rename: async (src, dst, _opts) => {
      if (shouldFailRename) {
        throw new Error('Disk full during rename');
      }
      callLog.push(`rename:${src.path}->${dst.path}`);
    },
    delete: async (uri, _opts) => {
      callLog.push(`delete:${uri.path}`);
    },
  };

  const targetUri = {
    path: '/path/to/design.svg',
    with(change: any) {
      return { path: change.path };
    },
  };

  // Test successful atomic write
  await AtomicFileWriter.write(mockFs, targetUri, new TextEncoder().encode('<svg></svg>'));
  assert(
    callLog.some((e) => e.startsWith('write:/path/to/design.svg.tmp.')),
    'AtomicFileWriter writes to unique temporary file first'
  );
  assert(
    callLog.some((e) => e.includes('rename:/path/to/design.svg.tmp.') && e.endsWith('->/path/to/design.svg')),
    'AtomicFileWriter renames temporary file to target URI'
  );

  // Test rollback / cleanup on failure
  callLog.length = 0;
  shouldFailRename = true;
  let errorCaught = false;
  try {
    await AtomicFileWriter.write(mockFs, targetUri, new TextEncoder().encode('<svg></svg>'));
  } catch (err: any) {
    errorCaught = true;
    assert(err.message === 'Disk full during rename', 'AtomicFileWriter re-throws failure');
  }
  assert(errorCaught, 'AtomicFileWriter propagates error to caller');
  assert(
    callLog.some((e) => e.startsWith('delete:/path/to/design.svg.tmp.')),
    'AtomicFileWriter cleans up temporary file on failure, leaving target intact'
  );

  console.log(`\nResults: ${passedCount} passed, ${failedCount} failed.`);
  return failedCount === 0;
}
