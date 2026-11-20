import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  ChevronDown,
  ChevronUp,
  Download,
  FileJson,
  FolderPlus,
  Globe,
  Grid,
  Magnet,
  Maximize2,
  MousePointer,
  Move,
  PanelLeft,
  PanelRight,
  Play,
  Redo2,
  RotateCw,
  Scaling,
  Undo2,
  X,
} from 'lucide-react';
import { ImportModal } from './components/studio/ImportModal';
import { LibraryDrawer } from './components/studio/LibraryDrawer';
import { OutlinerPanel } from './components/studio/OutlinerPanel';
import { InspectorPanel } from './components/studio/InspectorPanel';
import { PlaytestOverlay } from './components/studio/PlaytestOverlay';
import { StudioEngine } from './studio/StudioEngine';
import {
  DEFAULT_ENVIRONMENT,
  DEFAULT_PLAYTEST_SETTINGS,
  StudioSnapshot,
} from './studio/types';

const INITIAL_SNAPSHOT: StudioSnapshot = {
  mode: 'editor',
  objects: [],
  selectedId: null,
  transformMode: 'translate',
  transformSpace: 'world',
  snapEnabled: false,
  translateSnap: 0.5,
  rotateSnapDeg: 15,
  canUndo: false,
  canRedo: false,
  environment: DEFAULT_ENVIRONMENT,
  playtestSettings: DEFAULT_PLAYTEST_SETTINGS,
  playtestHud: {
    active: false,
    fps: 60,
    playerPos: [0, 0, 0],
    speed: 0,
    stance: 'stand',
    isGrounded: true,
    pointerLocked: false,
    cameraMode: 'third',
    lastHitDistance: null,
    lastHitMeshName: null,
  },
  isLoading: false,
  loadingMessage: '',
  errorMessage: null,
  statusMessage: null,
};

