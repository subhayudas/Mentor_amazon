import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../locales/en.json';
import ar from '../locales/ar.json';

const resources = {
  en: { translation: en },
  ar: { translation: ar },
};

const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

const updateDocumentDirection = (lng: string) => {
  const dir = RTL_LANGUAGES.includes(lng) ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = lng;
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
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
});

i18n.on('languageChanged', (lng) => {
  updateDocumentDirection(lng);
});

if (typeof document !== 'undefined') {
  updateDocumentDirection(i18n.language || 'en');
}

export const isRTL = () => RTL_LANGUAGES.includes(i18n.language);

export default i18n;
