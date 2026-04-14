import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Globe } from 'lucide-react';

const LANGUAGES = [
  { code: 'en', label: 'English', flag: 'GB' },
  { code: 'hi', label: 'Hindi', flag: 'IN' },
  { code: 'bn', label: 'Bangla', flag: 'IN' },
  { code: 'te', label: 'Telugu', flag: 'IN' },
  { code: 'mr', label: 'Marathi', flag: 'IN' },
  { code: 'ta', label: 'Tamil', flag: 'IN' },
  { code: 'es', label: 'Espanol', flag: 'ES' },
  { code: 'fr', label: 'Francais', flag: 'FR' },
  { code: 'zh', label: 'Chinese', flag: 'CN' },
  { code: 'ar', label: 'Arabic', flag: 'SA' },
  { code: 'de', label: 'Deutsch', flag: 'DE' },
] as const;

interface LanguageSwitcherProps {
  onLanguageChange?: (code: string) => void;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ onLanguageChange }) => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentLang = LANGUAGES.find((lang) => lang.code === i18n.language) ?? LANGUAGES[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSwitch = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem('t2d_language', code);
    document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';
    onLanguageChange?.(code);
    setOpen(false);
  };

  return (
    <div className="relative w-full min-w-0" ref={ref}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-9 w-full min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-medium text-zinc-300 transition-all hover:border-violet-400/30 hover:bg-white/[0.07] hover:text-white"
        title="Switch language"
      >
        <Globe size={14} className="shrink-0" />
        <span className="shrink-0">{currentLang.flag}</span>
        <span className="min-w-0 flex-1 truncate text-left">{currentLang.label}</span>
        <ChevronDown size={12} className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="custom-scrollbar absolute left-0 top-full z-50 mt-2 w-full min-w-[180px] max-w-[220px] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/96 p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
          style={{ maxHeight: '260px' }}
        >
          {LANGUAGES.map((lang) => {
            const isActive = lang.code === i18n.language;

            return (
              <button
                key={lang.code}
                onClick={() => handleSwitch(lang.code)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12px] transition-all ${
                  isActive
                    ? 'bg-violet-500/15 text-violet-200 shadow-[0_0_18px_rgba(168,85,247,0.18)]'
                    : 'text-zinc-300 hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                <span className="shrink-0 text-[10px] font-semibold text-zinc-500">{lang.flag}</span>
                <span className="min-w-0 flex-1 truncate">{lang.label}</span>
                {isActive && <span className="ml-auto shrink-0 text-[10px] font-semibold text-violet-300">Active</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
