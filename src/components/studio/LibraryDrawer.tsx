import React, { useState } from 'react';
import { Box, MapPin, Plus, Trees, User, X } from 'lucide-react';
import { BUILTIN_CATALOG, BuiltinCatalogItem } from '../../studio/builtinCatalog';
import { BuiltinAssetId } from '../../studio/types';

interface LibraryDrawerProps {
  open: boolean;
  onClose: () => void;
  onAddBuiltin: (id: BuiltinAssetId) => void;
}

const CATEGORIES: Array<'Todos' | BuiltinCatalogItem['category']> = [
  'Todos',
  'Estrutura',
  'Personagem',
  'Natureza',
  'Marcador',
];

export const LibraryDrawer: React.FC<LibraryDrawerProps> = ({
  open,
  onClose,
  onAddBuiltin,
}) => {
  const [filter, setFilter] = useState<'Todos' | BuiltinCatalogItem['category']>('Todos');

  if (!open) return null;

  const items =
    filter === 'Todos'
      ? BUILTIN_CATALOG
      : BUILTIN_CATALOG.filter((item) => item.category === filter);

  const renderIcon = (cat: BuiltinCatalogItem['category']) => {
    if (cat === 'Personagem') return <User className="h-4 w-4 text-amber-400" />;
    if (cat === 'Natureza') return <Trees className="h-4 w-4 text-emerald-400" />;
    if (cat === 'Marcador') return <MapPin className="h-4 w-4 text-amber-400" />;
    return <Box className="h-4 w-4 text-sky-400" />;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-[#262b36] bg-[#13161d] p-5 text-slate-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-[#232834] pb-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-white">
              Biblioteca de Assets do Projeto
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Personagens .glb, estruturas e marcadores prontos para montar e testar na cena
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-[#1e232e] hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-[#0d0f13] p-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                filter === cat
                  ? 'bg-[#222836] text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid max-h-[55vh] grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onAddBuiltin(item.id);
                onClose();
              }}
              className="group flex items-start gap-3 rounded-lg border border-[#232834] bg-[#171b23] p-3 text-left transition-colors hover:border-amber-500/60 hover:bg-[#1b202b]"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#0f1218]">
                {renderIcon(item.category)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-white">
                    {item.name}
                  </span>
                  <Plus className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-amber-400" />
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {item.category} · {item.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
