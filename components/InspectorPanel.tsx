
import React, { useState, useEffect, useRef } from 'react';
import { Clip, ClipProperties, Transition, KenBurnsConfig, MediaItem } from '../types';
import { RESOURCES, SPEED_PRESETS, IMAGE_STYLE_CATEGORIES, IMAGE_STYLES, BACKEND_URL, TEXT_RESOURCES } from '../constants';

interface InspectorPanelProps {
    selectedClip: Clip | null;
    selectedTransition: { clipId: string | null } | null;
    activeSection?: string | null;
    onUpdate: (updates: Partial<Clip> | any) => void;
    onBackendAction: (action: string, friendlyName: string, params?: Record<string, any>, options?: { replace?: boolean, extraFile?: File, extraFieldName?: string, apiKey?: string }) => void;
    onAiColorGrade: (prompt: string) => void;
    onTestGroupKey?: (key: string) => void;
    onClearActiveSection?: () => void;
    onSyncTrackProperties?: (sourceClipId: string, trackType: string) => void;
    onAutoBRoll?: () => void;
    onRestoreBRoll?: () => void;
    hasBRollBackup?: boolean;
    activeTool?: 'cursor' | 'magic-eraser';
    onSetActiveTool?: (tool: 'cursor' | 'magic-eraser') => void;
    magicEraserBrushSize?: number;
    onSetMagicEraserBrushSize?: (size: number) => void;
    onApplyMagicEraser?: () => void;
    onClearMagicEraserMask?: () => void;
    onGenerateMusic?: (prompt: string, duration: number) => void;
    onGenerateSFX?: (prompt: string, duration: number) => void;
    onGenerateSticker?: (prompt: string) => void;
    onAiDubbing?: (targetLanguage: string) => void;
    onAddText?: () => void;
    onImportRemoteMedia?: (url: string, name: string, type: 'audio' | 'video' | 'image', targetTrack?: string) => void;
    clips?: Clip[];
    mediaLibrary?: Record<string, MediaItem>;
    onDetectBackground?: (clipId: string) => Promise<string | null>;
    onGenerativeFill?: (prompt: string) => void;
    onGenerativeOverlay?: (prompt: string) => void;
    onSmartBRoll?: (params: { type: 'video' | 'image', density: 'low' | 'high' | 'medium', source: 'pexels' | 'gemini' }) => void;
    onMotionTrack?: (params: { description: string, targetClipId: string }) => void;
    onGeminiStyleTransfer?: (originalMedia: MediaItem, stylePrompt: string, targetAspectRatio: string) => void;
    onModalChange?: (isOpen: boolean) => void;
    onExtractAudio?: () => void;
    onGeminiUpscale?: (clipId: string) => void;
    onGenerateVideo?: (prompt: string, duration?: number) => Promise<void>;
    onGeminiRemoveBackground?: () => void;
    onAutoBeatSync?: (clipId: string, sensitivity: number, action: 'cut' | 'marker') => Promise<void>;
    onVisualTranslation?: (targetLanguage: string) => void;
    onTextToMotion?: (description: string) => void;
    onTransformWithAI?: (clipId: string, prompt: string) => void;
    onProcessAiMorph?: (clipId: string) => void;
    onGenerateSubtitles?: (scope: 'single' | 'all', templateId?: string) => void;
    onDownloadUnifiedClip?: (clip: any) => void;
    onAutoTransitions?: () => void;
}

type Tab = 'video' | 'audio' | 'speed';
type AudioEnhanceView = 'main' | 'isolate' | 'noise' | 'enhance';

const VIDEO_STYLE_CATEGORIES = {
    'Realismo & HDR': [
        { id: 'photorealistic', name: 'Fotorealista (Pro)', icon: 'fa-camera-retro' },
        { id: 'hdr_vivid', name: 'HDR Vívido', icon: 'fa-eye' },
        { id: 'unreal_engine', name: 'Unreal Engine 5', icon: 'fa-gamepad' },
        { id: 'cinematic_4k', name: 'Cinema 4K', icon: 'fa-film' },
        { id: 'national_geo', name: 'Doc. Natureza', icon: 'fa-leaf' },
        { id: 'gopro_action', name: 'GoPro Action', icon: 'fa-running' },
        { id: 'studio_lighting', name: 'Luz de Estúdio', icon: 'fa-lightbulb' },
        { id: 'bokeh_portrait', name: 'Retrato Bokeh', icon: 'fa-user-circle' },
    ],
    'Colorização': [
        { id: 'colorize-real', name: 'Colorir P&B', icon: 'fa-palette' }
    ]
};

const getMagicStyleIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('foto') || n.includes('real') || n.includes('4k')) return 'fa-camera';
    if (n.includes('cine') || n.includes('filme') || n.includes('movie')) return 'fa-film';
    if (n.includes('anime') || n.includes('mangá') || n.includes('cartoon') || n.includes('ghibli') || n.includes('disney') || n.includes('pixar')) return 'fa-user-ninja';
    return 'fa-image';
};

const MAGIC_IMAGE_STYLES = {
    'Estilos Mágicos (Gemini)': IMAGE_STYLES.map(style => ({
        id: style,
        name: style,
        icon: getMagicStyleIcon(style)
    })),
    'Populares': [
        { id: 'Cartoon 3D', name: 'Cartoon 3D', icon: 'fa-cube' },
        { id: 'Anime Style', name: 'Anime Style', icon: 'fa-dragon' },
        { id: 'Colorir P&B', name: 'Colorir P&B', icon: 'fa-palette' }
    ]
};

const ALL_FONTS_DRAFT = Object.values(RESOURCES.textStyles).reduce((acc: any[], category: any) => {
    return [...acc, ...Object.values(category)];
}, []);

const AVAILABLE_FONTS = Array.from(new Map(ALL_FONTS_DRAFT.map(f => [f.name, f])).values());

const AVAILABLE_TRANSITIONS = [
    { id: 'fade', name: 'Fade (Esmurecer)', icon: 'fa-adjust' },
    { id: 'crossfade', name: 'Dissolver', icon: 'fa-wind' },
    { id: 'slide-left', name: 'Slide Esq.', icon: 'fa-arrow-left' },
    { id: 'slide-right', name: 'Slide Dir.', icon: 'fa-arrow-right' },
    { id: 'slide-up', name: 'Slide Cima', icon: 'fa-arrow-up' },
    { id: 'slide-down', name: 'Slide Baixo', icon: 'fa-arrow-down' },
    { id: 'zoom-in', name: 'Zoom In', icon: 'fa-search-plus' },
    { id: 'zoom-out', name: 'Zoom Out', icon: 'fa-search-minus' },
    { id: 'blur', name: 'Desfoque', icon: 'fa-droplet' },
    { id: 'flash', name: 'Flash Branco', icon: 'fa-bolt-lightning' },
    { id: 'glitch', name: 'Glitch AI', icon: 'fa-bolt' },
    { id: 'pixelate', name: 'Pixalizar', icon: 'fa-cubes' },
    { id: 'shake', name: 'Tremer', icon: 'fa-hand-back-fist' },
    { id: 'rotate', name: 'Girar', icon: 'fa-sync' },
    { id: 'wipe-left', name: 'Limpar Esq.', icon: 'fa-chevron-left' },
    { id: 'wipe-right', name: 'Limpar Dir.', icon: 'fa-chevron-right' }
];

