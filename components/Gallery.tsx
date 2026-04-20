import React from 'react';
import { GeneratedVideo } from '../types';

interface GalleryProps {
  videos: GeneratedVideo[];
  onSelect: (video: GeneratedVideo) => void;
  currentId?: string;
}

export const Gallery: React.FC<GalleryProps> = ({ videos, onSelect, currentId }) => {
  if (videos.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold text-white mb-4 flex items-center">
        <svg className="w-5 h-5 mr-2 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        Histórico de Criações
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {videos.map((video) => (
          <div 
            key={video.id}
            onClick={() => onSelect(video)}
            className={`group cursor-pointer relative rounded-lg overflow-hidden border transition-all duration-200 ${
              currentId === video.id ? 'border-indigo-500 ring-2 ring-indigo-500/50' : 'border-slate-700 hover:border-slate-500'
            }`}
          >
            <div className="aspect-video bg-black relative">
                <video src={video.url || undefined} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" muted />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 transition-opacity">
                    <svg className="w-8 h-8 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                </div>
            </div>
            <div className="p-2 bg-slate-800 text-xs text-slate-300 truncate">
                {video.prompt}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
