import React from 'react';
import { useAppContext } from './stores/appStore';
import { PresentationShell } from './components/PresentationShell';
import { Onboarding } from './components/Onboarding';
import { TrustTransition } from './components/TrustTransition';
import { Login } from './components/Login';
import { FileUploader } from './components/FileUploader';

const AppContent: React.FC = () => {
  const { appView } = useAppContext();

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-8 font-sans">
      <div className="w-full max-w-7xl h-[88vh] main-container flex overflow-hidden">
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