export default function App() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<StudioEngine | null>(null);

  const [snap, setSnap] = useState<StudioSnapshot>(INITIAL_SNAPSHOT);
  const [importOpen, setImportOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [showOutliner, setShowOutliner] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  useEffect(() => {
    const mount = viewportRef.current;
    if (!mount) return;

    const engine = new StudioEngine(mount, (nextSnap) => {
      setSnap(nextSnap);
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Keyboard shortcut 'H' to toggle UI panels / Zen inspection mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        return;
      }
      if (snap.mode === 'editor' && e.code === 'KeyH') {
        setShowOutliner((prev) => !prev);
        setShowInspector((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [snap.mode]);

  const selectedObject = snap.objects.find((o) => o.id === snap.selectedId) ?? null;

  const handleViewportDragOver = (e: React.DragEvent) => {
    if (snap.mode !== 'editor') return;
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleViewportDragLeave = () => {
    setIsDraggingFile(false);
  };

  const handleViewportDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (snap.mode !== 'editor' || !engineRef.current) return;

    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.glb') || lower.endsWith('.gltf')) {
        void engineRef.current.loadGlbFromFile(file, 'asset');
      } else if (lower.endsWith('.json')) {
        void engineRef.current.importProjectFromJson(file);
      }
    }
  };

  const isEditor = snap.mode === 'editor';

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0d0f13] text-slate-100">
      {/* Top Bar (Strictly 3-zone contract, hidden during Playtest) */}
      {isEditor && (
        <header className="z-20 flex h-12 shrink-0 items-center justify-between gap-8 border-b border-[#222630] bg-[#12151c] px-4">
          {/* Zone 1: Brand Wordmark */}
          <span className="shrink-0 text-sm font-bold tracking-tight text-white whitespace-nowrap">
            Studio 3D
          </span>

          {/* Zone 2: Workflow Actions */}
          <nav className="flex min-w-0 items-center gap-5 overflow-x-auto text-xs font-medium text-slate-300">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-colors hover:text-white"
            >
              <FolderPlus className="h-3.5 w-3.5 text-amber-400" />
              Importar .GLB / Link
            </button>
            <button
              type="button"
              onClick={() => setLibraryOpen(true)}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-colors hover:text-white"
            >
              <Box className="h-3.5 w-3.5 text-sky-400" />
              Biblioteca
            </button>
            <button
              type="button"
              onClick={() => void engineRef.current?.exportSceneAsGlb()}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-colors hover:text-white"
            >
              <Download className="h-3.5 w-3.5 text-emerald-400" />
              Exportar .GLB
            </button>
            <button
              type="button"
              onClick={() => void engineRef.current?.exportProjectAsJson()}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-colors hover:text-white"
            >
              <FileJson className="h-3.5 w-3.5 text-slate-400" />
              Salvar .JSON
            </button>
          </nav>

          {/* Zone 3: Primary CTA */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => void engineRef.current?.startPlaytest()}
              className="flex items-center gap-1.5 rounded-md bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 whitespace-nowrap transition-colors hover:bg-amber-400"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Testar Jogando
            </button>
          </div>
        </header>
      )}

      {/* Main Workspace */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Left Outliner */}
        {isEditor && showOutliner && (
          <OutlinerPanel
            objects={snap.objects}
            selectedId={snap.selectedId}
            onSelect={(id) => engineRef.current?.selectObject(id)}
            onFocus={(id) => engineRef.current?.focusObject(id)}
            onToggleVisible={(id, next) =>
              engineRef.current?.updateObjectMeta(id, { visible: next })
            }
            onToggleLocked={(id, next) =>
              engineRef.current?.updateObjectMeta(id, { locked: next })
            }
            onDuplicate={(id) => engineRef.current?.duplicateObject(id)}
            onDelete={(id) => engineRef.current?.deleteObject(id)}
            onClearScene={() => engineRef.current?.clearScene()}
          />
        )}

        {/* Central 3D Viewport */}
        <main
          className="relative min-w-0 flex-1 overflow-hidden"
          onDragOver={handleViewportDragOver}
          onDragLeave={handleViewportDragLeave}
          onDrop={handleViewportDrop}
        >
          <div ref={viewportRef} className="h-full w-full" />

          {/* Panel Toggle Corner Buttons (Editor only) */}
          {isEditor && (
            <>
              <button
                type="button"
                onClick={() => setShowOutliner((v) => !v)}
                className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-md border border-[#252a36] bg-[#12151c]/95 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:border-amber-500/50 hover:text-white"
                title="Alternar Hierarquia"
              >
                <PanelLeft className="h-3.5 w-3.5" />
                {showOutliner ? 'Ocultar Lista' : 'Hierarquia'}
              </button>

              <button
                type="button"
                onClick={() => setShowInspector((v) => !v)}
                className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-md border border-[#252a36] bg-[#12151c]/95 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:border-amber-500/50 hover:text-white"
                title="Alternar Inspetor"
              >
                <PanelRight className="h-3.5 w-3.5" />
                {showInspector ? 'Ocultar Inspetor' : 'Inspetor'}
              </button>
            </>
          )}

          {/* Drag-and-drop overlay */}
          {isDraggingFile && isEditor && (
            <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-amber-400 bg-[#0d0f13]/85">
              <div className="text-center">
                <p className="text-base font-semibold text-white">
                  Solte seu arquivo .GLB, .GLTF ou .JSON aqui
                </p>
                <p className="mt-1 text-xs text-slate-300">
                  O modelo será adicionado diretamente no cenário 3D
                </p>
              </div>
            </div>
          )}

          {/* Loading Indicator */}
          {snap.isLoading && (
            <div className="absolute top-14 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-[#2a3140] bg-[#12151c]/95 px-4 py-2 text-xs font-medium text-amber-300 shadow-xl">
              {snap.loadingMessage || 'Processando modelo 3D...'}
            </div>
          )}

          {/* Error Banner */}
          {snap.errorMessage && (
            <div className="absolute top-14 left-1/2 z-30 flex max-w-md -translate-x-1/2 items-start gap-2.5 rounded-lg border border-rose-500/50 bg-[#1a1216] px-3.5 py-2.5 text-xs text-rose-200 shadow-xl">
              <span className="flex-1 leading-relaxed">{snap.errorMessage}</span>
              <button
                type="button"
                onClick={() => engineRef.current?.clearError()}
                className="rounded p-0.5 text-rose-300 hover:bg-rose-500/20"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Transient Status Banner */}
          {snap.statusMessage && !snap.errorMessage && !snap.isLoading && (
            <div className="pointer-events-none absolute top-14 left-1/2 z-20 -translate-x-1/2 rounded-md border border-[#272d3b] bg-[#12151c]/95 px-3 py-1.5 text-xs text-slate-200 shadow-lg">
              {snap.statusMessage}
            </div>
          )}

          {/* Bottom Viewport Dock (Gizmos, Undo/Redo, Camera Presets) */}
          {isEditor && (
            <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center">
              <button
                type="button"
                onClick={() => setDockCollapsed((v) => !v)}
                className="mb-1 flex items-center gap-1 rounded-t-md border border-b-0 border-[#262b38] bg-[#12151c] px-3 py-1 text-[10px] font-medium text-slate-400 hover:text-white"
              >
                {dockCollapsed ? (
                  <>
                    <ChevronUp className="h-3 w-3" /> Ferramentas
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" /> Recolher
                  </>
                )}
              </button>

              {!dockCollapsed && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#262b38] bg-[#12151c] px-3 py-2 shadow-2xl">
                  {/* Transform Mode */}
                  <div className="flex items-center gap-0.5 rounded-md bg-[#0b0d11] p-0.5">
                    {(
                      [
                        { id: 'select', label: 'Sel (Q)', Icon: MousePointer },
                        { id: 'translate', label: 'Mover (W)', Icon: Move },
                        { id: 'rotate', label: 'Girar (E)', Icon: RotateCw },
                        { id: 'scale', label: 'Escala (R)', Icon: Scaling },
                      ] as const
                    ).map(({ id, label, Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => engineRef.current?.setTransformMode(id)}
                        className={`flex items-center gap-1 rounded px-2 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                          snap.transformMode === id
                            ? 'bg-amber-500 text-slate-950'
                            : 'text-slate-300 hover:bg-[#1a1e28] hover:text-white'
                        }`}
                        title={label}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="h-5 w-px bg-[#252a36]" />

                  {/* Space & Snap */}
                  <button
                    type="button"
                    onClick={() =>
                      engineRef.current?.setTransformSpace(
                        snap.transformSpace === 'world' ? 'local' : 'world',
                      )
                    }
                    className="flex items-center gap-1 rounded-md border border-[#252a36] bg-[#161a23] px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:border-amber-500/50 whitespace-nowrap"
                    title="Alternar coordenadas Global / Local"
                  >
                    <Globe className="h-3.5 w-3.5 text-sky-400" />
                    {snap.transformSpace === 'world' ? 'Global' : 'Local'}
                  </button>

                  <button
                    type="button"
                    onClick={() => engineRef.current?.toggleSnap()}
                    className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                      snap.snapEnabled
                        ? 'border-amber-500/70 bg-amber-500/20 text-amber-300'
                        : 'border-[#252a36] bg-[#161a23] text-slate-300 hover:border-slate-600'
                    }`}
                    title="Alinhar à grade (0.5m / 15°)"
                  >
                    <Magnet className="h-3.5 w-3.5" />
                    Snap
                  </button>

                  <div className="h-5 w-px bg-[#252a36]" />

                  {/* Undo / Redo */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={!snap.canUndo}
                      onClick={() => engineRef.current?.undo()}
                      className="rounded-md border border-[#252a36] bg-[#161a23] p-1.5 text-slate-200 hover:border-amber-500/50 disabled:opacity-35"
                      title="Desfazer (Ctrl+Z)"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={!snap.canRedo}
                      onClick={() => engineRef.current?.redo()}
                      className="rounded-md border border-[#252a36] bg-[#161a23] p-1.5 text-slate-200 hover:border-amber-500/50 disabled:opacity-35"
                      title="Refazer (Ctrl+Y)"
                    >
                      <Redo2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="hidden h-5 w-px bg-[#252a36] lg:block" />

                  {/* Camera Presets */}
                  <div className="hidden items-center gap-1 lg:flex">
                    {(
                      [
                        { id: 'perspective', label: 'Persp' },
                        { id: 'top', label: 'Topo' },
                        { id: 'front', label: 'Frente' },
                        { id: 'side', label: 'Lateral' },
                      ] as const
                    ).map((cam) => (
                      <button
                        key={cam.id}
                        type="button"
                        onClick={() => engineRef.current?.setCameraPreset(cam.id)}
                        className="rounded border border-[#252a36] bg-[#161a23] px-2 py-1 text-[11px] text-slate-300 hover:border-amber-500/50 hover:text-white whitespace-nowrap"
                      >
                        {cam.label}
                      </button>
                    ))}
                    {selectedObject && (
                      <button
                        type="button"
                        onClick={() => engineRef.current?.focusObject(selectedObject.id)}
                        className="flex items-center gap-1 rounded border border-[#252a36] bg-[#161a23] px-2 py-1 text-[11px] text-amber-300 hover:border-amber-500/50 whitespace-nowrap"
                        title="Focar no objeto selecionado (F)"
                      >
                        <Maximize2 className="h-3 w-3" />
                        Focar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        engineRef.current?.applyEnvironmentSettings({
                          showGrid: !snap.environment.showGrid,
                        })
                      }
                      className={`rounded border p-1.5 ${
                        snap.environment.showGrid
                          ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                          : 'border-[#252a36] bg-[#161a23] text-slate-400'
                      }`}
                      title="Mostrar / Ocultar Grade"
                    >
                      <Grid className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Playtest Overlay */}
          <PlaytestOverlay
            hud={snap.playtestHud}
            onToggleCamera={() => engineRef.current?.togglePlaytestCamera()}
            onExitPlaytest={() => engineRef.current?.stopPlaytest()}
          />
        </main>

        {/* Right Inspector */}
        {isEditor && showInspector && (
          <InspectorPanel
            selected={selectedObject}
            allObjects={snap.objects}
            environment={snap.environment}
            playtestSettings={snap.playtestSettings}
            onUpdateTransform={(id, patch) =>
              engineRef.current?.updateObjectTransform(id, patch)
            }
            onSnapToGround={(id) => engineRef.current?.snapObjectToGround(id)}
            onCenterObject={(id) => engineRef.current?.centerObject(id)}
            onNormalizeScale={(id) => engineRef.current?.normalizeObjectScale(id)}
            onResetTransform={(id) => engineRef.current?.resetObjectTransform(id)}
            onUpdateMeta={(id, patch) => engineRef.current?.updateObjectMeta(id, patch)}
            onUpdateMaterial={(id, patch) =>
              engineRef.current?.updateObjectMaterial(id, patch)
            }
            onResetMaterial={(id) => engineRef.current?.resetObjectMaterial(id)}
            onUpdateSubMesh={(entryId, meshUuid, patch) =>
              engineRef.current?.updateSubMesh(entryId, meshUuid, patch)
            }
            onUpdateAnim={(id, patch) => engineRef.current?.updateObjectAnimation(id, patch)}
            onExportSelectedGlb={(id) => void engineRef.current?.exportSelectedAsGlb(id)}
            onApplyEnvPreset={(preset) => engineRef.current?.applyEnvironmentPreset(preset)}
            onUpdateEnv={(patch) => engineRef.current?.applyEnvironmentSettings(patch)}
            onUpdatePlaytest={(patch) => engineRef.current?.updatePlaytestSettings(patch)}
          />
        )}
      </div>

      {/* Modals */}
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onUploadGlb={(file, role) => void engineRef.current?.loadGlbFromFile(file, role)}
        onLoadUrl={(url, role, name) =>
          void engineRef.current?.loadGlbFromUrl(url, role, name)
        }
        onImportJson={(file) => void engineRef.current?.importProjectFromJson(file)}
      />

      <LibraryDrawer
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onAddBuiltin={(id) => void engineRef.current?.addBuiltinAsset(id)}
      />
    </div>
  );
}
