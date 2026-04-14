import React from 'react';
import { RefreshCw, Server, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FileUploader } from './components/FileUploader';
import { Login } from './components/Login';
import { Onboarding } from './components/Onboarding';
import { PresentationShell } from './components/PresentationShell';
import { TrustTransition } from './components/TrustTransition';
import { useBlindMode } from './hooks/useBlindMode';
import { useAppContext } from './stores/appStore';

const AppContent: React.FC = () => {
  const { appView, blindMode, setBlindMode, warmupState, retryWarmup } = useAppContext();
  const { t } = useTranslation();

  useBlindMode(blindMode, setBlindMode);

  return (
    <div className="min-h-screen w-full bg-black p-2 font-sans md:p-3">
      {blindMode && (
        <div
          className="fixed left-3 right-3 top-3 z-[9999] rounded-2xl bg-violet-600/90 py-2 text-center text-xs font-semibold tracking-wide text-white shadow-[0_0_18px_rgba(168,85,247,0.45)] animate-pulse md:text-sm"
          role="status"
          aria-live="assertive"
        >
          BLIND MODE ACTIVE - Tab to navigate - Buttons read aloud - AI auto-speaks - Enter to voice-query
        </div>
      )}

      <div className="main-container mx-auto flex h-[calc(100vh-16px)] min-h-0 max-h-[940px] w-full max-w-[1600px] overflow-hidden md:h-[calc(100vh-24px)]">
        {appView === 'booting' && (
          <div className="flex h-full w-full items-center justify-center bg-black px-4">
            <div className="w-full max-w-[520px] rounded-[1.35rem] border border-white/8 bg-[linear-gradient(180deg,rgba(10,13,20,0.94),rgba(7,9,14,0.96))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.5)]">
              <div className="mb-5 flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-[1rem] bg-[linear-gradient(135deg,rgba(77,226,255,0.18),rgba(180,108,255,0.2))] shadow-[0_0_24px_rgba(77,226,255,0.12),0_0_28px_rgba(180,108,255,0.12)]">
                  <Zap className="h-6 w-6 text-white animate-pulse" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Setting Things Up</p>
                  <h2 className="mt-1 text-[1.2rem] font-semibold text-white">{t('configuringApp')}</h2>
                  <p className="mt-1 text-[13px] text-zinc-400">{warmupState.message}</p>
                </div>
              </div>

              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between text-[11px] text-zinc-500">
                  <span>Warm-up progress</span>
                  <span>{warmupState.progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#26d9ff_0%,#6ea6ff_40%,#a85cff_72%,#cf78ff_100%)] transition-all duration-500 ease-out"
                    style={{ width: `${warmupState.progress}%` }}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Server className="h-4 w-4 text-cyan-300" />
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Backend</p>
                  </div>
                  <p className={`text-sm font-semibold ${warmupState.backend === 'ready' ? 'text-emerald-300' : warmupState.backend === 'failed' ? 'text-red-300' : 'text-zinc-200'}`}>
                    {warmupState.backend === 'ready' ? 'Ready' : warmupState.backend === 'failed' ? 'Retry needed' : 'Waking up'}
                  </p>
                </div>

                <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-violet-300" />
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Execution Engine</p>
                  </div>
                  <p className={`text-sm font-semibold ${warmupState.engine === 'ready' ? 'text-emerald-300' : warmupState.engine === 'failed' ? 'text-red-300' : 'text-zinc-200'}`}>
                    {warmupState.engine === 'ready' ? 'Ready' : warmupState.engine === 'failed' ? 'Retry needed' : 'Waking up'}
                  </p>
                </div>
              </div>

              {warmupState.canRetry && (
                <div className="mt-5 flex items-center justify-between gap-3 rounded-[1rem] border border-amber-400/12 bg-amber-400/8 p-3">
                  <p className="text-[12px] leading-relaxed text-amber-100">
                    One or more services are still waking up. Retry setup once Render finishes the cold start.
                  </p>
                  <button
                    onClick={retryWarmup}
                    className="flex h-9 shrink-0 items-center gap-2 rounded-[0.9rem] border border-white/10 bg-white/[0.06] px-3 text-[12px] font-semibold text-white transition hover:bg-white/[0.1]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                </div>
              )}
            </div>
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
