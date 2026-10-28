import React, { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { Download, Smartphone, X } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="group inline-flex items-center gap-1.5 rounded-lg bg-[#D97745] hover:bg-[#C56837] active:bg-[#B35B2B] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:shadow-md hover:shadow-[#D97745]/25 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.975] transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97745] focus-visible:ring-offset-2 focus-visible:ring-offset-[#202822]"
        title="Install GBHS Records app to your device"
      >
        <Download className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-y-0.5" />
        <span className="hidden sm:inline">Install PWA</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="group inline-flex items-center gap-1.5 rounded-lg border border-[#3D4A41] hover:border-[#9BAE9C]/60 bg-[#2B352E] hover:bg-[#344038] active:bg-[#202822] px-2.5 py-1.5 text-xs font-medium text-[#F6F3EA] shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.975] transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97745] focus-visible:ring-offset-2 focus-visible:ring-offset-[#202822]"
        >
          <Smartphone className="w-3.5 h-3.5 text-[#D97745] transition-transform duration-150 group-hover:scale-110" />
          <span className="hidden sm:inline">Install iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl bg-[#2B352E] border border-[#3D4A41] p-6 shadow-2xl text-[#F6F3EA]">
              <div className="flex items-center justify-between pb-3 border-b border-[#3D4A41]">
                <h3 className="text-base font-semibold text-white">Install on iPhone / iPad</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="text-[#9BAE9C] hover:text-white p-1 rounded-lg transition-transform duration-150 hover:scale-110 active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97745]"
                  aria-label="Close guide"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-3 text-sm text-[#9BAE9C] space-y-2">
                <span className="block">1. Tap the <strong>Share</strong> button in Safari toolbar.</span>
                <span className="block">2. Scroll down and tap <strong>Add to Home Screen</strong>.</span>
                <span className="block">3. Tap <strong>Add</strong> at the top right corner.</span>
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-[#D97745] py-2 text-xs font-semibold text-white hover:bg-[#C56837] transition"
              >
                Understood
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
