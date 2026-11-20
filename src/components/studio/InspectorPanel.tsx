import React, { useState } from 'react';
import {
  ArrowDownToLine,
  Download,
  Eye,
  EyeOff,
  Gamepad2,
  Pause,
  Play,
  RotateCcw,
  Sliders,
  Sun,
} from 'lucide-react';
import {
  ControlMode,
  GraphicsQuality,
  WEAPONS,
  WeaponId,
} from '../../game/types';
import {
  AssetRole,
  EnvironmentPreset,
  EnvironmentSettings,
  MaterialOverride,
  PlaytestSettings,
  QUALITY_LABELS,
  ROLE_LABELS,
  SceneObjectMeta,
} from '../../studio/types';

interface InspectorPanelProps {
  selected: SceneObjectMeta | null;
  allObjects: SceneObjectMeta[];
  environment: EnvironmentSettings;
  playtestSettings: PlaytestSettings;
  onUpdateTransform: (
    id: string,
    patch: Partial<{
      position: [number, number, number];
      rotationDeg: [number, number, number];
      scale: [number, number, number];
    }>,
  ) => void;
  onSnapToGround: (id: string) => void;
  onCenterObject: (id: string) => void;
  onNormalizeScale: (id: string) => void;
  onResetTransform: (id: string) => void;
  onUpdateMeta: (
    id: string,
    patch: Partial<{
      name: string;
      role: AssetRole;
      visible: boolean;
      locked: boolean;
      collisionEnabled: boolean;
      walkableEnabled: boolean;
      castShadow: boolean;
      receiveShadow: boolean;
    }>,
  ) => void;
  onUpdateMaterial: (id: string, patch: Partial<MaterialOverride>) => void;
  onResetMaterial: (id: string) => void;
  onUpdateSubMesh: (
    entryId: string,
    meshUuid: string,
    patch: Partial<{ visible: boolean; colorHex: string; roughness: number; metalness: number }>,
  ) => void;
  onUpdateAnim: (
    id: string,
    patch: Partial<{
      activeAnimIndex: number;
      animPlaying: boolean;
      animLoop: boolean;
      animSpeed: number;
    }>,
  ) => void;
  onExportSelectedGlb: (id: string) => void;
  onApplyEnvPreset: (preset: EnvironmentPreset) => void;
  onUpdateEnv: (patch: Partial<EnvironmentSettings>) => void;
  onUpdatePlaytest: (patch: Partial<PlaytestSettings>) => void;
}

type InspectorTab = 'object' | 'environment' | 'playtest';

