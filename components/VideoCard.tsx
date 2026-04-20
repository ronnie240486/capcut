
import React from 'react';
import { VideoProject } from '../types';

const ICONS = {
  Video: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"></path><rect width="14" height="12" x="2" y="6" rx="2" ry="2"></rect></svg>
  ),
  Download: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
  )
};

interface VideoCardProps {
  project: VideoProject;
  onClick: (project: VideoProject) => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({ project, onClick }) => {
  return (
    <div 
      className="group relative bg-[#1a1a1a] rounded-xl overflow-hidden cursor-pointer border border-transparent hover:border-blue-500/50 transition-all duration-300"
      onClick={() => onClick(project)}
    >
      <div className={`relative ${project.aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'}`}>
        {project.status === 'pending' ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#222] animate-pulse">
            <div className="text-blue-500 animate-spin">
              <ICONS.Video />
            </div>
          </div>
        ) : (
          <video 
            src={project.videoUrl || undefined} 
            crossOrigin="anonymous"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            muted
            loop
            onMouseOver={(e) => e.currentTarget.play()}
            onMouseOut={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0;
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
          <h3 className="text-sm font-semibold truncate">{project.title || "Untitled Sequence"}</h3>
          <p className="text-xs text-gray-400 mt-1 line-clamp-2">{project.prompt}</p>
        </div>
      </div>
      <div className="p-3 border-t border-white/5 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
          {project.resolution} • {project.aspectRatio}
        </span>
        <div className="flex gap-2">
            <button className="p-1 hover:text-blue-400">
                <ICONS.Download />
            </button>
        </div>
      </div>
    </div>
  );
};