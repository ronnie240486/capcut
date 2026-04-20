
import React from 'react';
import { EditorMode } from '../types';

interface EditorContainerProps {
  mode: EditorMode;
  content: string;
  onChange: (content: string) => void;
}

const EditorContainer: React.FC<EditorContainerProps> = ({ mode, content, onChange }) => {
  const isCode = mode === EditorMode.CODE;

  return (
    <div className="h-full flex flex-col p-8 max-w-5xl mx-auto w-full">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 h-full flex flex-col overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400"></div>
            <div className="w-3 h-3 rounded-full bg-amber-400"></div>
            <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
          </div>
          <span className="text-xs font-medium text-slate-400 ml-2 uppercase tracking-wider">
            {isCode ? 'Code Buffer' : 'Draft'}
          </span>
        </div>
        
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={!isCode}
          className={`flex-1 w-full p-8 outline-none resize-none overflow-auto ${
            isCode ? 'font-mono text-sm leading-relaxed bg-[#1e293b] text-slate-300' : 'text-lg leading-relaxed text-slate-800'
          }`}
          placeholder={isCode ? "Write your code here..." : "Start typing something beautiful..."}
        />
      </div>
      
      {/* Visual Indicator of stats */}
      <div className="mt-4 flex items-center gap-6 px-2 text-xs text-slate-400 font-medium">
        <span>{content.split(/\s+/).filter(Boolean).length} words</span>
        <span>{content.length} characters</span>
        {isCode && <span>UTF-8 Encoding</span>}
      </div>
    </div>
  );
};

export default EditorContainer;
