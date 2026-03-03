import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';

interface SplashScreenProps {
  visible: boolean;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ visible }) => {
  const [appVersion, setAppVersion] = useState('');
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  useEffect(() => {
    if (!visible) {
      setFadeOut(true);
    }
  }, [visible]);

  if (!visible && fadeOut) {
    // Keep rendering during fade-out, remove after animation
    return (
      <div
        className="splash-screen splash-fadeout"
        onAnimationEnd={() => setFadeOut(false)}
      >
        <SplashContent version={appVersion} />
      </div>
    );
  }

  if (!visible) return null;

  return (
    <div className="splash-screen">
      <SplashContent version={appVersion} />
    </div>
  );
};

const SplashContent: React.FC<{ version: string }> = ({ version }) => (
  <div className="flex flex-col items-center gap-6">
    <div className="splash-logo-pulse">
      <img
        src="logo.png"
        alt="Annotix"
        className="h-24 w-24 object-contain drop-shadow-lg"
      />
    </div>

    <div className="text-center">
      <h1 className="text-4xl font-bold text-white tracking-tight">
        Annotix
      </h1>
      {version && (
        <p className="text-white/60 text-sm mt-1 font-mono">v{version}</p>
      )}
    </div>

    <div className="text-center mt-2">
      <p className="text-white/50 text-xs">
        TecMedHub &middot; Universidad Austral de Chile
      </p>
    </div>

    <div className="mt-4">
      <div className="splash-dots">
        <span /><span /><span />
      </div>
    </div>
  </div>
);
