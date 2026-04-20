
import React, { useState, useRef, useEffect } from 'react';
import { Send, RotateCcw, Copy, Check, Wand2, Eraser, Zap, MessageSquare } from 'lucide-react';
import { EditorState, AIMessage, EditorMode } from '../types';
import { generateCompletion, editContent } from '../services/geminiService';

interface AIPanelProps {
  editorState: EditorState;
  onContentUpdate: (content: string) => void;
}

const AIPanel: React.FC<AIPanelProps> = ({ editorState, onContentUpdate }) => {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: AIMessage = {
      role: 'user',
      content: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await generateCompletion(input, editorState.content);
      const assistantMessage: AIMessage = {
        role: 'assistant',
        content: response || "I'm sorry, I couldn't generate a response.",
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Error: Failed to connect to Gemini API.",
        timestamp: Date.now()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const applyAction = async (action: string) => {
    setIsLoading(true);
    try {
      // Fix: editorState.mode is passed correctly to editContent which now accepts EditorMode.
      const result = await editContent(action, editorState.content, editorState.mode);
      if (result) onContentUpdate(result);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editorState.content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Refined quick actions to respect EditorMode and avoid showing code actions in Image mode.
  const quickActions = editorState.mode === EditorMode.TEXT ? [
    { label: 'Fix Grammar', instruction: 'Fix all grammar and spelling mistakes' },
    { label: 'Summarize', instruction: 'Summarize this content in 3 bullet points' },
    { label: 'Tone: Professional', instruction: 'Rewrite this with a professional, confident tone' },
    { label: 'Elaborate', instruction: 'Expand on the main points with more detail' }
  ] : editorState.mode === EditorMode.CODE ? [
    { label: 'Fix Bugs', instruction: 'Find and fix logic errors in this code' },
    { label: 'Optimize', instruction: 'Make this code more efficient and readable' },
    { label: 'Add Comments', instruction: 'Add clear JSDoc comments to this code' },
    { label: 'Explain', instruction: 'Explain how this code works in detail' }
  ] : [];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <Zap size={18} className="text-amber-500 fill-amber-500" />
          Intelligence
        </h3>
        <button 
          onClick={() => setMessages([])}
          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md"
          title="Clear chat"
        >
          <Eraser size={16} />
        </button>
      </div>

      {/* Quick Actions Scroll */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action, i) => (
            <button
              key={i}
              onClick={() => applyAction(action.instruction)}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 rounded-full hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chat History */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-60 px-4">
            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <MessageSquare className="text-slate-400" size={24} />
            </div>
            <p className="text-sm text-slate-500">
              Ask me to help write, code, or generate ideas. I have context of your current work.
            </p>
          </div>
        )}
        
        {messages.map((msg, i) => (
          <div 
            key={i} 
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div 
              className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                msg.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-tr-none' 
                  : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'
              }`}
            >
              {msg.content}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 uppercase">
              {msg.role} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex items-start gap-2">
            <div className="bg-slate-100 p-3 rounded-2xl border border-slate-200 flex gap-1">
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-slate-100">
        <form 
          onSubmit={handleSendMessage}
          className="relative"
        >
          <input 
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask AI anything..."
            className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all"
          />
          <button 
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-30"
          >
            <Send size={18} />
          </button>
        </form>
        
        <div className="flex items-center justify-between mt-3 px-1">
          <button 
            onClick={handleCopy}
            className="text-[10px] flex items-center gap-1 text-slate-400 hover:text-slate-600 font-medium uppercase tracking-tighter"
          >
            {isCopied ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
            {isCopied ? 'Copied' : 'Copy All'}
          </button>
          <button 
             onClick={() => applyAction("Polish this work")}
             className="text-[10px] flex items-center gap-1 text-indigo-500 hover:text-indigo-700 font-bold uppercase tracking-tighter"
          >
            <Wand2 size={10} />
            Auto-Polish
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIPanel;
