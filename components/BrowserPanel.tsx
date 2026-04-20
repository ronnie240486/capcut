
import React, { useState, useRef, useEffect } from 'react';
import { MediaItem, CustomFont, TextDesignProperties, MovementConfig, ScriptScene, Clip, ClipProperties, VideoConfig, ScriptAnalysisResult } from '../types';
import { RESOURCES, TEXT_RESOURCES, IMAGE_STYLE_CATEGORIES } from '../constants';
import { AIVideoTab } from './AIVideoTab';
import { GoogleGenAI } from "@google/genai";

interface BrowserPanelProps {
    mediaLibrary: Record<string, MediaItem>;
    clips: Clip[]; 
    backgroundImage?: string;
    selectedClipId: string | null;
    customFonts?: CustomFont[];
    onImport: (files: FileList | null, forceType?: 'audio' | 'video' | 'image') => void;
    onDragStart: (e: React.DragEvent, type: string, id: string, payload?: any) => void;
    onGenerateTTS: (text: string, voice: string, style?: string, speed?: number, pitch?: number, autoSubtitle?: boolean, subtitleTemplateId?: string) => Promise<void>;
    onGenerateNarration: (text: string, voice: string, targetClipId: string, style?: string, speed?: number, pitch?: number, autoSubtitle?: boolean, subtitleTemplateId?: string) => Promise<void>;
    onGenerateImage: (prompt: string, aspectRatio?: string) => Promise<void>;
    onGenerateVideo?: (prompt: string, duration?: number) => Promise<void>; 
    onGenerateVeo?: (config: VideoConfig) => Promise<void>;
    onPreviewTTS?: (text: string, voice: string, style?: string, speed?: number, pitch?: number) => Promise<void>;
    onChangeAspectRatio: (ratio: string) => void;
    currentAspectRatio?: string;
    onChangeBackground: (color: string) => void;
    onSetBackgroundImage: (files: FileList | null) => void;
    onRemoveBackgroundImage: () => void;
    onSplit?: () => void;
    onDuplicate?: () => void;
    onDelete?: () => void; 
    onDeleteMedia?: (name: string) => void; 
    onReplace?: (files: FileList | null) => void;
    onFreeze?: () => void;
    onUpdateClip?: (id: string, updates: Partial<Clip>) => void; 
    onBackendAction?: (endpoint: string, friendlyName: string, params?: any, options?: any) => void;
    onOpenInspectorSection?: (section: string) => void;
    onApplyResource?: (type: 'transition' | 'effect' | 'movement', id: string, config?: any) => void;
    onApplyToAll?: (type: 'transition' | 'effect' | 'movement', id: string) => void;
    onAddText?: (styleId: string | 'update', design?: Partial<TextDesignProperties>) => void;
    onUploadSubtitles?: (files: FileList | null) => void;
    onUploadFont?: (files: FileList | null) => void;
    onSceneDetectAndSplit?: () => void;
    onStartStyleTransfer?: (styleImageFile: File) => void;
    onAnalyzeScript?: (script: string) => Promise<ScriptAnalysisResult>;
    onGenerateSceneMedia?: (scene: ScriptScene, voiceId: string, style: string, aspectRatio: string, source?: string, narrator1Voice?: string, narrator2Voice?: string, characterDesc?: string, generateNarration?: boolean) => Promise<ScriptScene>;
    onRegenerateSceneImage?: (scene: ScriptScene, style: string, aspectRatio: string, source?: string, characterDesc?: string) => Promise<ScriptScene>;
    onEditSceneImage?: (scene: ScriptScene, prompt: string) => Promise<ScriptScene>;
    onAddScriptToTimeline?: (scenes: ScriptScene[], autoSubtitle?: boolean, subtitleStyleId?: string, bgMusicUrl?: string, generateNarration?: boolean) => void;
    onBulkDelete?: (trackType: 'video' | 'audio' | 'all') => void;
    onGenerateSubtitles?: (scope: 'single' | 'all' | 'update_style', templateId?: string) => Promise<void>;
    onFetchUrl?: (url: string) => Promise<string>;
    onTranscribeAudio?: (file: File) => Promise<string>;
    onSetActiveTool?: (tool: 'cursor' | 'magic-eraser') => void;
    onClearTimeline?: () => void;
    onAutoBRoll?: () => void;
    onRestoreBRoll?: () => void;
    onAddToTimeline?: (media: MediaItem) => void; 
    onModalChange?: (isOpen: boolean) => void;
    onGeminiStyleTransfer?: (media: MediaItem, style: string, ratio: string) => void;
    onImportRemoteMedia?: (url: string, name: string, type: 'audio' | 'video' | 'image', targetTrack?: string) => void;
    onSearchFreesound?: (query: string) => Promise<any[]>;
    onMagicSync?: (audioFile: File, videoPrompts: string[]) => Promise<void>;
    onSmartMagicSync?: (audioFile: File, source: 'mixed' | 'gemini_image' | 'pexels_video' | 'pexels_image' | 'pixabay_video' | 'pixabay_image' | 'unsplash_image', style?: string) => Promise<void>;
    onSyncExistingClips?: (audioFile: File) => Promise<void>;
    onSyncUploadedVideos?: (audioFile: File, videoFiles: File[]) => Promise<void>;
    magicSyncLoading?: boolean;
    hasClips?: boolean;
    onGenerateMusic?: (prompt: string, duration: number) => void;
    onGenerateSFX?: (prompt: string, duration: number) => void;
    onGenerativeFill?: (prompt: string) => void;
    onSmartBRoll?: (params: { type: 'video' | 'image', density: 'low' | 'high' | 'medium', source: 'pexels' | 'gemini' }) => void;
}

type Tab = 'media' | 'stock' | 'edit' | 'layer' | 'audio' | 'text' | 'subtitles' | 'effects' | 'ratio' | 'background' | 'ai-video' | 'magic-sync' | 'music-ai';
type EffectsSubTab = 'effects' | 'transitions' | 'movements';
type TextSubTab = 'modelos' | 'fontes' | 'efeitos' | 'animacoes';

interface MovementControlState {
    id: string;
    name: string;
    config: Record<string, number>;
    controls: Record<string, { min: number; max: number; step: number; default: number }>;
}

type VoiceEffect = {
    id: string;
    name: string;
    icon: string;
    anim: string;
};

const VOICE_EFFECTS_CATEGORIES: Record<string, VoiceEffect[]> = {
    'Personagens': [
        { id: 'chipmunk', name: 'Esquilo', icon: '🐿️', anim: 'animate-icon-bounce' },
        { id: 'monster', name: 'Monstro', icon: '👹', anim: 'animate-icon-shake' },
        { id: 'baby', name: 'Bebê', icon: '👶', anim: 'animate-icon-bounce' },
        { id: 'giant', name: 'Gigante', icon: '🗿', anim: 'animate-icon-float' },
        { id: 'minion', name: 'Minion', icon: '🍌', anim: 'animate-icon-bounce' },
        { id: 'villain', name: 'Vilão', icon: '🦹', anim: 'animate-icon-float' },
        { id: 'hero', name: 'Herói', icon: '🦸', anim: 'animate-icon-pulse' },
        { id: 'old_man', name: 'Idoso', icon: '👴', anim: 'animate-icon-shake' },
        { id: 'witch', name: 'Bruxa', icon: '🧙‍♀️', anim: 'animate-icon-float' },
        { id: 'dwarf', name: 'Anão', icon: '🛡️', anim: 'animate-icon-bounce' },
        { id: 'wario', name: 'Wario', icon: '👺', anim: 'animate-icon-shake' },
        { id: 'orc', name: 'Orc', icon: '🧟', anim: 'animate-icon-shake' },
        { id: 'squirrel', name: 'Super Esquilo', icon: '🐿️', anim: 'animate-icon-spin' },
    ],
    'Robô & Sci-Fi': [
        { id: 'robot', name: 'Robô', icon: '🤖', anim: 'animate-icon-shake' },
        { id: 'alien', name: 'Alienígena', icon: '👽', anim: 'animate-icon-float' },
        { id: 'cyborg', name: 'Ciborgue', icon: '🦾', anim: 'animate-icon-shake' },
        { id: 'ai_assistant', name: 'Assistente IA', icon: '🧠', anim: 'animate-icon-pulse' },
        { id: 'astronaut', name: 'Astronauta', icon: '👨‍🚀', anim: 'animate-icon-float' },
        { id: 'radio', name: 'Rádio Velho', icon: '📻', anim: 'animate-icon-shake' },
        { id: 'telephone', name: 'Telefone', icon: '☎️', anim: 'animate-icon-shake' },
        { id: 'walkie_talkie', name: 'Walkie Talkie', icon: '📟', anim: 'animate-icon-pulse' },
        { id: 'glitch', name: 'Voz Glitch', icon: '👾', anim: 'animate-icon-shake' },
        { id: 'dalek', name: 'Exterminador', icon: '🔫', anim: 'animate-icon-shake' },
        { id: 'megaphone', name: 'Megafone', icon: '📣', anim: 'animate-icon-pulse' },
    ],
    'Terror & Horror': [
        { id: 'demon', name: 'Demônio', icon: '👿', anim: 'animate-icon-shake' },
        { id: 'ghost', name: 'Fantasma', icon: '👻', anim: 'animate-icon-float' },
        { id: 'zombie', name: 'Zumbi', icon: '🧟‍♂️', anim: 'animate-icon-shake' },
        { id: 'poltergeist', name: 'Poltergeist', icon: '🌫️', anim: 'animate-icon-pulse' },
        { id: 'killer', name: 'Assassino', icon: '🔪', anim: 'animate-icon-shake' },
    ],
    'Ambiente & Reverb': [
        { id: 'cave', name: 'Caverna', icon: '🕳️', anim: '' },
        { id: 'hall', name: 'Salão', icon: '🏛️', anim: '' },
        { id: 'cathedral', name: 'Catedral', icon: '⛪', anim: '' },
        { id: 'bathroom', name: 'Banheiro', icon: '🚿', anim: '' },
        { id: 'underwater', name: 'Embaixo D\'água', icon: '🫧', anim: 'animate-icon-float' },
        { id: 'space', name: 'Espaço', icon: '🌌', anim: 'animate-icon-float' },
    ],
    'Diversos': [
        { id: 'helium', name: 'Hélio', icon: '🎈', anim: 'animate-icon-float' },
        { id: 'fan', name: 'Ventilador', icon: '💨', anim: 'animate-icon-spin' },
        { id: 'vibrato', name: 'Vibrato', icon: '〰️', anim: 'animate-icon-shake' },
        { id: 'drunk', name: 'Bêbado', icon: '🥴', anim: 'animate-icon-shake' },
        { id: 'man_to_woman', name: 'Homem -> Mulher', icon: '👩', anim: '' },
        { id: 'woman_to_man', name: 'Mulher -> Homem', icon: '👨', anim: '' },
        { id: 'fast', name: 'Rápido', icon: '⏩', anim: '' },
        { id: 'slow', name: 'Lento', icon: '⏪', anim: '' },
        { id: 'reverse', name: 'Reverso', icon: '↩️', anim: '' },
    ]
};

