
import React from 'react';
import { TimelinePanel } from './TimelinePanel';
import { BrowserPanel } from './BrowserPanel';
import { InspectorPanel } from './InspectorPanel';
import { Clip, MediaItem, EditorState, TextDesignProperties, ScriptScene, VideoConfig, ScriptAnalysisResult } from '../types';

interface MobileLayoutProps {
    mobileTab: 'timeline' | 'browser' | 'inspector';
    setMobileTab: (tab: 'timeline' | 'browser' | 'inspector') => void;
    state: EditorState;
    setState: React.Dispatch<React.SetStateAction<EditorState>>;
    handleUpdateClip: (id: string, updates: Partial<Clip>) => void;
    handleSplit: () => void;
    handleDelete: () => void;
    handleDuplicate: () => void;
    handleUndo: () => void;
    handleRedo: () => void;
    handleImport: (files: FileList | null, forceType?: 'audio' | 'video' | 'image') => void;
    handleGenerateImage: (prompt: string, aspectRatio?: string) => Promise<void>;
    handleGenerateVideo: (prompt: string, duration?: number) => Promise<void>;
    handleGenerateTTS: (text: string, voice: string, style?: string, speed?: number, pitch?: number, autoSubtitle?: boolean, subtitleTemplateId?: string) => Promise<void>;
    handleGenerateNarration: (text: string, voice: string, targetClipId: string, style?: string, speed?: number, pitch?: number, autoSubtitle?: boolean, subtitleTemplateId?: string) => Promise<void>;
    handlePreviewTTS: (text: string, voice: string, style?: string, speed?: number, pitch?: number) => Promise<void>;
    handleApplyResource: (type: 'transition' | 'effect' | 'movement', id: string, config?: any) => void;
    handleApplyToAll: (type: 'transition' | 'effect' | 'movement', id: string) => void;
    handleBackendAction: (action: string, friendlyName: string, params?: Record<string, any>, options?: any) => void;
    addMediaItemToState: (item: MediaItem, time?: number, track?: string) => void;
    calculateProjectDuration: (clips: Clip[]) => number;
    withHistory: (prev: EditorState, updates: Partial<EditorState>) => EditorState;
    
    activeTool?: 'cursor' | 'magic-eraser';
    setActiveTool?: (tool: 'cursor' | 'magic-eraser') => void;
    magicEraserBrushSize?: number;
    setMagicEraserBrushSize?: (size: number) => void;
    applyMagicEraser?: () => void;
    clearMagicEraserMask?: () => void;
    onGeminiStyleTransfer?: (media: MediaItem, style: string, ratio: string) => void;
    onGenerativeFill?: (prompt: string) => void;
    onGenerativeOverlay?: (prompt: string) => void;
    onSmartBRoll?: (params: { type: 'video' | 'image', density: 'low' | 'high' | 'medium', source: 'pexels' | 'gemini' }) => void;
    onTranscribeAudio?: (file: File) => Promise<string>;
    onRegenerateSceneImage?: (scene: ScriptScene, style: string, aspectRatio: string, source?: string, characterDesc?: string) => Promise<ScriptScene>;
    onEditSceneImage?: (scene: ScriptScene, prompt: string) => Promise<ScriptScene>;
    onDownloadClip?: (clipId: string) => void;
    onExtractAudio?: (clipId: string) => void;
    onAnalyzeScript?: (script: string) => Promise<ScriptAnalysisResult>;
    onGenerateSceneMedia?: (scene: ScriptScene, voiceId: string, style: string, aspectRatio: string, source?: string, narrator1Voice?: string, narrator2Voice?: string, characterDesc?: string) => Promise<ScriptScene>;
    onAddScriptToTimeline?: (scenes: ScriptScene[], autoSubtitle?: boolean, subtitleStyleId?: string, bgMusicUrl?: string) => void;
    onSearchFreesound?: (query: string) => Promise<any[]>;
    onImportRemoteMedia?: (url: string, name: string, type: 'audio' | 'video' | 'image', targetTrack?: string) => Promise<void>;
    onGenerateSubtitles?: (scope: 'single' | 'all' | 'update_style', templateId?: string) => Promise<void>;
    onGeminiRemoveBackground?: () => void;
    onGenerateVeo?: (config: VideoConfig) => Promise<void>;
    
