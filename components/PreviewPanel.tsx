
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Clip, MediaItem } from '../types';
import { RESOURCES, TEXT_RESOURCES } from '../constants';
import { ReactiveOverlay } from './ReactiveOverlay';


const MorphTransitionVideo = ({ url, duration, timeInContainer, isPlaying, filterString, opacity, blendMode }: { 
    url: string, duration: number, timeInContainer: number, isPlaying: boolean, filterString?: string, opacity?: number, blendMode?: string 
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const syncTime = () => {
            if (!video.duration) return;
            const progress = Math.max(0, Math.min(1, timeInContainer / duration));
            const targetTime = progress * video.duration;
            
            // Critical: Only update if playhead moved manually or drifted significantly
            // If playing, we let it run but check for drift
            const drift = Math.abs(video.currentTime - targetTime);
            if (drift > 0.15) {
                video.currentTime = targetTime;
            }
            
            // Adjust playback rate to fit the transition duration window
            const idealPlaybackRate = video.duration / duration;
            if (Math.abs(video.playbackRate - idealPlaybackRate) > 0.05) {
                video.playbackRate = idealPlaybackRate;
            }
        };

        syncTime();
    }, [timeInContainer, duration]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        if (isPlaying) {
            video.play().catch(() => {});
        } else {
            video.pause();
        }
    }, [isPlaying]);

    return (
        <video 
            ref={videoRef}
            src={url}
            className="w-full h-full object-cover rounded-sm pointer-events-none"
            muted
            playsInline
            onLoadedMetadata={(e) => {
                const video = e.currentTarget;
                if (video.duration && duration) {
                    video.playbackRate = video.duration / duration;
                }
            }}
            style={{ 
                filter: filterString, 
                opacity: opacity ?? 1,
                mixBlendMode: blendMode as any,
            }}
        />
    );
};

interface PreviewPanelProps {
    clips: Clip[];
    mediaLibrary: Record<string, MediaItem>;
    currentTime: number;
    isPlaying: boolean;
    totalDuration: number;
    onTogglePlay: () => void;
    onUpdateClip: (id: string, updates: Partial<Clip>) => void;
    selectedClipId: string | null;
    backgroundColor: string;
    backgroundImage?: string;
    projectAspectRatio: string;
    onSelectClip?: (id: string | null) => void;
    activeTool?: 'cursor' | 'magic-eraser';
    magicEraserBrushSize?: number;
    maskPaths?: any[];
    onDrawMagicEraser?: (points: {x: number, y: number}[], dims: {width: number, height: number}) => void;
}

const getEffectDef = (effectId: string | undefined) => {
    if (!effectId) return null;
    const allEffects: any = {};
    Object.values(RESOURCES.effects).forEach((category: any) => {
        Object.assign(allEffects, category);
    });
    return allEffects[effectId] || null;
};

