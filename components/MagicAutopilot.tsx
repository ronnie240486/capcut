
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  Upload, 
  Settings, 
  Play, 
  CheckCircle2, 
  Loader2, 
  AlertCircle,
  Volume2,
  Clock,
  Mic,
  ChevronRight,
  Brain
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { cn } from '../lib/utils';

interface MagicAutopilotProps {
  onComplete: (videoUrl: string) => void;
  onCancel: () => void;
}

const ACCENTS = [
  { id: 'puck', name: 'Puck (Enérgico)', prompt: 'Narration with an energetic and friendly tone' },
  { id: 'kore', name: 'Kore (Elegante)', prompt: 'Narration with a sophisticated and clear tone' },
  { id: 'charon', name: 'Charon (Profundo)', prompt: 'Narration with a deep and authoritative tone' },
  { id: 'fenrir', name: 'Fenrir (Sombrio)', prompt: 'Narration with a dark and mysterious tone' },
  { id: 'zephyr', name: 'Zephyr (Leve)', prompt: 'Narration with a light and airy tone' }
];

export default function MagicAutopilot({ onComplete, onCancel }: MagicAutopilotProps) {
  const [step, setStep] = useState(1); // 1: Upload, 2: Config, 3: Processing
  const [files, setFiles] = useState<File[]>([]);
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  
  // New features toggles
  const [viralMode, setViralMode] = useState(true);
  const [autoSFX, setAutoSFX] = useState(true);
  const [autoBRoll, setAutoBRoll] = useState(true);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const downloadStock = async (query: string): Promise<{ filename: string, originalname: string } | null> => {
    try {
      const res = await fetch(`/api/stock/download?query=${encodeURIComponent(query)}&type=video`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  };

  const extractFrames = async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.src = URL.createObjectURL(file);
      
      video.onloadedmetadata = () => {
        video.currentTime = Math.min(2, video.duration / 2); // Get frame at 2s or middle
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 300; // Small size for fast analysis
        canvas.height = (video.videoHeight / video.videoWidth) * canvas.width;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', 0.6);
        URL.revokeObjectURL(video.src);
        resolve(data.split(',')[1]); // Only base64 data
      };
    });
  };

  const startAutopilot = async () => {
    if (files.length === 0) return;
    setStep(3);
    setStatus('Iniciando Vision Engine...');
    setProgress(5);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      
      // Phase 1: Vision Analysis
      setStatus('Analisando visualmente seus clipes...');
      setProgress(10);
      
      const frames = await Promise.all(files.slice(0, 5).map(f => extractFrames(f)));
      
      // Analysis & Scripting
      setStatus(viralMode ? 'Buscando ganchos virais...' : 'Criando roteiro cinematográfico...');
      setProgress(25);

      const promptData = `You are a world-class professional video editor and "AI Commentator". 
      I have provided thumbnails from ${files.length} video clips.
      Analyze the visual content and create a "Reactive Narration" script.
      
      RULES FOR REACTIVE NARRATION:
      - The script must NOT be a generic commercial. It must REACT to what is happening.
      - Use phrases like "Oh look at that...", "Wait, did you see...?", "Now this is interesting...".
      - The narration must be perfectly timed to the scenes you select.
      - Express emotion: excitement, surprise, or elegance depending on the visuals.
      
      Rules for Editing:
      1. Choose the best order and exact trimming to keep the energy high.
      2. Match the "script" (narration) to the visuals.
      3. Suggest sound effects (SFX) that match visual actions (e.g., if there is a crash, add 'impact'; if a person appears, add 'shimmer').
      4. If a scene needs contextual visual proof (e.g., Paris, sports car) and the user clips don't have it, suggest a "stockTopic".
      
      Return ONLY a JSON:
      {
        "script": "The full reactive narration text to be spoken",
        "scenes": [
          { 
            "fileIndex": 0, 
            "startTime": 0, 
            "duration": 3.5, 
            "filter": "vivid", 
            "transition": "fade",
            "stockTopic": "optional query",
            "subtitles": "Text to display (should be reactive/punchy)"
          }
        ],
        "sfx": [
          { "type": "whoosh", "time": 1.2, "volume": 0.5 }
        ]
      }`;

      const imageParts = frames.map(f => ({
        inlineData: { mimeType: 'image/jpeg', data: f }
      }));

      const scriptResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { text: promptData },
            ...imageParts
          ]
        },
        config: { responseMimeType: "application/json" }
      });

      const plan = JSON.parse(scriptResponse.text || "{}");
      setProgress(40);

      // Phase: B-Roll Hunt
      const stockFiles: any[] = [];
      if (autoBRoll && plan.scenes) {
        setStatus('Buscando B-Rolls cinematográficos...');
        const uniqueTopics = Array.from(new Set(plan.scenes.map((s: any) => s.stockTopic).filter(Boolean))) as string[];
        for (const topic of uniqueTopics.slice(0, 3)) {
          const stock = await downloadStock(topic);
          if (stock) stockFiles.push(stock);
        }
      }
      setProgress(50);

      // Phase 2: TTS Generation
      setStatus('Dando voz à sua marca...');
      const ttsResponse = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: `Say with ${accent.prompt}: ${plan.script}` }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: accent.id as any },
            },
          },
        },
      });

      const audioPart = ttsResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      const audioBase64 = audioPart?.inlineData?.data;
      
      if (!audioBase64 || audioBase64.length < 10) {
        throw new Error("A IA gerou uma narração vazia. Tente novamente.");
      }
      
      setProgress(70);
      setStatus('Sincronizando áudio e efeitos...');

      // Save audio to server
      const saveRes = await fetch('/api/save-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioData: audioBase64, filename: `magic_narration_${Date.now()}.wav` })
      });
      const saveText = await saveRes.text();
      let saveData: any = {};
      try { saveData = JSON.parse(saveText); } catch(e) { throw new Error('Falha ao salvar áudio no servidor: ' + saveText.slice(0, 100)); }
      if (!saveData.filename) throw new Error('Servidor não retornou nome do arquivo de áudio.');
      const audioFile = saveData.filename;

      // Phase 3: Final Assemble (Server Side)
      setStatus('Renderizando obra-prima...');
      setProgress(85);

      // Upload files to server first
      const formData = new FormData();
      files.forEach(f => formData.append('files', f));
      // Append stock files if any (we send their names/paths back to the server)
      formData.append('stockFiles', JSON.stringify(stockFiles));
      formData.append('plan', JSON.stringify(plan));
      formData.append('narrationFile', audioFile);

      const exportRes = await fetch('/api/autopilot/render', {
        method: 'POST',
        body: formData
      });

      const exportText = await exportRes.text();
      let exportData: any = {};
      try {
        exportData = JSON.parse(exportText);
      } catch (e) {
        throw new Error(`Servidor retornou resposta inválida: ${exportText.slice(0, 200)}`);
      }
      if (!exportRes.ok || !exportData.jobId) {
        throw new Error(exportData.error || `Erro HTTP ${exportRes.status}: ${exportText.slice(0, 200)}`);
      }
      const { jobId } = exportData;

      // Poll for job
      const poll = setInterval(async () => {
         const sRes = await fetch(`/api/process/status/${jobId}`);
         const sData = await sRes.json();
         if (sData.status === 'completed') {
           clearInterval(poll);
           setProgress(100);
           onComplete(sData.downloadUrl);
         } else if (sData.status === 'failed') {
           clearInterval(poll);
           setError(sData.error || 'Falha na renderização');
         }
      }, 2000);

    } catch (e: any) {
      console.error(e);
      setError(e.message || "Erro desconhecido");
    }
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-8 w-full max-w-3xl relative overflow-hidden">
      <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
         <Brain className="w-48 h-48" />
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div 
            key="upload" 
            initial={{ opacity: 0, x: -20 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 bg-accent/20 rounded-lg flex items-center justify-center">
                 <Sparkles className="w-6 h-6 text-accent" />
               </div>
               <div>
                  <h2 className="text-xl font-black uppercase tracking-tight">Criação Pro Inteligente</h2>
                  <p className="text-xs text-muted font-bold uppercase tracking-widest opacity-60">Superando o CapCut com IA Visionária</p>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               {[
                 { id: 'viral', icon: 'fa-fire', title: 'Destaque Viral', desc: 'Extração automática de melhores momentos.', state: viralMode, set: setViralMode },
                 { id: 'sfx', icon: 'fa-volume-high', title: 'Auto-SFX', desc: 'Efeitos sonoros no tempo perfeito.', state: autoSFX, set: setAutoSFX },
                 { id: 'broll', icon: 'fa-images', title: 'Auto-B-Roll', desc: 'Footage de banco para ilustrar sua fala.', state: autoBRoll, set: setAutoBRoll }
               ].map(feat => (
                 <button 
                  key={feat.id}
                  onClick={() => feat.set(!feat.state)}
                  className={cn(
                    "p-4 rounded-xl border transition-all text-left group",
                    feat.state ? "bg-accent/10 border-accent shadow-lg shadow-accent/5" : "bg-bg border-border opacity-60 grayscale"
                  )}
                 >
                    <i className={cn("fas mb-3 text-lg transition-transform group-hover:scale-125", feat.icon, feat.state ? "text-accent" : "text-muted")}></i>
                    <h4 className="text-[10px] font-black uppercase tracking-widest mb-1">{feat.title}</h4>
                    <p className="text-[9px] text-muted font-medium leading-tight">{feat.desc}</p>
                 </button>
               ))}
            </div>

            <div 
              onClick={() => document.getElementById('magic-upload')?.click()}
              className="border-2 border-dashed border-border rounded-xl h-48 flex flex-col items-center justify-center gap-4 hover:border-accent hover:bg-accent/5 transition-all cursor-pointer group"
            >
               <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center group-hover:scale-110 transition-transform">
                 <Upload className="w-5 h-5 text-muted group-hover:text-accent" />
               </div>
               <div className="text-center">
                 <p className="text-[10px] font-black uppercase tracking-widest mb-1">Importe seus clipes brutos</p>
                 <p className="text-[9px] text-muted uppercase font-bold opacity-40">MP4, MOV, WEBM • Mínimo 1 arquivo</p>
               </div>
               <input 
                id="magic-upload" 
                type="file" 
                multiple 
                hidden 
                onChange={handleFileChange} 
                accept="video/*"
               />
            </div>

            {files.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-bg rounded border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{files.length} Vídeos Carregados</span>
                </div>
                <button 
                  onClick={() => setStep(2)}
                  className="flex items-center gap-2 text-accent font-black text-[10px] uppercase tracking-widest hover:translate-x-1 transition-transform"
                >
                  Continuar <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </motion.div>
        )}

        {step === 2 && (
          <motion.div 
            key="config" 
            initial={{ opacity: 0, x: -20 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: 20 }}
            className="space-y-10"
          >
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted">Ajuste de Personalidade da IA</h3>
              <div className="grid grid-cols-1 gap-3">
                {ACCENTS.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setAccent(a)}
                    className={cn(
                      "flex items-center justify-between p-5 border rounded-lg transition-all",
                      accent.id === a.id ? "border-accent bg-accent/10" : "border-border hover:border-muted bg-bg/50"
                    )}
                  >
                    <div className="flex items-center gap-4">
                       <Volume2 className={cn("w-5 h-5", accent.id === a.id ? "text-accent" : "text-muted")} />
                       <div className="text-left">
                          <p className="text-[11px] font-black uppercase tracking-widest">{a.name}</p>
                          <p className="text-[9px] text-muted font-bold uppercase opacity-50">{a.prompt}</p>
                       </div>
                    </div>
                    {accent.id === a.id && <CheckCircle2 className="w-4 h-4 text-accent" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-4">
               <button 
                onClick={() => setStep(1)}
                className="flex-1 py-4 border border-border rounded text-[11px] font-black uppercase tracking-widest hover:bg-surface"
               >
                 Voltar
               </button>
               <button 
                onClick={startAutopilot}
                className="flex-[2] py-4 bg-accent text-black rounded text-[11px] font-black uppercase tracking-[0.2em] shadow-[0_10px_30px_rgba(0,255,87,0.2)] hover:scale-105 active:scale-100 transition-all"
               >
                 GERAR OBRA-PRIMA
               </button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div 
            key="processing" 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }} 
            className="flex flex-col items-center justify-center space-y-10 py-10"
          >
            <div className="relative">
               <div className="w-24 h-24 rounded-full border-4 border-muted/20 flex items-center justify-center">
                  <Loader2 className="w-10 h-10 text-accent animate-spin" />
               </div>
               <div className="absolute inset-0 flex items-center justify-center opacity-20">
                  <Brain className="w-12 h-12 text-accent" />
               </div>
            </div>

            <div className="text-center space-y-3">
               <p className="text-sm font-black uppercase tracking-[0.3em] text-accent animate-pulse">{status}</p>
               <p className="text-[10px] text-muted font-bold uppercase tracking-widest opacity-60 italic">Isso pode levar de 3 a 5 minutos</p>
            </div>

            <div className="w-full bg-border h-1 rounded-full overflow-hidden">
               <motion.div 
                className="h-full bg-accent"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
               />
            </div>

            {error && (
              <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded text-red-500 w-full">
                 <AlertCircle className="w-5 h-5 flex-shrink-0" />
                 <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">{error}</p>
              </div>
            )}
            
            {(error || progress === 100) && (
              <button 
                onClick={onCancel}
                className="text-[10px] font-black text-muted hover:text-text uppercase tracking-widest transition-colors"
              >
                {progress === 100 ? 'Fechar' : 'Cancelar e Voltar'}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