    // New props for Inspector features
    onVisualTranslation?: (targetLanguage: string) => void;
    onTextToMotion?: (description: string) => void;
    onAutoBeatSync?: (clipId: string, sensitivity: number, action: 'cut' | 'marker') => Promise<void>;
    onFetchUrl?: (url: string) => Promise<string>;
    onSyncTrackProperties?: (sourceClipId: string, trackType: string) => void;
    onGeminiUpscale?: (clipId: string) => void;
    onClearTimeline?: () => void;
    onAutoTransitions?: () => void;
}

export const MobileLayout: React.FC<MobileLayoutProps> = ({
    mobileTab, setMobileTab, state, setState,
    handleUpdateClip, handleSplit, handleDelete, handleDuplicate, handleUndo, handleRedo,
    handleImport, handleGenerateImage, handleGenerateVideo, handleGenerateTTS, handleGenerateNarration, handlePreviewTTS,
    handleApplyResource, handleApplyToAll, handleBackendAction, addMediaItemToState, calculateProjectDuration, withHistory,
    activeTool, setActiveTool, magicEraserBrushSize, setMagicEraserBrushSize, applyMagicEraser, clearMagicEraserMask, onGeminiStyleTransfer,
    onGenerativeFill, onGenerativeOverlay, onSmartBRoll, onTranscribeAudio, onRegenerateSceneImage, onEditSceneImage, onDownloadClip, onExtractAudio,
    onAnalyzeScript, onGenerateSceneMedia, onAddScriptToTimeline, onSearchFreesound, onImportRemoteMedia, onGenerateSubtitles,
    onGeminiRemoveBackground, onGenerateVeo, onVisualTranslation, onTextToMotion, onAutoBeatSync, onFetchUrl,
    onSyncTrackProperties,
    onGeminiUpscale,
    onClearTimeline,
    onAutoTransitions
}) => {
    return (
        <div className="md:hidden absolute inset-x-0 bottom-[60px] top-[35vh] bg-zinc-800 z-40 overflow-hidden border-t border-zinc-700 shadow-2xl">
            {/* Mobile Tab Navigation */}
            <div className="flex bg-zinc-900 border-b border-zinc-700">
                <button onClick={() => setMobileTab('timeline')} className={`flex-1 py-3 text-xs font-bold uppercase ${mobileTab === 'timeline' ? 'text-white border-b-2 border-blue-500 bg-zinc-800' : 'text-gray-500'}`}>Timeline</button>
                <button onClick={() => setMobileTab('browser')} className={`flex-1 py-3 text-xs font-bold uppercase ${mobileTab === 'browser' ? 'text-white border-b-2 border-blue-500 bg-zinc-800' : 'text-gray-500'}`}>Mídia</button>
                <button onClick={() => setMobileTab('inspector')} className={`flex-1 py-3 text-xs font-bold uppercase ${mobileTab === 'inspector' ? 'text-white border-b-2 border-blue-500 bg-zinc-800' : 'text-gray-500'}`}>Editar</button>
            </div>

            <div className="h-[calc(100%-40px)] overflow-hidden bg-zinc-800">
                {mobileTab === 'timeline' && (
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
                        onUpdateClip={handleUpdateClip}
                        onTimeChange={(t) => setState(s => ({...s, currentPlayheadTime: t}))}
                        onDrop={() => {}}
                        onSplit={handleSplit}
                        onDelete={handleDelete}
                        onDuplicate={handleDuplicate}
                        onUndo={handleUndo}
                        onRedo={handleRedo}
                        onChangeZoom={(z) => setState(s => ({...s, pixelsPerSecond: z}))}
                        onAutoTransitions={onAutoTransitions}
                        onDownloadClip={onDownloadClip}
                        onExtractAudio={onExtractAudio}
                    />
                )}
                {mobileTab === 'browser' && (
                    <BrowserPanel 
                        mediaLibrary={state.media}
                        clips={state.clips}
                        selectedClipId={state.selectedClipId}
                        currentAspectRatio={state.projectAspectRatio}
                        onImport={handleImport}
                        onDragStart={() => {}}
                        onGenerateVideo={handleGenerateVideo}
                        onGenerateTTS={handleGenerateTTS}
                        onGenerateNarration={handleGenerateNarration}
                        onPreviewTTS={handlePreviewTTS}
                        onGenerateImage={handleGenerateImage}
                        onChangeAspectRatio={(r: string) => setState(s => ({...s, projectAspectRatio: r}))}
                        onChangeBackground={(c: string) => setState(s => ({...s, backgroundColor: c}))}
                        onSetBackgroundImage={() => {}} 
                        onRemoveBackgroundImage={() => {}} 
                        onAddText={(styleId: string | 'update', design: any) => {
                            const newClip: Clip = {
                                id: `text_${Date.now()}`,
                                fileName: 'Text Layer',
                                type: 'text',
                                track: 'text',
                                start: state.currentPlayheadTime,
                                duration: 3,
                                styleId: styleId !== 'update' ? styleId : undefined,
                                properties: { text: 'Texto', textDesign: design as any }
                            };
                            setState(prev => {
                                const newClips = [...prev.clips, newClip];
                                return withHistory(prev, { clips: newClips, totalDuration: calculateProjectDuration(newClips) });
                            });
                            setMobileTab('timeline');
                        }}
                        onBackendAction={handleBackendAction}
                        onAddToTimeline={(item) => { addMediaItemToState(item); setMobileTab('timeline'); }}
                        onApplyResource={(type, id, cfg) => { handleApplyResource(type, id, cfg); setMobileTab('timeline'); }} 
                        onApplyToAll={handleApplyToAll}
                        onUpdateClip={handleUpdateClip}
                        onGeminiStyleTransfer={onGeminiStyleTransfer}
                        onTranscribeAudio={onTranscribeAudio}
                        onAnalyzeScript={onAnalyzeScript}
                        onGenerateSceneMedia={onGenerateSceneMedia}
                        onAddScriptToTimeline={onAddScriptToTimeline}
                        onRegenerateSceneImage={onRegenerateSceneImage}
                        onEditSceneImage={onEditSceneImage}
                        onSearchFreesound={onSearchFreesound}
                        onImportRemoteMedia={onImportRemoteMedia}
                        onGenerateSubtitles={onGenerateSubtitles}
                        onGenerativeFill={onGenerativeFill}
                        onGenerativeOverlay={onGenerativeOverlay}
                        onGenerateVeo={onGenerateVeo}
                        onFetchUrl={onFetchUrl}
                        onClearTimeline={onClearTimeline}
                    />
                )}
                {mobileTab === 'inspector' && (
                    <InspectorPanel 
                        selectedClip={state.clips.find(c => c.id === state.selectedClipId) || null}
                        selectedTransition={state.selectedTransition}
                        onUpdate={(updates) => {
                            if(state.selectedClipId) handleUpdateClip(state.selectedClipId, updates);
                        }}
                        onBackendAction={handleBackendAction}
                        onAiColorGrade={() => {}}
                        clips={state.clips}
                        mediaLibrary={state.media}
                        activeTool={activeTool}
                        onSetActiveTool={setActiveTool}
                        magicEraserBrushSize={magicEraserBrushSize}
                        onSetMagicEraserBrushSize={setMagicEraserBrushSize}
                        onApplyMagicEraser={applyMagicEraser}
                        onClearMagicEraserMask={clearMagicEraserMask}
                        onGeminiStyleTransfer={onGeminiStyleTransfer}
                        onGenerativeFill={onGenerativeFill}
                        onGenerativeOverlay={onGenerativeOverlay}
                        onSmartBRoll={onSmartBRoll}
                        onExtractAudio={() => state.selectedClipId && onExtractAudio?.(state.selectedClipId)}
                        onImportRemoteMedia={onImportRemoteMedia}
                        onGeminiRemoveBackground={onGeminiRemoveBackground}
                        onVisualTranslation={onVisualTranslation}
                        onTextToMotion={onTextToMotion}
                        onAutoBeatSync={onAutoBeatSync}
                        onGenerateVideo={handleGenerateVideo}
                        onSyncTrackProperties={onSyncTrackProperties}
                        onGeminiUpscale={onGeminiUpscale}
                        onAutoTransitions={onAutoTransitions}
                    />
                )}
            </div>
        </div>
    );
};
