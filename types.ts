
export enum VideoAspectRatio {
  Landscape = '16:9',
  Portrait = '9:16'
}

export enum VideoResolution {
  Res720p = '720p',
  Res1080p = '1080p'
}

export interface VideoConfig {
  prompt: string;
  image?: string; // Base64 string
  imageMimeType?: string;
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
  durationSeconds?: number;
  model?: 'veo-3.1-lite-generate-preview' | 'veo-3.1-generate-preview';
  lastFrame?: string;
  referenceImages?: string[];
}

export interface GeneratedVideo {
  id: string;
  url: string; // Blob URL
  prompt: string;
  createdAt: Date;
  config: VideoConfig;
}

export interface GenerationState {
  isGenerating: boolean;
  statusMessage: string;
  progress?: number;
}

export interface AIStudio {
  hasSelectedApiKey: () => Promise<boolean>;
  openSelectKey: () => Promise<void>;
}

// Global declaration removed to avoid conflict with src/types.ts
// declare global {
//   interface Window {
//     aistudio?: AIStudio;
//   }
// }

export interface MediaItem {
    name: string;
    url: string;
    type: 'video' | 'audio' | 'image';
    duration: number;
    thumbnail?: string;
    isUserFile?: boolean;
    hasAudio?: boolean;
}

export type MediaType = 'video' | 'audio' | 'image';

export interface ClipProperties {
    opacity?: number;
    volume?: number;
    speed?: number;
    transform?: { x: number; y: number; scale: number; rotation: number };
    adjustments?: { brightness: number; contrast: number; saturate: number; hue: number };
    crop?: { top: number; bottom: number; left: number; right: number };
    mask?: { shape: 'none' | 'circle' | 'rectangle' | 'heart' | 'star' };
    reverse?: boolean;
    mirror?: boolean;
    fit?: 'cover' | 'contain';
    blendMode?: string;
    text?: string;
    textDesign?: TextDesignProperties;
    speedCurve?: { preset: string; points: {time: number; speed: number}[] };
    movement?: MovementConfig;
    audioFadeIn?: number;
    audioFadeOut?: number;
}

export interface MovementConfig {
    type: string;
    config?: Record<string, number>;
}

export interface TextDesignProperties {
    color?: string;
    backgroundColor?: string;
    background?: string;
    fontFamily?: string;
    shadow?: { x: number; y: number; blur: number; color: string };
    stroke?: { width: number; color: string };
    animation?: { in?: string; out?: string; loop?: string };
    effectId?: string;
    isProgressBar?: boolean;
    isLowerThird?: boolean;
}

export interface Clip {
    id: string;
    fileName: string;
    type: 'video' | 'audio' | 'image' | 'text';
    track: 'video' | 'audio' | 'narration' | 'music' | 'sfx' | 'text' | 'camada' | 'camada2' | 'camada3' | 'subtitle';
    start: number;
    duration: number;
    mediaStartOffset?: number;
    properties: ClipProperties;
    effect?: string;
    transition?: Transition;
    styleId?: string;
    children?: Clip[]; // For unified clips
}

export interface Transition {
    id: string;
    duration: number;
    videoUrl?: string; // For AI generated transitions
    isGenerating?: boolean;
}

export interface EditorState {
    media: Record<string, MediaItem>;
    clips: Clip[];
    selectedClipId: string | null;
    selectedTransition: { clipId: string | null } | null;
    currentPlayheadTime: number;
    isPlaying: boolean;
    pixelsPerSecond: number;
    totalDuration: number;
    projectAspectRatio: string;
    activeAudioNodes: Record<string, AudioBufferSourceNode>;
    backgroundColor: string;
    history: any[];
    historyIndex: number;
    mode: EditorMode;
}

export interface CustomFont {
    id: string;
    name: string;
    family: string;
    url: string;
}

export interface ScriptScene {
    id: string;
    narration: string;
    visual: string;
    sfx?: string;
    sfxSearch?: string; // Termo de busca para o Freesound
    sfxUrl?: string; // URL encontrada automaticamente
    transition?: string;
    imageUrl?: string;
    audioUrl?: string;
    audioDuration?: number;
    isGenerating?: boolean;
    error?: string;
    speaker?: 'narrator1' | 'narrator2';
    layout?: 'fullscreen' | 'overlay_pop' | 'impact_shake';
}

export interface ScriptAnalysisResult {
    scenes: ScriptScene[];
    musicPrompt?: string;
    musicSearch?: string; // Termo de busca para música de fundo
    musicUrl?: string; // URL encontrada automaticamente
    ambiencePrompt?: string;
    mood?: string;
    genre?: string;
}

export interface VideoProject {
  id: string;
  title: string;
  prompt: string;
  videoUrl: string;
  thumbnail?: string;
  status: 'pending' | 'completed' | 'failed';
  aspectRatio: string;
  resolution: string;
}

export interface ApiSettings {
    elevenLabsKey?: string;
    fishAudioKey?: string;
    openAIKey?: string;
    googleApiKey?: string;
    freesoundKey?: string;
    unsplashKey?: string;
    pixabayKey?: string;
    pexelsKey?: string;
    huggingFaceToken?: string;
    epidemicApiKey?: string;
}

export interface KenBurnsConfig {
    startScale: number;
    endScale: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
}

export enum EditorMode {
  TEXT = 'TEXT',
  CODE = 'CODE'
}

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  aspectRatio: string;
  createdAt: number;
  timestamp: number;
}
