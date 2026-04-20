
import React, { useState, useEffect, useRef } from 'react';
import { VideoAspectRatio, VideoResolution, VideoConfig } from '../types';

interface AIVideoTabProps {
  onGenerate: (config: VideoConfig) => Promise<void>;
  isGenerating: boolean;
}

const LOADING_MESSAGES = [
  "Iniciando motor de renderização quântica...",
  "Esculpindo fótons digitais com Veo...",
  "Alinhando tensores temporais...",
  "Sintetizando iluminação global...",
  "Aplicando física de movimento...",
  "Renderizando detalhes cinematográficos...",
  "Finalizando sequência de vídeo..."
];

export const AIVideoTab: React.FC<AIVideoTabProps> = ({ onGenerate, isGenerating }) => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>(VideoAspectRatio.Landscape);
  const [resolution, setResolution] = useState<VideoResolution>(VideoResolution.Res720p);
  const [model, setModel] = useState<'veo-3.1-lite-generate-preview' | 'veo-3.1-generate-preview'>('veo-3.1-lite-generate-preview');
  
  const [startFrame, setStartFrame] = useState<{data: string, mimeType: string} | null>(null);
  const [endFrame, setEndFrame] = useState<{data: string, mimeType: string} | null>(null);
  const [assetImages, setAssetImages] = useState<string[]>([]);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);

  useEffect(() => {
    let interval: any;
    if (isGenerating) {
        let i = 0;
        interval = setInterval(() => {
            setLoadingMsg(LOADING_MESSAGES[i % LOADING_MESSAGES.length]);
            i++;
        }, 3000);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  // Enforce Veo Pro if assets are used
  useEffect(() => {
    if (assetImages.length > 0) {
        setModel('veo-3.1-generate-preview');
        setAspectRatio(VideoAspectRatio.Landscape);
        setResolution(VideoResolution.Res720p);
    }
  }, [assetImages]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'start' | 'end') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        const mimeType = file.type || 'image/png';
        if (type === 'start') setStartFrame({ data: result, mimeType });
        else setEndFrame({ data: result, mimeType });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAssetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).slice(0, 3).forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
           if(reader.result) setAssetImages(prev => [...prev, reader.result as string].slice(0, 3));
        };
        reader.readAsDataURL(file as Blob);
      });
    }
  };

  const removeAsset = (index: number) => {
      setAssetImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    onGenerate({
      prompt,
      aspectRatio,
      resolution,
      model,
      image: startFrame ? startFrame.data : undefined,
      imageMimeType: startFrame ? startFrame.mimeType : undefined,
      lastFrame: endFrame ? endFrame.data : undefined,
      referenceImages: assetImages.length > 0 ? assetImages : undefined
    });
  };

  return (
    <div className="flex flex-col gap-6 p-1 animate-in fade-in slide-in-from-right-4 h-full overflow-y-auto scrollbar-thin">
      <div className="bg-gradient-to-r from-indigo-900/40 to-purple-900/40 border border-indigo-500/30 p-5 rounded-2xl shadow-lg relative overflow-hidden flex-shrink-0">
        <div className="absolute top-0 right-0 p-3 opacity-20"><i className="fas fa-video text-6xl text-indigo-400"></i></div>
        <h3 className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 uppercase tracking-widest mb-2 flex items-center gap-2 relative z-10">
          <i className="fas fa-sparkles text-indigo-400"></i> Veo Video Engine
        </h3>
        <p className="text-[11px] text-indigo-200/80 leading-relaxed max-w-[90%] relative z-10">
          Gere vídeos de alta qualidade com o modelo mais avançado da Google.
        </p>
      </div>

      <div className="space-y-6 pb-20">
        <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 focus-within:border-indigo-500/50 transition-colors">
          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3 block flex justify-between">
            <span>Prompt do Vídeo</span>
            <span className={prompt.length > 0 ? "text-indigo-400" : "text-zinc-600"}>{prompt.length} chars</span>
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Descreva a cena em detalhes... Ex: Um drone voando sobre uma cidade futurista cyberpunk com luzes neon refletindo na chuva, atmosfera densa, cinematográfico..."
            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-4 text-sm text-white focus:border-indigo-500 outline-none resize-none h-32 transition-all focus:bg-black placeholder-zinc-700 leading-relaxed"
            disabled={isGenerating}
          />
        </div>

        <div>
          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3 block">Modelo</label>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button 
              onClick={() => assetImages.length === 0 && setModel('veo-3.1-lite-generate-preview')}
              disabled={assetImages.length > 0 || isGenerating}
              className={`p-3 rounded-xl border transition-all flex flex-col items-center gap-2 relative overflow-hidden group ${model === 'veo-3.1-lite-generate-preview' ? 'bg-indigo-900/20 border-indigo-500 text-white shadow-lg shadow-indigo-500/10' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600'} ${(assetImages.length > 0 || isGenerating) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${model === 'veo-3.1-lite-generate-preview' ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-500'}`}><i className="fas fa-bolt"></i></div>
              <span className="text-xs font-bold">VEO FAST</span>
              <span className="text-[9px] opacity-60">Mais Rápido</span>
            </button>
            <button 
              onClick={() => setModel('veo-3.1-generate-preview')}
              disabled={isGenerating}
              className={`p-3 rounded-xl border transition-all flex flex-col items-center gap-2 relative overflow-hidden group ${model === 'veo-3.1-generate-preview' ? 'bg-purple-900/20 border-purple-500 text-white shadow-lg shadow-purple-500/10' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600'} ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
               <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${model === 'veo-3.1-generate-preview' ? 'bg-purple-500 text-white' : 'bg-zinc-800 text-zinc-500'}`}><i className="fas fa-star"></i></div>
              <span className="text-xs font-bold">VEO PRO</span>
              <span className="text-[9px] opacity-60">Alta Qualidade</span>
            </button>
          </div>

           <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase">Proporção</label>
                    <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-700">
                        <button onClick={() => setAspectRatio(VideoAspectRatio.Landscape)} disabled={assetImages.length > 0 || isGenerating} className={`flex-1 py-2 rounded text-[10px] font-bold transition-all ${aspectRatio === VideoAspectRatio.Landscape ? 'bg-zinc-700 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'} disabled:opacity-50`}>16:9</button>
                        <button onClick={() => setAspectRatio(VideoAspectRatio.Portrait)} disabled={assetImages.length > 0 || isGenerating} className={`flex-1 py-2 rounded text-[10px] font-bold transition-all ${aspectRatio === VideoAspectRatio.Portrait ? 'bg-zinc-700 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'} disabled:opacity-50`}>9:16</button>
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase">Resolução</label>
                    <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-700">
                        <button onClick={() => setResolution(VideoResolution.Res720p)} disabled={assetImages.length > 0 || isGenerating} className={`flex-1 py-2 rounded text-[10px] font-bold transition-all ${resolution === VideoResolution.Res720p ? 'bg-zinc-700 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'} disabled:opacity-50`}>720p</button>
                        <button onClick={() => setResolution(VideoResolution.Res1080p)} disabled={assetImages.length > 0 || isGenerating} className={`flex-1 py-2 rounded text-[10px] font-bold transition-all ${resolution === VideoResolution.Res1080p ? 'bg-zinc-700 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'} disabled:opacity-50`}>1080p</button>
                    </div>
                </div>
           </div>
        </div>

        {/* Frames Control */}
        <div className="space-y-4 pt-4 border-t border-zinc-800">
            <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                <i className="fas fa-images"></i> Controle de Frames & Estilo
            </h4>
            <div className="grid grid-cols-2 gap-4">
                <div 
                    className={`relative aspect-video rounded-xl border-2 border-dashed transition-all flex flex-col items-center justify-center cursor-pointer group overflow-hidden ${startFrame ? 'border-indigo-500 bg-zinc-900' : 'border-zinc-700 hover:border-zinc-500 bg-zinc-800/30'}`}
                    onClick={() => !isGenerating && document.getElementById('start-frame-input')?.click()}
                >
                    {startFrame && startFrame.data ? (
                        <><img src={startFrame.data || undefined} className="w-full h-full object-cover opacity-60" /><div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 font-bold text-[10px] text-white bg-black/40">Alterar</div></>
                    ) : (
                        <><i className="fas fa-play text-zinc-600 mb-2 text-xl"></i><span className="text-[9px] font-bold text-zinc-500">Início</span></>
                    )}
                    <input id="start-frame-input" type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'start')} />
                    {startFrame && !isGenerating && <button onClick={(e) => {e.stopPropagation(); setStartFrame(null)}} className="absolute top-1 right-1 bg-red-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] hover:bg-red-500 z-10"><i className="fas fa-times"></i></button>}
                </div>

                <div 
                    className={`relative aspect-video rounded-xl border-2 border-dashed transition-all flex flex-col items-center justify-center cursor-pointer group overflow-hidden ${endFrame ? 'border-purple-500 bg-zinc-900' : 'border-zinc-700 hover:border-zinc-500 bg-zinc-800/30'}`}
                    onClick={() => !isGenerating && document.getElementById('end-frame-input')?.click()}
                >
                     {endFrame && endFrame.data ? (
                        <><img src={endFrame.data || undefined} className="w-full h-full object-cover opacity-60" /><div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 font-bold text-[10px] text-white bg-black/40">Alterar</div></>
                    ) : (
                        <><i className="fas fa-stop text-zinc-600 mb-2 text-xl"></i><span className="text-[9px] font-bold text-zinc-500">Fim</span></>
                    )}
                    <input id="end-frame-input" type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'end')} />
                     {endFrame && !isGenerating && <button onClick={(e) => {e.stopPropagation(); setEndFrame(null)}} className="absolute top-1 right-1 bg-red-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] hover:bg-red-500 z-10"><i className="fas fa-times"></i></button>}
                </div>
            </div>

            {/* Asset Images */}
            <div className="grid grid-cols-4 gap-2 mt-2">
                {assetImages.map((img, idx) => (
                    <div key={`asset_${idx}`} className="relative aspect-square rounded-lg overflow-hidden border border-zinc-600 group bg-black">
                        {img ? <img src={img || undefined} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-zinc-800"><i className="fas fa-image text-zinc-600"></i></div>}
                        {!isGenerating && <button onClick={() => removeAsset(idx)} className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center text-[8px]"><i className="fas fa-times"></i></button>}
                    </div>
                ))}
                {assetImages.length < 3 && !isGenerating && (
                    <div 
                        className="aspect-square rounded-lg border-2 border-dashed border-zinc-700 hover:border-zinc-500 flex flex-col items-center justify-center cursor-pointer bg-zinc-900 hover:bg-zinc-800 transition-colors"
                        onClick={() => document.getElementById('asset-input')?.click()}
                    >
                        <i className="fas fa-plus text-zinc-500 mb-1"></i>
                        <span className="text-[8px] font-bold text-zinc-500">Ref</span>
                    </div>
                )}
            </div>
            <input id="asset-input" type="file" className="hidden" accept="image/*" multiple onChange={handleAssetUpload} />
            {assetImages.length > 0 && <p className="text-[9px] text-purple-400 mt-1">* Referências forçam modo Pro (720p/16:9)</p>}
        </div>

        {/* Neural Morphing - UNIQUE FEATURE */}
        <div className="bg-zinc-900/80 border border-pink-500/30 p-4 rounded-xl space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-[10px] font-black text-pink-400 uppercase tracking-widest flex items-center gap-2">
              <i className="fas fa-brain"></i> IA de Estilo Transmórfico (Morpheus)
            </h4>
            <div className="group relative">
                <i className="fas fa-question-circle text-zinc-600 text-[10px] cursor-help"></i>
                <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-black border border-zinc-800 rounded text-[9px] text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                    Estilos Morpheus usam reconstrução neural avançada para transformar seus vídeos.
                </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'glass', name: 'Vidro Líquido', icon: 'fa-glass-water' },
              { id: 'ether', name: 'Éter Quântico', icon: 'fa-cloud-meatball' },
              { id: 'neon', name: 'Cyberpunk Orgânico', icon: 'fa-microchip' }
            ].map(style => (
               <button 
                  key={style.id}
                  onClick={() => setPrompt(prev => `${prev} [Style: ${style.name}]`.trim())}
                  className="p-2 bg-zinc-950 border border-zinc-800 hover:border-pink-500/50 rounded-lg flex flex-col items-center gap-1 transition-all group"
               >
                 <i className={`fas ${style.icon} text-zinc-600 group-hover:text-pink-400 text-xs`}></i>
                 <span className="text-[8px] font-bold text-zinc-500 group-hover:text-pink-200">{style.name}</span>
               </button>
            ))}
          </div>
          <p className="text-[9px] text-zinc-500">Transforma a estrutura do vídeo cena a cena usando reconstrução neural profunda.</p>
        </div>

        <button
          onClick={handleSubmit}
          disabled={isGenerating || !prompt.trim()}
          className={`w-full py-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl shadow-xl transition-all transform active:scale-[0.98] flex items-center justify-center gap-3 relative overflow-hidden group`}
        >
          <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
          {isGenerating ? (
            <div className="flex flex-col items-center">
                <div className="flex items-center gap-2">
                    <i className="fas fa-circle-notch fa-spin"></i> 
                    <span>GERANDO...</span>
                </div>
                <span className="text-[9px] font-normal opacity-80 mt-1 animate-pulse">{loadingMsg}</span>
            </div>
          ) : (
            <><i className="fas fa-wand-magic-sparkles"></i> CRIAR VÍDEO AGORA</>
          )}
        </button>
      </div>
    </div>
  );
};