// Maps complex backend transition IDs to available CSS animations for preview
const getSafeTransitionClass = (id: string) => {
    if (!id) return '';
    
    const map: Record<string, string> = {
        // Basics
        'crossfade': 'fade', 'mix': 'fade', 'dissolve': 'fade',
        'black': 'black', 'white': 'white', 'flash': 'white', 'fade-classic': 'fade',
        
        // Slides/Wipes
        'slide-left': 'slide-left', 'push-left': 'slide-left', 'wipe-left': 'slide-left',
        'slide-right': 'slide-right', 'push-right': 'slide-right', 'wipe-right': 'slide-right',
        'slide-up': 'slide-up', 'push-up': 'slide-up', 'wipe-up': 'slide-up',
        'slide-down': 'slide-down', 'push-down': 'slide-down', 'wipe-down': 'slide-down',
        
        // Zooms
        'zoom-in': 'zoom-in', 'infinity-1': 'zoom-in', 'star-zoom': 'zoom-in',
        'zoom-out': 'zoom-out', 'pull-away': 'zoom-out', 'zoom-neg': 'zoom-out',
        
        // Glitch/Cyber (Mapped to SPECIFIC classes now)
        'glitch': 'glitch', 
        'pixelize': 'pixelize', 
        'visual-buzz': 'glitch', 
        'color-glitch': 'glitch',
        'glitch-scan': 'scan-line', 
        'datamosh': 'datamosh', 
        'rgb-split': 'rgb-split', 
        'cyber-zoom': 'zoom-in',
        'block-glitch': 'pixelize', 
        'digital-noise': 'pixelize', 
        'noise-jump': 'pixelize', 
        'cyber-slice': 'cyber-slice',
        'glitch-chroma': 'rgb-split', 
        'urban-glitch': 'glitch', 
        'corrupt-img': 'pixelize', 
        'rgb-shake': 'rgb-split',
        'pixel-sort': 'glitch', 
        'hologram': 'scan-line', 
        'scan-line-v': 'scan-line', 
        'color-tear': 'rgb-split',
        
        // CapCut Trends
        'blood-mist': 'fade', 'black-smoke': 'black', 'white-smoke': 'white', 'fire-burn': 'fade',
        'rip-diag': 'slide-left', 'digital-paint': 'glitch', 'brush-wind': 'slide-left', 'dust-burst': 'fade',
        'filter-blur': 'fade', 'film-roll-v': 'slide-up', 'astral-project': 'fade', 'lens-flare': 'white',
        'flash-black': 'black', 'flash-white': 'white', 'flashback': 'white', 'combine-overlay': 'fade',
        'combine-mix': 'fade', 'nightmare': 'glitch', 'bubble-blur': 'circle-open', 'paper-unfold': 'slide-up',
        'glow-intense': 'white', 'dynamic-blur': 'fade', 'blur-dissolve': 'fade',
        
        // Shapes/Masks (Mapped to circle/zoom)
        'circle-open': 'circle-open', 'circle-close': 'zoom-out', 'heart-wipe': 'circle-open',
        'diamond-in': 'circle-open', 'diamond-out': 'zoom-out', 'clock-wipe': 'circle-open',
        'iris-in': 'circle-open', 'iris-out': 'zoom-out', 'triangle-wipe': 'circle-open',
        'hex-reveal': 'circle-open', 'wipe-radial': 'circle-open', 'checkerboard': 'fade',
        'stripes-h': 'fade', 'stripes-v': 'fade', 'diamond-zoom': 'zoom-in',
        'plus-wipe': 'circle-open', 'checker-wipe': 'fade', 'blind-h': 'fade', 'blind-v': 'fade',
        'barn-door-h': 'zoom-in', 'barn-door-v': 'zoom-in',

        // Paper/Organic (Mapped to Fade/Slide)
        'liquid-melt': 'fade', 'ink-splash': 'circle-open', 'water-ripple': 'fade',
        'page-turn': 'slide-left', 'paper-rip': 'slide-up', 'burn-paper': 'fade', 'oil-paint': 'fade',
        'smoke-reveal': 'fade', 'bubble-pop': 'circle-open', 'sketch-reveal': 'fade', 'fold-up': 'slide-up',
        
        // 3D/Camera (Mapped to Slide/Zoom)
        'cube-rotate-l': 'slide-left', 'cube-rotate-r': 'slide-right', 'cube-rotate-u': 'slide-up', 'cube-rotate-d': 'slide-down',
        'spin-zoom-in': 'zoom-in', 'spin-zoom-out': 'zoom-out', 'zoom-spin-fast': 'zoom-in',
        'whip-left': 'slide-left', 'whip-right': 'slide-right', 'whip-up': 'slide-up', 'whip-down': 'slide-down',
        'perspective-left': 'slide-left', 'perspective-right': 'slide-right',
        'flip-card': 'zoom-in', 'room-fly': 'zoom-in', 'door-open': 'circle-open',
        'zoom-blur-l': 'slide-left', 'zoom-blur-r': 'slide-right', 'spin-cw': 'zoom-in', 'spin-ccw': 'zoom-in',
        'whip-diagonal-1': 'slide-left', 'whip-diagonal-2': 'slide-right',
        
        // Light (Mapped to White Flash)
        'flash-bang': 'white', 'exposure': 'white', 'god-rays': 'white',
        'light-leak-tr': 'fade', 'flare-pass': 'slide-left', 'prism-split': 'fade',
        'burn': 'fade', 'bokeh-blur': 'fade',
        
        // Elastic/Fun (Mapped to simple movement equivalents)
        'elastic-left': 'slide-left', 'elastic-right': 'slide-right', 
        'elastic-up': 'slide-up', 'elastic-down': 'slide-down',
        'bounce-scale': 'zoom-in', 'jelly': 'glitch',

        // New Custom Mappings for Swirl, Kaleidoscope, etc.
        'swirl': 'swirl', 
        'kaleidoscope': 'kaleidoscope', 
        'morph': 'morph',
        'luma-fade': 'fade', 
        'film-roll': 'slide-up', 
        'blur-warp': 'fade',
        'turbulence': 'turbulence', 
        'water-drop': 'water-drop', 
        'wave': 'wave',
        'stretch-h': 'stretch-h', 
        'stretch-v': 'stretch-v', 
        'shutters': 'fade'
    };

    // Return mapped class or default to ID if it assumes direct CSS support (fallback to fade if missing)
    return `trans-${map[id] || id}-in`;
};

