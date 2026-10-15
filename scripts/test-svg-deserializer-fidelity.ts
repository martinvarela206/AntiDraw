import { SvgDeserializer } from '../src/webview/engine/serialization/SvgDeserializer.js';
import { SvgSerializer, IVectorModelSerializerContext } from '../src/webview/engine/serialization/SvgSerializer.js';
import { VectorElement, PathVertex } from '../src/webview/engine/VectorModel.js';
import { DOMParser } from 'linkedom';

if (typeof (globalThis as any).DOMParser === 'undefined') {
  (globalThis as any).DOMParser = DOMParser;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failed++;
  }
}

function createMockContext(): IVectorModelSerializerContext {
  const elements: VectorElement[] = [];
  return {
    canvas: {
      width: 800,
      height: 600,
      viewBox: '0 0 800 600',
      backgroundColor: '#ffffff',
    },
    elements,
    customDefs: '',
    swatches: [],
    createDefaultCanvas: () => {},
    parsePathD: (d: string) => {
      if (!d) return [];
      return [
        { id: 'v0', x: 0, y: 0, nodeType: 'sharp', command: 'M' },
        { id: 'v1', x: 100, y: 100, nodeType: 'sharp', command: 'L' },
      ];
    },
    convertShapeToVertices: (tag: string, attrs: Record<string, string>) => {
      const x = parseFloat(attrs.x || '0');
      const y = parseFloat(attrs.y || '0');
      const w = parseFloat(attrs.width || '50');
      const h = parseFloat(attrs.height || '50');
      return [
        { id: 'v0', x, y, nodeType: 'sharp', command: 'M' },
        { id: 'v1', x: x + w, y, nodeType: 'sharp', command: 'L' },
        { id: 'v2', x: x + w, y: y + h, nodeType: 'sharp', command: 'L' },
        { id: 'v3', x, y: y + h, nodeType: 'sharp', command: 'L' },
      ];
    },
    compilePathD: () => 'M 0 0 L 100 100',
    compileRectD: () => 'M 0 0 L 100 0 L 100 50 L 0 50 Z',
    compileEllipseD: () => 'M 0 0',
    getRectCorners: () => ({ tl: 0, tr: 0, br: 0, bl: 0, mode: 'uniform', unit: 'px' }),
    calculateEffectiveCorners: () => ({ tl: 0, tr: 0, br: 0, bl: 0 }),
    isParametricElement: (el: VectorElement) => !!el.isParametric,
    syncParametricAttributes: () => {},
    isRect: (el: VectorElement) => el.tagName === 'rect',
    isEllipse: (el: VectorElement) => el.tagName === 'ellipse' || el.tagName === 'circle',
    isElementClosed: (el: VectorElement) => el.isClosed !== false,
  };
}

