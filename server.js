import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";
import { Header } from './components/Header';
import { BrowserPanel } from './components/BrowserPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { PreviewPanel } from './components/PreviewPanel';
import { InspectorPanel } from './components/InspectorPanel';
import { LiveAssistant } from './components/LiveAssistant';
import { MobileLayout } from './components/MobileLayout';
import { Toast, ToastProps } from './components/Toast';
import { 
    EditorState, Clip, MediaItem, MediaType, ScriptScene, 
    ClipProperties, TextDesignProperties, MovementConfig 
} from './types';
import { BACKEND_URL, RESOURCES } from './constants';

const getDB = () => {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('VideoEditorDB', 1);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains('files')) {
                db.createObjectStore('files');
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

const storeFileInDB = async (name: string, blob: Blob) => {
    const db = await getDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put(blob, name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

const getFileFromDB = async (name: string): Promise<Blob | undefined> => {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readonly');
        const req = tx.objectStore('files').get(name);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

const base64ToBlob = (base64: string, mimeType: string) => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
};

const base64ToUint8Array = (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

const blobUrlToBase64 = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = reader.result as string;
            resolve(base64data.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
};

const pcmToWav = (pcmData: Uint8Array, sampleRate: number = 24000, numChannels: number = 1) => {
    const buffer = new ArrayBuffer(44 + pcmData.byteLength);
    const view = new DataView(buffer);
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.byteLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, pcmData.byteLength, true);
    for (let i = 0; i < pcmData.byteLength; i++) {
        view.setUint8(44 + i, pcmData[i]);
    }
    return new Blob([view], { type: 'audio/wav' });
};

const mapVoiceIdToGeminiName = (uiId: string): string => {
    if (!uiId) return 'Kore';
    if (uiId.startsWith('fav_')) uiId = uiId.replace('fav_', '');
    if (uiId.includes('_f_')) {
        const zephyrKeywords = ['soft', 'husk', 'high', 'pierce', 'child', 'teen', 'witch', 'yoga', 'asmr', 'nasal', 'ethereal', 'ghost', 'siren', 'anime', 'happy', 'hysteric', 'gossip', 'scary', 'kpop', 'elf'];
        if (zephyrKeywords.some(k => uiId.includes(k))) return 'Zephyr';
        return 'Kore';
    } else if (uiId.includes('_m_')) {
        const charonKeywords = ['deep_1', 'smooth', 'mid', 'old', 'radio', 'doc', 'meditate', 'ghost', 'hero', 'villain', 'lazy', 'cave', 'cowboy', 'medieval'];
        const fenrirKeywords = ['deep_2', 'trailer', 'giant', 'kratos', 'raspy', 'gravel', 'smoker', 'ancient', 'preacher', 'alien', 'demon', 'drunk', 'fat', 'noir', 'mask', 'grumpy', 'pirate'];
        if (charonKeywords.some(k => uiId.includes(k))) return 'Charon';
        if (fenrirKeywords.some(k => uiId.includes(k))) return 'Fenrir';
        return 'Puck';
    }
    return 'Kore';
};

const getUserKey = (): string => {
    try {
        const keys = JSON.parse(localStorage.getItem('proedit_api_keys') || '{}');
        return (keys.googleApiKey as string) || (process.env.API_KEY as string) || '';
    } catch {
        return (process.env.API_KEY as string) || '';
    }
};

const calculateProjectDuration = (clips: Clip[]) => {
    if (!clips || clips.length === 0) return 30;
    const endTimes = clips.map(c => {
        const start = Number(c.start);
        const duration = Number(c.duration);
        return (isNaN(start) ? 0 : start) + (isNaN(duration) ? 0 : duration);
    });
    const contentDuration = Math.max(...endTimes, 0);
    // Ensuring result is never 0, null or NaN
    const finalVal = isNaN(contentDuration) || contentDuration <= 0 ? 30 : Math.max(contentDuration, 1);
    return Number(finalVal.toFixed(3)); // Clean floating point
};

const App: React.FC = () => {
    const initialState: EditorState = {
        media: {},
        clips: [],
        selectedClipId: null,
        selectedTransition: { clipId: null },
        currentPlayheadTime: 0,
        isPlaying: false,
        pixelsPerSecond: 20,
        totalDuration: 30,
        projectAspectRatio: '16:9',
        activeAudioNodes: {},
        backgroundColor: '#000000',
        history: [],
        historyIndex: -1
    };

    const [state, setState] = useState<EditorState>(initialState);
    const [activeInspectorSection, setActiveInspectorSection] = useState<string | null>(null);
    const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
    const [toasts, setToasts] = useState<ToastProps[]>([]);
    const [mobileTab, setMobileTab] = useState<'timeline' | 'browser' | 'inspector'>('timeline');
    const [activeTool, setActiveTool] = useState<'cursor' | 'magic-eraser'>('cursor');
    const [magicEraserBrushSize, setMagicEraserBrushSize] = useState(20);
    const [maskPaths, setMaskPaths] = useState<{points: {x: number, y: number}[], dims: {width: number, height: number}}[]>([]);

    const addToast = (message: string, type: 'success' | 'error' | 'info') => {
        setToasts(prev => [...prev, { message, type, onClose: () => {} }]);
    };

    const pushHistory = (newState: EditorState) => {
        const { history, historyIndex, activeAudioNodes, isPlaying, ...currentState } = state;
        const historyEntry = { ...currentState };
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(historyEntry);
        if (newHistory.length > 20) newHistory.shift();
        return {
            ...newState,
            history: newHistory,
            historyIndex: newHistory.length - 1
        };
    };

    const withHistory = (prev: EditorState, updates: Partial<EditorState>) => pushHistory({ ...prev, ...updates });

    const handleNewProject = () => {
        setState(initialState);
        addToast("Novo projeto iniciado!", 'info');
    };

    const handleUndo = () => {
        if (state.historyIndex >= 0) {
            const newIndex = state.historyIndex;
            const prevState = state.history[newIndex];
            const newHistory = state.history.slice(0, newIndex);
            setState(s => ({ ...s, ...prevState, history: newHistory, historyIndex: newIndex - 1, isPlaying: false }));
            addToast("Desfeito", 'info');
        }
    };

    const handleRedo = () => {};

    const handleDuplicate = () => {
        if (!state.selectedClipId) return;
        const clip = state.clips.find(c => c.id === state.selectedClipId);
        if (!clip) return;
        const newClip = {
            ...clip,
            id: `clip_${Date.now()}_copy`,
            start: clip.start + clip.duration
        };
        setState(s => {
            const newState = { ...s, clips: [...s.clips, newClip] };
            return pushHistory(newState);
        });
        addToast("Clipe Duplicado", 'success');
    };

    const addMediaToLibraryOnly = (item: MediaItem) => {
        setState(s => ({
            ...s,
            media: { ...s.media, [item.name]: item }
        }));
    };

    const addMediaItemToState = (item: MediaItem, time?: number, track?: string) => {
        setState(s => {
            const newMedia = { ...s.media, [item.name]: item };
            const newClip: Clip = {
                id: `clip_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                fileName: item.name,
                type: item.type,
                track: (track as any) || (item.type === 'audio' ? 'audio' : 'video'),
                start: time !== undefined ? time : 0,
                duration: item.duration || 5,
                properties: { opacity: 1, volume: 1, speed: 1, transform: { x:0, y:0, scale:1, rotation:0 } }
            };
            let startTime = time;
            if (startTime === undefined) {
                const trackClips = s.clips.filter(c => c.track === newClip.track);
                const lastClipEnd = trackClips.length > 0 ? Math.max(...trackClips.map(c => c.start + c.duration)) : 0;
                startTime = lastClipEnd;
            }
            newClip.start = startTime;
            const newState = { ...s, media: newMedia, clips: [...s.clips, newClip] };
            return pushHistory(newState);
        });
    };

    const handleDelete = () => {
        if(state.selectedClipId) {
            setState(s => {
                const newState = {...s, clips: s.clips.filter(c => c.id !== s.selectedClipId), selectedClipId: null};
                return pushHistory(newState);
            });
            addToast("Clipe deletado", 'info');
        }
    };

    const handleSplit = () => {
        if (!state.selectedClipId) return;
        const clip = state.clips.find(c => c.id === state.selectedClipId);
        if (!clip) return;
        const time = state.currentPlayheadTime;
        if (time > clip.start && time < clip.start + clip.duration) {
            const firstDur = time - clip.start;
            const secondDur = clip.duration - firstDur;
            const clip1 = { ...clip, duration: firstDur };
            const clip2 = { ...clip, id: `clip_${Date.now()}_split`, start: time, duration: secondDur, mediaStartOffset: (clip.mediaStartOffset || 0) + firstDur };
            setState(s => ({ ...s, clips: s.clips.map(c => c.id === clip.id ? clip1 : c).concat(clip2) }));
            addToast("Clipe dividido", 'success');
        }
    };

    const handleGenerativeFill = async () => {
        if (!state.selectedClipId) return;
        const clip = state.clips.find(c => c.id === state.selectedClipId);
        if (!clip || clip.type !== 'image') {
            addToast("Selecione uma imagem para Generative Fill.", 'info');
            return;
        }

        setLoadingMessage("Generative Fill (Gemini AI)...");
        try {
            const media = state.media[clip.fileName];
            const base64Data = await blobUrlToBase64(media.url);
            const ai = new GoogleGenAI({ apiKey: getUserKey() });
            
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash-image",
                contents: [
                    { inlineData: { mimeType: media.mimeType || 'image/png', data: base64Data } },
                    { text: "Perform generative fill on this image. Seamlessly expand the scene, add realistic details to the edges, and enhance the overall composition. High resolution, high quality. Return image only." }
                ]
            });

            if (response.candidates && response.candidates[0].content.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        const blob = base64ToBlob(part.inlineData.data, part.inlineData.mimeType);
                        const name = `genfill_${Date.now()}.png`;
                        await storeFileInDB(name, blob);
                        
                        const newItem: MediaItem = {
                            name: name,
                            url: URL.createObjectURL(blob),
                            type: 'image',
                            duration: clip.duration,
                            isUserFile: true,
                            thumbnail: URL.createObjectURL(blob)
                        };

                        setState(prev => {
                            const newMedia = { ...prev.media, [name]: newItem };
                            const updatedClips = prev.clips.map(c => c.id === prev.selectedClipId ? { ...c, fileName: name } : c);
                            return pushHistory({ ...prev, media: newMedia, clips: updatedClips });
                        });
                        addToast("Generative Fill concluído!", 'success');
                        return;
                    }
                }
            }
        } catch (e: any) {
            console.error(e);
            addToast(`Erro Generative Fill: ${e.message}`, 'error');
        } finally {
            setLoadingMessage(null);
        }
    };

    const handleFreeze = async () => {
        if (!state.selectedClipId) return;
        const clip = state.clips.find(c => c.id === state.selectedClipId);
        if (!clip || clip.type !== 'video') {
            addToast("Selecione um vídeo para congelar.", 'info');
            return;
        }
        
        setLoadingMessage("Congelando Frame...");
        try {
            const media = state.media[clip.fileName];
            let fileBlob = await getFileFromDB(media.name);
            if (!fileBlob && media.url) {
                const r = await fetch(media.url);
                fileBlob = await r.blob();
            }
            
            if (!fileBlob) throw new Error("Mídia não encontrada.");

            const timestamp = state.currentPlayheadTime - clip.start + (clip.mediaStartOffset || 0);
            
            const formData = new FormData();
            formData.append('video', fileBlob, media.name);
            formData.append('timestamp', timestamp.toString());
            
            const res = await fetch(`${BACKEND_URL}/api/util/extract-frame`, { method: 'POST', body: formData });
            if (!res.ok) throw new Error("Falha na extração");
            const frameBlob = await res.blob();
            
            const frameName = `freeze_${Date.now()}.png`;
            await storeFileInDB(frameName, frameBlob);
            const frameUrl = URL.createObjectURL(frameBlob);
            
            const frameMedia: MediaItem = { name: frameName, url: frameUrl, type: 'image', duration: 3, isUserFile: true, thumbnail: frameUrl };
            
            addMediaToLibraryOnly(frameMedia);
            
            setState(prev => {
                const targetClip = prev.clips.find(c => c.id === prev.selectedClipId);
                if(!targetClip) return prev;
                
                const freezeDuration = 3;
                const cutPoint = prev.currentPlayheadTime;
                const relativeCut = cutPoint - targetClip.start;
                
                if (relativeCut <= 0 || relativeCut >= targetClip.duration) return prev;

                const clip1 = { ...targetClip, duration: relativeCut };
                const freezeClip: Clip = {
                    id: `freeze_${Date.now()}`,
                    fileName: frameName,
                    type: 'image',
                    track: targetClip.track,
                    start: cutPoint,
                    duration: freezeDuration,
                    properties: { ...targetClip.properties, speed: 1 } 
                };
                const clip3 = { 
                    ...targetClip, 
                    id: `clip_${Date.now()}_after`, 
                    start: cutPoint + freezeDuration, 
                    duration: targetClip.duration - relativeCut,
                    mediaStartOffset: (targetClip.mediaStartOffset || 0) + relativeCut
                };
                
                const otherClips = prev.clips.filter(c => c.id !== targetClip.id).map(c => {
                    if (c.track === targetClip.track && c.start >= cutPoint) {
                        return { ...c, start: c.start + freezeDuration };
                    }
                    return c;
                });
                
                return pushHistory({
                    ...prev,
                    clips: [...otherClips, clip1, freezeClip, clip3],
                    media: { ...prev.media, [frameName]: frameMedia }
                });
            });
            
            addToast("Frame Congelado (3s)!", 'success');

        } catch (e: any) {
            console.error(e);
            addToast(`Erro ao congelar: ${e.message}`, 'error');
        } finally {
            setLoadingMessage(null);
        }
    };

    const handleSceneDetect = async () => {
        if (!state.selectedClipId) return;
        const clip = state.clips.find(c => c.id === state.selectedClipId);
        if (!clip || clip.type !== 'video') {
            addToast("Selecione um vídeo para detectar cenas.", 'info');
            return;
        }

        setLoadingMessage("Analisando Cenas (AI)...");
        try {
            const media = state.media[clip.fileName];
            let fileBlob = await getFileFromDB(media.name);
            if (!fileBlob && media.url) {
                const r = await fetch(media.url);
                fileBlob = await r.blob();
            }
            
            if (!fileBlob) throw new Error("Mídia não encontrada.");

            const formData = new FormData();
            formData.append('video', fileBlob, media.name);

            const res = await fetch(`${BACKEND_URL}/api/analyze/scenes`, { method: 'POST', body: formData });
            if (!res.ok) throw new Error("Falha na análise");
            const { scenes } = await res.json(); 

            if (!scenes || scenes.length === 0) {
                addToast("Nenhuma mudança de cena significativa detectada.", 'info');
                return;
            }

            setState(prev => {
                let currentClips = [...prev.clips];
                const sortedScenes = scenes.sort((a: any, b: any) => a - b);
                const clipStartOffset = clip.mediaStartOffset || 0;
                const clipEndOffset = clipStartOffset + clip.duration;
                const relevantSplits = sortedScenes.filter((t: number) => t > clipStartOffset + 0.5 && t < clipEndOffset - 0.5);

                if (relevantSplits.length === 0) return prev;

                const newSegments: Clip[] = [];
                let currentOffset = clipStartOffset;
                let currentTimelineStart = clip.start;
                const cutPoints = [...relevantSplits, clipEndOffset];

                cutPoints.forEach((point: number, idx: number) => {
                    const dur = point - currentOffset;
                    if (dur > 0.1) {
                        newSegments.push({
                            ...clip,
                            id: `scene_split_${Date.now()}_${idx}`,
                            start: currentTimelineStart,
                            duration: dur,
                            mediaStartOffset: currentOffset
                        });
                        currentTimelineStart += dur;
                        currentOffset = point;
                    }
                });

                const finalClips = currentClips.filter(c => c.id !== clip.id).concat(newSegments);
                return pushHistory({ ...prev, clips: finalClips });
            });

            addToast(`Vídeo dividido em cenas detectadas!`, 'success');

        } catch (e: any) {
            console.error(e);
            addToast(`Erro na detecção: ${e.message}`, 'error');
        } finally {
            setLoadingMessage(null);
        }
    };

    const handleClearTimeline = () => {
        if (confirm("Tem certeza que deseja limpar toda a timeline?")) {
            setState(s => {
                const newState = { ...s, clips: [], selectedClipId: null };
                return pushHistory(newState);
            });
            addToast("Timeline limpa", 'info');
        }
    };

    useEffect(() => {
        const newDuration = calculateProjectDuration(state.clips);
        if (state.totalDuration === null || isNaN(state.totalDuration) || Math.abs(state.totalDuration - newDuration) > 0.01) {
            setState(s => ({ ...s, totalDuration: newDuration }));
        }
    }, [state.clips, state.totalDuration]);

    useEffect(() => {
        let animationFrame: number;
        let lastTime: number | null = null;
        const animate = (time: number) => {
            if (lastTime === null) {
                lastTime = time;
                animationFrame = requestAnimationFrame(animate);
                return;
            }
            const delta = (time - lastTime) / 1000;
            lastTime = time;
            setState(prev => {
                if (!prev.isPlaying) return prev;
                const newTime = prev.currentPlayheadTime + delta;
                if (newTime >= prev.totalDuration) {
                    return { ...prev, currentPlayheadTime: 0, isPlaying: false };
                }
                return { ...prev, currentPlayheadTime: newTime };
            });
            animationFrame = requestAnimationFrame(animate);
        };
        if (state.isPlaying) {
            animationFrame = requestAnimationFrame(animate);
        }
        return () => {
            if (animationFrame) cancelAnimationFrame(animationFrame);
        };
    }, [state.isPlaying]);

    const handleApplyToAll = (type: 'transition' | 'effect' | 'movement', id: string) => {
        setState(s => {
            const newClips = s.clips.map(c => {
                if (['video', 'image', 'text', 'camada'].includes(c.track) || c.type === 'video' || c.type === 'image' || c.type === 'text') {
                    if (type === 'transition') {
                        return { ...c, transition: { id, duration: 1 } };
                    } else if (type === 'effect') {
                        return { ...c, effect: id };
                    } else if (type === 'movement') {
                        return { ...c, properties: { ...c.properties, movement: { type: id, config: {} } } };
                    }
                }
                return c;
            });
            const newState = { ...s, clips: newClips };
            addToast(`Aplicado '${type}' a todos os clipes!`, 'success');
            return pushHistory(newState);
        });
    };

    const handleGeminiStyleTransfer = async (media: MediaItem, style: string, ratio: string) => {
        const currentClipId = state.selectedClipId;
        if (!currentClipId) return;

        setLoadingMessage("Aplicando Estilo (Gemini AI)...");
        try {
            const base64Data = await blobUrlToBase64(media.url);
            const mimeType = media.mimeType || 'image/png';
            const ai = new GoogleGenAI({ apiKey: getUserKey() });
            
            let prompt = `Transform this image into a strictly ${style} style. Maintain the composition but completely change the artistic style. High quality, detailed. Return image only.`;
            
            if (style === 'pixar' || style === 'pixar_glossy' || style === 'Cartoon 3D') {
                prompt = "Transform this image into a high-quality 3D Pixar/Disney style animation render. Cute, glossy, vibrant colors, soft lighting, expressive features. 8k resolution. Do not crop.";
            } else if (style === 'anime' || style === 'anime_vibrant' || style === 'Anime Style') {
                prompt = "Transform this image into a high-quality Japanese Anime style. 2D cell shading, vibrant colors, Studio Ghibli or Makoto Shinkai style background. Detailed. Do not crop.";
            } else if (style === 'colorize-real' || style === 'Colorir P&B') {
                prompt = "Colorize this black and white image with highly realistic and natural colors. High dynamic range, correct skin tones, vivid environment. 8k resolution.";
            }

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash-image",
                contents: [{ inlineData: { mimeType, data: base64Data } }, { text: prompt }]
            });

            if (response.candidates && response.candidates[0].content.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        const blob = base64ToBlob(part.inlineData.data, part.inlineData.mimeType);
                        const name = `styled_${Date.now()}.png`;
                        await storeFileInDB(name, blob);
                        
                        const newItem: MediaItem = {
                            name: name,
                            url: URL.createObjectURL(blob),
                            type: 'image',
                            duration: 5,
                            isUserFile: true,
                            thumbnail: URL.createObjectURL(blob),
                            width: media.width,
                            height: media.height
                        };

                        setState(prev => {
                            const newMedia = { ...prev.media, [name]: newItem };
                            const updatedClips = prev.clips.map(c => {
                                if (c.id === currentClipId) {
                                    return { ...c, fileName: name };
                                }
                                return c;
                            });

                            return pushHistory({ 
                                ...prev, 
                                media: newMedia,
                                clips: updatedClips
                            });
                        });
                        
                        addToast("Estilo aplicado com sucesso!", 'success');
                        return;
                    }
                }
            }
            throw new Error("Nenhuma imagem gerada pelo Gemini.");

        } catch (e: any) {
            console.error("Gemini Error:", e);
            addToast(`Erro ao aplicar estilo: ${e.message}`, 'error');
        } finally {
            setLoadingMessage(null);
        }
    };

    const handleGeminiRemoveBackground = async (media: MediaItem) => {
        const currentClipId = state.selectedClipId;
        if (!currentClipId) return;

        setLoadingMessage("Removendo Fundo (Gemini)...");
        try {
            const base64Data = await blobUrlToBase64(media.url);
            const ai = new GoogleGenAI({ apiKey: getUserKey() });
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash-image",
                contents: [
                    { inlineData: { mimeType: media.mimeType || 'image/png', data: base64Data } },
                    { text: "Remove the background from this image. Return ONLY the image with transparent background." }
                ]
            });
            if (response.candidates && response.candidates[0].content.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        const blob = base64ToBlob(part.inlineData.data, part.inlineData.mimeType);
                        const name = `bg_removed_${Date.now()}.png`;
                        await storeFileInDB(name, blob);
                        const newItem: MediaItem = { name, url: URL.createObjectURL(blob), type: 'image', duration: 5, isUserFile: true, thumbnail: URL.createObjectURL(blob), width: media.width, height: media.height };
                        
                        setState(prev => {
                            const newMedia = { ...prev.media, [name]: newItem };
                            const updatedClips = prev.clips.map(c => c.id === currentClipId ? { ...c, fileName: name } : c);
                            return pushHistory({ ...prev, clips: updatedClips, media: newMedia });
                        });
                        
                        addToast("Fundo removido!", 'success');
                        return;
                    }
                }
            }
            throw new Error("Falha na geração.");
        } catch (e: any) { console.error(e); addToast(`Erro: ${e.message}`, 'error'); } finally { setLoadingMessage(null); }
    };

    const handleMergeLayer = async (layerClipId: string) => {
        const layerClip = state.clips.find(c => c.id === layerClipId);
        if (!layerClip) return;
        const baseClip = state.clips.find(c => 
            c.track === 'video' && 
            layerClip.start >= c.start && 
            layerClip.start < (c.start + c.duration)
        );

        if (!baseClip) {
            addToast("Nenhum clipe de fundo encontrado para mesclar.", 'error');
            return;
        }

        setLoadingMessage("Mesclando Camada (Gemini AI)...");
        try {
            const layerMedia = state.media[layerClip.fileName];
            const baseMedia = state.media[baseClip.fileName];
            if (!layerMedia || !baseMedia) throw new Error("Mídia não encontrada.");
            const layerBase64 = await blobUrlToBase64(layerMedia.url);
            const baseBase64 = await blobUrlToBase64(baseMedia.url);
            const ai = new GoogleGenAI({ apiKey: getUserKey() });
            
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash-image",
                contents: [
                    { inlineData: { mimeType: baseMedia.mimeType || 'image/png', data: baseBase64 } },
                    { inlineData: { mimeType: layerMedia.mimeType || 'image/png', data: layerBase64 } },
                    { text: "Merge the sticker image (second image) seamlessly onto the background image (first image). The sticker should be integrated naturally with matching lighting and perspective. Return the result as a single merged image. High quality." }
                ]
            });

            if (response.candidates && response.candidates[0].content.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        const blob = base64ToBlob(part.inlineData.data, part.inlineData.mimeType);
                        const name = `merged_${Date.now()}.png`;
                        await storeFileInDB(name, blob);
                        const newItem: MediaItem = { name: name, url: URL.createObjectURL(blob), type: 'image', duration: baseClip.duration, isUserFile: true, thumbnail: URL.createObjectURL(blob) };
                        setState(prev => {
                            const newMedia = { ...prev.media, [name]: newItem };
                            const updatedClips = prev.clips
                                .map(c => c.id === baseClip.id ? { ...c, fileName: name } : c)
                                .filter(c => c.id !== layerClipId);
                            return pushHistory({ ...prev, media: newMedia, clips: updatedClips, selectedClipId: baseClip.id });
                        });
                        addToast("Camada mesclada com sucesso!", 'success');
                        return;
                    }
                }
            }
        } catch (e: any) {
            console.error("Merge Error:", e);
            addToast(`Erro ao mesclar: ${e.message}`, 'error');
        } finally {
            setLoadingMessage(null);
        }
    };

    const handleBackendAction = async (endpoint: string, friendlyName: string, params: any = {}, options: any = {}) => {
        if (endpoint.includes('remove-bg-real') && state.selectedClipId) {
             const clip = state.clips.find(c => c.id === state.selectedClipId);
             if (clip && clip.type === 'image') {
                 const media = state.media[clip.fileName];
                 if (media) { await handleGeminiRemoveBackground(media); return; }
             }
        }
        if ((endpoint.includes('video-to-cartoon-real') || endpoint.includes('colorize-real')) && state.selectedClipId) {
            const clip = state.clips.find(c => c.id === state.selectedClipId);
            if (clip && clip.type === 'image') {
                const media = state.media[clip.fileName];
                let styleId = params.style;
                if (endpoint.includes('colorize-real')) styleId = 'colorize-real';
                if (media) { await handleGeminiStyleTransfer(media, styleId, state.projectAspectRatio); return; }
            }
        }

        let fullEndpoint = endpoint;
        if (!fullEndpoint.startsWith('/')) fullEndpoint = '/api/process/start/' + fullEndpoint;
        if (!fullEndpoint.startsWith('/api')) fullEndpoint = '/api/process/start/' + endpoint;

        const isExport = fullEndpoint.includes('export');
        if (!state.selectedClipId && !options.extraFile && !isExport && !fullEndpoint.includes('generate-music')) {
            addToast("Selecione um clipe.", 'error');
            return;
        }

        setLoadingMessage(isExport ? "Iniciando Exportação de Camadas..." : `Processando ${friendlyName}...`);
        
        try {
            const formData = new FormData();
            if (options.extraFile) {
                formData.append(String(options.extraFieldName || 'video'), options.extraFile);
            } else if (state.selectedClipId && !isExport) {
                const clip = state.clips.find(c => c.id === state.selectedClipId);
                if (clip) {
                    const media = state.media[clip.fileName];
                    const blob = await getFileFromDB(media.name);
                    if (blob) {
                        formData.append('video', blob, media.name);
                    } else {
                        const res = await fetch(media.url);
                        const blob = await res.blob();
                        formData.append('video', blob, media.name);
                    }
                }
            }

            if (params.voiceClipId) {
                 const voiceClip = state.clips.find(c => c.id === params.voiceClipId);
                 if (voiceClip) {
                     const voiceMedia = state.media[voiceClip.fileName];
                     const blob = await getFileFromDB(voiceMedia.name) || await (await fetch(voiceMedia.url)).blob();
                     formData.append('audio', blob as Blob, voiceMedia.name);
                 }
            }

            if (params) {
                Object.keys(params).forEach(key => {
                    const value = params[key];
                    if (typeof value === 'object' && value !== null) {
                        formData.append(key, JSON.stringify(value));
                    } else {
                        formData.append(key, String(value));
                    }
                });
            }

            if (isExport) {
                 const { history, historyIndex, activeAudioNodes, isPlaying, ...stateToExport } = state;
                 // Ensure duration is calculated and valid before export
                 const calculatedDuration = calculateProjectDuration(stateToExport.clips);
                 formData.append('projectState', JSON.stringify({ 
                    ...stateToExport, 
                    totalDuration: calculatedDuration,
                    exportConfig: options.exportConfig 
                 }));
                 const usedMediaNames = new Set(state.clips.map(c => c.fileName));
                 for (const mediaName of Array.from(usedMediaNames)) {
                     const mediaItem = state.media[mediaName];
                     if (mediaItem) {
                         let blob = await getFileFromDB(mediaName);
                         if (!blob && mediaItem.url) {
                             try { const res = await fetch(mediaItem.url); blob = await res.blob(); } catch(e) {}
                         }
                         if (blob) formData.append('files', blob, mediaName);
                     }
                 }
            }

            const startRes = await fetch(`${BACKEND_URL}${fullEndpoint}`, { method: 'POST', body: formData });
            if (!startRes.ok) throw new Error(await startRes.text());
            const resJson = await startRes.json();
            const jobId = resJson.jobId;

            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch(`${BACKEND_URL}${isExport ? '/api/export/status/' : '/api/process/status/'}${jobId}`);
                    const statusData = await statusRes.json();
                    
                    if (statusData.status === 'completed') {
                        clearInterval(pollInterval);
                        const blobRes = await fetch(`${BACKEND_URL}${isExport ? '/api/export/download/' : '/api/process/download/'}${jobId}`);
                        const blob = await blobRes.blob();
                        
                        if (isExport) {
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a'); a.href = url;
                            a.download = options.exportConfig?.filename ? `${options.exportConfig.filename}.${options.exportConfig.format || 'mp4'}` : `export_${Date.now()}.mp4`;
                            document.body.appendChild(a); a.click(); document.body.removeChild(a);
                            setLoadingMessage(null); addToast(`Exportação concluída!`, 'success');
                            return;
                        }

                        const newName = `processed_${Date.now()}_${friendlyName.replace(/\s/g,'_')}.${blob.type.includes('video') ? 'mp4' : (blob.type.includes('image') ? 'png' : 'wav')}`;
                        await storeFileInDB(newName, blob);
                        const newUrl = URL.createObjectURL(blob);
                        const type = blob.type.startsWith('audio') ? 'audio' : (blob.type.startsWith('video') ? 'video' : 'image');
                        const d = type === 'image' ? 5 : (type === 'audio' ? blob.size/10000 : 5); 
                        const newItem: MediaItem = { name: newName, url: newUrl, type: type as MediaType, duration: d, isUserFile: true, thumbnail: type === 'image' ? newUrl : (type === 'video' ? newUrl : RESOURCES.previewImage) };
                        
                        if (options.replace && state.selectedClipId) {
                             setState(prev => {
                                 const newMedia = { ...prev.media, [newName]: newItem };
                                 const newClips = prev.clips.map(c => c.id === prev.selectedClipId ? { ...c, fileName: name } : c);
                                 return pushHistory({ ...prev, clips: newClips, media: newMedia });
                             });
                        } else {
                             addMediaItemToState(newItem);
                        }
                        setLoadingMessage(null); addToast(`${friendlyName} concluído!`, 'success');
                    } else if (statusData.status === 'failed') {
                        clearInterval(pollInterval); setLoadingMessage(null); addToast(`Erro: ${statusData.error}`, 'error');
                    }
                } catch (e: any) { clearInterval(pollInterval); setLoadingMessage(null); }
            }, 2000);
        } catch (e: any) { setLoadingMessage(null); addToast(`Erro ao iniciar: ${e.message}`, 'error'); }
    };

    const handleGenerateSticker = async (prompt: string) => {
        setLoadingMessage("Gerando Sticker 3D (Gemini)...");
        try {
            const ai = new GoogleGenAI({ apiKey: getUserKey() });
            let contentsParts: any[] = [];
            const stickerSystemPrompt = "Create a high-quality 3D glossy die-cut sticker with a subtle white border and soft realistic shadows. The subject should be vibrant, have a stylized 3D render look (like clay or vinyl). Return the image with a strictly transparent background. High resolution.";

            if (state.selectedClipId) {
                const clip = state.clips.find(c => c.id === state.selectedClipId);
                if (clip && clip.type === 'image') {
                    const media = state.media[clip.fileName];
                    const base64 = await blobUrlToBase64(media.url);
                    contentsParts.push({ inlineData: { mimeType: media.mimeType || 'image/png', data: base64 } });
                    contentsParts.push({ text: `${stickerSystemPrompt} Based on this image, generate a 3D sticker of: ${prompt || "this subject"}. NO BACKGROUND.` });
                }
            }
            if (contentsParts.length === 0) contentsParts.push({ text: `${stickerSystemPrompt} Generate a 3D sticker of: ${prompt || "a cute colorful mascot"}. NO BACKGROUND.` });

            const response = await ai.models.generateContent({ 
                model: "gemini-2.5-flash-image", 
                contents: { parts: contentsParts } 
            });

            if (response.candidates && response.candidates[0].content.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        const blob = base64ToBlob(part.inlineData.data, part.inlineData.mimeType);
                        const name = `sticker_3d_${Date.now()}.png`;
                        await storeFileInDB(name, blob);
                        const newItem: MediaItem = { name, url: URL.createObjectURL(blob), type: 'image', duration: 5, isUserFile: true, thumbnail: URL.createObjectURL(blob), mimeType: 'image/png' };
                        const newClip: Clip = {
                            id: `sticker_clip_${Date.now()}`,
                            fileName: name,
                            type: 'image',
                            track: 'camada',
                            start: state.currentPlayheadTime,
                            duration: 5,
                            properties: { opacity: 1, volume: 1, speed: 1, transform: { x: 0, y: 0, scale: 0.5, rotation: 0 }, fit: 'contain' }
                        };
                        setState(prev => pushHistory({ ...prev, media: { ...prev.media, [name]: newItem }, clips: [...prev.clips, newClip], selectedClipId: newClip.id }));
                        addToast("Sticker 3D gerado!", 'success');
                        return;
                    }
                }
            }
        } catch(e: any) { console.error(e); addToast(`Erro ao gerar sticker: ${e.message}`, 'error'); } finally { setLoadingMessage(null); }
    };

    const onImportHandler = async (files: FileList | null) => {
        if (!files) return;
        setLoadingMessage("Importando...");
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const name = file.name;
                const type = file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : 'image';
                await storeFileInDB(name, file);
                const url = URL.createObjectURL(file);
                let duration = 5;
                if (type === 'video' || type === 'audio') {
                    const el = document.createElement(type);
                    el.src = url;
                    await new Promise(r => { el.onloadedmetadata = r; });
                    duration = el.duration || 5;
                }
                const newItem: MediaItem = { name, url, type: type as MediaType, duration, isUserFile: true, thumbnail: url };
                addMediaItemToState(newItem, state.currentPlayheadTime);
            }
            addToast("Importação concluída", 'success');
        } catch (e: any) { console.error(e); addToast(`Erro na importação: ${e.message}`, 'error'); } finally { setLoadingMessage(null); }
    };

    const handleGenerateTTS = async (text: string, voice: string, style?: string, speed?: number, pitch?: number, autoSubtitle?: boolean, subtitleTemplateId?: string) => {
        setLoadingMessage("Gerando Voz (Gemini TTS)...");
        try {
            const ai = new GoogleGenAI({ apiKey: getUserKey() });
            const voiceName = mapVoiceIdToGeminiName(voice);
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash-preview-tts",
                contents: [{ parts: [{ text: text }] }],
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } }
                }
            });
            const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (!base64Audio) throw new Error("No audio generated");
            const pcmData = base64ToUint8Array(base64Audio);
            const wavBlob = pcmToWav(pcmData, 24000);
            const name = `tts_${Date.now()}.wav`;
            await storeFileInDB(name, wavBlob);
            const url = URL.createObjectURL(wavBlob);
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const decoded = await audioCtx.decodeAudioData(await wavBlob.arrayBuffer());
            const duration = decoded.duration;
            const item: MediaItem = { name, url, type: 'audio', duration, isUserFile: true, hasAudio: true };
            addMediaItemToState(item, state.currentPlayheadTime, 'narration');
            addToast("Áudio gerado!", 'success');
        } catch (e: any) { console.error(e); addToast(`Erro TTS: ${e.message}`, 'error'); } finally { setLoadingMessage(null); }
    };

    const handleGenerateNarration = async (text: string, voice: string, targetClipId: string, style?: string, speed?: number, pitch?: number, autoSubtitle?: boolean, subtitleTemplateId?: string) => {
        await handleGenerateTTS(text, voice, style, speed, pitch, autoSubtitle, subtitleTemplateId);
    };

    const handleGenerateImage = async (prompt: string, aspectRatio: string = '1:1') => {
        setLoadingMessage("Gerando Imagem (Gemini)...");
        try {
            const ai = new GoogleGenAI({ apiKey: getUserKey() });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [{ text: prompt }] }
            });
            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    const blob = base64ToBlob(part.inlineData.data, part.inlineData.mimeType);
                    const name = `gen_img_${Date.now()}.png`;
                    await storeFileInDB(name, blob);
                    const url = URL.createObjectURL(blob);
                    const item: MediaItem = { name, url, type: 'image', duration: 5, isUserFile: true, thumbnail: url };
                    addMediaItemToState(item, state.currentPlayheadTime, 'video');
                    addToast("Imagem gerada!", 'success');
                    return;
                }
            }
        } catch (e: any) { console.error(e); addToast(`Erro Imagem: ${e.message}`, 'error'); } finally { setLoadingMessage(null); }
    };

    const handleGenerateVideo = async (prompt: string, duration: number = 5) => {
        setLoadingMessage("Gerando Vídeo (Veo)...");
        try {
            const ai = new GoogleGenAI({ apiKey: getUserKey() });
            let operation = await ai.models.generateVideos({
                model: 'veo-3.1-fast-generate-preview',
                prompt: prompt,
                config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
            });
            while (!(operation as any).done) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                operation = await ai.operations.getVideosOperation({operation: operation as any});
            }
            const opResponse = (operation as any).response;
            if (opResponse?.generatedVideos?.[0]?.video?.uri) {
                const downloadLink = opResponse.generatedVideos[0].video.uri as string;
                const videoRes = await fetch(`${downloadLink}&key=${getUserKey()}`);
                const videoBlob = await (videoRes as Response).blob();
                const name = `veo_gen_${Date.now()}.mp4`;
                await storeFileInDB(name, videoBlob);
                const url = URL.createObjectURL(videoBlob);
                const item: MediaItem = { name, url, type: 'video', duration: 5, isUserFile: true, thumbnail: url };
                addMediaItemToState(item, state.currentPlayheadTime, 'video');
                addToast("Vídeo gerado!", 'success');
            }
        } catch (e: any) { console.error(e); addToast(`Erro Veo: ${e.message}`, 'error'); } finally { setLoadingMessage(null); }
    };

    const handleAnalyzeScript = async (script: string): Promise<ScriptScene[]> => {
        const ai = new GoogleGenAI({ apiKey: getUserKey() });
        const prompt = `Analyze this script and break it down into visual scenes for a video. Return JSON array. Each item: { "narration": "text to speak", "visual": "description of visual", "estimatedDuration": number (seconds) }. Script: ${script}`;
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        try {
            const scenes = JSON.parse(response.text || '[]');
            return scenes.map((s: any, i: number) => ({
                id: `scene_${i}`, narration: s.narration, visual: s.visual, duration: s.estimatedDuration || 5
            }));
        } catch (e) { console.error(e); return []; }
    };

    const handleGenerateSceneMedia = async (scene: ScriptScene, voiceId: string, style: string, aspectRatio: string, source?: string): Promise<ScriptScene> => {
        let audioBlob = undefined; let audioUrl = undefined; let audioDuration = undefined;
        try {
            const ai = new GoogleGenAI({ apiKey: getUserKey() });
            const voiceName = mapVoiceIdToGeminiName(voiceId);
            const ttsRes = await ai.models.generateContent({
                model: "gemini-2.5-flash-preview-tts",
                contents: [{ parts: [{ text: scene.narration }] }],
                config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } }
            });
            const base64Audio = ttsRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
                const pcm = base64ToUint8Array(base64Audio);
                const wav = pcmToWav(pcm, 24000);
                audioBlob = wav; audioUrl = URL.createObjectURL(wav);
                const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const decoded = await ctx.decodeAudioData(await wav.arrayBuffer());
                audioDuration = decoded.duration;
            }
        } catch (e) { console.error("TTS failed for scene", e); }

        let imageBlob = undefined; let imageUrl = undefined;
        try {
            const ai = new GoogleGenAI({ apiKey: getUserKey() });
            const imgRes = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: [{ parts: [{ text: `${style} style. ${scene.visual}` }] }]
            });
            const part = imgRes.candidates?.[0]?.content?.parts?.[0];
            if (part?.inlineData) {
                imageBlob = base64ToBlob(part.inlineData.data, part.inlineData.mimeType);
                imageUrl = URL.createObjectURL(imageBlob);
            }
        } catch (e) { console.error("Image gen failed for scene", e); }
        return { ...scene, audioBlob, audioUrl, audioDuration: audioDuration || 5, imageBlob, imageUrl };
    };

    const handleApplyMagicEraser = async () => {
        if (!state.selectedClipId || maskPaths.length === 0) return;
        setLoadingMessage("Aplicando Magic Eraser (Gemini)...");
        try {
            const clip = state.clips.find(c => c.id === state.selectedClipId);
            if (clip && clip.type === 'image') {
                const media = state.media[clip.fileName];
                const base64 = await blobUrlToBase64(media.url);
                const ai = new GoogleGenAI({ apiKey: getUserKey() });
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash-image",
                    contents: [
                        { inlineData: { mimeType: media.mimeType || "image/png", data: base64 } },
                        { text: "Remove the highlighted object or the most prominent foreground object. Return image only." }
                    ]
                });
                for (const part of response.candidates?.[0]?.content?.parts || []) {
                    if (part.inlineData) {
                        const blob = base64ToBlob(part.inlineData.data, part.inlineData.mimeType);
                        const name = `erased_${Date.now()}.png`;
                        await storeFileInDB(name, blob);
                        const url = URL.createObjectURL(blob);
                        const newItem = { name, url, type: 'image' as MediaType, duration: clip.duration, isUserFile: true, thumbnail: url };
                        addMediaToLibraryOnly(newItem);
                        setState(prev => {
                            const newClips = prev.clips.map(c => c.id === prev.selectedClipId ? { ...c, fileName: name } : c);
                            return pushHistory({ ...prev, clips: newClips, media: { ...prev.media, [name]: newItem } });
                        });
                        addToast("Objeto removido!", 'success');
                        break;
                    }
                }
            }
        } catch (e: any) { console.error(e); addToast("Erro no Magic Eraser", 'error'); } 
        finally { setLoadingMessage(null); setMaskPaths([]); setActiveTool('cursor'); }
    };

    const handlePreviewTTS_Preview = async (text: string, voice: string, style: string, speed: number, pitch: number) => {
        const ai = new GoogleGenAI({ apiKey: getUserKey() });
        const voiceName = mapVoiceIdToGeminiName(voice);
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } }
            }
        });
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            const pcm = base64ToUint8Array(base64Audio);
            const wav = pcmToWav(pcm, 24000);
            const url = URL.createObjectURL(wav);
            const audio = new Audio(url);
            audio.play();
        }
    };

    const onAddTextHandler = (styleId: string | undefined, design: any) => {
        const newClip: Clip = {
            id: `text_${Date.now()}`, fileName: 'Text Layer', type: 'text', track: 'text', start: state.currentPlayheadTime, duration: 3, styleId: styleId, properties: { text: 'Texto', textDesign: design as any }
        };
        setState(s => ({ ...s, clips: [...s.clips, newClip] }));
    };

    const handleApplyResource = (type: 'transition' | 'effect' | 'movement', id: string, config?: any) => {
        if(state.selectedClipId) {
            setState(s => {
                const newClips = s.clips.map(c => c.id === s.selectedClipId ? { 
                    ...c, effect: type === 'effect' ? id : c.effect, transition: type === 'transition' ? { id, duration: 1 } : c.transition, properties: type === 'movement' ? { ...c.properties, movement: { type: id, config } } : c.properties
                } : c);
                return pushHistory({ ...s, clips: newClips });
            });
        }
    };

    const handleLoadProject = (projectData: any) => {
        setLoadingMessage("Carregando...");
        try {
            setState(prev => ({ ...prev, ...projectData, selectedClipId: null, history: [], historyIndex: -1 }));
            addToast("Carregado!", 'success');
        } catch (e) { addToast("Falha ao carregar.", 'error'); } finally { setLoadingMessage(null); }
    };

    const handleSaveProject = (projectName: string) => {
        let thumbnail = RESOURCES.previewImage;
        const visualClip = state.clips.sort((a,b) => a.start - b.start).find(c => ['video','image'].includes(c.track));
        if (visualClip) {
            const media = state.media[visualClip.fileName];
            if (media?.thumbnail) thumbnail = media.thumbnail;
        }
        const projectData = { id: Date.now(), name: projectName, date: new Date().toISOString(), thumbnail: thumbnail, data: state };
        try {
            const saved = JSON.parse(localStorage.getItem('saved_projects') || '[]');
            const newSaved = [projectData, ...saved].slice(0, 10);
            localStorage.setItem('saved_projects', JSON.stringify(newSaved));
            addToast("Projeto salvo no navegador!", 'success');
        } catch (e) {
            const blob = new Blob([JSON.stringify(state)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `${projectName.replace(/\s+/g, '_')}.json`; a.click();
        }
    };

    return (
        <div className="flex flex-col h-screen bg-zinc-900 text-white overflow-hidden">
            <Header onNewProject={() => window.location.reload()} onExport={(c) => handleBackendAction('/api/export/start', 'Export', {}, { exportConfig: c })} onSave={handleSaveProject} onLoad={handleLoadProject} />
            <div className="flex flex-1 overflow-hidden relative">
                <div className="w-[420px] hidden md:flex flex-col border-r border-zinc-700 bg-zinc-800">
                    <BrowserPanel 
                        mediaLibrary={state.media} clips={state.clips} selectedClipId={state.selectedClipId}
                        onImport={onImportHandler} onDragStart={(e, t, id) => { e.dataTransfer.setData('type', t); e.dataTransfer.setData('id', id); }}
                        onGenerateTTS={handleGenerateTTS} onGenerateNarration={handleGenerateNarration} onPreviewTTS={handlePreviewTTS_Preview}
                        onGenerateImage={handleGenerateImage} onGenerateVideo={handleGenerateVideo}
                        onChangeAspectRatio={(r) => setState(s => ({...s, projectAspectRatio: r}))} onChangeBackground={(c) => setState(s => ({...s, backgroundColor: c}))}
                        onSetBackgroundImage={() => {}} onRemoveBackgroundImage={() => {}} onAddText={onAddTextHandler}
                        onBackendAction={handleBackendAction} onOpenInspectorSection={setActiveInspectorSection}
                        onClearTimeline={handleClearTimeline} onSplit={handleSplit} onDelete={handleDelete} onDuplicate={handleDuplicate} onFreeze={handleFreeze}
                        onReplace={() => {}} onSceneDetectAndSplit={handleSceneDetect}
                        onUpdateClip={(id, u) => setState(s => ({ ...s, clips: s.clips.map(c => c.id === id ? { ...c, ...u } : c) }))}
                        onFetchUrl={async (url) => { const r = await fetch(`${BACKEND_URL}/api/util/fetch-url`, { method: 'POST', body: JSON.stringify({url}) }); const d = await r.json(); return d.text; }}
                        onTranscribeAudio={async () => ""} onApplyResource={handleApplyResource} onApplyToAll={handleApplyToAll}
                        onAddToTimeline={addMediaItemToState} onAnalyzeScript={handleAnalyzeScript} onGenerateSceneMedia={handleGenerateSceneMedia}
                        onAddScriptToTimeline={(scenes) => {}} onGeminiStyleTransfer={handleGeminiStyleTransfer} onSetActiveTool={setActiveTool}
                        onAutoBRoll={() => {}} onRestoreBRoll={() => {}}
                    />
                </div>
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex-1 flex bg-black relative">
                        <PreviewPanel 
                            clips={state.clips} mediaLibrary={state.media} currentTime={state.currentPlayheadTime} isPlaying={state.isPlaying}
                            totalDuration={state.totalDuration} selectedClipId={state.selectedClipId} backgroundColor={state.backgroundColor} projectAspectRatio={state.projectAspectRatio}
                            onTogglePlay={() => setState(s => ({...s, isPlaying: !s.isPlaying}))}
                            onUpdateClip={(id, u) => setState(s => ({...s, clips: s.clips.map(c => c.id === id ? {...c, ...u} : c)}))}
                            onSelectClip={(id) => setState(s => ({...s, selectedClipId: id}))}
                            activeTool={activeTool} magicEraserBrushSize={magicEraserBrushSize} maskPaths={maskPaths.map(m => m.points)}
                            onDrawMagicEraser={(p, d) => setMaskPaths(pr => [...pr, { points: p, dims: d }])}
                        />
                    </div>
                    <div className="h-[320px] bg-zinc-800 border-t border-zinc-700 hidden md:block">
                        <TimelinePanel 
                            clips={state.clips} mediaLibrary={state.media} totalDuration={state.totalDuration} currentTime={state.currentPlayheadTime}
                            pixelsPerSecond={state.pixelsPerSecond} selectedClipId={state.selectedClipId} selectedTransition={state.selectedTransition}
                            canUndo={state.historyIndex >= 0} canRedo={false}
                            onSelectClip={(id) => setState(s => ({...s, selectedClipId: id}))} onSelectTransition={(id) => setState(s => ({...s, selectedTransition: { clipId: id }}))}
                            onUpdateClip={(id, u) => setState(s => ({ ...s, clips: s.clips.map(c => c.id === id ? { ...c, ...u } : c) }))}
                            onTimeChange={(t) => setState(s => ({...s, currentPlayheadTime: t}))}
                            onDrop={(e, track, time) => { const id = e.dataTransfer.getData('id'); if (id && state.media[id]) addMediaItemToState(state.media[id], time, track); }}
                            onSplit={handleSplit} onDelete={handleDelete} onDuplicate={handleDuplicate} onUndo={handleUndo} onRedo={handleRedo}
                            onChangeZoom={(z) => setState(s => ({...s, pixelsPerSecond: z}))}
                            onMergeClip={handleMergeLayer}
                        />
                    </div>
                </div>
                <div className="w-[320px] border-l border-zinc-700 bg-zinc-800 hidden md:flex flex-col">
                    <InspectorPanel 
                        selectedClip={state.clips.find(c => c.id === state.selectedClipId) || null} selectedTransition={state.selectedTransition}
                        activeSection={activeInspectorSection} onClearActiveSection={() => setActiveInspectorSection(null)}
                        onUpdate={(u) => { if(state.selectedClipId) setState(s => ({...s, clips: s.clips.map(c => c.id === s.selectedClipId ? {...c, ...u} : c)})); }}
                        onBackendAction={handleBackendAction} onAiColorGrade={() => {}} activeTool={activeTool} onSetActiveTool={setActiveTool}
                        magicEraserBrushSize={magicEraserBrushSize} onSetMagicEraserBrushSize={setMagicEraserBrushSize} onApplyMagicEraser={handleApplyMagicEraser}
                        onClearMagicEraserMask={() => setMaskPaths([])} onGenerateMusic={(p: string, d: number) => handleBackendAction('/api/process/generate-music', 'Music', {prompt:p, duration:d}, {replace:false})}
                        onGenerateSFX={(p: string, d: number) => handleBackendAction('/api/process/generate-music', 'SFX', {prompt:p, duration:d}, {replace:false})}
                        onGenerateSticker={handleGenerateSticker} onGeminiStyleTransfer={handleGeminiStyleTransfer}
                        onImportRemoteMedia={() => {}} onDetectBackground={async () => "#00FF00"} clips={state.clips} mediaLibrary={state.media}
                        onGenerativeFill={handleGenerativeFill}
                    />
                </div>
                <MobileLayout 
                    mobileTab={mobileTab} setMobileTab={setMobileTab} state={state} setState={setState}
                    handleUpdateClip={(id, u) => setState(s => ({...s, clips: s.clips.map(c => c.id === id ? {...c, ...u} : c)}))}
                    handleSplit={handleSplit} handleDelete={handleDelete} handleDuplicate={handleDuplicate} handleUndo={handleUndo} handleRedo={handleRedo}
                    handleImport={onImportHandler} handleGenerateVideo={handleGenerateVideo} handleGenerateTTS={handleGenerateTTS} handleGenerateNarration={handleGenerateNarration}
                    handlePreviewTTS={handlePreviewTTS_Preview} handleApplyResource={handleApplyResource} handleApplyToAll={handleApplyToAll} handleBackendAction={handleBackendAction}
                    addMediaItemToState={addMediaItemToState} calculateProjectDuration={calculateProjectDuration} withHistory={withHistory}
                    activeTool={activeTool} setActiveTool={setActiveTool} magicEraserBrushSize={magicEraserBrushSize} setMagicEraserBrushSize={setMagicEraserBrushSize} applyMagicEraser={handleApplyMagicEraser} clearMagicEraserMask={() => setMaskPaths([])}
                    onGenerativeFill={handleGenerativeFill}
                />
            </div>
            <LiveAssistant onGenerateImage={handleGenerateImage} onChangeBackground={(c) => setState(s => ({...s, backgroundColor: c}))} onAddText={(t) => onAddTextHandler(undefined, {text:t})} />
            {toasts.map((t, i) => <Toast key={i} {...t} onClose={() => setToasts(p => p.filter((_, idx) => idx !== i))} />)}
            {loadingMessage && <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] backdrop-blur-sm"><div className="bg-zinc-800 p-4 rounded-lg shadow-xl flex items-center gap-3"><i className="fas fa-spinner fa-spin text-blue-500 text-xl"></i><span className="font-bold text-white">{loadingMessage}</span></div></div>}
        </div>
    );
};

export default App;
