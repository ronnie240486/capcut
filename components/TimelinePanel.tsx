import React, { useRef, useState, useEffect } from 'react';
import { Clip, MediaItem } from '../types';
import { TRACK_LABEL_OFFSET } from '../constants';

interface TimelinePanelProps {
    clips: Clip[];
    mediaLibrary: Record<string, MediaItem>;
    totalDuration: number;
    currentTime: number;
    pixelsPerSecond: number;
    selectedClipId: string | null;
    selectedTransition: { clipId: string | null } | null;
    canUndo: boolean;
    canRedo: boolean;
    onSelectClip: (id: string | null) => void;
    onSelectTransition: (clipId: string | null) => void;
    onUpdateClip: (id: string, updates: Partial<Clip>) => void;
    onTimeChange: (time: number) => void;
    onDrop: (e: React.DragEvent, track: 'video' | 'audio' | 'narration' | 'music' | 'sfx' | 'text' | 'camada' | 'subtitle', time: number) => void;
    onSplit: () => void;
    onDelete: () => void;
    onDuplicate: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onChangeZoom: (zoom: number) => void;
    onExtractAudio?: (clipId: string) => void;
    onDownloadClip?: (clipId: string) => void;
    onUnifyImages?: (track: string) => void;
    onUnifyAudio?: (track: string) => void;
    onImportToTrack?: (track: string) => void;
    onDeepSync?: () => void;
    onMorpheus?: (style: string) => void;
    onAutoTransitions?: () => void;
}

