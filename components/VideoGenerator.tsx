
import React, { useState, useRef } from 'react';
import { VideoAspectRatio, VideoResolution } from '../types';
import { GeminiVideoService } from '../services/geminiService';

// Fix: Define local interface for generation parameters
export interface GenerationParams {
  prompt: string;
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
  model: 'veo-3.1-lite-generate-preview' | 'veo-3.1-generate-preview' | 'google/lyria-3-pro-preview';
  startImage?: string;
  endImage?: string;
  referenceImages?: string[];
}

interface Props {
  onGenerate: (url: string, params: GenerationParams) => void;
  onResetKey: () => void;
}

const VideoGenerator: React.FC<Props> = ({ onGenerate, onResetKey }) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  // Fix: Use Enum members instead of strings to avoid type assignment errors
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>(VideoAspectRatio.Landscape);
  const [resolution, setResolution] = useState<VideoResolution>(VideoResolution.Res720p);
  const [model, setModel] = useState<'veo-3.1-lite-generate-preview' | 'veo-3.1-generate-preview' | 'google/lyria-3-pro-preview'>('veo-3.1-lite-generate-preview');
  
  const [startImage, setStartImage] = useState<string | null>(null);
  const [endImage, setEndImage] = useState<string | null>(null);
  const [assetImages, setAssetImages] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setter(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAssetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).slice(0, 3).forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          // Fix: Ensure reader.result is treated as string for state update
          setAssetImages(prev => [...prev, reader.result as string].slice(0, 3));
        };
        // Fix: Explicitly cast file to any/Blob to satisfy TypeScript when it fails to infer the item type from Array.from(FileList)
        reader.readAsDataURL(file as any);
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() && !startImage) return;

    setLoading(true);
    try {
      const params: GenerationParams = {
        prompt,
        aspectRatio,
        resolution,
        model,
        startImage: startImage || undefined,
        endImage: endImage || undefined,
        referenceImages: assetImages.length > 0 ? assetImages : undefined
      };
      
      // Fix: Pass Enum members directly instead of re-evaluating to strings
      const url = await GeminiVideoService.generateVideo({
        prompt: params.prompt,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        model: params.model,
        image: params.startImage,
        lastFrame: params.endImage,
        referenceImages: params.referenceImages,
        onProgress: setStatusMessage
      } as any);

      onGenerate(url, params);
      setPrompt('');
      setStartImage(null);
      setEndImage(null);
      setAssetImages([]);
    } catch (err: any) {
      console.error(err);
      if (err.message && err.message.includes("Requested entity was not found")) {
        onResetKey();
      } else {
        alert("Generation failed: " + err.message);
      }
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 glass rounded-3xl min-h-[400px]">
        <div className="relative w-24 h-24 mb-8">
          <div className="absolute inset-0 border-4 border-violet-500/20 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-t-violet-500 rounded-full animate-spin"></div>
        </div>
        <h3 className="text-2xl font-bold mb-2 animate-pulse">Creating Magic</h3>
        <p className="text-gray-400 text-center max-w-sm">{statusMessage || "The AI is weaving your vision into existence..."}</p>
        <div className="mt-8 px-4 py-2 bg-white/5 rounded-full text-xs text-gray-500">
          This may take a few minutes
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 glass p-8 rounded-3xl border border-white/5 shadow-2xl">
      <div className="space-y-4">
        <label className="block text-sm font-semibold text-gray-400 uppercase tracking-wider">Video Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A cinematic drone shot of a neon city at night..."
          className="w-full h-32 bg-black/40 border border-white/10 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all resize-none text-lg"
          required={!startImage}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Model Selection */}
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-gray-400 uppercase tracking-wider">Model</label>
          <div className="flex gap-2">
            {[
              { id: 'veo-3.1-lite-generate-preview', name: 'Fast' },
              { id: 'veo-3.1-generate-preview', name: 'Pro' },
              { id: 'google/lyria-3-pro-preview', name: 'Lyria' }
            ].map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => setModel(m.id as any)}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium border transition-all ${
                  model === m.id 
                    ? 'bg-violet-600/20 border-violet-500 text-violet-300 shadow-[0_0_15px_rgba(139,92,246,0.15)]' 
                    : 'bg-black/20 border-white/10 text-gray-500 hover:border-white/20'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        {/* Aspect Ratio */}
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-gray-400 uppercase tracking-wider">Aspect Ratio</label>
          <div className="flex gap-2">
            {[VideoAspectRatio.Landscape, VideoAspectRatio.Portrait].map(ratio => (
              <button
                key={ratio}
                type="button"
                onClick={() => setAspectRatio(ratio)}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium border transition-all ${
                  aspectRatio === ratio 
                    ? 'bg-violet-600/20 border-violet-500 text-violet-300' 
                    : 'bg-black/20 border-white/10 text-gray-500 hover:border-white/20'
                }`}
              >
                {ratio === VideoAspectRatio.Landscape ? '16:9' : '9:16'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <label className="block text-sm font-semibold text-gray-400 uppercase tracking-wider">Visual References (Optional)</label>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Start Image */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`h-40 relative rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${
              startImage ? 'border-violet-500/50 bg-violet-500/5' : 'border-white/10 hover:border-white/20 bg-white/5'
            }`}
          >
            {startImage ? (
              <img src={startImage || undefined} className="absolute inset-0 w-full h-full object-cover rounded-2xl" alt="Start" />
            ) : (
              <>
                <svg className="w-6 h-6 text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <span className="text-xs font-medium text-gray-500">First Frame</span>
              </>
            )}
            <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={(e) => handleFileChange(e, setStartImage)} />
          </div>

          {/* End Image */}
          <div 
            onClick={() => endInputRef.current?.click()}
            className={`h-40 relative rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${
              endImage ? 'border-violet-500/50 bg-violet-500/5' : 'border-white/10 hover:border-white/20 bg-white/5'
            }`}
          >
            {endImage ? (
              <img src={endImage || undefined} className="absolute inset-0 w-full h-full object-cover rounded-2xl" alt="End" />
            ) : (
              <>
                <svg className="w-6 h-6 text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
                <span className="text-xs font-medium text-gray-500">Last Frame</span>
              </>
            )}
            <input type="file" ref={endInputRef} hidden accept="image/*" onChange={(e) => handleFileChange(e, setEndImage)} />
          </div>

          {/* Asset/Multi-Reference */}
          <div 
            onClick={() => assetInputRef.current?.click()}
            className={`h-40 relative rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${
              assetImages.length > 0 ? 'border-violet-500/50 bg-violet-500/5' : 'border-white/10 hover:border-white/20 bg-white/5'
            }`}
          >
            {assetImages.length > 0 ? (
              <div className="grid grid-cols-2 gap-1 p-1 w-full h-full">
                {assetImages.map((img, i) => (
                  <img key={i} src={img || undefined} className="w-full h-full object-cover rounded-lg" alt={`Asset ${i}`} />
                ))}
              </div>
            ) : (
              <>
                <svg className="w-6 h-6 text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                <span className="text-xs font-medium text-gray-500">Multi-Asset (Up to 3)</span>
              </>
            )}
            <input type="file" ref={assetInputRef} hidden accept="image/*" multiple onChange={handleAssetChange} />
          </div>
        </div>
      </div>

      <button
        type="submit"
        className="w-full py-5 bg-violet-600 hover:bg-violet-500 text-white rounded-2xl font-bold text-lg transition-all shadow-xl hover:shadow-violet-600/30 active:scale-[0.98]"
      >
        Generate Video
      </button>
    </form>
  );
};
