
import React from 'react';

interface Props {
  onSuccess: () => void;
}

const ApiKeyRequired: React.FC<Props> = ({ onSuccess }) => {
  const handleSelect = async () => {
    // Guidelines: Use window.aistudio.openSelectKey() to open a dialog for the user to select their API key.
    // @ts-ignore
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      // @ts-ignore
      await window.aistudio.openSelectKey();
    }
    // Assuming success as per instructions to avoid race conditions
    onSuccess();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 glass rounded-3xl max-w-2xl mx-auto border border-violet-500/30">
      <div className="w-20 h-20 bg-violet-600/20 rounded-full flex items-center justify-center mb-6 neon-border">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3y-2.5-2.5z"/></svg>
      </div>
      <h2 className="text-3xl font-bold mb-4">API Key Required</h2>
      <p className="text-gray-400 mb-8 max-w-md">
        To use the Gemini Veo video generation models, you must select a valid API key from a paid GCP project.
      </p>
      <button
        onClick={handleSelect}
        className="px-8 py-4 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-violet-600/25 active:scale-95"
      >
        Select API Key
      </button>
      <a 
        href="https://ai.google.dev/gemini-api/docs/billing" 
        target="_blank" 
        rel="noopener noreferrer"
        className="mt-6 text-sm text-gray-500 hover:text-violet-400 underline underline-offset-4"
      >
        Learn more about billing
      </a>
    </div>
  );
};

export default ApiKeyRequired;