export const InspectorPanel: React.FC<InspectorPanelProps> = ({ 
    selectedClip, 
    selectedTransition, 
    activeSection,
    onUpdate, 
    onBackendAction,
    onAiColorGrade,
    onTestGroupKey,
    onClearActiveSection,
    onSyncTrackProperties,
    onAutoBRoll,
    onRestoreBRoll,
    hasBRollBackup,
    activeTool,
    onSetActiveTool,
    magicEraserBrushSize,
    onSetMagicEraserBrushSize,
    onApplyMagicEraser,
    onClearMagicEraserMask,
    onGenerateMusic,
    onGenerateSFX,
    onGenerateSticker,
    onAiDubbing,
    onAddText,
    onImportRemoteMedia,
    clips = [],
    mediaLibrary = {},
    onDetectBackground,
    onGenerativeFill,
    onGenerativeOverlay,
    onSmartBRoll,
    onMotionTrack,
    onGeminiStyleTransfer,
    onModalChange,
    onExtractAudio,
    onGeminiUpscale,
    onGenerateVideo,
    onGeminiRemoveBackground,
    onAutoBeatSync,
    onVisualTranslation,
    onTextToMotion,
    onTransformWithAI,
    onProcessAiMorph,
    onGenerateSubtitles,
    onDownloadUnifiedClip,
    onAutoTransitions
}) => {
    const [activeTab, setActiveTab] = useState<Tab>('video');

    // Auto-switch tab based on selection
    useEffect(() => {
        if (selectedClip) {
            if (selectedClip.type === 'text' || selectedClip.track === 'subtitle') {
                setActiveTab('video');
            } else if (selectedClip.type === 'audio') {
                setActiveTab('audio');
            }
        }
    }, [selectedClip?.id]);

    const [localActiveSection, setLocalActiveSection] = useState<string | null>(null);

    const [audioEnhanceView, setAudioEnhanceView] = useState<AudioEnhanceView>('main');
    const [isolateParams, setIsolateParams] = useState({ intensity: 75, mode: 'voice' });
    const [noiseParams, setNoiseParams] = useState({ intensity: 50 });
    const [enhanceParams, setEnhanceParams] = useState({ mode: 'clarity', intensity: 60 });
    const [aiColorPrompt, setAiColorPrompt] = useState('');

    const [showRemoveSilenceModal, setShowRemoveSilenceModal] = useState(false);
    const [silenceParams, setSilenceParams] = useState({ threshold: -30, duration: 0.5 });
    
    const [rotoscopeParams, setRotoscopeParams] = useState({ color: '#00FF00', similarity: 0.3, smoothness: 0.1, spill: 0.1 });
    const [showRotoscopeModal, setShowRotoscopeModal] = useState(false);
    const [isDetectingColor, setIsDetectingColor] = useState(false);

    const [showReframeModal, setShowReframeModal] = useState(false);
    const [reframeMode, setReframeMode] = useState<'crop' | 'blur'>('crop');
    const [reframeRatio, setReframeRatio] = useState('9:16');

    const [showCartoonModal, setShowCartoonModal] = useState(false);
    const [selectedStyleId, setSelectedStyleId] = useState<string>('');
    const [styleCategory, setStyleCategory] = useState<string>('');
    const [styleAspectRatio, setStyleAspectRatio] = useState<string>('16:9');
    const [customStylePrompt, setCustomStylePrompt] = useState<string>('');
    
    const activeStyleCategories: Record<string, { id: string, name: string, icon: string }[]> = (selectedClip?.type === 'image' ? MAGIC_IMAGE_STYLES : VIDEO_STYLE_CATEGORIES) as any;

    const [showFaceZoomModal, setShowFaceZoomModal] = useState(false);
    const [faceZoomParams, setFaceZoomParams] = useState({ mode: 'punch', interval: 5, intensity: 1.3 });
    const [showLipSyncModal, setShowLipSyncModal] = useState(false);
    const [lipSyncVoiceId, setLipSyncVoiceId] = useState('');
    const [showViralCutsModal, setShowViralCutsModal] = useState(false);
    const [viralCutsParams, setViralCutsParams] = useState({ count: 3, style: 'blur' });
    const [showSmartBRollModal, setShowSmartBRollModal] = useState(false);
    const [smartBRollParams, setSmartBRollParams] = useState<{ type: 'video' | 'image', density: 'low' | 'medium' | 'high', source: 'pexels' | 'gemini' }>({ type: 'video', density: 'medium', source: 'pexels' });
    const [showMotionTrackModal, setShowMotionTrackModal] = useState(false);
    const [motionTrackTarget, setMotionTrackTarget] = useState('');
    const [motionTrackOverlayId, setMotionTrackOverlayId] = useState('');
    const [showVoiceCloneModal, setShowVoiceCloneModal] = useState(false);
    const [isRecordingClone, setIsRecordingClone] = useState(false);
    const [cloneRecordingTime, setCloneRecordingTime] = useState(0);
    const [cloneAudioBlob, setCloneAudioBlob] = useState<Blob | null>(null);
    const [cloneAudioUrl, setCloneAudioUrl] = useState<string | null>(null);
    const [cloneText, setCloneText] = useState('');
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordingChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);
    const cloneAudioPreviewRef = useRef<HTMLAudioElement | null>(null);
    const [showMusicGenModal, setShowMusicGenModal] = useState(false);
    const [musicGenMode, setMusicGenMode] = useState<'generate' | 'freesound' | 'epidemic'>('generate');
    const [musicPrompt, setMusicPrompt] = useState('');
    const [musicDuration, setMusicDuration] = useState(10);
    const [showSFXModal, setShowSFXModal] = useState(false);
    const [sfxGenMode, setSfxGenMode] = useState<'generate' | 'freesound' | 'epidemic'>('generate');
    const [sfxPrompt, setSfxPrompt] = useState('');
    const [sfxDuration, setSfxDuration] = useState(2);
    const [showStickerModal, setShowStickerModal] = useState(false);
    const [stickerPrompt, setStickerPrompt] = useState('');
    const [showDubbingModal, setShowDubbingModal] = useState(false);
    const [dubbingLanguage, setDubbingLanguage] = useState('English');
    const [showAutoDuckingModal, setShowAutoDuckingModal] = useState(false);
    const [duckingParams, setDuckingParams] = useState({ threshold: 0.125, ratio: 2 });
    const [selectedVoiceClipId, setSelectedVoiceClipId] = useState<string>('');
    const [slowMotionParams, setSlowMotionParams] = useState({ speed: 0.5, mode: 'optical' });
    const [showYouTubeLibrary, setShowYouTubeLibrary] = useState(false);
    const [fsQuery, setFsQuery] = useState('');
    const [fsResults, setFsResults] = useState<any[]>([]);
    const [fsLoading, setFsLoading] = useState(false);
    const [fsActivePreview, setFsActivePreview] = useState<string | null>(null);
    const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
    const [epidemicQuery, setEpidemicQuery] = useState('');
    const [epidemicResults, setEpidemicResults] = useState<any[]>([]);
    const [epidemicLoading, setEpidemicLoading] = useState(false);
    const [epidemicActivePreview, setEpidemicActivePreview] = useState<string | null>(null);
    const [showGenerativeFillModal, setShowGenerativeFillModal] = useState(false);
    const [showGenerativeOverlayModal, setShowGenerativeOverlayModal] = useState(false);
    const [generativeFillPrompt, setGenerativeFillPrompt] = useState('');
    const [generativeOverlayPrompt, setGenerativeOverlayPrompt] = useState('');
    const [showVideoGenModal, setShowVideoGenModal] = useState(false);
    const [videoGenPrompt, setVideoGenPrompt] = useState('');
    const [videoGenLoading, setVideoGenLoading] = useState(false);
    const [isTransformMode, setIsTransformMode] = useState(false);
    const [visualTransLang, setVisualTransLang] = useState('English');
    const [textMotionPrompt, setTextMotionPrompt] = useState('');

    const isAnyModalOpen = showRemoveSilenceModal || showReframeModal || showCartoonModal || showFaceZoomModal || showLipSyncModal || showViralCutsModal || showSmartBRollModal || showMotionTrackModal || showVoiceCloneModal || showMusicGenModal || showSFXModal || showStickerModal || showDubbingModal || showAutoDuckingModal || showRotoscopeModal || showYouTubeLibrary || showGenerativeFillModal || showGenerativeOverlayModal || showVideoGenModal;

    useEffect(() => {
        onModalChange?.(isAnyModalOpen);
    }, [isAnyModalOpen, onModalChange]);

    useEffect(() => {
        if (activeSection) {
            setLocalActiveSection(activeSection);
            setActiveTab('video');
        }
    }, [activeSection]);

    useEffect(() => {
        setAudioEnhanceView('main');
        setShowRemoveSilenceModal(false);
        setCloneAudioBlob(null);
        setCloneAudioUrl(null);
        setIsRecordingClone(false);
        if(cloneAudioPreviewRef.current) { cloneAudioPreviewRef.current.pause(); cloneAudioPreviewRef.current = null; }
        
        const firstCategory = Object.keys(activeStyleCategories)[0];
        setStyleCategory(firstCategory);
        if (activeStyleCategories[firstCategory]) {
            const firstStyle = activeStyleCategories[firstCategory][0];
            if (firstStyle) setSelectedStyleId(firstStyle.id);
        }
        setStyleAspectRatio('16:9');

    }, [selectedClip?.id, selectedClip?.type]);

    useEffect(() => {
        if (showCartoonModal && selectedClip?.type === 'image') {
             const styleName = Object.values(activeStyleCategories).flat().find((s: any) => s.id === selectedStyleId)?.name || '';
             setCustomStylePrompt(styleName);
        }
    }, [selectedStyleId, showCartoonModal, selectedClip]);

    const handleSmartBRollSourceChange = (source: 'pexels' | 'gemini') => {
        if (source === 'gemini') {
            setSmartBRollParams(p => ({ ...p, source, type: 'image' }));
        } else {
            setSmartBRollParams(p => ({ ...p, source }));
        }
    };
    
    const startCloneRecording = async () => { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const mediaRecorder = new MediaRecorder(stream); mediaRecorderRef.current = mediaRecorder; recordingChunksRef.current = []; mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordingChunksRef.current.push(e.data); }; mediaRecorder.onstop = () => { const blob = new Blob(recordingChunksRef.current, { type: 'audio/webm' }); setCloneAudioBlob(blob); setCloneAudioUrl(URL.createObjectURL(blob)); stream.getTracks().forEach(track => track.stop()); }; mediaRecorder.start(); setIsRecordingClone(true); setCloneRecordingTime(0); timerRef.current = window.setInterval(() => { setCloneRecordingTime(prev => { if (prev >= 30) { stopCloneRecording(); return 30; } return prev + 1; }); }, 1000); } catch (e) { console.error("Mic Error:", e); alert("Erro ao acessar microfone."); } };
    const stopCloneRecording = () => { if (mediaRecorderRef.current && isRecordingClone) { mediaRecorderRef.current.stop(); setIsRecordingClone(false); if (timerRef.current) clearInterval(timerRef.current); } };
    const playClonePreview = () => { if (!cloneAudioUrl) return; if (cloneAudioPreviewRef.current) { cloneAudioPreviewRef.current.pause(); cloneAudioPreviewRef.current = null; } else { const audio = new Audio(cloneAudioUrl); cloneAudioPreviewRef.current = audio; audio.play(); audio.onended = () => { cloneAudioPreviewRef.current = null; }; } };
    const handleGenerateClone = () => { if (!cloneAudioBlob) return alert("Grave sua voz primeiro."); let apiKey = ''; try { const keys = JSON.parse(localStorage.getItem('proedit_api_keys') || '{}'); apiKey = keys.elevenLabsKey || ''; } catch (e) {} if (!apiKey && !confirm("Chave API da ElevenLabs não encontrada. A gravação será apenas salva na biblioteca. Deseja continuar?")) return; if (apiKey && !cloneText.trim()) return alert("Digite o texto para a voz clonada falar."); const audioFile = new File([cloneAudioBlob], "voice_sample.mp3", { type: "audio/mp3" }); onBackendAction('voice-clone', apiKey ? 'Clonagem Instantânea (AI)' : 'Salvar Gravação', { text: cloneText }, { extraFile: audioFile, extraFieldName: 'audio', apiKey: apiKey }); setShowVoiceCloneModal(false); };
    const searchFreesound = async () => { if (!fsQuery.trim()) return; setFsLoading(true); setFsResults([]); setFsActivePreview(null); if (audioPreviewRef.current) { audioPreviewRef.current.pause(); } try { const keys = JSON.parse(localStorage.getItem('proedit_api_keys') || '{}'); const apiKey = keys.freesoundKey; if (!apiKey) { alert("Configure a API Key do Freesound nas configurações (Config. API)."); setFsLoading(false); return; } const res = await fetch(`https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(fsQuery)}&fields=id,name,previews,duration,username&token=${apiKey}&page_size=10`); if (!res.ok) throw new Error("Falha na busca do Freesound"); const data = await res.json(); setFsResults(data.results || []); } catch (e) { console.error(e); alert("Erro ao buscar no Freesound."); } finally { setFsLoading(false); } };
    const searchEpidemic = async () => { if (!epidemicQuery.trim()) return; setEpidemicLoading(true); setEpidemicResults([]); setEpidemicActivePreview(null); if (audioPreviewRef.current) { audioPreviewRef.current.pause(); } try { const keys = JSON.parse(localStorage.getItem('proedit_api_keys') || '{}'); const apiKey = keys.epidemicApiKey; if (!apiKey) { alert("Configure a API Key do Epidemic Sound nas configurações (Config. API)."); setEpidemicLoading(false); return; } try { const res = await fetch(`${BACKEND_URL}/api/proxy/epidemic/search?term=${encodeURIComponent(epidemicQuery)}`, { headers: { 'x-epidemic-token': apiKey } }); if (!res.ok) throw new Error(`Status ${res.status}`); const data = await res.json(); const results = (data.data || data.tracks || []).map((t: any) => ({ id: t.id, name: t.title, artist: t.creators ? t.creators.map((c: any) => c.name).join(', ') : 'Unknown', duration: t.length || 0, previewUrl: t.audioUrl || t.previewUrl || (t.stems && t.stems.full && t.stems.full.url) })); setEpidemicResults(results); } catch (err: any) { console.error("Epidemic API Error:", err); alert(`Erro ao conectar com Epidemic Sound via Proxy.\n\nDetalhes do erro: ${err.message}`); } } catch (e) { console.error(e); alert("Erro geral ao buscar no Epidemic Sound."); } finally { setEpidemicLoading(false); } };
    const handlePreviewFreesound = (url: string) => { if (fsActivePreview === url) { if (audioPreviewRef.current) { audioPreviewRef.current.pause(); setFsActivePreview(null); } } else { if (audioPreviewRef.current) audioPreviewRef.current.pause(); const audio = new Audio(url); audioPreviewRef.current = audio; audio.play(); audio.onended = () => setFsActivePreview(null); setFsActivePreview(url); } };
    const handlePreviewEpidemic = (url: string) => { if (!url) return; if (epidemicActivePreview === url) { if (audioPreviewRef.current) { audioPreviewRef.current.pause(); setEpidemicActivePreview(null); } } else { if (audioPreviewRef.current) audioPreviewRef.current.pause(); const audio = new Audio(url); audioPreviewRef.current = audio; audio.play(); audio.onended = () => setEpidemicActivePreview(null); setEpidemicActivePreview(url); } };
    const handleImportFreesound = (result: any) => { if (!onImportRemoteMedia) return; const previewUrl = result.previews['preview-hq-mp3'] || result.previews['preview-lq-mp3']; if (previewUrl) { const track = showMusicGenModal ? 'music' : showSFXModal ? 'sfx' : 'audio'; onImportRemoteMedia(previewUrl, result.name, 'audio', track); setShowMusicGenModal(false); setShowSFXModal(false); } };
    const handleImportEpidemic = (result: any) => { if (!onImportRemoteMedia) return; if (result.previewUrl) { const track = showMusicGenModal ? 'music' : showSFXModal ? 'sfx' : 'audio'; onImportRemoteMedia(result.previewUrl, result.name, 'audio', track); setShowMusicGenModal(false); setShowSFXModal(false); } };
    const handleGenerateMusicClick = () => { 
        if (!musicPrompt.trim()) return alert("Digite um prompt para a música."); 
        if (onGenerateMusic) {
            onGenerateMusic(musicPrompt, musicDuration);
            setShowMusicGenModal(false);
            setMusicPrompt('');
            return;
        }
        let hfToken = '', pixabayKey = ''; 
        try { 
            const keys = JSON.parse(localStorage.getItem('proedit_api_keys') || '{}'); 
            hfToken = keys.huggingFaceToken || ''; 
            pixabayKey = keys.pixabayKey || ''; 
        } catch (e) {} 
        onBackendAction('generate-music', 'Music Gen', { prompt: musicPrompt, duration: musicDuration, hfToken: hfToken, pixabayKey: pixabayKey }, {replace: false}); 
        setShowMusicGenModal(false); 
        setMusicPrompt(''); 
    };
    const handleGenerateSFXClick = () => { 
        if (!sfxPrompt.trim()) return alert("Digite um prompt para o efeito sonoro."); 
        if (onGenerateSFX) {
            onGenerateSFX(sfxPrompt, sfxDuration);
            setShowSFXModal(false);
            setSfxPrompt('');
            return;
        }
        let hfToken = '', pixabayKey = ''; 
        try { 
            const keys = JSON.parse(localStorage.getItem('proedit_api_keys') || '{}'); 
            hfToken = keys.huggingFaceToken || ''; 
            pixabayKey = keys.pixabayKey || ''; 
        } catch (e) {} 
        onBackendAction('generate-music', 'SFX Gen', { prompt: sfxPrompt, duration: sfxDuration, hfToken: hfToken, pixabayKey: pixabayKey }, {replace: false}); 
        setShowSFXModal(false); 
        setSfxPrompt(''); 
    };
    const handleGenerateStickerClick = () => { if (onGenerateSticker && stickerPrompt.trim()) { onGenerateSticker(stickerPrompt); } else { if (!stickerPrompt.trim()) return alert("Descreva o sticker."); onBackendAction('stickerize-real', 'Sticker', {prompt: stickerPrompt}, {replace: false}); } setShowStickerModal(false); setStickerPrompt(''); };
    const handleDubbingClick = () => { let apiKey = ''; try { const keys = JSON.parse(localStorage.getItem('proedit_api_keys') || '{}'); apiKey = keys.elevenLabsKey || ''; } catch (e) {} if (!apiKey) return alert("Configure a API Key da ElevenLabs para usar a dublagem."); onBackendAction('ai-dubbing', `Dublagem (${dubbingLanguage})`, { targetLanguage: dubbingLanguage }, { replace: true, apiKey: apiKey }); setShowDubbingModal(false); };
    const handleAutoDuckingClick = () => { if (!selectedVoiceClipId) return alert("Selecione um clipe de voz para controlar o ducking."); onBackendAction('auto-ducking-real', 'Auto Ducking', { threshold: duckingParams.threshold, ratio: duckingParams.ratio, voiceClipId: selectedVoiceClipId }, { replace: true }); setShowAutoDuckingModal(false); };
    const handleLipSyncClick = () => { if (!lipSyncVoiceId) return alert("Selecione um áudio para sincronizar."); onBackendAction('lip-sync-real', 'Lip Sync AI', { voiceClipId: lipSyncVoiceId }, { replace: true }); setShowLipSyncModal(false); };
    const handleViralCutsClick = () => { onBackendAction('viral-cuts', 'Cortes Virais Automáticos', viralCutsParams, { replace: false }); setShowViralCutsModal(false); };
    const handleDetectColor = async () => { if (!selectedClip || !onDetectBackground) return; setIsDetectingColor(true); try { const detectedColor = await onDetectBackground(selectedClip.id); if (detectedColor) { setRotoscopeParams(prev => ({ ...prev, color: detectedColor })); } else { alert("Não foi possível detectar a cor do fundo. Tente selecionar uma cor manualmente."); } } catch (e) { console.error(e); alert("Erro ao detectar cor."); } finally { setIsDetectingColor(false); } };
    const handleAutoRotoscopeClick = () => { onBackendAction('rotoscope-real', 'Smart Cutout (AI)', rotoscopeParams, { replace: true }); setShowRotoscopeModal(false); };
    const handleSlowMotionClick = () => { const factor = 1 / slowMotionParams.speed; onBackendAction('interpolate-real', `Slow Motion (${factor}x)`, slowMotionParams, { replace: true }); };
    const handleApplyStyle = () => { const styleName = Object.values(activeStyleCategories).flat().find((s: any) => s.id === selectedStyleId)?.name || 'Custom'; if (selectedClip?.type === 'image' && onGeminiStyleTransfer && mediaLibrary) { const media = mediaLibrary[selectedClip.fileName]; if (media) { const effectiveStyle = customStylePrompt || selectedStyleId; onGeminiStyleTransfer(media, effectiveStyle, styleAspectRatio); setShowCartoonModal(false); return; } } onBackendAction('video-to-cartoon-real', styleName, { style: selectedStyleId, aspectRatio: styleAspectRatio }, { replace: true }); setShowCartoonModal(false); };
    const applyAudioPreset = (presetName: string, _filterComplex: string) => { const map: Record<string, string> = { "Robô": "robot", "Esquilo": "squirrel", "Monstro": "monster", "Eco": "echo", "Rádio": "radio" }; const id = map[presetName] || "robot"; onBackendAction('voice-fx-real', `Efeito de Voz: ${presetName}`, { preset: id }, { replace: true }); };
    const applySpeedPreset = (presetName: string) => { const presetData = (SPEED_PRESETS as any)[presetName]; if (presetData && presetData.points) { onUpdate({ properties: { ...selectedClip?.properties, speedCurve: { preset: presetName, points: presetData.points } } }); } };
    const handleRemoveSilenceClick = () => { onBackendAction('remove-silence-real', 'Removedor de Silêncio (Smart Jump Cuts)', silenceParams, { replace: true }); setShowRemoveSilenceModal(false); };
    const handleSmartBRollClick = () => { 
        if (!onSmartBRoll) return; 
        onSmartBRoll(smartBRollParams); 
        setShowSmartBRollModal(false); 
    };
    const handleMotionTrackClick = () => { 
        if (!onMotionTrack) return; 
        if (!motionTrackTarget.trim()) return alert("Descreva o objeto para rastrear."); 
        if (!motionTrackOverlayId) return alert("Selecione um elemento para aplicar o rastreamento."); 
        onMotionTrack({ description: motionTrackTarget, targetClipId: motionTrackOverlayId }); 
        setShowMotionTrackModal(false); 
    };
    const handleAutoReframeClick = () => { onBackendAction('auto-reframe-real', 'Auto Reframe', { mode: reframeMode, targetRatio: reframeRatio }, { replace: true }); setShowReframeModal(false); };
    
    const handleGenerateVideoClick = async () => {
        if (!videoGenPrompt.trim()) return;
        setVideoGenLoading(true);
        try {
            if (isTransformMode && onTransformWithAI && selectedClip) {
                await onTransformWithAI(selectedClip.id, videoGenPrompt);
            } else if (onGenerateVideo) {
                await onGenerateVideo(videoGenPrompt);
            }
            setShowVideoGenModal(false);
            setVideoGenPrompt('');
            setIsTransformMode(false);
        } catch (e: any) {
            alert(`Erro na geração de vídeo: ${e.message}`);
        }
        setVideoGenLoading(false);
    };

    const handleApplyTextTemplate = (templateId: string) => {
        const tpl = (TEXT_RESOURCES.templates as any[]).find(t => t.id === templateId);
        if (tpl) {
            onUpdate({
                styleId: tpl.styleId, 
                properties: {
                    ...selectedClip?.properties,
                    textDesign: {
                        ...selectedClip?.properties.textDesign,
                        ...tpl.design,
                        animation: tpl.design?.animation 
                    }
                }
            });
        }
    };

    const handleTextAnimationChange = (type: 'in' | 'out' | 'loop', animId: string) => {
        if (!selectedClip) return;
        const currentAnim = selectedClip.properties.textDesign?.animation || {};
        const newAnim = { ...currentAnim, [type]: animId === 'none' ? undefined : animId };
        
        onUpdate({
            properties: {
                ...selectedClip.properties,
                textDesign: {
                    ...selectedClip.properties.textDesign,
                    animation: newAnim
                }
            }
        });
    };
    
    // New handlers
    const handleAutoBeatSyncClick = async () => {
        if (!selectedClip || !onAutoBeatSync) return;
        try {
            // Using 0.5 as default beatSyncSensitivity
            await onAutoBeatSync(selectedClip.id, 0.5, 'cut'); 
        } catch (e) {
            console.error(e);
        }
    };
    
    const handleVisualTranslationClick = () => {
        if (onVisualTranslation) {
            onVisualTranslation(visualTransLang);
        }
    };
    
    const handleTextToMotionClick = () => {
        if (onTextToMotion && textMotionPrompt.trim()) {
            onTextToMotion(textMotionPrompt);
        }
    };

    const renderFreesoundSearch = () => (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="flex gap-2 mb-4">
                <input 
                    value={fsQuery}
                    onChange={(e) => setFsQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchFreesound()}
                    placeholder="Buscar som..."
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 text-xs text-white focus:border-blue-500 outline-none"
                />
                <button onClick={searchFreesound} disabled={fsLoading} className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 rounded text-xs transition-colors">
                    {fsLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-search"></i>}
                </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin">
                {fsResults.map(result => (
                    <div key={result.id} className="bg-zinc-900 p-2 rounded flex justify-between items-center group border border-zinc-800 hover:border-zinc-600">
                        <div className="min-w-0 flex-1 mr-2">
                            <div className="text-xs font-bold truncate text-gray-200">{result.name}</div>
                            <div className="text-[10px] text-gray-500">{result.username} • {result.duration.toFixed(1)}s</div>
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => handlePreviewFreesound(result.previews['preview-hq-mp3'] || result.previews['preview-lq-mp3'])} className={`w-6 h-6 rounded flex items-center justify-center ${fsActivePreview?.includes(result.id) ? 'bg-yellow-500 text-black' : 'bg-zinc-700 text-white hover:bg-zinc-600'}`}>
                                <i className={`fas ${fsActivePreview?.includes(result.id) ? 'fa-stop' : 'fa-play'} text-[10px]`}></i>
                            </button>
                            <button onClick={() => handleImportFreesound(result)} className="w-6 h-6 bg-blue-600 hover:bg-blue-500 text-white rounded flex items-center justify-center">
                                <i className="fas fa-plus text-[10px]"></i>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
    const renderEpidemicSearch = () => (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="bg-pink-900/20 border border-pink-700/50 p-2 rounded text-[10px] text-pink-200 mb-2 flex items-center gap-2">
                <i className="fas fa-crown text-pink-400"></i>
                <span>Biblioteca Premium (Epidemic Sound)</span>
            </div>
            <div className="flex gap-2 mb-4">
                <input 
                    value={epidemicQuery}
                    onChange={(e) => setEpidemicQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchEpidemic()}
                    placeholder="Buscar Epidemic..."
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 text-xs text-white focus:border-pink-500 outline-none"
                />
                <button onClick={searchEpidemic} disabled={epidemicLoading} className="bg-pink-600 hover:bg-pink-500 text-white px-3 rounded text-xs font-bold transition-colors">
                    {epidemicLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-search"></i>}
                </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin">
                {epidemicResults.map(result => (
                    <div key={result.id} className="bg-zinc-900 p-2 rounded flex justify-between items-center group border border-pink-900/30 hover:border-pink-500/50 transition-colors">
                        <div className="min-w-0 flex-1 mr-2">
                            <div className="text-xs font-bold truncate text-white">{result.name}</div>
                            <div className="text-[10px] text-pink-300">{result.artist} • {result.duration}s</div>
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => handlePreviewEpidemic(result.previewUrl)} className={`w-6 h-6 rounded flex items-center justify-center ${epidemicActivePreview === result.previewUrl ? 'bg-pink-500 text-white' : 'bg-zinc-700 text-gray-300 hover:bg-zinc-600'}`}>
                                <i className={`fas ${epidemicActivePreview === result.previewUrl ? 'fa-stop' : 'fa-play'} text-[10px]`}></i>
                            </button>
                            <button onClick={() => handleImportEpidemic(result)} className="w-6 h-6 bg-pink-600 hover:bg-pink-500 text-white rounded flex items-center justify-center">
                                <i className="fas fa-plus text-[10px]"></i>
                            </button>
                        </div>
                    </div>
                ))}
                {epidemicResults.length === 0 && !epidemicLoading && (
                    <div className="text-center text-gray-500 text-xs py-4">Digite para buscar... (Requer JWT)</div>
                )}
            </div>
        </div>
    );

    if (selectedTransition?.clipId) {
        const transition = selectedClip?.transition;
        return (
             <div className="h-full w-full flex flex-col bg-zinc-800">
                 <div className="p-4 border-b border-zinc-700 bg-zinc-900/50">
                    <h2 className="font-bold text-white flex items-center gap-2">
                        <i className="fas fa-random text-blue-500"></i>
                        Transição
                    </h2>
                 </div>
                 <div className="p-4 space-y-6 overflow-y-auto scrollbar-thin">
                     <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-3">Estilo da Transição</label>
                        <div className="grid grid-cols-2 gap-2">
                            {AVAILABLE_TRANSITIONS.map(t => (
                                <button 
                                    key={t.id}
                                    onClick={() => onUpdate({ transition: { id: t.id, duration: transition?.duration || 1.0 } })}
                                    className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${transition?.id === t.id ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-zinc-900 border-zinc-700 text-gray-400 hover:border-zinc-500'}`}
                                >
                                    <i className={`fas ${t.icon} ${transition?.id === t.id ? 'text-white' : 'text-blue-400'}`}></i>
                                    <div className="text-left">
                                        <div className="text-xs font-bold leading-none mb-1">{t.name}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                     </div>

                     {transition && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                            <div>
                                <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                                    <span>Duração</span>
                                    <span className="text-blue-400">{transition.duration.toFixed(1)}s</span>
                                </div>
                                <input 
                                    type="range" min="0.1" max="5" step="0.1"
                                    value={transition.duration}
                                    onChange={(e) => onUpdate({ transition: { ...transition, duration: parseFloat(e.target.value) } })}
                                    className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>

                            {transition.id === 'ai-morph' && (
                                <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-indigo-500/30 p-4 rounded-xl space-y-3">
                                    <h4 className="text-xs font-bold text-indigo-400 flex items-center gap-2">
                                        <i className="fas fa-wand-magic-sparkles"></i> MORPHING ENGINE (BETA)
                                    </h4>
                                    <p className="text-[10px] text-gray-400 leading-relaxed italic">
                                        "Analisa o último frame da cena anterior e o primeiro da próxima para criar uma transformação fluida via Veo 3.1."
                                    </p>
                                    
                                    {transition.videoUrl ? (
                                        <div className="space-y-2">
                                            <div className="aspect-video bg-black rounded-lg overflow-hidden border border-zinc-700">
                                                <video src={transition.videoUrl} className="w-full h-full object-cover" controls loop muted />
                                            </div>
                                            <button 
                                                onClick={() => onProcessAiMorph?.(selectedClip.id)}
                                                className="w-full py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-xs font-bold transition-all"
                                            >
                                                Regerar Morphing
                                            </button>
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={() => onProcessAiMorph?.(selectedClip.id)}
                                            disabled={transition.isGenerating}
                                            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-lg font-black text-xs shadow-xl flex items-center justify-center gap-2 transform active:scale-95 transition-all disabled:opacity-50"
                                        >
                                            {transition.isGenerating ? (
                                                <><i className="fas fa-spinner fa-spin"></i> PROCESSANDO...</>
                                            ) : (
                                                <><i className="fas fa-bolt"></i> Gerar Transição AI (Morph)</>
                                            )}
                                        </button>
                                    )}
                                </div>
                            )}

                            <button onClick={() => onUpdate({ transition: undefined })} className="w-full py-2.5 bg-zinc-700/50 hover:bg-red-900/40 hover:text-red-400 text-gray-400 rounded-lg text-xs font-bold transition-all border border-zinc-700 hover:border-red-900/50">
                                <i className="fas fa-trash mr-2"></i> Remover Transição
                            </button>
                        </div>
                     )}

                 </div>
             </div>
        );
    }

    if (!selectedClip) {
        return (
            <div className="h-full flex flex-col bg-zinc-800">
                <div className="p-4 border-b border-zinc-700 bg-zinc-900/50">
                    <h2 className="font-bold text-white flex items-center gap-2">
                        <i className="fas fa-info-circle text-blue-400"></i>
                        Inspetor
                    </h2>
                </div>
                <div className="flex-1 p-6 space-y-8 overflow-y-auto scrollbar-thin">
                    <div className="text-center py-4">
                        <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-700 shadow-inner">
                            <i className="fas fa-mouse-pointer text-zinc-600 text-xl"></i>
                        </div>
                        <p className="text-gray-400 text-sm mb-2 font-bold">Nenhum clipe selecionado</p>
                        <p className="text-[10px] text-gray-500 leading-relaxed px-4">
                            Selecione um elemento na timeline para ver suas propriedades ou adicione um novo abaixo.
                        </p>
                    </div>

                    {/* Quick Add Section - ALWAYS ACCESSIBLE */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-4 border-b border-zinc-800 pb-2">
                            Criar Elementos
                        </h3>
                        <div className="grid grid-cols-1 gap-3">
                            <button 
                                onClick={() => onAddText?.()}
                                className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-2xl font-black text-xs shadow-lg flex items-center justify-center gap-3 transition-all active:scale-95 group"
                            >
                                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <i className="fas fa-font"></i>
                                </div>
                                <div className="text-left">
                                    <div>NOVO TEXTO</div>
                                    <div className="text-[9px] opacity-70 font-normal">Adicione títulos e letreiros</div>
                                </div>
                            </button>

                            <button 
                                onClick={() => onGenerateSubtitles?.('all', 'modern-bold')}
                                className="w-full py-4 bg-zinc-900 hover:bg-zinc-700 border border-zinc-700 hover:border-blue-500 text-white rounded-2xl font-black text-xs shadow-lg flex items-center justify-center gap-3 transition-all active:scale-95 group"
                            >
                                <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <i className="fas fa-closed-captioning"></i>
                                </div>
                                <div className="text-left">
                                    <div className="text-blue-400">AUTO LEGENDAS (IA)</div>
                                    <div className="text-[9px] opacity-70 font-normal text-zinc-500">Transcrever todo o projeto</div>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* API Key Status / Management */}
                    <div className="pt-4 border-t border-zinc-800">
                        <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-4 border-b border-zinc-800 pb-2">
                            Sistema & API
                        </h3>
                        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 space-y-3">
                            <p className="text-[10px] text-gray-500">
                                Para usar Morphing IA e outros recursos avançados, certifique-se de que sua chave Gemini está ativa.
                            </p>
                            <button 
                                onClick={() => (window as any).aistudio?.openSelectKey?.()}
                                className="w-full py-2 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-2"
                            >
                                <i className="fas fa-key"></i> GERENCIAR CHAVE API
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const p = selectedClip.properties;

    const handleChange = (section: string, property: string, value: any) => {
        if (!selectedClip) return;
        const currentProps = { ...selectedClip.properties };
        if (section === 'top' || section === 'root') {
             if (section === 'top') {
                 onUpdate({ properties: { ...currentProps, [property]: value } });
             } else {
                 (currentProps as any)[property] = value;
                 onUpdate({ properties: currentProps });
             }
        } else {
             const sectionProps = (currentProps as any)[section] || {};
             const newSectionProps = { ...sectionProps, [property]: value };
             const newProps = { ...currentProps, [section]: newSectionProps };
             onUpdate({ properties: newProps });
        }
    };
    
    // Explicit definition of handleTextDesignChange
    const handleTextDesignChange = (prop: string, value: any) => {
         const currentDesign = p.textDesign || {};
         handleChange('textDesign', prop, value);
    };

    const renderSlider = (label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void, suffix = '') => (
        <div className="mb-3">
            <div className="flex justify-between text-xs text-gray-400 mb-1"><span>{label}</span><span>{typeof value === 'number' ? value.toFixed(step < 1 ? 2 : 0) : value}{suffix}</span></div>
            <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-1 bg-zinc-600 rounded-lg appearance-none cursor-pointer accent-blue-500" />
        </div>
    );

    const renderEnhanceButton = (icon: string, label: string, onClick: () => void, gradient = false) => (
         <button 
            onClick={onClick} 
            className={`flex items-center justify-center gap-2 p-2 rounded-lg text-white transition-all text-xs w-full shadow-md ${gradient ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500' : 'bg-zinc-700 hover:bg-zinc-600'}`}
        >
            <i className={`fas ${icon} text-sm`}></i>
            <span className="font-medium">{label}</span>
        </button>
    );

    return (
        <div className="h-full w-full flex flex-col bg-zinc-800">
            {/* Tabs */}
            <div className="flex border-b border-zinc-700">
                <button onClick={() => setActiveTab('video')} className={`flex-1 py-3 text-xs font-bold uppercase transition-colors ${activeTab === 'video' ? 'text-white border-b-2 border-blue-500 bg-zinc-700/30' : 'text-gray-500 hover:text-gray-300'}`}>Vídeo</button>
                <button onClick={() => setActiveTab('audio')} className={`flex-1 py-3 text-xs font-bold uppercase transition-colors ${activeTab === 'audio' ? 'text-white border-b-2 border-blue-500 bg-zinc-700/30' : 'text-gray-500 hover:text-gray-300'}`}>Áudio</button>
                <button onClick={() => setActiveTab('speed')} className={`flex-1 py-3 text-xs font-bold uppercase transition-colors ${activeTab === 'speed' ? 'text-white border-b-2 border-blue-500 bg-zinc-700/30' : 'text-gray-500 hover:text-gray-300'}`}>Speed</button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
                {activeTab === 'video' && (
                    <div className="space-y-6">
                        
                        {/* EDICAO DE TEXTO & LEGENDA - ALWAYS ACCESSIBLE */}
                        <div className="bg-zinc-900 border-2 border-green-500/50 rounded-2xl p-4 space-y-4 mb-4 shadow-lg shadow-green-500/10">
                            <h3 className="text-[11px] font-black text-green-400 uppercase tracking-[0.2em] flex items-center justify-between border-b border-zinc-800 pb-2">
                                <span className="flex items-center gap-2"><i className="fas fa-font text-green-500"></i> Edição de Texto & Legenda</span>
                                {(selectedClip.type === 'text' || selectedClip.track === 'subtitle') && (
                                    <span className="text-[9px] bg-green-500 text-black px-2 py-0.5 rounded-full font-black animate-pulse">EDITANDO AGORA</span>
                                )}
                            </h3>
                            
                            {(selectedClip.type === 'text' || selectedClip.track === 'subtitle') ? (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-1">
                                    {/* Template Selector */}
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 block mb-1">Modelo / Estilo</label>
                                        <select 
                                            onChange={(e) => handleApplyTextTemplate(e.target.value)}
                                            className="w-full bg-zinc-800 border border-zinc-700 rounded p-1.5 text-xs text-white"
                                            defaultValue=""
                                        >
                                            <option value="" disabled>Escolha um modelo...</option>
                                            {(TEXT_RESOURCES.templates as any[]).map(tpl => (
                                                <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    {/* Text Content */}
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 block mb-1">Conteúdo</label>
                                        <textarea 
                                            value={p.text} 
                                            onChange={(e) => handleChange('top', 'text', e.target.value)}
                                            className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-white resize-y min-h-[60px]"
                                        />
                                    </div>

                                    {/* Font Family */}
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 block mb-1">Fonte</label>
                                        <select 
                                            value={p.textDesign?.fontFamily || selectedClip.styleId || ''} 
                                            onChange={(e) => {
                                                handleTextDesignChange('fontFamily', e.target.value);
                                                onUpdate({ styleId: e.target.value });
                                            }}
                                            className="w-full bg-zinc-800 border border-zinc-700 rounded p-1.5 text-xs text-white"
                                        >
                                            <option value="">Padrão (Inter)</option>
                                            {(AVAILABLE_FONTS as any[]).map((font: any, idx: number) => (
                                                <option key={`${font.name}_${idx}`} value={font.name}>{font.name.replace('Font', '')}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Colors */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 block mb-1">Cor Texto</label>
                                            <div className="flex gap-2">
                                                <input type="color" value={p.textDesign?.color || '#ffffff'} onChange={(e) => handleTextDesignChange('color', e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent" />
                                                <input type="text" value={p.textDesign?.color || '#ffffff'} onChange={(e) => handleTextDesignChange('color', e.target.value)} className="flex-1 bg-zinc-800 rounded px-2 text-xs text-white border border-zinc-700" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 block mb-1">Cor Fundo</label>
                                            <div className="flex gap-2">
                                                <input type="color" value={p.textDesign?.backgroundColor || '#000000'} onChange={(e) => handleTextDesignChange('backgroundColor', e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent" />
                                                <button onClick={() => handleTextDesignChange('backgroundColor', 'transparent')} className="text-[10px] px-2 bg-zinc-700 rounded text-gray-300">None</button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Animation / Transitions for Text */}
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 block mb-1">Animação / Transição</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div>
                                                <span className="text-[9px] text-gray-500 block mb-1">Entrada</span>
                                                <select 
                                                    value={p.textDesign?.animation?.in || 'none'} 
                                                    onChange={(e) => handleTextAnimationChange('in', e.target.value)}
                                                    className="w-full bg-zinc-800 border border-zinc-700 rounded p-1 text-[10px] text-white"
                                                >
                                                    {(TEXT_RESOURCES.animations.in as any[]).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <span className="text-[9px] text-gray-500 block mb-1">Saída</span>
                                                <select 
                                                    value={p.textDesign?.animation?.out || 'none'} 
                                                    onChange={(e) => handleTextAnimationChange('out', e.target.value)}
                                                    className="w-full bg-zinc-800 border border-zinc-700 rounded p-1 text-[10px] text-white"
                                                >
                                                    {(TEXT_RESOURCES.animations.out as any[]).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <span className="text-[9px] text-gray-500 block mb-1">Loop</span>
                                                <select 
                                                    value={p.textDesign?.animation?.loop || 'none'} 
                                                    onChange={(e) => handleTextAnimationChange('loop', e.target.value)}
                                                    className="w-full bg-zinc-800 border border-zinc-700 rounded p-1 text-[10px] text-white"
                                                >
                                                    {(TEXT_RESOURCES.animations.loop as any[]).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Text Motion AI */}
                                    <div className="pt-2 border-t border-zinc-700 mt-2">
                                        <label className="text-[10px] font-bold text-purple-400 block mb-1 flex items-center gap-1">
                                            <i className="fas fa-wand-magic-sparkles"></i> Text-to-Motion (AI)
                                        </label>
                                        <div className="flex gap-2">
                                            <input 
                                                type="text" 
                                                value={textMotionPrompt} 
                                                onChange={(e) => setTextMotionPrompt(e.target.value)} 
                                                placeholder="Ex: Tremer de medo, pular de alegria..." 
                                                className="flex-1 bg-zinc-800 border border-zinc-700 rounded p-1.5 text-xs text-white" 
                                                onKeyDown={(e) => e.key === 'Enter' && handleTextToMotionClick()} 
                                            />
                                            <button onClick={handleTextToMotionClick} className="px-3 bg-purple-600 hover:bg-purple-500 rounded text-xs font-bold text-white">Animar</button>
                                        </div>
                                    </div>

                                    {/* Animações Gráficas Reativas */}
                                    <div className="pt-2 border-t border-zinc-700 mt-2 space-y-2">
                                        <label className="text-[10px] font-bold text-blue-400 block mb-1 uppercase tracking-widest flex items-center gap-2">
                                            <i className="fas fa-bolt"></i> Animações Gráficas Reativas
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button 
                                                onClick={() => handleChange('textDesign', 'isProgressBar', !p.textDesign?.isProgressBar)}
                                                className={`py-2 px-3 rounded text-[10px] font-bold flex items-center justify-center gap-2 border transition-all ${p.textDesign?.isProgressBar ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-zinc-800 border-zinc-700 text-gray-400'}`}
                                            >
                                                <i className="fas fa-tasks"></i> Barra Progresso
                                            </button>
                                            <button 
                                                onClick={() => handleChange('textDesign', 'isLowerThird', !p.textDesign?.isLowerThird)}
                                                className={`py-2 px-3 rounded text-[10px] font-bold flex items-center justify-center gap-2 border transition-all ${p.textDesign?.isLowerThird ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-zinc-800 border-zinc-700 text-gray-400'}`}
                                            >
                                                <i className="fas fa-id-card"></i> Terço inferior
                                            </button>
                                        </div>
                                        <p className="text-[8px] text-gray-500">Transforma este texto em um elemento que reage ao ritmo e tempo do vídeo.</p>
                                    </div>

                                    {/* Scale / Size */}
                                    {renderSlider('Tamanho (Escala)', p.transform?.scale || 1, 0.5, 3, 0.1, (v) => handleChange('transform', 'scale', v))}
                                    
                                    {/* Apply to All Button */}
                                    <button 
                                        onClick={() => onSyncTrackProperties?.(selectedClip.id, selectedClip.track)}
                                        className="w-full py-2 bg-green-600 hover:bg-green-500 text-white rounded text-xs font-bold flex items-center justify-center gap-2 shadow-lg mt-2"
                                        title="Aplica cor, fonte, tamanho e posição a todos os clipes desta trilha"
                                    >
                                        <i className="fas fa-copy"></i> Aplicar Estilo a Todas
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <p className="text-[10px] text-gray-400">Adicione elementos de texto ou legendas ao seu projeto.</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button 
                                            onClick={() => onAddText?.()}
                                            className="py-2.5 bg-green-600 hover:bg-green-500 text-white rounded text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-transform active:scale-95"
                                        >
                                            <i className="fas fa-plus"></i> Novo Texto
                                        </button>
                                        <button 
                                            onClick={() => {
                                                if (selectedClip.type === 'video' || selectedClip.type === 'audio') {
                                                    onGenerateSubtitles?.('single', 'modern-bold');
                                                } else {
                                                    onAddText?.();
                                                }
                                            }}
                                            className="py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-xs font-bold flex items-center justify-center gap-2 border border-zinc-600 transition-transform active:scale-95 group"
                                        >
                                            <i className="fas fa-closed-captioning group-hover:text-yellow-400"></i> Auto Legendas (IA)
                                        </button>
                                    </div>
                                    <p className="text-[9px] text-gray-500 italic">Dica: Selecione um clipe de texto na timeline para editar suas propriedades.</p>
                                </div>
                            )}
                        </div>


                        {/* 1. Smart Cutout (Auto Rotoscope via Gemini) */}
                        <div className="space-y-3 pb-4 border-b border-zinc-700">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                <i className="fas fa-user-slash text-purple-500"></i> Smart Cutout (Gemini)
                            </h3>
                            <button 
                                onClick={() => {
                                    if (selectedClip.type === 'image' && onGeminiRemoveBackground) {
                                        onGeminiRemoveBackground();
                                    } else {
                                        onBackendAction('remove-bg-real', 'Remover Fundo', {}, { replace: true });
                                    }
                                }}
                                className="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded text-xs font-bold shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
                            >
                                <i className="fas fa-magic"></i> Remover Fundo (AI)
                            </button>
                            <p className="text-[10px] text-gray-500 leading-tight">
                                {selectedClip.type === 'image' 
                                    ? "Usa o Gemini Vision para remover o fundo da imagem e criar transparência." 
                                    : "Remove automaticamente o fundo do vídeo (Requer backend/server-side)."}
                            </p>
                        </div>

                        {/* 2. IA Morpheus (Veo Engine) */}
                        <div className="space-y-3 pb-4 border-b border-zinc-700">
                            <h3 className="text-xs font-black text-cyan-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                <i className="fas fa-wand-magic-sparkles text-cyan-500"></i> IA Morpheus (Veo Engine)
                            </h3>
                            
                            {/* TRANSFORMAÇAO IA (VEO) - STANDALONE GENERATOR */}
                            <button 
                                onClick={async () => {
                                    if (selectedClip.type === 'image' || selectedClip.type === 'video') {
                                        setVideoGenPrompt(`Transform this scene into...`);
                                        setIsTransformMode(true);
                                        setShowVideoGenModal(true);
                                    }
                                }}
                                className="w-full py-4 bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-600 hover:from-indigo-500 hover:via-blue-500 hover:to-cyan-500 text-white rounded-2xl font-black text-[10px] shadow-2xl flex items-center justify-center gap-4 transition-all active:scale-95 group border border-white/10"
                            >
                                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center group-hover:rotate-[360deg] transition-transform duration-1000 shadow-inner">
                                    <i className="fas fa-microchip text-lg"></i>
                                </div>
                                <div className="text-left">
                                    <div className="text-[11px] font-black uppercase tracking-widest text-white shadow-sm">Transformação de IA</div>
                                    <div className="text-[9px] opacity-70 font-bold text-cyan-100">Criação Pura via Veo API</div>
                                </div>
                            </button>

                            <button 
                                onClick={onAutoTransitions}
                                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-blue-400 rounded-xl font-bold text-[10px] flex items-center justify-center gap-2 border border-blue-500/20 transition-all active:scale-95 shadow-lg"
                            >
                                <i className="fas fa-random text-blue-500"></i>
                                <span>TRANSICAO AUTOMATICA (ALEATÓRIA)</span>
                            </button>

                            <p className="text-[9px] text-zinc-500 leading-tight bg-zinc-900/50 p-2 rounded-lg border border-zinc-700/50">
                                <i className="fas fa-info-circle mr-1 text-cyan-500"></i> 
                                Esta ferramenta utiliza o motor de vídeo <b>Google Veo 3.1</b> para gerar novos fótons a partir da mídia selecionada. 
                                <span className="text-cyan-400/50 block mt-1 uppercase text-[8px] font-bold">Sem filtros FFMPEG legados.</span>
                            </p>
                            
                            {/* MAGIC ERASER PANEL */}
                            {activeTool === 'magic-eraser' ? (
                                <div className="bg-zinc-900 border border-pink-500/50 rounded-lg p-3 space-y-3 mb-2 animate-in fade-in">
                                    <h4 className="text-xs font-bold text-pink-400 flex items-center gap-2"><i className="fas fa-eraser"></i> Magic Eraser Ativo</h4>
                                    <p className="text-[10px] text-gray-400">Pinte sobre o objeto que deseja remover.</p>
                                    
                                    <div>
                                        <label className="text-xs text-gray-300 block mb-1">Tamanho da Borracha</label>
                                        <input 
                                            type="range" 
                                            min="5" max="100" 
                                            value={magicEraserBrushSize} 
                                            onChange={(e) => onSetMagicEraserBrushSize?.(parseInt(e.target.value))} 
                                            className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-pink-500" 
                                        />
                                    </div>

                                    <div className="flex gap-2">
                                        <button onClick={() => { onClearMagicEraserMask?.(); onSetActiveTool?.('cursor'); }} className="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-xs">Cancelar</button>
                                        <button onClick={onApplyMagicEraser} className="flex-1 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded text-xs font-bold shadow-md">Aplicar (Gemini)</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    {renderEnhanceButton('fa-eraser', 'Magic Eraser', () => onSetActiveTool?.('magic-eraser'))}
                                    {renderEnhanceButton('fa-arrow-up-right-dots', 'Upscale 4K', () => {
                                        if (selectedClip?.type === 'image' && onGeminiUpscale) {
                                            onGeminiUpscale(selectedClip.id);
                                        } else {
                                            onBackendAction('upscale-real', 'Upscale 4K', {}, { replace: true });
                                        }
                                    })}
                                    {/* New: Video Generator Button */}
                                    {renderEnhanceButton('fa-video', 'Gerar Vídeo', () => setShowVideoGenModal(true), true)}
                                    {renderEnhanceButton('fa-paint-brush', 'AI Style Lab', () => setShowCartoonModal(true))}
                                    {renderEnhanceButton('fa-sticky-note', 'Sticker 3D', () => setShowStickerModal(true), true)}
                                    {renderEnhanceButton('fa-expand-arrows-alt', 'Generative Fill', () => setShowGenerativeFillModal(true), false)}
                                    {renderEnhanceButton('fa-object-group', 'Generative Overlay', () => setShowGenerativeOverlayModal(true), true)}
                                    
                                    {/* Other Non-Gemini Image Tools moved or kept */}
                                    {renderEnhanceButton('fa-cut', 'Cortes Virais', () => setShowViralCutsModal(true), true)}
                                    {renderEnhanceButton('fa-crosshairs', 'Motion Track', () => setShowMotionTrackModal(true), true)}
                                    {renderEnhanceButton('fa-photo-film', 'Smart B-Roll', () => setShowSmartBRollModal(true), true)}
                                    {renderEnhanceButton('fa-crop', 'Auto Reframe', () => setShowReframeModal(true))}
                                    {renderEnhanceButton('fa-face-laugh', 'Lip Sync AI', () => setShowLipSyncModal(true))}
                                </div>
                            )}
                        </div>

                        {/* 3. Transição (Added for easier access) */}
                        <div className="space-y-4 pb-4 border-b border-zinc-700">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                                <span><i className="fas fa-random text-blue-500 mr-2"></i> Transição</span>
                                {selectedClip.transition && (
                                    <button onClick={() => onUpdate({ transition: undefined })} className="text-[10px] text-red-500 hover:text-red-400">Remover</button>
                                )}
                            </h3>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Escolha o Estilo</label>
                                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto scrollbar-thin pr-1">
                                        {AVAILABLE_TRANSITIONS.map(t => (
                                            <button 
                                                key={t.id}
                                                onClick={() => onUpdate({ transition: { id: t.id, duration: selectedClip.transition?.duration || 1.0 } })}
                                                className={`flex items-center gap-2 p-2 rounded border transition-all ${selectedClip.transition?.id === t.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-900 border-zinc-700 text-gray-400 hover:border-zinc-500'}`}
                                            >
                                                <i className={`fas ${t.icon} text-[10px] ${selectedClip.transition?.id === t.id ? 'text-white' : 'text-blue-400'}`}></i>
                                                <div className="text-left overflow-hidden">
                                                    <div className="text-[10px] font-bold truncate">{t.name}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {selectedClip.transition && (
                                    <div className="space-y-3 animate-in fade-in">
                                        {renderSlider('Duração', selectedClip.transition.duration, 0.1, 5, 0.1, (v) => {
                                            if (!selectedClip.transition) return;
                                            onUpdate({ transition: { ...selectedClip.transition, duration: v } });
                                        }, 's')}
                                        
                                        <div className="bg-zinc-900/50 p-2 rounded text-[9px] text-zinc-500 italic">
                                            Ajuste a duração da transição entre os clipes.
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 4. Transform & Layout (With detailed controls) */}
                        <details className="group" open={localActiveSection === 'transform' || activeSection === 'transform'}>
                            <summary className="flex items-center justify-between cursor-pointer py-2 text-xs font-bold text-gray-300 uppercase tracking-wider hover:text-white">
                                <span><i className="fas fa-arrows-alt mr-2 text-green-500"></i> Transformação</span>
                                <i className="fas fa-chevron-down group-open:rotate-180 transition-transform"></i>
                            </summary>
                            <div className="pt-2 space-y-3">
                                {renderSlider('Escala', p.transform?.scale || 1, 0.1, 5, 0.1, (v) => handleChange('transform', 'scale', v))}
                                {renderSlider('Posição X', p.transform?.x || 0, -1920, 1920, 10, (v) => handleChange('transform', 'x', v))}
                                {renderSlider('Posição Y', p.transform?.y || 0, -1080, 1080, 10, (v) => handleChange('transform', 'y', v))}
                                {renderSlider('Rotação', p.transform?.rotation || 0, -360, 360, 90, (v) => handleChange('transform', 'rotation', v), '°')}
                                
                                <div className="flex gap-2 mt-2">
                                    <button onClick={() => handleChange('top', 'mirror', !p.mirror)} className={`flex-1 py-1.5 rounded text-xs font-medium border transition-colors ${p.mirror ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-700 border-zinc-600 text-gray-300'}`}>Espelhar</button>
                                    <button onClick={() => handleChange('top', 'fit', p.fit === 'contain' ? 'cover' : 'contain')} className="flex-1 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-xs font-medium text-gray-300 border border-zinc-600">{p.fit === 'contain' ? 'Preencher' : 'Ajustar'}</button>
                                </div>
                            </div>
                        </details>

                        {/* 5. Opacity & Blending */}
                        <details className="group mt-4" open={localActiveSection === 'opacity' || activeSection === 'opacity'}>
                            <summary className="flex items-center justify-between cursor-pointer py-2 text-xs font-bold text-gray-300 uppercase tracking-wider hover:text-white">
                                <span><i className="fas fa-adjust mr-2 text-gray-400"></i> Opacidade & Mistura</span>
                                <i className="fas fa-chevron-down group-open:rotate-180 transition-transform"></i>
                            </summary>
                            <div className="pt-2 space-y-3">
                                {renderSlider('Opacidade', (p.opacity ?? 1) * 100, 0, 100, 1, (v) => handleChange('top', 'opacity', v / 100), '%')}
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Modo de Mistura</label>
                                    <select value={p.blendMode || 'normal'} onChange={(e) => handleChange('top', 'blendMode', e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded p-1.5 text-xs text-white outline-none focus:border-blue-500">
                                        <option value="normal">Normal</option>
                                        <option value="screen">Screen (Tela)</option>
                                        <option value="multiply">Multiply (Multiplicar)</option>
                                        <option value="overlay">Overlay (Sobrepor)</option>
                                        <option value="darken">Darken (Escurecer)</option>
                                        <option value="lighten">Lighten (Clarear)</option>
                                        <option value="difference">Difference (Diferença)</option>
                                    </select>
                                </div>
                            </div>
                        </details>

                        {/* 6. Masking */}
                        <details className="group mt-4" open={localActiveSection === 'mask' || activeSection === 'mask'}>
                            <summary className="flex items-center justify-between cursor-pointer py-2 text-xs font-bold text-gray-300 uppercase tracking-wider hover:text-white">
                                <span><i className="fas fa-mask mr-2 text-pink-500"></i> Máscara</span>
                                <i className="fas fa-chevron-down group-open:rotate-180 transition-transform"></i>
                            </summary>
                            <div className="pt-2 grid grid-cols-4 gap-2">
                                {['none', 'circle', 'rectangle', 'heart', 'star'].map(shape => (
                                    <button key={shape} onClick={() => handleChange('mask', 'shape', shape)} className={`aspect-square rounded border flex flex-col items-center justify-center gap-1 hover:bg-zinc-700 ${p.mask?.shape === shape ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-zinc-800 border-zinc-700 text-gray-400'}`}>
                                        <div className={`w-4 h-4 bg-current ${shape === 'circle' ? 'rounded-full' : shape === 'rectangle' ? 'rounded-sm' : 'rounded-none'}`} style={{ clipPath: shape === 'heart' ? 'polygon(50% 0%, 100% 38%, 82% 100%, 50% 100%, 18% 100%, 0% 38%)' : undefined }}></div>
                                        <span className="text-[9px] capitalize">{shape}</span>
                                    </button>
                                ))}
                            </div>
                        </details>

                        {/* 7. Adjustments (Color) */}
                        <details className="group mt-4" open={localActiveSection === 'adjustments' || activeSection === 'adjustments'}>
                            <summary className="flex items-center justify-between cursor-pointer py-2 text-xs font-bold text-gray-300 uppercase tracking-wider hover:text-white">
                                <span><i className="fas fa-sun mr-2 text-yellow-500"></i> Ajustes de Cor</span>
                                <i className="fas fa-chevron-down group-open:rotate-180 transition-transform"></i>
                            </summary>
                            <div className="pt-2 space-y-3">
                                {renderSlider('Brilho', p.adjustments?.brightness || 1, 0, 2, 0.1, (v) => handleChange('adjustments', 'brightness', v))}
                                {renderSlider('Contraste', p.adjustments?.contrast || 1, 0, 2, 0.1, (v) => handleChange('adjustments', 'contrast', v))}
                                {renderSlider('Saturação', p.adjustments?.saturate || 1, 0, 2, 0.1, (v) => handleChange('adjustments', 'saturate', v))}
                                {renderSlider('Matiz', p.adjustments?.hue || 0, -180, 180, 10, (v) => handleChange('adjustments', 'hue', v), '°')}
                                <div className="pt-2 border-t border-zinc-700">
                                    <input value={aiColorPrompt} onChange={e => setAiColorPrompt(e.target.value)} placeholder="Ex: Cinematic Blue, Matrix Green..." className="w-full bg-zinc-900 border border-zinc-700 rounded p-1.5 text-xs text-white mb-2" />
                                    <button onClick={() => onAiColorGrade(aiColorPrompt)} className="w-full py-1.5 bg-gradient-to-r from-orange-500 to-red-500 rounded text-xs font-bold text-white">Auto Color Match (AI)</button>
                                </div>
                            </div>
                        </details>
                    </div>
                )}

                {activeTab === 'audio' && (
                    <div className="space-y-6">
                        {selectedClip.children && selectedClip.children.length > 0 && (
                            <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-xl space-y-2 mb-2 animate-in slide-in-from-top-2">
                                <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                                    <i className="fas fa-layer-group"></i> Unificar Sonora e Baixar
                                </h4>
                                <p className="text-[9px] text-zinc-500 leading-relaxed">
                                    Crie um arquivo de áudio físico (sonora) a partir de todos os clipes unificados para download.
                                </p>
                                <button 
                                    onClick={() => onDownloadUnifiedClip?.(selectedClip)}
                                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xs shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
                                >
                                    <i className="fas fa-download"></i> Baixar Sonora Mixada
                                </button>
                            </div>
                        )}
                        <div className="bg-indigo-900/40 border border-indigo-400/30 p-4 rounded-xl space-y-2 mb-2 animate-in slide-in-from-top-2">
                             <div className="flex justify-between items-center">
                                 <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                     <i className="fas fa-wave-square"></i> Deep-Sync Sensorial
                                 </span>
                                 <button 
                                     onClick={() => handleChange('top', 'audioDeepSync', !(p as any).audioDeepSync)}
                                     className={`w-10 h-5 rounded-full transition-all relative ${(p as any).audioDeepSync ? 'bg-indigo-500' : 'bg-zinc-700'}`}
                                 >
                                     <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${(p as any).audioDeepSync ? 'left-6' : 'left-1'}`} />
                                 </button>
                             </div>
                             <p className="text-[9px] text-zinc-500 mb-2">Sincroniza visual e batida em tempo real.</p>
                             <button 
                                 onClick={() => onBackendAction('deep-sync-real', 'Deep-Sync AI', { intensity: 1.0 }, { replace: true })}
                                 className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
                             >
                                 <i className="fas fa-microchip"></i> PROCESSAR DEEP-SYNC AGORA
                             </button>
                        </div>
                        <div className="flex gap-1 bg-zinc-900 p-1 rounded-lg">
                            {['main', 'isolate', 'noise', 'enhance'].map(view => (
                                <button key={view} onClick={() => setAudioEnhanceView(view as any)} className={`flex-1 py-1.5 text-[10px] uppercase font-bold rounded transition-colors ${audioEnhanceView === view ? 'bg-zinc-700 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}>
                                    {view === 'main' ? 'Geral' : view === 'isolate' ? 'Isolar' : view === 'noise' ? 'Ruído' : 'Realçar'}
                                </button>
                            ))}
                        </div>

                        {audioEnhanceView === 'main' && (
                            <>
                                {renderSlider('Volume', (p.volume ?? 1) * 100, 0, 200, 1, (v) => handleChange('top', 'volume', v / 100), '%')}
                                {renderSlider('Fade In', p.audioFadeIn || 0, 0, 5, 0.1, (v) => handleChange('top', 'audioFadeIn', v), 's')}
                                {renderSlider('Fade Out', p.audioFadeOut || 0, 0, 5, 0.1, (v) => handleChange('top', 'audioFadeOut', v), 's')}
                                <div className="space-y-2 mt-4">
                                    {renderEnhanceButton('fa-microphone-lines', 'Clonar Voz', () => setShowVoiceCloneModal(true), true)}
                                    {renderEnhanceButton('fa-language', 'AI Dubbing (Traduzir)', () => setShowDubbingModal(true), true)}
                                    {renderEnhanceButton('fa-music', 'Gerar Música (AI)', () => { setMusicGenMode('generate'); setShowMusicGenModal(true); }, true)}
                                    {renderEnhanceButton('fa-volume-high', 'Gerar SFX (AI)', () => { setSfxGenMode('generate'); setShowSFXModal(true); }, true)}
                                    {renderEnhanceButton('fa-volume-down', 'Auto Ducking', () => { setSelectedVoiceClipId(''); setShowAutoDuckingModal(true); })}
                                    {renderEnhanceButton('fa-scissors', 'Smart Jump Cuts (Remover Silêncio)', () => setShowRemoveSilenceModal(true))}
                                    {renderEnhanceButton('fa-drum', 'Auto Beat Sync', handleAutoBeatSyncClick)}
                                </div>
                            </>
                        )}

                        {audioEnhanceView === 'isolate' && (
                            <div className="space-y-4">
                                <p className="text-xs text-gray-400">Separa a voz do ruído de fundo ou música.</p>
                                {renderSlider('Intensidade', isolateParams.intensity, 0, 100, 1, (v) => setIsolateParams({ ...isolateParams, intensity: v }), '%')}
                                <button onClick={() => onBackendAction('isolate-voice-real', 'Isolar Voz', isolateParams, { replace: true })} className="w-full py-2 bg-blue-600 rounded text-xs font-bold text-white hover:bg-blue-500">Aplicar Isolamento</button>
                            </div>
                        )}

                        {audioEnhanceView === 'noise' && (
                            <div className="space-y-4">
                                <p className="text-xs text-gray-400">Remove ruído estático, vento e chiado.</p>
                                {renderSlider('Redução', noiseParams.intensity, 0, 100, 1, (v) => setNoiseParams({ ...noiseParams, intensity: v }), '%')}
                                <button onClick={() => onBackendAction('reduce-noise-real', 'Reduzir Ruído', noiseParams, { replace: true })} className="w-full py-2 bg-blue-600 rounded text-xs font-bold text-white hover:bg-blue-500">Limpar Áudio</button>
                            </div>
                        )}

                        {audioEnhanceView === 'enhance' && (
                            <div className="space-y-4">
                                <p className="text-xs text-gray-400">Melhora a clareza e qualidade da voz para estúdio.</p>
                                {renderSlider('Clareza', enhanceParams.intensity, 0, 100, 1, (v) => setEnhanceParams({ ...enhanceParams, intensity: v }), '%')}
                                <button onClick={() => onBackendAction('enhance-voice-real', 'Realçar Voz', enhanceParams, { replace: true })} className="w-full py-2 bg-purple-600 rounded text-xs font-bold text-white hover:bg-purple-500">Aplicar Enhance</button>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'speed' && (
                    <div className="space-y-6">
                        <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-700">
                            <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2"><i className="fas fa-tachometer-alt text-blue-500"></i> AI Slow Motion</h3>
                            
                            <label className="text-[10px] text-gray-400 uppercase font-bold mb-2 block">Velocidade (Fator)</label>
                            <div className="flex gap-2 mb-4">
                                {[0.5, 0.25, 0.125].map(speed => (
                                    <button 
                                        key={speed} 
                                        onClick={() => setSlowMotionParams(p => ({ ...p, speed }))}
                                        className={`flex-1 py-2 text-xs font-bold rounded border transition-colors ${slowMotionParams.speed === speed ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-800 border-zinc-600 text-gray-400 hover:text-white'}`}
                                    >
                                        {speed}x ({(1/speed)}x)
                                    </button>
                                ))}
                            </div>

                            <label className="text-[10px] text-gray-400 uppercase font-bold mb-2 block">Qualidade (Interpolação)</label>
                            <div className="flex flex-col gap-2 mb-4">
                                <button 
                                    onClick={() => setSlowMotionParams(p => ({ ...p, mode: 'blend' }))}
                                    className={`w-full py-2 px-3 text-left rounded border flex items-center gap-2 transition-colors ${slowMotionParams.mode === 'blend' ? 'bg-zinc-700 border-blue-500 text-white' : 'bg-zinc-800 border-zinc-600 text-gray-400'}`}
                                >
                                    <i className="fas fa-layer-group"></i>
                                    <div className="flex-1">
                                        <div className="text-xs font-bold">Standard (Blend)</div>
                                        <div className="text-[9px] text-gray-500">Rápido, mistura frames (ghosting).</div>
                                    </div>
                                    {slowMotionParams.mode === 'blend' && <i className="fas fa-check text-blue-500"></i>}
                                </button>
                                <button 
                                    onClick={() => setSlowMotionParams(p => ({ ...p, mode: 'optical' }))}
                                    className={`w-full py-2 px-3 text-left rounded border flex items-center gap-2 transition-colors ${slowMotionParams.mode === 'optical' ? 'bg-gradient-to-r from-blue-900/50 to-purple-900/50 border-purple-500 text-white' : 'bg-zinc-800 border-zinc-600 text-gray-400'}`}
                                >
                                    <i className="fas fa-magic text-purple-400"></i>
                                    <div className="flex-1">
                                        <div className="text-xs font-bold text-purple-200">AI Optical Flow</div>
                                        <div className="text-[9px] text-gray-500">Cria novos frames reais (fluidez total).</div>
                                    </div>
                                    {slowMotionParams.mode === 'optical' && <i className="fas fa-check text-purple-500"></i>}
                                </button>
                            </div>

                            <button 
                                onClick={handleSlowMotionClick}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold shadow-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <i className="fas fa-clock"></i> Gerar Slow Motion
                            </button>
                        </div>

                        {renderSlider('Playback Rate (Simples)', p.speed || 1, 0.1, 10, 0.1, (v) => handleChange('top', 'speed', v), 'x')}
                        
                        <div className="pt-4 border-t border-zinc-700">
                            <h4 className="text-xs font-bold text-gray-400 mb-3 uppercase">Curvas de Velocidade</h4>
                            <div className="grid grid-cols-3 gap-2">
                                {Object.keys(SPEED_PRESETS).map(preset => (
                                    <button key={preset} onClick={() => applySpeedPreset(preset)} className={`p-2 rounded bg-zinc-700 hover:bg-zinc-600 text-[10px] text-center border border-zinc-600 ${p.speedCurve?.preset === preset ? 'border-blue-500 text-blue-400' : ''}`}>
                                        {preset}
                                    </button>
                                ))}
                                <button onClick={() => onUpdate({ properties: { ...p, speedCurve: undefined, speed: 1 } })} className="p-2 rounded bg-zinc-700 hover:bg-zinc-600 text-[10px] text-center border border-zinc-600">Normal</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* --- MODALS --- */}
            
            {showGenerativeFillModal && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowGenerativeFillModal(false)}>
                    <div className="bg-zinc-800 p-6 rounded-lg w-[400px] shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <i className="fas fa-expand-arrows-alt text-fuchsia-500"></i> Generative Fill (Gemini)
                            </h3>
                            <button onClick={() => setShowGenerativeFillModal(false)} className="text-gray-400 hover:text-white"><i className="fas fa-times"></i></button>
                        </div>
                        <div className="space-y-4">
                            <p className="text-xs text-gray-400">Descreva o que você quer adicionar ou alterar na imagem.</p>
                            <textarea 
                                value={generativeFillPrompt}
                                onChange={e => setGenerativeFillPrompt(e.target.value)}
                                placeholder="Ex: 'add a birthday hat on the person', 'make the sky night time with stars'..."
                                className="w-full bg-zinc-900 border border-zinc-700 rounded p-3 text-white text-sm focus:border-fuchsia-500 outline-none resize-none h-24"
                            />
                            <button 
                                onClick={() => {
                                    onGenerativeFill?.(generativeFillPrompt);
                                    setShowGenerativeFillModal(false);
                                    setGenerativeFillPrompt('');
                                }} 
                                disabled={!generativeFillPrompt.trim()}
                                className="w-full py-3 bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 disabled:opacity-50 text-white rounded-lg font-bold text-sm shadow-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <i className="fas fa-magic"></i> Gerar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showGenerativeOverlayModal && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowGenerativeOverlayModal(false)}>
                    <div className="bg-zinc-800 p-6 rounded-lg w-[400px] shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <i className="fas fa-object-group text-blue-500"></i> Generative Overlay (Gemini)
                            </h3>
                            <button onClick={() => setShowGenerativeOverlayModal(false)} className="text-gray-400 hover:text-white"><i className="fas fa-times"></i></button>
                        </div>
                        <div className="space-y-4">
                            <p className="text-xs text-gray-400">Extrai o assunto e aplica uma alteração, criando uma nova camada transparente.</p>
                            <textarea 
                                value={generativeOverlayPrompt}
                                onChange={e => setGenerativeOverlayPrompt(e.target.value)}
                                placeholder="Ex: 'transform the person into a superhero', 'add fire wings to the subject'..."
                                className="w-full bg-zinc-900 border border-zinc-700 rounded p-3 text-white text-sm focus:border-blue-500 outline-none resize-none h-24"
                            />
                            <button 
                                onClick={() => {
                                    onGenerativeOverlay?.(generativeOverlayPrompt);
                                    setShowGenerativeOverlayModal(false);
                                    setGenerativeOverlayPrompt('');
                                }}
                                disabled={!generativeOverlayPrompt.trim()}
                                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-lg font-bold text-sm shadow-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <i className="fas fa-wand-magic-sparkles"></i> Gerar Sobreposição
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Sticker 3D Modal - ADDED THIS BLOCK */}
            {showStickerModal && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowStickerModal(false)}>
                    <div className="bg-zinc-800 p-6 rounded-lg w-[400px] shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <i className="fas fa-sticky-note text-yellow-500"></i> Sticker 3D (Gemini)
                            </h3>
                            <button onClick={() => setShowStickerModal(false)} className="text-gray-400 hover:text-white"><i className="fas fa-times"></i></button>
                        </div>
                        <div className="space-y-4">
                            <p className="text-xs text-gray-400">Gere um adesivo 3D com fundo transparente.</p>
                            <textarea 
                                value={stickerPrompt}
                                onChange={(e) => setStickerPrompt(e.target.value)}
                                placeholder="Ex: 'Cute robot holding a coffee cup', 'Neon skull'..."
                                className="w-full bg-zinc-900 border border-zinc-700 rounded p-3 text-white text-sm focus:border-yellow-500 outline-none resize-none h-24"
                            />
                            <button 
                                onClick={handleGenerateStickerClick}
                                className="w-full py-3 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-bold text-sm shadow-lg transition-colors"
                            >
                                Gerar Sticker
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {showReframeModal && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowReframeModal(false)}>
                    <div className="bg-zinc-800 p-6 rounded-lg w-[400px] shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <i className="fas fa-crop text-green-500"></i> Auto Reframe (AI)
                            </h3>
                            <button onClick={() => setShowReframeModal(false)} className="text-gray-400 hover:text-white"><i className="fas fa-times"></i></button>
                        </div>
                        <div className="space-y-4">
                            <p className="text-xs text-gray-400">Adapta automaticamente o vídeo para diferentes proporções de tela.</p>
                            <p className="text-[10px] text-gray-500 -mt-2">Powered by server-side AI to keep the main subject in frame.</p>
                            
                            <div>
                                <label className="text-xs font-bold text-gray-300 block mb-2 uppercase">Proporção Alvo</label>
                                <select 
                                    value={reframeRatio} 
                                    onChange={(e) => setReframeRatio(e.target.value)} 
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:border-green-500 outline-none"
                                >
                                    <option value="9:16">9:16 (TikTok / Reels)</option>
                                    <option value="1:1">1:1 (Instagram)</option>
                                    <option value="16:9">16:9 (YouTube)</option>
                                    <option value="4:3">4:3 (Padrão)</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-300 block mb-2 uppercase">Modo de Preenchimento</label>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => setReframeMode('crop')} 
                                        className={`flex-1 py-2 text-xs font-bold rounded border transition-colors flex flex-col items-center gap-1 ${reframeMode === 'crop' ? 'bg-green-600 border-green-500 text-white' : 'bg-zinc-700 border-zinc-600 text-gray-300'}`}
                                    >
                                        <i className="fas fa-compress-arrows-alt"></i>
                                        Smart Crop
                                    </button>
                                    <button 
                                        onClick={() => setReframeMode('blur')} 
                                        className={`flex-1 py-2 text-xs font-bold rounded border transition-colors flex flex-col items-center gap-1 ${reframeMode === 'blur' ? 'bg-green-600 border-green-500 text-white' : 'bg-zinc-700 border-zinc-600 text-gray-300'}`}
                                    >
                                        <i className="fas fa-tint"></i>
                                        Blur Background
                                    </button>
                                </div>
                            </div>

                            <button onClick={handleAutoReframeClick} className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold text-sm shadow-lg transition-colors flex items-center justify-center gap-2">
                                <i className="fas fa-check"></i> Aplicar Reframe
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ... other modals ... */}
            {showVideoGenModal && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowVideoGenModal(false)}>
                    <div className="bg-zinc-800 p-6 rounded-lg w-[500px] shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <i className="fas fa-video text-cyan-500"></i> Gerar Vídeo (Veo/Sora)
                            </h3>
                            <button onClick={() => setShowVideoGenModal(false)} className="text-gray-400 hover:text-white"><i className="fas fa-times"></i></button>
                        </div>
                        <div className="bg-blue-900/30 border border-blue-700 p-3 rounded-lg mb-4 text-xs text-blue-200">
                            <p><i className="fas fa-info-circle mr-1"></i> Usa o modelo Veo (Gemini Video). Requer uma chave de API válida configurada.</p>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-300 block mb-2 uppercase">Prompt do Vídeo</label>
                                <textarea value={videoGenPrompt} onChange={(e) => setVideoGenPrompt(e.target.value)} placeholder="Ex: 'A cinematic drone shot of a futuristic city with neon lights and flying cars at night'" className="w-full bg-zinc-900 border border-zinc-700 rounded p-3 text-white text-sm focus:border-cyan-500 outline-none resize-none h-32" />
                            </div>
                            <button onClick={handleGenerateVideoClick} disabled={videoGenLoading || !videoGenPrompt.trim()} className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white rounded-lg font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2" > {videoGenLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-magic"></i>} Gerar Vídeo </button>
                        </div>
                    </div>
                </div>
            )}
            
            {showCartoonModal && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowCartoonModal(false)}>
                    <div className="bg-zinc-800 p-6 rounded-lg w-[700px] h-[80vh] flex flex-col shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <i className="fas fa-paint-brush text-blue-500"></i> 
                                {selectedClip?.type === 'image' ? 'Estilos Mágicos (Gemini)' : 'Video Style Lab (Filtros)'}
                            </h3>
                            <button onClick={() => setShowCartoonModal(false)} className="text-gray-400 hover:text-white"><i className="fas fa-times"></i></button>
                        </div>
                        
                        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-thin">
                            {Object.keys(activeStyleCategories).map(cat => (
                                <button 
                                    key={cat}
                                    onClick={() => setStyleCategory(cat)}
                                    className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${styleCategory === cat ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-gray-300 hover:bg-zinc-600'}`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>

                        <div className="flex-1 overflow-y-auto scrollbar-thin grid grid-cols-4 gap-3 content-start">
                            {(activeStyleCategories[styleCategory] as any[])?.map((style: any) => (
                                <button 
                                    key={style.id} 
                                    onClick={() => setSelectedStyleId(style.id)}
                                    className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-2 p-2 border transition-all ${selectedStyleId === style.id ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-zinc-700/50 border-zinc-600 text-gray-400 hover:bg-zinc-700 hover:text-gray-200'}`}
                                >
                                    <i className={`fas ${style.icon} text-2xl mb-1`}></i>
                                    <span className="text-[10px] text-center font-medium leading-tight">{style.name}</span>
                                </button>
                            ))}
                        </div>

                        {selectedClip?.type === 'image' && (
                            <div className="mt-4">
                                <label className="text-xs font-bold text-gray-300 block mb-2 uppercase">Prompt Personalizado (Opcional)</label>
                                <textarea 
                                    value={customStylePrompt} 
                                    onChange={(e) => setCustomStylePrompt(e.target.value)} 
                                    placeholder="Modifique o prompt para ajustar o estilo..." 
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none resize-none h-20"
                                />
                                <div className="mt-2">
                                    <label className="text-xs font-bold text-gray-300 block mb-2 uppercase">Proporção</label>
                                    <select 
                                        value={styleAspectRatio} 
                                        onChange={(e) => setStyleAspectRatio(e.target.value)} 
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                                    >
                                        <option value="1:1">1:1 (Quadrado)</option>
                                        <option value="16:9">16:9 (Paisagem)</option>
                                        <option value="9:16">9:16 (Retrato)</option>
                                        <option value="4:3">4:3 (Padrão)</option>
                                        <option value="3:4">3:4 (Vertical)</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        <div className="mt-6 pt-4 border-t border-zinc-700 flex justify-end gap-3">
                            <button onClick={() => setShowCartoonModal(false)} className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white transition-colors">Cancelar</button>
                            <button onClick={handleApplyStyle} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold shadow-lg transition-transform active:scale-95 flex items-center gap-2">
                                <i className="fas fa-magic"></i> Aplicar Estilo
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* ... AUDIO MODALS (New) ... */}
            
            {/* Music & SFX Modal */}
            {(showMusicGenModal || showSFXModal) && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => { setShowMusicGenModal(false); setShowSFXModal(false); }}>
                    <div className="bg-zinc-800 p-6 rounded-lg w-[500px] h-[80vh] flex flex-col shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <i className={`fas ${showMusicGenModal ? 'fa-music' : 'fa-volume-high'} text-purple-500`}></i> 
                                {showMusicGenModal ? 'Gerador de Música AI' : 'Gerador de SFX'}
                            </h3>
                            <button onClick={() => { setShowMusicGenModal(false); setShowSFXModal(false); }} className="text-gray-400 hover:text-white"><i className="fas fa-times"></i></button>
                        </div>
                        
                        <div className="flex gap-2 mb-4 bg-zinc-900 p-1 rounded-lg">
                            <button onClick={() => { setMusicGenMode('generate'); setSfxGenMode('generate'); }} className={`flex-1 py-2 text-xs font-bold rounded ${musicGenMode === 'generate' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}>Gerar (AI)</button>
                            <button onClick={() => { setMusicGenMode('freesound'); setSfxGenMode('freesound'); }} className={`flex-1 py-2 text-xs font-bold rounded ${musicGenMode === 'freesound' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Freesound</button>
                            <button onClick={() => { setMusicGenMode('epidemic'); setSfxGenMode('epidemic'); }} className={`flex-1 py-2 text-xs font-bold rounded ${musicGenMode === 'epidemic' ? 'bg-pink-600 text-white' : 'text-gray-400'}`}>Epidemic</button>
                        </div>

                        <div className="flex-1 overflow-hidden relative">
                            {(musicGenMode === 'generate' || sfxGenMode === 'generate') && (
                                <div className="space-y-4">
                                    <textarea 
                                        value={showMusicGenModal ? musicPrompt : sfxPrompt}
                                        onChange={(e) => showMusicGenModal ? setMusicPrompt(e.target.value) : setSfxPrompt(e.target.value)}
                                        placeholder={showMusicGenModal ? "Descreva a música (ex: lo-fi hip hop beat, sad piano)..." : "Descreva o efeito (ex: explosion, laser zap, footsteps)..."}
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded p-3 text-white text-sm focus:border-purple-500 outline-none resize-none h-32"
                                    />
                                    <div>
                                        <label className="text-xs font-bold text-gray-400 block mb-2">Duração (segundos)</label>
                                        <input 
                                            type="range" 
                                            min="1" max={showMusicGenModal ? 30 : 10} 
                                            value={showMusicGenModal ? musicDuration : sfxDuration}
                                            onChange={(e) => showMusicGenModal ? setMusicDuration(parseInt(e.target.value)) : setSfxDuration(parseInt(e.target.value))}
                                            className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                        />
                                        <div className="text-right text-xs text-gray-400 mt-1">{showMusicGenModal ? musicDuration : sfxDuration}s</div>
                                    </div>
                                    <button 
                                        onClick={showMusicGenModal ? handleGenerateMusicClick : handleGenerateSFXClick}
                                        className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold shadow-lg"
                                    >
                                        Gerar Áudio
                                    </button>
                                </div>
                            )}
                            {(musicGenMode === 'freesound' || sfxGenMode === 'freesound') && renderFreesoundSearch()}
                            {(musicGenMode === 'epidemic' || sfxGenMode === 'epidemic') && renderEpidemicSearch()}
                        </div>
                    </div>
                </div>
            )}

            {/* Voice Clone Modal */}
            {showVoiceCloneModal && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowVoiceCloneModal(false)}>
                    <div className="bg-zinc-800 p-6 rounded-lg w-[400px] shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><i className="fas fa-microphone-lines text-blue-500"></i> Clonar Voz</h3>
                        
                        {!cloneAudioUrl ? (
                            <div className="flex flex-col items-center justify-center py-8 gap-4">
                                <button 
                                    onClick={isRecordingClone ? stopCloneRecording : startCloneRecording}
                                    className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl shadow-xl transition-all ${isRecordingClone ? 'bg-red-600 animate-pulse' : 'bg-blue-600 hover:bg-blue-500'}`}
                                >
                                    <i className={`fas ${isRecordingClone ? 'fa-stop' : 'fa-microphone'}`}></i>
                                </button>
                                <p className="text-sm text-gray-400">{isRecordingClone ? `Gravando... ${cloneRecordingTime}s` : 'Clique para gravar sua voz (min 10s)'}</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="bg-zinc-900 p-3 rounded flex items-center justify-between">
                                    <span className="text-xs text-gray-300">Amostra Gravada</span>
                                    <div className="flex gap-2">
                                        <button onClick={playClonePreview} className="text-blue-400 hover:text-white"><i className="fas fa-play"></i></button>
                                        <button onClick={() => { setCloneAudioUrl(null); setCloneAudioBlob(null); }} className="text-red-400 hover:text-white"><i className="fas fa-trash"></i></button>
                                    </div>
                                </div>
                                <textarea 
                                    value={cloneText} 
                                    onChange={(e) => setCloneText(e.target.value)} 
                                    placeholder="O que sua voz clonada deve dizer?" 
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white resize-none h-24"
                                />
                                <button onClick={handleGenerateClone} className="w-full py-2 bg-green-600 hover:bg-green-500 text-white rounded font-bold">Gerar Fala</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Dubbing Modal */}
            {showDubbingModal && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowDubbingModal(false)}>
                    <div className="bg-zinc-800 p-6 rounded-lg w-[400px] shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><i className="fas fa-language text-green-500"></i> Dublagem AI</h3>
                        <div className="space-y-4">
                            <p className="text-xs text-gray-400">Traduz e dubla o áudio do clipe selecionado mantendo a voz original.</p>
                            <select 
                                value={dubbingLanguage} 
                                onChange={(e) => setDubbingLanguage(e.target.value)} 
                                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white"
                            >
                                <option value="English">Inglês</option>
                                <option value="Spanish">Espanhol</option>
                                <option value="French">Francês</option>
                                <option value="German">Alemão</option>
                                <option value="Italian">Italiano</option>
                                <option value="Portuguese">Português</option>
                                <option value="Japanese">Japonês</option>
                            </select>
                            <button onClick={handleDubbingClick} className="w-full py-2 bg-green-600 hover:bg-green-500 text-white rounded font-bold">Dublar Agora</button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Auto Ducking Modal */}
            {showAutoDuckingModal && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowAutoDuckingModal(false)}>
                    <div className="bg-zinc-800 p-6 rounded-lg w-[400px] shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><i className="fas fa-volume-down text-blue-500"></i> Auto Ducking</h3>
                        <div className="space-y-4">
                            <p className="text-xs text-gray-400">Abaixa automaticamente o volume da música quando há voz.</p>
                            
                            <div>
                                <label className="text-xs text-gray-300 block mb-1">Clipe de Voz Principal</label>
                                <select 
                                    value={selectedVoiceClipId} 
                                    onChange={(e) => setSelectedVoiceClipId(e.target.value)} 
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-white"
                                >
                                    <option value="">Selecione a trilha de voz...</option>
                                    {clips.filter(c => c.type === 'audio' || c.track === 'narration' || (c.type === 'video' && mediaLibrary[c.fileName]?.hasAudio)).map(c => (
                                        <option key={c.id} value={c.id}>{mediaLibrary[c.fileName]?.name || 'Áudio'} ({c.track})</option>
                                    ))}
                                </select>
                            </div>
                            
                            {renderSlider('Limite (Threshold)', duckingParams.threshold, 0.01, 0.5, 0.01, (v) => setDuckingParams(p => ({...p, threshold: v})))}
                            {renderSlider('Intensidade (Ratio)', duckingParams.ratio, 1, 10, 0.5, (v) => setDuckingParams(p => ({...p, ratio: v})))}
                            
                            <button onClick={handleAutoDuckingClick} className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold">Aplicar Ducking</button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Remove Silence Modal */}
            {showRemoveSilenceModal && (
                 <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowRemoveSilenceModal(false)}>
                    <div className="bg-zinc-800 p-6 rounded-lg w-[400px] shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><i className="fas fa-scissors text-red-500"></i> Smart Jump Cuts</h3>
                        <div className="space-y-4">
                            <p className="text-xs text-gray-400">Remove automaticamente partes silenciosas do áudio/vídeo.</p>
                            {renderSlider('Duração Mínima (s)', silenceParams.duration, 0.1, 2.0, 0.1, (v) => setSilenceParams(p => ({...p, duration: v})))}
                            {renderSlider('Limiar de Volume (dB)', silenceParams.threshold, -60, -10, 1, (v) => setSilenceParams(p => ({...p, threshold: v})))}
                            <button onClick={handleRemoveSilenceClick} className="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded font-bold">Remover Silêncio</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Lip Sync Modal */}
            {showLipSyncModal && (
                 <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowLipSyncModal(false)}>
                    <div className="bg-zinc-800 p-6 rounded-lg w-[400px] shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><i className="fas fa-face-laugh text-yellow-500"></i> Lip Sync AI</h3>
                        <div className="space-y-4">
                            <p className="text-xs text-gray-400">Sincroniza o movimento labial do vídeo com um áudio externo.</p>
                             <div>
                                <label className="text-xs text-gray-300 block mb-1">Áudio para Sincronizar</label>
                                <select 
                                    value={lipSyncVoiceId} 
                                    onChange={(e) => setLipSyncVoiceId(e.target.value)} 
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-white"
                                >
                                    <option value="">Selecione o áudio...</option>
                                    {clips.filter(c => c.type === 'audio' || c.track === 'narration').map(c => (
                                        <option key={c.id} value={c.id}>{mediaLibrary[c.fileName]?.name || 'Áudio'}</option>
                                    ))}
                                </select>
                            </div>
                            <button onClick={handleLipSyncClick} className="w-full py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded font-bold">Sincronizar Lábios</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Smart B-Roll Modal */}
            {showSmartBRollModal && (
                 <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowSmartBRollModal(false)}>
                    <div className="bg-zinc-800 p-6 rounded-lg w-[400px] shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><i className="fas fa-photo-film text-purple-500"></i> Smart B-Roll</h3>
                        <div className="space-y-4">
                            <p className="text-xs text-gray-400">Insere automaticamente imagens ou vídeos baseados no conteúdo do áudio (transcrição).</p>
                             <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => handleSmartBRollSourceChange('pexels')} className={`p-2 border rounded text-xs ${smartBRollParams.source === 'pexels' ? 'bg-purple-600 border-purple-500' : 'bg-zinc-700 border-zinc-600'}`}>Stock (Pexels)</button>
                                <button onClick={() => handleSmartBRollSourceChange('gemini')} className={`p-2 border rounded text-xs ${smartBRollParams.source === 'gemini' ? 'bg-blue-600 border-blue-500' : 'bg-zinc-700 border-zinc-600'}`}>AI (Gemini)</button>
                            </div>
                            <div>
                                <label className="text-xs text-gray-300 block mb-1">Tipo de Mídia</label>
                                <select 
                                    value={smartBRollParams.type} 
                                    onChange={(e) => setSmartBRollParams(p => ({...p, type: e.target.value as any}))} 
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-white"
                                    disabled={smartBRollParams.source === 'gemini'}
                                >
                                    <option value="video">Vídeo</option>
                                    <option value="image">Imagem</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-gray-300 block mb-1">Densidade</label>
                                <select 
                                    value={smartBRollParams.density} 
                                    onChange={(e) => setSmartBRollParams(p => ({...p, density: e.target.value as any}))} 
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-white"
                                >
                                    <option value="low">Baixa (Poucos cortes)</option>
                                    <option value="medium">Média</option>
                                    <option value="high">Alta (Muitos cortes)</option>
                                </select>
                            </div>
                            <button onClick={handleSmartBRollClick} className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold">Gerar B-Roll</button>
                        </div>
                    </div>
                </div>
            )}
             
            {/* Motion Tracking Modal */}
             {showMotionTrackModal && (
                 <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowMotionTrackModal(false)}>
                    <div className="bg-zinc-800 p-6 rounded-lg w-[400px] shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><i className="fas fa-crosshairs text-red-500"></i> Motion Tracking</h3>
                        <div className="space-y-4">
                            <p className="text-xs text-gray-400">Rastreia um objeto no vídeo e cola outro elemento nele.</p>
                            <input 
                                value={motionTrackTarget}
                                onChange={e => setMotionTrackTarget(e.target.value)}
                                placeholder="Descreva o objeto para rastrear (ex: 'rosto do homem', 'carro vermelho')"
                                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-white"
                            />
                            <div>
                                <label className="text-xs text-gray-300 block mb-1">Elemento para Colar</label>
                                <select 
                                    value={motionTrackOverlayId} 
                                    onChange={(e) => setMotionTrackOverlayId(e.target.value)} 
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-white"
                                >
                                    <option value="">Selecione o elemento overlay...</option>
                                    {clips.filter(c => c.type !== 'audio' && c.id !== selectedClip?.id).map(c => (
                                        <option key={c.id} value={c.id}>{mediaLibrary[c.fileName]?.name || c.type} ({c.track})</option>
                                    ))}
                                </select>
                            </div>
                            <button onClick={handleMotionTrackClick} className="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded font-bold">Iniciar Rastreamento</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Auto Rotoscope Modal */}
            {showRotoscopeModal && (
                 <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowRotoscopeModal(false)}>
                    <div className="bg-zinc-800 p-6 rounded-lg w-[400px] shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2"><i className="fas fa-user-slash text-purple-500"></i> Smart Cutout (AI)</h3>
                            <button onClick={() => setShowRotoscopeModal(false)} className="text-gray-400 hover:text-white"><i className="fas fa-times"></i></button>
                        </div>
                        <div className="space-y-4">
                            <p className="text-xs text-gray-400">Remove o fundo do vídeo ou isola um objeto.</p>
                            
                            <div>
                                <label className="text-xs font-bold text-gray-300 block mb-2 uppercase">Cor de Referência</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="color" 
                                        value={rotoscopeParams.color} 
                                        onChange={(e) => setRotoscopeParams(p => ({...p, color: e.target.value}))} 
                                        className="w-10 h-10 rounded cursor-pointer bg-transparent border-0" 
                                    />
                                    <button 
                                        onClick={handleDetectColor}
                                        disabled={isDetectingColor}
                                        className="flex-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {isDetectingColor ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-eye-dropper"></i>}
                                        Detectar Cor (AI)
                                    </button>
                                </div>
                            </div>

                            {renderSlider('Similaridade', rotoscopeParams.similarity, 0.01, 1.0, 0.01, (v) => setRotoscopeParams(p => ({...p, similarity: v})))}
                            {renderSlider('Suavidade (Borda)', rotoscopeParams.smoothness, 0, 0.5, 0.01, (v) => setRotoscopeParams(p => ({...p, smoothness: v})))}
                            {renderSlider('Spill Reduce', rotoscopeParams.spill, 0, 1, 0.1, (v) => setRotoscopeParams(p => ({...p, spill: v})))}
                            
                            <button onClick={handleAutoRotoscopeClick} className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold shadow-lg">Aplicar Rotoscope</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Persistent Bottom Controls */}
            <div className="p-4 border-t border-zinc-700 bg-zinc-900/50">
                <button 
                    onClick={() => (window as any).aistudio?.openSelectKey?.()}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-500/20 flex items-center justify-center gap-3 transition-all active:scale-95 group"
                >
                    <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center group-hover:rotate-12 transition-transform">
                        <i className="fas fa-key"></i>
                    </div>
                    CONFIGURAR CHAVE API (VEO)
                </button>
                <p className="text-[9px] text-zinc-500 mt-2 text-center font-bold">Necessário para Transições IA e Dublagem</p>
            </div>
        </div>
    );
};
