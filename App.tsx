
import React, { useState, useEffect, useRef } from 'react';
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
    EditorState, Clip, MediaItem, ScriptScene, ScriptAnalysisResult,
    ClipProperties, TextDesignProperties, MovementConfig, VideoConfig, VideoAspectRatio, VideoResolution,
    Transition
} from './types';
import { BACKEND_URL, RESOURCES, TEXT_RESOURCES, IMAGE_STYLE_CATEGORIES } from './constants';
import { GeminiVideoService, generateMusic } from './services/geminiService';

// DB Helper functions
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

const storeFileInDB = async (name: string, blob: globalThis.Blob) => {
    const db = await getDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put(blob, name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

const getFileFromDB = async (name: string): Promise<globalThis.Blob | undefined> => {
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
    return new globalThis.Blob([byteArray], { type: mimeType });
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

const blobToBase64 = (blob: globalThis.Blob): Promise<string> => {
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

const resizeImage = (blob: Blob, maxWidth: number = 1500, maxHeight: number = 1500): Promise<Blob> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = URL.createObjectURL(blob);
        img.onload = () => {
            URL.revokeObjectURL(img.src);
            let width = img.width;
            let height = img.height;

            if (width > maxWidth || height > maxHeight) {
                if (width > height) {
                    height *= maxWidth / width;
                    width = maxWidth;
                } else {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            canvas.toBlob((resizedBlob) => {
                resolve(resizedBlob || blob);
            }, blob.type, 0.9);
        };
        img.onerror = () => resolve(blob);
    });
};

const blobUrlToBase64 = async (url: string, time: number = 0): Promise<{ data: string, mimeType: string }> => {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timeout ao extrair frame do vídeo")), 15000);
        
        try {
            const video = document.createElement('video');
            video.src = url;
            video.crossOrigin = 'anonymous';
            video.preload = 'auto';
            video.muted = true; // Essential for autoplay/loading in some browsers
            
            const cleanup = () => {
                clearTimeout(timeout);
                video.pause();
                video.src = "";
                video.load();
                video.remove();
            };

            video.onloadeddata = () => {
                video.currentTime = Math.max(0, time);
            };

            video.onseeked = async () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth || 1280;
                    canvas.height = video.videoHeight || 720;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(video, 0, 0);
                    canvas.toBlob(async (frameBlob) => {
                        if (frameBlob) {
                            try {
                                const resizedBlob = await resizeImage(frameBlob);
                                const data = await blobToBase64(resizedBlob);
                                cleanup();
                                resolve({ data, mimeType: resizedBlob.type });
                            } catch (err) {
                                const data = await blobToBase64(frameBlob);
                                cleanup();
                                resolve({ data, mimeType: frameBlob.type });
                            }
                        } else {
                            cleanup();
                            reject(new Error("Falha ao criar blob do frame"));
                        }
                    }, 'image/png');
                } catch (err) {
                    cleanup();
                    reject(err);
                }
            };

            video.onerror = (e) => {
                cleanup();
                reject(new Error("Erro ao carregar vídeo para extração: " + (video.error?.message || "Erro desconhecido")));
            };

            video.load();
        } catch (err) {
            clearTimeout(timeout);
            reject(err);
        }
    });
};

const getClipCurrentTime = (clip: any, globalTime: number) => {
    const clipProgress = globalTime - clip.start;
    return Math.max(0, clipProgress * (clip.properties.speed || 1) + (clip.mediaStartOffset || 0));
};

const extractImageData = (res: any): string | undefined => {
    for (const part of res.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData?.data) return part.inlineData.data;
    }
    return undefined;
};


const writeString = (view: DataView, offset: number, string: string): void => {
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
    return new globalThis.Blob([view], { type: 'audio/wav' });
};

const createPlaceholderImageBlob = (text: string): Promise<Blob> => {
    return new Promise(resolve => {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, 1280, 720);
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2;
            for(let i=0; i<1280; i+=100) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,720); ctx.stroke(); }
            for(let i=0; i<720; i+=100) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(1280,i); ctx.stroke(); }
            ctx.fillStyle = '#ff5555';
            ctx.font = 'bold 60px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText("Mídia não gerada", 640, 320);
            ctx.fillStyle = '#aaaaaa';
            ctx.font = 'normal 30px Inter, sans-serif';
            ctx.fillText(text.slice(0, 60) + (text.length > 60 ? "..." : ""), 640, 400);
        }
        canvas.toBlob(blob => resolve(blob!), 'image/png');
    });
};

const createSilentAudioBlob = (duration: number) => {
    const sampleRate = 24000;
    const numSamples = Math.ceil(duration * sampleRate);
    const buffer = new Uint8Array(numSamples * 2); 
    return pcmToWav(buffer, sampleRate);
};

const TTS_ACCENT_DESCRIPTIONS: Record<string, string> = {
    'none': '',
    'dragged': 'heavily drawn-out, slow and lazy articulation with long vowels',
    'rural': 'regional rural caipira accent with distinct R sounds and singing cadence',
    'northeast': 'rhythmic and sharp northeastern regional accent with a distinct lilt',
    'carioca': 'Rio de Janeiro accent with slushy S sounds and very open vowels',
    'gaúcho': 'southern frontier accent with strong syllables and a melodic gaúcho lilt',
    'mineiro': 'soft and melodic Minas Gerais accent, swallowing final syllables and using "uai"',
    'angola': 'Angolan Portuguese accent with distinct rhythm and pronunciation',
    'portugal': 'European Portuguese accent with closed vowels and a rhythmic lilt',
    'british': 'refined, posh British RP accent, non-rhotic and very polite',
    'american': 'flat and strong American accent with prominent rhotic R sounds',
    'french-acc': 'melodic French transition accent with soft R sounds and nasal vowels',
    'italian-acc': 'expressive and dramatic Italian transition accent with high energy',
    'es-es': 'Castilian Spanish accent from Spain with distinct "distincion"',
    'es-mx': 'Mexican Spanish accent with clear vowels and melodic intonation',
    'es-ar': 'Argentinian Spanish accent with "sh" sounds for "ll/y"',
    'jp-tokyo': 'Standard Japanese Tokyo dialect accent',
    'jp-kansai': 'Kansai-ben Japanese dialect with more intonation'
};

const TTS_EMOTION_DESCRIPTIONS: Record<string, string> = {
    'neutral': 'neutral and steady emotion',
    'happy': 'very happy, cheerful and bright emotion',
    'excited': 'extremely excited, energetic and enthusiastic',
    'sad': 'sad, mournful and low-energy emotion',
    'angry': 'angry, frustrated and aggressive tone',
    'scared': 'scared, trembling and fearful voice',
    'whisper': 'whispering intimately',
    'shout': 'shouting loudly',
    'deep': 'deep, resonant and profound',
    'high_pitch': 'high-pitched and cute',
    'anxious': 'anxious, nervous and fast-paced',
    'sarcastic': 'sarcastic, cynical and ironic',
    'romantic': 'romantic, sensual and loving'
};

const TTS_STYLE_DESCRIPTIONS: Record<string, string> = {
    'std': 'neutral and clear',
    'casual': 'relaxed and conversational',
    'corp': 'professional, confident and business-like',
    'soft': 'soft, gentle and calm',
    'deep-1': 'deep, resonant and authoritative',
    'deep-2': 'ultra-deep, rumbling and powerful',
    'trailer': 'epic, cinematic, movie-trailer style',
    'smooth': 'velvety, smooth and warm',
    'giant': 'slow, booming and enormous',
    'raspy': 'raspy, smoky and textured',
    'gravel': 'gravelly, rough and deep',
    'whisper': 'whispering, intimate ASMR style',
    'asmr': 'extremely soft whisper, close to the microphone',
    'child': 'youthful, innocent and high-pitched child voice',
    'old': 'elderly, wisdom-filled and slightly shaky',
    'ancient': 'very old, weary and wise old man voice',
    'news': 'professional news anchor, fast and articulate',
    'radio': 'classic FM radio host, smiling and warm',
    'doc': 'educational documentary narrator, steady and clear',
    'meditate': 'hypnotic, slow and extremely calming',
    'robot': 'robotic, monotone and metallic',
    'ai': 'synthetic yet polite and highly articulate AI',
    'scary': 'creepy, flat and unsettling',
    'anime': 'energetic, high-pitched and cute anime style',
    'happy': 'cheerful, bright and filled with joy',
    'sad': 'sad, mournful and low energy',
    'villain': 'sinister, elegant and calculated villain voice',
    'hero': 'determined, heroic and strong leader voice',
    'dramatic': 'intense, emotive and dramatic storytelling style',
    'informative': 'clear, objective and instructive technical tutorial style',
    'motivational': 'inspiring, powerful and high-energy motivational speaker style',
    'humorous': 'humorous, expressive and ironic storytelling style',
    // Sutaques e Regionalismos (Novos)
    'dragged': 'heavily drawn-out, slow and lazy articulation with long vowels',
    'rural': 'regional rural caipira accent with distinct R sounds and singing cadence',
    'northeast': 'rhythmic and sharp northeastern regional accent with a distinct lilt',
    'carioca': 'Rio de Janeiro accent with slushy S sounds and very open vowels',
    'gaúcho': 'southern frontier accent with strong syllables and a melodic gaúcho lilt',
    'british': 'refined, posh British RP accent, non-rhotic and very polite',
    'american': 'flat and strong American accent with prominent rhotic R sounds',
    'french-acc': 'melodic French transition accent with soft R sounds and nasal vowels',
    'italian-acc': 'expressive and dramatic Italian transition accent with high energy',
    'portugal': 'European Portuguese accent with closed vowels and a rhythmic lilt'
};

const TTS_NUANCE_DESCRIPTIONS: Record<string, string> = {
    'breath': 'Include deep natural breaths between sentences for organic realism.',
    'cough': 'Incorporate occasional light throat clears or small coughs at natural pauses.',
    'throat': 'Sound as if you are slightly Clearing your throat ("Ahm") before starting certain phrases.',
    'chuckle': 'Include tiny, suppressed chuckles or giggles when the tone allows.',
    'sigh': 'Add audible weary sighs or exhales of relief during quiet moments.',
    'hesitate': 'Incorporate natural "um", "uh" or slight pauses as if thinking carefully.',
    'smack': 'Add subtle lip smacking or tongue clicks common in intimate speech.',
    'mutter': 'Slightly mutter under your breath at the end of key sentences.',
    'panting': 'Speak as if you are out of breath, with audible fast breathing throughout.',
    'stutter': 'Add very light, occasional repetition of initial consonants (stuttering) for character and vulnerability.'
};

const mapVoiceIdToGeminiName = (uiId: string): { voice: string, prompt: string } => {
    if (!uiId) return { voice: 'Kore', prompt: '' };
    if (uiId.startsWith('fav_')) uiId = uiId.replace('fav_', '');
    
    // New format: lang-region:gender-styleid (e.g., pt-br:m-std)
    const [fullLang, fullStyle] = uiId.split(':');
    if (!fullLang || !fullStyle) return { voice: 'Kore', prompt: '' };

    const lang = fullLang.split('-')[0] || 'pt';
    const gender = fullStyle.split('-')[0] || 'f';
    const styleId = fullStyle.split('-').slice(1).join('-');

    let voice = 'Kore';
    
    const langNames: Record<string, string> = {
        'pt': 'Portuguese (Brazil)',
        'en': 'English (US)',
        'en-us': 'English (US)',
        'en-uk': 'English (UK)',
        'de': 'German',
        'es': 'Spanish',
        'fr': 'French',
        'it': 'Italian',
        'jp': 'Japanese',
        'ru': 'Russian'
    };

    const targetLang = langNames[fullLang] || langNames[lang] || 'Portuguese';

    if (gender === 'f') {
        const zephyrKeywords = ['soft', 'husk', 'high', 'pierce', 'child', 'teen', 'witch', 'yoga', 'asmr', 'nasal', 'ethereal', 'ghost', 'siren', 'anime', 'happy', 'hysteric', 'gossip', 'scary', 'kpop', 'elf'];
        voice = zephyrKeywords.some(k => styleId.includes(k)) ? 'Zephyr' : 'Kore';
    } else {
        const charonKeywords = ['deep-1', 'smooth', 'mid', 'old', 'radio', 'doc', 'meditate', 'ghost', 'hero', 'villain', 'lazy', 'cave', 'cowboy', 'medieval'];
        const fenrirKeywords = ['deep-2', 'trailer', 'giant', 'kratos', 'raspy', 'gravel', 'smoker', 'ancient', 'preacher', 'alien', 'demon', 'drunk', 'fat', 'noir', 'mask', 'grumpy', 'pirate'];
        
        if (charonKeywords.some(k => styleId.includes(k))) voice = 'Charon';
        else if (fenrirKeywords.some(k => styleId.includes(k))) voice = 'Fenrir';
        else voice = 'Puck';
    }

    const specificStyle = TTS_STYLE_DESCRIPTIONS[styleId] || 'standard';
    const stylePrompt = `Speak in ${targetLang}. Use a ${specificStyle} tone. `;

    return { voice, prompt: stylePrompt };
};

const getUserKey = (): string => {
    try {
        const keys = JSON.parse(localStorage.getItem('proedit_api_keys') || '{}');
        // Prefer user key if provided, otherwise use system key
        return (keys.googleApiKey as string) || (process.env.GEMINI_API_KEY as string) || (process.env.API_KEY as string) || '';
    } catch {
        return (process.env.GEMINI_API_KEY as string) || (process.env.API_KEY as string) || '';
    }
};

const getGPTKey = (): string => {
    try {
        const keys = JSON.parse(localStorage.getItem('proedit_api_keys') || '{}');
        return (keys.openAIKey as string) || '';
    } catch { return ''; }
};

const getClaudeKey = (): string => {
    try {
        const keys = JSON.parse(localStorage.getItem('proedit_api_keys') || '{}');
        return (keys.claudeKey as string) || '';
    } catch { return ''; }
};

/**
 * Helper to call Gemini with automatic fallback to user key if quota is exceeded
 * and a user key is available but wasn't used.
 */
async function callGeminiSafe<T>(
    operation: (ai: GoogleGenAI) => Promise<T>,
    onRetry?: () => void
): Promise<T> {
    const primaryKey = getUserKey();
    const ai = new GoogleGenAI({ apiKey: primaryKey });
    
    try {
        return await operation(ai);
    } catch (error: any) {
        const errorMessage = error?.message || String(error);
        const isQuotaError = errorMessage.toLowerCase().includes('quota') || 
                            errorMessage.toLowerCase().includes('429') ||
                            errorMessage.toLowerCase().includes('limit');
        
        // If it's a quota error and we were using the system key, try the user key if available
        if (isQuotaError) {
            const keys = JSON.parse(localStorage.getItem('proedit_api_keys') || '{}');
            const userKey = keys.googleApiKey;
            
            if (userKey && userKey !== primaryKey) {
                console.warn("[Gemini Fallback] Quota exceeded on system key, trying user key...");
                onRetry?.();
                const userAi = new GoogleGenAI({ apiKey: userKey });
                return await operation(userAi);
            }
        }
        throw error;
    }
}

const getPexelsKey = (): string => {
    try {
        const keys = JSON.parse(localStorage.getItem('proedit_api_keys') || '{}');
        return (keys.pexelsKey as string) || '';
    } catch {
        return '';
    }
};

const getPixabayKey = (): string => {
    try {
        const keys = JSON.parse(localStorage.getItem('proedit_api_keys') || '{}');
        return (keys.pixabayKey as string) || '';
    } catch {
        return '';
    }
};

const getUnsplashKey = (): string => {
    try {
        const keys = JSON.parse(localStorage.getItem('proedit_api_keys') || '{}');
        return (keys.unsplashKey as string) || '';
    } catch {
        return '';
    }
};

const searchPexelsImages = async (query: string): Promise<string | null> => {
    const apiKey = getPexelsKey();
    if (!apiKey) return null;
    try {
        const endpoint = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3`;
        const res = await fetch(endpoint, { headers: { Authorization: apiKey } });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.photos && data.photos.length > 0) {
            return data.photos[0].src.large2x || data.photos[0].src.large;
        }
    } catch (e) {
        console.error("Pexels Image Search Error:", e);
    }
    return null;
};

const searchUnsplashImages = async (query: string): Promise<string | null> => {
    const apiKey = getUnsplashKey();
    if (!apiKey) return null;
    try {
        const endpoint = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=3&client_id=${apiKey}`;
        const res = await fetch(endpoint);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.results && data.results.length > 0) {
            return data.results[0].urls.regular;
        }
    } catch (e) {
        console.error("Unsplash Search Error:", e);
    }
    return null;
};

const searchFreesoundMedia = async (query: string): Promise<string | null> => {
    try {
        const keys = JSON.parse(localStorage.getItem('proedit_api_keys') || '{}');
        const apiKey = keys.freesoundKey || '';
        const res = await fetch(`${BACKEND_URL}/api/proxy/freesound?q=${encodeURIComponent(query)}&token=${apiKey}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.results && data.results.length > 0) {
            // Get a random result from the top 5
            const randomIdx = Math.floor(Math.random() * Math.min(data.results.length, 5));
            const sound = data.results[randomIdx];
            // The proxy should ideally return the preview URL if we requested it, 
            // but if not, we might need to assume the structure.
            // Based on common Freesound API usage, previews are in 'previews' object.
            return sound.previews?.['preview-hq-mp3'] || sound.previews?.['preview-lq-mp3'] || null;
        }
    } catch (e) {
        console.error("Freesound Search Error:", e);
    }
    return null;
};

const searchPixabayMedia = async (query: string, type: 'video' | 'image' | 'music' = 'video'): Promise<string | null> => {
    const apiKey = getPixabayKey();
    if (!apiKey) return null;
    try {
        let endpoint = "";
        if (type === 'video') {
            endpoint = `https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=3`;
        } else if (type === 'image') {
            endpoint = `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=3&image_type=photo`;
        } else if (type === 'music') {
            endpoint = `https://pixabay.com/api/music/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=3`;
        }
        
        const res = await fetch(endpoint);
        if (!res.ok) return null;
        const data = await res.json();
        if (type === 'video' && data.hits && data.hits.length > 0) {
            const video = data.hits[0];
            return video.videos.medium.url || video.videos.small.url;
        } else if (type === 'image' && data.hits && data.hits.length > 0) {
            return data.hits[0].largeImageURL;
        } else if (type === 'music' && data.hits && data.hits.length > 0) {
            // Pixabay music hits have a 'download' field or similar? 
            // Actually they have 'audio' or 'url'. Let's check.
            // Based on Pixabay API docs, it's 'audio' or 'url'.
            return data.hits[0].audio || data.hits[0].url;
        }
    } catch (e) {
        console.error("Pixabay Search Error:", e);
    }
    return null;
};

