
import React, { useState, useEffect } from 'react';
import { ApiSettings } from '../types';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaveProject: (name: string) => void;
    onNewProject: () => void;
    onImportProject: () => void;
    onExport: (config: any) => void;
    onChangeAspectRatio: (ratio: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, onClose, onSaveProject, onNewProject, onImportProject, onExport, onChangeAspectRatio 
}) => {
    const [apiKeys, setApiKeys] = useState<ApiSettings>({
        elevenLabsKey: '',
        fishAudioKey: '',
        openAIKey: '',
        googleApiKey: '',
        freesoundKey: '',
        unsplashKey: '',
        pixabayKey: '',
        pexelsKey: '',
        huggingFaceToken: '',
        epidemicApiKey: ''
    });

    const [projectName, setProjectName] = useState('Meu Projeto');

    useEffect(() => {
        const savedKeys = localStorage.getItem('proedit_api_keys');
        if (savedKeys) {
            try { setApiKeys(JSON.parse(savedKeys)); } catch (e) { console.error(e); }
        }
    }, [isOpen]);

    const handleSaveKeys = () => {
        localStorage.setItem('proedit_api_keys', JSON.stringify(apiKeys));
        alert("Todas as chaves de API foram salvas com sucesso no navegador!");
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-y-auto" onClick={onClose}>
            <div className="bg-zinc-900 border border-zinc-700 w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-6 border-b border-zinc-800">
                    <h3 className="text-xl font-black text-white flex items-center gap-2">
                        <i className="fas fa-cog text-gray-400"></i> CONFIGURAÇÕES & CHAVES
                    </h3>
                    <button onClick={onClose} className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center hover:bg-red-600 transition-all">
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin">
                    <section>
                        <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-4 border-b border-zinc-800 pb-2">Gerenciar Projeto</h4>
                        <div className="bg-zinc-800 p-4 rounded-2xl border border-zinc-700 mb-4">
                            <label className="text-[10px] font-bold text-gray-500 uppercase mb-2 block">Nome do Arquivo</label>
                            <input 
                                value={projectName} 
                                onChange={e => setProjectName(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-blue-500 mb-4"
                                placeholder="Nome do Projeto"
                            />
                            <div className="grid grid-cols-3 gap-2">
                                <button onClick={onNewProject} className="py-3 bg-zinc-900 hover:bg-zinc-700 border border-zinc-700 hover:border-green-500 rounded-xl text-white text-xs font-bold transition-all flex flex-col items-center gap-1 group">
                                    <i className="fas fa-file-circle-plus text-lg text-green-600 group-hover:scale-110 transition-transform"></i>NOVO
                                </button>
                                <button onClick={() => onSaveProject(projectName)} className="py-3 bg-zinc-900 hover:bg-zinc-700 border border-zinc-700 hover:border-blue-500 rounded-xl text-white text-xs font-bold transition-all flex flex-col items-center gap-1 group">
                                    <i className="fas fa-save text-lg text-blue-600 group-hover:scale-110 transition-transform"></i>SALVAR
                                </button>
                                <button onClick={onImportProject} className="py-3 bg-zinc-900 hover:bg-zinc-700 border border-zinc-700 hover:border-yellow-500 rounded-xl text-white text-xs font-bold transition-all flex flex-col items-center gap-1 group">
                                    <i className="fas fa-folder-open text-lg text-yellow-600 group-hover:scale-110 transition-transform"></i>CARREGAR
                                </button>
                            </div>
                        </div>
                    </section>

                    <section>
                        <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-2">
                            <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Configuração de API</h4>
                            <button onClick={handleSaveKeys} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-[10px] font-bold transition-colors shadow-lg">SALVAR CHAVES</button>
                        </div>
                        <div className="space-y-4">
                            <div className="bg-blue-900/20 border border-blue-700/50 p-3 rounded-xl mb-4 flex gap-3">
                                <i className="fas fa-key text-blue-400 mt-1"></i>
                                <p className="text-[10px] text-blue-300 leading-tight">Insira suas chaves para desbloquear funcionalidades Premium.</p>
                            </div>
                            
                            {[
                                { id: 'googleApiKey', name: 'Google Gemini (Vision/Veo)', icon: 'fa-robot', color: 'text-blue-400' },
                                { id: 'claudeKey', name: 'Anthropic Claude', icon: 'fa-brain', color: 'text-orange-400' },
                                { id: 'openAIKey', name: 'OpenAI (ChatGPT/DALL-E)', icon: 'fa-brain', color: 'text-green-400' },
                                { id: 'elevenLabsKey', name: 'ElevenLabs (Voz)', icon: 'fa-microphone-lines', color: 'text-white' },
                                { id: 'fishAudioKey', name: 'Fish Audio (Clone)', icon: 'fa-fish', color: 'text-cyan-400' },
                                { id: 'huggingFaceToken', name: 'Hugging Face (MusicGen)', icon: 'fa-laugh-wink', color: 'text-yellow-400' },
                                { id: 'freesoundKey', name: 'Freesound (SFX)', icon: 'fa-volume-up', color: 'text-red-400' },
                                { id: 'epidemicApiKey', name: 'Epidemic Sound (Music)', icon: 'fa-music', color: 'text-pink-400' },
                                { id: 'unsplashKey', name: 'Unsplash (Images)', icon: 'fa-camera', color: 'text-white' },
                                { id: 'pexelsKey', name: 'Pexels (Videos)', icon: 'fa-video', color: 'text-emerald-400' },
                                { id: 'pixabayKey', name: 'Pixabay (Media)', icon: 'fa-photo-video', color: 'text-blue-300' },
                            ].map(api => (
                                <div key={api.id} className="group">
                                    <label className="text-[10px] font-bold text-gray-400 mb-1 block ml-1 flex items-center gap-2"><i className={`fas ${api.icon} ${api.color}`}></i>{api.name}</label>
                                    <input type="password" value={(apiKeys as any)[api.id]} onChange={e => setApiKeys({...apiKeys, [api.id]: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-xs text-white placeholder-zinc-700 focus:border-blue-600 outline-none transition-all font-mono" placeholder={`Chave ${api.name}...`} />
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};
