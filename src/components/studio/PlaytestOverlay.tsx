import React from 'react';
import { Camera, Square } from 'lucide-react';
import { PlaytestHudState } from '../../studio/types';

interface PlaytestOverlayProps {
  hud: PlaytestHudState;
  onToggleCamera: () => void;
  onExitPlaytest: () => void;
}

const STANCE_LABEL: Record<PlaytestHudState['stance'], string> = {
  stand: 'Em pé',
  crouch: 'Agachado',
  prone: 'Deitado',
};

export const PlaytestOverlay: React.FC<PlaytestOverlayProps> = ({
  hud,
  onToggleCamera,
  onExitPlaytest,
}) => {
  if (!hud.active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-between p-4">
      {/* Crosshair */}
      <div className="pointer-events-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-5 w-5">
          <span className="absolute top-0 left-1/2 h-1.5 w-0.5 -translate-x-1/2 bg-white/90 shadow" />
          <span className="absolute bottom-0 left-1/2 h-1.5 w-0.5 -translate-x-1/2 bg-white/90 shadow" />
          <span className="absolute top-1/2 left-0 h-0.5 w-1.5 -translate-y-1/2 bg-white/90 shadow" />
          <span className="absolute top-1/2 right-0 h-0.5 w-1.5 -translate-y-1/2 bg-white/90 shadow" />
          <span className="absolute top-1/2 left-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400" />
        </div>
      </div>

      {/* Top Row */}
      <div className="flex items-start justify-between gap-4">
        <div className="pointer-events-auto rounded-lg border border-[#2a3140] bg-[#101319]/92 px-3.5 py-2.5 text-xs text-slate-200 shadow-lg">
          <div className="mb-1 flex items-center gap-3 font-mono text-[11px]">
            <span className="font-semibold text-amber-400">PLAYTEST</span>
            <span aria-hidden="true">·</span>
            <span>{hud.fps} FPS</span>
            <span aria-hidden="true">·</span>
            <span>{STANCE_LABEL[hud.stance]}</span>
            <span aria-hidden="true">·</span>
            <span>{hud.speed.toFixed(1)} m/s</span>
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            Posição: {hud.playerPos[0].toFixed(1)}, {hud.playerPos[1].toFixed(1)},{' '}
            {hud.playerPos[2].toFixed(1)}
            {hud.lastHitDistance !== null && (
              <>
                {' · '}Alvo: {hud.lastHitDistance.toFixed(1)}m ({hud.lastHitMeshName})
              </>
            )}
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleCamera}
            className="flex items-center gap-1.5 rounded-lg border border-[#2a3140] bg-[#101319]/92 px-3 py-2 text-xs font-medium text-slate-100 hover:border-amber-500/60 whitespace-nowrap"
          >
            <Camera className="h-3.5 w-3.5 text-amber-400" />
            {hud.cameraMode === 'third' ? '3ª Pessoa (V)' : '1ª Pessoa (V)'}
          </button>
          <button
            type="button"
            onClick={onExitPlaytest}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 whitespace-nowrap"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Voltar ao Editor
          </button>
        </div>
      </div>

      {/* Bottom Controls Hint */}
      <div className="flex justify-center">
        <div className="rounded-lg border border-[#2a3140] bg-[#101319]/90 px-4 py-2 text-[11px] text-slate-300">
          {!hud.pointerLocked && (
            <span className="mr-2 font-semibold text-amber-400">
              Clique no cenário para travar a mira ·
            </span>
          )}
          <span className="font-mono">
            WASD Mover · Shift Correr · Espaço Pular · C Agachar · Z Deitar · Clique/F Atirar · V Câmera
          </span>
        </div>
      </div>
    </div>
  );
};
