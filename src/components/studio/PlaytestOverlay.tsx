import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Crosshair,
  Flame,
  RotateCw,
  Settings,
  SlidersHorizontal,
  Square,
  X,
} from 'lucide-react';
import {
  ControlMode,
  GraphicsQuality,
  WEAPONS,
  WeaponId,
  WeaponSlotId,
} from '../../game/types';
import {
  PlaytestHudState,
  PlaytestSettings,
  QUALITY_LABELS,
} from '../../studio/types';

interface PlaytestOverlayProps {
  hud: PlaytestHudState;
  settings: PlaytestSettings;
  onToggleCamera: () => void;
  onExitPlaytest: () => void;
  onUpdateSettings: (patch: Partial<PlaytestSettings>) => void;
  onMobileMove: (x: number, y: number) => void;
  onLookDelta: (dx: number, dy: number) => void;
  onFireChange: (firing: boolean) => void;
  onToggleAim: () => void;
  onJump: () => void;
  onToggleCrouch: () => void;
  onToggleProne: () => void;
  onToggleSprint: () => void;
  onReload: () => void;
  onSelectWeaponSlot: (slot: WeaponSlotId) => void;
}

const STANCE_LABEL: Record<PlaytestHudState['stance'], string> = {
  stand: 'Em pé',
  crouch: 'Agachado',
  prone: 'Deitado',
};

const SLOT1_WEAPONS: WeaponId[] = ['m4a1', 'ak47', 'scar', 'xm8', 'awm', 'm1014'];
const SLOT2_WEAPONS: WeaponId[] = ['ump45', 'm1014', 'm4a1', 'ak47', 'awm', 'scar'];
const SLOT3_WEAPONS: WeaponId[] = ['deagle', 'g18'];

