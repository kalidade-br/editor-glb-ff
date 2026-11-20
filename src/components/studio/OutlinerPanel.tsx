import React, { useState } from 'react';
import {
  Box,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  Lock,
  Map,
  MapPin,
  Search,
  Trash2,
  Unlock,
  User,
  Wrench,
} from 'lucide-react';
import { AssetRole, ROLE_LABELS, SceneObjectMeta } from '../../studio/types';

interface OutlinerPanelProps {
  objects: SceneObjectMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onFocus: (id: string) => void;
  onToggleVisible: (id: string, next: boolean) => void;
  onToggleLocked: (id: string, next: boolean) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onClearScene: () => void;
}

export const OutlinerPanel: React.FC<OutlinerPanelProps> = ({
  objects,
  selectedId,
  onSelect,
  onFocus,
  onToggleVisible,
  onToggleLocked,
  onDuplicate,
  onDelete,
  onClearScene,
}) => {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | AssetRole>('all');

  const filtered = objects.filter((obj) => {
    if (roleFilter !== 'all' && obj.role !== roleFilter) return false;
    if (query.trim() && !obj.name.toLowerCase().includes(query.trim().toLowerCase())) {
      return false;
    }
    return true;
  });

  const renderRoleIcon = (role: AssetRole) => {
    if (role === 'map') return <Map className="h-3.5 w-3.5 shrink-0 text-emerald-400" />;
    if (role === 'character') return <User className="h-3.5 w-3.5 shrink-0 text-amber-400" />;
    if (role === 'weapon') return <Wrench className="h-3.5 w-3.5 shrink-0 text-sky-400" />;
    if (role === 'spawn') return <MapPin className="h-3.5 w-3.5 shrink-0 text-amber-400" />;
    return <Box className="h-3.5 w-3.5 shrink-0 text-slate-300" />;
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[#222630] bg-[#12151c] text-slate-100">
      <div className="flex items-center justify-between border-b border-[#222630] px-3 py-2.5">
        <span className="text-xs font-semibold tracking-wide text-slate-200">
          Hierarquia da Cena
        </span>
        <span className="font-mono text-[11px] text-slate-400 tabular-nums">
          {objects.length}
        </span>
      </div>

      <div className="space-y-2 border-b border-[#222630] p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar objetos..."
            className="w-full rounded-md border border-[#252a36] bg-[#0d0f14] py-1.5 pr-2.5 pl-8 text-xs text-slate-200 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as 'all' | AssetRole)}
          className="w-full rounded-md border border-[#252a36] bg-[#0d0f14] px-2.5 py-1.5 text-xs text-slate-300 focus:border-amber-500 focus:outline-none"
        >
          <option value="all">Todos os tipos</option>
          <option value="map">{ROLE_LABELS.map}</option>
          <option value="asset">{ROLE_LABELS.asset}</option>
          <option value="character">{ROLE_LABELS.character}</option>
          <option value="weapon">{ROLE_LABELS.weapon}</option>
          <option value="spawn">{ROLE_LABELS.spawn}</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5">
        {filtered.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-slate-500">
            {objects.length === 0
              ? 'Nenhum modelo na cena. Faça upload de um .glb ou adicione da biblioteca.'
              : 'Nenhum objeto corresponde ao filtro.'}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((obj) => {
              const selected = obj.id === selectedId;
              return (
                <li
                  key={obj.id}
                  className={`group rounded-md border transition-colors ${
                    selected
                      ? 'border-amber-500/60 bg-amber-500/12'
                      : 'border-transparent hover:bg-[#191d27]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => onSelect(obj.id)}
                      onDoubleClick={() => onFocus(obj.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      title={`${obj.name} (${ROLE_LABELS[obj.role]})`}
                    >
                      {renderRoleIcon(obj.role)}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-slate-100">
                          {obj.name}
                        </div>
                        <div className="truncate font-mono text-[10px] text-slate-400">
                          {ROLE_LABELS[obj.role]} · {obj.triangleCount.toLocaleString('pt-BR')} tris
                        </div>
                      </div>
                    </button>

                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => onToggleVisible(obj.id, !obj.visible)}
                        className="rounded p-1 text-slate-400 hover:bg-[#242a38] hover:text-white"
                        title={obj.visible ? 'Ocultar' : 'Mostrar'}
                      >
                        {obj.visible ? (
                          <Eye className="h-3.5 w-3.5" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5 text-slate-600" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleLocked(obj.id, !obj.locked)}
                        className="rounded p-1 text-slate-400 hover:bg-[#242a38] hover:text-white"
                        title={obj.locked ? 'Desbloquear' : 'Bloquear'}
                      >
                        {obj.locked ? (
                          <Lock className="h-3.5 w-3.5 text-amber-400" />
                        ) : (
                          <Unlock className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {selected && (
                    <div className="flex items-center justify-end gap-1 border-t border-amber-500/20 px-2 py-1">
                      <button
                        type="button"
                        onClick={() => onFocus(obj.id)}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-300 hover:bg-[#252b3a] hover:text-white"
                        title="Focar Câmera (F)"
                      >
                        <Crosshair className="h-3 w-3" />
                        Focar
                      </button>
                      <button
                        type="button"
                        onClick={() => onDuplicate(obj.id)}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-300 hover:bg-[#252b3a] hover:text-white"
                        title="Duplicar (Ctrl+D)"
                      >
                        <Copy className="h-3 w-3" />
                        Duplicar
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(obj.id)}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-rose-400 hover:bg-rose-500/15"
                        title="Excluir (Del)"
                      >
                        <Trash2 className="h-3 w-3" />
                        Excluir
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {objects.length > 0 && (
        <div className="border-t border-[#222630] p-2">
          <button
            type="button"
            onClick={onClearScene}
            className="w-full rounded-md border border-[#2a2f3d] bg-[#161a23] py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-rose-500/50 hover:text-rose-300"
          >
            Limpar Cena
          </button>
        </div>
      )}
    </aside>
  );
};
