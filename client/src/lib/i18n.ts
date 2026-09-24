import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Only the English namespaces that the entry chunk's own modules use (Home,
// the header and footer, route guards, the backend banner, the not-found page
// and the always-loaded libraries) ship in the entry chunk; the named imports
// let the bundler drop every other namespace from it (gate G3). The complete
// English file is a separate chunk that every code-split page waits for (see
// `ensureAllStrings`), and Arabic is fetched only when the detector or the
// toggle selects it. `partialBundledLanguages` lets i18next start with this
// subset while the other bundles are still loading.
import {
  a11y,
  analytics,
  auth,
  backend,
  common,
  dashboardV2,
  errors,
  format,
  guard,
  landing,
  mentors,
  nav,
  showcase,
} from '../locales/en.json';

const resources = {
  en: {
    translation: { a11y, analytics, auth, backend, common, dashboardV2, errors, format, guard, landing, mentors, nav, showcase },
  },
};

const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

const updateDocumentDirection = (lng: string) => {
  const dir = RTL_LANGUAGES.includes(lng) ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = lng;
};

const loadedBundles = new Set<string>();
let arabicLoading: Promise<boolean> | null = null;
let englishLoading: Promise<boolean> | null = null;
/** Set once a code-split page asked for every string: English is then completed on demand too. */
let allStringsWanted = false;

function loadCompleteEnglish(): Promise<boolean> {
  if (loadedBundles.has('en')) return Promise.resolve(false);
  if (!englishLoading) {
    englishLoading = import('../locales/en.json?raw')
      .then((mod) => {
        i18n.addResourceBundle('en', 'translation', JSON.parse(mod.default), true, false);
        loadedBundles.add('en');
        return true;
      })
      .catch((error) => {
        englishLoading = null;
        console.error('Could not load the English strings', error);
        return false;
      });
  }
  return englishLoading;
}

function loadArabic(): Promise<boolean> {
  if (loadedBundles.has('ar')) return Promise.resolve(false);
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

/**
 * Resolve once the given language's strings are registered. Resolves `true`
 * when a bundle was fetched by this call (callers then re-render), `false`
 * when it was already present or is not needed yet. English is completed only
 * after a code-split page asked for it (`ensureAllStrings`).
 */
export function ensureLanguageLoaded(lng: string): Promise<boolean> {
  const base = lng.split('-')[0];
  if (base === 'ar') return loadArabic();
  if (base === 'en' && allStringsWanted) return loadCompleteEnglish();
  return Promise.resolve(false);
}

/**
 * Every string a code-split page may use: the complete English file (also the
 * fallback language) and the current language's bundle. Never rejects: a
 * failed download leaves the page on the strings already loaded.
 */
export function ensureAllStrings(): Promise<void> {
  allStringsWanted = true;
  const current = (i18n.language || 'en').split('-')[0];
  return Promise.all([loadCompleteEnglish(), current === 'en' ? Promise.resolve(false) : ensureLanguageLoaded(current)]).then(
    (fetched) => {
      if (fetched.some(Boolean)) i18n.emit('languageChanged', i18n.language);
    },
  );
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
