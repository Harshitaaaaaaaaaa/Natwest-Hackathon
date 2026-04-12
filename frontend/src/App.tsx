import React from 'react';
import { useAppContext } from './stores/appStore';
import { PresentationShell } from './components/PresentationShell';
import { Onboarding } from './components/Onboarding';
import { TrustTransition } from './components/TrustTransition';
import { Login } from './components/Login';
import { FileUploader } from './components/FileUploader';
import { useTranslation } from 'react-i18next';
import { useBlindMode } from './hooks/useBlindMode';

const AppContent: React.FC = () => {
  const { appView, blindMode, setBlindMode } = useAppContext();
  const { t } = useTranslation();

  // ── Blind‑Mode hook: spacebar activation + button focus reader ──
  useBlindMode(blindMode, setBlindMode);

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-8 font-sans">

      {/* ── Blind‑mode banner ─────────────────────────────────── */}
      {blindMode && (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-blue-600 text-white text-center py-2 text-sm font-semibold tracking-wide shadow-lg animate-pulse"
          role="status" aria-live="assertive"
        >
          ♿ BLIND MODE ACTIVE — Tab to navigate · Buttons read aloud · AI auto-speaks · Enter to voice‑query
        </div>
      )}

      <div className="w-full max-w-7xl h-[88vh] main-container flex overflow-hidden">
        {appView === 'booting' && (
          <div className="w-full h-full flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 animate-pulse mb-4" />
            <p className="text-slate-400 font-medium">{t('configuringApp')}</p>
          </div>
        )}
        {appView === 'login' && <Login />}
        {appView === 'upload' && <FileUploader />}
        {appView === 'onboarding' && <Onboarding />}
        {appView === 'transition' && <TrustTransition />}
        {appView === 'chat' && <PresentationShell />}
      </div>
    </div>
  );
};

export default AppContent;