export const PlaytestOverlay: React.FC<PlaytestOverlayProps> = ({
  hud,
  settings,
  onToggleCamera,
  onExitPlaytest,
  onUpdateSettings,
  onMobileMove,
  onLookDelta,
  onFireChange,
  onToggleAim,
  onJump,
  onToggleCrouch,
  onToggleProne,
  onToggleSprint,
  onReload,
  onSelectWeaponSlot,
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isTouchViewport, setIsTouchViewport] = useState(false);

  // Virtual Joystick state
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const joystickPointerId = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Touch-look pointer state
  const lookPointerId = useRef<number | null>(null);
  const lastLookPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const checkViewport = () => {
      const hasTouch =
        typeof window !== 'undefined' &&
        ('ontouchstart' in window || navigator.maxTouchPoints > 0);
      const narrow = typeof window !== 'undefined' && window.innerWidth < 960;
      setIsTouchViewport(hasTouch || narrow);
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  useEffect(() => {
    if (!hud.active) {
      setSettingsOpen(false);
      setKnobOffset({ x: 0, y: 0 });
      joystickPointerId.current = null;
      lookPointerId.current = null;
    }
  }, [hud.active]);

  if (!hud.active) return null;

  const showMobileHud =
    settings.controlMode === 'mobile' ||
    (settings.controlMode === 'auto' && isTouchViewport);

  const isSniperScoped = hud.isAiming && settings.weaponId === 'awm';

  const handleJoystickStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    joystickPointerId.current = e.pointerId;
    updateJoystickFromClient(e.clientX, e.clientY);
  };

  const handleJoystickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joystickPointerId.current !== e.pointerId) return;
    e.stopPropagation();
    updateJoystickFromClient(e.clientX, e.clientY);
  };

  const handleJoystickEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joystickPointerId.current !== e.pointerId) return;
    e.stopPropagation();
    joystickPointerId.current = null;
    setKnobOffset({ x: 0, y: 0 });
    onMobileMove(0, 0);
  };

  const updateJoystickFromClient = (clientX: number, clientY: number) => {
    const el = joystickRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxRadius = rect.width * 0.36;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius && dist > 0) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    setKnobOffset({ x: dx, y: dy });
    // Screen Y up is negative dy, which maps to forward (+1)
    onMobileMove(dx / maxRadius, -dy / maxRadius);
  };

  const handleLookDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (settingsOpen) return;
    if (lookPointerId.current !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    lookPointerId.current = e.pointerId;
    lastLookPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleLookMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerId.current !== e.pointerId) return;
    const dx = e.clientX - lastLookPos.current.x;
    const dy = e.clientY - lastLookPos.current.y;
    lastLookPos.current = { x: e.clientX, y: e.clientY };
    onLookDelta(dx, dy);
  };

  const handleLookUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerId.current !== e.pointerId) return;
    lookPointerId.current = null;
  };

  const activeSlotLabel =
    hud.activeSlot === 4
      ? 'PUNHO'
      : WEAPONS[hud.slots[hud.activeSlot].weaponId].shortName;

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-between p-3 select-none sm:p-4">
      {/* Mobile Touch-Look Background Layer */}
      {showMobileHud && !settingsOpen && (
        <div
          onPointerDown={handleLookDown}
          onPointerMove={handleLookMove}
          onPointerUp={handleLookUp}
          onPointerCancel={handleLookUp}
          className="pointer-events-auto fixed inset-0 z-0 touch-none"
          aria-label="Área de câmera por toque"
        />
      )}

      {/* Sniper Scope Overlay (AWM Zoom) */}
      {isSniperScoped ? (
        <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center">
          <div
            className="h-full w-full"
            style={{
              background:
                'radial-gradient(circle at center, transparent 26%, rgba(6, 8, 12, 0.94) 30%)',
            }}
          />
          <div className="absolute top-1/2 left-0 right-0 h-px bg-black/80" />
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-black/80" />
          <div className="absolute h-3 w-3 rounded-full border border-rose-500/90 bg-rose-500/30" />
          {hud.lastHitDistance !== null && (
            <div className="absolute top-[58%] left-1/2 -translate-x-1/2 rounded bg-black/75 px-2 py-0.5 font-mono text-[11px] tabular-nums text-amber-300">
              {hud.lastHitDistance.toFixed(1)}m
            </div>
          )}
        </div>
      ) : (
        /* Tactical Crosshair */
        <div className="pointer-events-none fixed top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <div className={`relative transition-transform ${hud.isAiming ? 'scale-75' : 'scale-100'} h-6 w-6`}>
            <span className="absolute top-0 left-1/2 h-1.5 w-0.5 -translate-x-1/2 bg-white/90 shadow" />
            <span className="absolute bottom-0 left-1/2 h-1.5 w-0.5 -translate-x-1/2 bg-white/90 shadow" />
            <span className="absolute top-1/2 left-0 h-0.5 w-1.5 -translate-y-1/2 bg-white/90 shadow" />
            <span className="absolute top-1/2 right-0 h-0.5 w-1.5 -translate-y-1/2 bg-white/90 shadow" />
            <span
              className={`absolute top-1/2 left-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                hud.isAiming ? 'bg-rose-400' : 'bg-amber-400'
              }`}
            />
          </div>
        </div>
      )}

      {/* Top Row: Status + Actions + Weapon Switcher */}
      <div className="relative z-20 flex flex-wrap items-start justify-between gap-2 sm:gap-4">
        {/* Top-Left Telemetry */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="pointer-events-auto rounded-lg border border-[#2a3140] bg-[#101319]/92 px-3 py-2 text-xs text-slate-200 shadow-lg"
        >
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums">
            <span className="font-semibold text-amber-400">PLAYTEST</span>
            <span aria-hidden="true">·</span>
            <span>{hud.fps} FPS</span>
            <span aria-hidden="true">·</span>
            <span>{QUALITY_LABELS[settings.quality]}</span>
            <span aria-hidden="true">·</span>
            <span>{STANCE_LABEL[hud.stance]}</span>
            <span aria-hidden="true">·</span>
            <span>{hud.speed.toFixed(1)} m/s</span>
          </div>
          <div className="mt-0.5 font-mono text-[10px] tabular-nums text-slate-400">
            Pos: {hud.playerPos[0].toFixed(1)}, {hud.playerPos[1].toFixed(1)},{' '}
            {hud.playerPos[2].toFixed(1)} · Arma: {activeSlotLabel}
            {hud.lastHitDistance !== null && (
              <>
                {' · '}Alvo: {hud.lastHitDistance.toFixed(1)}m ({hud.lastHitMeshName})
              </>
            )}
          </div>
        </div>

        {/* Top-Right Controls & Weapon Switcher */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="pointer-events-auto flex flex-col items-end gap-2"
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={onToggleCamera}
              className="flex h-10 items-center gap-1.5 rounded-lg border border-[#2a3140] bg-[#101319]/92 px-3 text-xs font-medium text-slate-100 hover:border-amber-500/60 whitespace-nowrap"
              title="Alternar câmera 3ª / 1ª pessoa (V)"
            >
              <Camera className="h-3.5 w-3.5 text-amber-400" />
              <span className="hidden sm:inline">
                {hud.cameraMode === 'third' ? '3ª Pessoa (V)' : '1ª Pessoa (V)'}
              </span>
              <span className="sm:hidden">{hud.cameraMode === 'third' ? '3ª' : '1ª'}</span>
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex h-10 items-center gap-1.5 rounded-lg border border-[#2a3140] bg-[#101319]/92 px-3 text-xs font-medium text-slate-100 hover:border-amber-500/60 whitespace-nowrap"
              title="Configurações de Qualidade, Sensibilidade e HUD"
            >
              <Settings className="h-3.5 w-3.5 text-sky-400" />
              <span className="hidden sm:inline">Configurações</span>
            </button>

            <button
              type="button"
              onClick={onExitPlaytest}
              className="flex h-10 items-center gap-1.5 rounded-lg bg-amber-500 px-3 text-xs font-semibold text-slate-950 hover:bg-amber-400 whitespace-nowrap"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span className="hidden sm:inline">Voltar ao Editor</span>
              <span className="sm:hidden">Sair</span>
            </button>
          </div>

          {/* Classic Weapon Switcher Slots (1, 2, 3, 4/Punho) */}
          <div className="flex flex-col gap-1.5">
            {([1, 2, 3] as const).map((slotId) => {
              const slotState = hud.slots[slotId];
              const def = WEAPONS[slotState.weaponId];
              const isActive = hud.activeSlot === slotId;
              return (
                <button
                  key={slotId}
                  type="button"
                  onClick={() => onSelectWeaponSlot(slotId)}
                  className={`relative flex min-h-[44px] w-44 items-center justify-between overflow-hidden rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                    isActive
                      ? 'border-amber-400 bg-[#1a1f2b]/95 text-white shadow-md'
                      : 'border-[#283040] bg-[#101319]/88 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {isActive && hud.isReloading && (
                    <div
                      className="pointer-events-none absolute inset-y-0 left-0 bg-amber-500/20"
                      style={{ width: `${Math.round(hud.reloadProgress * 100)}%` }}
                    />
                  )}
                  <div className="relative flex items-center gap-2">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded font-mono text-[11px] font-bold ${
                        isActive ? 'bg-amber-500 text-slate-950' : 'bg-[#1d222e] text-slate-400'
                      }`}
                    >
                      {slotId}
                    </span>
                    <div>
                      <div className="text-[11px] font-bold leading-tight">{def.shortName}</div>
                      <div className="text-[9px] text-slate-400">{def.category}</div>
                    </div>
                  </div>
                  <div className="relative font-mono text-xs font-semibold tabular-nums">
                    <span className={slotState.ammoInMag <= 3 ? 'text-rose-400' : 'text-amber-300'}>
                      {slotState.ammoInMag}
                    </span>
                    <span className="text-slate-500">/{slotState.magSize}</span>
                  </div>
                </button>
              );
            })}

            {/* Slot 4: Punho (Soco) */}
            <button
              type="button"
              onClick={() => onSelectWeaponSlot(4)}
              className={`flex min-h-[40px] w-44 items-center justify-between rounded-lg border px-2.5 py-1 text-left transition-colors ${
                hud.activeSlot === 4
                  ? 'border-amber-400 bg-[#1a1f2b]/95 text-white'
                  : 'border-[#283040] bg-[#101319]/88 text-slate-300 hover:border-slate-500'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded font-mono text-[11px] font-bold ${
                    hud.activeSlot === 4
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-[#1d222e] text-slate-400'
                  }`}
                >
                  4
                </span>
                <span className="text-[11px] font-bold">PUNHO</span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">CORPO</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Area: Mobile HUD OR Desktop Controls Hint */}
      {showMobileHud ? (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="relative z-20 flex items-end justify-between pb-1"
        >
          {/* Left Cluster: Sprint Lock + Left Fire + Virtual Analog Joystick */}
          <div className="pointer-events-auto flex flex-col items-start gap-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleSprint}
                className={`flex h-11 min-w-[44px] items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold touch-none ${
                  hud.isSprinting
                    ? 'border-amber-400 bg-amber-500 text-slate-950'
                    : 'border-[#333c4f] bg-[#101319]/90 text-slate-200'
                }`}
              >
                <Flame className="h-4 w-4" />
                Correr
              </button>

              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onFireChange(true);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  onFireChange(false);
                }}
                onPointerCancel={() => onFireChange(false)}
                className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-amber-400/80 bg-[#181d28]/90 text-[10px] font-bold text-amber-300 active:scale-95 active:bg-amber-500 active:text-slate-950 touch-none"
                title="Atirar (Esquerda)"
              >
                TIRO
              </button>
            </div>

            {/* Virtual Joystick */}
            <div
              ref={joystickRef}
              onPointerDown={handleJoystickStart}
              onPointerMove={handleJoystickMove}
              onPointerUp={handleJoystickEnd}
              onPointerCancel={handleJoystickEnd}
              className="relative flex h-32 w-32 items-center justify-center rounded-full border-2 border-slate-400/35 bg-[#0f131a]/75 touch-none"
            >
              <div className="pointer-events-none h-20 w-20 rounded-full border border-dashed border-slate-500/30" />
              <div
                className="pointer-events-none absolute h-12 w-12 rounded-full border-2 border-amber-400 bg-amber-500/85 shadow-lg"
                style={{
                  transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
                }}
              />
            </div>
          </div>

          {/* Right Cluster: Classic FF Mobile Action Buttons */}
          <div className="pointer-events-auto relative h-48 w-56 sm:w-64">
            {/* Pular (Top Right) */}
            <button
              type="button"
              onClick={onJump}
              className="absolute top-0 right-1 flex h-12 w-12 flex-col items-center justify-center rounded-full border border-[#3a4459] bg-[#101319]/90 text-[10px] font-bold text-slate-100 active:scale-95 active:border-amber-400 touch-none"
            >
              <span>PULAR</span>
            </button>

            {/* Mirar (Middle Right) */}
            <button
              type="button"
              onClick={onToggleAim}
              className={`absolute top-14 right-0 flex h-12 w-12 items-center justify-center rounded-full border text-[10px] font-bold active:scale-95 touch-none ${
                hud.isAiming
                  ? 'border-amber-400 bg-amber-500 text-slate-950'
                  : 'border-[#3a4459] bg-[#101319]/90 text-slate-100'
              }`}
              title="Mirar / Zoom"
            >
              <Crosshair className="h-5 w-5" />
            </button>

            {/* Atirar Principal (Large Center-Right) */}
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                onFireChange(true);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                onFireChange(false);
              }}
              onPointerCancel={() => onFireChange(false)}
              className="absolute top-14 right-16 flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 border-amber-400 bg-amber-500/90 text-[11px] font-extrabold text-slate-950 shadow-xl active:scale-95 touch-none"
            >
              ATIRAR
            </button>

            {/* Recarregar (Left of Fire) */}
            <button
              type="button"
              onClick={onReload}
              className={`absolute top-20 right-36 flex h-11 w-11 flex-col items-center justify-center overflow-hidden rounded-full border text-[9px] font-bold active:scale-95 touch-none ${
                hud.isReloading
                  ? 'border-amber-400 bg-amber-500/25 text-amber-300'
                  : 'border-[#3a4459] bg-[#101319]/90 text-slate-200'
              }`}
              title="Recarregar"
            >
              <RotateCw className={`h-4 w-4 ${hud.isReloading ? 'animate-spin' : ''}`} />
            </button>

            {/* Agachar (Bottom Right) */}
            <button
              type="button"
              onClick={onToggleCrouch}
              className={`absolute bottom-0 right-2 flex h-11 w-14 items-center justify-center rounded-full border text-[10px] font-bold active:scale-95 touch-none ${
                hud.stance === 'crouch'
                  ? 'border-amber-400 bg-amber-500 text-slate-950'
                  : 'border-[#3a4459] bg-[#101319]/90 text-slate-200'
              }`}
            >
              AGACHAR
            </button>

            {/* Deitar (Bottom Center-Right) */}
            <button
              type="button"
              onClick={onToggleProne}
              className={`absolute bottom-0 right-20 flex h-11 w-14 items-center justify-center rounded-full border text-[10px] font-bold active:scale-95 touch-none ${
                hud.stance === 'prone'
                  ? 'border-amber-400 bg-amber-500 text-slate-950'
                  : 'border-[#3a4459] bg-[#101319]/90 text-slate-200'
              }`}
            >
              DEITAR
            </button>
          </div>
        </div>
      ) : (
        <div className="relative z-20 flex justify-center">
          <div className="rounded-lg border border-[#2a3140] bg-[#101319]/90 px-4 py-2 text-[11px] text-slate-300">
            {!hud.pointerLocked && (
              <span className="mr-2 font-semibold text-amber-400">
                Clique no cenário para travar a mira ·
              </span>
            )}
            <span className="font-mono">
              1-4 Arma · R Recarregar · WASD Mover · Shift Correr · Espaço Pular · C Agachar · Z Deitar · V Câmera
            </span>
          </div>
        </div>
      )}

      {/* In-Game Playtest Settings Modal (Qualidade, Sensibilidade, HUD Mobile/PC, Loadout) */}
      {settingsOpen && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4"
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[#2a3140] bg-[#12151c] text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#222630] px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <SlidersHorizontal className="h-4 w-4 text-amber-400" />
                Configurações do Playtest
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-[#1e2430] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-4 text-xs">
              {/* Graphics Quality: Suave / Padrão / Ultra */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold text-slate-200">Qualidade Gráfica</span>
                  <span className="font-mono text-[11px] text-amber-400">
                    {QUALITY_LABELS[settings.quality]}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'low', label: 'Suave', desc: 'Sem sombras · Leve' },
                      { id: 'medium', label: 'Padrão', desc: 'Sombras 1024px' },
                      { id: 'high', label: 'Ultra', desc: 'Sombras 2048px · HD' },
                    ] as Array<{ id: GraphicsQuality; label: string; desc: string }>
                  ).map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => onUpdateSettings({ quality: q.id })}
                      className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${
                        settings.quality === q.id
                          ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                          : 'border-[#252b38] bg-[#161a23] text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      <div className="font-semibold">{q.label}</div>
                      <div className="mt-0.5 text-[10px] text-slate-400">{q.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Control Mode / Mobile HUD Toggle */}
              <div className="border-t border-[#222630] pt-3">
                <span className="mb-2 block font-semibold text-slate-200">
                  Controles & HUD Mobile
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'auto', label: 'Automático' },
                      { id: 'mobile', label: 'Mobile (Touch)' },
                      { id: 'desktop', label: 'PC (Teclado)' },
                    ] as Array<{ id: ControlMode; label: string }>
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onUpdateSettings({ controlMode: m.id })}
                      className={`rounded-lg border px-2.5 py-2 text-center font-medium transition-colors ${
                        settings.controlMode === m.id
                          ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                          : 'border-[#252b38] bg-[#161a23] text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sensitivity Sliders */}
              <div className="space-y-3 border-t border-[#222630] pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">Sensibilidade</span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        generalSensitivity: 55,
                        aimSensitivity: 45,
                        scopeSensitivity: 35,
                        invertY: false,
                      })
                    }
                    className="text-[11px] text-slate-400 hover:text-amber-300"
                  >
                    Resetar Padrão
                  </button>
                </div>

                {(
                  [
                    { key: 'generalSensitivity', label: 'Geral (Câmera)' },
                    { key: 'aimSensitivity', label: 'Mira (Red Dot)' },
                    { key: 'scopeSensitivity', label: 'Luneta Sniper (AWM)' },
                  ] as const
                ).map(({ key, label }) => (
                  <div key={key}>
                    <div className="mb-1 flex justify-between text-[11px] text-slate-300">
                      <span>{label}</span>
                      <span className="font-mono font-semibold tabular-nums text-amber-300">
                        {settings[key]}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={100}
                      step={1}
                      value={settings[key]}
                      onChange={(e) => onUpdateSettings({ [key]: Number(e.target.value) })}
                      className="w-full accent-amber-500"
                    />
                  </div>
                ))}

                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#232834] bg-[#161a23] px-3 py-2">
                  <span className="text-slate-200">Inverter Eixo Y da Câmera</span>
                  <input
                    type="checkbox"
                    checked={settings.invertY}
                    onChange={(e) => onUpdateSettings({ invertY: e.target.checked })}
                    className="accent-amber-500"
                  />
                </label>
              </div>

              {/* Weapon Loadout Slots */}
              <div className="space-y-2 border-t border-[#222630] pt-3">
                <span className="block font-semibold text-slate-200">
                  Armas nos Slots (1, 2, 3)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] text-slate-400">Slot 1 (Primária)</label>
                    <select
                      value={settings.slot1Weapon}
                      onChange={(e) =>
                        onUpdateSettings({ slot1Weapon: e.target.value as WeaponId })
                      }
                      className="w-full rounded border border-[#252b38] bg-[#0d0f14] px-2 py-1.5 text-xs text-slate-200"
                    >
                      {SLOT1_WEAPONS.map((wId) => (
                        <option key={wId} value={wId}>
                          {WEAPONS[wId].shortName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] text-slate-400">Slot 2 (Secundária)</label>
                    <select
                      value={settings.slot2Weapon}
                      onChange={(e) =>
                        onUpdateSettings({ slot2Weapon: e.target.value as WeaponId })
                      }
                      className="w-full rounded border border-[#252b38] bg-[#0d0f14] px-2 py-1.5 text-xs text-slate-200"
                    >
                      {SLOT2_WEAPONS.map((wId) => (
                        <option key={wId} value={wId}>
                          {WEAPONS[wId].shortName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] text-slate-400">Slot 3 (Pistola)</label>
                    <select
                      value={settings.slot3Weapon}
                      onChange={(e) =>
                        onUpdateSettings({ slot3Weapon: e.target.value as WeaponId })
                      }
                      className="w-full rounded border border-[#252b38] bg-[#0d0f14] px-2 py-1.5 text-xs text-slate-200"
                    >
                      {SLOT3_WEAPONS.map((wId) => (
                        <option key={wId} value={wId}>
                          {WEAPONS[wId].shortName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-[#222630] px-4 py-3">
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
              >
                Continuar Jogando
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
