import React from 'react';
import { Sliders, Zap, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MixerControlsProps {
  crossfade: number; // -1 (Deck A) to 1 (Deck B)
  onCrossfadeChange: (value: number) => void;
  masterVolume: number;
  onMasterVolumeChange: (value: number) => void;
  isMixing: boolean;
  onToggleMix: () => void;
}

export const MixerControls: React.FC<MixerControlsProps> = ({
  crossfade,
  onCrossfadeChange,
  masterVolume,
  onMasterVolumeChange,
  isMixing,
  onToggleMix,
}) => {
  return (
    <div className="hardware-card p-6 flex flex-col gap-8">
      <div className="flex justify-between items-center">
        <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-hardware-secondary flex items-center gap-2">
          <Sliders size={12} />
          Master Control
        </h3>
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-2 h-2 rounded-full",
            isMixing ? "bg-hardware-accent neon-glow animate-pulse" : "bg-hardware-secondary/20"
          )} />
          <span className="text-[10px] font-mono text-hardware-secondary uppercase">
            {isMixing ? "Live Output" : "Standby"}
          </span>
        </div>
      </div>

      <div className="space-y-6">
        {/* Crossfader */}
        <div className="space-y-3">
          <div className="flex justify-between text-[10px] font-mono text-hardware-secondary uppercase tracking-widest">
            <span>Deck A</span>
            <span>Crossfader</span>
            <span>Deck B</span>
          </div>
          <div className="relative h-12 bg-black/40 rounded-lg border border-hardware-secondary/10 flex items-center px-2">
            <input
              type="range"
              min="-1"
              max="1"
              step="0.01"
              value={crossfade}
              onChange={(e) => onCrossfadeChange(parseFloat(e.target.value))}
              className="w-full h-1 bg-hardware-secondary/20 rounded-full appearance-none cursor-pointer accent-hardware-accent"
            />
            {/* Visual indicators */}
            <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-hardware-secondary/20 -translate-x-1/2" />
          </div>
        </div>

        {/* Master Volume */}
        <div className="space-y-3">
          <div className="flex justify-between text-[10px] font-mono text-hardware-secondary uppercase tracking-widest">
            <span>Master Volume</span>
            <span>{Math.round(masterVolume * 100)}%</span>
          </div>
          <div className="h-2 bg-black/40 rounded-full border border-hardware-secondary/10 overflow-hidden">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={masterVolume}
              onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
              className="w-full h-full bg-transparent appearance-none cursor-pointer accent-hardware-accent"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={onToggleMix}
          className={cn(
            "hardware-button flex items-center justify-center gap-2 py-4 font-mono text-xs uppercase tracking-widest",
            isMixing && "border-hardware-accent text-hardware-accent neon-glow"
          )}
        >
          <Zap size={16} />
          {isMixing ? "Stop Mix" : "Start Mix"}
        </button>
        
        <button 
          onClick={() => {
            // New interaction for Deep-Sync
            alert("Deep-Sync Sensorial Ativado: Sincronizando movimentos de vídeo com as batidas de áudio...");
            if (onToggleMix) onToggleMix(); 
          }}
          className={cn(
            "hardware-button flex items-center justify-center gap-2 py-4 font-mono text-xs uppercase tracking-widest bg-indigo-900/40 border-indigo-500/50 text-indigo-400 hover:bg-indigo-900/60 shadow-[0_0_15px_rgba(99,102,241,0.2)]",
            isMixing && "border-hardware-accent text-hardware-accent neon-glow"
          )}
        >
          <Activity size={16} />
          Deep-Sync Sensorial
        </button>
      </div>
    </div>
  );
};
