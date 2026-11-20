import React, { useRef, useState } from 'react';
import { FileUp, Link2, Upload, X } from 'lucide-react';
import { AssetRole, ROLE_LABELS } from '../../studio/types';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onUploadGlb: (file: File, role: AssetRole) => void;
  onLoadUrl: (url: string, role: AssetRole, name?: string) => void;
  onImportJson: (file: File) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  open,
  onClose,
  onUploadGlb,
  onLoadUrl,
  onImportJson,
}) => {
  const [tab, setTab] = useState<'file' | 'url' | 'project'>('file');
  const [role, setRole] = useState<AssetRole>('map');
  const [url, setUrl] = useState('');
  const [customName, setCustomName] = useState('');
  const glbInputRef = useRef<HTMLInputElement | null>(null);
  const jsonInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      onUploadGlb(files[i], role);
    }
    e.target.value = '';
    onClose();
  };

  const handleJsonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onImportJson(file);
    e.target.value = '';
    onClose();
  };

  const handleSubmitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    onLoadUrl(url.trim(), role, customName.trim() || undefined);
    setUrl('');
    setCustomName('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-[#262b36] bg-[#13161d] p-5 text-slate-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-[#232834] pb-3">
          <h2 className="text-base font-semibold tracking-tight text-white">
            Importar Modelo 3D ou Projeto
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-[#1e232e] hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-[#0d0f13] p-1">
          <button
            type="button"
            onClick={() => setTab('file')}
            className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium whitespace-nowrap transition-colors ${
              tab === 'file'
                ? 'bg-[#222836] text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            Arquivo .GLB
          </button>
          <button
            type="button"
            onClick={() => setTab('url')}
            className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium whitespace-nowrap transition-colors ${
              tab === 'url'
                ? 'bg-[#222836] text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Link2 className="h-3.5 w-3.5" />
            Link (.GLB)
          </button>
          <button
            type="button"
            onClick={() => setTab('project')}
            className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium whitespace-nowrap transition-colors ${
              tab === 'project'
                ? 'bg-[#222836] text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileUp className="h-3.5 w-3.5" />
            Cena .JSON
          </button>
        </div>

        {tab !== 'project' && (
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
              Tipo / Função na Cena
            </label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {(['map', 'asset', 'character', 'weapon'] as AssetRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`rounded-md border px-2.5 py-2 text-left text-xs font-medium whitespace-nowrap transition-colors ${
                    role === r
                      ? 'border-amber-500/70 bg-amber-500/15 text-amber-300'
                      : 'border-[#252b38] bg-[#171b24] text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'file' && (
          <div>
            <input
              ref={glbInputRef}
              type="file"
              accept=".glb,.gltf"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => glbInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#343c4e] bg-[#0f1218] px-6 py-10 text-center transition-colors hover:border-amber-500/70 hover:bg-[#141821]"
            >
              <Upload className="h-7 w-7 text-amber-400" />
              <span className="text-sm font-medium text-white">
                Clique para selecionar arquivos .glb ou .gltf
              </span>
              <span className="text-xs text-slate-400">
                Você também pode arrastar e soltar arquivos direto no viewport 3D
              </span>
            </button>
          </div>
        )}

        {tab === 'url' && (
          <form onSubmit={handleSubmitUrl} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                URL do Modelo (.glb ou .gltf)
              </label>
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://raw.githubusercontent.com/.../mapa.glb"
                className="w-full rounded-md border border-[#2a3140] bg-[#0d0f14] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                Aceita links diretos de CDN, HuggingFace e GitHub (links github.com/blob são convertidos para raw automaticamente).
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Nome opcional na cena
              </label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Ex: Mapa Bermuda Centro"
                className="w-full rounded-md border border-[#2a3140] bg-[#0d0f14] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-[#2a3140] px-4 py-2 text-xs font-medium text-slate-300 hover:bg-[#1b202b]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-md bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
              >
                Carregar Link 3D
              </button>
            </div>
          </form>
        )}

        {tab === 'project' && (
          <div>
            <input
              ref={jsonInputRef}
              type="file"
              accept=".json"
              onChange={handleJsonChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => jsonInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#343c4e] bg-[#0f1218] px-6 py-10 text-center transition-colors hover:border-amber-500/70 hover:bg-[#141821]"
            >
              <FileUp className="h-7 w-7 text-amber-400" />
              <span className="text-sm font-medium text-white">
                Selecionar arquivo de projeto (.json)
              </span>
              <span className="text-xs text-slate-400">
                Restaura posições, materiais, iluminação, spawn e modelos vinculados
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
