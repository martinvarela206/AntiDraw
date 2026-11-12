import { DOMParser } from 'linkedom';
if (typeof (globalThis as any).DOMParser === 'undefined') {
  (globalThis as any).DOMParser = DOMParser;
}

import { SvgSanitizer } from '../src/webview/engine/security/SvgSanitizer.js';
import { VectorModel } from '../src/webview/engine/VectorModel.js';
import { SvgSerializer } from '../src/webview/engine/serialization/SvgSerializer.js';

export function runSvgSanitizerTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running SvgSanitizer & Zero-Trust Ingestion Suite');
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

  // Test 1: Direct document sanitization of executable elements
  const maliciousSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <script>alert("xss")</script>
      <defs>
        <script>window.location='https://evil.com'</script>
        <linearGradient id="grad1">
          <stop offset="0%" stop-color="red"/>
        </linearGradient>
      </defs>
      <foreignObject width="100" height="100">
        <iframe src="https://evil.com"></iframe>
      </foreignObject>
      <rect x="0" y="0" width="50" height="50" onload="alert('owned')" onclick="evil()" fill="url(#grad1)"/>
      <path d="M 0 0 L 10 10" stroke="black"/>
    </svg>
  `;

  const parser = new (globalThis as any).DOMParser();
  const doc = parser.parseFromString(maliciousSvg, 'image/svg+xml');
  const res = SvgSanitizer.sanitizeDocument(doc);

  assert(res.removedElementsCount >= 3, `Disallowed elements removed (count: ${res.removedElementsCount})`);
  assert(res.removedAttributesCount >= 2, `Malicious event handler attributes removed (count: ${res.removedAttributesCount})`);
  assert(doc.querySelectorAll('script').length === 0, 'Zero <script> tags remain in document');
  assert(doc.querySelectorAll('foreignObject').length === 0, 'Zero <foreignObject> tags remain in document');
  assert(doc.querySelectorAll('iframe').length === 0, 'Zero <iframe> tags remain in document');

  const rect = doc.querySelector('rect');
  assert(rect !== null, '<rect> primitive is preserved');
  assert(!rect.hasAttribute('onload'), 'onload attribute purged from <rect>');
  assert(!rect.hasAttribute('onclick'), 'onclick attribute purged from <rect>');
  assert(rect.getAttribute('fill') === 'url(#grad1)', 'Legitimate attributes like fill preserved');

  const gradient = doc.querySelector('#grad1');
  assert(gradient !== null, 'Legitimate <linearGradient> preserved in defs');

  // Test 2: Dangerous href URI schemes
  const uriSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <a href="javascript:alert(1)"><text x="10" y="20">Click me</text></a>
      <image href="javascript:evil()" width="20" height="20"/>
      <image href="data:text/html;base64,PHNjcmlwdD4=" width="20" height="20"/>
      <image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" width="20" height="20"/>
      <use href="https://evil.com/remote.svg#icon"/>
      <use href="#local-icon"/>
    </svg>
  `;

  const uriDoc = parser.parseFromString(uriSvg, 'image/svg+xml');
  const uriRes = SvgSanitizer.sanitizeDocument(uriDoc);

  assert(uriRes.removedAttributesCount >= 4, `Dangerous href and remote use attributes purged (count: ${uriRes.removedAttributesCount})`);
  const aEl = uriDoc.querySelector('a');
  assert(aEl && !aEl.hasAttribute('href'), 'javascript: href stripped from <a>');

  const images = uriDoc.querySelectorAll('image');
  assert(images[0] && !images[0].hasAttribute('href'), 'javascript: stripped from image[0]');
  assert(images[1] && !images[1].hasAttribute('href'), 'data:text/html stripped from image[1]');
  assert(images[2] && images[2].hasAttribute('href'), 'data:image/png preserved on image[2]');

  const uses = uriDoc.querySelectorAll('use');
  assert(uses[0] && !uses[0].hasAttribute('href'), 'Remote http/https href stripped from use[0]');
  assert(uses[1] && uses[1].getAttribute('href') === '#local-icon', 'Local anchor #local-icon preserved on use[1]');

  // Test 3: Style @import and CSS javascript: URLs
  const cssSvg = `
    <svg xmlns="http://www.w3.org/2000/svg">
      <style>
        @import url("https://evil.com/leak.css");
        .foo { background: url('javascript:alert(1)'); color: red; }
      </style>
      <rect class="foo" width="10" height="10"/>
    </svg>
  `;

  const cssDoc = parser.parseFromString(cssSvg, 'image/svg+xml');
  SvgSanitizer.sanitizeDocument(cssDoc);
  const styleEl = cssDoc.querySelector('style');
  const styleText = styleEl ? styleEl.textContent || '' : '';
  assert(!styleText.includes('@import url'), 'CSS @import successfully stripped from <style>');
  assert(!styleText.includes('javascript:'), 'CSS url(javascript:) successfully neutralized in <style>');
  assert(styleText.includes('color: red;'), 'Legitimate CSS properties like color: red preserved');

  // Test 4: End-to-end integration via SvgSerializer.loadSvgString into VectorModel
  const model = new VectorModel();
  SvgSerializer.loadSvgString(maliciousSvg, model);

  assert(model.elements.length >= 1, 'Valid vector elements were successfully ingested into VectorModel');
  const pathOrRect = model.elements.find((e) => e.tagName === 'rect' || e.type === 'rect');
  assert(pathOrRect !== undefined, 'Ingested rect element exists');
  if (pathOrRect) {
    assert(!('onload' in pathOrRect.attributes), 'VectorModel attributes do not contain onload');
    assert(!('onclick' in pathOrRect.attributes), 'VectorModel attributes do not contain onclick');
  }

  console.log('------------------------------------------------------');
  console.log(`Summary: ${passedCount} passed, ${failedCount} failed of ${passedCount + failedCount} assertions.`);
  const allPassed = failedCount === 0;
  if (allPassed) {
    console.log('🎉 SvgSanitizer passed all security & zero-trust checks!');
  }
  return allPassed;
}
