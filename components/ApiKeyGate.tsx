import React, { useState, useEffect } from 'react';

interface ApiKeyGateProps {
  children: React.ReactNode;
}

// AIStudio interface and window.aistudio are now declared globally in src/types.ts

export const ApiKeyGate: React.FC<ApiKeyGateProps> = ({ children }) => {
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    checkKey();
  }, []);

  const checkKey = async () => {
    try {
      if (window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      } else {
        // If aistudio is not available, assume not selected or handled elsewhere
        setHasKey(false);
      }
    } catch (e) {
      setHasKey(false);
    }
  };

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
    }
    // Assume success as per instructions to avoid race conditions
    setHasKey(true);
  };

  if (hasKey === null) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!hasKey) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center shadow-2xl">
          <div className="mb-6 inline-flex p-4 bg-indigo-500/10 rounded-full">
            <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">API Key Required</h1>
          <p className="text-neutral-400 mb-8 text-sm leading-relaxed">
            Veo video generation requires a paid API key. Please select a key from a project with billing enabled to continue.
          </p>
          <button
            onClick={handleSelectKey}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-95 mb-4"
          >
            Select API Key
          </button>
          <a
            href="https://ai.google.dev/gemini-api/docs/billing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-neutral-500 hover:text-neutral-300 underline underline-offset-4"
          >
            Learn about Billing Setup
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};