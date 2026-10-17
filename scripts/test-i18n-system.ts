import { I18nService } from '../src/webview/i18n/I18nService.js';
import { es } from '../src/webview/i18n/es.js';
import { en } from '../src/webview/i18n/en.js';

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

export async function runI18nSystemTests(): Promise<boolean> {
  console.log('\n--- Running Internationalization (i18n) System Test Suite ---');
  let passed = 0;

  try {
    // 1. Structural Symmetry & Completeness Between Dictionaries
    console.log('\n[1. Structural Symmetry & Completeness Between Dictionaries]');
    const sections = Object.keys(es) as (keyof typeof es)[];
    assert(sections.length > 0, 'Spanish dictionary has sections');
    assert(Object.keys(en).length === sections.length, 'English dictionary has exact same section count');
    passed++;
    console.log(`  ✅ [PASS] Both dictionaries contain ${sections.length} top-level sections`);

    for (const section of sections) {
      const esSection = es[section] as Record<string, string>;
      const enSection = en[section] as Record<string, string>;
      const esKeys = Object.keys(esSection);
      const enKeys = Object.keys(enSection);

      assert(esKeys.length === enKeys.length, `Section ${section} has same key count in ES (${esKeys.length}) and EN (${enKeys.length})`);
      for (const k of esKeys) {
        assert(enSection[k] !== undefined, `Key "${section}.${k}" exists in EN dictionary`);
        assert(typeof esSection[k] === 'string' && esSection[k].length > 0, `Key "${section}.${k}" is non-empty in ES`);
        assert(typeof enSection[k] === 'string' && enSection[k].length > 0, `Key "${section}.${k}" is non-empty in EN`);
      }
    }
    passed++;
    console.log('  ✅ [PASS] 100% key symmetry verified across all sections with non-empty values');

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

    // 4. Interactive Language Toggle & Event Dispatching
    console.log('\n[4. Interactive Language Toggle & Event Dispatching]');
    I18nService.setLanguage('es');
    let notifiedLang = '';
    const unsubscribe = I18nService.onLanguageChange((lang) => {
      notifiedLang = lang;
    });

    const toggled = I18nService.toggleLanguage();
    assert(toggled === 'en', 'toggleLanguage switched es -> en');
    assert(notifiedLang === 'en', 'Observer was notified of language switch to "en"');
    passed++;
    console.log('  ✅ [PASS] toggleLanguage successfully switched to "en" and notified subscribers');

    const toggledBack = I18nService.toggleLanguage();
    assert(toggledBack === 'es', 'toggleLanguage switched en -> es');
    assert(notifiedLang === 'es', 'Observer was notified of language switch to "es"');
    passed++;
    console.log('  ✅ [PASS] toggleLanguage successfully switched back to "es"');

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
