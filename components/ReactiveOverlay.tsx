import React, { useMemo } from 'react';
import { Clip } from '../types';

interface ReactiveOverlayProps {
    currentTime: number;
    clips: Clip[];
}

export const ReactiveOverlay: React.FC<ReactiveOverlayProps> = ({ currentTime, clips }) => {
    // Determine if audio is playing at this time
    const activeAudio = useMemo(() => {
        return clips.filter(c => c.type === 'audio' && currentTime >= c.start && currentTime <= (c.start + c.duration));
    }, [clips, currentTime]);

    const isAudioActive = activeAudio.length > 0;
    
    // Rhythm simulation
    const pulseScale = isAudioActive ? 1 + 0.05 * Math.sin(currentTime * 15) : 1;

    // Custom reactive elements from clips
    const reactiveClips = useMemo(() => {
        return clips.filter(c => 
            (c.properties.textDesign?.isProgressBar || c.properties.textDesign?.isLowerThird) && 
            currentTime >= c.start && 
            currentTime <= (c.start + c.duration)
        );
    }, [clips, currentTime]);

    return (
        <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
            {/* Standard Progress Bar (Active if no custom progress bar is defined) */}
            {!reactiveClips.some(c => c.properties.textDesign?.isProgressBar) && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[80%] h-1.5 bg-zinc-900/40 rounded-full border border-white/10 backdrop-blur-md overflow-hidden">
                    <div 
                        className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 transition-all duration-300"
                        style={{ width: `${(currentTime % 60) / 60 * 100}%` }}
                    />
                </div>
            )}

            {/* Custom Reactive Progress Bars */}
            {reactiveClips.filter(c => c.properties.textDesign?.isProgressBar).map(clip => {
                const progress = (currentTime - clip.start) / clip.duration;
                return (
                    <div key={clip.id} className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[60%] space-y-2">
                        <div className="flex justify-between items-end px-1">
                            <span className="text-[10px] font-black text-white uppercase tracking-tighter drop-shadow-lg">{clip.properties.text}</span>
                            <span className="text-[10px] font-black text-blue-400">{(progress * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-2 bg-black/60 rounded-full border border-white/20 overflow-hidden box-content p-0.5">
                            <div 
                                className="h-full bg-gradient-to-r from-cyan-400 to-blue-600 rounded-full shadow-[0_0_15px_rgba(34,211,238,0.5)] transition-all duration-100"
                                style={{ 
                                    width: `${progress * 100}%`,
                                    filter: isAudioActive ? `brightness(${1 + 0.5 * Math.sin(currentTime * 20)})` : 'none'
                                }}
                            />
                        </div>
                    </div>
                );
            })}

            {/* Custom Reactive Lower Thirds */}
            {reactiveClips.filter(c => c.properties.textDesign?.isLowerThird).map((clip, idx) => (
                <div 
                    key={clip.id}
                    className="absolute left-10 bottom-32 flex flex-col items-start gap-1"
                    style={{ 
                        transform: `scale(${isAudioActive ? 1 + 0.02 * Math.sin(currentTime * 12) : 1})`,
                        opacity: 0.9
                    }}
                >
                    <div className="bg-gradient-to-r from-indigo-600 to-transparent px-4 py-1.5 rounded-l-md border-l-4 border-indigo-400">
                        <span className="text-white font-black text-sm uppercase italic tracking-wider drop-shadow-md">{clip.properties.text}</span>
                    </div>
                    <div className="bg-black/40 backdrop-blur-md px-3 py-0.5 flex items-center gap-2">
                         <div className="w-1 h-1 rounded-full bg-indigo-400 animate-pulse" />
                         <span className="text-[8px] font-bold text-gray-300 uppercase tracking-[0.3em]">REATIVE OVERLAY ACTIVE</span>
                    </div>
                </div>
            ))}

            {/* Pulsing Corner Ornaments (Visualizers) */}
            {isAudioActive && (
                <>
                    <div className="absolute top-8 left-8 flex gap-1.5 items-end h-12">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div 
                                key={i}
                                className="w-1.5 bg-blue-500 rounded-full shadow-[0_0_10px_theme(colors.blue.500)]"
                                style={{ 
                                    height: `${10 + Math.abs(Math.sin(currentTime * 20 + i)) * 30}px`,
                                    opacity: 0.4 + 0.6 * Math.abs(Math.sin(currentTime * 20))
                                }}
                            />
                        ))}
                    </div>
                    <div className="absolute top-8 right-8 flex gap-1.5 items-end h-12">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div 
                                key={i}
                                className="w-1.5 bg-pink-500 rounded-full shadow-[0_0_10px_theme(colors.pink.500)]"
                                style={{ 
                                    height: `${10 + Math.abs(Math.cos(currentTime * 18 + i)) * 30}px`,
                                    opacity: 0.4 + 0.6 * Math.abs(Math.cos(currentTime * 18))
                                }}
                            />
                        ))}
                    </div>
                </>
            )}

            {/* Lower Thirds - reacting to active audio clips */}
            {activeAudio.map((audio, idx) => (
                <div 
                    key={audio.id}
                    className="absolute bottom-16 left-10 transition-all duration-500"
                    style={{ 
                        opacity: currentTime - audio.start < 0.5 ? (currentTime - audio.start) * 2 : (audio.start + audio.duration - currentTime) < 0.5 ? (audio.start + audio.duration - currentTime) * 2 : 1,
                        transform: `scale(${pulseScale}) translateY(${idx * -50}px)`,
                        zIndex: 50
                    }}
                >
                    <div className="flex items-center gap-4">
                        <div className="w-1.5 h-12 bg-gradient-to-b from-blue-400 to-purple-600 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.5)]" />
                        <div className="bg-zinc-900/60 backdrop-blur-xl px-5 py-3 rounded-2xl border border-white/10 shadow-2xl">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="animate-pulse w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
                                <span className="text-[10px] uppercase font-black tracking-[0.2em] text-blue-400">AUDIO SIGNAL ACTIVE</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-500/10 rounded-lg">
                                    <i className="fas fa-waveform text-blue-300 text-xs"></i>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-white tracking-wide uppercase leading-none">
                                        {audio.track === 'music' ? 'Background Track' : audio.track === 'narration' ? 'AI Voiceover' : 'Sound Effect'}
                                    </span>
                                    <span className="text-[9px] text-zinc-400 font-medium tracking-widest mt-1">
                                        {audio.fileName.split('_').pop()?.split('.')[0].toUpperCase()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
            
            {/* Center Visualizer Pulse (Minimal) */}
            {isAudioActive && (
                <div 
                    className="absolute inset-x-0 bottom-24 flex justify-center items-center gap-1 opacity-20 pointer-events-none"
                    style={{ transform: `scale(${1 + (pulseScale-1)*2})` }}
                >
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(i => (
                         <div 
                            key={i} 
                            className="w-1 bg-white rounded-full"
                            style={{ 
                                height: `${4 + Math.abs(Math.sin(currentTime * 10 + i)) * 20}px`,
                            }}
                         />
                    ))}
                </div>
            )}
        </div>
    );
};
