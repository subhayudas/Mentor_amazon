import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../locales/en.json';

// English ships in the entry chunk; Arabic is fetched only when the detector
// or the toggle selects it, which keeps ~70 kB out of the first load for
// English readers. `partialBundledLanguages` lets i18next start with English
// while the other bundle is still loading.
const resources = {
  en: { translation: en },
};

const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

const updateDocumentDirection = (lng: string) => {
  const dir = RTL_LANGUAGES.includes(lng) ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = lng;
};

const loadedBundles = new Set<string>(['en']);
let arabicLoading: Promise<boolean> | null = null;

/**
 * Resolve once the given language's strings are registered. Resolves `true`
 * when a bundle was fetched by this call (callers then re-render), `false`
 * when it was already present or the language is bundled.
 */
export function ensureLanguageLoaded(lng: string): Promise<boolean> {
  const base = lng.split('-')[0];
  if (loadedBundles.has(base) || base !== 'ar') return Promise.resolve(false);
  if (!arabicLoading) {
    arabicLoading = import('../locales/ar.json')
      .then((mod) => {
        i18n.addResourceBundle('ar', 'translation', mod.default, true, true);
        loadedBundles.add('ar');
        return true;
      })
      .catch((error) => {
        arabicLoading = null;
        console.error('Could not load Arabic strings', error);
        return false;
      });
  }
  return arabicLoading;
}

/** Fetch the bundle if needed; once it lands, tell react-i18next to re-render. */
function activate(lng: string): void {
  void ensureLanguageLoaded(lng).then((loaded) => {
    if (loaded && i18n.language.split('-')[0] === lng.split('-')[0]) {
      i18n.emit('languageChanged', i18n.language);
    }
  });
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    partialBundledLanguages: true,
    fallbackLng: 'en',
    supportedLngs: ['en', 'ar'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

i18n.on('initialized', () => {
  updateDocumentDirection(i18n.language);
  activate(i18n.language); // detector may have chosen Arabic on first load
});

i18n.on('languageChanged', (lng) => {
  updateDocumentDirection(lng);
  activate(lng);
});

if (typeof document !== 'undefined') {
  updateDocumentDirection(i18n.language || 'en');
}

export const isRTL = () => RTL_LANGUAGES.includes(i18n.language);

export default i18n;
