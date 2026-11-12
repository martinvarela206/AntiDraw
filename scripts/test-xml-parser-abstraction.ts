import { strict as assert } from 'assert';
import {
  IXmlParser,
  NativeBrowserXmlParser,
  HeadlessNodeXmlParser,
  IsomorphicXmlParserFactory,
} from '../src/webview/engine/serialization/XmlParser.js';
import { SvgDeserializer } from '../src/webview/engine/serialization/SvgDeserializer.js';
import { IVectorModelSerializerContext } from '../src/webview/engine/serialization/SvgSerializer.js';
import { VectorElement } from '../src/webview/engine/VectorModel.js';
import { DOMParser as LinkedomDOMParser } from 'linkedom';

export function runXmlParserAbstractionTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running Isomorphic XML Parser Abstraction Suite');
  console.log('======================================================');

  let passed = 0;
  function it(desc: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${desc}`);
      throw err;
    }
  }

  function createMockSerializerContext(): IVectorModelSerializerContext {
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
      parsePathD: () => [],
      convertShapeToVertices: () => [],
      compilePathD: () => '',
      compileRectD: () => '',
      compileEllipseD: () => '',
      getRectCorners: () => ({ tl: 0, tr: 0, br: 0, bl: 0, mode: 'uniform', unit: 'px' }),
      calculateEffectiveCorners: () => ({ tl: 0, tr: 0, br: 0, bl: 0 }),
      isParametricElement: () => false,
      syncParametricAttributes: () => {},
      isRect: (el) => el.tagName === 'rect',
      isEllipse: (el) => el.tagName === 'ellipse' || el.tagName === 'circle',
      isElementClosed: () => true,
    };
  }

  it('IsomorphicXmlParserFactory provides a functional XML parser without global DOMParser', () => {
    const parser = IsomorphicXmlParserFactory.getParser();
    assert(parser !== null);
    assert(typeof parser.parseFromString === 'function');

    const svgXml = '<svg width="200" height="150" viewBox="0 0 200 150"><rect x="10" y="10" width="50" height="50"/></svg>';
    const doc = parser.parseFromString(svgXml, 'image/svg+xml');
    assert(doc !== null);
    const svgEl = doc.querySelector('svg');
    assert(svgEl !== null);
    assert.equal(svgEl?.getAttribute('width'), '200');
  });

  it('HeadlessNodeXmlParser parses SVG cleanly using custom injected parser', () => {
    const headless = new HeadlessNodeXmlParser((xml, mime) => {
      const p = new LinkedomDOMParser();
      return p.parseFromString(xml, mime) as unknown as Document;
    });

    const doc = headless.parseFromString('<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="25"/></svg>');
    const circle = doc.querySelector('circle');
    assert(circle !== null);
    assert.equal(circle?.getAttribute('r'), '25');
  });

  it('SvgDeserializer accepts an injected custom IXmlParser instance', () => {
    let customParserInvoked = false;
    const customParser: IXmlParser = {
      parseFromString(xml: string, mime?: string): Document {
        customParserInvoked = true;
        const p = new LinkedomDOMParser();
        return p.parseFromString(xml, mime || 'image/svg+xml') as unknown as Document;
      },
    };

    const ctx = createMockSerializerContext();
    const svgString = '<svg width="400" height="300" viewBox="0 0 400 300"><rect id="r1" x="20" y="20" width="80" height="60" fill="#ff0000"/></svg>';

    SvgDeserializer.loadSvgString(svgString, ctx, null, customParser);

    assert.equal(customParserInvoked, true);
    assert.equal(ctx.canvas.width, 400);
    assert.equal(ctx.canvas.height, 300);
    assert.equal(ctx.elements.length, 1);
    assert.equal(ctx.elements[0].id, 'r1');
    assert.equal(ctx.elements[0].attributes.fill, '#ff0000');
  });

  it('IsomorphicXmlParserFactory setDefaultParser allows global headless override', () => {
    let overriddenCalls = 0;
    const mockParser: IXmlParser = {
      parseFromString(xml: string, mime?: string): Document {
        overriddenCalls++;
        const p = new LinkedomDOMParser();
        return p.parseFromString(xml, mime || 'image/svg+xml') as unknown as Document;
      },
    };

    try {
      IsomorphicXmlParserFactory.setDefaultParser(mockParser);
      const ctx = createMockSerializerContext();
      SvgDeserializer.loadSvgString('<svg width="500" height="500"></svg>', ctx);
      assert.equal(overriddenCalls, 1);
      assert.equal(ctx.canvas.width, 500);
    } finally {
      IsomorphicXmlParserFactory.setDefaultParser(null);
    }
  });

  console.log(`\nResults: ${passed} passed, 0 failed.`);
  return true;
}

if (process.argv[1]?.endsWith('test-xml-parser-abstraction.ts')) {
  runXmlParserAbstractionTests();
}
