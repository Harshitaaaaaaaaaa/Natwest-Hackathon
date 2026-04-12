import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import hi from './locales/hi.json';
import bn from './locales/bn.json';
import te from './locales/te.json';
import mr from './locales/mr.json';
import ta from './locales/ta.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import zh from './locales/zh.json';
import ar from './locales/ar.json';
import de from './locales/de.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      bn: { translation: bn },
      te: { translation: te },
      mr: { translation: mr },
      ta: { translation: ta },
      es: { translation: es },
      fr: { translation: fr },
      zh: { translation: zh },
      ar: { translation: ar },
      de: { translation: de },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes by default
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 't2d_language',
    },
  });

export default i18n;