export async function runSvgDeserializerFidelityTests(): Promise<boolean> {
  passed = 0;
  failed = 0;

  console.log('--- Running SVG Deserializer Fidelity & Interoperability Suite ---');

  // 1. CSS Transform Normalization
  console.log('\n[1. CSS Transform Normalization to Canonical SVG Attribute]');
  {
    // Unit length normalization
    assert(SvgDeserializer.normalizeLength('100px') === '100', 'Strips px unit (100px -> 100)');
    assert(SvgDeserializer.normalizeLength('12pt') === '16', 'Converts pt unit (12pt -> 16)');
    assert(SvgDeserializer.normalizeLength('1in') === '96', 'Converts in unit (1in -> 96)');

    // Angle normalization
    assert(SvgDeserializer.normalizeAngle('45deg') === '45', 'Normalizes degrees (45deg -> 45)');
    assert(Math.abs(parseFloat(SvgDeserializer.normalizeAngle('1.57079632679rad')) - 90) < 0.01, 'Converts radians (PI/2 rad -> 90)');
    assert(SvgDeserializer.normalizeAngle('200grad') === '180', 'Converts gradians (200grad -> 180)');
    assert(SvgDeserializer.normalizeAngle('0.25turn') === '90', 'Converts turns (0.25turn -> 90)');

    // CSS transform functions
    const t1 = SvgDeserializer.normalizeTransform('translate(100px, 50px) rotate(45deg)');
    assert(t1 === 'translate(100, 50) rotate(45)', `Normalized chained translate & rotate: got "${t1}"`);

    const t2 = SvgDeserializer.normalizeTransform('translateX(30px) translateY(-20.5px)');
    assert(t2 === 'translate(30, 0) translate(0, -20.5)', `Remapped single-axis translates: got "${t2}"`);

    const t3 = SvgDeserializer.normalizeTransform('scaleX(1.5) scaleY(2)');
    assert(t3 === 'scale(1.5, 1) scale(1, 2)', `Remapped single-axis scales: got "${t3}"`);

    const t4 = SvgDeserializer.normalizeTransform('skew(15deg, 10deg)');
    assert(t4 === 'skewX(15) skewY(10)', `Remapped CSS skew to SVG skewX and skewY: got "${t4}"`);

    // Deserializing SVG with inline style transform
    const svgWithStyleTransform = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
        <rect id="r1" x="10" y="20" width="100" height="50" style="transform: translate(25px, 35px) rotate(30deg); fill: #3b82f6;" />
      </svg>
    `;
    const ctx = createMockContext();
    SvgDeserializer.loadSvgString(svgWithStyleTransform, ctx);
    assert(ctx.elements.length === 1, 'Loaded rect element');
    const r1 = ctx.elements[0];
    assert(r1.attributes.transform === 'translate(25, 35) rotate(30)', `Promoted CSS transform to SVG standard: got "${r1.attributes.transform}"`);
    assert(r1.attributes.fill === '#3b82f6', 'Retained fill color');
    assert(!r1.attributes.style?.includes('transform'), 'Purged transform declaration from inline style');
  }

  // 2. CSS Font Shorthand Decomposition
  console.log('\n[2. CSS Font Shorthand Decomposition to Longhands]');
  {
    const f1 = SvgDeserializer.parseFontShorthand("italic bold 16px/1.5 'Inter', sans-serif");
    assert(f1 !== null, 'Successfully parsed complex font shorthand');
    assert(f1?.['font-style'] === 'italic', `Extracted font-style: got "${f1?.['font-style']}"`);
    assert(f1?.['font-weight'] === 'bold', `Extracted font-weight: got "${f1?.['font-weight']}"`);
    assert(f1?.['font-size'] === '16', `Extracted font-size: got "${f1?.['font-size']}"`);
    assert(f1?.['line-height'] === '1.5', `Extracted line-height: got "${f1?.['line-height']}"`);
    assert(f1?.['font-family'] === "'Inter', sans-serif", `Extracted font-family: got "${f1?.['font-family']}"`);

    const f2 = SvgDeserializer.parseFontShorthand('300 24px Arial');
    assert(f2?.['font-weight'] === '300', `Numeric font-weight extracted: got "${f2?.['font-weight']}"`);
    assert(f2?.['font-size'] === '24', `Font size extracted: got "${f2?.['font-size']}"`);
    assert(f2?.['font-family'] === 'Arial', `Font family extracted: got "${f2?.['font-family']}"`);

    const f3 = SvgDeserializer.parseFontShorthand('small-caps oblique 12px/20px Georgia, serif');
    assert(f3?.['font-variant'] === 'small-caps', `Extracted small-caps variant: got "${f3?.['font-variant']}"`);
    assert(f3?.['font-style'] === 'oblique', `Extracted oblique style: got "${f3?.['font-style']}"`);
    assert(f3?.['line-height'] === '20px', `Extracted line-height with unit: got "${f3?.['line-height']}"`);

    // Ingest element with style="font: ..."
    const svgWithFont = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
        <text id="t1" x="50" y="100" style="font: italic bold 18px 'Roboto', sans-serif; fill: #10b981;">Typography Test</text>
      </svg>
    `;
    const ctx2 = createMockContext();
    SvgDeserializer.loadSvgString(svgWithFont, ctx2);
    assert(ctx2.elements.length === 1, 'Loaded text element');
    const t1 = ctx2.elements[0];
    assert(t1.attributes['font-style'] === 'italic', `Decomposed font-style: got "${t1.attributes['font-style']}"`);
    assert(t1.attributes['font-weight'] === 'bold', `Decomposed font-weight: got "${t1.attributes['font-weight']}"`);
    assert(t1.attributes['font-size'] === '18', `Decomposed font-size: got "${t1.attributes['font-size']}"`);
    assert(t1.attributes['font-family'] === "'Roboto', sans-serif", `Decomposed font-family: got "${t1.attributes['font-family']}"`);
    assert(!t1.attributes.style?.includes('font:'), 'Removed font shorthand from inline style');
  }

  // 3. Inkscape SVG 1.2 <flowRoot> Text Flow Compatibility
  console.log('\n[3. Inkscape SVG 1.2 <flowRoot> Text Flow Compatibility]');
  {
    const inkscapeFlowSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
        <flowRoot id="flowRoot3760" style="font-size:16px;font-style:normal;font-weight:bold;fill:#333333;font-family:Sans;" xml:space="preserve">
          <flowRegion id="flowRegion3762">
            <rect id="rect3764" width="300" height="200" x="50" y="80" />
          </flowRegion>
          <flowPara id="flowPara3766">First paragraph of flowing text</flowPara>
          <flowPara id="flowPara3768" style="font-style:italic;fill:#ef4444;">Second line in area container</flowPara>
        </flowRoot>
      </svg>
    `;

    const ctx3 = createMockContext();
    SvgDeserializer.loadSvgString(inkscapeFlowSvg, ctx3);

    assert(ctx3.elements.length === 1, `Ingested <flowRoot> as 1 VectorElement (got ${ctx3.elements.length})`);
    const flowEl = ctx3.elements[0];
    assert(flowEl.tagName === 'text', `Mapped <flowRoot> to standard <text> tag (got "${flowEl.tagName}")`);
    assert(flowEl.attributes['data-area-type'] === 'true', 'Tagged with data-area-type="true"');
    assert(flowEl.attributes['data-flow-region-x'] === '50', 'Extracted flowRegion rect X: 50');
    assert(flowEl.attributes['data-flow-region-y'] === '80', 'Extracted flowRegion rect Y: 80');
    assert(flowEl.attributes['data-flow-region-width'] === '300', 'Extracted flowRegion rect width: 300');
    assert(flowEl.attributes['data-flow-region-height'] === '200', 'Extracted flowRegion rect height: 200');

    // Text content preservation
    assert(flowEl.textContent?.includes('First paragraph of flowing text') === true, 'Preserved first paragraph content');
    assert(flowEl.textContent?.includes('Second line in area container') === true, 'Preserved second paragraph content');

    // Children tspans
    assert(flowEl.children?.length === 2, `Created 2 child <tspan> elements for paragraphs (got ${flowEl.children?.length})`);
    const tspan1 = flowEl.children![0];
    const tspan2 = flowEl.children![1];
    assert(tspan1.tagName === 'tspan', 'Child 1 is <tspan>');
    assert(tspan1.attributes.x === '50', 'Tspan 1 aligned to flowRegion x=50');
    assert(tspan2.attributes['font-style'] === 'italic', 'Tspan 2 inherited inline italic style');
    assert(tspan2.attributes.fill === '#ef4444', 'Tspan 2 inherited custom paragraph fill');

    // Synthesized bounding box vertices
    assert(flowEl.vertices?.length === 4, `Synthesized 4 bounding box vertices (got ${flowEl.vertices?.length})`);
    assert(flowEl.vertices![0].x === 50 && flowEl.vertices![0].y === 80, 'Top-left vertex matches flowRegion (50, 80)');
    assert(flowEl.vertices![2].x === 350 && flowEl.vertices![2].y === 280, 'Bottom-right vertex matches flowRegion (350, 280)');
  }

  // 4. Standard W3C SVG <text> and Multi-Line Roundtrip Serialization
  console.log('\n[4. Standard W3C SVG <text> and Multi-Line Roundtrip Serialization]');
  {
    const standardTextSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
        <text id="txt_title" x="120" y="160" font-family="Inter" font-size="22" font-weight="bold" fill="#0ea5e9">
          <tspan x="120" dy="0">Header Line 1</tspan>
          <tspan x="120" dy="28">Subheader Line 2</tspan>
        </text>
      </svg>
    `;

    const ctx4 = createMockContext();
    SvgDeserializer.loadSvgString(standardTextSvg, ctx4);
    assert(ctx4.elements.length === 1, 'Loaded standard SVG text');
    const txt = ctx4.elements[0];
    assert(txt.tagName === 'text', 'Element tag is text');
    assert(txt.attributes.x === '120', 'Retained x position 120');
    assert(txt.attributes['font-family'] === 'Inter', 'Retained font-family');
    assert(txt.children?.length === 2, 'Parsed 2 child tspans');
    assert(txt.children![0].textContent === 'Header Line 1', 'Tspan 1 text match');
    assert(txt.children![1].textContent === 'Subheader Line 2', 'Tspan 2 text match');

    // Roundtrip serialization
    const serialized = SvgSerializer.toSvgString(ctx4);
    assert(serialized.includes('<text'), 'Serialized output contains <text>');
    assert(serialized.includes('<tspan'), 'Serialized output contains <tspan>');
    assert(serialized.includes('Header Line 1'), 'Serialized output preserves Line 1 without loss');
    assert(serialized.includes('Subheader Line 2'), 'Serialized output preserves Line 2 without loss');
    assert(serialized.includes('</text>'), 'Serialized output correctly closes </text> tag');
  }

  console.log(`\nSVG Deserializer Fidelity Tests complete: ${passed} passed, ${failed} failed.\n`);
  return failed === 0;
}