export const BrowserPanel: React.FC<BrowserPanelProps> = ({ 
    mediaLibrary, 
    clips,
    backgroundImage,
    selectedClipId,
    customFonts = [],
    onImport, 
    onDragStart, 
    onGenerateTTS,
    onGenerateNarration,
    onGenerateImage,
    onGenerateVideo,
    onGenerateVeo,
    onPreviewTTS,
    onChangeAspectRatio,
    currentAspectRatio,
    onChangeBackground,
    onSetBackgroundImage,
    onRemoveBackgroundImage,
    onSplit,
    onDuplicate,
    onDelete,
    onDeleteMedia,
    onReplace,
    onFreeze,
    onUpdateClip,
    onBackendAction,
    onOpenInspectorSection,
    onApplyResource,
    onApplyToAll,
    onAddText,
    onUploadSubtitles,
    onUploadFont,
    onSceneDetectAndSplit,
    onStartStyleTransfer,
    onAnalyzeScript,
    onGenerateSceneMedia,
    onRegenerateSceneImage,
    onEditSceneImage,
    onAddScriptToTimeline,
    onBulkDelete,
    onGenerateSubtitles,
    onFetchUrl,
    onTranscribeAudio,
    onSetActiveTool,
    onClearTimeline,
    onSmartBRoll, 
    onAutoBRoll,
    onRestoreBRoll,
    onAddToTimeline,
    onModalChange,
    onGeminiStyleTransfer,
    onImportRemoteMedia,
    onSearchFreesound,
    onGenerateMusic,
    onGenerateSFX,
    onGenerativeFill,
    onMagicSync,
    onSmartMagicSync,
    onSyncExistingClips,
    onSyncUploadedVideos,
    magicSyncLoading,
    hasClips
}) => {
    // Basic States
    const [activeTab, setActiveTab] = useState<Tab>('media');
    const [magicAudio, setMagicAudio] = useState<File | null>(null);
    const [magicSyncSource, setMagicSyncSource] = useState<'mixed' | 'gemini_image' | 'pexels_video' | 'pexels_image' | 'pixabay_video' | 'pixabay_image' | 'unsplash_image'>('mixed');
    const [magicVideos, setMagicVideos] = useState<File[]>([]);
    const [magicPrompts, setMagicPrompts] = useState<string[]>(["Cinematic drone shot of mountains", "Close up of a person smiling", "Fast car driving through a neon city"]);
    const [effectsSubTab, setEffectsSubTab] = useState<EffectsSubTab>('transitions');
    const [textSubTab, setTextSubTab] = useState<TextSubTab>('modelos');
    const [hoveredPreviewId, setHoveredPreviewId] = useState<string | null>(null);
    const [hoveredEffectId, setHoveredEffectId] = useState<string | null>(null);
    const [hoveredMoveId, setHoveredMoveId] = useState<string | null>(null);
    const [movementControl, setMovementControl] = useState<MovementControlState | null>(null);
    const [favorites, setFavorites] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('proedit_favorites') || '[]'); } catch { return []; } });
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    
    // STOCK SEARCH STATES
    const [stockQuery, setStockQuery] = useState('');
    const [stockType, setStockType] = useState<'video' | 'image'>('video');
    const [stockProvider, setStockProvider] = useState<'all' | 'pexels' | 'pixabay' | 'unsplash'>('all');
    const [stockResults, setStockResults] = useState<any[]>([]);
    const [stockPage, setStockPage] = useState(1);
    const [isSearchingStock, setIsSearchingStock] = useState(false);
    const [activeStockPreview, setActiveStockPreview] = useState<string | null>(null);

    // Refs
    const replaceInputRef = useRef<HTMLInputElement>(null);
    const fontInputRef = useRef<HTMLInputElement>(null);
    const styleImageInputRef = useRef<HTMLInputElement>(null);
    const stockPreviewRef = useRef<HTMLVideoElement | null>(null);
    
    // TTS States
    const [ttsText, setTtsText] = useState('');
    const [narrationText, setNarrationText] = useState('');
    const [ttsVoice, setTtsVoice] = useState(RESOURCES.ttsVoices.virtual[0]?.id || 'Kore');
    const [ttsStyle, setTtsStyle] = useState('normal');
    const [ttsEmotion, setTtsEmotion] = useState('neutral');
    const [ttsAccent, setTtsAccent] = useState('none');
    const [ttsSpeed, setTtsSpeed] = useState(1);
    const [ttsPitch, setTtsPitch] = useState(0);
    const [ttsNuance, setTtsNuance] = useState('none');
    const [autoSubtitle, setAutoSubtitle] = useState(false);
    const [ttsLoading, setTtsLoading] = useState(false);
    const [ttsPreviewLoading, setTtsPreviewLoading] = useState(false);
    const [ttsLangFilter, setTtsLangFilter] = useState('pt-br');
    
    // Media & Gen AI States
    const [subtitlesLoading, setSubtitlesLoading] = useState(false);
    const [selectedSubtitleTemplate, setSelectedSubtitleTemplate] = useState<string>('viral_0_0'); 
    const [imgPrompt, setImgPrompt] = useState('');
    const [imgStyle, setImgStyle] = useState('Photorealistic');
    const [imgLoading, setImgLoading] = useState(false);
    const [favoriteVoices, setFavoriteVoices] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('proedit_fav_voices') || '[]'); } catch { return []; } });
    
    // SCRIPT MODAL STATES
    const [showScriptModal, setShowScriptModal] = useState(false);
    const [scriptInputMode, setScriptInputMode] = useState<'auto' | 'manual'>('auto'); // NEW
    const [scriptText, setScriptText] = useState('');
    const [scriptSource, setScriptSource] = useState<'text' | 'url' | 'audio_mic' | 'audio_file' | 'file'>('text');
    const [scriptUrl, setScriptUrl] = useState('');
    const [isFetchingUrl, setIsFetchingUrl] = useState(false);
    const [scriptStage, setScriptStage] = useState<'input' | 'review'>('input');
    const [generatedScenes, setGeneratedScenes] = useState<ScriptScene[]>([]);
    
    // --- NEW: SCRIPT DURATION & ENERGY CONTROL ---
    const [scriptDuration, setScriptDuration] = useState<number>(5); // In minutes
    const [scriptEnergy, setScriptEnergy] = useState<'calm' | 'normal' | 'fast'>('normal');
    const [includeAudioEffects, setIncludeAudioEffects] = useState(true);

    // MANUAL SCENE STATES
    const [manualScenes, setManualScenes] = useState<ScriptScene[]>([
        { id: 'm1', narration: '', visual: '', speaker: 'narrator1' }
    ]);
    
    // NARRATOR & FORMAT STATES
    const [scriptFormat, setScriptFormat] = useState<'monologue' | 'dialogue'>('monologue');
    const [narrator1Voice, setNarrator1Voice] = useState(RESOURCES.ttsVoices.virtual[0]?.id || 'Kore');
    const [narrator2Voice, setNarrator2Voice] = useState(RESOURCES.ttsVoices.virtual[1]?.id || 'Zephyr');
    
    // New State for Sentiment Analysis
    const [scriptMood, setScriptMood] = useState<string>('');
    const [scriptGenre, setScriptGenre] = useState<string>('');
    const [scriptMusicPrompt, setScriptMusicPrompt] = useState<string>('');
    const [selectedBgMusic, setSelectedBgMusic] = useState<string>('');
    const [isSearchingMusic, setIsSearchingMusic] = useState(false);
    
    const [scriptLoading, setScriptLoading] = useState(false);
    const [scriptImageStyle, setScriptImageStyle] = useState('Cinematic');
    const [scriptAspectRatio, setScriptAspectRatio] = useState('16:9');
    // Updated Media Sources
    const [scriptMediaSource, setScriptMediaSource] = useState<'gemini' | 'pexels_image' | 'pexels_video' | 'pixabay_image' | 'pixabay_video' | 'unsplash_image' | 'mixed'>('mixed');
    
    // Music AI States
    const [musicPrompt, setMusicPrompt] = useState('');
    const [musicDuration, setMusicDuration] = useState(30);
    const [musicMood, setMusicMood] = useState('custom');
    const [scriptAIModel, setScriptAIModel] = useState<'gemini' | 'gpt' | 'claude'>('gemini');
    const [generateNarration, setGenerateNarration] = useState(true);
    const [fullScriptMode, setFullScriptMode] = useState(false);
    const [showMagicStyleModal, setShowMagicStyleModal] = useState(false);
    const [selectedMagicStyle, setSelectedMagicStyle] = useState('Cinematic');
    
    const [characterDescription, setCharacterDescription] = useState(''); 
    const [isListening, setIsListening] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const audioFileInputRef = useRef<HTMLInputElement>(null);
    
    const [voiceEffectCategory, setVoiceEffectCategory] = useState<string>('Personagens');
    const [showEditImageModal, setShowEditImageModal] = useState(false);
    const [editingSceneIndex, setEditingSceneIndex] = useState<number | null>(null);
    const [editImagePrompt, setEditImagePrompt] = useState('');
    const [showGenerativeFillModal, setShowGenerativeFillModal] = useState(false);
    const [generativeFillPrompt, setGenerativeFillPrompt] = useState('');

    const isAnyModalOpen = showScriptModal || showEditImageModal || showGenerativeFillModal || showMagicStyleModal;
    useEffect(() => {
        onModalChange?.(isAnyModalOpen);
    }, [isAnyModalOpen, onModalChange]);

    const selectedClip = clips.find(c => c.id === selectedClipId);
    const defaultProps: ClipProperties = { opacity: 1, volume: 1, speed: 1, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, adjustments: { brightness: 1, contrast: 1, saturate: 1, hue: 0 }, crop: { top: 0, bottom: 0, left: 0, right: 0 }, mask: { shape: 'none' }, reverse: false, blendMode: 'normal', fit: 'cover' };
    const getPreviewUrl = (id: string) => `https://picsum.photos/seed/${id}/300/300`;
    
    const toggleFavorite = (id: string) => { const newFavs = favorites.includes(id) ? favorites.filter(f => f !== id) : [...favorites, id]; setFavorites(newFavs); localStorage.setItem('proedit_favorites', JSON.stringify(newFavs)); };
    const updateProp = (path: string, value: any) => { if (!selectedClip || !onUpdateClip) return; const props = { ...selectedClip.properties }; if (path.includes('.')) { const [main, sub] = path.split('.'); if (!(props as any)[main]) (props as any)[main] = {}; (props as any)[main] = { ...(props as any)[main], [sub]: value }; } else { (props as any)[path] = value; } onUpdateClip(selectedClip.id, { properties: props }); };
    const updateTransform = (key: 'x' | 'y' | 'scale' | 'rotation', delta: number, isAbsolute: boolean = false) => { if (!selectedClip || !onUpdateClip) return; const transform = { ...(selectedClip.properties.transform || { x: 0, y: 0, scale: 1, rotation: 0 }) }; transform[key] = isAbsolute ? delta : transform[key] + delta; onUpdateClip(selectedClip.id, { properties: { ...selectedClip.properties, transform } }); };
    const toggleBool = (key: 'mirror' | 'reverse' | 'freeze') => { if (!selectedClip || !onUpdateClip) return; updateProp(key, !selectedClip.properties[key]); };
    const resetTransform = () => { if (!selectedClip || !onUpdateClip) return; onUpdateClip(selectedClip.id, { properties: { ...selectedClip.properties, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, fit: 'cover' } }); };
    const resetAll = () => { if (!selectedClip || !onUpdateClip) return; const currentText = selectedClip.properties.text; const safeProps = { ...defaultProps }; if (selectedClip.type === 'text') { safeProps.text = currentText || 'Texto'; safeProps.textDesign = {}; } onUpdateClip(selectedClip.id, { properties: safeProps, effect: undefined, transition: undefined, styleId: undefined }); };
    const toggleFavoriteVoice = (voiceId: string) => { const newFavs = favoriteVoices.includes(voiceId) ? favoriteVoices.filter(id => id !== voiceId) : [...favoriteVoices, voiceId]; setFavoriteVoices(newFavs); localStorage.setItem('proedit_fav_voices', JSON.stringify(newFavs)); };
    const groupVoices = () => { const groups: Record<string, typeof RESOURCES.ttsVoices.virtual> = {}; RESOURCES.ttsVoices.virtual.forEach(v => { const cat = v.category || 'Outros'; if (!groups[cat]) groups[cat] = []; groups[cat].push(v); }); return groups; };
    const handleSmartMagicSyncClick = () => {
        if (!magicAudio) return;
        if (magicSyncSource === 'gemini_image') {
            setShowMagicStyleModal(true);
        } else {
            onSmartMagicSync?.(magicAudio, magicSyncSource);
        }
    };

    const handleConfirmMagicStyle = () => {
        if (!magicAudio) return;
        setShowMagicStyleModal(false);
        onSmartMagicSync?.(magicAudio, magicSyncSource, selectedMagicStyle);
    };

    const renderVoiceOptions = () => {
        const groups = groupVoices();
        const allVoices = RESOURCES.ttsVoices.virtual;
        const favorites = allVoices.filter(v => favoriteVoices.includes(v.id));
        
        // Filter by selected language
        const filteredGroups = Object.entries(groups).filter(([category, voices]) => {
            if (ttsLangFilter === 'all') return true;
            return (voices as any[]).some(v => v.langId === ttsLangFilter);
        });

        return (
            <>
                {favorites.length > 0 && (
                    <optgroup key="favorites" label="⭐ Favoritos">
                        {favorites.map(v => (
                            <option key={`fav_${v.id}`} value={v.id}>⭐ {v.name}</option>
                        ))}
                    </optgroup>
                )}
                {filteredGroups.map(([category, voices]) => (
                    <optgroup key={category} label={category}>
                        {(voices as any[]).map(v => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                    </optgroup>
                ))}
            </>
        );
    };
    const handlePreviewTTS = async (textToPreview: string, overrideVoice?: string) => { if (!textToPreview.trim() || !onPreviewTTS) return; setTtsPreviewLoading(true); try { await onPreviewTTS(textToPreview, overrideVoice || ttsVoice, `${ttsStyle}|${ttsAccent}|${ttsEmotion}|${ttsNuance}`, ttsSpeed, ttsPitch); } catch(e: any) { console.error(e); } finally { setTtsPreviewLoading(false); } };
    const handleGenerateTTS = async () => { if (!ttsText.trim()) return; setTtsLoading(true); try { await onGenerateTTS(ttsText, ttsVoice, `${ttsStyle}|${ttsAccent}|${ttsEmotion}|${ttsNuance}`, ttsSpeed, ttsPitch, autoSubtitle, selectedSubtitleTemplate); setTtsText(''); } catch (e: any) { console.error(e); } finally { setTtsLoading(false); } };
    const handleGenerateNarration = async () => { if (!narrationText.trim() || !selectedClipId) return; setTtsLoading(true); try { await onGenerateNarration(narrationText, ttsVoice, selectedClipId, `${ttsStyle}|${ttsAccent}|${ttsEmotion}|${ttsNuance}`, ttsSpeed, ttsPitch, autoSubtitle, selectedSubtitleTemplate); setNarrationText(''); } catch (e: any) { console.error(e); } finally { setTtsLoading(false); } };
    const handleGenerateImage = async () => { if (!imgPrompt.trim()) return; setImgLoading(true); try { await onGenerateImage(`${imgStyle} Style. ${imgPrompt}`, '1:1'); setImgPrompt(''); } catch(e: any) { console.error(e); } setImgLoading(false); };
    const handleGenerateSubtitlesAction = async (scope: 'single' | 'all' | 'update_style') => { if (!onGenerateSubtitles) return; setSubtitlesLoading(true); try { await onGenerateSubtitles(scope, selectedSubtitleTemplate); } catch(e: any) { console.error(e); } setSubtitlesLoading(false); };
    const handleAddTextTemplate = (tpl: any) => { if (selectedClipId) { onAddText?.('update', { ...tpl.design, styleId: tpl.styleId } as any); } else { onAddText?.(tpl.styleId, tpl.design); } };
    const handleAddTextStyle = (styleId: string) => { if (selectedClipId) { onAddText?.('update', { styleId } as any); } else { onAddText?.(styleId); } };
    const handleAddTextEffect = (effectId: string, customStyle?: any) => { if (selectedClipId) { if (customStyle) { onAddText?.('update', { effectId, ...customStyle } as any); } else { onAddText?.('update', { effectId } as any); } } };
    
    const getDetailedStylePrompt = (style: string) => {
        const map: Record<string, string> = {
            "Fotorealista": "Photorealistic, hyper-realistic, 8k resolution, highly detailed, realistic textures, professional photography, raw photo",
            "Cinemático": "Cinematic shot, movie scene, dramatic lighting, 35mm film, anamorphic lens, 4k, color graded",
            "3D Render": "3D Render, Unreal Engine 5, octane render, raytracing, highly detailed, vray",
            "Anime (Studio Ghibli)": "Anime style, Studio Ghibli inspired, hand drawn, cel shaded, vibrant colors, hayao miyazaki style",
            "Cyberpunk": "Cyberpunk style, neon lights, futuristic, high tech, dark atmosphere, rain, reflections",
            "Vintage": "Vintage style, retro aesthetic, film grain, old photo, 1980s style",
            "Minimalista": "Minimalist style, clean lines, simple shapes, flat colors, modern art",
            "Pintura a Óleo": "Oil painting style, textured brushstrokes, classical art, detailed canvas",
            "Pixel Art": "Pixel art style, 16-bit, retro game aesthetic, sharp edges",
            "Noir (Preto e Branco)": "Film noir style, black and white, high contrast, dramatic shadows, mystery",
        };
        return map[style] || `${style} style, high quality`;
    };

    // --- STOCK SEARCH HANDLER ---
    const handleStockSearch = async (pageOverride?: number) => {
        if (!stockQuery.trim()) return;
        setIsSearchingStock(true);
        if(!pageOverride || pageOverride === 1) setStockResults([]);
        
        const page = pageOverride || stockPage;
        
        try {
            const keys = JSON.parse(localStorage.getItem('proedit_api_keys') || '{}');
            const results: any[] = [];

            // 1. PEXELS (Video & Image)
            if ((stockProvider === 'all' || stockProvider === 'pexels') && keys.pexelsKey) {
                const endpoint = stockType === 'video' 
                    ? `https://api.pexels.com/videos/search?query=${encodeURIComponent(stockQuery)}&per_page=15&page=${page}&orientation=landscape`
                    : `https://api.pexels.com/v1/search?query=${encodeURIComponent(stockQuery)}&per_page=15&page=${page}`;
                
                try {
                    const res = await fetch(endpoint, { headers: { Authorization: keys.pexelsKey } });
                    const data = await res.json();
                    if (stockType === 'video') {
                        (data.videos || []).forEach((v: any) => {
                            const videoFile = v.video_files.find((f: any) => f.height >= 720) || v.video_files[0];
                            if (videoFile) results.push({ id: `pex_v_${v.id}`, url: videoFile.link, thumb: v.image, duration: v.duration, source: 'Pexels', type: 'video', author: v.user.name });
                        });
                    } else {
                        (data.photos || []).forEach((p: any) => {
                            results.push({ id: `pex_i_${p.id}`, url: p.src.large2x, thumb: p.src.medium, source: 'Pexels', type: 'image', author: p.photographer });
                        });
                    }
                } catch (e) { console.error("Pexels fetch failed", e); }
            }

            // 2. PIXABAY (Video & Image)
            if ((stockProvider === 'all' || stockProvider === 'pixabay') && keys.pixabayKey) {
                const type = stockType === 'video' ? 'film' : 'photo';
                const endpoint = `https://pixabay.com/api/${stockType === 'video' ? 'videos/' : ''}?key=${keys.pixabayKey}&q=${encodeURIComponent(stockQuery)}&image_type=photo&per_page=15&page=${page}`;
                
                try {
                    const res = await fetch(endpoint);
                    const data = await res.json();
                    (data.hits || []).forEach((h: any) => {
                        if (stockType === 'video') {
                            const videoUrl = h.videos?.large?.url || h.videos?.medium?.url || h.videos?.small?.url;
                            if (videoUrl) results.push({ id: `pix_v_${h.id}`, url: videoUrl, thumb: `https://i.vimeocdn.com/video/${h.picture_id}_295x166.jpg`, duration: h.duration, source: 'Pixabay', type: 'video', author: h.user });
                        } else {
                            results.push({ id: `pix_i_${h.id}`, url: h.largeImageURL, thumb: h.webformatURL, source: 'Pixabay', type: 'image', author: h.user });
                        }
                    });
                } catch (e) { console.error("Pixabay fetch failed", e); }
            }

            // 3. UNSPLASH (Images Only)
            if ((stockProvider === 'all' || stockProvider === 'unsplash') && stockType === 'image' && keys.unsplashKey) {
                try {
                    const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(stockQuery)}&client_id=${keys.unsplashKey}&per_page=15&page=${page}`);
                    const data = await res.json();
                    (data.results || []).forEach((p: any) => {
                        results.push({ id: `uns_i_${p.id}`, url: p.urls.regular, thumb: p.urls.small, source: 'Unsplash', type: 'image', author: p.user.name });
                    });
                } catch (e) { console.error("Unsplash fetch failed", e); }
            }

            setStockResults(results);
        } catch (e) {
            console.error("Stock Search Error:", e);
            alert("Erro na busca. Verifique suas chaves de API nas configurações.");
        } finally {
            setIsSearchingStock(false);
        }
    };

    const handlePreviewStock = (url: string) => {
        if (activeStockPreview === url) {
            setActiveStockPreview(null);
            if(stockPreviewRef.current) { stockPreviewRef.current.pause(); stockPreviewRef.current = null; }
        } else {
            setActiveStockPreview(url);
        }
    };

    const handleLoadPage = (newPage: number) => {
        setStockPage(newPage);
        handleStockSearch(newPage);
    };

    // ... (Existing helper functions: addManualScene, removeManualScene, updateManualScene, handleUrlFetch, handleSpeechToText, handleFileUpload, handleAudioFileUpload, processScript, handleSearchFreesoundClick, handleGenerateMusicClick, regenerateImage, handleOpenEditImageModal, handleConfirmEditImage, handleMovementClick, handleApplyMovement) ...
    const addManualScene = () => { setManualScenes([...manualScenes, { id: `m${Date.now()}`, narration: '', visual: '', speaker: manualScenes.length % 2 === 0 ? 'narrator1' : 'narrator2' }]); };
    const removeManualScene = (id: string) => { if (manualScenes.length > 1) { setManualScenes(manualScenes.filter(s => s.id !== id)); } };
    const updateManualScene = (id: string, field: keyof ScriptScene, value: string) => { setManualScenes(manualScenes.map(s => s.id === id ? { ...s, [field]: value } : s)); };
    const handleUrlFetch = async () => { if (!scriptUrl.trim() || !onFetchUrl) return; setIsFetchingUrl(true); try { const text = await onFetchUrl(scriptUrl); setScriptText(text); setScriptSource('text'); if (text) alert("Áudio do vídeo escutado! Conteúdo transcrito e importado. Agora clique em Gerar."); } catch (e: any) { alert("Erro ao buscar URL."); } finally { setIsFetchingUrl(false); } };
    const handleSpeechToText = () => { if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) { alert("Seu navegador não suporta reconhecimento de fala. Use o Chrome ou Edge."); return; } const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; const recognition = new SpeechRecognition(); recognition.lang = 'pt-BR'; recognition.interimResults = false; recognition.maxAlternatives = 1; if (isListening) { recognition.stop(); setIsListening(false); return; } setIsListening(true); recognition.start(); recognition.onresult = (event: any) => { const speechResult = event.results[0][0].transcript; setScriptText(prev => prev ? prev + ' ' + speechResult : speechResult); setScriptSource('text'); setIsListening(false); }; recognition.onerror = (event: any) => { console.error("Speech Error:", event.error); setIsListening(false); }; recognition.onend = () => { setIsListening(false); }; };
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (evt) => { if (evt.target?.result) { setScriptText(evt.target.result as string); setScriptSource('text'); } }; reader.readAsText(file); };
    const handleAudioFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file || !onTranscribeAudio) return; setScriptLoading(true); try { const transcribedText = await onTranscribeAudio(file); setScriptText(transcribedText); setScriptSource('text'); } catch (e: any) { console.error("Audio Transcription Error:", e); alert("Erro ao transcrever áudio."); } finally { setScriptLoading(false); } };
    
    // UPDATED: Process Script function using HINTS from UI state
    const processScript = async () => { 
        if (!onAnalyzeScript) return;
        
        let scenesToProcess: ScriptScene[] = [];
        const strongStylePrompt = getDetailedStylePrompt(scriptImageStyle);
        
        if (scriptInputMode === 'auto') {
            let effectiveScript = scriptText;
            
            // Handle URL fetch if not fetched yet
            if (scriptSource === 'url' && !effectiveScript.trim() && scriptUrl.trim()) {
                if (onFetchUrl) { 
                    try { 
                        setScriptLoading(true); 
                        const fetched = await onFetchUrl(scriptUrl); 
                        if (fetched) { 
                            effectiveScript = fetched; 
                            setScriptText(fetched); 
                            setScriptSource('text'); 
                        } else { 
                            setScriptLoading(false); 
                            return; 
                        } 
                    } catch(e) { 
                        setScriptLoading(false); 
                        return; 
                    } 
                }
            }
            
            const hasText = effectiveScript.trim().length > 0;
            if (!hasText) { alert("Por favor, digite um tópico, roteiro, ou insira uma URL válida para continuar."); setScriptLoading(false); return; }
            
            setScriptLoading(true); setScriptMood(''); setScriptGenre(''); setScriptMusicPrompt(''); setSelectedBgMusic('');
            
            try { 
                let result: ScriptAnalysisResult = { scenes: [] }; 
                let inputPayload = ""; 
                const durationHint = fullScriptMode ? ` ||DURATION_HINT: FULL_SCRIPT` : ` ||DURATION_HINT: ${scriptDuration}`;
                // APPENDING HINTS:
                const energyHintStr = ` ||ENERGY_HINT: ${scriptEnergy}`;
                const styleHintStr = ` ||STYLE_HINT: ${scriptImageStyle}`;
                const modelHintStr = ` ||MODEL_HINT: ${scriptAIModel}`;
                
                const hints = `${durationHint}${energyHintStr}${styleHintStr}${modelHintStr}`;

                if (scriptFormat === 'dialogue') { 
                    inputPayload = `REMAKE_AS_DIALOGUE: ${effectiveScript}${hints}`; 
                    if (effectiveScript.length < 200 && !effectiveScript.includes('http')) { 
                        inputPayload = `GENERATE_PODCAST_TOPIC: ${effectiveScript}${hints}`; 
                    } 
                } else { 
                    inputPayload = `REMAKE_AS_MONOLOGUE: ${effectiveScript}${hints}`; 
                }
                
                result = (await onAnalyzeScript(inputPayload)) || { scenes: [] }; 
                scenesToProcess = result.scenes;
                
                if (scenesToProcess.length === 0) { throw new Error("A análise do roteiro não retornou nenhuma cena."); } 
                
                setScriptMood(result.mood || 'Desconhecido'); setScriptGenre(result.genre || 'Cinematic'); setScriptMusicPrompt(result.musicPrompt || '');
                
                if (includeAudioEffects && onSearchFreesound && result.musicSearch) { 
                    try { 
                        console.log(`[Magic Script] Searching Music for: ${result.musicSearch}`);
                        const musicResults = await onSearchFreesound(result.musicSearch); 
                        if (musicResults && musicResults.length > 0) { 
                            const previewUrl = musicResults[0].previews['preview-hq-mp3'] || musicResults[0].previews['preview-lq-mp3']; 
                            if (previewUrl) { 
                                console.log(`[Magic Script] Music Found: ${previewUrl}`);
                                setSelectedBgMusic(previewUrl); 
                            } 
                        } else {
                            console.log(`[Magic Script] No Music found for: ${result.musicSearch}`);
                        }
                    } catch(e: any) { 
                        console.warn("Auto music search failed", e); 
                    } 
                }
            } catch (e: any) { console.error(e); alert(`Erro ao processar roteiro: ${e.message}`); setScriptLoading(false); return; } 
        } else { 
            scenesToProcess = manualScenes.filter(s => s.narration.trim() !== ''); 
            if (scenesToProcess.length === 0) { alert("Adicione pelo menos uma cena com texto."); return; } 
            setScriptLoading(true); 
        }
        
        try { 
            setGeneratedScenes(scenesToProcess.map(s => ({ ...s, isGenerating: true }))); 
            setScriptStage('review'); 
            const finalScenes: ScriptScene[] = []; 
            if (onGenerateSceneMedia) {
                for (const scene of scenesToProcess) { 
                    let completedScene = await onGenerateSceneMedia(scene, narrator1Voice, strongStylePrompt, scriptAspectRatio, scriptMediaSource, narrator1Voice, narrator2Voice, characterDescription, generateNarration); 
                    const sfxTerm = completedScene.sfxSearch || completedScene.visual?.split(' ').slice(0, 3).join(' ');
                    if (includeAudioEffects && onSearchFreesound && sfxTerm) { 
                        try { 
                            console.log(`[Magic Script] Searching SFX for: ${sfxTerm}`);
                            const sfxResults = await onSearchFreesound(sfxTerm); 
                            if (sfxResults && sfxResults.length > 0) { 
                                const previewUrl = sfxResults[0].previews['preview-hq-mp3'] || sfxResults[0].previews['preview-lq-mp3']; 
                                if (previewUrl) { 
                                    console.log(`[Magic Script] SFX Found: ${previewUrl}`);
                                    completedScene.sfxUrl = previewUrl; 
                                } 
                            } else {
                                console.log(`[Magic Script] No SFX found for: ${sfxTerm}`);
                            }
                        } catch(e: any) { 
                            console.warn("Auto SFX search failed for scene", e); 
                        } 
                    } 
                    finalScenes.push({ ...completedScene, isGenerating: false }); 
                    setGeneratedScenes([...finalScenes, ...scenesToProcess.slice(finalScenes.length).map(s => ({...s, isGenerating: true}))]); 
                } 
            }
            setGeneratedScenes(finalScenes); 
        } catch (e: any) { console.error(e); alert(`Erro na geração: ${e.message}`); setScriptStage('input'); } finally { setScriptLoading(false); } 
    };

    const handleSearchFreesoundClick = async () => { if (!onSearchFreesound) return; const genre = scriptGenre || 'Cinematic'; const mood = scriptMood || 'Dramatic'; setIsSearchingMusic(true); try { const query = `${genre} ${mood} music`; const results = await onSearchFreesound(query); if (results && results.length > 0) { const result = results[0]; const previewUrl = result.previews['preview-hq-mp3'] || result.previews['preview-lq-mp3']; if (previewUrl) { setSelectedBgMusic(previewUrl); alert(`Música selecionada: ${result.name}`); } else { alert("Músicas encontradas, mas sem preview disponível."); } } else { alert("Nenhuma música encontrada no Freesound para este clima. Verifique se a API Key está configurada corretamente."); } } catch(e: any) { console.error(e); alert("Erro ao buscar música."); } finally { setIsSearchingMusic(false); } };
    const handleGenerateMusicClick = () => { if (!onGenerateMusic || !scriptMusicPrompt) return; onGenerateMusic(scriptMusicPrompt, 30); alert("Gerando música com AI... Aguarde na timeline."); };
    const regenerateImage = async (index: number) => { if (!onRegenerateSceneImage) return; const scenes = [...generatedScenes]; scenes[index].isGenerating = true; scenes[index].error = undefined; setGeneratedScenes(scenes); try { const updatedScene = await onRegenerateSceneImage(scenes[index], scriptImageStyle, scriptAspectRatio, scriptMediaSource, characterDescription); scenes[index] = { ...updatedScene, isGenerating: false }; setGeneratedScenes(scenes); } catch (e: any) { scenes[index].isGenerating = false; setGeneratedScenes(scenes); } };
    const handleOpenEditImageModal = (index: number) => { setEditingSceneIndex(index); setEditImagePrompt(''); setShowEditImageModal(true); };
    const handleConfirmEditImage = async () => { if (!onEditSceneImage || editingSceneIndex === null || !editImagePrompt.trim()) return; const sceneToEdit = generatedScenes[editingSceneIndex]; const scenes = [...generatedScenes]; scenes[editingSceneIndex].isGenerating = true; setGeneratedScenes(scenes); setShowEditImageModal(false); try { const updatedScene = await onEditSceneImage(sceneToEdit, editImagePrompt); scenes[editingSceneIndex] = { ...updatedScene, isGenerating: false }; setGeneratedScenes(scenes); } catch(err: any) { scenes[editingSceneIndex].isGenerating = false; setGeneratedScenes(scenes); } };
    const handleMovementClick = (mov: any, id: string) => { if (!mov) return; if (mov.controls && Object.keys(mov.controls).length > 0) { const defaultConfig = Object.entries(mov.controls).reduce((acc, [key, value]: [string, any]) => { if (value && typeof value === 'object' && value.default !== undefined) { acc[key] = value.default; } else { acc[key] = 0; } return acc; }, {} as Record<string, number>); setMovementControl({ id: id, name: mov.name, config: defaultConfig, controls: mov.controls, }); } else { const payload = mov.type === 'kenBurns' ? { type: 'kenBurns', config: mov.config } : { type: id, config: {} }; onApplyResource?.('movement', id, payload); } };
    const handleApplyMovement = () => { if (!movementControl) return; const payload: MovementConfig = { type: movementControl.id, config: movementControl.config }; onApplyResource?.('movement', movementControl.id, payload); setMovementControl(null); };
    
    const tabStyles: Record<Tab, { color: string, icon: string, label: string }> = { 
        media: { color: '#5865F2', icon: 'fa-photo-film', label: 'Mídia' }, 
        stock: { color: '#F59E0B', icon: 'fa-globe', label: 'Stock' },
        edit: { color: '#FF6B6B', icon: 'fa-scissors', label: 'Editar' }, 
        layer: { color: '#14B8A6', icon: 'fa-layer-group', label: 'Camada' }, 
        audio: { color: '#EB459E', icon: 'fa-music', label: 'Áudio' }, 
        text: { color: '#54B471', icon: 'fa-font', label: 'Texto' }, 
        subtitles: { color: '#FDBA74', icon: 'fa-closed-captioning', label: 'Legendas' }, 
        effects: { color: '#9457EB', icon: 'fa-wand-magic-sparkles', label: 'Efeitos' }, 
        ratio: { color: '#14B8A6', icon: 'fa-vector-square', label: 'Proporção' }, 
        background: { color: '#9CA3AF', icon: 'fa-image', label: 'Fundo' }, 
        'ai-video': { color: '#F472B6', icon: 'fa-video', label: 'AI Video' },
        'magic-sync': { color: '#FCD34D', icon: 'fa-bolt-lightning', label: 'Sincronização' },
        'music-ai': { color: '#8B5CF6', icon: 'fa-guitar', label: 'Música AI' }
    };
    const renderTabButton = (tab: Tab) => { 
        const style = tabStyles[tab]; 
        const isActive = activeTab === tab; 
        return ( 
            <button 
                key={tab}
                onClick={() => setActiveTab(tab)} 
                className={`flex flex-col items-center justify-center w-full py-3 md:py-6 gap-0.5 md:gap-2 text-[9px] md:text-sm transition-all border-l-[3px] md:border-l-4 group hover:bg-zinc-800`} 
                style={{ backgroundColor: isActive ? `${style.color}20` : undefined, borderLeftColor: isActive ? style.color : 'transparent' }} 
            > 
                <i 
                    className={`fas ${style.icon} text-lg md:text-2xl mb-0.5 transition-transform group-hover:scale-110`} 
                    style={{ color: isActive ? style.color : '#71717a' }}
                ></i> 
                <span className="font-bold tracking-tight w-full text-center truncate px-0.5" style={{ color: isActive ? 'white' : '#71717a' }}>{style.label}</span> 
            </button> 
        ); 
    };
    
    const renderToolBtn = (label: string, icon: string, color: string, action: () => void, disabled?: boolean) => ( <button onClick={(e) => { e.stopPropagation(); if(!disabled) action(); }} disabled={disabled} className={`flex flex-col items-center justify-center p-3 md:p-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-all duration-200 transform hover:scale-105 active:scale-95 gap-2 md:gap-3 group border border-zinc-700 hover:border-${color.split('-')[1]}-500 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed h-full w-full`} > <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full ${color} flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform text-lg md:text-2xl`}> <i className={`fas ${icon}`}></i> </div> <span className="text-[10px] md:text-xs font-bold text-center text-gray-200 group-hover:text-white leading-tight px-1 uppercase tracking-wide">{label}</span> </button> );
    const renderEditButton = (icon: string, label: string, onClick?: () => void, disabled?: boolean, colorClass?: string) => ( <button onClick={(e) => { e.stopPropagation(); onClick?.(); }} disabled={disabled} className={`group flex flex-col items-center justify-center gap-1.5 md:gap-2 p-3 md:p-4 rounded-xl text-white transition-all duration-200 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-md ${colorClass || 'bg-zinc-700 hover:bg-zinc-600'}`} > <i className={`fas ${icon} text-lg md:text-2xl mb-1 transition-transform group-hover:scale-125`}></i> <span className="text-[10px] md:text-xs font-bold text-center leading-tight">{label}</span> </button> );
    const handleApplyTTSModel = (modelId: string) => {
        const model = (RESOURCES as any).ttsModels.find((m: any) => m.id === modelId);
        if (model) {
            setTtsStyle(model.config.style || 'normal');
            setTtsAccent(model.config.accent || 'none');
            setTtsEmotion(model.config.emotion || 'neutral');
            setTtsNuance(model.config.nuance || 'none');
            // addToast(`Modelo "${model.name}" aplicado!`, 'info');
        }
    };

    const renderAudioControls = (isNarration: boolean, textToPreview: string) => ( 
        <div className="space-y-3 mt-2 border-t border-zinc-700 pt-3"> 
            <div className="grid grid-cols-2 gap-2"> 
                {/* Predefined Models */}
                <div className="col-span-2">
                    <label className="text-[10px] text-gray-400 mb-1 block uppercase font-bold tracking-tighter">Modelos de Performance (Presets)</label>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                        {(RESOURCES as any).ttsModels.map((m: any) => (
                            <button 
                                key={m.id}
                                onClick={() => handleApplyTTSModel(m.id)}
                                className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-[9px] text-gray-300 font-bold flex items-center gap-1 transition-colors"
                            >
                                <i className="fas fa-wand-sparkles text-pink-500"></i> {m.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="col-span-2">
                    <label className="text-[10px] text-gray-400 mb-1 block uppercase font-bold tracking-tighter">Filtro de Idioma</label>
                    <select 
                        value={ttsLangFilter} 
                        onChange={(e) => setTtsLangFilter(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded p-1.5 text-xs text-white focus:border-indigo-500 outline-none mb-2"
                    >
                        <option value="all">🌎 Todos os Idiomas</option>
                        <option value="pt-br">🇧🇷 Português (BR)</option>
                        <option value="en-us">🇺🇸 Inglês (EUA)</option>
                        <option value="en-uk">🇬🇧 Inglês (UK)</option>
                        <option value="es-es">🇪🇸 Espanhol</option>
                        <option value="fr-fr">🇫🇷 Francês</option>
                        <option value="de-de">🇩🇪 Alemão</option>
                        <option value="it-it">🇮🇹 Italiano</option>
                        <option value="ru-ru">🇷🇺 Russo</option>
                        <option value="jp-jp">🇯🇵 Japonês</option>
                    </select>
                </div>
                <div className="col-span-2"> 
                    <label className="text-[10px] text-gray-400 mb-1 block uppercase font-bold tracking-tighter">Voz Ultra-Realista (Gemini AI)</label> 
                    <div className="flex items-center gap-1 w-full"> 
                        <select value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)} className="flex-1 bg-zinc-800 border border-zinc-700 rounded p-1.5 text-xs text-white focus:border-indigo-500 outline-none min-w-0" > 
                            {renderVoiceOptions()} 
                        </select> 
                        <button onClick={() => toggleFavoriteVoice(ttsVoice)} className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded border transition-colors ${favoriteVoices.includes(ttsVoice) ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400' : 'bg-zinc-700 border-zinc-600 text-gray-400'}`} title={favoriteVoices.includes(ttsVoice) ? "Remover dos Favoritos" : "Adicionar aos Favoritos"} > 
                            <i className={`fas fa-star ${favoriteVoices.includes(ttsVoice) ? 'fa-solid' : 'fa-regular'}`}></i> 
                        </button> 
                        <button onClick={() => handlePreviewTTS(textToPreview || "Este é um teste de voz ultra realista.")} disabled={ttsPreviewLoading} className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white rounded border border-indigo-400 transition-colors" title="Ouvir Exemplo" > 
                            {ttsPreviewLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-play"></i>} 
                        </button> 
                    </div> 
                </div> 
                <div className="col-span-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div> 
                        <label className="text-[10px] text-gray-400 mb-1 block uppercase font-bold tracking-tighter">Sotaque</label> 
                        <select value={ttsAccent} onChange={(e) => setTtsAccent(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded p-1.5 text-xs text-white focus:border-indigo-500 outline-none" > 
                            {(RESOURCES as any).ttsAccents.map((s: any) => ( 
                                <option key={s.id} value={s.id}>{s.name}</option> 
                            ))} 
                        </select> 
                    </div> 
                    <div> 
                        <label className="text-[10px] text-gray-400 mb-1 block uppercase font-bold tracking-tighter">Estilo</label> 
                        <select value={ttsStyle} onChange={(e) => setTtsStyle(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded p-1.5 text-xs text-white focus:border-indigo-500 outline-none" > 
                            {RESOURCES.ttsStyles.map((s: any) => ( 
                                <option key={s.id} value={s.id}>{s.name}</option> 
                            ))} 
                        </select> 
                    </div> 
                    <div> 
                        <label className="text-[10px] text-gray-400 mb-1 block uppercase font-bold tracking-tighter">Emoção</label> 
                        <select value={ttsEmotion} onChange={(e) => setTtsEmotion(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded p-1.5 text-xs text-white focus:border-indigo-500 outline-none" > 
                            {(RESOURCES as any).ttsEmotions.map((s: any) => ( 
                                <option key={s.id} value={s.id}>{s.name}</option> 
                            ))} 
                        </select> 
                    </div> 
                    <div className="md:col-span-3"> 
                        <label className="text-[10px] text-gray-400 mb-1 block uppercase font-bold tracking-tighter">Nuances de Voz (Human Performance)</label> 
                        <select value={ttsNuance} onChange={(e) => setTtsNuance(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded p-1.5 text-xs text-white focus:border-indigo-500 outline-none" > 
                            {(RESOURCES as any).ttsNuances.map((s: any) => ( 
                                <option key={s.id} value={s.id}>{s.name}</option> 
                            ))} 
                        </select> 
                    </div> 
                </div> 
                <div> 
                    <label className="text-[10px] text-gray-400 mb-1 block uppercase font-bold tracking-tighter">Ajuste de Tom/Veloc.</label> 
                    <div className="flex gap-1 items-center h-[28px]"> 
                        <div className="flex-1 flex items-center gap-1"> 
                            <i className="fas fa-tachometer-alt text-[10px] text-gray-500"></i>
                            <input type="range" min="0.5" max="2" step="0.1" value={ttsSpeed} onChange={(e) => setTtsSpeed(parseFloat(e.target.value))} className="w-full h-1 bg-zinc-600 rounded-lg appearance-none cursor-pointer accent-indigo-500" title={`Velocidade: ${ttsSpeed}x`} /> 
                        </div> 
                        <div className="flex-1 flex items-center gap-1"> 
                            <i className="fas fa-arrows-alt-v text-[10px] text-gray-500"></i>
                            <input type="range" min="-10" max="10" step="1" value={ttsPitch} onChange={(e) => setTtsPitch(parseFloat(e.target.value))} className="w-full h-1 bg-zinc-600 rounded-lg appearance-none cursor-pointer accent-indigo-500" title={`Tom: ${ttsPitch}`} /> 
                        </div> 
                    </div> 
                </div> 
                <div className="col-span-2 pt-1"> 
                    <label className="flex items-center gap-2 cursor-pointer p-1.5 bg-zinc-800 rounded border border-zinc-700 hover:border-indigo-500 transition-colors"> 
                        <input type="checkbox" checked={autoSubtitle} onChange={(e) => setAutoSubtitle(e.target.checked)} className="accent-indigo-500 w-3 h-3" /> 
                        <span className="text-xs text-white font-medium">Legendas Geradas por IA</span> 
                    </label> 
                </div> 
            </div> 
        </div> 
    );
    const previewImg1 = RESOURCES.previewImage; 
    const previewImg2 = RESOURCES.previewImage.replace('2873277', '1748011');
    const groupedSubtitles = (TEXT_RESOURCES.templates as any[]).reduce((acc, tpl) => { const cat = tpl.category || 'Outros'; if (!acc[cat]) acc[cat] = []; acc[cat].push(tpl); return acc; }, {} as Record<string, typeof TEXT_RESOURCES.templates>);
    const filterItems = (group: any, items: any) => { if (!showFavoritesOnly) return items; const filtered: any = {}; Object.entries(items).forEach(([id, item]) => { if (favorites.includes(id)) filtered[id] = item; }); return Object.keys(filtered).length > 0 ? filtered : null; };

    return (
        <div className="flex bg-zinc-800 rounded-lg overflow-hidden h-full">
            <nav className="w-16 md:w-32 flex-shrink-0 border-r border-zinc-700 bg-zinc-900 overflow-y-auto scrollbar-thin">
                {Object.keys(tabStyles).map(tab => renderTabButton(tab as Tab))}
            </nav>
            <div className="flex-1 p-4 overflow-y-auto bg-zinc-800 scrollbar-thin relative">
                <input type="file" ref={replaceInputRef} className="hidden" accept="video/*,image/*" onChange={(e) => onReplace?.(e.target.files)} />
                <input type="file" ref={styleImageInputRef} className="hidden" accept="image/*" onChange={(e) => { if (e.target.files?.[0]) { onStartStyleTransfer?.(e.target.files[0]); } }} />

                {activeTab === 'media' && (
                    <>
                         <button onClick={() => setShowScriptModal(true)} className="w-full py-3 mb-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2 border border-purple-400/30"> <i className="fas fa-scroll text-yellow-300"></i> Roteiro Mágico (Script-to-Video) </button>
                         <div className="mb-4 bg-zinc-900 p-3 rounded-lg border border-zinc-700"> 
                            <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Gerar com IA</h3> 
                            <div className="flex flex-col gap-2"> 
                                <textarea value={imgPrompt} onChange={(e) => setImgPrompt(e.target.value)} placeholder="Descreva a imagem..." className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none resize-none h-20" /> 
                                <div className="grid grid-cols-2 gap-2"> 
                                    <select value={imgStyle} onChange={(e) => setImgStyle(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded p-2 text-xs text-white focus:border-blue-500 outline-none"> 
                                        {/* Use grouped categories for Image Generation */}
                                        {Object.entries(IMAGE_STYLE_CATEGORIES).map(([category, styles]) => (
                                            <optgroup key={category} label={category}>
                                                {styles.map(style => <option key={style} value={style}>{style}</option>)}
                                            </optgroup>
                                        ))}
                                    </select> 
                                    <button onClick={handleGenerateImage} disabled={imgLoading} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-bold transition-colors flex items-center justify-center gap-1" > 
                                        {imgLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-image"></i>} Criar Imagem 
                                    </button> 
                                </div> 
                                <button onClick={() => setActiveTab('ai-video')} className="w-full py-2 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white rounded text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-lg mt-2" > <i className="fas fa-video"></i> Gerar Vídeo (Veo/Sora) </button> 
                            </div> 
                         </div>
                        <label className="flex items-center justify-center w-full py-2 mb-4 bg-zinc-700 hover:bg-zinc-600 rounded cursor-pointer text-sm font-medium text-white transition-colors shadow-sm"> <i className="fas fa-upload mr-2"></i> Importar Arquivos <input type="file" multiple accept="video/*,image/*,audio/*" className="hidden" onChange={(e) => onImport(e.target.files)} /> </label>
                        <div className="grid grid-cols-2 gap-2"> 
                            {(Object.values(mediaLibrary) as MediaItem[]).map((media) => (
                                <div key={media.name} draggable onDragStart={(e) => onDragStart(e, 'media', media.name, media)} onDoubleClick={() => onAddToTimeline?.(media)} className="relative aspect-video bg-zinc-900 rounded overflow-hidden cursor-move border border-zinc-700 group hover:border-blue-500 transition-all"> 
                                    {media.type === 'video' || media.type === 'image' ? <img src={media.thumbnail || undefined} alt={media.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-500"><i className="fas fa-file-audio text-2xl md:text-3xl"></i></div>} 
                                    <div className="absolute inset-x-0 bottom-0 p-1 bg-black/60 text-[10px] text-white truncate">{media.name}</div> 
                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white pointer-events-none transition-opacity"><i className="fas fa-plus text-2xl drop-shadow-md"></i></div>
                                    <button className="absolute top-1 right-1 w-5 h-5 bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:bg-red-600 pointer-events-auto" onClick={(e) => { e.stopPropagation(); if (onDeleteMedia) onDeleteMedia(media.name); else if (onDelete) onDelete(); }} title="Excluir arquivo da biblioteca" > <i className="fas fa-trash text-[10px]"></i> </button> 
                                    <button className="absolute top-1 left-1 w-5 h-5 bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:bg-blue-600 pointer-events-auto" onClick={(e) => { e.stopPropagation(); const a = document.createElement('a'); a.href = media.url; a.download = media.name; a.click(); }} title="Baixar mídia original" > <i className="fas fa-download text-[10px]"></i> </button>
                                </div> 
                            ))} 
                        </div>
                    </>
                )}

                {activeTab === 'stock' && (
                    <div className="flex flex-col h-full overflow-hidden">
                        <div className="bg-gradient-to-r from-amber-600/30 to-orange-600/30 border border-amber-500/30 p-3 rounded-lg mb-4 flex-shrink-0">
                            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
                                <i className="fas fa-globe"></i> Stock Media
                            </h3>
                            <p className="text-[10px] text-amber-200/80 mt-1">Busque vídeos e imagens gratuitos (Pexels, Pixabay, Unsplash)</p>
                        </div>

                        {/* Stock Provider Selection */}
                        <div className="flex bg-zinc-900 p-1 rounded-lg mb-2 overflow-x-auto scrollbar-thin">
                            {['all', 'pexels', 'pixabay', 'unsplash'].map(p => (
                                <button 
                                    key={p} 
                                    onClick={() => setStockProvider(p as any)}
                                    className={`flex-1 py-1.5 px-2 text-[10px] font-bold rounded transition-colors capitalize ${stockProvider === p ? 'bg-amber-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-col gap-2 mb-2 flex-shrink-0">
                            <div className="flex bg-zinc-900 p-1 rounded-lg">
                                <button onClick={() => setStockType('video')} className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors ${stockType === 'video' ? 'bg-amber-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}>
                                    <i className="fas fa-video mr-1"></i> Vídeos
                                </button>
                                <button onClick={() => setStockType('image')} className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors ${stockType === 'image' ? 'bg-amber-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}>
                                    <i className="fas fa-image mr-1"></i> Imagens
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={stockQuery}
                                    onChange={(e) => setStockQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleStockSearch(1)}
                                    placeholder={stockType === 'video' ? "Ex: Kart, Drone, Nature..." : "Ex: Paisagem, Cyberpunk..."}
                                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                                />
                                <button 
                                    onClick={() => handleStockSearch(1)} 
                                    disabled={isSearchingStock}
                                    className="bg-amber-600 hover:bg-amber-500 text-white px-4 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50"
                                >
                                    {isSearchingStock ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-search"></i>}
                                </button>
                            </div>
                            {stockType === 'image' && (
                                <a 
                                    href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(stockQuery || 'stock photos')}`} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="text-[10px] text-blue-400 hover:text-blue-300 text-center flex items-center justify-center gap-1"
                                >
                                    <i className="fab fa-google"></i> Buscar no Google Imagens
                                </a>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto scrollbar-thin grid grid-cols-2 gap-2 content-start pb-4">
                            {stockResults.length === 0 && !isSearchingStock && (
                                <div className="col-span-2 text-center text-gray-500 py-8 text-xs italic">
                                    Digite para buscar... (Requer chaves de API configuradas)
                                </div>
                            )}
                            {stockResults.map((item, idx) => (
                                <div 
                                    key={`${item.id}_${idx}`} 
                                    className="relative aspect-video bg-zinc-900 rounded-lg overflow-hidden group border border-zinc-700 hover:border-amber-500 cursor-pointer"
                                    onClick={() => onImportRemoteMedia?.(item.url, `stock_${item.id}.${stockType === 'video' ? 'mp4' : 'jpg'}`, stockType, stockType === 'video' ? 'video' : 'camada')}
                                    onMouseEnter={() => handlePreviewStock(item.url)}
                                    onMouseLeave={() => handlePreviewStock('')}
                                >
                                    {stockType === 'video' && activeStockPreview === item.url ? (
                                        <video 
                                            src={item.url || undefined} 
                                            autoPlay 
                                            muted 
                                            loop 
                                            className="w-full h-full object-cover" 
                                            ref={stockPreviewRef}
                                        />
                                    ) : (
                                        <img src={item.thumb || undefined} alt={item.tags} className="w-full h-full object-cover" />
                                    )}
                                    
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                        <i className="fas fa-plus-circle text-white text-2xl drop-shadow-lg"></i>
                                    </div>
                                    
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1 flex justify-between items-center">
                                        <span className="text-[8px] text-gray-300 truncate max-w-[70%]">{item.source}</span>
                                        {item.duration && <span className="text-[8px] text-white font-mono">{Math.round(item.duration)}s</span>}
                                    </div>
                                    <div className="absolute top-1 right-1 bg-black/50 text-[8px] text-white px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                        by {item.author}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Pagination Controls */}
                        {stockResults.length > 0 && (
                            <div className="flex items-center justify-center gap-3 py-2 border-t border-zinc-700 flex-shrink-0">
                                <button 
                                    onClick={() => handleLoadPage(Math.max(1, stockPage - 1))}
                                    disabled={stockPage <= 1 || isSearchingStock}
                                    className="w-8 h-8 rounded-full bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white flex items-center justify-center transition-colors"
                                >
                                    <i className="fas fa-chevron-left"></i>
                                </button>
                                <div className="flex items-center gap-1">
                                    <span className="text-xs font-bold text-gray-300">Pág. {stockPage}</span>
                                </div>
                                <button 
                                    onClick={() => handleLoadPage(stockPage + 1)}
                                    disabled={isSearchingStock}
                                    className="w-8 h-8 rounded-full bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white flex items-center justify-center transition-colors"
                                >
                                    <i className="fas fa-chevron-right"></i>
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'ai-video' && (
                    <AIVideoTab 
                        onGenerate={onGenerateVeo!} 
                        isGenerating={false} 
                    />
                )}

                {activeTab === 'magic-sync' && (
                    <div className="h-full flex flex-col p-6 overflow-y-auto scrollbar-thin space-y-8">
                        <div className="bg-gradient-to-r from-yellow-600/20 to-amber-600/20 border border-yellow-500/30 p-5 rounded-2xl">
                            <h3 className="text-xl font-black text-white flex items-center gap-3 uppercase tracking-wider">
                                <i className="fa-solid fa-bolt-lightning text-yellow-400 text-2xl"></i>
                                Sincronização Mágica
                            </h3>
                            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                                Transforme seu áudio em um vídeo completo. O sistema criará cortes dinâmicos, adicionará camadas visuais, música de fundo e efeitos sonoros automaticamente.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] px-1">1. Áudio de Referência</label>
                            <div 
                                className={`group relative border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer overflow-hidden ${
                                    magicAudio 
                                    ? 'border-yellow-500/50 bg-yellow-500/5' 
                                    : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-500 hover:bg-zinc-800/50'
                                }`}
                                onClick={() => {
                                    const input = document.createElement('input');
                                    input.type = 'file';
                                    input.accept = 'audio/*';
                                    input.onchange = (e) => {
                                        const file = (e.target as HTMLInputElement).files?.[0];
                                        if (file) setMagicAudio(file);
                                    };
                                    input.click();
                                }}
                            >
                                {magicAudio ? (
                                    <div className="flex flex-col items-center gap-3 animate-in fade-in zoom-in duration-300">
                                        <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center shadow-lg shadow-yellow-500/10">
                                            <i className="fa-solid fa-file-audio text-3xl text-yellow-400"></i>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-sm font-bold text-white block truncate max-w-[250px]">{magicAudio.name}</span>
                                            <span className="text-[10px] text-zinc-500 block">Áudio carregado com sucesso</span>
                                        </div>
                                        <button 
                                            className="px-4 py-1.5 bg-zinc-800 hover:bg-red-600 text-zinc-400 hover:text-white rounded-full text-[10px] font-bold transition-all mt-2 border border-zinc-700 hover:border-red-500"
                                            onClick={(e) => { e.stopPropagation(); setMagicAudio(null); }}
                                        >
                                            <i className="fas fa-trash-alt mr-2"></i>
                                            Remover Arquivo
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-4 py-4">
                                        <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <i className="fa-solid fa-cloud-arrow-up text-3xl text-zinc-600 group-hover:text-zinc-400 transition-colors"></i>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-sm font-bold text-zinc-300 block">Clique para enviar o áudio</span>
                                            <span className="text-[10px] text-zinc-500 block">MP3, WAV ou M4A (Máx 50MB)</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-6 pt-6 border-t border-zinc-700/50">
                            <div className="space-y-2">
                                <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] px-1">2. Escolha a Fonte Visual</h4>
                                <p className="text-[10px] text-zinc-500 px-1 italic">
                                    O Gemini analisará o áudio e buscará/gerará a mídia escolhida com cortes dinâmicos.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {[
                                    { id: 'mixed', label: 'Misto', icon: 'fa-wand-magic-sparkles', color: 'indigo' },
                                    { id: 'gemini_image', label: 'Gemini IA', icon: 'fa-robot', color: 'purple' },
                                    { id: 'pexels_video', label: 'Pexels Vid', icon: 'fa-video', color: 'emerald' },
                                    { id: 'pexels_image', label: 'Pexels Img', icon: 'fa-image', color: 'teal' },
                                    { id: 'pixabay_video', label: 'Pixabay Vid', icon: 'fa-clapperboard', color: 'blue' },
                                    { id: 'pixabay_image', label: 'Pixabay Img', icon: 'fa-camera', color: 'sky' },
                                    { id: 'unsplash_image', label: 'Unsplash Img', icon: 'fa-mountain-sun', color: 'orange' },
                                ].map(src => (
                                    <button
                                        key={src.id}
                                        onClick={() => setMagicSyncSource(src.id as any)}
                                        className={`group relative py-4 px-2 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 overflow-hidden ${
                                            magicSyncSource === src.id 
                                            ? `bg-${src.color}-600/10 border-${src.color}-500 text-${src.color}-400 shadow-lg shadow-${src.color}-500/10` 
                                            : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:bg-zinc-800'
                                        }`}
                                    >
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                                            magicSyncSource === src.id ? `bg-${src.color}-500/20` : 'bg-zinc-800'
                                        }`}>
                                            <i className={`fas ${src.icon} text-lg`}></i>
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-wider">{src.label}</span>
                                        {magicSyncSource === src.id && (
                                            <div className={`absolute top-1 right-1 w-2 h-2 rounded-full bg-${src.color}-500 animate-pulse`}></div>
                                        )}
                                    </button>
                                ))}
                            </div>

                            <button 
                                disabled={!magicAudio || magicSyncLoading}
                                onClick={handleSmartMagicSyncClick}
                                className={`w-full py-5 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all border-2 shadow-2xl ${
                                    !magicAudio || magicSyncLoading 
                                    ? 'bg-zinc-800 border-zinc-700 text-zinc-600 cursor-not-allowed opacity-50' 
                                    : 'bg-gradient-to-r from-indigo-600 to-violet-600 border-indigo-400 text-white hover:from-indigo-500 hover:to-violet-500 hover:scale-[1.02] active:scale-95 shadow-indigo-500/20'
                                }`}
                            >
                                {magicSyncLoading ? (
                                    <i className="fa-solid fa-circle-notch fa-spin text-xl"></i>
                                ) : (
                                    <i className="fa-solid fa-wand-magic-sparkles text-xl"></i>
                                )}
                                {magicSyncLoading ? 'Processando...' : 'Gerar Vídeo Completo'}
                            </button>
                        </div>

                        <div className="space-y-4 pt-8 border-t border-zinc-700/50">
                            <div className="space-y-1">
                                <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] px-1">Alternativa: Sincronizar Clips da Timeline</h4>
                                <p className="text-[10px] text-zinc-500 px-1 italic">
                                    Use os vídeos/imagens que você já colocou na linha do tempo e adapte-os ao ritmo 8s, 6s, 3s.
                                </p>
                            </div>
                            <button 
                                disabled={!magicAudio || magicSyncLoading || !hasClips}
                                onClick={() => onSyncExistingClips?.(magicAudio!)}
                                className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition-all border-2 ${
                                    !magicAudio || magicSyncLoading || !hasClips
                                    ? 'bg-zinc-800 border-zinc-700 text-zinc-600 cursor-not-allowed opacity-50' 
                                    : 'bg-zinc-900 border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10 hover:border-yellow-500'
                                }`}
                            >
                                <i className="fa-solid fa-sync text-lg"></i>
                                Sincronizar Clips Existentes
                            </button>
                            {!hasClips && magicAudio && (
                                <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
                                    <i className="fas fa-exclamation-triangle text-red-500"></i>
                                    <p className="text-[10px] text-red-400 font-bold">
                                        Adicione vídeos ou imagens à timeline primeiro para usar esta opção.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4 pt-8 border-t border-zinc-700/50 pb-10">
                            <div className="space-y-1">
                                <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] px-1">Alternativa: Sincronizar Seus Uploads</h4>
                                <p className="text-[10px] text-zinc-500 px-1 italic">
                                    Envie seus próprios vídeos e a IA fará cortes aleatórios sincronizados com o áudio.
                                </p>
                            </div>
                            
                            <div className="space-y-4">
                                <div 
                                    className="border-2 border-dashed border-zinc-700 rounded-2xl p-6 text-center hover:border-zinc-500 hover:bg-zinc-800/30 transition-all cursor-pointer group"
                                    onClick={() => {
                                        const input = document.createElement('input');
                                        input.type = 'file';
                                        input.accept = 'video/*';
                                        input.multiple = true;
                                        input.onchange = (e) => {
                                            const files = (e.target as HTMLInputElement).files;
                                            if (files) setMagicVideos(prev => [...prev, ...Array.from(files)]);
                                        };
                                        input.click();
                                    }}
                                >
                                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                                        <i className="fa-solid fa-video text-xl text-zinc-600 group-hover:text-zinc-400"></i>
                                    </div>
                                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Clique para enviar vídeos</p>
                                </div>
                                    
                                {magicVideos.length > 0 && (
                                    <div className="bg-zinc-900/50 p-3 rounded-2xl border border-zinc-800">
                                        <div className="flex items-center justify-between mb-3 px-1">
                                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">{magicVideos.length} Vídeos Selecionados</span>
                                            <button onClick={() => setMagicVideos([])} className="text-[10px] text-red-400 hover:text-red-300 font-bold">Limpar Tudo</button>
                                        </div>
                                        <div className="grid grid-cols-5 gap-2">
                                            {magicVideos.map((v, i) => (
                                                <div key={i} className="relative group aspect-square">
                                                    <div className="w-full h-full bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-600 border border-zinc-700 overflow-hidden">
                                                        <i className="fa-solid fa-film text-lg"></i>
                                                    </div>
                                                    <button 
                                                        onClick={() => setMagicVideos(prev => prev.filter((_, idx) => idx !== i))}
                                                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                    >
                                                        <i className="fa-solid fa-times"></i>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <button 
                                            disabled={!magicAudio || magicVideos.length === 0 || magicSyncLoading}
                                            onClick={() => onSyncUploadedVideos?.(magicAudio!, magicVideos)}
                                            className={`w-full mt-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all border-2 ${
                                                !magicAudio || magicVideos.length === 0 || magicSyncLoading 
                                                ? 'bg-zinc-800 border-zinc-700 text-zinc-600 cursor-not-allowed' 
                                                : 'bg-zinc-100 border-white text-zinc-900 hover:bg-white'
                                            }`}
                                        >
                                            <i className="fa-solid fa-bolt"></i>
                                            Sincronizar Uploads
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                
                {activeTab === 'text' && (
                    <div className="h-full flex flex-col">
                        <div className="bg-blue-900/30 border border-blue-800 p-2 rounded mb-4 text-xs text-blue-200"><i className="fas fa-info-circle mr-1"></i>{selectedClipId ? "Aplicando ao clipe selecionado" : "Clique para adicionar novo texto"}</div>
                        <div className="flex items-center gap-2 mb-4 border-b border-zinc-700 pb-2 overflow-x-auto scrollbar-thin flex-shrink-0"><button onClick={() => setTextSubTab('modelos')} className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap ${textSubTab === 'modelos' ? 'bg-green-600 text-white' : 'bg-zinc-700 text-gray-200 hover:bg-zinc-600'}`}>Modelos ({TEXT_RESOURCES.templates.length})</button><button onClick={() => setTextSubTab('fontes')} className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap ${textSubTab === 'fontes' ? 'bg-green-600 text-white' : 'bg-zinc-700 text-gray-200 hover:bg-zinc-600'}`}>Fontes</button><button onClick={() => setTextSubTab('efeitos')} className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap ${textSubTab === 'efeitos' ? 'bg-green-600 text-white' : 'bg-zinc-700 text-gray-200 hover:bg-zinc-600'}`}>Efeitos ({TEXT_RESOURCES.effects.length})</button><button onClick={() => setTextSubTab('animacoes')} className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap ${textSubTab === 'animacoes' ? 'bg-green-600 text-white' : 'bg-zinc-700 text-gray-200 hover:bg-zinc-600'}`}>Animações</button></div>
                        <div className="flex-1 overflow-y-auto scrollbar-thin">
                            {textSubTab === 'modelos' && (<div className="grid grid-cols-2 gap-3">{(TEXT_RESOURCES.templates as any[]).map(tpl => { 
                                const sampleText = tpl.category.includes('Viral') ? 'VIRAL' : 
                                                 tpl.category.includes('Motion') ? 'GRAPHIC' :
                                                 tpl.category.includes('Pop') ? 'TEXTO' : 'Style'; 
                                return (<div key={tpl.id} onClick={() => handleAddTextTemplate(tpl)} onMouseEnter={() => setHoveredPreviewId(tpl.id)} onMouseLeave={() => setHoveredPreviewId(null)} className={`aspect-video ${(tpl as any).previewGradient || (tpl as any).bg || 'bg-zinc-900'} border border-zinc-700 rounded-lg cursor-pointer hover:border-green-500 hover:ring-2 hover:ring-green-500/50 flex flex-col items-center justify-center p-2 relative overflow-hidden transition-all duration-200 group hover:shadow-lg hover:shadow-green-900/40`}>
                                    {tpl.design?.isProgressBar ? (
                                        <div className="w-full px-4 flex flex-col gap-1 items-center">
                                            <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                                                <div className="h-full w-2/3" style={{ background: tpl.design.background || tpl.design.color }}></div>
                                            </div>
                                            <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-tighter">Progress Bar</span>
                                        </div>
                                    ) : (
                                        <span className={`text-xl md:text-2xl text-center font-bold relative z-10 break-words w-full transition-transform duration-300 group-hover:scale-110 ${tpl.design?.effectId ? ((TEXT_RESOURCES.effects.find(e => e.id === tpl.design.effectId) as any)?.class || '') : ''} ${tpl.design?.animation?.in ? ((TEXT_RESOURCES.animations.in.find(a=>a.id===tpl.design.animation?.in) as any)?.class || '') : ''}`} 
                                            style={{ 
                                                color: tpl.design?.color || 'white', 
                                                textShadow: tpl.design?.textShadow || (tpl.design?.shadow ? `${tpl.design.shadow.x}px ${tpl.design.shadow.y}px ${tpl.design.shadow.blur}px ${tpl.design.shadow.color}` : 'none'), 
                                                WebkitTextStroke: tpl.design?.WebkitTextStroke || (tpl.design?.stroke ? `${tpl.design.stroke.width/2}px ${tpl.design.stroke.color}` : 'none'), 
                                                fontFamily: tpl.styleId, 
                                                background: tpl.design?.background, 
                                                WebkitBackgroundClip: tpl.design?.WebkitBackgroundClip, 
                                                WebkitTextFillColor: tpl.design?.WebkitTextFillColor, 
                                                backgroundColor: tpl.design?.backgroundColor || 'transparent', 
                                                animationPlayState: hoveredPreviewId === tpl.id ? 'running' : 'paused', 
                                                animationDuration: '1.5s', 
                                                animationIterationCount: 'infinite' 
                                            }} 
                                            data-text={sampleText}
                                        >
                                            {sampleText}
                                        </span>
                                    )}
                                    <span className="absolute bottom-1 left-0 right-0 text-center text-[9px] text-white/60 uppercase tracking-widest font-semibold bg-black/20 py-0.5 backdrop-blur-sm">{tpl.name}</span>
                                </div>); 
                            })}</div>)}
                            {textSubTab === 'efeitos' && (<div className="grid grid-cols-3 gap-2">{(TEXT_RESOURCES.effects as any[]).map((effect: any) => (<div key={effect.id} onClick={() => handleAddTextEffect(effect.id, effect.customStyle)} className="aspect-square bg-zinc-800 rounded cursor-pointer hover:bg-zinc-700 border border-zinc-700 flex flex-col items-center justify-center p-1 group hover:border-green-500"><span className={`text-3xl font-bold ${effect.class} transition-transform group-hover:scale-125`} style={effect.customStyle || {}} data-text="Aa">Aa</span><span className="text-[9px] text-gray-400 mt-2 text-center truncate w-full">{effect.name}</span></div>))}</div>)}
                            {textSubTab === 'fontes' && (<div className="space-y-4"><div className="flex items-center justify-between mb-2"><h4 className="text-xs text-gray-400">Personalizado</h4><label className="cursor-pointer bg-green-600 hover:bg-green-500 text-white px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-colors"><i className="fas fa-plus"></i> Importar Fonte<input type="file" ref={fontInputRef} accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={(e) => onUploadFont?.(e.target.files)} /></label></div>{customFonts && customFonts.length > 0 && (<div className="mb-4 pb-4 border-b border-zinc-700"><h4 className="text-xs text-gray-400 mb-2">Minhas Fontes</h4><div className="grid grid-cols-2 lg:grid-cols-3 gap-2">{customFonts.map((font) => (<div key={font.id} onClick={() => handleAddTextStyle(font.id)} className="aspect-video bg-zinc-700 rounded cursor-pointer hover:bg-zinc-600 flex items-center justify-center p-2 relative group border border-zinc-600"><span className="text-lg text-center leading-tight truncate px-1 text-white" style={{ fontFamily: font.family }}>{font.name}</span></div>))}</div></div>)}{Object.entries(RESOURCES.textStyles).map(([group, styles]) => (<div key={group}><h4 className="text-xs text-gray-400 mt-2 mb-1">{group}</h4><div className="grid grid-cols-2 lg:grid-cols-3 gap-2">{Object.entries(styles).map(([id, style]: [string, any]) => (<div key={id} onClick={() => handleAddTextStyle(id)} className="aspect-video bg-zinc-700 rounded cursor-pointer hover:bg-zinc-600 flex items-center justify-center p-2 relative group border border-zinc-600"><span className={`text-lg text-center leading-tight ${style.class} text-white`.replace('legend-base', '')}>{style.name}</span></div>))}</div></div>))}</div>)}
                            {textSubTab === 'animacoes' && (<div className="space-y-4">{Object.entries(TEXT_RESOURCES.animations).map(([type, anims]) => (<div key={type}><h4 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wide flex items-center gap-2"><i className={`fas ${type === 'in' ? 'fa-sign-in-alt' : type === 'out' ? 'fa-sign-out-alt' : 'fa-sync'} text-green-500`}></i>{type === 'in' ? 'Entrada' : type === 'out' ? 'Saída' : 'Loop'}</h4><div className="grid grid-cols-3 gap-2">{(anims as any[]).map((anim: any) => (<button key={anim.id} onClick={() => { if(selectedClipId) { const payload: any = {}; if(type === 'in') payload.in = anim.id; else if(type === 'out') payload.out = anim.id; else payload.loop = anim.id; onAddText?.('update', { animation: payload }); } }} onMouseEnter={() => setHoveredPreviewId(anim.id)} onMouseLeave={() => setHoveredPreviewId(null)} className="aspect-square bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700 hover:border-green-500 flex flex-col items-center justify-center gap-2 group transition-all"><div className="w-8 h-8 flex items-center justify-center bg-zinc-900 rounded-full group-hover:bg-green-900/30 transition-colors"><i className={`fas ${anim.icon || 'fa-film'} text-lg text-gray-300 group-hover:text-green-400 ${hoveredPreviewId === anim.id ? ((anim as any).class || '') : ''}`} style={{ animationPlayState: hoveredPreviewId === anim.id ? 'running' : 'paused' }}></i></div><span className="text-[10px] text-gray-400 font-medium">{anim.name}</span></button>))}</div></div>))}</div>)}
                        </div>
                    </div>
                )}
                
                {activeTab === 'audio' && (
                    <div className="space-y-4">
                        <label className="flex items-center justify-center w-full py-2 bg-zinc-700 hover:bg-zinc-600 rounded cursor-pointer text-sm font-medium text-white transition-colors shadow-sm border border-zinc-600"> 
                            <i className="fas fa-file-audio mr-2 text-pink-400"></i> Importar Áudio / Extrair
                            <input type="file" multiple accept="audio/*,video/*" className="hidden" onChange={(e) => onImport(e.target.files, 'audio')} /> 
                        </label>

                        {selectedClipId && (
                            <div className="bg-zinc-900 p-3 rounded-lg border border-yellow-500/50">
                                <h3 className="text-xs font-bold text-yellow-300 mb-2 uppercase tracking-wider">Narração para Clipe</h3>
                                <div className="space-y-2">
                                    <textarea value={narrationText} onChange={(e) => setNarrationText(e.target.value)} placeholder="Digite o texto para narrar no clipe..." className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-white focus:border-yellow-500 outline-none resize-none h-24" />
                                    {renderAudioControls(true, narrationText)}
                                    <button onClick={handleGenerateNarration} disabled={ttsLoading} className="w-full py-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white rounded text-xs font-bold transition-colors flex items-center justify-center gap-2 mt-2">{ttsLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-sync-alt"></i>}Sincronizar Áudio ao Clipe</button>
                                </div>
                            </div>
                        )}
                        <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-700">
                            <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{selectedClipId ? 'Gerar Áudio Avulso' : 'Texto para Fala (AI)'}</h3>
                            <div className="space-y-2">
                                <textarea value={ttsText} onChange={(e) => setTtsText(e.target.value)} placeholder="Digite o texto para narrar..." className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-white focus:border-pink-500 outline-none resize-none h-24" />
                                {renderAudioControls(false, ttsText)}
                                <button onClick={handleGenerateTTS} disabled={ttsLoading} className="w-full py-2 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white rounded text-xs font-bold transition-colors flex items-center justify-center gap-2 mt-2">{ttsLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-microphone-lines"></i>}Gerar Áudio</button>
                            </div>
                        </div>

                        {/* NEW: Voice Effects Panel (Collapsible) */}
                        <details className="bg-zinc-900 rounded-lg border border-zinc-700 overflow-hidden group">
                            <summary className="flex items-center justify-between p-3 cursor-pointer bg-zinc-900 hover:bg-zinc-800 transition-colors select-none">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                    <i className="fas fa-magic text-purple-500"></i> Efeitos de Voz ({Object.values(VOICE_EFFECTS_CATEGORIES).reduce((acc, cat) => acc + cat.length, 0)}+)
                                </h3>
                                <i className="fas fa-chevron-down text-gray-500 transition-transform group-open:rotate-180"></i>
                            </summary>
                            <div className="p-3 border-t border-zinc-700 bg-zinc-900/50">
                                {/* Category Tabs */}
                                <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-thin">
                                    {Object.keys(VOICE_EFFECTS_CATEGORIES).map(cat => (
                                        <button 
                                            key={cat}
                                            onClick={() => setVoiceEffectCategory(cat)}
                                            className={`px-3 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors border ${voiceEffectCategory === cat ? 'bg-purple-600 border-purple-500 text-white' : 'bg-zinc-800 border-zinc-700 text-gray-400 hover:text-gray-200 hover:bg-zinc-700'}`}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>

                                {/* Effects Grid */}
                                <div className="grid grid-cols-4 gap-2 max-h-[300px] overflow-y-auto scrollbar-thin p-1">
                                    {(VOICE_EFFECTS_CATEGORIES[voiceEffectCategory] || []).map((effect: VoiceEffect) => (
                                        <button 
                                            key={effect.id}
                                            onClick={() => onBackendAction?.('/api/process/start/voice-fx-real', effect.name, { preset: effect.id }, { replace: true })}
                                            disabled={!selectedClipId}
                                            className="aspect-square bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-purple-500 rounded-lg flex flex-col items-center justify-center gap-1 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                                            title={effect.name}
                                        >
                                            <div className={`text-2xl ${effect.anim || ''} group-hover:scale-110 transition-transform`}>{effect.icon}</div>
                                            <span className="text-[9px] text-center text-gray-400 group-hover:text-white leading-tight px-1 w-full truncate">{effect.name}</span>
                                        </button>
                                    ))}
                                </div>
                                {!selectedClipId && <p className="text-[9px] text-red-400 mt-2 text-center">* Selecione um clipe de áudio para aplicar efeitos.</p>}
                            </div>
                        </details>
                    </div>
                )}
                
                {activeTab === 'layer' && (
                    <div className="space-y-4">
                        <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-700">
                            <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Ajustes de Camada</h3>
                            {!selectedClipId ? (
                                <div className="text-center py-4 bg-zinc-800 rounded border border-zinc-600 border-dashed mb-2">
                                    <p className="text-xs text-gray-400">Selecione um clipe na timeline para ativar.</p>
                                </div>
                            ) : null}
                            <div className={`grid grid-cols-2 gap-2 ${!selectedClipId ? 'opacity-50 pointer-events-none' : ''}`}>
                                <button onClick={() => onOpenInspectorSection?.('opacity')} className="p-3 bg-zinc-700 hover:bg-zinc-600 rounded flex flex-col items-center gap-2"><i className="fas fa-adjust text-lg md:text-xl"></i><span className="text-xs">Opacidade / Mistura</span></button>
                                <button onClick={() => onOpenInspectorSection?.('mask')} className="p-3 bg-zinc-700 hover:bg-zinc-600 rounded flex flex-col items-center gap-2"><i className="fas fa-mask text-lg md:text-xl"></i><span className="text-xs">Mascarar</span></button>
                                <button onClick={() => onOpenInspectorSection?.('transform')} className="p-3 bg-zinc-700 hover:bg-zinc-600 rounded flex flex-col items-center gap-2"><i className="fas fa-arrows-alt text-lg md:text-xl"></i><span className="text-xs">Posição</span></button>
                                <button onClick={() => onOpenInspectorSection?.('crop')} className="p-3 bg-zinc-700 hover:bg-zinc-600 rounded flex flex-col items-center gap-2"><i className="fas fa-crop-alt text-lg md:text-xl"></i><span className="text-xs">Recortar</span></button>
                            </div>
                        </div>
                    </div>
                )}
                
                {activeTab === 'ratio' && (
                    <div className="space-y-4">
                        <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-700 text-center">
                            <i className="fas fa-vector-square text-3xl text-teal-500 mb-2"></i>
                            <h3 className="text-sm font-bold text-gray-200">Proporção da Tela</h3>
                            <p className="text-xs text-gray-500 mt-1">Escolha o formato do seu vídeo.</p>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {[{ ratio: '16:9', label: '16:9', icon: 'fa-desktop' },{ ratio: '9:16', label: '9:16', icon: 'fa-mobile-alt' },{ ratio: '1:1', label: '1:1', icon: 'fa-square' },{ ratio: '4:3', label: '4:3', icon: 'fa-tv' },{ ratio: '3:4', label: '3:4', icon: 'fa-portrait' },{ ratio: '3:2', label: '3:2', icon: 'fa-camera' },{ ratio: '5:4', label: '5:4', icon: 'fa-image' },{ ratio: '2.35:1', label: 'Cinema', icon: 'fa-film' },{ ratio: '2:1', label: 'UltraWide', icon: 'fa-arrows-alt-h' }].map(item => (
                                <button 
                                    key={item.ratio} 
                                    onClick={() => onChangeAspectRatio(item.ratio)} 
                                    className={`flex flex-col items-center justify-center gap-2 p-3 rounded-lg transition-colors aspect-square border ${
                                        currentAspectRatio === item.ratio 
                                            ? 'bg-teal-600 border-teal-500 text-white shadow-lg shadow-teal-900/50' 
                                            : 'bg-zinc-700 hover:bg-zinc-600 border-zinc-600 text-gray-300'
                                    }`}
                                >
                                    <div className="flex items-center justify-center text-xl h-8"><i className={`fas ${item.icon}`}></i></div>
                                    <span className="text-xs font-medium">{item.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {activeTab === 'background' && (<div className="space-y-4"><details className="bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700" open><summary className="px-4 py-2 font-semibold text-sm bg-zinc-800 hover:bg-zinc-700 border-b border-zinc-700 text-gray-200">Cor</summary><div className="p-4"><div><label className="text-xs font-bold text-gray-400 mb-2 block uppercase tracking-wider">Cor Personalizada</label><div className="relative"><input type="color" onChange={(e) => onChangeBackground(e.target.value)} className="w-full h-10 p-1 bg-zinc-700 rounded-lg border border-zinc-600 cursor-pointer" /></div></div><div className="mt-4"><label className="text-xs font-bold text-gray-400 mb-2 block uppercase tracking-wider">Predefinições</label><div className="grid grid-cols-5 gap-2">{['#000000', '#FFFFFF', '#333333', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'].map(color => (<button key={color} onClick={() => onChangeBackground(color)} className="w-full aspect-square rounded-full border-2 border-zinc-600 hover:border-white transition-colors" style={{ backgroundColor: color }}></button>))}</div></div></div></details><details className="bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700" open><summary className="px-4 py-2 font-semibold text-sm bg-zinc-800 hover:bg-zinc-700 border-b border-zinc-700 text-gray-200">Imagem</summary><div className="p-4"><label className="flex items-center justify-center w-full py-2 mb-2 bg-zinc-700 hover:bg-zinc-600 rounded cursor-pointer text-sm font-medium text-white transition-colors"><i className="fas fa-upload mr-2"></i> Carregar Imagem de Fundo<input type="file" accept="image/*" className="hidden" onChange={(e) => onSetBackgroundImage(e.target.files)} /></label>{backgroundImage && (<button onClick={onRemoveBackgroundImage} className="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-bold transition-colors">Remover Fundo</button>)}</div></details></div>)}
                
                {activeTab === 'music-ai' && (
                    <div className="space-y-4">
                        <div className="p-4 bg-zinc-900 rounded-xl border border-blue-500/30 shadow-lg bg-gradient-to-br from-zinc-900 to-blue-900/10">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-blue-500/20 rounded-lg">
                                    <i className="fas fa-music text-blue-400 text-xl"></i>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Symphony AI (Lyria)</h3>
                                    <p className="text-[10px] text-blue-400 font-medium tracking-tight">Criação Musical Profissional</p>
                                </div>
                            </div>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">Descrição da Trilha</label>
                                    <textarea 
                                        value={musicPrompt} 
                                        onChange={(e) => setMusicPrompt(e.target.value)} 
                                        placeholder="Ex: Cinematic orchestral soundtrack with subtle strings and epic percussion..." 
                                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-white focus:border-blue-500 outline-none resize-none h-24 transition-all" 
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">Duração (Segundos)</label>
                                        <div className="relative">
                                            <input 
                                                type="number" 
                                                value={musicDuration} 
                                                onChange={(e) => setMusicDuration(Math.min(300, Math.max(1, parseInt(e.target.value) || 30)))} 
                                                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white focus:border-blue-500 outline-none pr-8" 
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-zinc-600">sec</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">Preset de Clima</label>
                                        <select 
                                            value={musicMood}
                                            onChange={(e) => {
                                                setMusicMood(e.target.value);
                                                if (e.target.value !== 'custom') setMusicPrompt(prev => prev ? `${prev}, mood: ${e.target.value}` : `Background music with ${e.target.value} mood`);
                                            }}
                                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white focus:border-blue-500 outline-none"
                                        >
                                            <option value="custom">Personalizado</option>
                                            <option value="epic">Épico / Trailer</option>
                                            <option value="lofi">Lofi / Relaxante</option>
                                            <option value="techno">Techno / Energy</option>
                                            <option value="sad">Triste / Melancólico</option>
                                            <option value="happy">Feliz / Vibrante</option>
                                        </select>
                                    </div>
                                </div>

                                <button 
                                    onClick={() => onGenerateMusic?.(musicPrompt, musicDuration)} 
                                    disabled={!musicPrompt.trim()} 
                                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-30 text-white rounded-lg text-xs font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-900/40 active:scale-95"
                                >
                                    <i className="fas fa-wand-magic-sparkles text-sm"></i>
                                    Gerar Trilha Master
                                </button>
                                
                                <p className="text-[9px] text-zinc-600 text-center italic">
                                    * Powered by Lyria. Music is royalty-free and production-ready.
                                </p>
                            </div>
                        </div>

                        <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
                             <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Dicas de Engenharia de Som</h4>
                             <ul className="space-y-2">
                                 <li className="text-[10px] text-zinc-400 flex gap-2"><i className="fas fa-check text-blue-500"></i> Seja específico sobre instrumentos (cello, piano).</li>
                                 <li className="text-[10px] text-zinc-400 flex gap-2"><i className="fas fa-check text-blue-500"></i> Descreva o ritmo (fast-paced, slow tempo).</li>
                                 <li className="text-[10px] text-zinc-400 flex gap-2"><i className="fas fa-check text-blue-500"></i> Mencione o gênero (jazz, pop, cinematic).</li>
                             </ul>
                        </div>
                    </div>
                )}
                {activeTab === 'subtitles' && (<div className="h-full flex flex-col"><div className="p-3 bg-zinc-900 rounded-lg border border-zinc-700 text-center flex-shrink-0 mb-4"><i className="fas fa-closed-captioning text-3xl text-amber-400 mb-2"></i><h3 className="text-sm font-bold text-gray-200">Legendas com IA</h3><p className="text-xs text-gray-500 mt-1">Escolha um estilo e gere automaticamente.</p></div><div className="flex-1 overflow-y-auto scrollbar-thin mb-4">{Object.entries(groupedSubtitles).map(([category, templates]) => (<div key={category} className="mb-4"><h4 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wide sticky top-0 bg-zinc-800 py-1 z-20 flex justify-between"><span>{category}</span><span className="bg-zinc-700 px-1.5 rounded text-[10px] text-gray-300">{(templates as any[]).length}</span></h4><div className="grid grid-cols-2 gap-3">{(templates as any[]).map(tpl => { const sampleText = tpl.category.includes('Viral') ? 'VIRAL' : tpl.category.includes('Pop') ? 'NEON' : tpl.category.includes('Minimal') ? 'CLEAN' : 'CINEMA'; const isSelected = selectedSubtitleTemplate === tpl.id; return (<div key={tpl.id} onClick={() => setSelectedSubtitleTemplate(tpl.id)} className={`aspect-[2/1] ${(tpl as any).previewGradient || (tpl as any).bg || 'bg-zinc-900'} border ${isSelected ? 'border-amber-500 ring-2 ring-amber-500/50' : 'border-zinc-700'} rounded-lg cursor-pointer hover:border-amber-400 flex flex-col items-center justify-center p-1 relative overflow-hidden transition-all duration-200 group`}><span className={`text-xl font-bold relative z-10 break-words w-full text-center leading-none ${tpl.design?.effectId ? (TEXT_RESOURCES.effects.find(e => e.id === tpl.design.effectId)?.class || '') : ''} ${tpl.design?.animation?.in ? (TEXT_RESOURCES.animations.in.find(a=>a.id===tpl.design.animation?.in)?.class || '') : ''} ${tpl.design?.animation?.loop ? (TEXT_RESOURCES.animations.loop.find(a=>a.id===tpl.design.animation?.loop)?.class || '') : ''}`} style={{ color: tpl.design?.color || 'white', textShadow: tpl.design?.textShadow || (tpl.design?.shadow ? `${tpl.design.shadow.x}px ${tpl.design.shadow.y}px ${tpl.design.shadow.blur}px ${tpl.design.shadow.color}` : 'none'), WebkitTextStroke: tpl.design?.WebkitTextStroke || (tpl.design?.stroke ? `${tpl.design.stroke.width/3}px ${tpl.design.stroke.color}` : 'none'), fontFamily: tpl.styleId, background: tpl.design?.background, WebkitBackgroundClip: tpl.design?.WebkitBackgroundClip, WebkitTextFillColor: tpl.design?.WebkitTextFillColor, backgroundColor: tpl.design?.backgroundColor || 'transparent', animationDuration: '2s', animationIterationCount: 'infinite' }}>{sampleText}</span><div className="absolute inset-x-0 bottom-0 text-[8px] bg-black/40 text-white text-center py-0.5 truncate px-1">{tpl.name}</div>{isSelected && <div className="absolute top-1 right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center text-[10px] text-black"><i className="fas fa-check"></i></div>}</div>); })}</div></div>))}</div><div className="space-y-2 flex-shrink-0"><button onClick={() => onGenerateSubtitles?.('all')} disabled={subtitlesLoading} className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-lg">{subtitlesLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-layer-group"></i>} Legendar Todo o Áudio</button><div className="flex gap-2"><button onClick={() => onGenerateSubtitles?.('single')} disabled={subtitlesLoading || !selectedClipId} className="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs font-bold transition-colors flex items-center justify-center gap-2">{subtitlesLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-film"></i>} Legendar Seleção</button><button onClick={() => onGenerateSubtitles?.('update_style', selectedSubtitleTemplate)} disabled={subtitlesLoading} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs font-bold transition-colors flex items-center justify-center gap-2 border border-blue-500" title="Aplica o estilo selecionado a todas as legendas existentes"><i className="fas fa-paint-brush"></i> Trocar Estilo</button></div></div><div className="border-t border-zinc-700 pt-4 mt-2 flex-shrink-0"><label className="flex items-center justify-center w-full py-2 bg-zinc-700 hover:bg-zinc-600 rounded cursor-pointer text-sm font-medium text-white transition-colors"><i className="fas fa-file-upload mr-2"></i> Carregar Arquivo (.srt, .txt)<input type="file" accept=".srt,.txt" className="hidden" onChange={(e) => onUploadSubtitles?.(e.target.files)} /></label></div></div>)}
                
                {activeTab === 'effects' && (<div className="flex h-full"><div className={`flex-1 transition-all duration-300 ${movementControl ? 'w-1/2' : 'w-full'}`}><div className="flex items-center gap-2 mb-4 border-b border-zinc-700 pb-2 overflow-x-auto"><button onClick={() => setEffectsSubTab('transitions')} className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap ${effectsSubTab === 'transitions' ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-gray-200 hover:bg-zinc-600'}`}>Transições</button><button onClick={() => setEffectsSubTab('effects')} className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap ${effectsSubTab === 'effects' ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-gray-200 hover:bg-zinc-600'}`}>Efeitos</button><button onClick={() => setEffectsSubTab('movements')} className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap ${effectsSubTab === 'movements' ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-gray-200 hover:bg-zinc-600'}`}>Movimentos</button><button onClick={() => setShowFavoritesOnly(!showFavoritesOnly)} className={`px-3 py-1 rounded text-xs font-bold whitespace-nowrap flex items-center gap-1 ${showFavoritesOnly ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'bg-zinc-700 text-yellow-500 border border-yellow-600/30'}`}><i className={showFavoritesOnly ? "fas fa-star" : "far fa-star"}></i> Favoritos</button></div><div className="overflow-y-auto h-[calc(100%-40px)] scrollbar-thin">
                    {effectsSubTab === 'effects' && Object.entries(RESOURCES.effects).map(([group, effects]) => {
                        const filtered = filterItems(group, effects);
                        if (!filtered) return null;
                        return (
                            <div key={group}>
                                <h4 className="text-xs text-gray-400 mt-2 mb-1">{group}</h4>
                                <div className="grid grid-cols-3 lg:grid-cols-3 gap-2">{Object.entries(filtered).map(([id, effect]: [string, any]) => (<div key={id} draggable onDragStart={(e) => onDragStart(e, 'effect', id)} onClick={(e) => { e.stopPropagation(); onApplyResource?.('effect', id); }} onMouseEnter={() => setHoveredEffectId(id)} onMouseLeave={() => setHoveredEffectId(null)} className="aspect-square bg-zinc-700 rounded cursor-pointer hover:bg-zinc-600 relative overflow-hidden group transition-all active:scale-95 border border-transparent hover:border-blue-500"><div className="w-full h-full bg-cover bg-center absolute inset-0" style={{backgroundImage: `url(${getPreviewUrl(id)})`, filter: effect.filter}}></div>{effect.overlayClass && <div className={`absolute inset-0 w-full h-full ${effect.overlayClass}`}></div>}<div className="absolute inset-x-0 bottom-0 bg-black/60 text-[10px] text-center text-white py-1 truncate px-1 z-10">{effect.name}</div>
                                <button onClick={(e) => { e.stopPropagation(); toggleFavorite(id); }} className={`absolute top-1 left-1 w-6 h-6 flex items-center justify-center rounded-full z-30 transition-all ${favorites.includes(id) ? 'bg-yellow-500 text-black scale-100' : 'bg-black/50 text-white scale-0 group-hover:scale-100'}`}><i className={`text-[10px] ${favorites.includes(id) ? 'fas fa-star' : 'far fa-star'}`}></i></button>
                                <button onClick={(e) => { e.stopPropagation(); onApplyToAll?.('effect', id); }} className="absolute top-1 right-1 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-blue-500 z-20 font-bold">Todos</button></div>))}</div>
                            </div>
                        );
                    })}
                    {effectsSubTab === 'transitions' && Object.entries(RESOURCES.transitions).map(([group, transitions]) => {
                        const filtered = filterItems(group, transitions);
                        if (!filtered) return null;
                        return (
                            <div key={group}>
                                <h4 className="text-xs text-gray-400 mt-2 mb-1">{group}</h4>
                                <div className="grid grid-cols-3 lg:grid-cols-3 gap-2">{Object.entries(filtered).map(([id, trans]: [string, any]) => (<div key={id} draggable onDragStart={(e) => onDragStart(e, 'transition', id)} onClick={(e) => { e.stopPropagation(); onApplyResource?.('transition', id); }} onMouseEnter={() => setHoveredEffectId(id)} onMouseLeave={() => setHoveredEffectId(null)} className="aspect-square bg-zinc-700 rounded cursor-pointer hover:bg-zinc-600 flex items-center justify-center relative group overflow-hidden transition-all active:scale-95 border border-transparent hover:border-green-500"><div className={`w-full h-full relative overflow-hidden flex items-center justify-center`}><div className={`absolute inset-0 bg-cover bg-center flex items-center justify-center transition-opacity duration-300`} style={{ backgroundImage: `url(${getPreviewUrl(id+'_1')})`, opacity: hoveredEffectId === id ? 0 : 1 }}></div><div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${getPreviewUrl(id+'_1')})`, opacity: hoveredEffectId === id ? 1 : 0 }}></div><div className={`absolute inset-0 bg-cover bg-center ${hoveredEffectId === id ? `trans-${id}-in` : ''}`} style={{ backgroundImage: `url(${getPreviewUrl(id+'_2')})`, opacity: hoveredEffectId === id ? 1 : 0, animationPlayState: hoveredEffectId === id ? 'running' : 'paused', '--trans-dur': '1s' } as any}></div></div><div className="absolute inset-x-0 bottom-0 bg-black/60 text-[10px] text-center text-white py-1 truncate px-1 z-10">{trans.name}</div>
                                <button onClick={(e) => { e.stopPropagation(); toggleFavorite(id); }} className={`absolute top-1 left-1 w-6 h-6 flex items-center justify-center rounded-full z-30 transition-all ${favorites.includes(id) ? 'bg-yellow-500 text-black scale-100' : 'bg-black/50 text-white scale-0 group-hover:scale-100'}`}><i className={`text-[10px] ${favorites.includes(id) ? 'fas fa-star' : 'far fa-star'}`}></i></button>
                                <button onClick={(e) => { e.stopPropagation(); onApplyToAll?.('transition', id); }} className="absolute top-1 right-1 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-blue-500 z-20 font-bold">Todos</button></div>))}</div>
                            </div>
                        );
                    })}
                    {effectsSubTab === 'movements' && RESOURCES.movements && Object.entries(RESOURCES.movements).map(([group, movs]: [string, any]) => {
                        const filtered = filterItems(group, movs);
                        if (!filtered) return null;
                        return (
                            <div key={group}>
                                <h4 className="text-xs text-gray-400 mt-2 mb-1">{group}</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">{Object.entries(filtered).map(([id, mov]: [string, any]) => (<div key={id} onClick={() => handleMovementClick(mov, id)} draggable onDragStart={(e) => onDragStart(e, 'movement', id, { type: id, config: {} })} onMouseEnter={() => setHoveredMoveId(id)} onMouseLeave={() => setHoveredMoveId(null)} className="aspect-video bg-zinc-700 rounded-lg cursor-pointer hover:bg-zinc-600 relative overflow-hidden group border border-zinc-600 hover:border-yellow-500 shadow-md transition-all active:scale-95"><div className={`w-full h-full bg-cover bg-center ${hoveredMoveId === id ? id : ''}`} style={{backgroundImage: `url(${getPreviewUrl(id)})`, animationPlayState: hoveredMoveId === id ? 'running' : 'paused'}}></div>{mov.type === 'overlay' && <div className={`absolute inset-0 ${mov.overlayClass}`}></div>}<div className="absolute inset-x-0 bottom-0 bg-black/60 text-xs font-medium text-center text-white py-2 truncate">{mov.name}</div>
                                            <button onClick={(e) => { e.stopPropagation(); toggleFavorite(id); }} className={`absolute top-2 left-2 w-6 h-6 flex items-center justify-center rounded-full z-30 transition-all ${favorites.includes(id) ? 'bg-yellow-500 text-black scale-100' : 'bg-black/50 text-white scale-0 group-hover:scale-100'}`}><i className={`text-[10px] ${favorites.includes(id) ? 'fas fa-star' : 'far fa-star'}`}></i></button>
                                            <button onClick={(e) => { e.stopPropagation(); onApplyToAll?.('movement', id); }} className="absolute top-2 right-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-2 py-1 rounded shadow-md z-30 transition-colors font-bold opacity-0 group-hover:opacity-100" title="Aplicar ao todos os clipes">Todos</button></div>))}</div>
                            </div>
                        );
                    })}
                </div></div>{movementControl && (<div className="w-1/2 p-4 border-l border-zinc-700 bg-zinc-900/50 flex flex-col"><div className="flex items-center justify-between pb-2 border-b border-zinc-700 mb-4"><button onClick={() => setMovementControl(null)} className="text-gray-400 hover:text-white"><i className="fas fa-chevron-left"></i></button><h4 className="font-bold text-sm text-center text-white">{movementControl.name}</h4><div className="w-4"></div></div><div className="flex-1 space-y-4 overflow-y-auto scrollbar-thin">{Object.entries(movementControl.controls).map(([key, params]: [string, any]) => (<div key={key}><div className="flex justify-between text-xs text-gray-400 mb-1"><span className="capitalize">{key}</span><span>{movementControl.config[key]}</span></div><input type="range" min={params.min} max={params.max} step={params.step} value={movementControl.config[key]} onChange={(e) => setMovementControl(prev => prev ? { ...prev, config: { ...prev.config, [key]: parseFloat(e.target.value) } } : null)} className="w-full h-1 bg-zinc-600 rounded-lg appearance-none cursor-pointer accent-blue-500" /></div>))}</div><div className="mt-4 flex-shrink-0"><button onClick={handleApplyMovement} className="w-full py-2 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-500">Aplicar ao Clipe</button></div></div>)}</div>)}

                {activeTab === 'edit' && (
                    <div className="space-y-6 pb-8">
                        <details className="bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700" open>
                            <summary className="px-4 py-2 font-semibold text-sm bg-zinc-800 hover:bg-zinc-700 border-b border-zinc-700 text-gray-200">Ações Rápidas (Basic)</summary>
                            <div className="p-3 grid grid-cols-4 gap-2">
                                {renderEditButton('fa-trash-alt', 'Limpar Tudo', onClearTimeline, false, 'bg-red-600 hover:bg-red-500 border border-red-500')}
                                {renderEditButton('fa-cut', 'Dividir', onSplit, !selectedClipId, 'bg-orange-600 hover:bg-orange-500 border border-orange-500')}
                                {renderEditButton('fa-copy', 'Clone', onDuplicate, !selectedClipId, 'bg-blue-600 hover:bg-blue-500 border border-blue-500')}
                                {renderEditButton('fa-trash', 'Deletar', onDelete, !selectedClipId, 'bg-rose-600 hover:bg-rose-500 border border-rose-500')}
                                {renderEditButton('fa-exchange-alt', 'Substituir', () => replaceInputRef.current?.click(), !selectedClipId, 'bg-purple-600 hover:bg-purple-500 border border-purple-500')}
                                {renderEditButton('fa-snowflake', 'Congelar', onFreeze, !selectedClipId, 'bg-cyan-600 hover:bg-cyan-500 border border-cyan-500')}
                                {renderEditButton('fa-film', 'Dividir Cena', onSceneDetectAndSplit, !selectedClipId, 'bg-green-600 hover:bg-green-500 border border-green-500')}
                                {renderEditButton('fa-undo', 'Resetar', resetAll, !selectedClipId, 'bg-zinc-600 hover:bg-zinc-500 border border-zinc-500')}
                                {renderEditButton('fa-backward', 'Reverter', () => onBackendAction?.('/api/process/start/reverse-real', 'Reverter Vídeo', undefined, { replace: true }), !selectedClipId, 'bg-pink-600 hover:bg-pink-500 border border-pink-500')}
                            </div>
                        </details>
                        
                        <details className="bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700" open>
                            <summary className="px-4 py-2 font-semibold text-sm bg-zinc-800 hover:bg-zinc-700 border-b border-zinc-700 text-blue-400 flex items-center justify-between">
                                <span><i className="fas fa-arrows-alt mr-2"></i> Transformação & Geometria</span>
                            </summary>
                            <div className="p-3 grid grid-cols-4 gap-2">
                                {renderEditButton('fa-undo', '-90°', () => updateTransform('rotation', -90), !selectedClipId, 'bg-indigo-600 hover:bg-indigo-500')}
                                {renderEditButton('fa-redo', '+90°', () => updateTransform('rotation', 90), !selectedClipId, 'bg-indigo-600 hover:bg-indigo-500')}
                                {renderEditButton('fa-arrows-alt-h', 'Espelhar H', () => toggleBool('mirror'), !selectedClipId, 'bg-violet-600 hover:bg-violet-500')}
                                {renderEditButton('fa-arrows-alt-v', 'Espelhar V', () => updateTransform('rotation', 180), !selectedClipId, 'bg-violet-600 hover:bg-violet-500')} 
                                {renderEditButton('fa-search-plus', 'Zoom +', () => updateTransform('scale', 0.1), !selectedClipId, 'bg-amber-600 hover:bg-amber-500')}
                                {renderEditButton('fa-search-minus', 'Zoom -', () => updateTransform('scale', -0.1), !selectedClipId, 'bg-amber-600 hover:bg-amber-500')}
                                {renderEditButton('fa-compress', 'Ajustar', () => updateProp('fit', 'contain'), !selectedClipId, 'bg-teal-600 hover:bg-teal-500')}
                                {renderEditButton('fa-expand', 'Preencher', () => updateProp('fit', 'cover'), !selectedClipId, 'bg-teal-600 hover:bg-teal-500')}
                                {renderEditButton('fa-arrow-up', 'Cima', () => updateTransform('y', -50), !selectedClipId, 'bg-lime-600 hover:bg-lime-500')}
                                {renderEditButton('fa-arrow-down', 'Baixo', () => updateTransform('y', 50), !selectedClipId, 'bg-lime-600 hover:bg-lime-500')}
                                {renderEditButton('fa-arrow-left', 'Esq', () => updateTransform('x', -50), !selectedClipId, 'bg-lime-600 hover:bg-lime-500')}
                                {renderEditButton('fa-arrow-right', 'Dir', () => updateTransform('x', 50), !selectedClipId, 'bg-lime-600 hover:bg-lime-500')}
                                {renderEditButton('fa-crosshairs', 'Centro', resetTransform, !selectedClipId, 'bg-slate-600 hover:bg-slate-500')}
                            </div>
                        </details>

                        <details className="bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700" open>
                            <summary className="px-4 py-2 font-semibold text-sm bg-zinc-800 hover:bg-zinc-700 border-b border-zinc-700 text-purple-400 flex items-center justify-between">
                                <span><i className="fas fa-wand-magic-sparkles mr-2"></i> Ferramentas Mágicas (AI)</span>
                            </summary>
                            <div className="p-3 grid grid-cols-3 gap-3">
                                {renderToolBtn('Remover Fundo', 'fa-user-slash', 'bg-gradient-to-br from-purple-600 to-indigo-600', () => onBackendAction?.('/api/process/start/remove-bg-real', 'Remover Fundo'), !selectedClipId)}
                                {renderToolBtn('Magic Eraser', 'fa-eraser', 'bg-gradient-to-br from-pink-600 to-rose-600', () => onSetActiveTool?.('magic-eraser'), !selectedClipId)}
                                {renderToolBtn('Cartoon 3D', 'fa-paint-brush', 'bg-gradient-to-br from-blue-500 to-cyan-500', () => onBackendAction?.('/api/process/start/video-to-cartoon-real', 'Cartoonize', { style: 'pixar' }), !selectedClipId)}
                                {renderToolBtn('Anime Style', 'fa-dragon', 'bg-gradient-to-br from-red-500 to-orange-500', () => onBackendAction?.('/api/process/start/video-to-cartoon-real', 'Anime', { style: 'anime' }), !selectedClipId)}
                                {renderToolBtn('Upscale 4K', 'fa-arrow-up-right-dots', 'bg-gradient-to-br from-emerald-500 to-teal-500', () => onBackendAction?.('/api/process/start/upscale-real', 'Super Resolução'), !selectedClipId)}
                                {renderToolBtn('Estabilizar', 'fa-video', 'bg-gradient-to-br from-gray-600 to-zinc-600', () => onBackendAction?.('/api/process/start/stabilize-real', 'Estabilizar'), !selectedClipId)}
                                {renderToolBtn('Retoque Facial', 'fa-face-smile-beam', 'bg-gradient-to-br from-yellow-500 to-orange-500', () => onBackendAction?.('/api/process/start/retouch-real', 'Retoque'), !selectedClipId)}
                                {renderToolBtn('Câmera Lenta', 'fa-clock', 'bg-gradient-to-br from-blue-600 to-blue-800', () => onBackendAction?.('/api/process/start/interpolate-real', 'Slow Motion'), !selectedClipId)}
                                {renderToolBtn('Colorir P&B', 'fa-palette', 'bg-gradient-to-br from-fuchsia-600 to-pink-600', () => onBackendAction?.('/api/process/start/colorize-real', 'Colorir'), !selectedClipId)}
                            </div>
                        </details>

                        <details className="bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700" open>
                            <summary className="px-4 py-2 font-semibold text-sm bg-zinc-800 hover:bg-zinc-700 border-b border-zinc-700 text-cyan-400 flex items-center justify-between">
                                <span><i className="fas fa-wave-square mr-2"></i> Áudio Inteligente</span>
                            </summary>
                            <div className="p-3 grid grid-cols-2 gap-3">
                                {renderToolBtn('Remover Ruído', 'fa-volume-mute', 'bg-cyan-600', () => onBackendAction?.('/api/process/start/reduce-noise-real', 'Denoise', { intensity: 50 }), !selectedClipId)}
                                {renderToolBtn('Aprimorar Voz', 'fa-microphone', 'bg-blue-600', () => onBackendAction?.('/api/process/start/enhance-voice-real', 'Enhance', { mode: 'clarity' }), !selectedClipId)}
                                {renderToolBtn('Isolar Voz', 'fa-user-friends', 'bg-indigo-600', () => onBackendAction?.('/api/process/start/isolate-voice-real', 'Isolar', { mode: 'voice' }), !selectedClipId)}
                                {renderToolBtn('Cortar Silêncio', 'fa-scissors', 'bg-teal-600', () => onBackendAction?.('/api/process/start/remove-silence-real', 'Silence Remove'), !selectedClipId)}
                            </div>
                        </details>

                        <details className="bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700" open>
                            <summary className="px-4 py-2 font-semibold text-sm bg-zinc-800 hover:bg-zinc-700 border-b border-zinc-700 text-green-400 flex items-center justify-between">
                                <span><i className="fas fa-sliders-h mr-2"></i> Ajustes & Layout</span>
                            </summary>
                            <div className="p-3 grid grid-cols-2 gap-3">
                                {renderToolBtn('Cor & Luz', 'fa-sun', 'bg-orange-600', () => onOpenInspectorSection?.('adjustments'), !selectedClipId)}
                                {renderToolBtn('Transformar', 'fa-expand-arrows-alt', 'bg-green-600', () => onOpenInspectorSection?.('transform'), !selectedClipId)}
                                {renderToolBtn('Recortar (Crop)', 'fa-crop-alt', 'bg-lime-600', () => onOpenInspectorSection?.('crop'), !selectedClipId)}
                                {renderToolBtn('Máscara', 'fa-mask', 'bg-emerald-600', () => onOpenInspectorSection?.('mask'), !selectedClipId)}
                            </div>
                        </details>
                    </div>
                )}
            </div>
            
            {showMagicStyleModal && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowMagicStyleModal(false)}>
                    <div className="bg-zinc-800 p-6 rounded-2xl w-[95%] max-w-md flex flex-col shadow-2xl border border-zinc-700 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <i className="fas fa-palette text-indigo-400"></i>
                                Escolha o Estilo Visual
                            </h3>
                            <button onClick={() => setShowMagicStyleModal(false)} className="text-zinc-400 hover:text-white transition-colors">
                                <i className="fas fa-times text-lg"></i>
                            </button>
                        </div>

                        <div className="space-y-4 mb-8">
                            <p className="text-sm text-zinc-400">
                                Selecione um estilo para as imagens que o Gemini irá gerar com base no seu áudio.
                            </p>
                            
                            <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2 scrollbar-thin">
                                {Object.entries(IMAGE_STYLE_CATEGORIES).map(([category, styles]) => (
                                    <div key={category} className="space-y-2">
                                        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{category}</h4>
                                        <div className="grid grid-cols-2 gap-2">
                                            {styles.map(style => (
                                                <button
                                                    key={style}
                                                    onClick={() => setSelectedMagicStyle(style)}
                                                    className={`py-2 px-3 rounded-lg text-xs font-medium transition-all border text-left ${
                                                        selectedMagicStyle === style
                                                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                                                        : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                                                    }`}
                                                >
                                                    {style}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={handleConfirmMagicStyle}
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 group"
                        >
                            <span>Confirmar e Gerar Imagens</span>
                            <i className="fas fa-arrow-right group-hover:translate-x-1 transition-transform"></i>
                        </button>
                    </div>
                </div>
            )}

            {showScriptModal && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowScriptModal(false)}>
                    <div className="bg-zinc-800 p-4 md:p-6 rounded-lg w-[95%] md:w-[900px] h-[90vh] flex flex-col shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4 flex-shrink-0">
                            <h3 className="text-lg md:text-xl font-bold text-white"><i className="fas fa-magic text-purple-500 mr-2"></i>Roteiro Mágico (Podcast/Dialogue Mode)</h3>
                            <button onClick={() => setShowScriptModal(false)}><i className="fas fa-times"></i></button>
                        </div>

                        {scriptStage === 'input' ? (
                            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 md:gap-4 flex-shrink-0 border-b border-zinc-700 pb-2 md:pb-4">
                                    <div>
                                        <label className="block text-[10px] md:text-xs font-bold text-gray-400 mb-1">Estilo Visual</label>
                                        <select value={scriptImageStyle} onChange={e => setScriptImageStyle(e.target.value)} className="w-full bg-zinc-900 p-1.5 md:p-2 rounded text-white border border-zinc-700 text-[10px] md:text-xs outline-none focus:border-purple-500">
                                            {/* Use grouped categories for script visual style */}
                                            {Object.entries(IMAGE_STYLE_CATEGORIES).map(([category, styles]) => (
                                                <optgroup key={category} label={category}>
                                                    {styles.map(s => <option key={s} value={s}>{s}</option>)}
                                                </optgroup>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] md:text-xs font-bold text-gray-400 mb-1">Proporção</label>
                                        <select value={scriptAspectRatio} onChange={e => setScriptAspectRatio(e.target.value)} className="w-full bg-zinc-900 p-1.5 md:p-2 rounded text-white border border-zinc-700 text-[10px] md:text-xs outline-none focus:border-purple-500">
                                            <option value="16:9">16:9 (Paisagem)</option>
                                            <option value="9:16">9:16 (Retrato)</option>
                                            <option value="1:1">1:1 (Quadrado)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] md:text-xs font-bold text-gray-400 mb-1">Fonte da Mídia</label>
                                        <select value={scriptMediaSource} onChange={e => setScriptMediaSource(e.target.value as any)} className="w-full bg-zinc-900 p-1.5 md:p-2 rounded text-white border border-zinc-700 text-[10px] md:text-xs outline-none focus:border-purple-500">
                                            <option value="mixed">🔀 Misto (Alternado)</option>
                                            <option value="gemini">✨ Gemini (Gerar)</option>
                                            <option value="pexels_image">🖼️ Pexels (Imagens)</option>
                                            <option value="pexels_video">🎬 Pexels (Vídeos)</option>
                                            <option value="pixabay_image">📸 Pixabay (Imagens)</option>
                                            <option value="pixabay_video">🎥 Pixabay (Vídeos)</option>
                                            <option value="unsplash_image">📷 Unsplash (Imagens)</option>
                                        </select>
                                    </div>
                                    {/* Audio Toggle */}
                                    <div>
                                        <label className="block text-[10px] md:text-xs font-bold text-gray-400 mb-1">Narração (Voz)</label>
                                        <label className="flex items-center gap-2 cursor-pointer bg-zinc-900 p-1.5 md:p-2 rounded border border-zinc-700 hover:border-purple-500 transition-colors h-[34px] md:h-[38px]">
                                            <input 
                                                type="checkbox" 
                                                checked={generateNarration} 
                                                onChange={(e) => setGenerateNarration(e.target.checked)} 
                                                className="w-4 h-4 accent-purple-500 cursor-pointer"
                                            />
                                            <span className="text-[10px] md:text-xs font-bold text-white select-none">Gerar Voz AI</span>
                                        </label>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] md:text-xs font-bold text-gray-400 mb-1">Áudio & SFX</label>
                                        <label className="flex items-center gap-2 cursor-pointer bg-zinc-900 p-1.5 md:p-2 rounded border border-zinc-700 hover:border-purple-500 transition-colors h-[34px] md:h-[38px]">
                                            <input 
                                                type="checkbox" 
                                                checked={includeAudioEffects} 
                                                onChange={(e) => setIncludeAudioEffects(e.target.checked)} 
                                                className="w-4 h-4 accent-purple-500 cursor-pointer"
                                            />
                                            <span className="text-[10px] md:text-xs font-bold text-white select-none">Gerar Música/SFX</span>
                                        </label>
                                    </div>

                                    {scriptInputMode === 'auto' && (
                                        <>
                                            <div className="col-span-1 md:col-span-2">
                                                <label className="block text-[10px] md:text-xs font-bold text-gray-400 mb-2">Modo de Criação</label>
                                                <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-700">
                                                    <button 
                                                        onClick={() => setFullScriptMode(false)}
                                                        className={`flex-1 py-1.5 px-3 rounded-md text-[10px] md:text-xs font-bold transition-all ${!fullScriptMode ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                                    >
                                                        ⏱️ Duração Alvo
                                                    </button>
                                                    <button 
                                                        onClick={() => setFullScriptMode(true)}
                                                        className={`flex-1 py-1.5 px-3 rounded-md text-[10px] md:text-xs font-bold transition-all ${fullScriptMode ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                                    >
                                                        📄 Roteiro Completo
                                                    </button>
                                                </div>
                                                {fullScriptMode && (
                                                    <div className="mt-2 p-2 bg-purple-900/30 border border-purple-500/50 rounded-lg animate-pulse">
                                                        <p className="text-[10px] text-purple-300 font-bold flex items-center gap-2">
                                                            <i className="fas fa-check-double"></i>
                                                            MODO VERBATIM ATIVADO: Seu texto será usado INTEGRALMENTE sem resumos.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            {!fullScriptMode && (
                                                <div>
                                                    <label className="block text-[10px] md:text-xs font-bold text-gray-400 mb-1">Duração Alvo (Min)</label>
                                                    <div className="flex items-center gap-2">
                                                        <input 
                                                            type="range" 
                                                            min="1" 
                                                            max="120" 
                                                            value={scriptDuration} 
                                                            onChange={e => setScriptDuration(parseInt(e.target.value))} 
                                                            className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-500" 
                                                        />
                                                        <span className="text-xs text-white font-bold min-w-[30px]">{scriptDuration}m</span>
                                                    </div>
                                                </div>
                                            )}

                                            <div>
                                                <label className="block text-[10px] md:text-xs font-bold text-gray-400 mb-1">Modelo de IA</label>
                                                <select value={scriptAIModel} onChange={e => setScriptAIModel(e.target.value as any)} className="w-full bg-zinc-900 p-1.5 md:p-2 rounded text-white border border-zinc-700 text-[10px] md:text-xs outline-none focus:border-purple-500">
                                                    <option value="gemini">✨ Gemini (Google)</option>
                                                    <option value="gpt">🧠 GPT-4o (OpenAI)</option>
                                                    <option value="claude">🎭 Claude 3.5 (Anthropic)</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-[10px] md:text-xs font-bold text-gray-400 mb-1">Ritmo / Energia</label>
                                                <select value={scriptEnergy} onChange={e => setScriptEnergy(e.target.value as any)} className="w-full bg-zinc-900 p-1.5 md:p-2 rounded text-white border border-zinc-700 text-[10px] md:text-xs outline-none focus:border-purple-500">
                                                    <option value="normal">Normal (Documentário)</option>
                                                    <option value="fast">⚡ Viral (Cortes Rápidos)</option>
                                                    <option value="calm">🍃 Calmo (Slow Paced)</option>
                                                </select>
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="flex items-center justify-center my-2 flex-shrink-0 gap-4">
                                    <span className="text-[10px] md:text-sm font-bold text-gray-400">Formato do Roteiro:</span>
                                    <select 
                                        value={scriptFormat} 
                                        onChange={(e) => setScriptFormat(e.target.value as any)} 
                                        className="bg-zinc-900 p-2 rounded text-white border border-zinc-700 text-xs focus:border-purple-500 outline-none"
                                    >
                                        <option value="monologue">Narração Única (Monólogo)</option>
                                        <option value="dialogue">Podcast / Diálogo (2 Pessoas)</option>
                                    </select>
                                </div>
                                
                                {/* Character Description Input */}
                                <div className="flex-shrink-0 px-1">
                                    <label className="block text-[10px] md:text-xs font-bold text-gray-400 mb-1 flex items-center gap-1">
                                        <i className="fas fa-user-circle text-purple-400"></i> Protagonista (Character Lock)
                                    </label>
                                    <input 
                                        type="text" 
                                        value={characterDescription} 
                                        onChange={(e) => setCharacterDescription(e.target.value)} 
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:border-purple-500 outline-none"
                                        placeholder="Ex: Jovem ruivo com barba, camisa xadrez. (Mantém consistência visual)"
                                    />
                                </div>
                                
                                {/* Tabs for Input Mode */}
                                <div className="flex gap-1 bg-zinc-900 p-1 rounded-2xl mb-2 w-fit self-center">
                                    <button 
                                        onClick={() => setScriptInputMode('auto')}
                                        className={`px-8 py-2.5 rounded-xl text-xs font-black transition-all ${scriptInputMode === 'auto' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40' : 'text-zinc-500 hover:text-white'}`}
                                    >
                                        <i className="fas fa-robot mr-2"></i> GERAÇÃO IA
                                    </button>
                                    <button 
                                        onClick={() => setScriptInputMode('manual')}
                                        className={`px-8 py-2.5 rounded-xl text-xs font-black transition-all ${scriptInputMode === 'manual' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-zinc-500 hover:text-white'}`}
                                    >
                                        <i className="fas fa-edit mr-2"></i> CRIAÇÃO MANUAL
                                    </button>
                                </div>

                                {scriptInputMode === 'auto' ? (
                                    <>
                                        {scriptFormat === 'dialogue' ? (
                                            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4 flex-shrink-0">
                                                    <div><label className="block text-[10px] md:text-xs font-bold text-gray-400 mb-1">Voz do Narrador 1 (Host)</label><select value={narrator1Voice} onChange={e => setNarrator1Voice(e.target.value)} className="w-full bg-zinc-900 p-1.5 md:p-2 rounded text-white border border-zinc-700 text-[10px] md:text-xs">{renderVoiceOptions()}</select></div>
                                                    <div><label className="block text-[10px] md:text-xs font-bold text-gray-400 mb-1">Voz do Narrador 2 (Guest)</label><select value={narrator2Voice} onChange={e => setNarrator2Voice(e.target.value)} className="w-full bg-zinc-900 p-1.5 md:p-2 rounded text-white border border-zinc-700 text-[10px] md:text-xs">{renderVoiceOptions()}</select></div>
                                                </div>
                                                
                                                <div className="bg-purple-900/20 border border-purple-500/30 p-3 rounded-lg mb-2">
                                                    <p className="text-xs text-purple-200">
                                                        <i className="fas fa-info-circle mr-2"></i> 
                                                        {fullScriptMode ? (
                                                            <span><strong>Modo Roteiro Completo:</strong> Cole seu roteiro final abaixo. O sistema usará seu texto <strong>exatamente</strong> como escrito para criar as cenas.</span>
                                                        ) : (
                                                            <span>Digite um <strong>Tópico</strong> (ex: "O Futuro da IA") ou <strong>Cole um Texto/URL</strong> para transformar em diálogo.</span>
                                                        )}
                                                    </p>
                                                </div>

                                                <div className="flex gap-1 bg-zinc-900 p-1 rounded-lg flex-shrink-0 overflow-x-auto mb-2">
                                                    <button onClick={() => setScriptSource('text')} className={`flex-1 py-1 px-2 text-[10px] md:text-xs font-bold rounded transition-colors whitespace-nowrap ${scriptSource === 'text' ? 'bg-zinc-700 text-white' : 'text-gray-400'}`}><i className="fas fa-keyboard mr-1"></i> Digitar</button>
                                                    <button onClick={() => setScriptSource('audio_mic')} className={`flex-1 py-1 px-2 text-[10px] md:text-xs font-bold rounded transition-colors whitespace-nowrap ${scriptSource === 'audio_mic' ? 'bg-zinc-700 text-white' : 'text-gray-400'}`}><i className="fas fa-microphone mr-1"></i> Gravar</button>
                                                    <button onClick={() => setScriptSource('url')} className={`flex-1 py-1 px-2 text-[10px] md:text-xs font-bold rounded transition-colors whitespace-nowrap ${scriptSource === 'url' ? 'bg-zinc-700 text-white' : 'text-gray-400'}`}><i className="fas fa-link mr-1"></i> URL</button>
                                                    <button onClick={() => setScriptSource('file')} className={`flex-1 py-1 px-2 text-[10px] md:text-xs font-bold rounded transition-colors whitespace-nowrap ${scriptSource === 'file' ? 'bg-zinc-700 text-white' : 'text-gray-400'}`}><i className="fas fa-file-alt mr-1"></i> Arq. Texto</button>
                                                    <button onClick={() => audioFileInputRef.current?.click()} className={`flex-1 py-1 px-2 text-[10px] md:text-xs font-bold rounded transition-colors whitespace-nowrap ${scriptSource === 'audio_file' ? 'bg-zinc-700 text-white' : 'text-gray-400'}`}><i className="fas fa-file-audio mr-1"></i> Arq. Áudio</button>
                                                </div>

                                                <div className="flex-1 overflow-y-auto bg-zinc-900 rounded-lg p-2">
                                                    <input type="file" ref={audioFileInputRef} accept="audio/*" onChange={handleAudioFileUpload} className="hidden" />
                                                    {scriptSource === 'text' && (
                                                        <div className="flex flex-col h-full">
                                                            <textarea 
                                                                value={scriptText} 
                                                                onChange={e => setScriptText(e.target.value)} 
                                                                className="w-full flex-1 bg-transparent border-0 rounded-lg p-2 text-white resize-none outline-none text-sm md:text-base" 
                                                                placeholder={fullScriptMode ? "COLE SEU ROTEIRO COMPLETO AQUI. Ele não será alterado." : "Digite um tópico ou cole o conteúdo..."} 
                                                            />
                                                            <div className="flex justify-between items-center px-2 py-1 border-t border-zinc-800 text-[10px] text-gray-500">
                                                                <span>{scriptText.trim().split(/\s+/).filter(Boolean).length} palavras</span>
                                                                {scriptText.trim().split(/\s+/).filter(Boolean).length > 3000 && (
                                                                    <span className="text-amber-500 flex items-center gap-1">
                                                                        <i className="fas fa-exclamation-triangle"></i> Roteiro longo (Pode levar alguns minutos)
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {scriptSource === 'url' && <div className="p-4 flex gap-2"><input type="text" value={scriptUrl} onChange={e => setScriptUrl(e.target.value)} placeholder="https://..." className="flex-1 bg-zinc-800 p-2 rounded text-sm" /><button onClick={handleUrlFetch} className="bg-blue-600 px-4 rounded text-sm" disabled={isFetchingUrl}>{isFetchingUrl ? <i className="fas fa-spinner fa-spin"></i> : "Buscar (Remake)"}</button></div>}
                                                    {scriptSource === 'audio_mic' && <div className="p-4 flex flex-col items-center justify-center h-full"><button onClick={handleSpeechToText} className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl ${isListening ? 'bg-red-600 animate-pulse' : 'bg-blue-600'}`}><i className="fas fa-microphone"></i></button><p className="text-xs text-gray-400 mt-2">{isListening ? 'Ouvindo...' : 'Clique para começar a gravar'}</p></div>}
                                                    {scriptSource === 'file' && <div className="p-4"><input type="file" ref={fileInputRef} accept=".txt,.srt" onChange={handleFileUpload} className="w-full p-2 bg-zinc-800 rounded text-sm" /></div>}
                                                </div>
                                            </div>
                                        ) : (
                                             <div className="flex-1 flex flex-col gap-2 overflow-hidden">
                                                <div className="flex-shrink-0 mb-2">
                                                    <label className="block text-[10px] md:text-xs font-bold text-gray-400 mb-1">Voz da Narração</label>
                                                    <select value={narrator1Voice} onChange={e => setNarrator1Voice(e.target.value)} className="w-full bg-zinc-900 p-1.5 md:p-2 rounded text-white border border-zinc-700 text-[10px] md:text-xs outline-none focus:border-purple-500">
                                                        {renderVoiceOptions()}
                                                    </select>
                                                </div>
                                                <div className="flex gap-1 bg-zinc-900 p-1 rounded-lg flex-shrink-0 overflow-x-auto">
                                                    <button onClick={() => setScriptSource('text')} className={`flex-1 py-1 px-2 text-[10px] md:text-xs font-bold rounded transition-colors whitespace-nowrap ${scriptSource === 'text' ? 'bg-zinc-700 text-white' : 'text-gray-400'}`}><i className="fas fa-keyboard mr-1"></i> Digitar</button>
                                                    <button onClick={() => setScriptSource('audio_mic')} className={`flex-1 py-1 px-2 text-[10px] md:text-xs font-bold rounded transition-colors whitespace-nowrap ${scriptSource === 'audio_mic' ? 'bg-zinc-700 text-white' : 'text-gray-400'}`}><i className="fas fa-microphone mr-1"></i> Gravar</button>
                                                    <button onClick={() => setScriptSource('url')} className={`flex-1 py-1 px-2 text-[10px] md:text-xs font-bold rounded transition-colors whitespace-nowrap ${scriptSource === 'url' ? 'bg-zinc-700 text-white' : 'text-gray-400'}`}><i className="fas fa-link mr-1"></i> URL</button>
                                                    <button onClick={() => setScriptSource('file')} className={`flex-1 py-1 px-2 text-[10px] md:text-xs font-bold rounded transition-colors whitespace-nowrap ${scriptSource === 'file' ? 'bg-zinc-700 text-white' : 'text-gray-400'}`}><i className="fas fa-file-alt mr-1"></i> Arq. Texto</button>
                                                    <button onClick={() => audioFileInputRef.current?.click()} className={`flex-1 py-1 px-2 text-[10px] md:text-xs font-bold rounded transition-colors whitespace-nowrap ${scriptSource === 'audio_file' ? 'bg-zinc-700 text-white' : 'text-gray-400'}`}><i className="fas fa-file-audio mr-1"></i> Arq. Áudio</button>
                                                </div>
                                                <div className="flex-1 overflow-y-auto bg-zinc-900 rounded-lg p-2">
                                                    <input type="file" ref={audioFileInputRef} accept="audio/*" onChange={handleAudioFileUpload} className="hidden" />
                                                    {scriptSource === 'text' && (
                                                        <div className="flex flex-col h-full">
                                                            <textarea 
                                                                value={scriptText} 
                                                                onChange={e => setScriptText(e.target.value)} 
                                                                className="w-full flex-1 bg-transparent border-0 rounded-lg p-2 text-white resize-none outline-none text-sm md:text-base" 
                                                                placeholder={fullScriptMode ? "COLE SEU ROTEIRO COMPLETO AQUI. Ele não será alterado." : (scriptText ? "Conteúdo importado! Pronto para remixar." : "Escreva sua história, ideia de vídeo ou cole um roteiro aqui...")} 
                                                            />
                                                            <div className="flex justify-between items-center px-2 py-1 border-t border-zinc-800 text-[10px] text-gray-500">
                                                                <span>{scriptText.trim().split(/\s+/).filter(Boolean).length} palavras</span>
                                                                {scriptText.trim().split(/\s+/).filter(Boolean).length > 3000 && (
                                                                    <span className="text-amber-500 flex items-center gap-1">
                                                                        <i className="fas fa-exclamation-triangle"></i> Roteiro longo
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {scriptSource === 'url' && <div className="p-4 flex gap-2"><input type="text" value={scriptUrl} onChange={e => setScriptUrl(e.target.value)} placeholder="https://..." className="flex-1 bg-zinc-800 p-2 rounded text-sm" /><button onClick={handleUrlFetch} className="bg-blue-600 px-4 rounded text-sm" disabled={isFetchingUrl}>{isFetchingUrl ? <i className="fas fa-spinner fa-spin"></i> : "Buscar (Remake)"}</button></div>}
                                                    {scriptSource === 'audio_mic' && <div className="p-4 flex flex-col items-center justify-center h-full"><button onClick={handleSpeechToText} className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl ${isListening ? 'bg-red-600 animate-pulse' : 'bg-blue-600'}`}><i className="fas fa-microphone"></i></button><p className="text-xs text-gray-400 mt-2">{isListening ? 'Ouvindo...' : 'Clique para começar a gravar'}</p></div>}
                                                    {scriptSource === 'file' && <div className="p-4"><input type="file" ref={fileInputRef} accept=".txt,.srt" onChange={handleFileUpload} className="w-full p-2 bg-zinc-800 rounded text-sm" /></div>}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    // MANUAL MODE UI
                                    <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="flex-1 overflow-y-auto pr-2 space-y-4 scrollbar-thin pb-4">
                                            {manualScenes.map((scene, idx) => (
                                                <div key={scene.id} className="bg-zinc-800 rounded-2xl p-4 border border-zinc-700 shadow-lg relative group transition-all hover:border-blue-500/50">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <span className="bg-blue-600/20 text-blue-400 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Cena {idx + 1}</span>
                                                        <button 
                                                            onClick={() => removeManualScene(scene.id)}
                                                            className="text-zinc-600 hover:text-red-500 transition-colors"
                                                            title="Remover Cena"
                                                        >
                                                            <i className="fas fa-trash-alt"></i>
                                                        </button>
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                                        <div className="md:col-span-8 space-y-2">
                                                            <label className="text-[10px] font-bold text-gray-500 uppercase">O que será dito (Narração)</label>
                                                            <textarea 
                                                                value={scene.narration}
                                                                onChange={e => updateManualScene(scene.id, 'narration', e.target.value)}
                                                                placeholder="Digite o texto que o narrador deve falar..."
                                                                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-3 text-sm text-white resize-none h-24 focus:border-blue-500 transition-all"
                                                            />
                                                        </div>
                                                        <div className="md:col-span-4 flex flex-col gap-4">
                                                            <div className="space-y-2">
                                                                <label className="text-[10px] font-bold text-gray-500 uppercase">Voz desta Cena</label>
                                                                <div className="flex gap-2">
                                                                    <select 
                                                                        value={scene.speaker}
                                                                        onChange={e => updateManualScene(scene.id, 'speaker', e.target.value)}
                                                                        className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-xs text-white font-bold"
                                                                    >
                                                                        <option value="narrator1">🎙️ Narrador 1</option>
                                                                        <option value="narrator2">🎙️ Narrador 2</option>
                                                                    </select>
                                                                    {/* Play button next to voice selector for preview */}
                                                                    <button
                                                                        onClick={() => onPreviewTTS?.("Teste de voz.", scene.speaker === 'narrator1' ? narrator1Voice : narrator2Voice)}
                                                                        className="w-10 bg-zinc-800 border border-zinc-700 rounded-xl hover:bg-zinc-700 text-white transition-colors flex items-center justify-center"
                                                                        title="Ouvir Voz"
                                                                    >
                                                                        <i className="fas fa-volume-up"></i>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <label className="text-[10px] font-bold text-gray-500 uppercase">Visual (Prompt)</label>
                                                                <input 
                                                                    value={scene.visual}
                                                                    onChange={e => updateManualScene(scene.id, 'visual', e.target.value)}
                                                                    placeholder="O que mostrar na tela?"
                                                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-xs text-white"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            <button 
                                                onClick={addManualScene}
                                                className="w-full py-4 border-2 border-dashed border-zinc-700 hover:border-blue-500 hover:bg-blue-600/10 rounded-2xl flex items-center justify-center gap-2 text-zinc-600 hover:text-blue-400 font-black text-xs transition-all uppercase tracking-widest"
                                            >
                                                <i className="fas fa-plus-circle text-lg"></i> ADICIONAR NOVA CENA
                                            </button>
                                        </div>
                                    </div>
                                )}
                                
                                <div className="mt-auto pt-4 flex-shrink-0">
                                    <button onClick={processScript} disabled={scriptLoading} className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all transform hover:scale-[1.01]"> {scriptLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-wand-magic-sparkles"></i>} GERAR VÍDEO MÁGICO </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col overflow-hidden">
                                {scriptMusicPrompt && (
                                   <div className="bg-gradient-to-r from-indigo-900 to-purple-900 p-4 rounded-lg mb-4 border border-indigo-500/50 flex-shrink-0">
                                       <h4 className="text-white font-bold flex items-center gap-2 text-xs"><i className="fas fa-music"></i> Trilha Sonora Sugerida (AI Analysis)</h4>
                                       <p className="text-[10px] text-indigo-200 mt-1">Mood: <span className="text-white font-semibold">{scriptMood}</span> | Gênero: <span className="text-white font-semibold">{scriptGenre}</span></p>
                                       <p className="text-[10px] text-gray-400 italic mt-2 line-clamp-2">"{scriptMusicPrompt}"</p>
                                       
                                       {selectedBgMusic ? (
                                           <div className="mt-2 p-2 bg-green-900/30 border border-green-500/30 rounded flex items-center gap-2">
                                               <i className="fas fa-check-circle text-green-400"></i>
                                               <span className="text-[10px] text-green-200">Música de fundo encontrada automaticamente</span>
                                               <audio src={selectedBgMusic || undefined} controls className="h-6 w-32 ml-auto" />
                                           </div>
                                       ) : (
                                           <div className="flex gap-2 mt-3">
                                               <button onClick={handleGenerateMusicClick} className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold"><i className="fas fa-magic mr-1"></i> Gerar com AI</button>
                                               <button 
                                                   onClick={handleSearchFreesoundClick} 
                                                   disabled={isSearchingMusic}
                                                   className={`flex-1 py-1.5 text-white rounded text-[10px] font-bold flex items-center justify-center gap-2 ${isSearchingMusic ? 'bg-zinc-600 cursor-not-allowed' : 'bg-zinc-700 hover:bg-zinc-600'}`}
                                               >
                                                   {isSearchingMusic ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-search"></i>}
                                                   {isSearchingMusic ? 'Buscando...' : 'Selecionar Freesound (Auto)'}
                                               </button>
                                           </div>
                                       )}
                                   </div>
                                )}

                                <div className="flex-1 overflow-y-auto scrollbar-thin space-y-4 pr-2">
                                    {generatedScenes.map((scene, idx) => (
                                        <div key={idx} className="bg-zinc-900 p-3 rounded-lg border border-zinc-700 flex gap-4">
                                            <div className="aspect-video bg-black rounded overflow-hidden flex-shrink-0 relative group w-40">
                                                {scene.isGenerating ? (
                                                    <div className="absolute inset-0 flex items-center justify-center text-purple-500"><i className="fas fa-spinner fa-spin text-2xl"></i></div>
                                                ) : scene.error ? (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 bg-red-900/20 p-2">
                                                        <i className="fas fa-exclamation-triangle text-xl mb-2"></i>
                                                        <p className="text-center text-[10px] leading-tight font-semibold">{scene.error}</p>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {scene.imageUrl?.includes('pexels.com/video-files') || scene.imageUrl?.includes('pixabay.com/videos') ? (
                                                            <video src={scene.imageUrl || undefined} className="w-full h-full object-cover" muted loop autoPlay onMouseOver={(e: any) => e.currentTarget.play()} onMouseOut={(e: any) => e.currentTarget.pause()} />
                                                        ) : (
                                                            <img src={scene.imageUrl || RESOURCES.previewImage} className="w-full h-full object-cover" />
                                                        )}
                                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-4 text-white text-xl transition-opacity">
                                                            <button onClick={() => regenerateImage(idx)} className="cursor-pointer hover:text-purple-400 transition-colors" title="Regenerar Imagem (Gemini)"><i className="fas fa-sync"></i></button>
                                                            <button onClick={() => handleOpenEditImageModal(idx)} className="cursor-pointer hover:text-blue-400 transition-colors" title="Editar Imagem (Gemini)"><i className="fas fa-edit"></i></button>
                                                        </div>
                                                        {/* Speaker Badge */}
                                                        {scene.speaker && (
                                                            <div className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[8px] font-bold text-white shadow ${scene.speaker === 'narrator2' ? 'bg-green-600' : 'bg-blue-600'}`}>
                                                                {scene.speaker === 'narrator2' ? '🗣️ 2' : '🗣️ 1'}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start mb-1">
                                                    <h4 className="text-xs font-bold text-purple-400">Cena {idx + 1}</h4>
                                                    <div className="flex items-center gap-1">
                                                        {scene.layout && scene.layout !== 'fullscreen' && (
                                                            <span className="text-[8px] bg-purple-600 px-1.5 py-0.5 rounded text-white font-bold uppercase tracking-wider shadow-sm border border-white/20">
                                                                {scene.layout === 'overlay_pop' ? '✨ Overlay' : '💥 Impact'}
                                                            </span>
                                                        )}
                                                        {scene.speaker && <span className={`text-[10px] font-bold ${scene.speaker === 'narrator2' ? 'text-green-400' : 'text-blue-400'}`}>{scene.speaker === 'narrator2' ? 'Convidado/Narrador 2' : 'Host/Narrador 1'}</span>}
                                                    </div>
                                                </div>
                                                <p className="text-sm text-gray-200">{scene.narration}</p>
                                                <div className="flex justify-between items-end mt-2">
                                                    <p className="text-[10px] text-gray-500 italic truncate max-w-[150px]">{scene.visual}</p>
                                                    {scene.sfxUrl && (
                                                        <span className="text-[9px] bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30 flex items-center gap-1">
                                                            <i className="fas fa-volume-high"></i> SFX Encontrado
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="pt-4 flex gap-2 flex-shrink-0">
                                    <button onClick={() => setScriptStage('input')} className="px-6 py-3 bg-zinc-700 text-white rounded-lg font-bold hover:bg-zinc-600 transition-colors">Voltar</button>
                                    <button onClick={() => { onAddScriptToTimeline?.(generatedScenes, false, undefined, includeAudioEffects ? selectedBgMusic : undefined, generateNarration); setShowScriptModal(false); }} className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold shadow-lg transition-colors">
                                        <i className="fas fa-check mr-2"></i> ADICIONAR À TIMELINE
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
             {showEditImageModal && editingSceneIndex !== null && (
                <div className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowEditImageModal(false)}>
                    <div className="bg-zinc-800 p-6 rounded-lg w-[500px] shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-white mb-4">Editar Imagem da Cena</h3>
                        <img src={generatedScenes[editingSceneIndex].imageUrl || undefined} className="w-full aspect-video rounded mb-4 object-contain bg-black" />
                        <textarea
                            value={editImagePrompt}
                            onChange={e => setEditImagePrompt(e.target.value)}
                            placeholder="Descreva a alteração. Ex: 'add a hat on the person', 'make it night time'..."
                            className="w-full bg-zinc-900 border border-zinc-700 rounded p-3 text-white text-sm focus:border-blue-500 outline-none resize-none h-24"
                        />
                        <div className="flex gap-2 mt-4">
                            <button onClick={() => setShowEditImageModal(false)} className="flex-1 py-2 bg-zinc-700 rounded">Cancelar</button>
                            <button onClick={handleConfirmEditImage} className="flex-1 py-2 bg-blue-600 rounded">Gerar</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Generative Fill Modal */}
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
        </div>
    );
};