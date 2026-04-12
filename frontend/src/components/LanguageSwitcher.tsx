import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown } from 'lucide-react';

const LANGUAGES = [
  { code: 'en', label: 'English',    flag: '🇬🇧' },
  { code: 'hi', label: 'हिन्दी',      flag: '🇮🇳' },
  { code: 'bn', label: 'বাংলা',      flag: '🇮🇳' },
  { code: 'te', label: 'తెలుగు',     flag: '🇮🇳' },
  { code: 'mr', label: 'मराठी',      flag: '🇮🇳' },
  { code: 'ta', label: 'தமிழ்',      flag: '🇮🇳' },
  { code: 'es', label: 'Español',    flag: '🇪🇸' },
  { code: 'fr', label: 'Français',   flag: '🇫🇷' },
  { code: 'zh', label: '中文',        flag: '🇨🇳' },
  { code: 'ar', label: 'العربية',     flag: '🇸🇦' },
  { code: 'de', label: 'Deutsch',    flag: '🇩🇪' },
] as const;

interface LanguageSwitcherProps {
  onLanguageChange?: (code: string) => void;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ onLanguageChange }) => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentLang = LANGUAGES.find(l => l.code === i18n.language) ?? LANGUAGES[0];

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSwitch = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem('t2d_language', code);
    // Apply RTL for Arabic
    document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';
    onLanguageChange?.(code);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-500 hover:text-blue-600 transition-all text-xs font-medium shadow-sm"
        title="Switch Language"
      >
        <Globe size={14} />
        <span>{currentLang.flag} {currentLang.label}</span>
        <ChevronDown size={12} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute top-full right-0 mt-1.5 w-48 rounded-2xl shadow-xl border border-slate-200/60 bg-white/95 backdrop-blur-md z-50 overflow-hidden"
          style={{ maxHeight: '320px', overflowY: 'auto' }}
        >
          {LANGUAGES.map(lang => {
            const isActive = lang.code === i18n.language;
            return (
              <button
                key={lang.code}
                onClick={() => handleSwitch(lang.code)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="text-base">{lang.flag}</span>
                <span>{lang.label}</span>
                {isActive && (
                  <span className="ml-auto text-xs text-blue-500 font-semibold">✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
