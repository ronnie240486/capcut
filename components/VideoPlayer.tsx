import React from 'react';
import { GeneratedVideo } from '../types';

interface VideoPlayerProps {
  video: GeneratedVideo;
  onDownload: (url: string, filename: string) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ video, onDownload }) => {
  return (
    <div className="bg-slate-800 rounded-xl overflow-hidden shadow-2xl border border-slate-700 flex flex-col h-full animate-fade-in">
      <div className="relative aspect-video bg-black flex items-center justify-center">
        <video 
          src={video.url || undefined} 
          controls 
          autoPlay 
          loop 
          className="w-full h-full object-contain"
        />
      </div>
      <div className="p-4 flex flex-col gap-2">
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-semibold text-white truncate pr-4" title={video.prompt}>
            {video.prompt || "Vídeo Gerado por IA"}
          </h3>
          <span className="text-xs font-mono bg-slate-700 text-indigo-300 px-2 py-1 rounded">
            {video.config.resolution}
          </span>
        </div>
        <p className="text-slate-400 text-sm line-clamp-2" title={video.prompt}>
            {video.prompt}
        </p>
        <div className="mt-2 flex justify-end">
            <button 
                onClick={() => onDownload(video.url, `veo-video-${video.id}.mp4`)}
                className="text-sm flex items-center text-indigo-400 hover:text-indigo-300 transition-colors"
            >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Baixar MP4
            </button>
        </div>
      </div>
    </div>
  );
};
