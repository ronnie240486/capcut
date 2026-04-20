
import React, { useState } from 'react';
import { Send, Image as ImageIcon, Download, Share2, Trash2, Maximize2, Loader2, Sparkles } from 'lucide-react';
import { generateImage } from '../services/geminiService';
import { GeneratedImage } from '../types';

const ImageGenerator: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "16:9" | "9:16" | "4:3" | "3:4">("1:1");
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    try {
      const imageUrl = await generateImage(prompt, aspectRatio);
      if (imageUrl) {
        const newImage: GeneratedImage = {
          id: Math.random().toString(36).substr(2, 9),
          url: imageUrl,
          prompt,
          aspectRatio,
          createdAt: Date.now(),
          timestamp: Date.now()
        };
        setImages(prev => [newImage, ...prev]);
        setSelectedImage(newImage);
        setPrompt('');
      }
    } catch (error) {
      console.error(error);
      alert("Failed to generate image. Please check your API key and try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const removeImage = (timestamp: number) => {
    setImages(prev => prev.filter(img => img.timestamp !== timestamp));
    if (selectedImage?.timestamp === timestamp) setSelectedImage(null);
  };

  const downloadImage = (url: string, name: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `lumina-${name.slice(0, 20)}.png`;
    link.click();
  };

  return (
    <div className="h-full flex flex-col p-8 max-w-6xl mx-auto w-full gap-8">
      {/* Search and Settings */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
          <Sparkles className="text-indigo-600" />
          Image Studio
        </h2>
        
        <form onSubmit={handleGenerate} className="space-y-6">
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to create in vivid detail..."
              className="w-full p-4 pr-14 min-h-[100px] bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-slate-800 resize-none transition-all"
            />
            <button
              type="submit"
              disabled={isGenerating || !prompt.trim()}
              className="absolute right-3 bottom-3 p-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-all"
            >
              {isGenerating ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Aspect Ratio</span>
              <div className="flex gap-2">
                {(["1:1", "16:9", "9:16", "4:3", "3:4"] as const).map(ratio => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setAspectRatio(ratio)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                      aspectRatio === ratio 
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' 
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600'
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex-1 flex items-center justify-end text-sm text-slate-400 italic">
              Powered by Gemini 2.5 Flash Image
            </div>
          </div>
        </form>
      </div>

      <div className="flex-1 flex gap-8 min-h-0">
        {/* Main Display */}
        <div className="flex-[2] bg-slate-100 rounded-2xl border border-slate-200 overflow-hidden flex items-center justify-center relative">
          {selectedImage ? (
            <>
              <img 
                src={selectedImage.url || undefined} 
                alt={selectedImage.prompt} 
                className="max-w-full max-h-full object-contain"
              />
              <div className="absolute bottom-6 left-6 right-6 bg-black/40 backdrop-blur-md p-4 rounded-xl border border-white/10 text-white opacity-0 hover:opacity-100 transition-opacity">
                <p className="text-sm line-clamp-2 mb-3">{selectedImage.prompt}</p>
                <div className="flex gap-2">
                  <button 
                    onClick={() => downloadImage(selectedImage.url, selectedImage.prompt)}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-bold uppercase transition-all"
                  >
                    <Download size={14} /> Download
                  </button>
                  <button 
                    onClick={() => removeImage(selectedImage.timestamp)}
                    className="p-2 bg-red-500/40 hover:bg-red-500/60 rounded-lg transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center text-slate-400 gap-4">
              <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center">
                <ImageIcon size={32} />
              </div>
              <p className="font-medium">No image generated yet</p>
            </div>
          )}
          
          {isGenerating && !selectedImage && (
            <div className="absolute inset-0 bg-slate-100 flex flex-col items-center justify-center gap-4 z-10">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles size={20} className="text-indigo-600" />
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="font-bold text-slate-700">Brewing your vision...</p>
                <p className="text-sm text-slate-500">Gemini is sketching your prompt</p>
              </div>
            </div>
          )}
        </div>

        {/* Gallery Sidebar */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">History</h3>
            <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
              {images.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3 content-start">
            {images.map(img => (
              <button
                key={img.timestamp}
                onClick={() => setSelectedImage(img)}
                className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                  selectedImage?.timestamp === img.timestamp 
                    ? 'border-indigo-600 scale-95' 
                    : 'border-transparent hover:border-slate-300'
                }`}
              >
                <img src={img.url || undefined} className="w-full h-full object-cover" alt="" />
              </button>
            ))}
            {images.length === 0 && (
              <div className="col-span-2 text-center py-12 text-slate-300">
                <p className="text-xs font-medium">History is empty</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageGenerator;