const calculateEffectiveVolume = (clip: Clip, currentTime: number) => {
    const progress = currentTime - clip.start;
    if (progress < 0 || progress > clip.duration) return 0;
    const baseVol = clip.properties.volume ?? 1;
    let fade = 1;
    if (clip.properties.audioFadeIn && progress < clip.properties.audioFadeIn) {
        fade = progress / clip.properties.audioFadeIn;
    }
    const timeRemaining = clip.duration - progress;
    if (clip.properties.audioFadeOut && timeRemaining < clip.properties.audioFadeOut) {
        fade = Math.min(fade, timeRemaining / clip.properties.audioFadeOut);
    }
    return Math.max(0, Math.min(1, baseVol * fade));
};

const VideoElement = React.memo(({ clip, media, active, currentTime, isPlaying, objectFit, style, volume }: any) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const isSyncing = useRef<boolean>(false);
    const [useFallback, setUseFallback] = useState(false);

    // Reset fallback se a mídia mudar
    useEffect(() => {
        setUseFallback(false);
    }, [media.url, media.originalUrl]);

    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;

        el.volume = volume;

        // OTIMIZAÇÃO MOBILE: preload apenas metadata para economizar memória
        if (active) {
            const clipProgress = currentTime - clip.start;
            const desiredTime = clipProgress * (clip.properties.speed || 1) + (clip.mediaStartOffset || 0);
            
            const diff = Math.abs(el.currentTime - desiredTime);
            
            // Margem de erro maior no mobile (0.3s) para evitar "stuttering"
            if (!isPlaying || diff > 0.3) {
                if (!isSyncing.current) {
                    isSyncing.current = true;
                    // Tenta setar o tempo. Se falhar (buffer vazio), ignora para não travar a thread
                    try {
                        if (Number.isFinite(desiredTime)) {
                            el.currentTime = desiredTime;
                        }
                    } catch (e) {}
                    
                    setTimeout(() => { isSyncing.current = false; }, 50);
                }
            }
            
            if (isPlaying) {
                if (el.paused) {
                    const playPromise = el.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(() => {
                            // Auto-play foi impedido ou vídeo não carregou ainda. Silenciosamente falha.
                        });
                    }
                }
                // Ajuste de velocidade
                if (el.playbackRate !== (clip.properties.speed || 1)) {
                    el.playbackRate = clip.properties.speed || 1;
                }
            } else {
                if (!el.paused) el.pause();
            }
        } else {
            if (!el.paused) el.pause();
        }
    }, [currentTime, isPlaying, active, clip, media, volume]);

    const videoSrc = useFallback ? (media.originalUrl || media.url) : (media.url || undefined);

    return (
        <video 
            ref={videoRef} 
            src={videoSrc} 
            playsInline 
            muted={volume === 0}
            preload="auto" 
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            className="w-full h-full block" 
            style={{ 
                objectFit, 
                ...style,
                willChange: 'transform, filter',
                backfaceVisibility: 'hidden',
                WebkitOverflowScrolling: 'touch'
            }} 
            onError={() => {
                if (!useFallback && media.originalUrl && media.url !== media.originalUrl) {
                    console.warn(`[Video] Proxy falhou, usando original: ${media.name}`);
                    setUseFallback(true);
                }
            }}
        />
    );
});

const AudioElement = React.memo(({ clip, media, active, currentTime, isPlaying }: any) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    useEffect(() => {
        const el = audioRef.current;
        if (!el) return;
        
        const volume = calculateEffectiveVolume(clip, currentTime);
        el.volume = volume;

        if (active) {
            const clipProgress = currentTime - clip.start;
            const isWithinClip = clipProgress >= 0 && clipProgress <= clip.duration;
            const desired = clipProgress * (clip.properties.speed || 1) + (clip.mediaStartOffset || 0);
            
            // Sync time if drift is large or if paused
            if (Math.abs(el.currentTime - desired) > 0.4 || !isPlaying) {
                if (Number.isFinite(desired) && desired >= 0) {
                    try {
                        el.currentTime = desired;
                    } catch (e) {}
                }
            }

            if (isPlaying && isWithinClip && volume > 0) {
                if (el.paused) {
                    el.play().catch(() => {
                        // Play failed (uninteracted, etc)
                    });
                }
                
                const speed = clip.properties.speed || 1;
                if (el.playbackRate !== speed && speed > 0.05) {
                    el.playbackRate = speed;
                }
            } else {
                if (!el.paused) el.pause();
            }
        } else {
            if (!el.paused) el.pause();
        }
    }, [currentTime, isPlaying, active, clip, media]);
    return <audio ref={audioRef} src={media.url || undefined} preload="auto" />;
});

