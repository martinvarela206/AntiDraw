import { I18nService } from '../src/webview/i18n/I18nService.js';
import { es } from '../src/webview/i18n/es.js';
import { en } from '../src/webview/i18n/en.js';
import { zhCn } from '../src/webview/i18n/zh-cn.js';

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

export async function runI18nSystemTests(): Promise<boolean> {
  console.log('\n--- Running Internationalization (i18n) System Test Suite ---');
  let passed = 0;

  try {
    // 1. Structural Symmetry & Completeness Between Dictionaries (ES, EN, ZH-CN)
    console.log('\n[1. Structural Symmetry & Completeness Between Dictionaries]');
    const sections = Object.keys(es) as (keyof typeof es)[];
    assert(sections.length > 0, 'Spanish dictionary has sections');
    assert(Object.keys(en).length === sections.length, 'English dictionary has exact same section count');
    assert(Object.keys(zhCn).length === sections.length, 'Chinese Simplified dictionary has exact same section count');
    passed++;
    console.log(`  ✅ [PASS] All 3 dictionaries (ES, EN, ZH-CN) contain ${sections.length} top-level sections`);

    for (const section of sections) {
      const esSection = es[section] as Record<string, string>;
      const enSection = en[section] as Record<string, string>;
      const zhSection = zhCn[section] as Record<string, string>;
      const esKeys = Object.keys(esSection);
      const enKeys = Object.keys(enSection);
      const zhKeys = Object.keys(zhSection);

      assert(esKeys.length === enKeys.length, `Section ${section} has same key count in ES (${esKeys.length}) and EN (${enKeys.length})`);
      assert(esKeys.length === zhKeys.length, `Section ${section} has same key count in ES (${esKeys.length}) and ZH-CN (${zhKeys.length})`);

      for (const k of esKeys) {
        assert(enSection[k] !== undefined, `Key "${section}.${k}" exists in EN dictionary`);
        assert(zhSection[k] !== undefined, `Key "${section}.${k}" exists in ZH-CN dictionary`);
        assert(typeof esSection[k] === 'string' && esSection[k].length > 0, `Key "${section}.${k}" is non-empty in ES`);
        assert(typeof enSection[k] === 'string' && enSection[k].length > 0, `Key "${section}.${k}" is non-empty in EN`);
        assert(typeof zhSection[k] === 'string' && zhSection[k].length > 0, `Key "${section}.${k}" is non-empty in ZH-CN`);
      }
    }
    passed++;
    console.log('  ✅ [PASS] 100% key symmetry verified across all 3 dictionaries with non-empty values');

    // 2. Locale Auto-Detection & Sanitization
    console.log('\n[2. Locale Auto-Detection & Sanitization]');
    I18nService.initialize('es-ES');
    assert(I18nService.getLanguage() === 'es', 'es-ES resolved to es');
    passed++;
    console.log('  ✅ [PASS] Regional Spanish locale "es-ES" resolved to "es"');

    I18nService.initialize('es-419');
    assert(I18nService.getLanguage() === 'es', 'es-419 resolved to es');
    passed++;
    console.log('  ✅ [PASS] Latin American Spanish locale "es-419" resolved to "es"');

    I18nService.initialize('en-GB');
    assert(I18nService.getLanguage() === 'en', 'en-GB resolved to en');
    passed++;
    console.log('  ✅ [PASS] Regional English locale "en-GB" resolved to "en"');

    I18nService.initialize('zh-CN');
    assert(I18nService.getLanguage() === 'zh-cn', 'zh-CN resolved to zh-cn');
    passed++;
    console.log('  ✅ [PASS] Simplified Chinese locale "zh-CN" resolved to "zh-cn"');

    I18nService.initialize('zh-Hans');
    assert(I18nService.getLanguage() === 'zh-cn', 'zh-Hans resolved to zh-cn');
    passed++;
    console.log('  ✅ [PASS] Simplified Chinese script locale "zh-Hans" resolved to "zh-cn"');

    I18nService.initialize('de');
    assert(I18nService.getLanguage() === 'en', 'de falls back to default English');
    passed++;
    console.log('  ✅ [PASS] Unsupported locale "de" smoothly fell back to default English');

    // 3. Translation Retrieval and Variable Interpolation
    console.log('\n[3. Translation Retrieval and Variable Interpolation]');
    I18nService.setLanguage('es');
    assert(I18nService.t('common.ready') === 'Listo', 'es common.ready is "Listo"');
    assert(I18nService.t('statusbar.selectionMultiple', { count: 5 }) === '5 elementos seleccionados', 'Variable {count} interpolated in ES');
    assert(I18nService.t('statusbar.recoveredFromError', { phase: 'render' }) === 'Recuperado de error (render)', 'Variable {phase} interpolated in ES');
    passed++;
    console.log('  ✅ [PASS] Accurate translations and parameter substitution in Spanish');

    I18nService.setLanguage('en');
    assert(I18nService.t('common.ready') === 'Ready', 'en common.ready is "Ready"');
    assert(I18nService.t('statusbar.selectionMultiple', { count: 3 }) === '3 elements selected', 'Variable {count} interpolated in EN');
    assert(I18nService.t('statusbar.recoveredFromError', { phase: 'hitTest' }) === 'Recovered from error (hitTest)', 'Variable {phase} interpolated in EN');
    passed++;
    console.log('  ✅ [PASS] Accurate translations and parameter substitution in English');

    I18nService.setLanguage('zh-cn');
    assert(I18nService.t('common.ready') === '就绪', 'zh-cn common.ready is "就绪"');
    assert(I18nService.t('statusbar.selectionMultiple', { count: 4 }) === '已选择 4 个元素', 'Variable {count} interpolated in ZH-CN');
    assert(I18nService.t('statusbar.recoveredFromError', { phase: 'render' }) === '已从错误中恢复 (render)', 'Variable {phase} interpolated in ZH-CN');
    passed++;
    console.log('  ✅ [PASS] Accurate translations and parameter substitution in Simplified Chinese');

    // 4. Interactive Tri-State Language Toggle & Event Dispatching
    console.log('\n[4. Interactive Tri-State Language Toggle & Event Dispatching]');
    I18nService.setLanguage('es');
    let notifiedLang = '';
    const unsubscribe = I18nService.onLanguageChange((lang) => {
      notifiedLang = lang;
    });

    // es -> en
    const toggled1 = I18nService.toggleLanguage();
    assert(toggled1 === 'en', 'toggleLanguage switched es -> en');
    assert(notifiedLang === 'en', 'Observer was notified of switch to "en"');
    passed++;
    console.log('  ✅ [PASS] toggleLanguage switched es -> en and notified subscribers');

    // en -> zh-cn
    const toggled2 = I18nService.toggleLanguage();
    assert(toggled2 === 'zh-cn', 'toggleLanguage switched en -> zh-cn');
    assert(notifiedLang === 'zh-cn', 'Observer was notified of switch to "zh-cn"');
    passed++;
    console.log('  ✅ [PASS] toggleLanguage switched en -> zh-cn and notified subscribers');

    // zh-cn -> es
    const toggled3 = I18nService.toggleLanguage();
    assert(toggled3 === 'es', 'toggleLanguage switched zh-cn -> es');
    assert(notifiedLang === 'es', 'Observer was notified of switch to "es"');
    passed++;
    console.log('  ✅ [PASS] toggleLanguage successfully cycled back zh-cn -> es');

    unsubscribe();
    I18nService.setLanguage('en');
    assert(notifiedLang === 'es', 'Unsubscribed listener was not invoked after removal');
    passed++;
    console.log('  ✅ [PASS] Unsubscription cleanly detaches observer');

    console.log(`\nI18n System Tests complete: ${passed} passed, 0 failed.\n`);
    return true;
  } catch (err) {
    console.error('❌ I18n System Test Suite failed:', err);
    return false;
  }
}