export const TimelinePanel: React.FC<TimelinePanelProps> = ({
    clips,
    mediaLibrary,
    totalDuration,
    currentTime,
    pixelsPerSecond,
    selectedClipId,
    selectedTransition,
    canUndo,
    canRedo,
    onSelectClip,
    onSelectTransition,
    onUpdateClip,
    onTimeChange,
    onDrop,
    onSplit,
    onDelete,
    onDuplicate,
    onUndo,
    onRedo,
    onChangeZoom,
    onExtractAudio,
    onDownloadClip,
    onUnifyImages,
    onUnifyAudio,
    onImportToTrack,
    onDeepSync,
    onMorpheus,
    onAutoTransitions
}) => {
    const timelineRef = useRef<HTMLDivElement>(null);
    const zoom = pixelsPerSecond;
    
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, clipId: string } | null>(null);
    const [trackContextMenu, setTrackContextMenu] = useState<{ x: number, y: number, track: string } | null>(null);

    useEffect(() => {
        const handleClick = () => {
            setContextMenu(null);
            setTrackContextMenu(null);
        };
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent, track: 'video' | 'audio' | 'narration' | 'music' | 'sfx' | 'text' | 'camada' | 'subtitle') => {
        e.preventDefault();
        if (timelineRef.current) {
            const rect = timelineRef.current.getBoundingClientRect();
            const scrollLeft = timelineRef.current.scrollLeft;
            const x = e.clientX - rect.left - TRACK_LABEL_OFFSET + scrollLeft;
            const time = Math.max(0, x / zoom);
            onDrop(e, track, time);
        }
    };

    const handleClipDragStart = (e: React.MouseEvent, clip: Clip) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onSelectClip(clip.id);
        onSelectTransition(null);
        const startX = e.clientX;
        const startClipTime = clip.start;

        const handleMouseMove = (mv: MouseEvent) => {
            const deltaX = mv.clientX - startX;
            const deltaTime = deltaX / zoom;
            let newStart = Math.max(0, startClipTime + deltaTime);
            const snapThreshold = 10 / zoom;
            clips.forEach(c => {
                if(c.id === clip.id) return;
                const end = c.start + c.duration;
                if(Math.abs(newStart - end) < snapThreshold) newStart = end;
                if(Math.abs(newStart - c.start) < snapThreshold) newStart = c.start;
            });
            if(newStart < snapThreshold) newStart = 0;
            onUpdateClip(clip.id, { start: newStart });
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleResizeStart = (e: React.MouseEvent, clip: Clip, direction: 'left' | 'right') => {
        e.stopPropagation();
        onSelectClip(clip.id);
        const startX = e.clientX;
        const originalStart = clip.start;
        const originalDuration = clip.duration;
        const originalOffset = clip.mediaStartOffset || 0;

        const handleMouseMove = (mv: MouseEvent) => {
            const deltaX = mv.clientX - startX;
            const deltaTime = deltaX / zoom;

            if (direction === 'left') {
                const newStart = originalStart + deltaTime;
                const newDuration = originalDuration - deltaTime;
                if (newStart >= 0 && newDuration > 0.1 && (originalOffset + deltaTime) >= 0) {
                     onUpdateClip(clip.id, { 
                         start: newStart, 
                         duration: newDuration, 
                         mediaStartOffset: originalOffset + deltaTime
                     });
                }
            } else {
                const newDuration = originalDuration + deltaTime;
                if (newDuration > 0.1) {
                    onUpdateClip(clip.id, { duration: newDuration });
                }
            }
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleTimelineClick = (e: React.MouseEvent) => {
        if (timelineRef.current) {
            const rect = timelineRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left - TRACK_LABEL_OFFSET + timelineRef.current.scrollLeft;
            const time = Math.max(0, x / zoom);
            onTimeChange(time);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, clipId: string) => {
        e.preventDefault();
        e.stopPropagation();
        onSelectClip(clipId);
        setContextMenu({ x: e.clientX, y: e.clientY, clipId });
    };

    const handleTrackContextMenu = (e: React.MouseEvent, track: string) => {
        e.preventDefault();
        e.stopPropagation();
        setTrackContextMenu({ x: e.clientX, y: e.clientY, track });
    };

    const renderTrack = (trackType: 'video' | 'audio' | 'narration' | 'music' | 'sfx' | 'text' | 'camada' | 'subtitle', icon: string, colorClass: string, label?: string) => (
        <div className="flex mb-1 min-h-[64px] group/track">
            <div 
                className="w-[38px] flex-shrink-0 flex flex-col items-center justify-center bg-zinc-900 border-r border-zinc-700 text-gray-500 gap-1 sticky left-0 z-20 shadow-md group-hover/track:bg-zinc-800 transition-colors cursor-context-menu"
                title={label || trackType}
                onContextMenu={(e) => handleTrackContextMenu(e, trackType)}
            >
                <i className={`fas ${icon}`}></i>
                {label && <span className="text-[8px] uppercase font-bold tracking-tighter transform -rotate-90 origin-center w-8 text-center">{label}</span>}
            </div>
            <div 
                className="flex-1 relative bg-zinc-900/30 border-b border-zinc-700/30"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, trackType)}
            >
                {/* Grid Lines */}
                <div className="absolute inset-0 pointer-events-none opacity-5" style={{ backgroundImage: 'linear-gradient(to right, #ffffff 1px, transparent 1px)', backgroundSize: `${zoom}px 100%` }}></div>

                {clips.filter(c => c.track === trackType).map(clip => {
                    const media = mediaLibrary[clip.fileName];
                    const isSelected = clip.id === selectedClipId;
                    const hasEffect = !!clip.effect;
                    const hasTransition = !!clip.transition;
                    const hasMovement = !!clip.properties.movement;

                    return (
                        <div key={clip.id} 
                            onMouseDown={(e) => handleClipDragStart(e, clip)}
                            onContextMenu={(e) => handleContextMenu(e, clip.id)}
                            className={`absolute top-1 bottom-1 rounded-md border border-white/10 overflow-hidden cursor-grab flex items-center text-xs text-white select-none transition-all shadow-sm ${isSelected ? 'ring-2 ring-white z-30 shadow-xl scale-[1.01]' : 'hover:brightness-110 z-10'} ${colorClass}`}
                            style={{ left: `${clip.start * zoom}px`, width: `${clip.duration * zoom}px`, backgroundImage: media?.thumbnail ? `url(${media.thumbnail})` : 'none', backgroundSize: 'cover' }}>
                            
                            {/* Dark Overlay for Text readability */}
                            <div className={`absolute inset-0 ${media?.thumbnail ? 'bg-black/40' : ''} pointer-events-none`}></div>
                            
                            {/* Transition Indicator */}
                            {hasTransition && (
                                <div 
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        onSelectTransition(clip.id);
                                    }}
                                    className={`absolute left-0 top-0 bottom-0 z-20 flex items-center justify-center shadow-lg border-r backdrop-blur-sm transition-all cursor-pointer ${selectedTransition?.clipId === clip.id ? 'bg-blue-400 border-blue-200' : 'bg-blue-500/80 border-blue-300'}`}
                                    style={{ width: `${Math.min(clip.transition!.duration * zoom, clip.duration * zoom)}px`, maxWidth: '100%' }}
                                    title={`Transição: ${clip.transition!.id}`}
                                >
                                    <i className="fas fa-random text-[8px] text-white"></i>
                                </div>
                            )}

                            {/* Resize Handles */}
                            <div onMouseDown={(e) => handleResizeStart(e, clip, 'left')} className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/30 z-30 flex items-center justify-center group/handle"><div className="w-1 h-4 bg-white/20 rounded-full group-hover/handle:bg-white"></div></div>
                            <div onMouseDown={(e) => handleResizeStart(e, clip, 'right')} className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/30 z-30 flex items-center justify-center group/handle"><div className="w-1 h-4 bg-white/20 rounded-full group-hover/handle:bg-white"></div></div>
                            
                            {/* Content Label */}
                            <span className="relative z-10 ml-3 truncate px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md pointer-events-none flex items-center gap-1 shadow-sm font-medium text-[10px] border border-white/10">
                                {media?.name || clip.properties.text || clip.type}
                            </span>

                            {/* Badges for Effects/Movements */}
                            <div className="absolute right-3 top-1 bottom-1 flex items-center gap-1 z-20">
                                {hasEffect && (
                                    <div className="w-4 h-4 rounded-full bg-purple-600 text-white border border-purple-400 text-[8px] flex items-center justify-center shadow-md" title={`Efeito: ${clip.effect}`}>
                                        <i className="fas fa-magic"></i>
                                    </div>
                                )}
                                {hasMovement && (
                                    <div className="w-4 h-4 rounded-full bg-green-600 text-white border border-green-400 text-[8px] flex items-center justify-center shadow-md" title={`Movimento: ${clip.properties.movement?.type}`}>
                                        <i className="fas fa-arrows-alt"></i>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    const timelineWidth = Math.max(2000, (totalDuration + 60) * zoom);
    const activeClip = clips.find(c => c.id === contextMenu?.clipId);
    const activeClipTrack = activeClip?.track;

    return (
        <div className="bg-zinc-800 rounded-lg border border-zinc-700 flex flex-col h-full relative">
            <div className="h-12 border-b border-zinc-700 flex items-center px-4 justify-between bg-zinc-900 rounded-t-lg shrink-0">
                <div className="flex-1 min-w-0 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-600 scrollbar-track-zinc-800 pb-2 mr-4 flex gap-2 items-center whitespace-nowrap">
                    <button onClick={onUndo} disabled={!canUndo} className="flex flex-col items-center justify-center p-1 px-3 hover:bg-zinc-700 rounded text-gray-400 disabled:opacity-30 transition-colors"><i className="fas fa-undo"></i><span className="text-[9px]">Undo</span></button>
                    <button onClick={onRedo} disabled={!canRedo} className="flex flex-col items-center justify-center p-1 px-3 hover:bg-zinc-700 rounded text-gray-400 disabled:opacity-30 transition-colors"><i className="fas fa-redo"></i><span className="text-[9px]">Redo</span></button>
                    <div className="w-px bg-zinc-700 h-6 mx-1"></div>
                    <button onClick={onSplit} className="flex flex-col items-center justify-center p-1 px-3 hover:bg-zinc-700 rounded text-gray-400 transition-colors group" title="Dividir (Split)"><i className="fas fa-cut group-hover:text-blue-400"></i><span className="text-[9px]">Split</span></button>
                    <button onClick={onDelete} className="flex flex-col items-center justify-center p-1 px-3 hover:bg-zinc-700 rounded text-gray-400 transition-colors group" title="Deletar"><i className="fas fa-trash group-hover:text-red-400"></i><span className="text-[9px]">Del</span></button>
                    
                    <div className="w-px bg-zinc-700 h-6 mx-1"></div>
                    
                    <button 
                        onClick={onDeepSync} 
                        className="flex flex-col items-center justify-center p-1 px-3 hover:bg-emerald-900/30 rounded text-emerald-400 transition-colors group" 
                        title="Deep-Sync Sensorial (AI)"
                    >
                        <i className="fas fa-bolt group-hover:scale-110 transition-transform"></i>
                        <span className="text-[9px] font-bold">Deep Sync</span>
                    </button>

                    <div className="relative group/morpheus">
                        <button 
                            className="flex flex-col items-center justify-center p-1 px-3 hover:bg-purple-900/30 rounded text-purple-400 transition-colors" 
                            title="Inteligência Morpheus (Neural Style)"
                        >
                            <i className="fas fa-brain"></i>
                            <span className="text-[9px] font-bold">Morpheus</span>
                        </button>
                        <div className="absolute top-full left-0 mt-1 hidden group-hover/morpheus:flex flex-col bg-zinc-800 border border-zinc-700 rounded shadow-xl z-[100] w-32 py-1">
                            <button onClick={() => onMorpheus?.('Vidro Líquido')} className="px-2 py-1 text-[10px] text-left hover:bg-zinc-700 text-white">Vidro Líquido</button>
                            <button onClick={() => onMorpheus?.('Éter Quântico')} className="px-2 py-1 text-[10px] text-left hover:bg-zinc-700 text-white">Éter Quântico</button>
                            <button onClick={() => onMorpheus?.('Cyberpunk Orgânico')} className="px-2 py-1 text-[10px] text-left hover:bg-zinc-700 text-white">Cyberpunk Orgânico</button>
                        </div>
                    </div>

                    <button 
                        onClick={onAutoTransitions}
                        className="flex flex-col items-center justify-center p-1 px-3 hover:bg-blue-900/30 rounded text-blue-400 transition-colors border border-blue-500/20 active:scale-95" 
                        title="Aplicar Transições Automáticas em Tudo"
                    >
                        <i className="fas fa-magic"></i>
                        <span className="text-[9px] font-bold">Auto-Transição</span>
                    </button>
                </div>
                
                <div className="flex items-center gap-2 border-l border-zinc-700 pl-4">
                    <i className="fas fa-search-minus text-xs text-gray-500"></i>
                    <input type="range" min="0.1" max="100" step="0.1" value={zoom} onChange={(e) => onChangeZoom(parseFloat(e.target.value))} className="w-24 h-1 bg-zinc-600 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                    <i className="fas fa-search-plus text-xs text-gray-500"></i>
                </div>
            </div>
            <div ref={timelineRef} className="flex-1 overflow-auto relative scrollbar-thin" onMouseDown={handleTimelineClick}>
                <div className="relative min-h-full" style={{ width: timelineWidth }}>
                    {/* Time Ruler */}
                    <div className="h-6 bg-zinc-900 border-b border-zinc-700 sticky top-0 z-30 flex items-end text-[9px] text-gray-500 select-none pointer-events-none" style={{ paddingLeft: TRACK_LABEL_OFFSET }}>
                        {Array.from({ length: Math.ceil((totalDuration + 60) / 5) }).map((_, i) => (
                            <div key={i} className="absolute border-l border-gray-700 h-2 pl-1" style={{ left: TRACK_LABEL_OFFSET + (i * 5 * zoom) }}>{i * 5}s</div>
                        ))}
                    </div>

                    {/* Playhead */}
                    <div className="absolute top-0 bottom-0 w-px bg-red-500 z-50 pointer-events-none" style={{ left: `${TRACK_LABEL_OFFSET + currentTime * zoom}px` }}>
                        <div className="w-3 h-3 bg-red-500 transform -translate-x-1/2 rotate-45 -mt-1.5 shadow-md"></div>
                    </div>

                    <div className="pt-2 pb-4">
                         {renderTrack('camada', 'fa-layer-group', 'bg-cyan-600/90 border-cyan-500 hover:bg-cyan-500')}
                         {renderTrack('video', 'fa-video', 'bg-blue-600/90 border-blue-500 hover:bg-blue-500')}
                         {renderTrack('text', 'fa-font', 'bg-purple-600/90 border-purple-500 hover:bg-purple-500')}
                         {renderTrack('subtitle', 'fa-closed-captioning', 'bg-yellow-600/90 border-yellow-500 hover:bg-yellow-500')}
                         {renderTrack('audio', 'fa-volume-up', 'bg-emerald-600/90 border-emerald-500 hover:bg-emerald-500', 'Áudio')}
                         {renderTrack('narration', 'fa-microphone-lines', 'bg-orange-600/90 border-orange-500 hover:bg-orange-500', 'Voz')}
                         {renderTrack('music', 'fa-music', 'bg-indigo-600/90 border-indigo-500 hover:bg-indigo-500', 'Music')}
                         {renderTrack('sfx', 'fa-volume-high', 'bg-pink-600/90 border-pink-500 hover:bg-pink-500', 'SFX')}
                    </div>
                </div>
            </div>

            {contextMenu && (
                <div 
                    className="fixed z-[9999] bg-zinc-800 border border-zinc-600 rounded-lg shadow-2xl py-1 w-64 flex flex-col animate-in fade-in zoom-in-95 duration-100 backdrop-blur-md"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-3 py-2 text-[10px] font-black text-gray-500 uppercase border-b border-zinc-700 mb-1 tracking-widest">Opções de Clipe</div>
                    
                    {/* UNIFICAR IMAGENS */}
                    {(activeClipTrack === 'video' || activeClipTrack === 'camada') && activeClip?.type === 'image' && (
                        <button onClick={() => { onUnifyImages?.(activeClipTrack!); setContextMenu(null); }} className="px-4 py-3 text-left text-xs hover:bg-yellow-900/30 text-yellow-400 font-bold flex items-center gap-2 transition-colors">
                            <i className="fas fa-layer-group text-lg"></i> UNIFICAR IMAGENS
                        </button>
                    )}

                    {/* UNIFICAR ÁUDIO */}
                    {(activeClipTrack === 'narration' || activeClipTrack === 'music' || activeClipTrack === 'sfx' || activeClipTrack === 'audio') && (
                        <button onClick={() => { onUnifyAudio?.(activeClipTrack!); setContextMenu(null); }} className="px-4 py-3 text-left text-xs hover:bg-green-900/30 text-green-400 font-bold flex items-center gap-2 transition-colors">
                            <i className="fas fa-file-audio text-lg"></i> UNIFICAR ÁUDIO
                        </button>
                    )}

                    <button onClick={() => { onDownloadClip?.(contextMenu.clipId); setContextMenu(null); }} className="px-4 py-2 text-left text-xs hover:bg-zinc-700 text-white flex items-center gap-2 transition-colors">
                        <i className="fas fa-download text-blue-400 w-4"></i> Baixar Mídia Original
                    </button>
                    
                    <button onClick={() => { onExtractAudio?.(contextMenu.clipId); setContextMenu(null); }} className="px-4 py-2 text-left text-xs hover:bg-zinc-700 text-white flex items-center gap-2 transition-colors">
                        <i className="fas fa-music text-green-500 w-4"></i> Extrair Áudio
                    </button>
                    
                    <div className="h-px bg-zinc-700 my-1"></div>
                    <button onClick={() => { onSplit(); setContextMenu(null); }} className="px-4 py-2 text-left text-xs hover:bg-zinc-700 text-white flex items-center gap-2 transition-colors">
                        <i className="fas fa-cut w-4"></i> Dividir (Cut)
                    </button>
                    <button onClick={() => { onDuplicate(); setContextMenu(null); }} className="px-4 py-2 text-left text-xs hover:bg-zinc-700 text-white flex items-center gap-2 transition-colors">
                        <i className="fas fa-copy w-4"></i> Duplicar (Clone)
                    </button>
                    <button onClick={() => { onDelete(); setContextMenu(null); }} className="px-4 py-2 text-left text-xs hover:bg-red-900/30 text-red-400 flex items-center gap-2 transition-colors">
                        <i className="fas fa-trash w-4"></i> Deletar
                    </button>
                </div>
            )}

            {trackContextMenu && (
                <div 
                    className="fixed z-[9999] bg-zinc-800 border border-zinc-600 rounded-lg shadow-2xl py-1 w-64 flex flex-col animate-in fade-in zoom-in-95 duration-100 backdrop-blur-md"
                    style={{ left: trackContextMenu.x, top: trackContextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-3 py-2 text-[10px] font-black text-gray-500 uppercase border-b border-zinc-700 mb-1 tracking-widest">Trilha: {trackContextMenu.track}</div>
                    
                    <button onClick={() => { onImportToTrack?.(trackContextMenu.track); setTrackContextMenu(null); }} className="px-4 py-2 text-left text-xs hover:bg-zinc-700 text-white flex items-center gap-2 transition-colors">
                        <i className="fas fa-file-import text-blue-400 w-4"></i> Importar Mídia
                    </button>
                </div>
            )}
        </div>
    );
};