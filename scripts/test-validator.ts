import { SvgValidator } from '../src/webview/engine/export/SvgValidator.js';

interface TestCase {
  name: string;
  input: any;
  shouldBeValid: boolean;
}

const testCases: TestCase[] = [
  {
    name: 'Null input',
    input: null,
    shouldBeValid: false,
  },
  {
    name: 'Undefined input',
    input: undefined,
    shouldBeValid: false,
  },
  {
    name: 'Empty string',
    input: '',
    shouldBeValid: false,
  },
  {
    name: 'Whitespace only',
    input: '   \n  \t  ',
    shouldBeValid: false,
  },
  {
    name: 'Too short snippet (< 20 chars)',
    input: '<svg></svg>',
    shouldBeValid: false,
  },
  {
    name: 'Non-SVG tag root (e.g. div)',
    input: '<div class="foo">Some text here</div>',
    shouldBeValid: false,
  },
  {
    name: 'Missing closing </svg> tag',
    input: '<svg width="100" height="100"><rect x="0" y="0"/>',
    shouldBeValid: false,
  },
  {
    name: 'Missing opening <svg> tag',
    input: '<rect x="0" y="0" width="50" height="50"/></svg>',
    shouldBeValid: false,
  },
  {
    name: 'Non-string input (number)',
    input: 12345,
    shouldBeValid: false,
  },
  {
    name: 'Valid clean SVG document',
    input: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect x="10" y="10" width="100" height="100" fill="#ff0000"/></svg>',
    shouldBeValid: true,
  },
  {
    name: 'Valid SVG with metadata block',
    input: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><metadata><antidraw:state/></metadata><circle cx="50" cy="50" r="40"/></svg>',
    shouldBeValid: true,
  },
];

export function runValidatorTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running SvgValidator Unit & Edge Cases Test Suite');
  console.log('======================================================');

  let passedCount = 0;
  let failedCount = 0;

  for (const tc of testCases) {
    const result = SvgValidator.validate(tc.input);
    const passed = result.isValid === tc.shouldBeValid;

    if (passed) {
      console.log(`  ✅ [PASS] ${tc.name}`);
      passedCount++;
    } else {
      console.error(`  ❌ [FAIL] ${tc.name} -> Expected isValid: ${tc.shouldBeValid}, got: ${result.isValid} (error: ${result.error})`);
      failedCount++;
    }
  }

  console.log('------------------------------------------------------');
  console.log(`Summary: ${passedCount} passed, ${failedCount} failed of ${testCases.length} tests.`);

  if (failedCount === 0) {
    console.log('🎉 SvgValidator passed all integrity checks!\n');
    return true;
  } else {
    console.error('❌ One or more SvgValidator test assertions failed.\n');
    return false;
  }
}
