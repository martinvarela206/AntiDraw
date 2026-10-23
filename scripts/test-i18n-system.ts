import { I18nService } from '../src/webview/i18n/I18nService.js';
import { es } from '../src/webview/i18n/es.js';
import { en } from '../src/webview/i18n/en.js';
import { zhCn } from '../src/webview/i18n/zh-cn.js';
import { de } from '../src/webview/i18n/de.js';
import { fr } from '../src/webview/i18n/fr.js';
import { ru } from '../src/webview/i18n/ru.js';
import { ja } from '../src/webview/i18n/ja.js';

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

export async function runI18nSystemTests(): Promise<boolean> {
  console.log('\n--- Running Internationalization (i18n) System Test Suite (7 Languages) ---');
  let passed = 0;

  try {
    // 1. Structural Symmetry & Completeness Across 7 Dictionaries (ES, EN, ZH-CN, DE, FR, RU, JA)
    console.log('\n[1. Structural Symmetry & Completeness Across 7 Dictionaries]');
    const dicts = { es, en, 'zh-cn': zhCn, de, fr, ru, ja };
    const dictNames = Object.keys(dicts) as (keyof typeof dicts)[];
    const sections = Object.keys(es) as (keyof typeof es)[];
    assert(sections.length > 0, 'Spanish dictionary has sections');

    for (const name of dictNames) {
      const d = dicts[name];
      assert(Object.keys(d).length === sections.length, `Dictionary ${name} has exact same section count as ES (${sections.length})`);
    }
    passed++;
    console.log(`  ✅ [PASS] All 7 dictionaries contain ${sections.length} top-level sections`);

    for (const section of sections) {
      const esSection = es[section] as Record<string, string>;
      const esKeys = Object.keys(esSection);

      for (const name of dictNames) {
        const dSection = dicts[name][section] as Record<string, string>;
        const dKeys = Object.keys(dSection);
        assert(esKeys.length === dKeys.length, `Section ${section} has same key count in ES (${esKeys.length}) and ${name} (${dKeys.length})`);

        for (const k of esKeys) {
          assert(dSection[k] !== undefined, `Key "${section}.${k}" exists in ${name} dictionary`);
          assert(typeof dSection[k] === 'string' && dSection[k].length > 0, `Key "${section}.${k}" is non-empty in ${name}`);
        }
      }
    }
    passed++;
    console.log('  ✅ [PASS] 100% key symmetry verified across all 7 dictionaries with non-empty values');

    // 2. Locale Auto-Detection & Sanitization
    console.log('\n[2. Locale Auto-Detection & Sanitization]');
    const localeTests: [string, string][] = [
      ['es-ES', 'es'],
      ['es-419', 'es'],
      ['en-GB', 'en'],
      ['en-US', 'en'],
      ['zh-CN', 'zh-cn'],
      ['zh-Hans', 'zh-cn'],
      ['de-DE', 'de'],
      ['de-AT', 'de'],
      ['fr-FR', 'fr'],
      ['fr-CA', 'fr'],
      ['ru-RU', 'ru'],
      ['ja-JP', 'ja'],
      ['it-IT', 'en'], // fallback
    ];

    for (const [inputLocale, expectedLang] of localeTests) {
      I18nService.initialize(inputLocale);
      assert(I18nService.getLanguage() === expectedLang, `Locale "${inputLocale}" resolved to "${expectedLang}"`);
      passed++;
      console.log(`  ✅ [PASS] Locale "${inputLocale}" resolved to "${expectedLang}"`);
    }

    // 3. Translation Retrieval and Variable Interpolation
    console.log('\n[3. Translation Retrieval and Variable Interpolation]');
    const sampleTests: { lang: keyof typeof dicts; ready: string; selectionCount: number; expectedSelection: string }[] = [
      { lang: 'es', ready: 'Listo', selectionCount: 5, expectedSelection: '5 elementos seleccionados' },
      { lang: 'en', ready: 'Ready', selectionCount: 3, expectedSelection: '3 elements selected' },
      { lang: 'zh-cn', ready: '就绪', selectionCount: 4, expectedSelection: '已选择 4 个元素' },
      { lang: 'de', ready: 'Bereit', selectionCount: 2, expectedSelection: '2 Elemente ausgewählt' },
      { lang: 'fr', ready: 'Prêt', selectionCount: 6, expectedSelection: '6 éléments sélectionnés' },
      { lang: 'ru', ready: 'Готово', selectionCount: 7, expectedSelection: 'Выбрано элементов: 7' },
      { lang: 'ja', ready: '準備完了', selectionCount: 8, expectedSelection: '8 個の要素を選択中' },
    ];

    for (const st of sampleTests) {
      I18nService.setLanguage(st.lang as any);
      assert(I18nService.t('common.ready') === st.ready, `${st.lang} common.ready is "${st.ready}"`);
      assert(
        I18nService.t('statusbar.selectionMultiple', { count: st.selectionCount }) === st.expectedSelection,
        `Variable {count} interpolated in ${st.lang}`
      );
      passed++;
      console.log(`  ✅ [PASS] Accurate translations and parameter substitution in [${st.lang}]`);
    }

    // 4. Interactive 7-State Language Toggle & Event Dispatching
    console.log('\n[4. Interactive 7-State Language Toggle & Event Dispatching]');
    I18nService.setLanguage('es');
    let notifiedLang = '';
    const unsubscribe = I18nService.onLanguageChange((lang) => {
      notifiedLang = lang;
    });

    const expectedSequence = ['en', 'zh-cn', 'de', 'fr', 'ru', 'ja', 'es'];
    for (const nextLang of expectedSequence) {
      const toggled = I18nService.toggleLanguage();
      assert(toggled === nextLang, `toggleLanguage switched to ${nextLang}`);
      assert(notifiedLang === nextLang, `Observer was notified of switch to "${nextLang}"`);
      passed++;
      console.log(`  ✅ [PASS] toggleLanguage switched to "${nextLang}" and notified subscribers`);
    }

    unsubscribe();
    I18nService.setLanguage('en');
    assert(notifiedLang === 'es', 'Unsubscribed listener was not invoked after removal');
    passed++;
    console.log('  ✅ [PASS] Unsubscription cleanly detaches observer');

    // 5. IDE Language Auto-Detection & Dynamic Sync
    console.log('\n[5. IDE Language Auto-Detection & Dynamic Sync]');
    // Reset to auto with German IDE
    I18nService.setLanguage('auto');
    I18nService.initialize('de-DE');
    assert(I18nService.isAuto() === true, 'Auto mode is active on initialization');
    assert(I18nService.getIdeLanguage() === 'de', 'IDE language resolved to de');
    assert(I18nService.getLanguage() === 'de', 'Current language matches IDE language (de)');
    assert(
      I18nService.t('statusbar.languageAuto', { lang: 'Deutsch' }) === 'Automatisch (IDE: Deutsch)',
      'Variable {lang} interpolated properly in statusbar.languageAuto (de)'
    );

    // Dynamic sync from host when in auto mode
    I18nService.setIdeLanguage('ja-JP');
    assert(I18nService.getIdeLanguage() === 'ja', 'IDE language updated to ja');
    assert(I18nService.getLanguage() === 'ja', 'Current language updated dynamically to ja');

    // User manual override switches out of auto mode
    I18nService.setLanguage('fr');
    assert(I18nService.isAuto() === false, 'Manual language selection turns off auto mode');
    assert(I18nService.getLanguage() === 'fr', 'Current language set to fr');

    // Dynamic sync from host does not overwrite manual override
    I18nService.setIdeLanguage('ru-RU');
    assert(I18nService.getIdeLanguage() === 'ru', 'IDE language updated to ru');
    assert(I18nService.getLanguage() === 'fr', 'Manual language fr was preserved despite IDE language changing');

    // Reverting to auto mode
    I18nService.setLanguage('auto');
    assert(I18nService.isAuto() === true, 'Reverted back to auto mode');
    assert(I18nService.getLanguage() === 'ru', 'Language immediately synchronized to IDE language (ru)');
    passed++;
    console.log('  ✅ [PASS] IDE language auto-detection, manual override isolation, and auto revert working flawlessly');

    console.log(`\nI18n System Tests complete: ${passed} passed, 0 failed.\n`);
    return true;
  } catch (err) {
    console.error('❌ I18n System Test Suite failed:', err);
    return false;
  }
}