const SLOT1_WEAPONS: WeaponId[] = ['m4a1', 'ak47', 'scar', 'xm8', 'awm', 'm1014'];
const SLOT2_WEAPONS: WeaponId[] = ['ump45', 'm1014', 'm4a1', 'ak47', 'awm', 'scar'];
const SLOT3_WEAPONS: WeaponId[] = ['deagle', 'g18'];

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  selected,
  allObjects,
  environment,
  playtestSettings,
  onUpdateTransform,
  onSnapToGround,
  onCenterObject,
  onNormalizeScale,
  onResetTransform,
  onUpdateMeta,
  onUpdateMaterial,
  onResetMaterial,
  onUpdateSubMesh,
  onUpdateAnim,
  onExportSelectedGlb,
  onApplyEnvPreset,
  onUpdateEnv,
  onUpdatePlaytest,
}) => {
  const [tab, setTab] = useState<InspectorTab>('object');
  const [uniformScale, setUniformScale] = useState(true);
  const [showSubMeshes, setShowSubMeshes] = useState(false);

  const customCharCandidates = allObjects.filter(
    (o) => o.role === 'character' || o.animations.length > 0,
  );

  const handleVectorChange = (
    field: 'position' | 'rotationDeg' | 'scale',
    axisIdx: 0 | 1 | 2,
    rawVal: string,
  ) => {
    if (!selected) return;
    const num = parseFloat(rawVal);
    if (Number.isNaN(num)) return;
    const current = [...selected[field]] as [number, number, number];
    if (field === 'scale' && uniformScale) {
      const prev = current[axisIdx] || 1;
      const ratio = num / prev;
      onUpdateTransform(selected.id, {
        scale: [
          Math.max(0.001, Math.round(current[0] * ratio * 1000) / 1000),
          Math.max(0.001, Math.round(current[1] * ratio * 1000) / 1000),
          Math.max(0.001, Math.round(current[2] * ratio * 1000) / 1000),
        ],
      });
      return;
    }
    current[axisIdx] = num;
    onUpdateTransform(selected.id, { [field]: current });
  };

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-[#222630] bg-[#12151c] text-slate-100">
      {/* Inspector Tab Bar */}
      <div className="grid grid-cols-3 border-b border-[#222630] bg-[#0e1016] p-1">
        <button
          type="button"
          onClick={() => setTab('object')}
          className={`flex items-center justify-center gap-1 rounded py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
            tab === 'object' ? 'bg-[#202633] text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="h-3.5 w-3.5" />
          Objeto
        </button>
        <button
          type="button"
          onClick={() => setTab('environment')}
          className={`flex items-center justify-center gap-1 rounded py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
            tab === 'environment'
              ? 'bg-[#202633] text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sun className="h-3.5 w-3.5" />
          Ambiente
        </button>
        <button
          type="button"
          onClick={() => setTab('playtest')}
          className={`flex items-center justify-center gap-1 rounded py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
            tab === 'playtest' ? 'bg-[#202633] text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Gamepad2 className="h-3.5 w-3.5" />
          Playtest
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'object' && !selected && (
          <div className="py-12 text-center text-xs leading-relaxed text-slate-400">
            Selecione um modelo no viewport 3D ou na Hierarquia à esquerda para editar posição, escala, materiais, colisão e animações.
          </div>
        )}

        {tab === 'object' && selected && (
          <div className="space-y-4">
            {/* Identity & Role */}
            <div className="space-y-2 border-b border-[#222630] pb-3">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={selected.name}
                  onChange={(e) => onUpdateMeta(selected.id, { name: e.target.value })}
                  className="min-w-0 flex-1 rounded border border-[#272d3a] bg-[#0d0f14] px-2.5 py-1.5 text-xs font-semibold text-white focus:border-amber-500 focus:outline-none"
                />
                {selected.role !== 'spawn' && (
                  <button
                    type="button"
                    onClick={() => onExportSelectedGlb(selected.id)}
                    className="flex shrink-0 items-center gap-1 rounded border border-[#2a3140] bg-[#181c26] px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:border-amber-500/60 hover:text-amber-300"
                    title="Exportar apenas este objeto em .GLB"
                  >
                    <Download className="h-3 w-3" />
                    .GLB
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <select
                  value={selected.role}
                  onChange={(e) =>
                    onUpdateMeta(selected.id, { role: e.target.value as AssetRole })
                  }
                  className="flex-1 rounded border border-[#272d3a] bg-[#0d0f14] px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                >
                  {(['map', 'asset', 'character', 'weapon', 'spawn'] as AssetRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              {selected.role === 'spawn' ? (
                <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-200">
                  Apenas para visualização e ponto de nascimento no teste — não é salvo junto ao exportar .GLB ou .JSON.
                </div>
              ) : (
                <div className="font-mono text-[11px] text-slate-400">
                  {selected.meshCount} malhas · {selected.triangleCount.toLocaleString('pt-BR')} tris ·{' '}
                  {selected.dimensions[0]}×{selected.dimensions[1]}×{selected.dimensions[2]}m
                </div>
              )}
            </div>

            {/* Transform */}
            <div className="space-y-2.5 border-b border-[#222630] pb-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">Transformação</span>
                <button
                  type="button"
                  onClick={() => onResetTransform(selected.id)}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
                >
                  <RotateCcw className="h-3 w-3" />
                  Resetar
                </button>
              </div>

              {(
                [
                  { key: 'position', label: 'Posição (m)', step: 0.25 },
                  { key: 'rotationDeg', label: 'Rotação (°)', step: 5 },
                  { key: 'scale', label: 'Escala', step: 0.1 },
                ] as const
              ).map(({ key, label, step }) => (
                <div key={key}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">{label}</span>
                    {key === 'scale' && (
                      <label className="flex cursor-pointer items-center gap-1 text-[10px] text-slate-400">
                        <input
                          type="checkbox"
                          checked={uniformScale}
                          onChange={(e) => setUniformScale(e.target.checked)}
                          className="accent-amber-500"
                        />
                        Uniforme
                      </label>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
                      <div
                        key={axis}
                        className="flex items-center rounded border border-[#252b38] bg-[#0d0f14] px-1.5 py-1"
                      >
                        <span
                          className={`mr-1 font-mono text-[10px] font-semibold ${
                            axis === 'X'
                              ? 'text-rose-400'
                              : axis === 'Y'
                                ? 'text-emerald-400'
                                : 'text-sky-400'
                          }`}
                        >
                          {axis}
                        </span>
                        <input
                          type="number"
                          step={step}
                          disabled={selected.locked}
                          value={selected[key][idx]}
                          onChange={(e) =>
                            handleVectorChange(key, idx as 0 | 1 | 2, e.target.value)
                          }
                          className="w-full bg-transparent font-mono text-xs text-slate-100 focus:outline-none disabled:opacity-50"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <button
                  type="button"
                  disabled={selected.locked}
                  onClick={() => onSnapToGround(selected.id)}
                  className="flex items-center justify-center gap-1 rounded border border-[#272d3a] bg-[#171b24] py-1.5 text-[11px] font-medium text-slate-200 hover:border-amber-500/60 disabled:opacity-40"
                  title="Apoiar base do modelo no Y=0 (End)"
                >
                  <ArrowDownToLine className="h-3 w-3" />
                  Chão
                </button>
                <button
                  type="button"
                  disabled={selected.locked}
                  onClick={() => onCenterObject(selected.id)}
                  className="rounded border border-[#272d3a] bg-[#171b24] py-1.5 text-[11px] font-medium text-slate-200 hover:border-amber-500/60 disabled:opacity-40"
                >
                  Centralizar
                </button>
                <button
                  type="button"
                  disabled={selected.locked}
                  onClick={() => onNormalizeScale(selected.id)}
                  className="rounded border border-[#272d3a] bg-[#171b24] py-1.5 text-[11px] font-medium text-slate-200 hover:border-amber-500/60 disabled:opacity-40"
                  title="Ajustar escala para ~4m"
                >
                  Escala 4m
                </button>
              </div>
            </div>

            {/* Playtest Physics & Shadows */}
            <div className="space-y-2 border-b border-[#222630] pb-3">
              <span className="block text-xs font-semibold text-slate-200">
                Física no Playtest & Sombras
              </span>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <label className="flex cursor-pointer items-center gap-2 rounded border border-[#232834] bg-[#161a23] px-2.5 py-1.5">
                  <input
                    type="checkbox"
                    checked={selected.collisionEnabled}
                    onChange={(e) =>
                      onUpdateMeta(selected.id, { collisionEnabled: e.target.checked })
                    }
                    className="accent-amber-500"
                  />
                  <span className="text-[11px] text-slate-200">Colisão Sólida</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded border border-[#232834] bg-[#161a23] px-2.5 py-1.5">
                  <input
                    type="checkbox"
                    checked={selected.walkableEnabled}
                    onChange={(e) =>
                      onUpdateMeta(selected.id, { walkableEnabled: e.target.checked })
                    }
                    className="accent-amber-500"
                  />
                  <span className="text-[11px] text-slate-200">Caminhável</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded border border-[#232834] bg-[#161a23] px-2.5 py-1.5">
                  <input
                    type="checkbox"
                    checked={selected.castShadow}
                    onChange={(e) => onUpdateMeta(selected.id, { castShadow: e.target.checked })}
                    className="accent-amber-500"
                  />
                  <span className="text-[11px] text-slate-200">Projeta Sombra</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded border border-[#232834] bg-[#161a23] px-2.5 py-1.5">
                  <input
                    type="checkbox"
                    checked={selected.receiveShadow}
                    onChange={(e) =>
                      onUpdateMeta(selected.id, { receiveShadow: e.target.checked })
                    }
                    className="accent-amber-500"
                  />
                  <span className="text-[11px] text-slate-200">Recebe Sombra</span>
                </label>
              </div>
            </div>

            {/* Animations (if GLB has AnimationClips) */}
            {selected.animations.length > 0 && (
              <div className="space-y-2 border-b border-[#222630] pb-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">
                    Animações ({selected.animations.length})
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateAnim(selected.id, { animPlaying: !selected.animPlaying })
                    }
                    className="flex items-center gap-1 rounded bg-amber-500/20 px-2 py-1 text-[11px] font-medium text-amber-300 hover:bg-amber-500/30"
                  >
                    {selected.animPlaying ? (
                      <>
                        <Pause className="h-3 w-3" /> Pausar
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3" /> Tocar
                      </>
                    )}
                  </button>
                </div>
                <select
                  value={selected.activeAnimIndex}
                  onChange={(e) =>
                    onUpdateAnim(selected.id, { activeAnimIndex: Number(e.target.value) })
                  }
                  className="w-full rounded border border-[#252b38] bg-[#0d0f14] px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                >
                  {selected.animations.map((clipName, idx) => (
                    <option key={idx} value={idx}>
                      {clipName}
                    </option>
                  ))}
                </select>
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span>Velocidade</span>
                  <input
                    type="range"
                    min={0.2}
                    max={2.5}
                    step={0.1}
                    value={selected.animSpeed}
                    onChange={(e) =>
                      onUpdateAnim(selected.id, { animSpeed: Number(e.target.value) })
                    }
                    className="flex-1 accent-amber-500"
                  />
                  <span className="w-9 text-right font-mono text-slate-200">
                    {selected.animSpeed.toFixed(1)}x
                  </span>
                </div>
              </div>
            )}

            {/* Global Material Override */}
            <div className="space-y-2.5 border-b border-[#222630] pb-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">Materiais</span>
                <button
                  type="button"
                  onClick={() => onResetMaterial(selected.id)}
                  className="text-[11px] text-slate-400 hover:text-white"
                >
                  Original
                </button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={selected.materialOverride.useTint}
                    onChange={(e) =>
                      onUpdateMaterial(selected.id, { useTint: e.target.checked })
                    }
                    className="accent-amber-500"
                  />
                  Sobrescrever Cor
                </label>
                <input
                  type="color"
                  value={selected.materialOverride.tint}
                  onChange={(e) =>
                    onUpdateMaterial(selected.id, {
                      useTint: true,
                      tint: e.target.value,
                    })
                  }
                  className="h-6 w-10 cursor-pointer rounded border border-[#2a3140] bg-transparent"
                />
              </div>

              <div>
                <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                  <span>Rugosidade (Roughness)</span>
                  <span className="font-mono text-slate-200">
                    {selected.materialOverride.roughness < 0
                      ? 'Original'
                      : selected.materialOverride.roughness.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={
                    selected.materialOverride.roughness < 0
                      ? 0.5
                      : selected.materialOverride.roughness
                  }
                  onChange={(e) =>
                    onUpdateMaterial(selected.id, { roughness: Number(e.target.value) })
                  }
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                  <span>Metalicidade (Metalness)</span>
                  <span className="font-mono text-slate-200">
                    {selected.materialOverride.metalness < 0
                      ? 'Original'
                      : selected.materialOverride.metalness.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={
                    selected.materialOverride.metalness < 0
                      ? 0.1
                      : selected.materialOverride.metalness
                  }
                  onChange={(e) =>
                    onUpdateMaterial(selected.id, { metalness: Number(e.target.value) })
                  }
                  className="w-full accent-amber-500"
                />
              </div>

              <div className="flex items-center justify-between gap-2 text-xs">
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={selected.materialOverride.wireframe}
                    onChange={(e) =>
                      onUpdateMaterial(selected.id, { wireframe: e.target.checked })
                    }
                    className="accent-amber-500"
                  />
                  Wireframe
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={selected.materialOverride.doubleSide}
                    onChange={(e) =>
                      onUpdateMaterial(selected.id, { doubleSide: e.target.checked })
                    }
                    className="accent-amber-500"
                  />
                  Dupla Face
                </label>
              </div>
            </div>

            {/* Sub-meshes Inspector */}
            {selected.subMeshes.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowSubMeshes((v) => !v)}
                  className="flex w-full items-center justify-between text-xs font-semibold text-slate-200 hover:text-amber-300"
                >
                  <span>Sub-malhas do .GLB ({selected.subMeshes.length})</span>
                  <span className="text-[11px] text-slate-400">
                    {showSubMeshes ? 'Ocultar' : 'Expandir'}
                  </span>
                </button>
                {showSubMeshes && (
                  <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                    {selected.subMeshes.map((sm) => (
                      <div
                        key={sm.uuid}
                        className="flex items-center justify-between gap-2 rounded border border-[#222733] bg-[#0e1117] px-2 py-1.5"
                      >
                        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">
                          {sm.name}
                        </span>
                        <input
                          type="color"
                          value={sm.colorHex}
                          onChange={(e) =>
                            onUpdateSubMesh(selected.id, sm.uuid, { colorHex: e.target.value })
                          }
                          className="h-5 w-7 cursor-pointer rounded border border-[#2a3140] bg-transparent"
                          title="Cor desta sub-malha"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateSubMesh(selected.id, sm.uuid, { visible: !sm.visible })
                          }
                          className="rounded p-1 text-slate-400 hover:text-white"
                          title={sm.visible ? 'Ocultar parte' : 'Mostrar parte'}
                        >
                          {sm.visible ? (
                            <Eye className="h-3.5 w-3.5" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5 text-slate-600" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'environment' && (
          <div className="space-y-4">
            <div>
              <span className="mb-2 block text-xs font-semibold text-slate-200">
                Clima & Iluminação
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: 'daylight', label: 'Dia Clássico' },
                    { id: 'sunset', label: 'Pôr do Sol' },
                    { id: 'studio', label: 'Estúdio Neutro' },
                    { id: 'night', label: 'Noturno Tático' },
                  ] as Array<{ id: EnvironmentPreset; label: string }>
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onApplyEnvPreset(p.id)}
                    className={`rounded-md border px-2.5 py-2 text-xs font-medium transition-colors ${
                      environment.preset === p.id
                        ? 'border-amber-500/70 bg-amber-500/15 text-amber-300'
                        : 'border-[#252b38] bg-[#161a23] text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 border-t border-[#222630] pt-3">
              <div>
                <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                  <span>Intensidade do Sol</span>
                  <span className="font-mono text-slate-200">
                    {environment.sunIntensity.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={4}
                  step={0.1}
                  value={environment.sunIntensity}
                  onChange={(e) => onUpdateEnv({ sunIntensity: Number(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                  <span>Ângulo Solar (Azimute)</span>
                  <span className="font-mono text-slate-200">
                    {environment.sunAzimuthDeg}°
                  </span>
                </div>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={2}
                  value={environment.sunAzimuthDeg}
                  onChange={(e) => onUpdateEnv({ sunAzimuthDeg: Number(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                  <span>Altura Solar (Elevação)</span>
                  <span className="font-mono text-slate-200">
                    {environment.sunElevationDeg}°
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={85}
                  step={1}
                  value={environment.sunElevationDeg}
                  onChange={(e) => onUpdateEnv({ sunElevationDeg: Number(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                  <span>Exposição (Tone Mapping)</span>
                  <span className="font-mono text-slate-200">
                    {environment.exposure.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={environment.exposure}
                  onChange={(e) => onUpdateEnv({ exposure: Number(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>
            </div>

            <div className="space-y-2 border-t border-[#222630] pt-3">
              <span className="block text-xs font-semibold text-slate-200">
                Cenário Base & Neblina
              </span>
              <label className="flex cursor-pointer items-center justify-between rounded border border-[#232834] bg-[#161a23] px-2.5 py-2 text-xs text-slate-200">
                <span>Mostrar Grade (Grid)</span>
                <input
                  type="checkbox"
                  checked={environment.showGrid}
                  onChange={(e) => onUpdateEnv({ showGrid: e.target.checked })}
                  className="accent-amber-500"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded border border-[#232834] bg-[#161a23] px-2.5 py-2 text-xs text-slate-200">
                <span>Chão Base Sólido</span>
                <input
                  type="checkbox"
                  checked={environment.showGroundPlane}
                  onChange={(e) => onUpdateEnv({ showGroundPlane: e.target.checked })}
                  className="accent-amber-500"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded border border-[#232834] bg-[#161a23] px-2.5 py-2 text-xs text-slate-200">
                <span>Neblina Atmosférica</span>
                <input
                  type="checkbox"
                  checked={environment.fogEnabled}
                  onChange={(e) => onUpdateEnv({ fogEnabled: e.target.checked })}
                  className="accent-amber-500"
                />
              </label>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="flex items-center justify-between rounded border border-[#232834] bg-[#161a23] px-2.5 py-1.5 text-[11px] text-slate-300">
                  <span>Céu</span>
                  <input
                    type="color"
                    value={environment.skyColor}
                    onChange={(e) => onUpdateEnv({ skyColor: e.target.value })}
                    className="h-5 w-8 cursor-pointer rounded bg-transparent"
                  />
                </label>
                <label className="flex items-center justify-between rounded border border-[#232834] bg-[#161a23] px-2.5 py-1.5 text-[11px] text-slate-300">
                  <span>Chão</span>
                  <input
                    type="color"
                    value={environment.groundColor}
                    onChange={(e) => onUpdateEnv({ groundColor: e.target.value })}
                    className="h-5 w-8 cursor-pointer rounded bg-transparent"
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {tab === 'playtest' && (
          <div className="space-y-4">
            <div>
              <span className="mb-2 block text-xs font-semibold text-slate-200">
                Personagem do Playtest
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdatePlaytest({ playerModel: 'adam' })}
                  className={`rounded-md border px-2.5 py-2 text-xs font-medium ${
                    playtestSettings.playerModel === 'adam'
                      ? 'border-amber-500/70 bg-amber-500/15 text-amber-300'
                      : 'border-[#252b38] bg-[#161a23] text-slate-300'
                  }`}
                >
                  Adam (.glb)
                </button>
                <button
                  type="button"
                  onClick={() => onUpdatePlaytest({ playerModel: 'eva' })}
                  className={`rounded-md border px-2.5 py-2 text-xs font-medium ${
                    playtestSettings.playerModel === 'eva'
                      ? 'border-amber-500/70 bg-amber-500/15 text-amber-300'
                      : 'border-[#252b38] bg-[#161a23] text-slate-300'
                  }`}
                >
                  Eva (.glb)
                </button>
              </div>

              {customCharCandidates.length > 0 && (
                <div className="mt-2">
                  <label className="mb-1 block text-[11px] text-slate-400">
                    Ou usar modelo da cena:
                  </label>
                  <select
                    value={
                      playtestSettings.playerModel === 'custom'
                        ? playtestSettings.customCharacterObjectId ?? ''
                        : ''
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        onUpdatePlaytest({ playerModel: 'adam', customCharacterObjectId: null });
                      } else {
                        onUpdatePlaytest({
                          playerModel: 'custom',
                          customCharacterObjectId: val,
                        });
                      }
                    }}
                    className="w-full rounded border border-[#252b38] bg-[#0d0f14] px-2 py-1.5 text-xs text-slate-200"
                  >
                    <option value="">Usar Adam / Eva padrão</option>
                    {customCharCandidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <label className="mt-2.5 flex cursor-pointer items-start gap-2 rounded-md border border-[#232834] bg-[#161a23] px-2.5 py-2 text-xs text-slate-200">
                <input
                  type="checkbox"
                  checked={playtestSettings.editorCharacterPreview}
                  onChange={(e) =>
                    onUpdatePlaytest({ editorCharacterPreview: e.target.checked })
                  }
                  className="mt-0.5 accent-amber-500"
                />
                <span className="leading-snug">
                  <span className="block text-[11px] font-medium text-slate-100">
                    Mostrar personagem parado no Editor
                  </span>
                  <span className="block text-[10px] text-slate-400">
                    Apenas para dar uma olhada de perto e comparar escala (não é salvo junto ao exportar).
                  </span>
                </span>
              </label>
            </div>

            <div className="space-y-2.5 border-t border-[#222630] pt-3">
              <span className="block text-xs font-semibold text-slate-200">
                Câmera & Loadout (Slots 1–3)
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdatePlaytest({ cameraMode: 'third' })}
                  className={`rounded-md border px-2.5 py-2 text-xs font-medium ${
                    playtestSettings.cameraMode === 'third'
                      ? 'border-amber-500/70 bg-amber-500/15 text-amber-300'
                      : 'border-[#252b38] bg-[#161a23] text-slate-300'
                  }`}
                >
                  3ª Pessoa
                </button>
                <button
                  type="button"
                  onClick={() => onUpdatePlaytest({ cameraMode: 'first' })}
                  className={`rounded-md border px-2.5 py-2 text-xs font-medium ${
                    playtestSettings.cameraMode === 'first'
                      ? 'border-amber-500/70 bg-amber-500/15 text-amber-300'
                      : 'border-[#252b38] bg-[#161a23] text-slate-300'
                  }`}
                >
                  1ª Pessoa
                </button>
              </div>
              {playtestSettings.playerModel !== 'custom' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-1.5">
                    <div>
                      <label className="mb-1 block text-[10px] text-slate-400">Slot 1</label>
                      <select
                        value={playtestSettings.slot1Weapon}
                        onChange={(e) =>
                          onUpdatePlaytest({ slot1Weapon: e.target.value as WeaponId })
                        }
                        className="w-full rounded border border-[#252b38] bg-[#0d0f14] px-1.5 py-1.5 text-[11px] text-slate-200"
                      >
                        {SLOT1_WEAPONS.map((w) => (
                          <option key={w} value={w}>
                            {WEAPONS[w].shortName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] text-slate-400">Slot 2</label>
                      <select
                        value={playtestSettings.slot2Weapon}
                        onChange={(e) =>
                          onUpdatePlaytest({ slot2Weapon: e.target.value as WeaponId })
                        }
                        className="w-full rounded border border-[#252b38] bg-[#0d0f14] px-1.5 py-1.5 text-[11px] text-slate-200"
                      >
                        {SLOT2_WEAPONS.map((w) => (
                          <option key={w} value={w}>
                            {WEAPONS[w].shortName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] text-slate-400">Slot 3</label>
                      <select
                        value={playtestSettings.slot3Weapon}
                        onChange={(e) =>
                          onUpdatePlaytest({ slot3Weapon: e.target.value as WeaponId })
                        }
                        className="w-full rounded border border-[#252b38] bg-[#0d0f14] px-1.5 py-1.5 text-[11px] text-slate-200"
                      >
                        {SLOT3_WEAPONS.map((w) => (
                          <option key={w} value={w}>
                            {WEAPONS[w].shortName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Graphics Quality & Mobile HUD Mode */}
            <div className="space-y-3 border-t border-[#222630] pt-3">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">Qualidade Gráfica</span>
                  <span className="font-mono text-[10px] text-amber-400">
                    {QUALITY_LABELS[playtestSettings.quality]}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['low', 'medium', 'high'] as GraphicsQuality[]).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => onUpdatePlaytest({ quality: q })}
                      className={`rounded-md border px-2 py-1.5 text-[11px] font-medium ${
                        playtestSettings.quality === q
                          ? 'border-amber-500/70 bg-amber-500/15 text-amber-300'
                          : 'border-[#252b38] bg-[#161a23] text-slate-300'
                      }`}
                    >
                      {QUALITY_LABELS[q]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-semibold text-slate-200">
                  Controles & HUD Mobile
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'auto', label: 'Auto' },
                      { id: 'mobile', label: 'Mobile' },
                      { id: 'desktop', label: 'PC' },
                    ] as Array<{ id: ControlMode; label: string }>
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onUpdatePlaytest({ controlMode: m.id })}
                      className={`rounded-md border px-2 py-1.5 text-[11px] font-medium ${
                        playtestSettings.controlMode === m.id
                          ? 'border-amber-500/70 bg-amber-500/15 text-amber-300'
                          : 'border-[#252b38] bg-[#161a23] text-slate-300'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Sensitivity */}
            <div className="space-y-2.5 border-t border-[#222630] pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">Sensibilidade</span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePlaytest({
                      generalSensitivity: 55,
                      aimSensitivity: 45,
                      scopeSensitivity: 35,
                      invertY: false,
                    })
                  }
                  className="text-[11px] text-slate-400 hover:text-white"
                >
                  Resetar
                </button>
              </div>
              {(
                [
                  { key: 'generalSensitivity', label: 'Geral' },
                  { key: 'aimSensitivity', label: 'Mira (Red Dot)' },
                  { key: 'scopeSensitivity', label: 'Luneta (AWM)' },
                ] as const
              ).map(({ key, label }) => (
                <div key={key}>
                  <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                    <span>{label}</span>
                    <span className="font-mono text-slate-200">{playtestSettings[key]}</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={1}
                    value={playtestSettings[key]}
                    onChange={(e) => onUpdatePlaytest({ [key]: Number(e.target.value) })}
                    className="w-full accent-amber-500"
                  />
                </div>
              ))}
              <label className="flex cursor-pointer items-center justify-between rounded border border-[#232834] bg-[#161a23] px-2.5 py-1.5 text-[11px] text-slate-200">
                <span>Inverter Eixo Y</span>
                <input
                  type="checkbox"
                  checked={playtestSettings.invertY}
                  onChange={(e) => onUpdatePlaytest({ invertY: e.target.checked })}
                  className="accent-amber-500"
                />
              </label>
            </div>

            <div className="space-y-3 border-t border-[#222630] pt-3">
              <span className="block text-xs font-semibold text-slate-200">
                Movimentação & Gravidade
              </span>
              <div>
                <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                  <span>Velocidade Base</span>
                  <span className="font-mono text-slate-200">
                    {playtestSettings.moveSpeed.toFixed(1)} m/s
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={14}
                  step={0.2}
                  value={playtestSettings.moveSpeed}
                  onChange={(e) => onUpdatePlaytest({ moveSpeed: Number(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                  <span>Velocidade Corrida (Shift)</span>
                  <span className="font-mono text-slate-200">
                    {playtestSettings.sprintSpeed.toFixed(1)} m/s
                  </span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={20}
                  step={0.2}
                  value={playtestSettings.sprintSpeed}
                  onChange={(e) => onUpdatePlaytest({ sprintSpeed: Number(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                  <span>Força do Pulo</span>
                  <span className="font-mono text-slate-200">
                    {playtestSettings.jumpForce.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={15}
                  step={0.2}
                  value={playtestSettings.jumpForce}
                  onChange={(e) => onUpdatePlaytest({ jumpForce: Number(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