export const PreviewPanel: React.FC<PreviewPanelProps> = ({
    clips, mediaLibrary, currentTime, isPlaying, totalDuration, onTogglePlay, onUpdateClip, selectedClipId, backgroundColor, backgroundImage, projectAspectRatio, onSelectClip, activeTool = 'cursor', magicEraserBrushSize = 20, maskPaths = [], onDrawMagicEraser
}) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [containerDims, setContainerDims] = useState({ width: '100%', height: '100%' });
    const [isDrawing, setIsDrawing] = useState(false);
    const currentPathRef = useRef<{x: number, y: number}[]>([]);
    const [isDraggingClip, setIsDraggingClip] = useState(false);
    const dragStartRef = useRef<{ mouseX: number, mouseY: number, clipX: number, clipY: number } | null>(null);

    // CRITICAL OPTIMIZATION: Filter clips that are actually visible/audible at current time
    const visibleClips = useMemo(() => {
        return clips.filter(c => {
            const buffer = 0.5; 
            const start = c.start - buffer;
            const end = c.start + c.duration + buffer;
            // Always render audio to avoid choppy sound, but restrict video heavily
            if (['audio', 'narration', 'music', 'sfx'].includes(c.track)) return true;
            return currentTime >= start && currentTime <= end;
        });
    }, [clips, currentTime]);

    // Simulated beat and audio reactivity for motion graphics
    const isAudioPlaying = useMemo(() => {
        return visibleClips.some(c => ['audio', 'narration', 'music', 'sfx'].includes(c.track) && currentTime >= (c.start || 0) && currentTime <= ((c.start || 0) + (c.duration || 0)));
    }, [visibleClips, currentTime]);
    const beatValue = Math.sin(currentTime * Math.PI * 4); // ~120 BPM simulated beat
    const beatIntensity = isAudioPlaying ? 1.2 : 0.8;
    const beatSpeed = isAudioPlaying ? '0.4s' : '0.6s';

    const getAnimConfig = (id: string, clipDuration: number) => {
        // 1. One-Shot Animations (Short, Entry/Exit, Impacts)
        if (
            // Basic Entry
            id.includes('slide-in') || 
            id.includes('pop-in') || 
            id.includes('fade-in') || 
            id.includes('swing-in') || 
            id.includes('whip-in') ||

            // Elastic & Fun - Impacts
            id.includes('mov-bounce-drop') || 
            id.includes('mov-elastic-snap') || 
            id.includes('mov-pop-up') || 
            id.includes('mov-popup') || 
            id.includes('mov-tada') || 
            id.includes('mov-tadal') ||
            id.includes('mov-spring-') ||
            
            // Photo - Flash
            id === 'photo-flash' ||
            id === 'mov-glitch-skid' ||
            id === 'mov-glitch-snap' || // ADDED THIS
            
            // Dynamic Zoom - Fast/Crash
            id.includes('mov-zoom-crash') || 
            id.includes('mov-zoom-twist') || 
            id.includes('mov-zoom-bounce')
        ) {
            return { duration: 0.8, iterations: 1, fill: 'both' };
        }
        
        // 2. Loop Animations (Effects, Continuous Movement)
        if (
            // Basic Loops
            id.includes('pulse') || 
            id.includes('float') || 
            id.includes('wiggle') || 
            id.includes('shake') || 
            id.includes('handheld') || 
            id.includes('jitter') || 
            id.includes('earthquake') || 
            id.includes('heartbeat') || 
            id.includes('spin') || 
            id.includes('pendulum') || 
            id.includes('strobe') || 
            
            // Glitch & Chaos - Loops
            id.includes('glitch') || 
            id.includes('tear') || 
            id.includes('frame-skip') || 
            id.includes('vhs') || 
            id.includes('rgb-shift') || 
            id.includes('rgb-split') ||
            id.includes('mov-shake-violent') ||
            
            // Elastic & Fun - Loops
            id.includes('jelly') || 
            id.includes('squash') || 
            id.includes('rubber') ||
            id.includes('spring') || 
            id.includes('mov-flash-pulse') ||
            id.includes('mov-pendulum-swing') ||
            id.includes('mov-pendulun') ||

            // 3D Loops
            id.includes('mov-3d-') || 
            id.includes('flip') || 
            
            // Blur Loops
            id.includes('wobble') ||
            id.includes('mov-blur') ||
            
            // Distortion & Art Loops
            id.includes('vortex') ||
            id.includes('mirage') ||
            id.includes('kaleidoscope') ||
            id.includes('warp') ||
            id.includes('chromatic') ||
            id.includes('flicker') ||
            id.includes('vignette') ||
            id.includes('edge-glow') ||
            id.includes('pixel-drift') ||
            id.includes('spiral') ||
            
            // Zoom Loops
            id.includes('mov-zoom-pulse') ||
            id.includes('mov-zoom-wobble') ||
            id.includes('mov-zoom-shake')
        ) {
            return { duration: 2.5, iterations: 'infinite', fill: 'both' };
        }
        
        // 3. Full Clip Duration Animations (Cinematic Pans, Slow Zooms, Dolly)
        return { duration: clipDuration, iterations: 1, fill: 'both' };
    };

    useEffect(() => {
        const updateSize = () => {
            if (!wrapperRef.current) return;
            const isMobile = window.innerWidth < 768;
            const pW = wrapperRef.current.clientWidth - (isMobile ? 0 : 32);
            const pH = wrapperRef.current.clientHeight - (isMobile ? 0 : 32);
            const [num, den] = projectAspectRatio.split(':').map(Number);
            const targetRatio = num / den;
            const parentRatio = pW / pH;
            let finalW, finalH;
            if (targetRatio > parentRatio) { finalW = pW; finalH = pW / targetRatio; } 
            else { finalH = pH; finalW = pH * targetRatio; }
            setContainerDims({ width: `${finalW}px`, height: `${finalH}px` });
        };
        const observer = new ResizeObserver(updateSize);
        if (wrapperRef.current) observer.observe(wrapperRef.current);
        updateSize();
        window.addEventListener('resize', updateSize);
        return () => { observer.disconnect(); window.removeEventListener('resize', updateSize); }
    }, [projectAspectRatio]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        if (canvas.width !== rect.width || canvas.height !== rect.height) { canvas.width = rect.width; canvas.height = rect.height; }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (maskPaths.length > 0) {
            ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
            maskPaths.forEach(pathData => {
                const scaleX = canvas.width / (pathData.dims?.width || canvas.width);
                const scaleY = canvas.height / (pathData.dims?.height || canvas.height);
                const points = pathData.points || pathData;
                if (points.length < 2) return;
                ctx.lineWidth = magicEraserBrushSize; ctx.beginPath();
                ctx.moveTo(points[0].x * scaleX, points[0].y * scaleY);
                for (let i = 1; i < points.length; i++) { ctx.lineTo(points[i].x * scaleX, points[i].y * scaleY); }
                ctx.stroke();
            });
        }
        if (isDrawing && currentPathRef.current.length > 0) {
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)'; ctx.lineWidth = magicEraserBrushSize; ctx.beginPath();
            ctx.moveTo(currentPathRef.current[0].x, currentPathRef.current[0].y);
            for (let i = 1; i < currentPathRef.current.length; i++) { ctx.lineTo(currentPathRef.current[i].x, currentPathRef.current[i].y); }
            ctx.stroke();
        }
    }, [maskPaths, isDrawing, magicEraserBrushSize, containerDims]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (activeTool !== 'magic-eraser' || !canvasRef.current) return;
        e.preventDefault(); setIsDrawing(true);
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left; const y = e.clientY - rect.top;
        currentPathRef.current = [{x, y}];
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (activeTool === 'magic-eraser' && isDrawing && canvasRef.current) {
            e.preventDefault();
            const rect = canvasRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left; const y = e.clientY - rect.top;
            currentPathRef.current.push({x, y});
            const ctx = canvasRef.current.getContext('2d');
            if(ctx) { ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)'; ctx.lineWidth = magicEraserBrushSize; ctx.lineTo(x, y); ctx.stroke(); }
        }
        if (isDraggingClip && dragStartRef.current && selectedClipId) {
            e.preventDefault();
            const containerWidth = wrapperRef.current?.firstChild ? (wrapperRef.current.firstChild as HTMLElement).clientWidth : 1280;
            const scaleFactor = 1280 / containerWidth;
            const deltaX = (e.clientX - dragStartRef.current.mouseX) * scaleFactor;
            const deltaY = (e.clientY - dragStartRef.current.mouseY) * scaleFactor;
            const newX = dragStartRef.current.clipX + deltaX;
            const newY = dragStartRef.current.clipY + deltaY;
            const clip = clips.find(c => c.id === selectedClipId);
            if (clip) {
                const newTransform = { ...clip.properties.transform, x: newX, y: newY };
                onUpdateClip(selectedClipId, { properties: { ...clip.properties, transform: newTransform as any } });
            }
        }
    };

    const handleMouseUp = () => {
        if (isDrawing && canvasRef.current) {
            setIsDrawing(false);
            if (onDrawMagicEraser && currentPathRef.current.length > 0) { onDrawMagicEraser(currentPathRef.current, { width: canvasRef.current.width, height: canvasRef.current.height }); }
            currentPathRef.current = [];
        }
        if (isDraggingClip) { setIsDraggingClip(false); dragStartRef.current = null; }
    };

    const handleClipMouseDown = (e: React.MouseEvent, clip: Clip) => {
        if (activeTool !== 'cursor') return;
        e.preventDefault(); e.stopPropagation(); onSelectClip?.(clip.id);
        setIsDraggingClip(true);
        dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, clipX: clip.properties.transform?.x || 0, clipY: clip.properties.transform?.y || 0 };
    };

    const renderClipContent = (clip: Clip) => {
        let activeClip = clip;
        const timeInContainer = currentTime - clip.start;
        if (clip.children && clip.children.length > 0) {
            const child = clip.children.find(c => timeInContainer >= c.start && timeInContainer < c.start + c.duration);
            if (child) activeClip = child;
            else return null;
        }
        const media = mediaLibrary[activeClip.fileName];
        if (!media && activeClip.type !== 'text') return null;
        const p = activeClip.properties;
        const isSelected = selectedClipId === clip.id;
        const trans = p.transform || { x: 0, y: 0, scale: 1, rotation: 0 };
        if (activeClip.type === 'audio') return <AudioElement key={activeClip.id} clip={activeClip} media={media} active={true} currentTime={currentTime} isPlaying={isPlaying} />;
        
        const effectId = clip.effect || activeClip.effect;
        const transition = clip.transition || activeClip.transition;
        const movement = clip.properties.movement || activeClip.properties.movement;
        
        const effectDef = getEffectDef(effectId);
        let filterString = '';
        if (effectDef?.filter) filterString += ` ${effectDef.filter}`;
        if (p.adjustments) {
            if (p.adjustments.brightness !== 1) filterString += ` brightness(${p.adjustments.brightness})`;
            if (p.adjustments.contrast !== 1) filterString += ` contrast(${p.adjustments.contrast})`;
            if (p.adjustments.saturate !== 1) filterString += ` saturate(${p.adjustments.saturate})`;
            if (p.adjustments.hue !== 0) filterString += ` hue-rotate(${p.adjustments.hue}deg)`;
        }
        
        const trackZIndex: Record<string, number> = {
            'video': 1,
            'camada': 2,
            'text': 3,
            'subtitle': 4
        };

        const clipStyle: React.CSSProperties = { 
            zIndex: isSelected ? 50 : (trackZIndex[activeClip.track] || 10), 
            opacity: p.opacity ?? 1, 
            mixBlendMode: p.blendMode as any,
            transform: `translate3d(${trans.x}px, ${trans.y}px, 0) rotate(${trans.rotation}deg) ${p.mirror ? 'scaleX(-1)' : ''}`,
            backfaceVisibility: 'hidden',
            perspective: '1000px',
            willChange: 'transform, opacity',
            // @ts-ignore
            '--beat-speed': beatSpeed,
            // @ts-ignore
            '--beat-val': beatValue,
            // @ts-ignore
            '--beat-intensity': beatIntensity
        };

        // --- TRANSITION LOGIC ---
        const animationDelay = `-${timeInContainer}s`;
        const playState = isPlaying ? 'running' : 'paused';
        let transitionClass = ''; let transitionStyle: React.CSSProperties = {};
        
        if (transition && timeInContainer < transition.duration) {
            // AI Morph Transition Video handling
            if (transition.id === 'ai-morph') {
                if (transition.videoUrl) {
                    return (
                        <div 
                            key={`${clip.id}-morph`}
                            className="absolute inset-0 z-50 flex items-center justify-center transform-gpu"
                            style={clipStyle}
                        >
                            <MorphTransitionVideo 
                                url={transition.videoUrl}
                                duration={transition.duration}
                                timeInContainer={timeInContainer}
                                isPlaying={isPlaying}
                                filterString={filterString}
                                opacity={p.opacity}
                                blendMode={p.blendMode}
                            />
                        </div>
                    );
                } else if (transition.isGenerating) {
                    return (
                        <div 
                            key={`${clip.id}-morph-loading`}
                            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm"
                            style={clipStyle}
                        >
                            <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4 shadow-lg shadow-purple-500/20"></div>
                            <div className="text-white text-[10px] font-bold uppercase tracking-widest animate-pulse">Gerando Transformação IA...</div>
                        </div>
                    );
                }
            }

            transitionClass = getSafeTransitionClass(transition.id);
            transitionStyle = { 
                animationDuration: `${transition.duration}s`, 
                animationFillMode: 'both', 
                animationPlayState: playState, 
                animationDelay: animationDelay 
            };
        }
        
        // --- MOVEMENT LOGIC ---
        const movementClass = movement ? movement.type : '';
        let movementStyle: React.CSSProperties = {};
        
        if (movement) {
            const config = getAnimConfig(movement.type, clip.duration);
            const speed = movement.config?.speed || 1;
            const intensity = movement.config?.intensity || 1;
            
            movementStyle = { 
                animationName: movementClass, // Maps directly to @keyframes defined in index.html
                animationDuration: `${config.duration / speed}s`,
                animationFillMode: 'both', 
                animationTimingFunction: 'ease-in-out', 
                animationIterationCount: config.iterations as any,
                animationPlayState: playState,
                animationDelay: animationDelay,
                willChange: 'transform',
            };

            const styleAny = movementStyle as any;
            styleAny['--intensity'] = intensity;

            // Inject CSS variables for dynamic Ken Burns
            if (movement.type === 'kenBurns') {
                 const { startScale = 1, endScale = 1.35, startX = 0, startY = 0, endX = 0, endY = 0 } = movement.config || {};
                 styleAny['--kb-s'] = startScale;
                 styleAny['--kb-e'] = endScale;
                 styleAny['--kb-sx'] = `${startX}%`;
                 styleAny['--kb-sy'] = `${startY}%`;
                 styleAny['--kb-ex'] = `${endX}%`;
                 styleAny['--kb-ey'] = `${endY}%`;
                 movementStyle.animationName = 'kenBurnsDynamic';
                 
                 // Adjust duration for back and forth if it's Ken Burns
                 movementStyle.animationDuration = `${6 / speed}s`;
                 movementStyle.animationIterationCount = 'infinite';
            }

            if (movement.type === 'parallax') {
                const { intensity: pIntensity = 5, direction = 0 } = movement.config || {};
                const rad = (direction * Math.PI) / 180;
                const x = Math.cos(rad) * pIntensity * 5 * intensity;
                const y = Math.sin(rad) * pIntensity * 5 * intensity;
                styleAny['--px-x'] = `${x}px`;
                styleAny['--px-y'] = `${y}px`;
                movementStyle.animationName = 'parallaxDynamic';
                
                // Adjust duration for back and forth
                movementStyle.animationDuration = `${6 / speed}s`;
                movementStyle.animationIterationCount = 'infinite';
            }
        }
        
        let textAnimClass = '';
        if (activeClip.type === 'text' && p.textDesign?.animation) {
             const anim = p.textDesign.animation;
             const animDur = 0.8; const remaining = activeClip.duration - timeInContainer;
             if (anim.in && anim.in !== 'none' && timeInContainer < animDur) {
                 const def = (TEXT_RESOURCES.animations.in as any[]).find(a => a.id === anim.in);
                 if (def) textAnimClass = def.class || '';
             } 
             else if (anim.out && anim.out !== 'none' && remaining < animDur) {
                 const def = (TEXT_RESOURCES.animations.out as any[]).find(a => a.id === anim.out);
                 if (def) textAnimClass = def.class || '';
             } 
             else if (anim.loop && anim.loop !== 'none') {
                 const def = (TEXT_RESOURCES.animations.loop as any[]).find(a => a.id === anim.loop);
                 if (def) textAnimClass = def.class || '';
             }
        }

        if (p.mask?.shape && p.mask.shape !== 'none') {
            if (p.mask.shape === 'circle') (clipStyle as any).clipPath = 'circle(50% at 50% 50%)';
            if (p.mask.shape === 'rectangle') (clipStyle as any).clipPath = 'inset(10% 10% 10% 10%)';
            if (p.mask.shape === 'heart') (clipStyle as any).clipPath = 'polygon(50% 0%, 100% 38%, 82% 100%, 50% 100%, 18% 100%, 0% 38%)';
            if (p.mask.shape === 'star') (clipStyle as any).clipPath = 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
        }
        
        const volume = calculateEffectiveVolume(activeClip, currentTime);
        const isInteractive = activeClip.type === 'text' || activeClip.type === 'image' || activeClip.type === 'video';
        const canDrag = isSelected && activeTool === 'cursor' && (activeClip.type === 'text' || activeClip.type === 'image');
        
        return (
            <div 
                key={activeClip.id} 
                className={`absolute inset-0 ${canDrag ? 'pointer-events-auto cursor-move' : isInteractive ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`} 
                style={clipStyle} 
                onMouseDown={(e) => {
                    e.stopPropagation();
                    if (isInteractive && !isSelected) onSelectClip?.(clip.id);
                    if (canDrag) handleClipMouseDown(e, clip);
                }}
            >
                <div className="w-full h-full" style={{ transform: `scale(${trans.scale})` }}>
                    <div className={`w-full h-full ${transitionClass}`} style={transitionStyle}>
                        <div className={`w-full h-full transform-gpu ${movementClass}`} style={movementStyle}>
                            <div className="w-full h-full relative overflow-hidden">
                                {activeClip.type === 'video' ? (
                                    <VideoElement clip={activeClip} media={media} active={true} currentTime={currentTime} isPlaying={isPlaying} objectFit={p.fit || 'cover'} style={{ filter: filterString.trim() || undefined }} volume={volume} />
                                ) : activeClip.type === 'text' ? (
                                    p.textDesign?.isProgressBar ? (
                                        <div className="w-full h-full flex items-end p-4">
                                            <div className="w-full h-3 rounded-full overflow-hidden" style={{ backgroundColor: p.textDesign?.backgroundColor }}>
                                                <div 
                                                    className="h-full transition-all duration-100 ease-linear" 
                                                    style={{ 
                                                        width: `${(currentTime / totalDuration) * 100}%`,
                                                        backgroundColor: p.textDesign?.color,
                                                        background: p.textDesign?.background as any
                                                    }} 
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className={`w-full h-full flex ${p.textDesign?.isLowerThird ? 'items-end pb-20 px-10' : 'items-center justify-center'} text-center font-bold transform-gpu ${effectDef?.class || ''} ${textAnimClass}`} 
                                            style={{ 
                                                color: p.textDesign?.color, 
                                                backgroundColor: p.textDesign?.backgroundColor, 
                                                textShadow: p.textDesign?.shadow ? `${p.textDesign.shadow.x}px ${p.textDesign.shadow.y}px ${p.textDesign.shadow.blur}px ${p.textDesign.shadow.color}` : undefined, 
                                                WebkitTextStroke: p.textDesign?.stroke ? `${p.textDesign.stroke.width}px ${p.textDesign.stroke.color}` : undefined, 
                                                ...effectDef?.customStyle, 
                                                filter: filterString.trim() || undefined, 
                                                width: '100%', 
                                                height: '100%', 
                                                fontFamily: p.textDesign?.fontFamily || activeClip.styleId, 
                                                fontSize: '40px',
                                                lineHeight: '1.2',
                                                padding: '0 5%',
                                                wordWrap: 'break-word',
                                                whiteSpace: 'pre-wrap',
                                                overflowWrap: 'break-word',
                                                maxWidth: '100%'
                                            } as React.CSSProperties} 
                                        >
                                            <span className="max-w-full whitespace-pre-wrap break-words pointer-events-none">{p.text}</span>
                                        </div>
                                    )
                                ) : (
                                    media.url ? <img src={media.url || undefined} className="w-full h-full block" style={{ objectFit: p.fit || 'cover', filter: filterString.trim() || undefined }} /> : null
                                )}
                                {effectDef?.overlayClass && <div className={`absolute inset-0 ${effectDef.overlayClass} pointer-events-none w-full h-full`}></div>}
                                {isSelected && activeTool === 'cursor' && (
                                    <div className="absolute inset-0 border-2 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] pointer-events-none rounded-lg opacity-70">
                                        <div className="absolute top-0 left-0 w-2 h-2 bg-blue-500 rounded-full -translate-x-1/2 -translate-y-1/2"></div>
                                        <div className="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-full translate-x-1/2 -translate-y-1/2"></div>
                                        <div className="absolute bottom-0 left-0 w-2 h-2 bg-blue-500 rounded-full -translate-x-1/2 translate-y-1/2"></div>
                                        <div className="absolute bottom-0 right-0 w-2 h-2 bg-blue-500 rounded-full translate-x-1/2 translate-y-1/2"></div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const visualTracks = ['video', 'camada', 'text', 'subtitle'];
    // Filter visible clips first, then sort
    const activeVisualClips = visibleClips.filter(c => visualTracks.includes(c.track));
    const sortedClips = [...activeVisualClips].sort((a, b) => {
        // High Z-Index for UI elements
        const order = { video: 0, camada: 1, text: 2, subtitle: 3 };
        return (order[a.track as keyof typeof order] || 0) - (order[b.track as keyof typeof order] || 0);
    });
    const audioClips = visibleClips.filter(c => ['audio', 'narration', 'music', 'sfx'].includes(c.track));

    return (
        <div className="flex flex-col h-full w-full bg-black overflow-hidden" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
            <div ref={wrapperRef} className="flex-1 overflow-hidden relative flex items-center justify-center bg-zinc-950">
                <div className="relative overflow-hidden transition-all duration-300 shadow-2xl flex items-center justify-center" style={{ width: containerDims.width, height: containerDims.height, backgroundColor: backgroundImage ? 'transparent' : (backgroundColor || '#000000'), isolation: 'isolate' }} onMouseDown={() => onSelectClip?.(null)} >
                    {backgroundImage && <img src={backgroundImage || undefined} className="absolute inset-0 w-full h-full object-cover pointer-events-none" alt="bg" />}
                    {sortedClips.map(clip => renderClipContent(clip))}
                    {audioClips.map(clip => renderClipContent(clip))}
                    <ReactiveOverlay currentTime={currentTime} clips={clips} />
                    {activeTool === 'magic-eraser' && (
                        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-[100] cursor-crosshair touch-none" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} />
                    )}
                </div>
            </div>
            <div className="flex-shrink-0 h-12 bg-zinc-900 border-t border-zinc-800 flex items-center justify-center px-4 gap-4 z-50 relative">
                <span className="text-[10px] font-mono text-zinc-500 w-16 text-center">{currentTime.toFixed(2)}s</span>
                <button onClick={onTogglePlay} className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-lg active:scale-90 transition-all">
                    <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play'} text-sm`}></i>
                </button>
                <span className="text-[10px] font-mono text-zinc-500 w-16 text-center">{totalDuration.toFixed(2)}s</span>
            </div>
        </div>
    );
};