const searchPexelsVideos = async (query: string, orientation: 'landscape' | 'portrait' = 'landscape'): Promise<string | null> => {
    const apiKey = getPexelsKey();
    if (!apiKey) return null;
    
    try {
        const endpoint = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=5&orientation=${orientation}`;
        const res = await fetch(endpoint, { headers: { Authorization: apiKey } });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.videos && data.videos.length > 0) {
            // Return the best quality video file URL
            const video = data.videos[0];
            const file = video.video_files.find((f: any) => f.quality === 'hd' || f.quality === 'sd') || video.video_files[0];
            return file.link;
        }
    } catch (e) {
        console.error("Pexels Search Error:", e);
    }
    return null;
};

const getMediaMetadata = async (url: string, type: 'video' | 'audio'): Promise<{ duration: number, hasAudio: boolean }> => {
    return new Promise((resolve) => {
        const el = document.createElement(type);
        el.preload = 'metadata'; 
        el.src = url;
        
        const timeout = setTimeout(() => {
            resolve({ duration: 5, hasAudio: type === 'audio' });
        }, 1500);

        el.onloadedmetadata = () => {
            clearTimeout(timeout);
            let hasAudio = type === 'audio';
            if (type === 'video') {
                const videoEl = el as any;
                hasAudio = (videoEl.audioTracks && videoEl.audioTracks.length > 0) || 
                           videoEl.mozHasAudio || 
                           videoEl.webkitHasAudio ||
                           true; 
            }
            const duration = (!Number.isFinite(el.duration) || el.duration <= 0) ? 5 : el.duration;
            resolve({ duration, hasAudio });
        };
        
        el.onerror = () => {
            clearTimeout(timeout);
            resolve({ duration: 5, hasAudio: false });
        };
    });
};

const calculateProjectDuration = (clips: Clip[]) => {
    if (clips.length === 0) return 30;
    const endTimes = clips.map(c => c.start + c.duration);
    const contentDuration = Math.max(...endTimes);
    return Math.max(contentDuration, 1);
};

const getVideoThumbnail = (file: File): Promise<string> => { 
    return new Promise((resolve) => { 
        if (file.size > 200 * 1024 * 1024) { 
            return resolve(''); 
        }

        const video = document.createElement('video'); 
        const url = URL.createObjectURL(file); 
        video.src = url; 
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        
        const timeout = setTimeout(() => {
            URL.revokeObjectURL(url);
            resolve('');
        }, 2000);

        video.onloadedmetadata = () => { 
            video.currentTime = Math.min(1, video.duration / 2); 
        }; 
        
        video.onseeked = () => { 
            clearTimeout(timeout);
            try {
                const canvas = document.createElement('canvas'); 
                canvas.width = 160; 
                canvas.height = 160 / (video.videoWidth / video.videoHeight); 
                const ctx = canvas.getContext('2d'); 
                if (ctx) { 
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height); 
                    resolve(canvas.toDataURL('image/jpeg', 0.5)); 
                } else resolve(''); 
            } catch(e) {
                resolve('');
            } finally {
                URL.revokeObjectURL(url); 
            }
        }; 
        
        video.onerror = () => { 
            clearTimeout(timeout);
            URL.revokeObjectURL(url); 
            resolve(''); 
        }; 
    }); 
};

const App: React.FC = () => {
    const [state, setState] = useState<EditorState>({
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
    });

    const [activeInspectorSection, setActiveInspectorSection] = useState<string | null>(null);
    const [loadingState, setLoadingState] = useState<{ message: string; progress: number | null } | null>(null);
    const [generationStatus, setGenerationStatus] = useState({ isGenerating: false, statusMessage: "" });
    const [toasts, setToasts] = useState<ToastProps[]>([]);
    const [mobileTab, setMobileTab] = useState<'timeline' | 'browser' | 'inspector'>('timeline');
    const [activeTool, setActiveTool] = useState<'cursor' | 'magic-eraser'>('cursor');
    const [magicSyncLoading, setMagicSyncLoading] = useState(false);
    const [magicEraserBrushSize, setMagicEraserBrushSize] = useState(20);
    const [maskPaths, setMaskPaths] = useState<{points: {x: number, y: number}[], dims: {width: number, height: number}}[]>([]);
    const [ttsPreviewLoading, setTtsPreviewLoading] = useState(false);
    
    // New State for track-specific import
    const trackInputRef = useRef<HTMLInputElement>(null);
    const [importTargetTrack, setImportTargetTrack] = useState<string | null>(null);

    const addToast = (message: string, type: 'success' | 'error' | 'info') => {
        setToasts(prev => [...prev, { message, type, onClose: () => {} }]);
    };

    const pushHistory = (newState: EditorState, baseState: EditorState = state) => {
        const { history, historyIndex } = baseState;
        const historyEntry = {
            media: baseState.media,
            clips: baseState.clips,
            totalDuration: baseState.totalDuration,
            projectAspectRatio: baseState.projectAspectRatio,
            backgroundColor: baseState.backgroundColor,
            selectedClipId: baseState.selectedClipId,
            selectedTransition: baseState.selectedTransition,
            pixelsPerSecond: baseState.pixelsPerSecond,
            currentPlayheadTime: baseState.currentPlayheadTime
        };
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(historyEntry);
        if (newHistory.length > 20) newHistory.shift();
        return { ...newState, history: newHistory, historyIndex: newHistory.length - 1 };
    };

    const withHistory = (prev: EditorState, updates: Partial<EditorState>) => pushHistory({ ...prev, ...updates }, prev);

    const handleUndo = () => { if (state.historyIndex > 0) { const newIndex = state.historyIndex - 1; const prevState = state.history[newIndex]; setState(s => ({ ...s, ...prevState, historyIndex: newIndex, isPlaying: false })); addToast("Desfeito", 'info'); } };
    const handleRedo = () => { if (state.historyIndex < state.history.length - 1) { const newIndex = state.historyIndex + 1; const nextState = state.history[newIndex]; setState(s => ({ ...s, ...nextState, historyIndex: newIndex, isPlaying: false })); addToast("Refeito", 'info'); } };
    const handleUnifyImages = (track: string) => { 
        const imageClips = state.clips.filter(c => c.track === track && c.type === 'image').sort((a, b) => a.start - b.start); 
        if (imageClips.length < 2) return addToast("Pelo menos 2 clipes de imagem necessários.", "info"); 
        const minStart = Math.min(...imageClips.map(c => c.start)); 
        const maxEnd = Math.max(...imageClips.map(c => c.start + c.duration)); 
        const unifiedClip: Clip = { 
            id: `unified_img_${Date.now()}`, 
            fileName: imageClips[0].fileName, 
            type: 'image', 
            track: track as any, 
            start: minStart, 
            duration: maxEnd - minStart, 
            properties: { ...imageClips[0].properties }, 
            children: imageClips.map(c => ({ ...c, start: c.start - minStart })) 
        }; 
        setState(prev => pushHistory({ ...prev, clips: [ ...prev.clips.filter(c => !(c.track === track && c.type === 'image')), unifiedClip ] }, prev)); 
        addToast(`${imageClips.length} imagens unificadas!`, "success"); 
    };
    const handleUnifyAudio = (track: string) => { 
        const audioClips = state.clips.filter(c => c.track === track && (c.type === 'audio' || c.type === 'video')).sort((a, b) => a.start - b.start); 
        if (audioClips.length < 2) return addToast("Pelo menos 2 clipes de áudio necessários.", "info"); 
        const minStart = Math.min(...audioClips.map(c => c.start)); 
        const maxEnd = Math.max(...audioClips.map(c => c.start + c.duration)); 
        const unifiedClip: Clip = { 
            id: `unified_track_${track}_${Date.now()}`, 
            fileName: audioClips[0].fileName, 
            type: 'audio', 
            track: track as any, 
            start: minStart, 
            duration: maxEnd - minStart, 
            properties: { ...audioClips[0].properties }, 
            children: audioClips.map(c => ({ ...c, start: c.start - minStart })) 
        }; 
        setState(prev => pushHistory({ ...prev, clips: [ ...prev.clips.filter(c => c.track !== track), unifiedClip ] }, prev)); 
        addToast(`${audioClips.length} arquivos de áudio unificados!`, "success"); 
        
        // Auto download sonora
        setTimeout(() => handleDownloadUnifiedClip(unifiedClip), 500);
    };

    const handleDownloadUnifiedClip = async (clip: Clip) => {
        if (!clip.children || clip.children.length === 0) return;
        setLoadingState({ message: "Preparando Mixagem Sonora para Download...", progress: 0 });
        try {
            const formData = new FormData();
            const clipsMetadata = clip.children.map(c => ({
                id: c.id,
                fileName: c.fileName,
                start: c.start, // Relative start within the unified clip
                duration: c.duration,
                mediaStartOffset: c.mediaStartOffset || 0,
                volume: c.properties?.volume !== undefined ? c.properties.volume : 1
            }));

            formData.append('clips', JSON.stringify(clipsMetadata));

            // Fetch all blobs
            for (let i = 0; i < clip.children.length; i++) {
                const child = clip.children[i];
                const media = state.media[child.fileName];
                if (!media) continue;

                setLoadingState(p => ({ ...p!, message: `Coletando arquivos (${i+1}/${clip.children!.length})...` }));
                
                let blob = await getFileFromDB(media.name);
                if (!blob) {
                    try {
                        const res = await fetch(media.url);
                        if (res.ok) blob = await res.blob();
                    } catch (e) {
                        console.warn(`Failed to fetch ${media.name}`, e);
                    }
                }

                if (blob) {
                    formData.append('files', blob, media.name);
                }
            }
            
            const friendlyName = 'Mixagem Sonora Final';
            const endpoint = 'audio-merge-real';

            const startRes = await fetch(`${BACKEND_URL}/api/process/start/${endpoint}`, { method: 'POST', body: formData }); 
            if (!startRes.ok) throw new Error(await startRes.text()); 
            const { jobId } = await startRes.json(); 
            
            const poll = setInterval(async () => { 
                const statusRes = await fetch(`${BACKEND_URL}/api/process/status/${jobId}`); 
                const status = await statusRes.json() as any; 
                if (status.progress !== undefined) setLoadingState(p => ({ ...p!, progress: status.progress })); 
                if (status.status === 'completed') { 
                    clearInterval(poll); 
                    const blobRes = await fetch(`${BACKEND_URL}${status.downloadUrl}`);
                    const blob = await blobRes.blob(); 
                    
                    if (blob.size < 100) {
                        setLoadingState(null);
                        addToast("Erro: Arquivo gerado vazio.", 'error');
                        return;
                    }

                    // Trigger browser download
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `sonora_mix_${Date.now()}.wav`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    
                    // Also add to library
                    const newName = `sonora_${Date.now()}.wav`;
                    await storeFileInDB(newName, blob);
                    addMediaItemToState({
                        name: newName,
                        url,
                        type: 'audio',
                        duration: clip.duration,
                        isUserFile: true,
                        hasAudio: true,
                        thumbnail: ''
                    }, state.currentPlayheadTime, 'audio');

                    setLoadingState(null);
                    addToast("Sonora concluída e baixada!", 'success');
                } else if (status.status === 'failed') { 
                    clearInterval(poll); 
                    setLoadingState(null); 
                    addToast(`Erro na Mixagem: ${status.error}`, 'error'); 
                } 
            }, 2000);
        } catch (e: any) {
            setLoadingState(null);
            addToast("Erro ao processar mixagem: " + e.message, 'error');
        }
    };
    const handleSaveProject = (name: string) => { try { const projectData = { name, date: new Date().toISOString(), data: state }; const blob = new Blob([JSON.stringify(projectData)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${name.replace(/\s/g, '_')}_project.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); const saved = JSON.parse(localStorage.getItem('saved_projects') || '[]'); saved.push({ ...projectData, id: Date.now() }); localStorage.setItem('saved_projects', JSON.stringify(saved)); addToast("Projeto salvo com sucesso!", 'success'); } catch (e) { addToast("Erro ao salvar projeto.", 'error'); } };
    const handleLoadProjectData = (projectData: any) => { if (projectData) { setState(s => ({ ...s, ...projectData, isPlaying: false })); addToast("Projeto carregado!", 'success'); } else { addToast("Erro: Dados do projeto inválidos.", 'error'); } };
    const handleNewProject = () => { setState({ media: {}, clips: [], selectedClipId: null, selectedTransition: { clipId: null }, currentPlayheadTime: 0, isPlaying: false, pixelsPerSecond: 20, totalDuration: 30, projectAspectRatio: '16:9', activeAudioNodes: {}, backgroundColor: '#000000', history: [], historyIndex: -1 }); addToast("Novo projeto criado!", 'success'); };

    useEffect(() => {
        fetch(`${BACKEND_URL}/api/health`)
            .then(r => r.ok && console.log("Backend OK"))
            .catch(e => console.error("Backend ERR", e));
    }, []);
    const handleDelete = () => { if(state.selectedClipId) { setState(s => pushHistory({...s, clips: s.clips.filter(c => c.id !== s.selectedClipId), selectedClipId: null}, s)); addToast("Clipe deletado", 'info'); } };
    const handleClearTimeline = () => { if (confirm("Limpar toda a timeline?")) { setState(s => pushHistory({ ...s, clips: [], selectedClipId: null }, s)); addToast("Timeline limpa", 'info'); } };

    // --- GLOBAL DELETE SHORTCUT ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const activeTag = document.activeElement?.tagName;
                if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

                if (state.selectedClipId) {
                    handleDelete();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [state.selectedClipId]);

    const handleApplyResource = (type: 'transition' | 'effect' | 'movement', id: string, config?: any) => { if(state.selectedClipId) { setState(s => { const updatedClips = s.clips.map(c => c.id === s.selectedClipId ? { ...c, effect: type === 'effect' ? id : c.effect, transition: type === 'transition' ? { id, duration: 1 } : c.transition, properties: type === 'movement' ? { ...c.properties, movement: config as MovementConfig } : c.properties } : c); return pushHistory({ ...s, clips: updatedClips }); }); addToast(`Aplicado ${type}`, 'success'); } };
    
    // UPDATED: Handle Apply to All with Track Logic
    const handleApplyToAll = (type: 'transition' | 'effect' | 'movement', id: string) => { 
        setState(s => { 
            const selectedClip = s.clips.find(c => c.id === s.selectedClipId);
            const targetTrack = selectedClip ? selectedClip.track : null;
            
            const newClips = s.clips.map(c => { 
                const isVisual = ['video', 'image', 'text', 'camada', 'camada2', 'camada3', 'subtitle'].includes(c.track) || c.type === 'video' || c.type === 'image' || c.type === 'text';
                if (!isVisual) return c;

                if (targetTrack && c.track !== targetTrack) {
                    return c;
                }

                if (type === 'transition') return { ...c, transition: { id, duration: 1 } }; 
                if (type === 'effect') return { ...c, effect: id }; 
                if (type === 'movement') return { ...c, properties: { ...c.properties, movement: { type: id, config: {} } as MovementConfig } }; 
                
                return c; 
            }); 
            return pushHistory({ ...s, clips: newClips }); 
        }); 
        
        const trackName = state.selectedClipId ? state.clips.find(c => c.id === state.selectedClipId)?.track : 'todos';
        addToast(`Aplicado ${type} à trilha ${trackName || 'inteira'}`, 'success'); 
    };

    const handleGenerateSubtitles = async (scope: 'single' | 'all' | 'update_style', templateId?: string) => {
        if (scope === 'update_style') {
            const selectedTemplate = TEXT_RESOURCES.templates.find((t: any) => t.id === templateId);
            const templateStyleId = selectedTemplate?.styleId || 'Montserrat';
            const templateDesign = selectedTemplate?.design || {};

            setState(prev => {
                const updatedClips = prev.clips.map(c => {
                    if (c.track === 'subtitle' || c.track === 'text') {
                         return { 
                            ...c, 
                            styleId: templateId,
                            properties: {
                                ...c.properties,
                                textDesign: {
                                    ...c.properties.textDesign,
                                    ...templateDesign,
                                    fontFamily: templateStyleId
                                }
                            }
                        }; 
                    }
                    return c;
                });
                return pushHistory({ ...prev, clips: updatedClips });
            });
            addToast("Estilo de legenda atualizado!", "success");
            return;
        }

        const audioClips = state.clips.filter(c => ['audio', 'narration', 'video'].includes(c.track) || (c.track === 'video' && state.media[c.fileName]?.hasAudio));
        
        if (audioClips.length === 0) {
            addToast("Nenhum áudio encontrado para legendar.", "info");
            return;
        }

        setLoadingState({ message: "Transcrevendo com Gemini AI...", progress: null });

        try {
            const ai = new GoogleGenAI({ apiKey: getUserKey() });
            const newSubtitleClips: Clip[] = [];
            
            // Look up the template design if the user selected one
            const selectedTemplate = TEXT_RESOURCES.templates.find((t: any) => t.id === templateId);
            const templateStyleId = selectedTemplate?.styleId || 'Montserrat';
            const templateDesign = selectedTemplate?.design || {
                color: '#ffffff',
                stroke: { width: 3, color: '#000000' },
                shadow: { x: 1, y: 1, blur: 2, color: 'rgba(0,0,0,0.8)' }
            };
            
            const targets = scope === 'single' && state.selectedClipId 
                ? audioClips.filter(c => c.id === state.selectedClipId)
                : audioClips;

            for (const clip of targets) {
                const media = state.media[clip.fileName];
                if (!media) continue;

                let blob = await getFileFromDB(media.name) || await (await fetch(media.url)).blob();
                const base64 = await blobToBase64(blob);

                const isDynamic = templateId?.includes('hormozi') || templateId?.includes('dyn') || templateId?.includes('karaoke');
                const prompt = isDynamic 
                    ? "Transcreva o áudio estritamente em Português do Brasil. Adapte para um estilo viral de alto engajamento. Gere legendas curtas (1 a 3 palavras por entrada). Para cada entrada, forneça: 'start' (float), 'end' (float), 'text' (string) INCLUINDO 1 emoji relevante baseado na emoção, e 'color' (hex string). Cores: amarelo (#FFD700) para ênfase, verde (#00FF00) para dinheiro/sucesso, vermelho (#FF0000) para urgente/negativo, branco (#FFFFFF) para o resto. Use MAIÚSCULAS em momentos de energia. Produza APENAS um array JSON válido."
                    : "Transcreva o áudio estritamente em Português do Brasil. Produza APENAS um array JSON válido com as chaves: 'start' (float segundos), 'end' (float segundos), 'text' (string). Exemplo: [{\"start\": 0.5, \"end\": 2.0, \"text\": \"Olá mundo\"}]. Não inclua formatação markdown ou qualquer outro texto explicativo.";

                const result = await ai.models.generateContent({
                    model: "gemini-3-flash-preview", 
                    contents: [{
                        parts: [
                            { inlineData: { mimeType: media.type === 'video' ? 'video/mp4' : 'audio/mp3', data: base64 } }, 
                            { text: prompt }
                        ]
                    }]
                });

                const text = result.text || "";
                // Robust JSON extraction
                const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
                const jsonStr = jsonMatch ? jsonMatch[0] : text.replace(/```json/g, '').replace(/```/g, '').trim();
                
                let segments: {start: number, end: number, text: string, color?: string}[] = [];
                try {
                    segments = JSON.parse(jsonStr);
                } catch (e) {
                    console.warn("Failed to parse JSON, attempting manual cleanup", text);
                    // Minimal fallback parsing could go here if needed
                }

                if (Array.isArray(segments)) {
                    segments.forEach((seg, idx) => {
                        const mediaStart = clip.mediaStartOffset || 0;
                        const mediaEnd = mediaStart + clip.duration;

                        if (seg.end > mediaStart && seg.start < mediaEnd) {
                            let timelineStart = clip.start + (seg.start - mediaStart);
                            let dur = seg.end - seg.start;

                            if (timelineStart < clip.start) {
                                dur -= (clip.start - timelineStart);
                                timelineStart = clip.start;
                            }
                            
                            newSubtitleClips.push({
                                id: `sub_${Date.now()}_${idx}_${Math.random()}`,
                                fileName: 'Text Layer',
                                type: 'text',
                                track: 'subtitle',
                                start: timelineStart,
                                styleId: templateId,
                                duration: Math.max(0.5, dur),
                                properties: {
                                    text: seg.text,
                                    opacity: 1,
                                    volume: 0,
                                    transform: { x: 0, y: 180, scale: 0.85, rotation: 0 }, 
                                    textDesign: {
                                        ...templateDesign,
                                        fontFamily: templateStyleId,
                                        color: seg.color || templateDesign.color || '#ffffff',
                                        shadow: templateDesign.shadow || { x: 2, y: 2, blur: 4, color: 'rgba(0,0,0,0.8)' }
                                    }
                                }
                            });
                        }
                    });
                }
            }

            if (newSubtitleClips.length > 0) {
                setState(prev => {
                    const cleanedClips = scope === 'all' 
                        ? prev.clips.filter(c => c.track !== 'subtitle' && c.track !== 'text') 
                        : prev.clips.filter(c => c.track !== 'subtitle');

                    const nextState = pushHistory({
                        ...prev,
                        clips: [...cleanedClips, ...newSubtitleClips],
                        selectedClipId: newSubtitleClips[0].id 
                    });
                    return nextState;
                });
                
                setActiveInspectorSection('subtitle_settings');
                setMobileTab('inspector');
                
                addToast(`${newSubtitleClips.length} legendas geradas em Português!`, "success");
            } else {
                addToast("Nenhuma fala detectada.", "info");
            }

        } catch (e: any) {
            console.error(e);
            addToast("Erro na transcrição: " + e.message, "error");
        } finally {
            setLoadingState(null);
        }
    };

    const handleExtractAudio = async (clipId: string) => { const clip = state.clips.find(c => c.id === clipId); if (!clip || clip.type !== 'video') return addToast("Selecione um vídeo.", 'error'); setLoadingState({ message: "Extraindo áudio...", progress: null }); try { const media = state.media[clip.fileName]; let fileBlob = await getFileFromDB(media.name) || await (await fetch(media.url)).blob(); const formData = new FormData(); formData.append('files', fileBlob, media.name); const startRes = await fetch(`${BACKEND_URL}/api/process/start/extract-audio`, { method: 'POST', body: formData }); if (!startRes.ok) throw new Error("Falha ao iniciar extração"); const { jobId } = await startRes.json(); const poll = setInterval(async () => { const statusRes = await fetch(`${BACKEND_URL}/api/process/status/${jobId}`); const status = await statusRes.json() as any; if (status.progress !== undefined) setLoadingState(p => ({ ...p!, progress: status.progress })); if (status.status === 'completed') { clearInterval(poll); const dlRes = await fetch(`${BACKEND_URL}${status.downloadUrl}`); const audioBlob = await dlRes.blob(); const newName = `audio_${Date.now()}.mp3`; await storeFileInDB(newName, audioBlob); const audioUrl = URL.createObjectURL(audioBlob); const audioItem: MediaItem = { name: newName, url: audioUrl, type: 'audio', duration: media.duration || clip.duration, isUserFile: true, hasAudio: true }; setState(prev => { const audioClip: Clip = { id: `audio_ext_${Date.now()}`, fileName: newName, type: 'audio', track: 'audio', start: clip.start, duration: clip.duration, mediaStartOffset: clip.mediaStartOffset || 0, properties: { volume: 1, speed: clip.properties.speed || 1 } }; const updatedClips = prev.clips.map(c => c.id === clip.id ? { ...c, properties: { ...c.properties, volume: 0 } } : c); return pushHistory({ ...prev, media: { ...prev.media, [newName]: audioItem }, clips: [...updatedClips, audioClip] }); }); setLoadingState(null); addToast("Áudio extraído com sucesso!", 'success'); } else if (status.status === 'failed') { clearInterval(poll); setLoadingState(null); addToast("Falha na extração de áudio.", 'error'); } }, 2000); } catch (e: any) { setLoadingState(null); addToast(`Erro: ${e.message}`, 'error'); } };
    const handleDownloadClip = async (clipId: string) => { 
        const clip = state.clips.find(c => c.id === clipId); 
        if (!clip) return; 
        const media = state.media[clip.fileName]; 
        if (!media) return; 
        try { 
            let blob = await getFileFromDB(media.name);
            if (!blob) {
                const response = await fetch(media.url); 
                blob = await response.blob(); 
            }
            const url = window.URL.createObjectURL(blob); 
            const a = document.createElement('a'); 
            a.href = url; 
            // Ensure correct extension
            let fileName = media.name;
            if (!fileName.includes('.')) {
                const ext = media.type === 'audio' ? 'wav' : (media.type === 'video' ? 'mp4' : 'png');
                fileName += `.${ext}`;
            }
            a.download = fileName; 
            document.body.appendChild(a); 
            a.click(); 
            window.URL.revokeObjectURL(url); 
            document.body.removeChild(a); 
            addToast("Download iniciado!", "success"); 
        } catch (e) { 
            addToast("Erro ao baixar arquivo.", "error"); 
            console.error(e);
        } 
    };
    const handleDuplicate = () => { 
        if (!state.selectedClipId) return; 
        const clip = state.clips.find(c => c.id === state.selectedClipId); 
        if (!clip) return; 
        const newClip = { ...clip, id: `clip_${Date.now()}_copy`, start: clip.start + clip.duration }; 
        setState(s => pushHistory({ ...s, clips: [...s.clips, newClip] }, s)); 
        addToast("Clipe Duplicado", 'success'); 
    };
    const addMediaToLibrary = (items: MediaItem[]) => { setState(s => { const newMedia = { ...s.media }; items.forEach(item => { newMedia[item.name] = item; }); return { ...s, media: newMedia }; }); };
    const addMediaItemToState = (item: MediaItem, time?: number, track?: string, customProps?: Partial<ClipProperties>) => { 
        setState(s => { 
            const newClip: Clip = { 
                id: `clip_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, 
                fileName: item.name, 
                type: item.type, 
                track: (track as any) || (item.type === 'audio' ? 'audio' : 'video'), 
                start: time !== undefined ? time : 0, 
                duration: item.duration || 5, 
                properties: { 
                    opacity: 1, 
                    volume: 1, 
                    speed: 1, 
                    transform: { x:0, y:0, scale:1, rotation:0 },
                    ...customProps
                } 
            }; 
            let startTime = time; 
            if (startTime === undefined) { 
                const trackClips = s.clips.filter(c => c.track === newClip.track); 
                const lastClipEnd = trackClips.length > 0 ? Math.max(...trackClips.map(c => c.start + c.duration)) : 0; 
                startTime = lastClipEnd; 
            } 
            newClip.start = startTime; 
            const newPlayheadTime = newClip.start + newClip.duration;
            
            // Ensure media is in library
            const updatedMedia = { ...s.media, [item.name]: item };
            
            return pushHistory({ ...s, clips: [...s.clips, newClip], media: updatedMedia, currentPlayheadTime: newPlayheadTime }, s); 
        }); 
    };
    const handleProcessAiMorph = async (clipId: string) => {
        const clip = state.clips.find(c => c.id === clipId);
        if (!clip || !clip.transition || clip.transition.id !== 'ai-morph') return;

        // Find the previous clip on the same track
        const trackClips = state.clips.filter(c => c.track === clip.track).sort((a, b) => a.start - b.start);
        const clipIndex = trackClips.findIndex(c => c.id === clipId);
        
        if (clipIndex <= 0) {
            addToast("É necessário um clipe anterior na mesma trilha para o Morphing.", 'error');
            return;
        }

        const prevClip = trackClips[clipIndex - 1];
        const prevMedia = state.media[prevClip.fileName];
        const currentMedia = state.media[clip.fileName];

        if (!prevMedia || !currentMedia) {
            addToast("Mídia não encontrada para processar o morphing.", 'error');
            return;
        }

        const updateClipTransition = (id: string, transUpdates: Partial<Transition>) => {
            setState(s => pushHistory({
                ...s,
                clips: s.clips.map(c => c.id === id ? { ...c, transition: { ...c.transition!, ...transUpdates } } : c)
            }, s));
        };

        try {
            // Check if we have a key or should ask for one proactively
            const userKey = getUserKey();
            const hasSelectedKey = window.aistudio && await window.aistudio.hasSelectedApiKey();
            
            if (window.aistudio && !userKey && !hasSelectedKey) {
                const preConfirm = window.confirm("A geração de transições transformadas (Morphing) requer uma chave de API Google própria. Deseja selecionar sua chave agora?");
                if (preConfirm) {
                    await window.aistudio.openSelectKey();
                    addToast("Chave configurada! Tente gerar novamente.", "info");
                    return;
                }
            }

            updateClipTransition(clipId, { isGenerating: true });
            addToast("Extraindo frames e preparando Morphing Engine...", 'info');

            // Extract last frame of previous clip
            const prevEndTime = (prevClip.mediaStartOffset || 0) + prevClip.duration;
            const startFrame = await blobUrlToBase64(prevMedia.url, prevEndTime);

            // Extract first frame of current clip
            const currentStartTime = clip.mediaStartOffset || 0;
            const endFrame = await blobUrlToBase64(currentMedia.url, currentStartTime);

            if (!startFrame.data || !endFrame.data) {
                throw new Error("Falha ao extrair frames dos clipes.");
            }

            const videoUrl = await GeminiVideoService.generateMorphTransition({
                startImage: startFrame.data,
                endImage: endFrame.data,
                apiKey: userKey,
                onProgress: (msg) => addToast(msg, 'info')
            });

            updateClipTransition(clipId, { 
                isGenerating: false, 
                videoUrl 
            });

            addToast("Morphing AI gerado com sucesso!", 'success');
        } catch (error: any) {
            console.error("Error generating morph transition:", error);
            updateClipTransition(clipId, { isGenerating: false });
            
            const errorStr = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
            const isPermissionError = errorStr.includes('403') || 
                                     errorStr.toLowerCase().includes('permission') || 
                                     errorStr.includes('PERMISSION_DENIED');
            
            if (isPermissionError && window.aistudio) {
                addToast("Erro de Permissão (403): Sua chave de API atual não possui acesso aos modelos de vídeo da Veo.", 'error');
                
                const confirmKey = window.confirm("CHAVE DE API NECESSÁRIA\n\nA geração de vídeo AIA (Morphing) requer uma chave de API Google Cloud própria com faturamento ativado ou aprovação para o Veo 3.1.\n\nDeseja selecionar sua chave agora?");
                if (confirmKey) {
                    try {
                        await window.aistudio.openSelectKey();
                        addToast("Nova chave configurada! Tente gerar novamente.", "success");
                    } catch (e) {
                        console.error("Error opening key selector", e);
                    }
                }
            } else {
                addToast("Erro ao gerar Morphing: " + errorStr, 'error');
            }
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
            setState(s => pushHistory({ ...s, clips: s.clips.map(c => c.id === clip.id ? clip1 : c).concat(clip2) }, s)); 
            addToast("Clipe dividido", 'success'); 
        } 
    };
    const handleFreeze = async () => { if (!state.selectedClipId) return; const clip = state.clips.find(c => c.id === state.selectedClipId); if (!clip || clip.type !== 'video') return addToast("Selecione um vídeo.", 'info'); setLoadingState({ message: "Congelando Frame...", progress: null }); try { const media = state.media[clip.fileName]; let fileBlob = await getFileFromDB(media.name) || await (await fetch(media.url)).blob(); const timestamp = state.currentPlayheadTime - clip.start + (clip.mediaStartOffset || 0); const formData = new FormData(); formData.append('video', fileBlob, media.name); const res = await fetch(`${BACKEND_URL}/api/util/extract-frame`, { method: 'POST', body: formData }); if (!res.ok) throw new Error("Falha na extração"); const frameBlob = await res.blob(); const frameName: string = `freeze_${Date.now()}.png`; await storeFileInDB(frameName, frameBlob); const frameUrl = URL.createObjectURL(frameBlob); const frameMedia: MediaItem = { name: frameName, url: frameUrl, type: 'image', duration: 3, isUserFile: true, thumbnail: frameUrl }; addMediaToLibrary([frameMedia]); setState(prev => { const targetClip = prev.clips.find(c => c.id === prev.selectedClipId)!; const cutPoint = prev.currentPlayheadTime; const relativeCut = cutPoint - targetClip.start; const clip1 = { ...targetClip, duration: relativeCut }; const freezeClip: Clip = { id: `freeze_${Date.now()}`, fileName: frameName, type: 'image', track: targetClip.track, start: cutPoint, duration: 3, properties: { ...targetClip.properties, speed: 1 } }; const clip3 = { ...targetClip, id: `clip_${Date.now()}_after`, start: cutPoint + 3, duration: targetClip.duration - relativeCut, mediaStartOffset: (targetClip.mediaStartOffset || 0) + relativeCut }; const otherClips = prev.clips.filter(c => c.id !== targetClip.id).map(c => (c.track === targetClip.track && c.start >= cutPoint) ? { ...c, start: c.start + 3 } : c); return pushHistory({ ...prev, clips: [...otherClips, clip1, freezeClip, clip3] }); }); addToast("Frame Congelado!", 'success'); } catch (e: any) { addToast(`Erro: ${e.message}`, 'error'); } finally { setLoadingState(null); } };
    const handleSceneDetect = async () => { if (!state.selectedClipId) return; const clip = state.clips.find(c => c.id === state.selectedClipId); if (!clip || clip.type !== 'video') return addToast("Selecione um vídeo.", 'info'); setLoadingState({ message: "Analisando Cenas (AI)...", progress: null }); try { const media = state.media[clip.fileName]; let fileBlob = await getFileFromDB(media.name) || await (await fetch(media.url)).blob(); const formData = new FormData(); formData.append('video', fileBlob, media.name); const res = await fetch(`${BACKEND_URL}/api/analyze/scenes`, { method: 'POST', body: formData }); if (!res.ok) throw new Error("Falha na análise"); const { scenes } = await res.json() as any; if (!scenes?.length) return addToast("Nenhuma cena detectada.", 'info'); setState(prev => { const sorted = scenes.sort((a: any, b: any) => a - b); const start = clip.mediaStartOffset || 0; const end = start + clip.duration; const relevant = sorted.filter((t: number) => t > start + 0.5 && t < end - 0.5); if (!relevant.length) return prev; const newSegments: Clip[] = []; let currentOffset = start; let currentTimelineStart = clip.start; [...relevant, end].forEach((point: number, idx: number) => { const dur = point - currentOffset; if (dur > 0.1) { const newSegment: Clip = { ...clip, id: `scene_${Date.now()}_${idx}`, start: currentTimelineStart, duration: dur, mediaStartOffset: currentOffset, }; newSegments.push(newSegment); currentTimelineStart += dur; currentOffset = point; } }); return pushHistory({ ...prev, clips: prev.clips.filter(c => c.id !== clip.id).concat(newSegments) }); }); addToast(`Vídeo dividido em ${scenes.length} cenas!`, 'success'); } catch (e: any) { addToast(`Erro: ${e.message}`, 'error'); } finally { setLoadingState(null); } };
    const onAddTextHandler = (styleId?: string, design?: Partial<TextDesignProperties>) => { 
        const id = `text_${Date.now()}`;
        const newClip: Clip = { 
            id, 
            fileName: 'Text Layer', 
            type: 'text', 
            track: 'text', 
            start: state.currentPlayheadTime, 
            duration: 3, 
            styleId, 
            properties: { text: (design as any)?.text || 'Novo Texto', textDesign: design as any } 
        }; 
        setState(prev => pushHistory({ ...prev, clips: [...prev.clips, newClip], selectedClipId: id }, prev)); 
    };
    const handleBackendAction = async (endpoint: string, friendlyName: string, params: any = {}, options: any = {}) => { 
        if (!state.selectedClipId && !options.extraFile && !endpoint.includes('export') && !endpoint.includes('generate-music')) return addToast("Selecione um clipe.", 'error'); 
        
        const activeClipId = state.selectedClipId; // Captura o ID do clipe no início do processo
        
        setLoadingState({ message: `Processando ${friendlyName}...`, progress: endpoint.includes('export') ? 0 : null }); 
        try { 
            const formData = new FormData(); 
            if (options.extraFile) formData.append(String(options.extraFieldName || 'files'), options.extraFile); 
            else if (activeClipId) { 
                const clip = state.clips.find(c => c.id === activeClipId)!; 
                const media = state.media[clip.fileName]; 
                if (media) formData.append('files', await getFileFromDB(media.name) || await (await fetch(media.url)).blob(), media.name); 
            } Object.keys(params).forEach(k => formData.append(k, typeof params[k] === 'object' ? JSON.stringify(params[k]) : String(params[k]))); if (endpoint.includes('export')) { const cleanState = { media: state.media, clips: state.clips, totalDuration: state.totalDuration, projectAspectRatio: state.projectAspectRatio, backgroundColor: state.backgroundColor, }; formData.append('projectState', JSON.stringify({ ...cleanState, exportConfig: options.exportConfig })); const realFileNames = Array.from(new Set(state.clips .filter(c => c.type !== 'text' && c.fileName !== 'Text Layer') .map(c => c.fileName) )) as string[]; for (const name of realFileNames) { const blob = await getFileFromDB(name); if (blob) { formData.append('files', blob, name); } else if (state.media[name]?.url) { try { const res = await fetch(state.media[name].url); if (res.ok) { const b = await res.blob(); formData.append('files', b, name); } } catch(e) { console.warn("Failed to retrieve media for export:", name, e); } } } } const startRes = await fetch(`${BACKEND_URL}${endpoint.startsWith('/api') ? endpoint : '/api/process/start/' + endpoint}`, { method: 'POST', body: formData }); if (!startRes.ok) throw new Error(await startRes.text()); const { jobId } = await startRes.json(); const poll = setInterval(async () => { const statusRes = await fetch(`${BACKEND_URL}/api/process/status/${jobId}`); const status = await statusRes.json() as any; if (status.progress !== undefined) setLoadingState(p => ({ ...p!, progress: status.progress })); if (status.status === 'completed') { clearInterval(poll); const blob = await (await fetch(`${BACKEND_URL}${status.downloadUrl}`)).blob(); 
        if (blob.size < 100) {
            setLoadingState(null);
            throw new Error("Arquivo gerado vazio ou inválido.");
        }
        if (endpoint.includes('export')) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `export_${Date.now()}.mp4`; a.click(); setLoadingState(null); addToast("Exportado!", 'success'); return; } const newName = `res_${Date.now()}_${friendlyName.replace(/\s/g,'_')}.${blob.type.includes('video') ? 'mp4' : blob.type.includes('audio') ? 'wav' : 'png'}`; await storeFileInDB(newName, blob); const url = URL.createObjectURL(blob); const item: MediaItem = { name: newName, url, type: blob.type.includes('video') ? 'video' : blob.type.includes('audio') ? 'audio' : 'image', duration: 5, isUserFile: true, thumbnail: url, hasAudio: blob.type.includes('audio') || blob.type.includes('video') }; if(item.type === 'audio') { const meta = await getMediaMetadata(url, 'audio'); item.duration = meta.duration; } if (options.replace) setState(p => pushHistory({ ...p, media: { ...p.media, [newName]: item }, clips: p.clips.map(c => c.id === activeClipId ? { ...c, fileName: newName } : c) })); else addMediaItemToState(item, state.currentPlayheadTime, options.targetTrack); setLoadingState(null); addToast("Pronto!", 'success'); } else if (status.status === 'failed') { clearInterval(poll); setLoadingState(null); addToast(`Erro: ${status.error}`, 'error'); } }, 2000); } catch (e: any) { setLoadingState(null); addToast(`Erro: ${e.message}`, 'error'); } };
    const handleHeaderExport = (config: any) => { handleBackendAction('/api/export/start', 'Export', {}, { exportConfig: config }); };
    
    // OTIMIZAÇÃO: Importação sequencial para não travar a thread principal
    const onImportHandler = async (files: FileList | null, forceType?: 'audio' | 'video' | 'image', targetTrack?: string) => { 
        if (!files) return; 
        setLoadingState({ message: "Importando...", progress: 0 }); 
        
        try { 
            const fileArray = Array.from(files);
            const newMediaItems: MediaItem[] = [];
            const newClips: Clip[] = [];
            
            let currentOffset = state.currentPlayheadTime;
            
            for (let i = 0; i < fileArray.length; i++) {
                const file = fileArray[i];
                setLoadingState({ message: `Importando ${i+1}/${fileArray.length}...`, progress: Math.round((i/fileArray.length)*100) });
                
                let type = file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : 'image'; 
                if (forceType) type = forceType; 
                
                let name = file.name; 
                if (forceType === 'audio' && file.type.startsWith('video')) { 
                    name = `${file.name} (Audio)`; 
                } 
                
                let item: MediaItem;
                if (state.media[name]) { 
                    item = state.media[name];
                } else {
                    await storeFileInDB(name, file); 
                    const url = URL.createObjectURL(file); 
                    const meta = (type === 'video' || type === 'audio') ? await getMediaMetadata(url, type) : { duration: 5, hasAudio: false }; 
                    const thumb = (type === 'video' && !forceType) ? await getVideoThumbnail(file) : url; 
                    
                    item = { 
                        name: name, 
                        url, 
                        type: type as any, 
                        duration: meta.duration, 
                        isUserFile: true, 
                        thumbnail: thumb, 
                        hasAudio: meta.hasAudio 
                    }; 
                    newMediaItems.push(item);
                }
                
                const clipDuration = (item.duration && item.duration > 0.1) ? item.duration : 5;
                const newClip: Clip = { 
                    id: `clip_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`, 
                    fileName: item.name, 
                    type: item.type, 
                    track: (targetTrack as any) || (item.type === 'audio' ? 'audio' : 'video'), 
                    start: currentOffset, 
                    duration: clipDuration, 
                    properties: { opacity: 1, volume: 1, speed: 1, transform: { x:0, y:0, scale:1, rotation:0 } } 
                };
                newClips.push(newClip);
                currentOffset += clipDuration;
                
                // Allow UI to update for progress
                await new Promise(r => setTimeout(r, 10));
            } 

            setState(prev => {
                const newMedia = { ...prev.media };
                newMediaItems.forEach(item => { newMedia[item.name] = item; });
                return pushHistory({
                    ...prev,
                    media: newMedia,
                    clips: [...prev.clips, ...newClips],
                    currentPlayheadTime: currentOffset
                }, prev);
            });

            addToast("Importado para a timeline!", 'success'); 
        } catch (e: any) { 
            console.error(e);
            addToast("Erro na importação", 'error'); 
        } finally { 
            setLoadingState(null); 
        } 
    };

    // --- TRACK IMPORT HANDLING ---
    // This allows specific tracks to trigger the file browser and import directly to them
    const handleTrackImport = (track: string) => {
        setImportTargetTrack(track);
        trackInputRef.current?.click();
    };

    const handlePreviewTTS = async (text: string, voice: string, style?: string, speed?: number, pitch?: number) => { 
        setTtsPreviewLoading(true); 
        try { 
            const voiceConfig = mapVoiceIdToGeminiName(voice);
            
            const [styleId, accentId, emotionId, nuanceId] = (style || '').split('|');
            let combinedInstructions = '';
            
            if (styleId && styleId !== 'normal') {
                const desc = TTS_STYLE_DESCRIPTIONS[styleId];
                if (desc) combinedInstructions += `, style: ${desc}`;
            }
            if (accentId && accentId !== 'none') {
                const desc = TTS_ACCENT_DESCRIPTIONS[accentId] || TTS_STYLE_DESCRIPTIONS[accentId];
                if (desc) combinedInstructions += `, accent: ${desc}. CRITICAL: You MUST apply this regional accent strongly, even if it deviates from the base voice tone.`;
            }
            if (emotionId && emotionId !== 'neutral') {
                const desc = TTS_EMOTION_DESCRIPTIONS[emotionId] || TTS_STYLE_DESCRIPTIONS[emotionId];
                if (desc) combinedInstructions += `, emotion: ${desc}`;
            }
            if (nuanceId && nuanceId !== 'none') {
                const desc = TTS_NUANCE_DESCRIPTIONS[nuanceId];
                if (desc) combinedInstructions += `, human-nuance: ${desc}. IMPORTANT PERFORMANCE INSTRUCTION: Apply this nuance naturally throughout the speech, approximately once every 60 seconds (or every 150 words) of narration to maintain a human feel.`;
            } else {
                // Default organic feel for long texts
                combinedInstructions += `, human-nuance: Include subtle natural breaths every 45-60 seconds for organic realism.`;
            }
            
            let styleInstructions = '';
            if (combinedInstructions) {
                styleInstructions = ` (instructions: ${combinedInstructions.substring(2)})`;
            }
            
            const speedText = speed && speed !== 1 ? ` (at speed ${speed}x)` : '';
            const pitchText = pitch && pitch !== 0 ? ` (pitch ${pitch > 0 ? 'high' : 'low'})` : '';
            
            // Move instructions to system instruction
            const systemInstruction = `You are a high-quality cinematic Text-to-Speech system. Voice: ${voiceConfig.prompt}${styleInstructions}${speedText}${pitchText}. Read the user text with perfect timing and requested emotion. For long texts, ensure you include small, almost imperceptible human nuances like soft breaths or light throat clears periodically to avoid a robotic sound.`;
            
            const data = await GeminiVideoService.generateTTS({
                text: text.trim(), // Send ONLY the text here
                voice: voiceConfig.voice,
                speed,
                pitch,
                systemInstruction,
                apiKey: getUserKey()
            });

            const bytes = base64ToUint8Array(data); 
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 }); 
            const dataInt16 = new Int16Array(bytes.buffer); 
            const float32 = new Float32Array(dataInt16.length); 
            for (let i = 0; i < dataInt16.length; i++) float32[i] = dataInt16[i] / 32768.0; 
            const buffer = audioCtx.createBuffer(1, float32.length, 24000); 
            buffer.copyToChannel(float32, 0); 
            const source = audioCtx.createBufferSource(); 
            source.buffer = buffer; 
            const outputNode = audioCtx.createGain(); 
            source.connect(outputNode); 
            outputNode.connect(audioCtx.destination); 
            source.start(); 
        } catch (e: any) { 
            addToast("Erro na prévia TTS", 'error'); 
            console.error(e);
        } finally { 
            setTtsPreviewLoading(false); 
        } 
    };

    const handleGenerateTTS = async (text: string, voice: string, style?: string, speed?: number, pitch?: number, autoSubtitle?: boolean, subtitleTemplateId?: string) => { 
        setLoadingState({ message: "Gerando Narração Profissional...", progress: null }); 
        try { 
            const voiceConfig = mapVoiceIdToGeminiName(voice);
            
            const [styleId, accentId, emotionId, nuanceId] = (style || '').split('|');
            let combinedInstructions = '';
            
            if (styleId && styleId !== 'normal') {
                const desc = TTS_STYLE_DESCRIPTIONS[styleId];
                if (desc) combinedInstructions += `, style: ${desc}`;
            }
            if (accentId && accentId !== 'none') {
                const desc = TTS_ACCENT_DESCRIPTIONS[accentId] || TTS_STYLE_DESCRIPTIONS[accentId];
                if (desc) combinedInstructions += `, accent: ${desc}. CRITICAL: You MUST apply this regional accent strongly, even if it deviates from the base voice tone.`;
            }
            if (emotionId && emotionId !== 'neutral') {
                const desc = TTS_EMOTION_DESCRIPTIONS[emotionId] || TTS_STYLE_DESCRIPTIONS[emotionId];
                if (desc) combinedInstructions += `, emotion: ${desc}`;
            }
            if (nuanceId && nuanceId !== 'none') {
                const desc = TTS_NUANCE_DESCRIPTIONS[nuanceId];
                if (desc) combinedInstructions += `, human-nuance: ${desc}. IMPORTANT PERFORMANCE INSTRUCTION: Apply this nuance naturally throughout the speech, approximately once every 60 seconds (or every 150 words) of narration to maintain a human feel.`;
            } else {
                // Default organic feel for long texts
                combinedInstructions += `, human-nuance: Include subtle natural breaths every 45-60 seconds for organic realism.`;
            }
            
            let styleInstructions = '';
            if (combinedInstructions) {
                styleInstructions = ` (instructions: ${combinedInstructions.substring(2)})`;
            }

            const speedText = speed && speed !== 1 ? ` (at speed ${speed}x)` : '';
            const pitchText = pitch && pitch !== 0 ? ` (pitch ${pitch > 0 ? 'high' : 'low'})` : '';
            
            // Move instructions to system instruction to keep main text clean
            const systemInstruction = `You are a high-quality cinematic Text-to-Speech system. Voice: ${voiceConfig.prompt}${styleInstructions}${speedText}${pitchText}. Read the user text with perfect timing and requested emotion. For long texts, ensure you include small, almost imperceptible human nuances like soft breaths or light throat clears periodically to avoid a robotic sound.`;

            const data = await GeminiVideoService.generateTTS({
                text: text.trim(), // Send ONLY the text here
                voice: voiceConfig.voice,
                speed,
                pitch,
                systemInstruction,
                apiKey: getUserKey()
            });

            const blob = pcmToWav(base64ToUint8Array(data), 24000); 
            const name = `tts_${Date.now()}.wav`; 
            await storeFileInDB(name, blob); 
            
            // Calculate approximate duration (24000 samples per second)
            const duration = (base64ToUint8Array(data).length / 2) / 24000;
            
            addMediaItemToState({ 
                name, 
                url: URL.createObjectURL(blob), 
                type: 'audio', 
                duration: duration, 
                isUserFile: true, 
                hasAudio: true 
            }, state.currentPlayheadTime, 'narration'); 
            
            addToast("Narração AI concluída!", 'success'); 
            
            if (autoSubtitle && handleGenerateSubtitles) {
                setTimeout(() => {
                    handleGenerateSubtitles('all', subtitleTemplateId).catch(console.error);
                }, 800);
            }
        } catch (e: any) { 
            addToast("Falha na geração TTS", 'error');
            console.error(e);
        } finally {
            setLoadingState(null);
        }
    };
    const handleGenerateImage = async (prompt: string, aspectRatio: string = '1:1') => { 
        setLoadingState({ message: "Gerando Imagem...", progress: null }); 
        try { 
            const dataUrl = await GeminiVideoService.generateImage(prompt, aspectRatio, getUserKey());
            
            if (dataUrl) { 
                const base64Data = dataUrl.split(',')[1];
                const blob = base64ToBlob(base64Data, 'image/png'); 
                const name = `ai_img_${Date.now()}.png`; 
                await storeFileInDB(name, blob); 
                const url = URL.createObjectURL(blob);
                const item: MediaItem = { name, url, type: 'image', duration: 5, isUserFile: true, thumbnail: dataUrl }; 
                addMediaToLibrary([item]); 
                addMediaItemToState(item); 
                addToast("Imagem gerada!", 'success'); 
            }
        } catch (e: any) { 
            addToast(`Erro: ${e.message}`, 'error'); 
        } finally { 
            setLoadingState(null); 
        } 
    };
    
    // Updated Veo Handler using Backend to avoid mandatory Client-Side API Key for system styles
    const handleGenerateVeo = async (config: VideoConfig) => {
        setLoadingState({ message: "Sincronizando com Morpheus & Veo Engine no Servidor...", progress: 5 }); 
        setGenerationStatus({ isGenerating: true, statusMessage: "Conectando ao núcleo de IA..." });
        
        try {
            const userApiKey = getUserKey();
            
            // We'll call our backend endpoint /api/ai/generate-video
            const response = await fetch('/api/ai/generate-video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...config,
                    apiKey: userApiKey // Pass user key if they have one, otherwise server uses its own
                })
            });

            if (response.status === 202) {
                const { jobId } = await response.json();
                
                // Poll for Job Status
                let completed = false;
                while (!completed) {
                    await new Promise(r => setTimeout(r, 3000));
                    const pollRes = await fetch(`/api/process/status/${jobId}`);
                    const job = await pollRes.json();
                    
                    if (job.status === 'completed') {
                        completed = true;
                        
                        // Download the final video
                        const videoRes = await fetch(job.downloadUrl);
                        const blob = await videoRes.blob();
                        const name = `veo_${Date.now()}.mp4`;
                        
                        await storeFileInDB(name, blob); 
                        const finalUrl = URL.createObjectURL(blob); 
                        const thumb = await getVideoThumbnail(new globalThis.File([blob], name)); 
                        
                        const item: MediaItem = { name, url: finalUrl, type: 'video', duration: 5, isUserFile: true, thumbnail: thumb }; 
                        addMediaToLibrary([item]); 
                        addMediaItemToState(item); 
                        addToast("Vídeo gerado via Morpheus!", 'success'); 
                    } else if (job.status === 'failed') {
                        throw new Error(job.error || "A geração AI falhou.");
                    } else {
                        setLoadingState({ message: "Morpheus está esculpindo seu vídeo...", progress: job.progress });
                        setGenerationStatus({ isGenerating: true, statusMessage: `Gerando... ${job.progress}%` });
                    }
                }
            } else {
                const err = await response.json();
                throw new Error(err.error || "Falha ao iniciar geração AI.");
            }
            
        } catch (e: any) { 
            console.error(e);
            addToast(`Erro: ${e.message}`, 'error'); 
        } finally { 
            setLoadingState(null); 
            setGenerationStatus({ isGenerating: false, statusMessage: "" });
        }
    };

    const handleGenerateVideo = async (prompt: string, duration?: number, image?: string) => {
        handleGenerateVeo({
            prompt,
            image, // Pass the reference image if available
            aspectRatio: '16:9' as any,
            resolution: '720p' as any,
            model: 'veo-3.1-lite-generate-preview'
        });
    };

    const handleTransformWithAI = async (clipId: string, prompt: string) => {
        const clip = state.clips.find(c => c.id === clipId);
        if (!clip) return;
        
        setLoadingState({ message: "Extraindo essência visual para Morpheus...", progress: 10 });
        try {
            let referenceImage = "";
            if (clip.type === 'image') {
                const blob = await getFileFromDB(clip.fileName);
                if (blob) referenceImage = await blobToBase64(blob);
            } else if (clip.type === 'video') {
                // Use current preview frame as reference
                try {
                    const res = await blobUrlToBase64(clip.url, getClipCurrentTime(clip, state.currentPlayheadTime));
                    referenceImage = res.data;
                } catch (err) {
                    console.warn("Failed to extract video frame, falling back to prompt only", err);
                }
            }
            
            await handleGenerateVideo(prompt, 5, referenceImage);
        } catch (e: any) {
            console.error(e);
            addToast(`Falha na transformação: ${e.message}`, "error");
        } finally {
            setLoadingState(null);
        }
    };

    const handleAutoRandomTransitions = () => {
        const videoClips = state.clips.filter(c => c.track === 'video' || c.track === 'camada');
        if (videoClips.length <= 1) {
            addToast("Adicione pelo menos 2 clipes para criar transições automáticas.", 'info');
            return;
        }

        const transitionStyles = [
            'fade', 'crossfade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 
            'zoom-in', 'zoom-out', 'blur', 'flash', 'glitch', 'pixelate', 'shake', 'rotate', 'wipe-left', 'wipe-right'
        ];

        setState(s => {
            const newClips = s.clips.map(clip => {
                if (clip.track !== 'video' && clip.track !== 'camada') return clip;
                
                // Assign a random transition to each video clip
                const randomStyle = transitionStyles[Math.floor(Math.random() * transitionStyles.length)];
                return {
                    ...clip,
                    transition: {
                        id: randomStyle,
                        duration: 1.0
                    }
                };
            });
            return pushHistory({ ...s, clips: newClips }, s);
        });
        
        addToast("Mágica completa! Transições automáticas aplicadas em todos os clipes.", 'success');
    };

    const handleGenerateMusic = async (prompt: string, duration: number) => {
        setLoadingState({ message: "Gerando Música Cinematográfica (Lyria)...", progress: null });
        try {
            const url = await generateMusic({ prompt, duration });
            
            // Download and store locally
            const timestamp = Date.now();
            const fileName = `ai_music_${timestamp}.wav`;
            
            const response = await fetch(url);
            if (!response.ok) throw new Error("Falha ao baixar música gerada");
            const blob = await response.blob();
            
            await storeFileInDB(fileName, blob);
            const localUrl = URL.createObjectURL(blob);
            
            const item: MediaItem = {
                name: fileName,
                url: localUrl,
                type: 'audio',
                duration: duration,
                isUserFile: true,
                hasAudio: true,
                thumbnail: 'https://img.icons8.com/isometric/512/musical-notes.png'
            };
            
            addMediaToLibrary([item]);
            addMediaItemToState(item, state.currentPlayheadTime, 'music');
            
            addToast("Symphony AI: Trilha sonora gerada e adicionada!", "success");
        } catch (e: any) {
            console.error("Music Gen Error:", e);
            addToast(`Erro: ${e.message}`, "error");
        } finally {
            setLoadingState(null);
        }
    };

    const handleTranscribeAudio = async (file: File): Promise<string> => { 
        setLoadingState({ message: "Transcrevendo...", progress: null }); 
        try { 
            const ai = new GoogleGenAI({ apiKey: getUserKey() }); 
            const base64 = await blobToBase64(file); 
            const res: GenerateContentResponse = await ai.models.generateContent({ 
                model: 'gemini-3-flash-preview', 
                contents: [{ parts: [{ inlineData: { mimeType: file.type, data: base64 } }, { text: "Transcribe." }] }] 
            }); 
            addToast("Transcrito!", "success"); 
            return res.text || ""; 
        } catch (e) { 
            addToast("Erro", 'error'); 
            return ""; 
        } finally { 
            setLoadingState(null); 
        } 
    };

    const handleFetchUrl = async (url: string): Promise<string> => {
        if (!url) return "";
        setLoadingState({ message: "Analisando Áudio do Vídeo (Gemini)...", progress: null });
        try {
            const ai = new GoogleGenAI({ apiKey: getUserKey() });
            
            const prompt = `
            Context: I want to create a complete REMAKE of this YouTube video: ${url}
            
            Task: 
            1. Use Google Search to find the FULL TRANSCRIPT or SUBTITLES of this video.
            2. Act as if you are "listening" to the entire audio track. Capture every key point, argument, and narrative beat.
            3. Do not summarize into a short paragraph. I need a detailed, chronological breakdown of the spoken content.
            4. Identify the speaker's tone (e.g., energetic, educational, sarcastic, serious).
            5. Extract the core message and the flow: Intro -> Body (Key Points) -> Outro.

            Output: A comprehensive text breakdown of the video's narrative content (what was said), suitable for rewriting into a new script.
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: [{ parts: [{ text: prompt }] }],
                config: {
                    tools: [{ googleSearch: {} }],
                }
            });
            
            const text = response.text;
            if (!text) throw new Error("Sem resposta do Gemini.");
            
            addToast("Áudio analisado e conteúdo extraído!", 'success');
            return text;
        } catch (e: any) {
            console.error("Fetch URL Error:", e);
            addToast(`Erro ao buscar URL: ${e.message}`, 'error');
            return "";
        } finally {
            setLoadingState(null);
        }
        return "";
    };

    const fetchWithTimeout = async (url: string, options: any = {}, timeout = 10000) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(id);
            return response;
        } catch (e) {
            clearTimeout(id);
            throw e;
        }
    };

    const generateSyncExtras = async (duration: number, theme: string = "abstract cinematic") => {
        console.log(`[SyncExtras] Starting generation for ${duration}s with theme: ${theme}`);
        const extraClips: Clip[] = [];
        const extraMedia: MediaItem[] = [];
        const interval = 60; // 1 minute
        
        // Ensure at least one set of layers if duration is > 0
        const iterations = Math.max(1, Math.ceil(duration / interval));
        
        for (let j = 0; j < iterations; j++) {
            const t = j * interval;
            if (t >= duration && j > 0) break;

            console.log(`[SyncExtras] Processing iteration ${j} at time ${t}`);

            // --- CAMADAS (3 por minuto, divididas em 20s cada) ---
            const layerQueries = [`${theme} texture`, `${theme} light leaks`, `${theme} overlay`];
            const layerDuration = 20; // 60s / 3 = 20s
            
            for (let i = 0; i < 3; i++) {
                const startTime = t + (i * layerDuration);
                if (startTime >= duration) break;
                
                const query = layerQueries[i] || theme;
                let imageUrl = await searchPixabayMedia(query, 'image');
                
                // Fallback to a nice abstract image if Pixabay fails
                if (!imageUrl) {
                    imageUrl = `https://picsum.photos/seed/${encodeURIComponent(query)}/1280/720`;
                }
                
                if (imageUrl) {
                    const name = `extra_bg_layer_${t}_${i}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.jpg`;
                    try {
                        const proxyUrl = `${BACKEND_URL}/api/proxy/media?url=${encodeURIComponent(imageUrl)}`;
                        const imgRes = await fetchWithTimeout(proxyUrl);
                        
                        let finalUrl = imageUrl;
                        if (imgRes.ok) {
                            const blob = await imgRes.blob();
                            await storeFileInDB(name, blob);
                            finalUrl = URL.createObjectURL(blob);
                        } else {
                            console.warn(`[SyncExtras] Proxy failed for image ${i}, using direct URL`);
                        }
                        
                        const actualDuration = Math.min(layerDuration, duration - startTime);
                        
                        extraMedia.push({ name, url: finalUrl, type: 'image', duration: actualDuration, isUserFile: true, thumbnail: finalUrl });
                        
                        extraClips.push({
                            id: `extra_bg_layer_clip_${t}_${i}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                            fileName: name,
                            type: 'image',
                            track: 'camada',
                            start: startTime,
                            duration: actualDuration,
                            properties: { 
                                opacity: 0.4, 
                                transform: { x: 0, y: 0, scale: 1.2, rotation: 0 },
                                fit: 'cover',
                                adjustments: { brightness: 0.6, contrast: 1.2, saturate: 0.7, hue: 0 }
                            }
                        });
                    } catch (e) {
                        console.error("[SyncExtras] Failed to fetch extra background layer image", e);
                    }
                }
            }

            // --- ÁUDIO (Música do Freesound) ---
            let musicUrl = await searchFreesoundMedia(theme);
            if (!musicUrl) {
                musicUrl = await searchPixabayMedia(theme, 'music');
            }
            
            if (musicUrl) {
                const audioName = `extra_music_${t}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.mp3`;
                try {
                    const proxyUrl = `${BACKEND_URL}/api/proxy/media?url=${encodeURIComponent(musicUrl)}`;
                    const audioRes = await fetchWithTimeout(proxyUrl);
                    
                    if (audioRes.ok) {
                        const audioBlob = await audioRes.blob();
                        await storeFileInDB(audioName, audioBlob);
                        const localUrl = URL.createObjectURL(audioBlob);
                        
                        const musicDuration = Math.min(interval, duration - t);
                        extraMedia.push({ name: audioName, url: localUrl, type: 'audio', duration: musicDuration, isUserFile: true, hasAudio: true });
                        
                        extraClips.push({
                            id: `extra_music_clip_${t}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                            fileName: audioName,
                            type: 'audio',
                            track: 'music',
                            start: t,
                            duration: musicDuration,
                            properties: { volume: 0.15 }
                        });
                    }
                } catch (e) {
                    console.error("[SyncExtras] Failed to fetch extra music", e);
                }
            }

            // --- SFX (Efeitos Sonoros do Freesound) ---
            let sfxUrl = await searchFreesoundMedia(`${theme} sound effect`);
            if (!sfxUrl) {
                sfxUrl = await searchPixabayMedia(`${theme} sound effect`, 'music');
            }
            
            if (sfxUrl) {
                const sfxName = `extra_sfx_${t}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.mp3`;
                try {
                    const proxyUrl = `${BACKEND_URL}/api/proxy/media?url=${encodeURIComponent(sfxUrl)}`;
                    const sfxRes = await fetchWithTimeout(proxyUrl);
                    
                    if (sfxRes.ok) {
                        const sfxBlob = await sfxRes.blob();
                        await storeFileInDB(sfxName, sfxBlob);
                        const localUrl = URL.createObjectURL(sfxBlob);
                        extraMedia.push({ name: sfxName, url: localUrl, type: 'audio', duration: 3, isUserFile: true, hasAudio: true });
                        
                        extraClips.push({
                            id: `extra_sfx_clip_${t}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                            fileName: sfxName,
                            type: 'audio',
                            track: 'sfx',
                            start: Math.min(t + 30, duration - 3),
                            duration: 3,
                            properties: { volume: 0.3 }
                        });
                    }
                } catch (e) {
                    console.error("[SyncExtras] Failed to fetch extra sfx", e);
                }
            }
        }
        console.log(`[SyncExtras] Finished. Generated ${extraClips.length} clips.`);
        return { extraClips, extraMedia };
    };

    const handleSmartMagicSync = async (audioFile: File, source: 'mixed' | 'gemini_image' | 'pexels_video' | 'pexels_image' | 'pixabay_video' | 'pixabay_image' | 'unsplash_image' = 'mixed', style?: string) => {
        setMagicSyncLoading(true);
        setLoadingState({ message: "Analisando áudio para sincronização inteligente...", progress: 0 });
        
        try {
            // 1. Store and add audio
            const audioName = `magic_audio_${Date.now()}_${audioFile.name}`;
            await storeFileInDB(audioName, audioFile);
            const audioUrl = URL.createObjectURL(audioFile);
            const audioMeta = await getMediaMetadata(audioUrl, 'audio');
            
            const audioItem: MediaItem = {
                name: audioName,
                url: audioUrl,
                type: 'audio',
                duration: audioMeta.duration,
                isUserFile: true,
                hasAudio: true
            };
            
            const newMediaItems: MediaItem[] = [audioItem];
            addMediaToLibrary([audioItem]);
            
            // 2. Analyze audio with Gemini to get prompts and durations
            setLoadingState({ message: "Gemini está ouvindo o áudio...", progress: 10 });
            const ai = new GoogleGenAI({ apiKey: getUserKey() });
            const base64Audio = await blobToBase64(audioFile);
            
            const analysisPrompt = `
            Analyze this audio. Create a sequence of visual scenes that match the narration/content.
            For each scene, provide:
            1. A visual prompt in English (optimized for high-quality image generation).
            2. A search query in English for Pexels videos/images (short, descriptive, e.g., "city traffic night", "woman walking in forest").
            3. A duration in seconds.
            
            CRITICAL RULES:
            - The durations MUST be varied and dynamic, choosing randomly from [2, 3, 4, 5, 8] seconds to create a high-energy edit.
            - The total duration of all scenes MUST match the total audio duration: ${audioMeta.duration.toFixed(1)}s.
            - If the audio has specific mentions (e.g., "sun", "city", "forest", "good morning"), the prompt and search query MUST reflect that visually.
            - The visual prompt MUST be 100% related to the audio content. Do not generate random or generic prompts.
            - Return ONLY a JSON array of objects like this: [{"prompt": "...", "searchQuery": "...", "duration": 3.5}, ...]
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: [{ 
                    parts: [
                        { inlineData: { mimeType: audioFile.type, data: base64Audio } },
                        { text: analysisPrompt }
                    ] 
                }]
            });

            const text = response.text;
            if (!text) throw new Error("Falha na análise do áudio pelo Gemini.");
            
            // Clean JSON response
            const jsonMatch = text.match(/\[.*\]/s);
            if (!jsonMatch) throw new Error("Resposta do Gemini não contém um JSON válido.");
            
            const scenes: { prompt: string, searchQuery: string, duration: number }[] = JSON.parse(jsonMatch[0]);
            
            // 3. Generate media for each scene
            const clipsToSync: Clip[] = [];
            let currentTimelineTime = 0;
            
            for (let i = 0; i < scenes.length; i++) {
                const scene = scenes[i];
                const progress = 20 + (i / scenes.length) * 70;
                setLoadingState({ message: `Buscando/Gerando mídia ${i + 1} de ${scenes.length}...`, progress });
                
                let finalMediaUrl = "";
                let finalMediaName = "";
                let thumbnail = "";
                let mediaType: 'video' | 'image' = 'image';

                const orientation = state.projectAspectRatio === '16:9' ? 'landscape' : 'portrait';

                // MIXED LOGIC: Try to vary sources
                if (source === 'mixed') {
                    // Try Video first (Pexels or Pixabay)
                    const tryPexelsFirst = Math.random() > 0.5;
                    
                    if (tryPexelsFirst) {
                        finalMediaUrl = await searchPexelsVideos(scene.searchQuery, orientation) || "";
                        if (finalMediaUrl) {
                            finalMediaName = `pexels_video_${Date.now()}_${i}.mp4`;
                            mediaType = 'video';
                        } else {
                            finalMediaUrl = await searchPixabayMedia(scene.searchQuery, 'video') || "";
                            if (finalMediaUrl) {
                                finalMediaName = `pixabay_video_${Date.now()}_${i}.mp4`;
                                mediaType = 'video';
                            }
                        }
                    } else {
                        finalMediaUrl = await searchPixabayMedia(scene.searchQuery, 'video') || "";
                        if (finalMediaUrl) {
                            finalMediaName = `pixabay_video_${Date.now()}_${i}.mp4`;
                            mediaType = 'video';
                        } else {
                            finalMediaUrl = await searchPexelsVideos(scene.searchQuery, orientation) || "";
                            if (finalMediaUrl) {
                                finalMediaName = `pexels_video_${Date.now()}_${i}.mp4`;
                                mediaType = 'video';
                            }
                        }
                    }

                    // If no video, try Image (Pexels, Pixabay, Unsplash or Gemini)
                    if (!finalMediaUrl) {
                        const imgSourceRoll = Math.random();
                        if (imgSourceRoll < 0.25) {
                            finalMediaUrl = await searchPexelsImages(scene.searchQuery) || "";
                            if (finalMediaUrl) {
                                finalMediaName = `pexels_img_${Date.now()}_${i}.jpg`;
                                mediaType = 'image';
                            }
                        } else if (imgSourceRoll < 0.5) {
                            finalMediaUrl = await searchPixabayMedia(scene.searchQuery, 'image') || "";
                            if (finalMediaUrl) {
                                finalMediaName = `pixabay_img_${Date.now()}_${i}.jpg`;
                                mediaType = 'image';
                            }
                        } else if (imgSourceRoll < 0.75) {
                            finalMediaUrl = await searchUnsplashImages(scene.searchQuery) || "";
                            if (finalMediaUrl) {
                                finalMediaName = `unsplash_img_${Date.now()}_${i}.jpg`;
                                mediaType = 'image';
                            }
                        }
                        
                        // Final fallback to Gemini Image if still nothing
                        if (!finalMediaUrl) {
                            const imgResponse = await ai.models.generateContent({
                                model: 'gemini-2.5-flash-image',
                                contents: { parts: [{ text: `${style || 'Photorealistic'} Style. High quality cinematic image, professional photography, 100% related to audio context: ${scene.prompt}` }] },
                                config: { imageConfig: { aspectRatio: state.projectAspectRatio === '16:9' ? '16:9' : '9:16' } }
                            });
                            const candidates = imgResponse.candidates || [];
                            if (candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
                                for (const part of candidates[0].content.parts) {
                                    const p = part as any;
                                    if (p.inlineData && p.inlineData.data) {
                                        const base64Data = String(p.inlineData.data);
                                        thumbnail = `data:image/png;base64,${base64Data}`;
                                        const blob = base64ToBlob(base64Data, 'image/png');
                                        finalMediaName = `magic_img_${Date.now()}_${i}.png`;
                                        await storeFileInDB(finalMediaName, blob);
                                        finalMediaUrl = URL.createObjectURL(blob);
                                        mediaType = 'image';
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    thumbnail = thumbnail || finalMediaUrl;
                } else {
                    // SPECIFIC SOURCE LOGIC
                    if (source === 'pexels_video') {
                        finalMediaUrl = await searchPexelsVideos(scene.searchQuery, orientation) || "";
                        if (finalMediaUrl) {
                            finalMediaName = `pexels_video_${Date.now()}_${i}.mp4`;
                            mediaType = 'video';
                            thumbnail = finalMediaUrl;
                        }
                    } else if (source === 'pexels_image') {
                        finalMediaUrl = await searchPexelsImages(scene.searchQuery) || "";
                        if (finalMediaUrl) {
                            finalMediaName = `pexels_img_${Date.now()}_${i}.jpg`;
                            mediaType = 'image';
                            thumbnail = finalMediaUrl;
                        }
                    } else if (source === 'pixabay_video') {
                        finalMediaUrl = await searchPixabayMedia(scene.searchQuery, 'video') || "";
                        if (finalMediaUrl) {
                            finalMediaName = `pixabay_video_${Date.now()}_${i}.mp4`;
                            mediaType = 'video';
                            thumbnail = finalMediaUrl;
                        }
                    } else if (source === 'pixabay_image') {
                        finalMediaUrl = await searchPixabayMedia(scene.searchQuery, 'image') || "";
                        if (finalMediaUrl) {
                            finalMediaName = `pixabay_img_${Date.now()}_${i}.jpg`;
                            mediaType = 'image';
                            thumbnail = finalMediaUrl;
                        }
                    } else if (source === 'unsplash_image') {
                        finalMediaUrl = await searchUnsplashImages(scene.searchQuery) || "";
                        if (finalMediaUrl) {
                            finalMediaName = `unsplash_img_${Date.now()}_${i}.jpg`;
                            mediaType = 'image';
                            thumbnail = finalMediaUrl;
                        }
                    } else if (source === 'gemini_image') {
                        const imgResponse = await ai.models.generateContent({
                            model: 'gemini-2.5-flash-image',
                            contents: { parts: [{ text: `${style || 'Photorealistic'} Style. High quality cinematic image, professional photography, 100% related to audio context: ${scene.prompt}` }] },
                            config: { imageConfig: { aspectRatio: state.projectAspectRatio === '16:9' ? '16:9' : '9:16' } }
                        });
                        const candidates = imgResponse.candidates || [];
                        if (candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
                            for (const part of candidates[0].content.parts) {
                                const p = part as any;
                                if (p.inlineData && p.inlineData.data) {
                                    const base64Data = String(p.inlineData.data);
                                    thumbnail = `data:image/png;base64,${base64Data}`;
                                    const blob = base64ToBlob(base64Data, 'image/png');
                                    finalMediaName = `magic_img_${Date.now()}_${i}.png`;
                                    await storeFileInDB(finalMediaName, blob);
                                    finalMediaUrl = URL.createObjectURL(blob);
                                    mediaType = 'image';
                                    break;
                                }
                            }
                        }
                    }
                }

                if (!finalMediaUrl) continue;

                const mediaItem: MediaItem = {
                    name: finalMediaName,
                    url: finalMediaUrl,
                    type: mediaType,
                    duration: mediaType === 'video' ? 30 : 5,
                    isUserFile: false,
                    thumbnail: thumbnail
                };
                
                newMediaItems.push(mediaItem);
                addMediaToLibrary([mediaItem]);
                
                clipsToSync.push({
                    id: `magic_smart_clip_${Date.now()}_${i}`,
                    fileName: finalMediaName,
                    type: mediaType,
                    track: 'video',
                    start: currentTimelineTime,
                    duration: scene.duration,
                    properties: { opacity: 1, volume: 0, speed: 1, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, fit: 'contain' }
                });
                
                currentTimelineTime += scene.duration;
            }
            
            // 4. Update state
            const theme = style || scenes[0]?.prompt || "cinematic";
            const { extraClips, extraMedia } = await generateSyncExtras(audioMeta.duration, theme);
            const newMediaMap = { ...state.media };
            newMediaItems.forEach(m => newMediaMap[m.name] = m);
            extraMedia.forEach(m => newMediaMap[m.name] = m);
            
            const audioClip: Clip = {
                id: `magic_audio_clip_${Date.now()}`,
                fileName: audioName,
                type: 'audio',
                track: 'audio',
                start: 0,
                duration: audioMeta.duration,
                properties: { volume: 1, speed: 1 }
            };
            
            setState(prev => pushHistory({
                ...prev,
                media: newMediaMap,
                clips: [
                    ...prev.clips.filter(c => c.track !== 'video' && c.track !== 'audio' && c.track !== 'camada' && c.track !== 'sfx' && c.track !== 'music'),
                    ...clipsToSync,
                    ...extraClips,
                    audioClip
                ],
                totalDuration: Math.max(prev.totalDuration, audioMeta.duration)
            }, prev));
            
            addToast("Sincronização Inteligente concluída!", "success");
            
        } catch (e: any) {
            console.error("Smart Magic Sync Error:", e);
            addToast(`Erro na Sincronização Inteligente: ${e.message}`, "error");
        } finally {
            setMagicSyncLoading(false);
            setLoadingState(null);
        }
    };

    const handleMagicSync = async (audioFile: File, videoPrompts: string[]) => {
        setMagicSyncLoading(true);
        setLoadingState({ message: "Iniciando Sincronização Mágica...", progress: 0 });
        
        try {
            // 1. Store and add audio
            const audioName = `magic_audio_${Date.now()}_${audioFile.name}`;
            await storeFileInDB(audioName, audioFile);
            const audioUrl = URL.createObjectURL(audioFile);
            const audioMeta = await getMediaMetadata(audioUrl, 'audio');
            
            const audioItem: MediaItem = {
                name: audioName,
                url: audioUrl,
                type: 'audio',
                duration: audioMeta.duration,
                isUserFile: true,
                hasAudio: true
            };
            
            const newMediaItems: MediaItem[] = [audioItem];
            addMediaToLibrary([audioItem]);
            
            // 2. Generate/Select Videos
            const clipsToSync: Clip[] = [];
            let currentTimelineTime = 0;
            const pattern = [8, 6, 3];
            let patternIndex = 0;
            
            const totalAudioDuration = audioMeta.duration;
            
            setLoadingState({ message: "Gerando/Sincronizando clipes...", progress: 20 });
            
            let i = 0;
            while (currentTimelineTime < totalAudioDuration) {
                const targetDuration = pattern[patternIndex % pattern.length];
                const prompt = videoPrompts[i % videoPrompts.length] || "Cinematic landscape, high quality, professional video";
                
                setLoadingState({ message: `Gerando clipe ${i + 1} (${targetDuration}s)...`, progress: Math.min(90, 20 + (currentTimelineTime / totalAudioDuration) * 70) });
                
                // Generate video with Veo
                const videoUrl = await GeminiVideoService.generateVideo({
                    prompt,
                    aspectRatio: state.projectAspectRatio === '16:9' ? '16:9' : '9:16',
                    resolution: '720p',
                    model: 'veo-3.1-lite-generate-preview',
                    apiKey: getUserKey(),
                    onProgress: (msg) => setLoadingState(prev => ({ ...prev!, message: `Clipe ${i + 1}: ${msg}` }))
                } as any);
                
                const videoName = `magic_video_${Date.now()}_${i}.mp4`;
                const videoRes = await fetch(videoUrl);
                const videoBlob = await videoRes.blob();
                await storeFileInDB(videoName, videoBlob);
                const finalVideoUrl = URL.createObjectURL(videoBlob);
                const thumb = await getVideoThumbnail(new globalThis.File([videoBlob], videoName));
                
                const videoItem: MediaItem = {
                    name: videoName,
                    url: finalVideoUrl,
                    type: 'video',
                    duration: 5, // Veo usually generates 5s
                    isUserFile: true,
                    thumbnail: thumb
                };
                
                newMediaItems.push(videoItem);
                addMediaToLibrary([videoItem]);
                
                const actualDuration = Math.min(targetDuration, totalAudioDuration - currentTimelineTime);
                
                clipsToSync.push({
                    id: `magic_clip_${Date.now()}_${i}`,
                    fileName: videoName,
                    type: 'video',
                    track: 'video',
                    start: currentTimelineTime,
                    duration: actualDuration,
                    properties: { opacity: 1, volume: 0, speed: 1, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, fit: 'contain' }
                });
                
                currentTimelineTime += actualDuration;
                patternIndex++;
                i++;
            }
            
            // 4. Update state
            const theme = videoPrompts[0] || "cinematic";
            addToast("Gerando camadas de fundo, música e SFX...", "info");
            const { extraClips, extraMedia } = await generateSyncExtras(totalAudioDuration, theme);
            console.log(`[MagicSync] Generated ${extraClips.length} extra clips`);
            
            const newMediaMap = { ...state.media };
            newMediaItems.forEach(m => newMediaMap[m.name] = m);
            extraMedia.forEach(m => newMediaMap[m.name] = m);
            
            const audioClip: Clip = {
                id: `magic_audio_clip_${Date.now()}`,
                fileName: audioName,
                type: 'audio',
                track: 'audio',
                start: 0,
                duration: totalAudioDuration,
                properties: { volume: 1, speed: 1 }
            };
            
            setState(prev => pushHistory({
                ...prev,
                media: newMediaMap,
                clips: [
                    ...prev.clips.filter(c => c.track !== 'video' && c.track !== 'audio' && c.track !== 'camada' && c.track !== 'sfx' && c.track !== 'music'),
                    ...clipsToSync,
                    ...extraClips,
                    audioClip
                ],
                totalDuration: Math.max(prev.totalDuration, totalAudioDuration)
            }, prev));
            
            addToast("Sincronização Mágica concluída!", "success");
            
        } catch (e: any) {
            console.error(e);
            addToast(`Erro na Sincronização: ${e.message}`, "error");
        } finally {
            setMagicSyncLoading(false);
            setLoadingState(null);
        }
    };

    const handleSyncUploadedVideos = async (audioFile: File, videoFiles: File[]) => {
        setMagicSyncLoading(true);
        setLoadingState({ message: "Iniciando Sincronização de Uploads...", progress: 0 });
        
        try {
            // 1. Store and add audio
            const audioName = `sync_audio_${Date.now()}_${audioFile.name}`;
            await storeFileInDB(audioName, audioFile);
            const audioUrl = URL.createObjectURL(audioFile);
            const audioMeta = await getMediaMetadata(audioUrl, 'audio');
            
            const audioItem: MediaItem = {
                name: audioName,
                url: audioUrl,
                type: 'audio',
                duration: audioMeta.duration,
                isUserFile: true,
                hasAudio: true
            };
            addMediaToLibrary([audioItem]);
            
            // 2. Store and add videos
            const videoItems: MediaItem[] = [];
            for (let i = 0; i < videoFiles.length; i++) {
                const file = videoFiles[i];
                const videoName = `sync_video_${Date.now()}_${i}_${file.name}`;
                await storeFileInDB(videoName, file);
                const videoUrl = URL.createObjectURL(file);
                const thumb = await getVideoThumbnail(file);
                
                const videoItem: MediaItem = {
                    name: videoName,
                    url: videoUrl,
                    type: 'video',
                    duration: 8, // User says each video has 8s
                    isUserFile: true,
                    thumbnail: thumb
                };
                videoItems.push(videoItem);
            }
            addMediaToLibrary(videoItems);
            
            // 3. Create clips with randomized cuts
            const clipsToSync: Clip[] = [];
            let currentTimelineTime = 0;
            const totalAudioDuration = audioMeta.duration;
            
            // Patterns requested by the user: 5+3, 8 (complete), 3+5, 8 (complete), 4+4, 8 (complete)
            const cutPatterns = [[5, 3], [8], [3, 5], [8], [4, 4], [8]];
            let videoIndex = 0;
            let patternIndex = 0;
            
            while (currentTimelineTime < totalAudioDuration && videoIndex < videoItems.length) {
                const videoItem = videoItems[videoIndex];
                // Use alternating patterns as requested
                const pattern = cutPatterns[patternIndex % cutPatterns.length];
                patternIndex++;
                
                const part1Duration = pattern[0];
                const part2Duration = pattern[1]; // undefined for [8]
                
                // Part 1: From 0 to cutPoint (or full 8s)
                const duration1 = Math.min(part1Duration, totalAudioDuration - currentTimelineTime);
                if (duration1 > 0) {
                    clipsToSync.push({
                        id: `sync_clip_${Date.now()}_${videoIndex}_1_${patternIndex}`,
                        fileName: videoItem.name,
                        type: 'video',
                        track: 'video',
                        start: currentTimelineTime,
                        duration: duration1,
                        mediaStartOffset: 0,
                        properties: { opacity: 1, volume: 0, speed: 1, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, fit: 'contain' }
                    });
                    currentTimelineTime += duration1;
                }
                
                // Part 2: From cutPoint to 8s (only if pattern has 2 parts)
                if (part2Duration !== undefined && currentTimelineTime < totalAudioDuration) {
                    const duration2 = Math.min(part2Duration, totalAudioDuration - currentTimelineTime);
                    if (duration2 > 0) {
                        clipsToSync.push({
                            id: `sync_clip_${Date.now()}_${videoIndex}_2_${patternIndex}`,
                            fileName: videoItem.name,
                            type: 'video',
                            track: 'video',
                            start: currentTimelineTime,
                            duration: duration2,
                            mediaStartOffset: part1Duration, // Start from where the first part ended
                            properties: { opacity: 1, volume: 0, speed: 1, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, fit: 'contain' }
                        });
                        currentTimelineTime += duration2;
                    }
                }
                
                videoIndex++;
                // Loop videos if audio is longer than total video duration
                if (videoIndex >= videoItems.length && currentTimelineTime < totalAudioDuration) {
                    videoIndex = 0;
                }
            }
            
            // 4. Add audio clip
            const theme = audioFile.name.split('.')[0] || "cinematic";
            addToast("Gerando camadas de fundo, música e SFX...", "info");
            const { extraClips, extraMedia } = await generateSyncExtras(totalAudioDuration, theme);
            console.log(`[SmartMagicSync] Generated ${extraClips.length} extra clips`);
            
            const newMediaMap = { ...state.media };
            newMediaMap[audioName] = audioItem;
            videoItems.forEach(m => newMediaMap[m.name] = m);
            extraMedia.forEach(m => newMediaMap[m.name] = m);

            const audioClip: Clip = {
                id: `sync_audio_clip_${Date.now()}`,
                fileName: audioName,
                type: 'audio',
                track: 'audio',
                start: 0,
                duration: totalAudioDuration,
                properties: { volume: 1, speed: 1 }
            };
            
            setState(prev => pushHistory({
                ...prev,
                media: newMediaMap,
                clips: [
                    ...prev.clips.filter(c => c.track !== 'video' && c.track !== 'audio' && c.track !== 'camada' && c.track !== 'sfx' && c.track !== 'music'),
                    ...clipsToSync,
                    ...extraClips,
                    audioClip
                ],
                totalDuration: Math.max(prev.totalDuration, totalAudioDuration)
            }, prev));
            
            addToast("Sincronização de uploads concluída!", "success");
            
        } catch (error: any) {
            console.error(error);
            addToast(`Erro na sincronização: ${error.message}`, "error");
        } finally {
            setMagicSyncLoading(false);
            setLoadingState(null);
        }
    };

    const handleSyncExistingClips = async (audioFile: File) => {
        setMagicSyncLoading(true);
        setLoadingState({ message: "Sincronizando clips existentes...", progress: 0 });
        
        try {
            // 1. Store and add audio
            const audioName = `magic_audio_${Date.now()}_${audioFile.name}`;
            await storeFileInDB(audioName, audioFile);
            const audioUrl = URL.createObjectURL(audioFile);
            const audioMeta = await getMediaMetadata(audioUrl, 'audio');
            
            const audioItem: MediaItem = {
                name: audioName,
                url: audioUrl,
                type: 'audio',
                duration: audioMeta.duration,
                isUserFile: true,
                hasAudio: true
            };
            
            addMediaToLibrary([audioItem]);
            
            // 2. Get existing video/image clips from the video track
            const existingClips = state.clips.filter(c => c.track === 'video');
            if (existingClips.length === 0) {
                throw new Error("Nenhum clipe de vídeo ou imagem encontrado na timeline. Por favor, adicione alguns vídeos ou imagens à linha do tempo antes de sincronizar.");
            }
            
            const totalAudioDuration = audioMeta.duration;
            const pattern = [8, 6, 3];
            let currentTimelineTime = 0;
            let patternIndex = 0;
            let clipIndex = 0;
            
            const syncedClips: Clip[] = [];
            
            while (currentTimelineTime < totalAudioDuration && syncedClips.length < 100) { // Safety break
                const targetDuration = pattern[patternIndex % pattern.length];
                const actualDuration = Math.min(targetDuration, totalAudioDuration - currentTimelineTime);
                
                const sourceClip = existingClips[clipIndex % existingClips.length];
                
                syncedClips.push({
                    ...sourceClip,
                    id: `synced_clip_${Date.now()}_${syncedClips.length}`,
                    start: currentTimelineTime,
                    duration: actualDuration,
                    properties: { ...sourceClip.properties, fit: 'contain' }
                });
                
                currentTimelineTime += actualDuration;
                patternIndex++;
                clipIndex++;
                
                if (currentTimelineTime >= totalAudioDuration) break;
            }
            
            // Add the audio clip
            const audioClip: Clip = {
                id: `magic_audio_clip_${Date.now()}`,
                fileName: audioName,
                type: 'audio',
                track: 'audio',
                start: 0,
                duration: totalAudioDuration,
                properties: { volume: 1, speed: 1 }
            };
            
            // Replace existing video clips with synced ones and add audio
            addToast("Gerando camadas de fundo, música e SFX...", "info");
            const { extraClips, extraMedia } = await generateSyncExtras(totalAudioDuration, "cinematic overlay");
            console.log(`[SyncExisting] Generated ${extraClips.length} extra clips`);
            
            const newMediaMap = { ...state.media };
            newMediaMap[audioName] = audioItem;
            extraMedia.forEach(m => newMediaMap[m.name] = m);

            setState(prev => pushHistory({
                ...prev,
                media: newMediaMap,
                clips: [
                    ...prev.clips.filter(c => c.track !== 'video' && c.track !== 'audio' && c.track !== 'camada' && c.track !== 'sfx' && c.track !== 'music'),
                    ...syncedClips,
                    ...extraClips,
                    audioClip
                ],
                totalDuration: Math.max(prev.totalDuration, totalAudioDuration)
            }, prev));
            
            addToast("Clips sincronizados com sucesso!", 'success');
        } catch (e: any) {
            console.error("Sync Existing Clips Error:", e);
            addToast(`Erro ao sincronizar: ${e.message}`, 'error');
        } finally {
            setMagicSyncLoading(false);
            setLoadingState(null);
        }
    };

    const handleAnalyzeScript = async (script: string): Promise<ScriptAnalysisResult> => { 
        setLoadingState({ message: "Criando Roteiro Mágico...", progress: null }); 
        try { 
            return await callGeminiSafe(async (ai) => {
                const energyParts = script.split('||ENERGY_HINT:');
            const styleParts = energyParts.length > 1 ? energyParts[1].split('||STYLE_HINT:') : [script, ''];
            const basePayload = energyParts[0];
            const energyHint = styleParts[0]?.trim(); 
            const durationParts = styleParts[1] ? styleParts[1].split('||DURATION_HINT:') : ['', ''];
            const styleHint = durationParts[0]?.trim();
            const modelParts = durationParts[1] ? durationParts[1].split('||MODEL_HINT:') : ['', 'gemini'];
            const durationHint = modelParts[0]?.trim() || '';
            const modelHint = modelParts[1]?.trim() || 'gemini';

            const isLongScript = basePayload.length > 5000 || durationHint === 'FULL_SCRIPT';
            const targetModel = isLongScript ? 'gemini-3.1-pro-preview' : 'gemini-3-flash-preview';

            let layoutInstruction = "";
            let pacingInstruction = "";

            if (energyHint === 'fast') {
                pacingInstruction = "PACING: FAST / VIRAL (TikTok Style). Short, punchy scenes (2-4 seconds).";
                layoutInstruction = "LAYOUT RULE: Use 'alternated cuts'. Frequently switch between 'fullscreen', 'overlay_pop' (which creates a 2-layer layered look), and 'impact_shake'. Ensure no two consecutive scenes have the same layout. Aim for a dynamic, multi-layered feel.";
            } else {
                pacingInstruction = "PACING: Cinematic / Documentary. Scenes should be 4-7 seconds.";
                layoutInstruction = "LAYOUT RULE: Mostly 'fullscreen'. Use 'overlay_pop' for at least 30% of the video to ensure it's not just a single layer of video. Occasionally use 'impact_shake' for emphasis.";
            }

            if (durationHint === 'FULL_SCRIPT') {
                pacingInstruction = `PACING: VERBATIM TRANSCRIPTION. You are a transcription machine. Take the input text and break it into scenes. DO NOT change any words. DO NOT summarize. DO NOT omit anything. Every single word from the input must appear in the 'narration' fields of the scenes, in the exact same order. This is NOT a creative task, it is a structural task. Break the text into chunks of roughly 40-60 words per scene to keep the JSON response manageable. Ignore all conventions about video length; if the text is long, generate as many scenes as needed.`;
            }

            const languageRule = `
            CRITICAL LANGUAGE INSTRUCTION:
            1. DETECT the language of the user's input (Topic, Text, or URL content).
            2. The generated 'narration' fields MUST be in the SAME LANGUAGE as the input (e.g., Portuguese, Spanish, English).
            3. The 'visual' fields MUST ALWAYS be in English (optimized for image generators).
            `;

            let systemInstruction = "You are a professional video director.";
            let userPrompt = basePayload;

            if (durationHint === 'FULL_SCRIPT') {
                systemInstruction = `You are a Transcription and Video Layout Specialist. ${pacingInstruction} ${layoutInstruction} ${languageRule} CRITICAL: Your primary goal is to preserve the input text exactly as it is. Do not summarize.`;
                userPrompt = `TEXT TO TRANSCRIBE INTO SCENES: "${basePayload.replace(/REMAKE_AS_MONOLOGUE:|GENERATE_PODCAST_TOPIC:|REMAKE_AS_DIALOGUE:/, '').trim()}"`;
            } else if (script.startsWith('REMAKE_AS_MONOLOGUE:')) {
                systemInstruction = `You are a Video Director. ${pacingInstruction} ${layoutInstruction} ${languageRule} CRITICAL: Use 'alternated cuts' and ensure at least 3 multi-layered scenes (overlay_pop) per minute of video.`;
                userPrompt = `SCRIPT/TOPIC: "${basePayload.replace('REMAKE_AS_MONOLOGUE:', '').trim()}"`;
            } else if (script.startsWith('GENERATE_PODCAST_TOPIC:') || script.startsWith('REMAKE_AS_DIALOGUE:')) {
                systemInstruction = `You are a Creative Director. Create a dialogue. ${pacingInstruction} ${layoutInstruction} ${languageRule} CRITICAL: Use 'alternated cuts' and ensure at least 3 multi-layered scenes (overlay_pop) per minute of video.`;
                 userPrompt = `TOPIC/CONTENT: "${basePayload.replace(/GENERATE_PODCAST_TOPIC:|REMAKE_AS_DIALOGUE:/, '').trim()}"`;
            } else {
                 systemInstruction = `You are a professional video director. Analyze the script. ${layoutInstruction} ${languageRule} CRITICAL: Use 'alternated cuts' and ensure at least 3 multi-layered scenes (overlay_pop) per minute of video.`;
            }

            // CHUNKING LOGIC FOR EXTREMELY LONG SCRIPTS (> 5000 words)
            const words = basePayload.trim().split(/\s+/);
            if (words.length > 4000 && durationHint === 'FULL_SCRIPT') {
                const chunkSize = 3000;
                const chunks: string[] = [];
                for (let i = 0; i < words.length; i += chunkSize) {
                    chunks.push(words.slice(i, i + chunkSize).join(' '));
                }

                addToast(`Processando roteiro em ${chunks.length} partes...`, 'info');
                
                let allScenes: any[] = [];
                let mood = "";
                let genre = "";
                let musicPrompt = "";
                let musicSearch = "";

                for (let i = 0; i < chunks.length; i++) {
                    setLoadingState({ message: `Analisando parte ${i + 1} de ${chunks.length}...`, progress: Math.round((i / chunks.length) * 100) });
                    
                    const chunkPrompt = `${systemInstruction} (PART ${i + 1} of ${chunks.length})
                    
                    Return STRICTLY a JSON object.
                    Structure: { "scenes": Array<Scene>, "mood": string, "genre": string, "musicPrompt": string, "musicSearch": string }
                    
                    Input Text to Transcribe: "${chunks[i]}"`;

                    const res = await ai.models.generateContent({
                        model: targetModel,
                        contents: [{ parts: [{ text: chunkPrompt }] }],
                        config: { responseMimeType: "application/json" }
                    });

                    const chunkResult = JSON.parse(res.text || "{}");
                    if (chunkResult.scenes) {
                        allScenes = [...allScenes, ...chunkResult.scenes];
                    }
                    if (i === 0) {
                        mood = chunkResult.mood;
                        genre = chunkResult.genre;
                        musicPrompt = chunkResult.musicPrompt;
                        musicSearch = chunkResult.musicSearch;
                    }
                }

                return {
                    scenes: allScenes,
                    mood,
                    genre,
                    musicPrompt,
                    musicSearch
                };
            }

            const prompt = `${systemInstruction}
            
            Return STRICTLY a JSON object. Do not include markdown formatting.
            Structure: {
              "scenes": Array<{ 
                  id: string, 
                  narration: string, 
                  visual: string, 
                  speaker?: string, 
                  sfxSearch: string, // Specific search term for a sound effect (e.g., "footsteps", "car engine", "birds").
                  layout: "fullscreen" | "overlay_pop" | "impact_shake"
              }>,
              "mood": string,
              "genre": string,
              "musicPrompt": string,
              "musicSearch": string
            }
            
            Input:
            ${userPrompt}`;

            let text = "";

            if (modelHint === 'gpt') {
                const gptKey = getGPTKey();
                if (!gptKey) throw new Error("API Key do OpenAI não configurada.");
                
                const res = await fetch(`${BACKEND_URL}/api/proxy/gpt`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${gptKey}`
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o',
                        messages: [{ role: 'user', content: prompt }],
                        response_format: { type: 'json_object' },
                        max_tokens: 4096
                    })
                });
                const data = await res.json();
                if (data.error) throw new Error(`OpenAI Error: ${data.error.message}`);
                text = data.choices[0].message.content;
            } else if (modelHint === 'claude') {
                const claudeKey = getClaudeKey();
                if (!claudeKey) throw new Error("API Key do Claude não configurada.");
                
                // Using proxy for Claude to avoid CORS issues if needed, or direct if allowed
                const res = await fetch(`${BACKEND_URL}/api/proxy/claude`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': claudeKey
                    },
                    body: JSON.stringify({
                        model: 'claude-3-5-sonnet-20240620',
                        max_tokens: 8192,
                        messages: [{ role: 'user', content: prompt }]
                    })
                });
                const data = await res.json();
                if (data.error) throw new Error(`Claude Error: ${data.error.message}`);
                text = data.content[0].text;
            } else {
                const response = await ai.models.generateContent({ 
                    model: targetModel, 
                    contents: [{ parts: [{ text: prompt }] }], 
                    config: { responseMimeType: "application/json" } 
                }); 
                text = response.text || "{}";
            }
            
            // ROBUST JSON PARSING: Find the first '{' and last '}'
            const firstBrace = text.indexOf('{');
            const lastBrace = text.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                text = text.substring(firstBrace, lastBrace + 1);
            }
            
            let parsed;
            try {
                parsed = JSON.parse(text);
            } catch (e) {
                console.error("JSON Parse failed, trying to sanitize", text);
                text = text.replace(/```json/g, '').replace(/```/g, '').trim();
                parsed = JSON.parse(text);
            }
            
            if (!parsed.scenes || !Array.isArray(parsed.scenes)) return { scenes: [] };
            
            return {
                scenes: parsed.scenes.map((s: any, i: number) => ({
                    id: s.id || `scene_${Date.now()}_${i}`,
                    narration: s.narration || "",
                    visual: s.visual || "Scene",
                    speaker: s.speaker,
                    sfxSearch: s.sfxSearch || "",
                    layout: s.layout || 'fullscreen'
                })),
                mood: parsed.mood,
                genre: parsed.genre,
                musicPrompt: parsed.musicPrompt,
                musicSearch: parsed.musicSearch
            };
        }, () => addToast("Quota excedida. Tentando com sua chave pessoal...", "info"));
    } catch (e: any) { 
            console.error("Analyze Error:", e);
            addToast(`Erro na análise: ${e.message}`, 'error'); 
            return { scenes: [] }; 
        } finally { 
            setLoadingState(null); 
        } 
    };
    
    const handleGenerateSceneMedia = async (scene: ScriptScene, voice: string, style: string, aspectRatio: string, source: string = 'gemini', narrator1Voice?: string, narrator2Voice?: string, characterDesc?: string, generateNarration: boolean = true): Promise<ScriptScene> => { 
        const updatedScene = { ...scene };
        
        return await callGeminiSafe(async (ai) => {
            // 1. VISUAL GENERATION / FETCHING (Isolated Try/Catch)
            try {
            let effectiveSource = source;
            if (source === 'mixed') {
                const sources = ['gemini', 'pexels_video', 'pixabay_video', 'pexels_image', 'pixabay_image'];
                // Use scene ID or index to pick a source consistently but varied
                const hash = scene.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                effectiveSource = sources[hash % sources.length];
                console.log(`[Magic Script] Mixed Source: Scene ${scene.id} using ${effectiveSource}`);
            }

            if (effectiveSource === 'gemini') {
                let imagePrompt = `${style} style. ${scene.visual}`;
                if (characterDesc) {
                    imagePrompt += ` Character details: ${characterDesc}. Maintain consistency.`;
                }

                const imgRes = await ai.models.generateContent({ 
                    model: 'gemini-2.5-flash-image', 
                    contents: { parts: [{ text: imagePrompt }] }, 
                    config: { imageConfig: { aspectRatio: aspectRatio as any } } 
                }); 
                
                let imgData: string | undefined;
                for (const part of imgRes.candidates?.[0]?.content?.parts || []) {
                    if ((part as any).inlineData?.data) {
                        imgData = (part as any).inlineData.data;
                        break;
                    }
                }
                if (imgData) updatedScene.imageUrl = `data:image/png;base64,${imgData}`;

            } else if (effectiveSource === 'pixabay_image' || effectiveSource === 'pixabay_video') {
                const url = await searchPixabayMedia(scene.visual, effectiveSource === 'pixabay_video' ? 'video' : 'image');
                if (url) updatedScene.imageUrl = url;
            } else if (effectiveSource === 'pexels_image') {
                const url = await searchPexelsImages(scene.visual);
                if (url) updatedScene.imageUrl = url;
            } else if (effectiveSource === 'pexels_video') {
                const url = await searchPexelsVideos(scene.visual, aspectRatio === '9:16' ? 'portrait' : 'landscape');
                if (url) updatedScene.imageUrl = url;
            } else if (effectiveSource === 'unsplash_image') {
                const url = await searchUnsplashImages(scene.visual);
                if (url) updatedScene.imageUrl = url;
            }
        } catch (e) {
            console.warn(`Visual generation failed for scene ${scene.id}`, e);
            updatedScene.error = "Erro na imagem";
        }
        
        // 2. AUDIO GENERATION (TTS) (Isolated Try/Catch)
        if (generateNarration) {
            try {
                const effectiveVoice = scene.speaker === 'narrator2' && narrator2Voice ? narrator2Voice : (narrator1Voice || voice);
                const voiceConfig = mapVoiceIdToGeminiName(effectiveVoice);
                
                // Consistency with handleGenerateTTS
                const fullPrompt = `Voice: ${voiceConfig.prompt}. Please read this text: ${scene.narration}`;

                const ttsData = await GeminiVideoService.generateTTS({
                    text: fullPrompt,
                    voice: voiceConfig.voice,
                    apiKey: getUserKey()
                });
                
                if (typeof ttsData === 'string') { 
                    const audioBytes = base64ToUint8Array(ttsData as string);
                    const blob = pcmToWav(audioBytes, 24000); 
                    updatedScene.audioUrl = URL.createObjectURL(blob); 
                    
                    const exactDuration = (audioBytes.length / 2) / 24000;
                    updatedScene.audioDuration = exactDuration; 
                } 
            } catch (e) {
                console.warn(`Audio generation failed for scene ${scene.id}`, e);
            }
        } else {
            // Default duration if no narration (e.g. user has their own audio)
            updatedScene.audioDuration = 5; 
        }
        
        return updatedScene; 
        }, () => addToast("Quota excedida. Tentando com sua chave pessoal...", "info"));
    };

    const handleAddScriptToTimeline = async (scenes: ScriptScene[], autoSubtitle?: boolean, subtitleStyleId?: string, bgMusicUrl?: string, generateNarration: boolean = true) => { 
        setLoadingState({ message: "Baixando e Organizando Cenas...", progress: null });

        try {
            const validScenes = scenes; 
            const processedClips: Clip[] = [];
            const newMediaItems: MediaItem[] = [];

            let currentTimelinePos = state.currentPlayheadTime;
            const timelineStart = currentTimelinePos;
            
            if (bgMusicUrl) {
                 const musicName = `bg_music_${Date.now()}.mp3`;
                 try {
                     console.log(`[Magic Sync] Downloading BG Music: ${bgMusicUrl}`);
                     const proxyUrl = `${BACKEND_URL}/api/proxy/media?url=${encodeURIComponent(bgMusicUrl)}`;
                     const musicRes = await fetch(proxyUrl);
                     if (!musicRes.ok) throw new Error(`HTTP error! status: ${musicRes.status}`);
                     const musicBlob = await musicRes.blob();
                     await storeFileInDB(musicName, musicBlob);
                     const localMusicUrl = URL.createObjectURL(musicBlob);
                     
                     const musicItem: MediaItem = {
                         name: musicName, url: localMusicUrl, type: 'audio', duration: 30, isUserFile: true, hasAudio: true
                     };
                     newMediaItems.push(musicItem);
                     
                     const totalDur = validScenes.reduce((acc, s) => acc + (s.audioDuration || 5), 0);
                     
                     const musicClip: Clip = {
                         id: `music_${Date.now()}`,
                         fileName: musicName,
                         type: 'audio',
                         track: 'music',
                         start: timelineStart,
                         duration: totalDur,
                         properties: { volume: 0.3, speed: 1 }
                     };
                     processedClips.push(musicClip);
                     console.log(`[Magic Sync] BG Music added to timeline: ${musicName}`);
                 } catch (e) {
                     console.warn("Failed to download background music", e);
                 }
            }

            for (let i = 0; i < validScenes.length; i++) {
                const s = validScenes[i];
                const timestamp = Date.now() + i; 

                setLoadingState({ message: `Preparando Cena ${i + 1} de ${validScenes.length}...`, progress: Math.round(((i) / validScenes.length) * 100) });

                let isVideo = false;
                let imgBlob: Blob;
                
                try {
                    if (s.imageUrl) {
                        isVideo = s.imageUrl.includes('pixabay.com/video') || s.imageUrl.includes('pexels.com/video') || s.imageUrl.endsWith('.mp4');
                        const imgRes = await fetch(s.imageUrl);
                        if (!imgRes.ok) throw new Error("Fetch failed");
                        imgBlob = await imgRes.blob();
                    } else {
                        throw new Error("No URL");
                    }
                } catch(e) {
                     imgBlob = await createPlaceholderImageBlob(s.visual || `Cena ${i+1}`);
                     isVideo = false;
                }

                let audioBlob: Blob | null = null;
                let duration = s.audioDuration || 5;

                if (generateNarration) {
                    try {
                        if (s.audioUrl) {
                            const audioRes = await fetch(s.audioUrl);
                             if (!audioRes.ok) throw new Error("Fetch failed");
                            audioBlob = await audioRes.blob();
                        } else {
                             throw new Error("No URL");
                        }
                    } catch(e) {
                        duration = Math.max(3, (s.narration?.length || 0) / 15);
                        audioBlob = createSilentAudioBlob(duration);
                    }
                }

                const visualType = isVideo ? 'video' : 'image';
                const imgName = `script_${visualType}_${timestamp}_${i}.${isVideo ? 'mp4' : 'png'}`;
                await storeFileInDB(imgName, imgBlob);
                const imgUrl = URL.createObjectURL(imgBlob);
                const imgItem: MediaItem = { name: imgName, url: imgUrl, type: visualType, duration: duration, isUserFile: true, thumbnail: imgUrl };
                newMediaItems.push(imgItem);

                if (generateNarration && audioBlob) {
                    const audioName = `script_audio_${timestamp}_${i}.wav`;
                    await storeFileInDB(audioName, audioBlob);
                    const audioUrl = URL.createObjectURL(audioBlob);
                    const audioItem: MediaItem = { name: audioName, url: audioUrl, type: 'audio', duration: duration, isUserFile: true, hasAudio: true };
                    newMediaItems.push(audioItem);

                    const audioClip: Clip = {
                        id: `audio_${Date.now()}_${i}`,
                        fileName: audioName,
                        type: 'audio',
                        track: 'narration',
                        start: currentTimelinePos,
                        duration: duration,
                        properties: { volume: 1, speed: 1 }
                    };
                    processedClips.push(audioClip);
                }

                if (s.layout === 'overlay_pop' && visualType === 'image') {
                    const bgClip: Clip = {
                        id: `sc_bg_${timestamp}_${i}`,
                        fileName: imgName,
                        type: visualType,
                        track: 'video',
                        start: currentTimelinePos,
                        duration: duration,
                        properties: { 
                            opacity: 1, 
                            volume: 0, 
                            speed: 1, 
                            transform: {x:0, y:0, scale:1.2, rotation:0},
                            fit: 'cover',
                            adjustments: { brightness: 0.4, contrast: 1, saturate: 1, hue: 0 }
                        },
                        effect: 'dreamy-blur'
                    };
                    processedClips.push(bgClip);

                    const fgClip: Clip = {
                        id: `sc_fg_${timestamp}_${i}`,
                        fileName: imgName,
                        type: visualType,
                        track: 'camada',
                        start: currentTimelinePos,
                        duration: duration,
                        properties: { 
                            opacity: 1, 
                            volume: 0, 
                            speed: 1, 
                            transform: {x:0, y:0, scale:0.85, rotation:0},
                            fit: 'contain',
                            textDesign: { 
                                animation: { in: 'pop-in' },
                                shadow: { x: 0, y: 10, blur: 20, color: 'rgba(0,0,0,0.5)' }
                            }
                        }
                    };
                    processedClips.push(fgClip);

                } else {
                    const videoClip: Clip = {
                        id: `sc_vid_${timestamp}_${i}`,
                        fileName: imgName,
                        type: visualType,
                        track: 'video',
                        start: currentTimelinePos,
                        duration: duration,
                        properties: { 
                            opacity: 1, volume: 1, speed: 1, 
                            transform: {x:0, y:0, scale:1, rotation:0}, 
                            fit: 'cover', 
                            movement: { type: s.layout === 'impact_shake' ? 'shake-hard' : 'kenBurns', config: {} } as any 
                        }
                    };
                    processedClips.push(videoClip);
                }
                
                if (s.sfxUrl) {
                    try {
                        console.log(`[Magic Sync] Downloading SFX for scene ${i}: ${s.sfxUrl}`);
                        const proxyUrl = `${BACKEND_URL}/api/proxy/media?url=${encodeURIComponent(s.sfxUrl)}`;
                        const sfxRes = await fetch(proxyUrl);
                        if (!sfxRes.ok) throw new Error(`HTTP error! status: ${sfxRes.status}`);
                        const sfxBlob = await sfxRes.blob();
                        const sfxName = `sfx_${timestamp}_${i}.mp3`;
                        await storeFileInDB(sfxName, sfxBlob);
                        const localSfxUrl = URL.createObjectURL(sfxBlob);
                        
                        const sfxItem: MediaItem = { name: sfxName, url: localSfxUrl, type: 'audio', duration: 2, isUserFile: true, hasAudio: true };
                        newMediaItems.push(sfxItem);

                        const sfxClip: Clip = {
                            id: `sfx_${timestamp}_${i}`,
                            fileName: sfxName,
                            type: 'audio',
                            track: 'sfx',
                            start: currentTimelinePos, 
                            duration: 2, 
                            properties: { volume: 0.6, speed: 1 }
                        };
                        processedClips.push(sfxClip);
                        console.log(`[Magic Sync] SFX added to timeline for scene ${i}`);
                    } catch (e) {
                        console.warn(`Failed to download SFX for scene ${i}`, e);
                    }
                }
                
                currentTimelinePos += duration;
            }

            const newMediaMap = { ...state.media };
            newMediaItems.forEach(m => newMediaMap[m.name] = m);

            // Ensure background music ends at the end of the last scene
            const finalTotalDuration = currentTimelinePos - timelineStart;
            const musicClip = processedClips.find(c => c.track === 'music' && c.start === timelineStart);
            if (musicClip) {
                musicClip.duration = finalTotalDuration;
                console.log(`[Magic Sync] Adjusted BG Music duration to: ${finalTotalDuration}s`);
            }

            setState(prev => pushHistory({
                ...prev,
                media: newMediaMap,
                clips: [...prev.clips, ...processedClips],
                currentPlayheadTime: currentTimelinePos, 
                totalDuration: Math.max(prev.totalDuration, currentTimelinePos)
            }));
            
            if (autoSubtitle && handleGenerateSubtitles) {
                setTimeout(() => {
                    handleGenerateSubtitles('all', subtitleStyleId).catch((e: any) => console.error("Auto subtitle failed", e));
                }, 500);
            }

            addToast("Roteiro Mágico aplicado com sucesso!", 'success');

        } catch (e: any) {
            console.error(e);
            addToast("Erro ao adicionar cenas: " + e.message, 'error');
        } finally {
            setLoadingState(null);
        }
    };
    
    // ... (rest of the file remains the same, updated Generative Fill, Magic Eraser, etc.)
    const handleGenerativeFill = async (prompt: string) => { 
        if (!state.selectedClipId) return; 
        setLoadingState({ message: "Generative Fill (Gemini)...", progress: null }); 
        try { 
            const clip = state.clips.find(c => c.id === state.selectedClipId)!; 
            const media = state.media[clip.fileName]; 
            const time = getClipCurrentTime(clip, state.currentPlayheadTime);
            const { data: base64, mimeType } = await blobUrlToBase64(media.url, time); 
            const ai = new GoogleGenAI({ apiKey: getUserKey() }); 
            
            const res = await ai.models.generateContent({ 
                model: 'gemini-2.5-flash-image', 
                contents: { 
                    parts: [
                        { inlineData: { data: base64, mimeType } }, 
                        { text: `Edit this image: ${prompt}. Return only the edited image.` } 
                    ] 
                } 
            }); 
            
            const dataPart = extractImageData(res); 
            if (dataPart) { 
                const blob = base64ToBlob(dataPart, 'image/png'); 
                const name = `genfill_${Date.now()}.png`; 
                await storeFileInDB(name, blob); 
                const url = URL.createObjectURL(blob); 
                const item: MediaItem = { name, url, type: 'image', duration: 8, isUserFile: true, thumbnail: url }; 
                
                setState(prev => pushHistory({ 
                    ...prev, 
                    media: { ...prev.media, [name]: item }, 
                    clips: prev.clips.map(c => c.id === state.selectedClipId ? { ...c, fileName: name, type: 'image' } : c) 
                })); 
                addToast("Edição Concluída!", 'success');
            } else {
                throw new Error("No image data returned.");
            }
        } catch (e: any) { 
            console.error(e);
            addToast("Erro Generative Fill: " + e.message, 'error'); 
        } finally { 
            setLoadingState(null); 
        } 
    };

    const handleGenerativeOverlay = async (prompt: string) => {
        if (!state.selectedClipId) return;
        setLoadingState({ message: "Generative Overlay (Gemini)...", progress: null });
        try {
            const clip = state.clips.find(c => c.id === state.selectedClipId)!;
            const media = state.media[clip.fileName];
            const time = getClipCurrentTime(clip, state.currentPlayheadTime);
            const { data: base64, mimeType } = await blobUrlToBase64(media.url, time);
            const ai = new GoogleGenAI({ apiKey: getUserKey() });

            const hasMask = maskPaths.length > 0;
            const maskText = hasMask ? "Focus on the highlighted area. " : "";

            const res = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: {
                    parts: [
                        { inlineData: { data: base64, mimeType } },
                        { text: `${maskText}Extract the subject and apply this change: ${prompt}. Return ONLY the modified subject on a transparent background. No background should be present.` }
                    ]
                }
            });

            const dataPart = extractImageData(res);
            if (dataPart) {
                const blob = base64ToBlob(dataPart, 'image/png');
                const name = `overlay_${Date.now()}.png`;
                await storeFileInDB(name, blob);
                const url = URL.createObjectURL(blob);
                const item: MediaItem = { name, url, type: 'image', duration: 5, isUserFile: true, thumbnail: url };
                
                const newClip: Clip = {
                    id: `overlay_${Date.now()}`,
                    fileName: name,
                    type: 'image',
                    track: 'camada',
                    start: state.currentPlayheadTime,
                    duration: 5,
                    properties: {
                        transform: { x: 0, y: 0, scale: 0.5, rotation: 0 },
                        opacity: 1
                    }
                };

                setState(prev => pushHistory({
                    ...prev,
                    media: { ...prev.media, [name]: item },
                    clips: [...prev.clips, newClip],
                    selectedClipId: newClip.id
                }));
                setMaskPaths([]);
                setActiveTool('cursor');
                addToast("Sobreposição Gerada!", 'success');
            } else {
                throw new Error("No image data returned.");
            }
        } catch (e: any) {
            console.error(e);
            addToast("Erro Generative Overlay: " + e.message, 'error');
        } finally {
            setLoadingState(null);
        }
    };

    const handleApplyMagicEraser = async () => { 
        if (!state.selectedClipId || maskPaths.length === 0) return; 
        setLoadingState({ message: "Magic Eraser (Gemini)...", progress: null }); 
        try { 
            const clip = state.clips.find(c => c.id === state.selectedClipId)!; 
            const media = state.media[clip.fileName]; 
            const time = getClipCurrentTime(clip, state.currentPlayheadTime);
            const { data: base64, mimeType } = await blobUrlToBase64(media.url, time); 
            const ai = new GoogleGenAI({ apiKey: getUserKey() }); 
            const res = await ai.models.generateContent({ 
                model: 'gemini-2.5-flash-image', 
                contents: { parts: [{ inlineData: { data: base64, mimeType } }, { text: "remove objects in highlighted areas" }] } 
            }); 
            
            const data = extractImageData(res);

            if (data) { 
                const blob = base64ToBlob(data, 'image/png'); 
                const name = `erased_${Date.now()}.png`; 
                await storeFileInDB(name, blob); 
                const url = URL.createObjectURL(blob); 
                const item: MediaItem = { name, url, type: 'image', duration: 5, isUserFile: true, thumbnail: url }; 
                setState(s => pushHistory({ 
                    ...s, 
                    media: { ...s.media, [name]: item }, 
                    clips: s.clips.map(c => c.id === state.selectedClipId ? { ...c, fileName: name, type: 'image' } : c) 
                })); 
                setMaskPaths([]); 
                setActiveTool('cursor'); 
                addToast("Objeto removido!", 'success');
            } else {
                throw new Error("No image data returned.");
            }
        } catch (e: any) { 
            console.error(e);
            addToast("Erro Magic Eraser: " + e.message, 'error'); 
        } finally { 
            setLoadingState(null); 
        } 
    };
    const handleGenerateSticker = async (prompt: string, style?: string, adaptToVideo?: boolean) => { 
        setLoadingState({ message: "Gerando Sticker 3D...", progress: null }); 
        try { 
            const ai = new GoogleGenAI({ apiKey: getUserKey() }); 
            const styleHint = style ? ` in ${style} style` : '';
            
            let parts: any[] = [];
            
            if (adaptToVideo && state.selectedClipId) {
                const clip = state.clips.find(c => c.id === state.selectedClipId);
                const media = clip ? state.media[clip.fileName] : null;
                if (media && clip) {
                    const time = getClipCurrentTime(clip, state.currentPlayheadTime);
                    const { data: base64, mimeType } = await blobUrlToBase64(media.url, time);
                    parts.push({ inlineData: { data: base64, mimeType } });
                    parts.push({ text: `Analyze this image from the video. Create a high-quality 3D sticker${styleHint} that complements this scene. The sticker should be: ${prompt}. White border, isolated on transparent-looking background, octane render, 4k.` });
                } else {
                    parts.push({ text: `Create a high-quality 3D sticker${styleHint}, white border, isolated on transparent-looking background, octane render, 4k, based on: ${prompt}` });
                }
            } else {
                parts.push({ text: `Create a high-quality 3D sticker${styleHint}, white border, isolated on transparent-looking background, octane render, 4k, based on: ${prompt}` });
            }

            const res = await ai.models.generateContent({ 
                model: 'gemini-2.5-flash-image', 
                contents: { parts }, 
                config: { imageConfig: { aspectRatio: "1:1" } } 
            }); 
            
            let data: string | undefined;
            for (const part of res.candidates?.[0]?.content?.parts || []) {
                if ((part as any).inlineData?.data) {
                    data = (part as any).inlineData.data;
                    break;
                }
            }

            if (data) { 
                const blob = base64ToBlob(data, 'image/png'); 
                const name = `sticker_${Date.now()}.png`; 
                await storeFileInDB(name, blob); 
                const url = URL.createObjectURL(blob); 
                const item: MediaItem = { name, url, type: 'image', duration: 5, isUserFile: true, thumbnail: url }; 
                addMediaToLibrary([item]); 
                addMediaItemToState(item, state.currentPlayheadTime, 'camada', { transform: { x: 0, y: 0, scale: 0.5, rotation: 0 } }); 
                addToast("Sticker gerado!", 'success');
            } else {
                throw new Error("Nenhuma imagem gerada pelo modelo.");
            }
        } catch (e: any) { 
            addToast(`Erro: ${e.message}`, 'error'); 
        } finally { 
            setLoadingState(null); 
        } 
    };

    const handleSmartBRoll = async (params: any) => { 
        setLoadingState({ message: "Smart B-Roll Inteligente...", progress: null }); 
        try { 
            const context = state.clips.map(c => state.media[c.fileName]?.name || '').filter(n => n).join(', ');
            const ai = new GoogleGenAI({ apiKey: getUserKey() }); 
            const res = await ai.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: `Analise este contexto de vídeo: "${context}". Gere 3 prompts curtos e visuais para imagens de B-Roll que complementem este vídeo. Retorne apenas um array JSON de strings em inglês.`,
                config: { responseMimeType: 'application/json' }
            });

            let text = '';
            for (const part of res.candidates?.[0]?.content?.parts || []) {
                if (part.text) text += part.text;
            }
            
            const prompts = JSON.parse(text || '[]');
            if (Array.isArray(prompts) && prompts.length > 0) {
                addToast(`Gerando ${prompts.length} B-Rolls...`, 'info');
                for (const p of prompts) {
                    await handleGenerateImage(p, '16:9');
                }
                addToast("B-Rolls gerados com sucesso!", 'success');
            } else {
                addToast("Não foi possível gerar sugestões de B-Roll.", 'info');
            }
        } catch (e: any) { 
            addToast("Erro no Smart B-Roll: " + e.message, 'error'); 
        } finally { 
            setLoadingState(null); 
        } 
    };

    const handleGeminiStyleTransfer = async (media: MediaItem, style: string, ratio: string) => { 
        setLoadingState({ message: "Aplicando Estilo AI...", progress: null }); 
        try { 
            const clip = state.clips.find(c => state.media[c.fileName]?.url === media.url);
            const time = clip ? getClipCurrentTime(clip, state.currentPlayheadTime) : 0;
            const { data: base64, mimeType } = await blobUrlToBase64(media.url, time); 
            const ai = new GoogleGenAI({ apiKey: getUserKey() }); 
            const res = await ai.models.generateContent({ 
                model: 'gemini-2.5-flash-image', 
                contents: { parts: [{ inlineData: { data: base64, mimeType } }, { text: `Transform this image into ${style} style. Maintain the original composition but apply the visual characteristics of ${style}.` }] }, 
                config: { imageConfig: { aspectRatio: ratio as any } } 
            }); 
            
            const data = extractImageData(res);

            if (data) { 
                const blob = base64ToBlob(data, 'image/png'); 
                const name = `style_${Date.now()}.png`; 
                await storeFileInDB(name, blob); 
                const url = URL.createObjectURL(blob); 
                const item: MediaItem = { name, url, type: 'image', duration: 5, isUserFile: true, thumbnail: url }; 
                addMediaToLibrary([item]); 
                addMediaItemToState(item); 
                addToast("Estilo aplicado!", 'success');
            } else {
                throw new Error("No image data returned.");
            }
        } catch (e: any) { 
            addToast(`Erro: ${e.message}`, 'error'); 
        } finally { 
            setLoadingState(null); 
        } 
    };
    const handleRegenerateSceneImage = async (s: ScriptScene, style: string, ratio: string, source?: string, characterDesc?: string): Promise<ScriptScene> => { const res = await handleGenerateSceneMedia(s, 'Kore', style, ratio, source, undefined, undefined, characterDesc); return res; };
    const handleEditSceneImage = async (s: ScriptScene, prompt: string): Promise<ScriptScene> => { 
        if (!s.imageUrl) return s; 
        try {
            const { data: b64, mimeType } = await blobUrlToBase64(s.imageUrl); 
            const ai = new GoogleGenAI({ apiKey: getUserKey() }); 
            const res = await ai.models.generateContent({ 
                model: 'gemini-2.5-flash-image', 
                contents: { parts: [{ inlineData: { data: b64, mimeType } }, { text: (prompt as string) }] } 
            }); 
            
            let data: string | undefined;
            for (const part of res.candidates?.[0]?.content?.parts || []) {
                if ((part as any).inlineData?.data) {
                    data = (part as any).inlineData.data;
                    break;
                }
            }
            if (data) s.imageUrl = `data:image/png;base64,${data}`; 
        } catch (e) {
            console.error("Error editing scene image:", e);
        }
        return s; 
    };

    const handleImportRemoteMedia = async (url: string, name: string, type: 'audio' | 'video' | 'image', targetTrack?: string) => {
        setLoadingState({ message: "Importando Mídia Remota...", progress: null });
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("Falha ao baixar mídia");
            const blob = await res.blob();
            
            // Check blob size to prevent empty/corrupt files from entering the system
            if (blob.size < 100) throw new Error("Arquivo remoto inválido ou vazio.");

            const fileName = `${Date.now()}_${name.replace(/[^a-z0-9.]/gi, '_')}`;
            await storeFileInDB(fileName, blob);
            const localUrl = URL.createObjectURL(blob);
            
            let duration = 5;
            let hasAudio = false;
            
            if (type === 'video' || type === 'audio') {
                const meta = await getMediaMetadata(localUrl, type);
                duration = meta.duration;
                hasAudio = meta.hasAudio;
            }
            
            const thumb = type === 'video' ? await getVideoThumbnail(new File([blob], fileName)) : (type === 'image' ? localUrl : undefined);

            const item: MediaItem = {
                name: fileName,
                url: localUrl,
                type,
                duration,
                isUserFile: true,
                thumbnail: thumb,
                hasAudio
            };
            
            addMediaToLibrary([item]);
            addMediaItemToState(item, state.currentPlayheadTime, targetTrack);
            addToast("Importado com sucesso!", "success");
        } catch (e: any) {
            addToast(`Erro na importação: ${e.message}`, "error");
        } finally {
            setLoadingState(null);
        }
    };

    const handleSearchFreesound = async (query: string): Promise<any[]> => {
        try {
            const keys = JSON.parse(localStorage.getItem('proedit_api_keys') || '{}');
            const apiKey = keys.freesoundKey || '';
            
            // Use backend proxy to avoid CORS and provide fallbacks if no key
            const res = await fetch(`${BACKEND_URL}/api/proxy/freesound?q=${encodeURIComponent(query)}&token=${apiKey}`);
            
            if (!res.ok) throw new Error("Falha na busca");
            const data = await res.json();
            return data.results || [];
        } catch (e) {
            console.error("Search Freesound Error:", e);
            // Return empty array to handle gracefully
            return [];
        }
    };

    const handleGeminiUpscale = async (clipId: string) => {
        const clip = state.clips.find(c => c.id === clipId);
        if (!clip) {
            addToast("Selecione um clipe para upscale.", 'info');
            return;
        }
        
        setLoadingState({ message: "Upscaling Image (Gemini)...", progress: null });
        try {
            const media = state.media[clip.fileName];
            if (!media) throw new Error("Media not found");
            
            const time = getClipCurrentTime(clip, state.currentPlayheadTime);
            const { data: base64, mimeType } = await blobUrlToBase64(media.url, time);
            
            const ai = new GoogleGenAI({ apiKey: getUserKey() });
            const res = await ai.models.generateContent({ 
                model: 'gemini-2.5-flash-image', 
                contents: { 
                    parts: [
                        { inlineData: { data: base64, mimeType } }, 
                        { text: "Upscale this image to 4k resolution, ensure high quality, sharp details, photorealistic" } 
                    ] 
                },
                config: {
                    imageConfig: { aspectRatio: "16:9" }
                }
            });
            
            const data = extractImageData(res);

            if (data) { 
                const blob = base64ToBlob(data, 'image/png'); 
                const name = `upscale_${Date.now()}.png`; 
                await storeFileInDB(name, blob); 
                const url = URL.createObjectURL(blob); 
                
                const item: MediaItem = { name: name, url, type: 'image', duration: 5, isUserFile: true, thumbnail: url }; 
                
                setState(prev => pushHistory({ 
                    ...prev, 
                    media: { ...prev.media, [name]: item }, 
                    clips: prev.clips.map(c => c.id === clipId ? { ...c, fileName: name, type: 'image' } : c) 
                })); 
                addToast("Upscale Concluído!", 'success');
            } else {
                throw new Error("No image data returned from Gemini");
            }
        } catch(e: any) {
            console.error(e);
            addToast(`Erro no Upscale: ${e.message}`, 'error');
        } finally {
            setLoadingState(null);
        }
    };

    // --- NEW: GEMINI BACKGROUND REMOVAL ---
    const handleGeminiRemoveBackground = async () => {
        if (!state.selectedClipId) return addToast("Selecione um clipe.", "error");

        const clip = state.clips.find(c => c.id === state.selectedClipId);
        if (!clip) return;

        setLoadingState({ message: "Removendo Fundo (Gemini)...", progress: null });
        try {
            const media = state.media[clip.fileName];
            if (!media) throw new Error("Mídia não encontrada.");

            const time = getClipCurrentTime(clip, state.currentPlayheadTime);
            const { data: base64, mimeType } = await blobUrlToBase64(media.url, time);
            const ai = new GoogleGenAI({ apiKey: getUserKey() });

            // Using gemini-2.5-flash-image
            const res = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: {
                    parts: [
                        { inlineData: { data: base64, mimeType } }, 
                        { text: "Remove the background from this image. Return ONLY the subject on a transparent background." }
                    ]
                }
            });

            const data = extractImageData(res);

            if (data) { 
                const blob = base64ToBlob(data, 'image/png'); 
                const name = `bg_removed_${Date.now()}.png`; 
                await storeFileInDB(name, blob); 
                const url = URL.createObjectURL(blob); 
                
                const item: MediaItem = { 
                    name: name, 
                    url, 
                    type: 'image', 
                    duration: clip.duration, // Keep original duration
                    isUserFile: true, 
                    thumbnail: url 
                };

                // REPLACE LOGIC
                setState(prev => pushHistory({ 
                    ...prev, 
                    media: { ...prev.media, [name]: item }, 
                    clips: prev.clips.map(c => c.id === state.selectedClipId ? { ...c, fileName: name, type: 'image' } : c) 
                }));
                addToast("Fundo Removido com Sucesso!", 'success');
            } else {
                throw new Error("No image data returned.");
            }

        } catch (e: any) {
            console.error(e);
            addToast("Erro ao remover fundo: " + e.message, 'error');
        } finally {
            setLoadingState(null);
        }
    };
    
    // --- UPDATED: HANDLE SYNC TRACK PROPERTIES ---
    // Fixes issue where "Apply Style to All" would erase text content of other clips
    const handleSyncTrackProperties = (sourceClipId: string, trackType: string) => {
        setState(prev => {
            const sourceClip = prev.clips.find(c => c.id === sourceClipId);
            if (!sourceClip) return prev;

            const updatedClips = prev.clips.map(c => {
                // Sync properties for clips of same track and type (Text/Subtitle)
                // Preserving the specific content (text) but copying design
                if (c.track === trackType && c.type === sourceClip.type && c.id !== sourceClipId) {
                    return {
                        ...c,
                        styleId: sourceClip.styleId, // Sync the font/template ID
                        properties: {
                            ...c.properties, // Keep target's core properties (start/duration/etc)
                            
                            // Explicitly overwrite visual properties from source
                            transform: { ...sourceClip.properties.transform } as any,
                            opacity: sourceClip.properties.opacity,
                            blendMode: sourceClip.properties.blendMode,
                            textDesign: JSON.parse(JSON.stringify(sourceClip.properties.textDesign || {})), 
                            effect: sourceClip.effect,

                            // CRITICAL FIX: Explicitly preserve the text content of the TARGET clip
                            text: c.properties.text 
                        }
                    };
                }
                return c;
            });
            return pushHistory({ ...prev, clips: updatedClips });
        });
        addToast("Estilo aplicado a todos os itens da trilha!", 'success');
    };

    useEffect(() => {
        const newDuration = calculateProjectDuration(state.clips);
        if (Math.abs(state.totalDuration - newDuration) > 0.01) {
            setState(s => ({ ...s, totalDuration: newDuration }));
        }
    }, [state.clips]);

    useEffect(() => {
        let animationFrame: number;
        let lastTime: number | null = null;
        const animate = (time: number) => {
            if (lastTime === null) { lastTime = time; animationFrame = requestAnimationFrame(animate); return; }
            const delta = (time - lastTime) / 1000;
            lastTime = time;
            setState(prev => {
                if (!prev.isPlaying) return prev;
                const newTime = prev.currentPlayheadTime + delta;
                if (newTime >= prev.totalDuration) return { ...prev, currentPlayheadTime: 0, isPlaying: false };
                return { ...prev, currentPlayheadTime: newTime };
            });
            animationFrame = requestAnimationFrame(animate);
        };
        if (state.isPlaying) animationFrame = requestAnimationFrame(animate);
        return () => { if (animationFrame) cancelAnimationFrame(animationFrame); };
    }, [state.isPlaying]);

    // Implement missing handleGenerateNarration
    const handleGenerateNarration = async (text: string, voice: string, targetClipId: string, style?: string, speed?: number, pitch?: number, autoSubtitle?: boolean, subtitleTemplateId?: string) => {
        // Since narration generation logic is essentially TTS but tracked differently or applied to specific clip context
        // reusing handleGenerateTTS logic or similar backend call.
        // For simplicity reusing handleGenerateTTS behavior but targeting the clip if needed in future logic.
        // The original code passed this to BrowserPanel which handles calling it.
        
        await handleGenerateTTS(text, voice, style, speed, pitch, autoSubtitle, subtitleTemplateId);
        
        // If we wanted to attach specifically to a clip ID, we'd do it here, but current TTS logic adds to timeline playhead.
        // Assuming user places playhead at start of clip.
    };
    
    // ... (JSX Return)
    return (
        <div className="flex flex-col h-screen overflow-hidden text-white font-sans selection:bg-purple-500/30" style={{ backgroundColor: state.backgroundColor }}>
             <Header 
                onNewProject={handleNewProject}
                onExport={handleHeaderExport}
                onSave={handleSaveProject}
                onLoad={handleLoadProjectData}
                onModalChange={(isOpen) => { /* Optional: disable shortcuts */ }}
             />
             
             {/* Hidden Input for Track Context Menu Import */}
             <input 
                type="file" 
                ref={trackInputRef} 
                className="hidden" 
                accept="video/*,image/*,audio/*"
                multiple 
                onChange={(e) => {
                    if (importTargetTrack) {
                        onImportHandler(e.target.files, undefined, importTargetTrack);
                    }
                    setImportTargetTrack(null);
                }} 
             />

             <div className="flex-1 flex overflow-hidden relative flex-col md:flex-row">
                
                {/* Mobile Preview Area */}
                <div className="md:hidden w-full h-[35vh] bg-black relative z-0 border-b border-zinc-800">
                    <PreviewPanel 
                        clips={state.clips}
                        mediaLibrary={state.media}
                        currentTime={state.currentPlayheadTime}
                        isPlaying={state.isPlaying}
                        totalDuration={state.totalDuration}
                        onTogglePlay={() => setState(s => ({ ...s, isPlaying: !s.isPlaying }))}
                        onUpdateClip={(id, updates) => setState(s => pushHistory({ ...s, clips: s.clips.map(c => c.id === id ? { ...c, ...updates } : c) }, s))}
                        selectedClipId={state.selectedClipId}
                        backgroundColor={state.backgroundColor}
                        backgroundImage={state.media['background']?.url}
                        projectAspectRatio={state.projectAspectRatio}
                        onSelectClip={(id) => setState(s => ({ ...s, selectedClipId: id }))}
                        activeTool={activeTool}
                        magicEraserBrushSize={magicEraserBrushSize}
                        maskPaths={maskPaths}
                        onDrawMagicEraser={(path, dims) => setMaskPaths(prev => [...prev, {points: path, dims}])}
                    />
                </div>

                {/* Desktop Layout */}
                <div className="hidden md:flex w-full h-full">
                    <div className="w-[360px] border-r border-zinc-800 bg-zinc-900/95 flex flex-col">
                        <BrowserPanel 
                            mediaLibrary={state.media}
                            clips={state.clips}
                            selectedClipId={state.selectedClipId}
                            backgroundImage={state.media['background']?.url} // Assumption for bg image
                            customFonts={[]}
                            onImport={onImportHandler}
                            onDragStart={(e, type, id, payload) => {
                                e.dataTransfer.setData('type', type);
                                e.dataTransfer.setData('id', id);
                                if(payload) e.dataTransfer.setData('payload', JSON.stringify(payload));
                            }}
                            onGenerateTTS={handleGenerateTTS}
                            onGenerateNarration={handleGenerateNarration}
                            onGenerateImage={handleGenerateImage}
                            onGenerateVideo={handleGenerateVideo}
                            onGenerateVeo={handleGenerateVeo}
                            onTransformWithAI={handleTransformWithAI}
                            onMagicSync={handleMagicSync}
                            onSmartMagicSync={handleSmartMagicSync}
                            onSyncExistingClips={handleSyncExistingClips}
                            onSyncUploadedVideos={handleSyncUploadedVideos}
                            magicSyncLoading={magicSyncLoading}
                            hasClips={state.clips.some(c => c.track === 'video')}
                            onPreviewTTS={handlePreviewTTS}
                            onChangeAspectRatio={(r) => setState(s => ({ ...s, projectAspectRatio: r }))}
                            currentAspectRatio={state.projectAspectRatio}
                            onChangeBackground={(c) => setState(s => ({ ...s, backgroundColor: c }))}
                            onSetBackgroundImage={(files) => { if(files?.[0]) onImportHandler(files, 'image'); }} // Simplified
                            onRemoveBackgroundImage={() => {}}
                            onSplit={handleSplit}
                            onDuplicate={handleDuplicate}
                            onDelete={handleDelete}
                            onDeleteMedia={(name) => {
                                setState(s => {
                                    const newMedia = {...s.media};
                                    delete newMedia[name];
                                    return {...s, media: newMedia};
                                });
                            }}
                            onReplace={onImportHandler} // Simplified replacement logic usually involves selected clip
                            onFreeze={handleFreeze}
                            onUpdateClip={(id, updates) => setState(s => ({ ...s, clips: s.clips.map(c => c.id === id ? { ...c, ...updates } : c) }))}
                            onBackendAction={handleBackendAction}
                            onOpenInspectorSection={setActiveInspectorSection}
                            onApplyResource={handleApplyResource}
                            onApplyToAll={handleApplyToAll}
                            onAddText={onAddTextHandler}
                            onUploadSubtitles={(files) => { /* handle subtitle upload */ }}
                            onUploadFont={(files) => { /* handle font upload */ }}
                            onSceneDetectAndSplit={handleSceneDetect}
                            onStartStyleTransfer={(file) => { /* style transfer logic */ }}
                            onAnalyzeScript={handleAnalyzeScript}
                            onGenerateSceneMedia={handleGenerateSceneMedia}
                            onRegenerateSceneImage={handleRegenerateSceneImage}
                            onEditSceneImage={handleEditSceneImage}
                            onAddScriptToTimeline={handleAddScriptToTimeline}
                            onBulkDelete={() => {}}
                            onGenerateSubtitles={handleGenerateSubtitles}
                            onFetchUrl={handleFetchUrl}
                            onTranscribeAudio={handleTranscribeAudio}
                            onSetActiveTool={setActiveTool}
                            onClearTimeline={handleClearTimeline}
                            onAutoBRoll={() => {}}
                            onRestoreBRoll={() => {}}
                            onAddToTimeline={(item) => addMediaItemToState(item, state.currentPlayheadTime)}
                            onGeminiStyleTransfer={handleGeminiStyleTransfer}
                            onImportRemoteMedia={handleImportRemoteMedia}
                            onSearchFreesound={handleSearchFreesound}
                            onGenerateMusic={handleGenerateMusic}
                            onGenerateSFX={(p, d) => handleBackendAction('generate-music', 'SFX', {prompt: p, duration: d}, {replace: false})}
                            onGenerativeFill={handleGenerativeFill}
                            onGenerativeOverlay={handleGenerativeOverlay}
                            onSmartBRoll={handleSmartBRoll}
                        />
                    </div>

                    {/* Center Preview */}
                    <div className="flex-1 flex flex-col min-w-0 bg-black relative">
                        <div className="flex-1 bg-black/50 relative overflow-hidden flex flex-col">
                            <PreviewPanel 
                                clips={state.clips}
                                mediaLibrary={state.media}
                                currentTime={state.currentPlayheadTime}
                                isPlaying={state.isPlaying}
                                totalDuration={state.totalDuration}
                                onTogglePlay={() => setState(s => ({ ...s, isPlaying: !s.isPlaying }))}
                                onUpdateClip={(id, updates) => setState(s => pushHistory({ ...s, clips: s.clips.map(c => c.id === id ? { ...c, ...updates } : c) }, s))}
                                selectedClipId={state.selectedClipId}
                                backgroundColor={state.backgroundColor}
                                backgroundImage={state.media['background']?.url}
                                projectAspectRatio={state.projectAspectRatio}
                                onSelectClip={(id) => setState(s => ({ ...s, selectedClipId: id }))}
                                activeTool={activeTool}
                                magicEraserBrushSize={magicEraserBrushSize}
                                maskPaths={maskPaths}
                                onDrawMagicEraser={(path, dims) => setMaskPaths(prev => [...prev, {points: path, dims}])}
                            />
                        </div>
                        <div className="h-[320px] border-t border-zinc-800 bg-zinc-900/95">
                            <TimelinePanel 
                                clips={state.clips}
                                mediaLibrary={state.media}
                                totalDuration={state.totalDuration}
                                currentTime={state.currentPlayheadTime}
                                pixelsPerSecond={state.pixelsPerSecond}
                                selectedClipId={state.selectedClipId}
                                selectedTransition={state.selectedTransition}
                                canUndo={state.historyIndex > 0}
                                canRedo={state.historyIndex < state.history.length - 1}
                                onSelectClip={(id) => setState(s => ({...s, selectedClipId: id}))}
                                onSelectTransition={(id) => setState(s => ({...s, selectedTransition: { clipId: id }}))}
                                onUpdateClip={(id, updates) => setState(s => pushHistory({ ...s, clips: s.clips.map(c => c.id === id ? { ...c, ...updates } : c) }))}
                                onTimeChange={(t) => setState(s => ({...s, currentPlayheadTime: t}))}
                                onDrop={(e, track, time) => {
                                     const type = e.dataTransfer.getData('type');
                                     // Handle drop logic
                                     if (type === 'media') {
                                         const name = e.dataTransfer.getData('id');
                                         const media = state.media[name];
                                         if (media) addMediaItemToState(media, time, track);
                                     }
                                }}
                                onSplit={handleSplit}
                                onDelete={handleDelete}
                                onDuplicate={handleDuplicate}
                                onUndo={handleUndo}
                                onRedo={handleRedo}
                                onDeepSync={async () => {
                                    if (!state.selectedClipId) {
                                        addToast("Selecione um clipe para aplicar o Deep-Sync Sensorial!", "info");
                                        return;
                                    }
                                    addToast("Deep-Sync Sensorial Ativado: Sincronizando vídeo com o ritmo do áudio...", "success");
                                    await handleBackendAction('deep-sync-real', 'Deep-Sync Sensorial', { intensity: 1.5 }, { replace: true });
                                }}
                                onMorpheus={async (style) => {
                                    if (!state.selectedClipId) {
                                        addToast("Selecione um clipe para aplicar a transformação Morpheus!", "info");
                                        return;
                                    }
                                    addToast(`Iniciando Reconstrução Neural Morpheus: Estilo ${style}...`, "success");
                                    await handleBackendAction('morpheus-real', `Morpheus: ${style}`, { style }, { replace: true });
                                }}
                                onChangeZoom={(z) => setState(s => ({...s, pixelsPerSecond: z}))}
                                onAutoTransitions={handleAutoRandomTransitions}
                                onExtractAudio={handleExtractAudio}
                                onDownloadClip={handleDownloadClip}
                                onUnifyImages={handleUnifyImages}
                                onUnifyAudio={handleUnifyAudio}
                                onImportToTrack={(track) => {
                                    setImportTargetTrack(track);
                                    trackInputRef.current?.click();
                                }}
                            />
                        </div>
                    </div>

                    {/* Right Inspector - Desktop */}
                    <div className="hidden md:block w-[320px] border-l border-zinc-800 bg-zinc-900/95 flex flex-col">
                        <InspectorPanel 
                            selectedClip={state.clips.find(c => c.id === (state.selectedTransition?.clipId || state.selectedClipId)) || null}
                            selectedTransition={state.selectedTransition}
                            activeSection={activeInspectorSection}
                            onUpdate={(updates) => {
                                const targetId = state.selectedTransition?.clipId || state.selectedClipId;
                                if (targetId) {
                                    setState(s => {
                                        const newClips = s.clips.map(c => {
                                            if (c.id !== targetId) return c;
                                            
                                            // Deep merge properties if present in updates
                                            const mergedClips = { ...c };
                                            
                                            if (updates.properties) {
                                                // Initialize properties if missing
                                                const currentProps = c.properties || {};
                                                const updateProps = updates.properties;
                                                
                                                // Create a fresh properties object
                                                const newProps = { ...currentProps };
                                                
                                                // Merge top-level keys
                                                Object.keys(updateProps).forEach(key => {
                                                    const val = (updateProps as any)[key];
                                                    const currentVal = (currentProps as any)[key];
                                                    
                                                    // If it's a nested object that we want to merge (like textDesign, transform, etc.)
                                                    if (val && typeof val === 'object' && !Array.isArray(val) && currentVal && typeof currentVal === 'object') {
                                                        (newProps as any)[key] = { ...currentVal, ...val };
                                                    } else {
                                                        (newProps as any)[key] = val;
                                                    }
                                                });
                                                
                                                mergedClips.properties = newProps;
                                            }

                                            // Merge other top-level fields (duration, start, transition, etc)
                                            Object.keys(updates).forEach(key => {
                                                if (key !== 'properties') {
                                                    (mergedClips as any)[key] = (updates as any)[key];
                                                }
                                            });
                                            
                                            return mergedClips;
                                        });
                                        return pushHistory({ ...s, clips: newClips }, s);
                                    });
                                }
                            }}
                            onSyncTrackProperties={handleSyncTrackProperties}
                            onBackendAction={handleBackendAction}
                            onAiColorGrade={(prompt) => handleBackendAction('color-grade-real', 'Color Grade', { prompt }, { replace: true })}
                            onClearActiveSection={() => setActiveInspectorSection(null)}
                            // ... pass other props
                            clips={state.clips}
                            mediaLibrary={state.media}
                            activeTool={activeTool}
                            onSetActiveTool={setActiveTool}
                            magicEraserBrushSize={magicEraserBrushSize}
                            onSetMagicEraserBrushSize={setMagicEraserBrushSize}
                            onApplyMagicEraser={handleApplyMagicEraser}
                            onClearMagicEraserMask={() => setMaskPaths([])}
                            onGeminiStyleTransfer={handleGeminiStyleTransfer}
                            onGenerativeFill={handleGenerativeFill}
                            onGenerativeOverlay={handleGenerativeOverlay}
                            onSmartBRoll={handleSmartBRoll}
                            onExtractAudio={() => state.selectedClipId && handleExtractAudio(state.selectedClipId)}
                            onImportRemoteMedia={handleImportRemoteMedia}
                            onGeminiRemoveBackground={handleGeminiRemoveBackground}
                            onGenerateVideo={handleGenerateVideo}
                            onGeminiUpscale={handleGeminiUpscale}
                            onGenerateSticker={handleGenerateSticker}
                            onProcessAiMorph={handleProcessAiMorph}
                            onGenerateSubtitles={handleGenerateSubtitles}
                            onAddText={onAddTextHandler}
                            onDownloadUnifiedClip={handleDownloadUnifiedClip}
                            onAutoTransitions={handleAutoRandomTransitions}
                        />
                    </div>
                </div>

                {/* Mobile Layout */}
                <MobileLayout 
                    mobileTab={mobileTab}
                    setMobileTab={setMobileTab}
                    state={state}
                    setState={setState}
                    handleUpdateClip={(id, updates) => setState(s => pushHistory({ ...s, clips: s.clips.map(c => c.id === id ? { ...c, ...updates } : c) }, s))}
                    handleSplit={handleSplit}
                    handleDelete={handleDelete}
                    handleDuplicate={handleDuplicate}
                    handleUndo={handleUndo}
                    handleRedo={handleRedo}
                    handleImport={onImportHandler}
                    handleGenerateImage={handleGenerateImage}
                    handleGenerateVideo={handleGenerateVideo}
                    handleGenerateTTS={handleGenerateTTS}
                    handleGenerateNarration={handleGenerateNarration}
                    handlePreviewTTS={handlePreviewTTS}
                    handleApplyResource={handleApplyResource}
                    handleApplyToAll={handleApplyToAll}
                    handleBackendAction={handleBackendAction}
                    addMediaItemToState={addMediaItemToState}
                    calculateProjectDuration={calculateProjectDuration}
                    withHistory={withHistory}
                    // Pass other necessary handlers explicitly
                    activeTool={activeTool}
                    setActiveTool={setActiveTool}
                    magicEraserBrushSize={magicEraserBrushSize}
                    setMagicEraserBrushSize={setMagicEraserBrushSize}
                    applyMagicEraser={handleApplyMagicEraser}
                    clearMagicEraserMask={() => setMaskPaths([])}
                    onGeminiStyleTransfer={handleGeminiStyleTransfer}
                    onGenerativeFill={handleGenerativeFill}
                    onGenerativeOverlay={handleGenerativeOverlay}
                    onSmartBRoll={handleSmartBRoll}
                    onTranscribeAudio={handleTranscribeAudio}
                    onRegenerateSceneImage={handleRegenerateSceneImage}
                    onEditSceneImage={handleEditSceneImage}
                    onDownloadClip={handleDownloadClip}
                    onExtractAudio={handleExtractAudio}
                    onAnalyzeScript={handleAnalyzeScript}
                    onGenerateSceneMedia={handleGenerateSceneMedia}
                    onAddScriptToTimeline={handleAddScriptToTimeline}
                    onSearchFreesound={handleSearchFreesound}
                    onImportRemoteMedia={handleImportRemoteMedia}
                    onGenerateSubtitles={handleGenerateSubtitles}
                    onGeminiRemoveBackground={handleGeminiRemoveBackground}
                    onGenerateVeo={handleGenerateVeo}
                    onMagicSync={handleMagicSync}
                    onSmartMagicSync={handleSmartMagicSync}
                    onSyncExistingClips={handleSyncExistingClips}
                    onSyncUploadedVideos={handleSyncUploadedVideos}
                    magicSyncLoading={magicSyncLoading}
                    hasClips={state.clips.some(c => c.track === 'video')}
                    onFetchUrl={handleFetchUrl}
                    // IMPORTANT: Pass the sync handler for MobileLayout usage
                    onSyncTrackProperties={handleSyncTrackProperties}
                    onGeminiUpscale={handleGeminiUpscale}
                    onClearTimeline={handleClearTimeline}
                    onAutoTransitions={handleAutoRandomTransitions}
                />
             </div>
             
             <LiveAssistant 
                onGenerateImage={handleGenerateImage}
                onChangeBackground={(c) => setState(s => ({ ...s, backgroundColor: c }))}
                onAddText={(t) => onAddTextHandler('default', { text: t } as any)}
             />

             {toasts.map((t, i) => (
                <Toast key={i} message={t.message} type={t.type} onClose={() => setToasts(p => p.filter((_, idx) => idx !== i))} />
             ))}

             {loadingState && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md">
                    <div className="bg-zinc-800 p-6 rounded-2xl flex flex-col items-center gap-4 border border-zinc-700 shadow-2xl">
                        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-white font-bold text-lg animate-pulse">{loadingState.message}</p>
                        {loadingState.progress !== null && (
                            <div className="w-64 h-2 bg-zinc-700 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${loadingState.progress}%` }}></div>
                            </div>
                        )}
                    </div>
                </div>
             )}
        </div>
    );
}

export default App;
