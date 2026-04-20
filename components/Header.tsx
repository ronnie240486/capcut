
import React, { useState, useEffect, useRef } from 'react';
import { BACKEND_URL } from '../constants';
import { ApiSettings } from '../types';
import { SettingsModal } from './SettingsModal';

interface ExportConfig {
    filename: string;
    format: string;
    type: 'video' | 'audio' | 'image';
    resolution?: '720p' | '1080p' | '4k';
    fps?: number;
}

interface HeaderProps {
    onNewProject: () => void;
    onExport: (config: ExportConfig) => void;
    onSave: (projectName: string) => void;
    onLoad: (projectData: any) => void;
    onModalChange?: (isOpen: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({ onNewProject, onExport, onSave, onLoad, onModalChange }) => {
    const [serverStatus, setServerStatus] = useState<'online' | 'offline' | 'checking'>('checking');
    
    // Modal States
    const [showSettings, setShowSettings] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showNewProjectModal, setShowNewProjectModal] = useState(false);
    const [showLoadModal, setShowLoadModal] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    
    // File Input Ref
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Data States
    const [projectName, setProjectName] = useState('Meu Projeto Incrível');
    const [savedProjects, setSavedProjects] = useState<any[]>([]);

    // Export State
    const [exportTab, setExportTab] = useState<'video' | 'audio' | 'image'>('video');
    const [exportFormat, setExportFormat] = useState('mp4');
    const [exportResolution, setExportResolution] = useState<'720p' | '1080p' | '4k'>('1080p');
    const [exportFps, setExportFps] = useState(30);
    const [exportFilename, setExportFilename] = useState('meu_video');

    useEffect(() => {
        const isAnyOpen = showSettings || showExportModal || showShareModal || showSaveModal || showNewProjectModal || showLoadModal || showMobileMenu;
        onModalChange?.(isAnyOpen);
    }, [showSettings, showExportModal, showShareModal, showSaveModal, showNewProjectModal, showLoadModal, showMobileMenu, onModalChange]);

    useEffect(() => {
        if (!showExportModal) setIsExporting(false);
    }, [showExportModal]);

    const checkServer = async () => {
        setServerStatus('checking');
        try {
            const res = await fetch(`${BACKEND_URL}/api/check-ffmpeg`);
            if (res.ok) setServerStatus('online');
            else setServerStatus('offline');
        } catch (e) {
            setServerStatus('offline');
        }
    };

    useEffect(() => {
        checkServer();
        const interval = setInterval(checkServer, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (showLoadModal) {
            try {
                const projects = JSON.parse(localStorage.getItem('saved_projects') || '[]');
                setSavedProjects(projects.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
            } catch (e) { setSavedProjects([]); }
        }
    }, [showLoadModal]);

    const handleExportConfirm = () => {
        if (isExporting) return;
        setIsExporting(true);
        const config: ExportConfig = {
            filename: exportFilename,
            format: exportFormat,
            type: exportTab,
            resolution: exportResolution,
            fps: exportFps
        };
        onExport(config);
        setShowExportModal(false);
    };

    const handleSaveConfirm = () => {
        onSave(projectName);
        setShowSaveModal(false);
    };

    const handleNewProjectConfirm = () => {
        onNewProject();
        setShowNewProjectModal(false);
    };

    const handleFileLoad = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                onLoad(JSON.parse(e.target?.result as string));
                setShowLoadModal(false);
            } catch (err) { alert("Erro ao ler arquivo de projeto."); }
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    const handleLoadSavedProject = (project: any) => {
        if (project.data) {
            onLoad(project.data);
            setShowLoadModal(false);
        }
    };

    const handleDeleteSavedProject = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if(confirm("Deseja apagar este projeto?")) {
            const updated = savedProjects.filter(p => p.id !== id);
            setSavedProjects(updated);
            localStorage.setItem('saved_projects', JSON.stringify(updated));
        }
    };

    const renderExportOptions = () => {
        switch(exportTab) {
            case 'video':
                return (
                    <>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Formato</label>
                            <div className="grid grid-cols-3 gap-2">
                                {['mp4', 'mov', 'webm'].map(fmt => (
                                    <button key={fmt} onClick={() => setExportFormat(fmt)} className={`py-2 rounded text-xs font-bold uppercase border ${exportFormat === fmt ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-700 border-zinc-600 text-gray-400 hover:text-white'}`}>{fmt}</button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Resolução</label>
                            <div className="grid grid-cols-3 gap-2">
                                {['720p', '1080p', '4k'].map((res: any) => (
                                    <button key={res} onClick={() => setExportResolution(res)} className={`py-2 rounded text-xs font-bold uppercase border ${exportResolution === res ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-700 border-zinc-600 text-gray-400 hover:text-white'}`}>{res}</button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">FPS</label>
                            <div className="grid grid-cols-3 gap-2">
                                {[24, 30, 60].map(fps => (
                                    <button key={fps} onClick={() => setExportFps(fps)} className={`py-2 rounded text-xs font-bold uppercase border ${exportFps === fps ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-700 border-zinc-600 text-gray-400 hover:text-white'}`}>{fps}</button>
                                ))}
                            </div>
                        </div>
                    </>
                );
            case 'audio':
                return (
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase">Formato</label>
                        <div className="grid grid-cols-3 gap-2">
                            {['mp3', 'wav', 'mp4'].map(fmt => (
                                <button key={fmt} onClick={() => setExportFormat(fmt)} className={`py-2 rounded text-xs font-bold uppercase border ${exportFormat === fmt ? 'bg-purple-600 border-purple-500 text-white' : 'bg-zinc-700 border-zinc-600 text-gray-400 hover:text-white'}`}>{fmt === 'mp4' ? 'MP4' : fmt}</button>
                            ))}
                        </div>
                    </div>
                );
            case 'image':
                return (
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase">Formato</label>
                        <div className="grid grid-cols-2 gap-2">
                            {['png', 'jpg'].map(fmt => (
                                <button key={fmt} onClick={() => setExportFormat(fmt)} className={`py-2 rounded text-xs font-bold uppercase border ${exportFormat === fmt ? 'bg-green-600 border-green-500 text-white' : 'bg-zinc-700 border-zinc-600 text-gray-400 hover:text-white'}`}>{fmt}</button>
                            ))}
                        </div>
                    </div>
                );
        }
    };

    return (
        <header className="flex items-center justify-between px-4 py-2 bg-zinc-800 border-b border-zinc-700 h-[50px] shrink-0 relative z-[110]">
            <h1 className="text-xl font-bold flex items-center text-white shrink-0 mr-4">
                <i className="fas fa-cut mr-2 text-blue-500"></i><span className="hidden md:inline">ProEdit</span>
            </h1>
            
            <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileLoad} />

            {/* Desktop Toolbar */}
            <div className="hidden md:flex flex-1 items-center justify-end gap-2">
                 <button onClick={checkServer} className={`flex items-center px-3 py-1.5 rounded-md transition-colors text-xs font-bold border whitespace-nowrap ${serverStatus === 'online' ? 'bg-green-900/30 border-green-600 text-green-400' : serverStatus === 'offline' ? 'bg-red-900/30 border-red-600 text-red-400' : 'bg-zinc-700 border-zinc-600 text-gray-400'}`}>
                    <i className={`fas fa-server mr-2 ${serverStatus === 'checking' ? 'fa-spin' : ''}`}></i>
                    {serverStatus === 'online' ? 'ONLINE' : serverStatus === 'offline' ? 'OFFLINE' : '...'}
                </button>
                <div className="h-4 w-px bg-zinc-700 mx-1 shrink-0"></div>
                <button onClick={() => setShowNewProjectModal(true)} className="flex items-center px-3 py-1.5 rounded-md bg-zinc-700 text-gray-200 hover:bg-zinc-600 transition-colors text-xs font-bold"><i className="fas fa-plus mr-2"></i> Novo</button>
                <button onClick={() => setShowLoadModal(true)} className="flex items-center px-3 py-1.5 rounded-md bg-zinc-700 text-gray-200 hover:bg-zinc-600 transition-colors text-xs font-bold"><i className="fas fa-folder-open mr-2"></i> Carregar</button>
                <button onClick={() => setShowSaveModal(true)} className="flex items-center px-3 py-1.5 rounded-md bg-zinc-700 text-gray-200 hover:bg-zinc-600 transition-colors text-xs font-bold"><i className="fas fa-save mr-2"></i> Salvar</button>
                <button onClick={() => setShowSettings(true)} className="flex items-center px-3 py-1.5 rounded-md bg-zinc-700 text-gray-200 hover:bg-zinc-600 transition-colors text-xs font-bold"><i className="fas fa-cog mr-2"></i> Config. API</button>
                <button onClick={() => setShowShareModal(true)} className="flex items-center px-3 py-1.5 rounded-md bg-zinc-700 text-gray-200 hover:bg-zinc-600 transition-colors text-xs font-bold"><i className="fas fa-share-alt mr-2"></i> Share</button>
                <button onClick={() => { setExportTab('video'); setExportFormat('mp4'); setShowExportModal(true); }} className="flex items-center px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors text-xs font-bold shadow-lg"><i className="fas fa-file-export mr-2"></i> Exportar</button>
            </div>

            {/* Mobile Toolbar */}
            <div className="flex md:hidden items-center gap-2">
                <button onClick={() => { setExportTab('video'); setExportFormat('mp4'); setShowExportModal(true); }} className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"><i className="fas fa-file-export text-xs"></i></button>
                <button onClick={() => setShowMobileMenu(!showMobileMenu)} className={`w-9 h-9 rounded-full bg-zinc-700 border border-zinc-600 text-gray-200 flex items-center justify-center active:scale-95 transition-all ${showMobileMenu ? 'bg-zinc-600 border-zinc-500' : ''}`}><i className={`fas ${showMobileMenu ? 'fa-times' : 'fa-bars'} text-sm`}></i></button>
            </div>

            {/* Mobile Dropdown */}
            {showMobileMenu && (
                <div className="absolute top-[50px] left-0 right-0 bg-zinc-900 border-b border-zinc-800 p-4 shadow-2xl z-50 md:hidden flex flex-col gap-3 animate-in slide-in-from-top-2 origin-top">
                    <div className="grid grid-cols-2 gap-3">
                         <button onClick={() => { setShowNewProjectModal(true); setShowMobileMenu(false); }} className="bg-zinc-800 p-3 rounded-xl flex flex-col items-center gap-2 border border-zinc-700 hover:bg-zinc-700 active:scale-95"><i className="fas fa-plus text-blue-500 text-xl"></i><span className="text-xs font-bold text-white">Novo</span></button>
                         <button onClick={() => { setShowLoadModal(true); setShowMobileMenu(false); }} className="bg-zinc-800 p-3 rounded-xl flex flex-col items-center gap-2 border border-zinc-700 hover:bg-zinc-700 active:scale-95"><i className="fas fa-folder-open text-yellow-500 text-xl"></i><span className="text-xs font-bold text-white">Carregar</span></button>
                         <button onClick={() => { setShowSaveModal(true); setShowMobileMenu(false); }} className="bg-zinc-800 p-3 rounded-xl flex flex-col items-center gap-2 border border-zinc-700 hover:bg-zinc-700 active:scale-95"><i className="fas fa-save text-green-500 text-xl"></i><span className="text-xs font-bold text-white">Salvar</span></button>
                         <button onClick={() => { setShowSettings(true); setShowMobileMenu(false); }} className="bg-zinc-800 p-3 rounded-xl flex flex-col items-center gap-2 border border-zinc-700 hover:bg-zinc-700 active:scale-95"><i className="fas fa-cog text-gray-400 text-xl"></i><span className="text-xs font-bold text-white">Config API</span></button>
                         <button onClick={() => { setShowShareModal(true); setShowMobileMenu(false); }} className="bg-zinc-800 p-3 rounded-xl flex flex-col items-center gap-2 border border-zinc-700 hover:bg-zinc-700 active:scale-95 col-span-2"><i className="fas fa-share-alt text-purple-500 text-xl"></i><span className="text-xs font-bold text-white">Compartilhar</span></button>
                    </div>
                </div>
            )}

            {/* Modals */}
            {showNewProjectModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowNewProjectModal(false)}>
                    <div className="bg-zinc-800 p-6 rounded-xl w-[400px] shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <h3 className="text-xl font-bold text-white mb-2">Novo Projeto?</h3>
                            <p className="text-sm text-gray-400 mb-6">Alterações não salvas serão perdidas.</p>
                            <div className="flex gap-3">
                                <button onClick={() => setShowNewProjectModal(false)} className="flex-1 py-3 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-bold">Cancelar</button>
                                <button onClick={handleNewProjectConfirm} className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold">Sim, Criar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showSaveModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowSaveModal(false)}>
                    <div className="bg-zinc-800 p-6 rounded-xl w-[400px] shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-white mb-6 flex gap-2"><i className="fas fa-save"></i> Salvar Projeto</h3>
                        <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Nome do projeto..." className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-white mb-4" />
                        <button onClick={handleSaveConfirm} className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold">Salvar Agora</button>
                    </div>
                </div>
            )}

            {showLoadModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowLoadModal(false)}>
                    <div className="bg-zinc-800 p-8 rounded-2xl w-[600px] shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-2xl font-bold text-white flex gap-2"><i className="fas fa-folder-open"></i> Projetos Salvos</h3>
                            <button onClick={() => setShowLoadModal(false)}><i className="fas fa-times text-gray-400"></i></button>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mb-8 max-h-[300px] overflow-y-auto scrollbar-thin">
                            {savedProjects.length === 0 ? <div className="col-span-2 text-center text-gray-500">Vazio.</div> : savedProjects.map((proj: any) => (
                                <div key={proj.id} onClick={() => handleLoadSavedProject(proj)} className="group relative aspect-video bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden cursor-pointer hover:border-blue-500">
                                    <div className="absolute inset-0 bg-cover bg-center opacity-50 group-hover:opacity-100" style={{backgroundImage: `url(${proj.thumbnail || 'https://via.placeholder.com/400x225/333/888?text=Sem+Preview'})`}}></div>
                                    <div className="absolute bottom-0 left-0 right-0 p-3 bg-black/60"><h4 className="font-bold text-white text-sm truncate">{proj.name}</h4></div>
                                    <button onClick={(e) => handleDeleteSavedProject(e, proj.id)} className="absolute top-2 right-2 w-6 h-6 bg-black/50 hover:bg-red-600 rounded-full text-white flex items-center justify-center"><i className="fas fa-trash text-[10px]"></i></button>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => fileInputRef.current?.click()} className="w-full py-4 border-2 border-dashed border-zinc-600 hover:border-blue-500 rounded-xl text-gray-400 hover:text-blue-400 font-bold"><i className="fas fa-file-upload mr-2"></i> Importar .JSON</button>
                    </div>
                </div>
            )}

            {showShareModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowShareModal(false)}>
                    <div className="bg-zinc-800 p-8 rounded-2xl w-[600px] shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <div className="text-center mb-8">
                            <h3 className="text-2xl font-bold text-white mb-1">Compartilhar</h3>
                            <p className="text-gray-400 text-sm">Publique seu vídeo diretamente nas redes</p>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4">
                            {/* YouTube */}
                            <a href="https://www.youtube.com/upload" target="_blank" rel="noopener noreferrer" className="group flex flex-col items-center justify-center bg-zinc-900 hover:bg-red-600 border border-zinc-700 hover:border-red-500 rounded-xl p-4 transition-all duration-300 transform hover:scale-105 shadow-lg">
                                <i className="fab fa-youtube text-3xl text-red-500 group-hover:text-white mb-2 transition-colors"></i>
                                <span className="text-white font-bold text-xs">YouTube</span>
                            </a>

                            {/* TikTok */}
                            <a href="https://www.tiktok.com/upload" target="_blank" rel="noopener noreferrer" className="group flex flex-col items-center justify-center bg-zinc-900 hover:bg-black border border-zinc-700 hover:border-cyan-400 rounded-xl p-4 transition-all duration-300 transform hover:scale-105 shadow-lg relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-pink-500/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <i className="fab fa-tiktok text-3xl text-white mb-2 relative z-10"></i>
                                <span className="text-white font-bold text-xs relative z-10">TikTok</span>
                            </a>

                            {/* Instagram */}
                            <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer" className="group flex flex-col items-center justify-center bg-zinc-900 border border-zinc-700 hover:border-pink-500 rounded-xl p-4 transition-all duration-300 transform hover:scale-105 shadow-lg relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-tr from-yellow-500 via-red-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <i className="fab fa-instagram text-3xl text-pink-500 group-hover:text-white mb-2 relative z-10 transition-colors"></i>
                                <span className="text-white font-bold text-xs relative z-10">Instagram</span>
                            </a>
                            
                            {/* Facebook */}
                            <a href="https://www.facebook.com/" target="_blank" rel="noopener noreferrer" className="group flex flex-col items-center justify-center bg-zinc-900 hover:bg-blue-600 border border-zinc-700 hover:border-blue-500 rounded-xl p-4 transition-all duration-300 transform hover:scale-105 shadow-lg">
                                <i className="fab fa-facebook text-3xl text-blue-600 group-hover:text-white mb-2 transition-colors"></i>
                                <span className="text-white font-bold text-xs">Facebook</span>
                            </a>

                            {/* Twitter / X */}
                            <a href="https://twitter.com/intent/tweet" target="_blank" rel="noopener noreferrer" className="group flex flex-col items-center justify-center bg-zinc-900 hover:bg-black border border-zinc-700 hover:border-gray-500 rounded-xl p-4 transition-all duration-300 transform hover:scale-105 shadow-lg">
                                <i className="fab fa-twitter text-3xl text-sky-500 group-hover:text-white mb-2 transition-colors"></i>
                                <span className="text-white font-bold text-xs">Twitter / X</span>
                            </a>

                             {/* LinkedIn */}
                             <a href="https://www.linkedin.com/sharing/share-offsite/" target="_blank" rel="noopener noreferrer" className="group flex flex-col items-center justify-center bg-zinc-900 hover:bg-blue-700 border border-zinc-700 hover:border-blue-600 rounded-xl p-4 transition-all duration-300 transform hover:scale-105 shadow-lg">
                                <i className="fab fa-linkedin text-3xl text-blue-500 group-hover:text-white mb-2 transition-colors"></i>
                                <span className="text-white font-bold text-xs">LinkedIn</span>
                            </a>
                        </div>

                        <button onClick={() => setShowShareModal(false)} className="w-full mt-8 py-3 bg-zinc-700 hover:bg-zinc-600 text-gray-300 hover:text-white rounded-lg font-bold transition-colors">
                            Fechar
                        </button>
                    </div>
                </div>
            )}

            {showExportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowExportModal(false)}>
                    <div className="bg-zinc-800 p-6 rounded-xl w-[400px] shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-white mb-6"><i className="fas fa-file-export"></i> Exportar</h3>
                        <div className="flex bg-zinc-900 p-1 rounded-lg mb-6">
                            {['video', 'audio', 'image'].map((t: any) => (
                                <button key={t} onClick={() => { setExportTab(t); setExportFormat(t==='image'?'png':t==='audio'?'mp3':'mp4'); }} className={`flex-1 py-2 text-xs font-bold rounded capitalize ${exportTab === t ? 'bg-zinc-700 text-white' : 'text-gray-500'}`}>{t}</button>
                            ))}
                        </div>
                        <div className="space-y-6">
                            <div><label className="text-xs font-bold text-gray-400 block mb-1">Nome</label><input type="text" value={exportFilename} onChange={(e) => setExportFilename(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white" /></div>
                            {renderExportOptions()}
                            <div className="flex gap-3"><button onClick={() => setShowExportModal(false)} className="flex-1 py-3 bg-zinc-700 rounded text-white font-bold">Cancelar</button><button onClick={handleExportConfirm} disabled={isExporting} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded text-white font-bold">{isExporting ? <i className="fas fa-spinner fa-spin"></i> : 'Exportar'}</button></div>
                        </div>
                    </div>
                </div>
            )}

            {/* Using the External SettingsModal Component */}
            <SettingsModal 
                isOpen={showSettings} 
                onClose={() => setShowSettings(false)}
                onSaveProject={onSave}
                onNewProject={onNewProject}
                onImportProject={() => fileInputRef.current?.click()}
                onExport={onExport}
                onChangeAspectRatio={() => {}}
            />
        </header>
    );
};
