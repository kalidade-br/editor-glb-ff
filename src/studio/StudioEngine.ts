import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { preloadAdamAssets } from '../game/adamAssets';
import { BuildingMaterials } from '../game/buildingPrefabs';
import { CharacterAnimator } from '../game/characterAnimator';
import { CharacterRig, createCharacterRig } from '../game/characterBuilder';
import { createProceduralTextures, ProceduralTextureSet } from '../game/textures';
import {
  CharacterConfig,
  ControlMode,
  GraphicsQuality,
  PlayerStance,
  WEAPONS,
  WeaponId,
  WeaponSlotId,
} from '../game/types';
import {
  buildBuiltinPrefabGroup,
  BUILTIN_CATALOG,
  createBuildingMaterials,
} from './builtinCatalog';
import {
  AssetRole,
  BuiltinAssetId,
  CameraPreset,
  DEFAULT_ENVIRONMENT,
  DEFAULT_MATERIAL_OVERRIDE,
  DEFAULT_PLAYTEST_SETTINGS,
  EnvironmentPreset,
  EnvironmentSettings,
  MaterialOverride,
  PlaytestHudState,
  PlaytestSettings,
  PlaytestWeaponSlot,
  SceneObjectMeta,
  SerializedSceneObject,
  StudioProjectFile,
  StudioSnapshot,
  SubMeshInfo,
  TransformMode,
  TransformSpace,
} from './types';

interface OrigMatSnapshot {
  colorHex: string;
  roughness: number;
  metalness: number;
  emissiveHex: string;
  emissiveIntensity: number;
  wireframe: boolean;
  side: THREE.Side;
}

interface SceneEntry {
  id: string;
  name: string;
  role: AssetRole;
  sourceType: 'file' | 'url' | 'builtin';
  sourceUrl?: string;
  builtinId?: BuiltinAssetId;
  fileName?: string;
  rawBuffer?: ArrayBuffer;
  root: THREE.Group; // Wrapper transform node added to editorObjectsGroup
  content: THREE.Object3D; // Loaded model or prefab child inside root
  visible: boolean;
  locked: boolean;
  collisionEnabled: boolean;
  walkableEnabled: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  animations: THREE.AnimationClip[];
  mixer: THREE.AnimationMixer | null;
  activeAnimIndex: number;
  animPlaying: boolean;
  animLoop: boolean;
  animSpeed: number;
  materialOverride: MaterialOverride;
  meshCount: number;
  triangleCount: number;
  dimensions: [number, number, number];
}

interface TransformSnapshot {
  position: [number, number, number];
  rotationDeg: [number, number, number];
  scale: [number, number, number];
}

interface UndoAction {
  label: string;
  undo: () => void;
  redo: () => void;
}

interface TracerBeam {
  line: THREE.Line;
  impactMesh: THREE.Mesh;
  ttl: number;
}

// Pre-allocated math helpers for zero-GC playtest & render loops
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3C = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _downVec = new THREE.Vector3(0, -1, 0);
const _camForward = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _box3 = new THREE.Box3();
const _mouseNdc = new THREE.Vector2();

const DEFAULT_PLAYTEST_CHAR: CharacterConfig = {
  id: 'studio_tester',
  name: 'Tester',
  modelId: 'adam',
  skinColor: '#d9a47e',
  hairStyle: 'buzz',
  hairColor: '#1f1b18',
  shirtStyle: 'tee',
  shirtColor: '#e2e8f0',
  pantsColor: '#293241',
  vestEnabled: false,
  vestColor: '#3d4534',
  backpackEnabled: true,
  shoesColor: '#111827',
};

function uid(prefix = 'obj'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36).slice(-4)}`;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function normalizeRemoteGlbUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  // Convert github.com/user/repo/blob/branch/path -> raw.githubusercontent.com/user/repo/branch/path
  const ghBlobMatch = trimmed.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i,
  );
  if (ghBlobMatch) {
    return `https://raw.githubusercontent.com/${ghBlobMatch[1]}/${ghBlobMatch[2]}/${ghBlobMatch[3]}/${ghBlobMatch[4]}`;
  }
  return trimmed;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

const PLAYTEST_PREFS_STORAGE_KEY = 'studio3d_playtest_prefs_v1';

interface SavedPlaytestPrefs {
  quality?: GraphicsQuality;
  controlMode?: ControlMode;
  generalSensitivity?: number;
  aimSensitivity?: number;
  scopeSensitivity?: number;
  invertY?: boolean;
  slot1Weapon?: WeaponId;
  slot2Weapon?: WeaponId;
  slot3Weapon?: WeaponId;
}

function loadPlaytestPrefs(): SavedPlaytestPrefs {
  try {
    const raw = window.localStorage.getItem(PLAYTEST_PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SavedPlaytestPrefs;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function savePlaytestPrefs(settings: PlaytestSettings): void {
  try {
    const payload: SavedPlaytestPrefs = {
      quality: settings.quality,
      controlMode: settings.controlMode,
      generalSensitivity: settings.generalSensitivity,
      aimSensitivity: settings.aimSensitivity,
      scopeSensitivity: settings.scopeSensitivity,
      invertY: settings.invertY,
      slot1Weapon: settings.slot1Weapon,
      slot2Weapon: settings.slot2Weapon,
      slot3Weapon: settings.slot3Weapon,
    };
    window.localStorage.setItem(PLAYTEST_PREFS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota / private mode issues
  }
}

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class StudioEngine {
  private container: HTMLElement;
  private onSnapshot: (snap: StudioSnapshot) => void;
  private isSoftwareGl: boolean;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private orbitControls: OrbitControls;
  private transformControls: TransformControls;

  private textures: ProceduralTextureSet;
  private buildingMats: BuildingMaterials;
  private gltfLoader: GLTFLoader;
  private dracoLoader: DRACOLoader;
  private exporter: GLTFExporter;
  private raycaster: THREE.Raycaster;

  // Lighting & environment nodes
  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private groundMesh: THREE.Mesh;
  private gridHelper: THREE.GridHelper;
  private selectionBoxHelper: THREE.Box3Helper;

  private editorObjectsGroup: THREE.Group;
  private playtestGroup: THREE.Group;

  private entries: SceneEntry[] = [];
  private selectedId: string | null = null;
  private mode: 'editor' | 'playtest' = 'editor';
  private transformMode: TransformMode = 'translate';
  private transformSpace: TransformSpace = 'world';
  private snapEnabled = false;
  private translateSnap = 0.5;
  private rotateSnapDeg = 15;

  private environment: EnvironmentSettings = { ...DEFAULT_ENVIRONMENT };
  private playtestSettings: PlaytestSettings = { ...DEFAULT_PLAYTEST_SETTINGS };

  // Undo / Redo
  private undoStack: UndoAction[] = [];
  private redoStack: UndoAction[] = [];
  private dragStartTransform: TransformSnapshot | null = null;

  // Status / Loading
  private isLoading = false;
  private loadingMessage = '';
  private errorMessage: string | null = null;
  private statusMessage: string | null = null;
  private statusTimer = 0;

  // Render loop & pointer tracking
  private frameId = 0;
  private disposed = false;
  private lastTimeMs = performance.now();
  private pointerDownPos = { x: 0, y: 0 };
  private cameraLerpActive = false;
  private cameraLerpPos = new THREE.Vector3();
  private cameraLerpTarget = new THREE.Vector3();

  // Playtest runtime state
  private keys = new Set<string>();
  private playerRig: CharacterRig | null = null;
  private customPlayerObject: THREE.Object3D | null = null;
  private customPlayerMixer: THREE.AnimationMixer | null = null;
  private playerAnimator = new CharacterAnimator();
  private playerPos = new THREE.Vector3(0, 0, 5);
  private playerVel = new THREE.Vector3();
  private playerYaw = Math.PI; // facing -Z toward origin
  private camYaw = Math.PI;
  private camPitch = 0.24;
  private stance: PlayerStance = 'stand';
  private isGrounded = true;
  private isSprintingState = false;
  private isAiming = false;
  private isFiring = false;
  private isReloading = false;
  private reloadElapsed = 0;
  private reloadDuration = 0.36;
  private fireCooldown = 0;
  private pointerLocked = false;
  private playtestDragLook = false;
  private lastPlaytestDragPos = { x: 0, y: 0 };
  private mobileMoveX = 0;
  private mobileMoveY = 0;
  private mobileSprintLock = false;
  private playtestSlots: Record<1 | 2 | 3, PlaytestWeaponSlot> = {
    1: {
      weaponId: DEFAULT_PLAYTEST_SETTINGS.slot1Weapon,
      ammoInMag: WEAPONS[DEFAULT_PLAYTEST_SETTINGS.slot1Weapon].magSize,
      magSize: WEAPONS[DEFAULT_PLAYTEST_SETTINGS.slot1Weapon].magSize,
    },
    2: {
      weaponId: DEFAULT_PLAYTEST_SETTINGS.slot2Weapon,
      ammoInMag: WEAPONS[DEFAULT_PLAYTEST_SETTINGS.slot2Weapon].magSize,
      magSize: WEAPONS[DEFAULT_PLAYTEST_SETTINGS.slot2Weapon].magSize,
    },
    3: {
      weaponId: DEFAULT_PLAYTEST_SETTINGS.slot3Weapon,
      ammoInMag: WEAPONS[DEFAULT_PLAYTEST_SETTINGS.slot3Weapon].magSize,
      magSize: WEAPONS[DEFAULT_PLAYTEST_SETTINGS.slot3Weapon].magSize,
    },
  };
  private walkableMeshes: THREE.Object3D[] = [];
  private collisionMeshes: THREE.Object3D[] = [];
  private tracers: TracerBeam[] = [];
  private fpsAccum = 0;
  private fpsFrames = 0;
  private currentFps = 60;
  private lastHitDistance: number | null = null;
  private lastHitMeshName: string | null = null;
  private hudThrottleTimer = 0;

  // Event handler refs for cleanup
  private resizeObserver: ResizeObserver;
  private boundHandlers: {
    onPointerDown: (e: PointerEvent) => void;
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
    onWheel: (e: WheelEvent) => void;
    onKeyDown: (e: KeyboardEvent) => void;
    onKeyUp: (e: KeyboardEvent) => void;
    onPointerLockChange: () => void;
    onContextMenu: (e: MouseEvent) => void;
    onWebglLost: (e: Event) => void;
    onWebglRestored: () => void;
  };

  constructor(container: HTMLElement, onSnapshot: (snap: StudioSnapshot) => void) {
    this.container = container;
    this.onSnapshot = onSnapshot;
    this.isSoftwareGl = detectSoftwareWebGL();

    const w = Math.max(320, container.clientWidth || window.innerWidth);
    const h = Math.max(240, container.clientHeight || window.innerHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.environment.exposure;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.environment.skyColor);
    this.scene.fog = new THREE.FogExp2(this.environment.skyColor, this.environment.fogDensity);

    // Studio IBL environment
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 4000);
    this.camera.position.set(14, 10, 18);

    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = !this.isSoftwareGl;
    this.orbitControls.dampingFactor = 0.08;
    this.orbitControls.maxDistance = 1500;
    this.orbitControls.target.set(0, 1.5, 0);
    this.orbitControls.addEventListener('start', () => {
      this.cameraLerpActive = false;
    });

    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setMode('translate');
    this.transformControls.setSpace('world');
    this.scene.add(this.transformControls.getHelper());

    this.transformControls.addEventListener('dragging-changed', (event) => {
      const dragging = Boolean((event as { value?: unknown }).value);
      this.orbitControls.enabled = !dragging;
      if (dragging) {
        const entry = this.getSelectedEntry();
        if (entry) {
          this.dragStartTransform = this.captureTransform(entry);
        }
      } else {
        const entry = this.getSelectedEntry();
        if (entry && this.dragStartTransform) {
          const after = this.captureTransform(entry);
          const before = this.dragStartTransform;
          this.dragStartTransform = null;
          if (JSON.stringify(before) !== JSON.stringify(after)) {
            this.pushUndo({
              label: `Transformar ${entry.name}`,
              undo: () => this.applyTransformSnapshot(entry.id, before),
              redo: () => this.applyTransformSnapshot(entry.id, after),
            });
          }
          this.recomputeEntryStats(entry);
          this.updateSelectionHelper();
          this.emitSnapshot();
        }
      }
    });

    this.transformControls.addEventListener('objectChange', () => {
      const entry = this.getSelectedEntry();
      if (entry) {
        this.updateSelectionHelper();
      }
    });

    // Lighting rig
    this.hemiLight = new THREE.HemisphereLight(0xc2dcff, 0x2d333d, 0.72);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff4df, this.environment.sunIntensity);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 260;
    const d = 55;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.rimLight = new THREE.DirectionalLight(0x93c5fd, 0.55);
    this.rimLight.position.set(-28, 18, -32);
    this.scene.add(this.rimLight);

    // Textures & Prefab materials
    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());
    this.buildingMats = createBuildingMaterials(this.textures);

    // Ground plane & Grid
    const groundGeo = new THREE.PlaneGeometry(600, 600);
    const groundMat = new THREE.MeshStandardMaterial({
      color: this.environment.groundColor,
      roughness: 0.92,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.y = -0.005;
    this.groundMesh.receiveShadow = true;
    this.groundMesh.name = '__StudioGround';
    this.scene.add(this.groundMesh);

    this.gridHelper = new THREE.GridHelper(240, 120, 0x475569, 0x262d38);
    this.gridHelper.position.y = 0.002;
    const gridMats = Array.isArray(this.gridHelper.material)
      ? this.gridHelper.material
      : [this.gridHelper.material];
    gridMats.forEach((m) => {
      m.transparent = true;
      m.opacity = 0.52;
    });
    this.scene.add(this.gridHelper);

    this.editorObjectsGroup = new THREE.Group();
    this.editorObjectsGroup.name = 'StudioSceneRoot';
    this.scene.add(this.editorObjectsGroup);

    this.playtestGroup = new THREE.Group();
    this.playtestGroup.name = 'StudioPlaytestRoot';
    this.scene.add(this.playtestGroup);

    this.selectionBoxHelper = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(0xf59e0b));
    this.selectionBoxHelper.visible = false;
    this.scene.add(this.selectionBoxHelper);

    // Loaders & Exporter
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    this.exporter = new GLTFExporter();
    this.raycaster = new THREE.Raycaster();

    const savedPrefs = loadPlaytestPrefs();
    this.playtestSettings = {
      ...DEFAULT_PLAYTEST_SETTINGS,
      ...savedPrefs,
    };
    this.playtestSettings.weaponId = this.getWeaponForSlot(this.playtestSettings.activeSlot);
    this.resetPlaytestAmmo();

    this.applyEnvironmentSettings(this.environment, false);
    this.applyGraphicsQuality(this.playtestSettings.quality);

    // Bind events
    this.boundHandlers = {
      onPointerDown: this.handlePointerDown.bind(this),
      onPointerMove: this.handlePointerMove.bind(this),
      onPointerUp: this.handlePointerUp.bind(this),
      onWheel: this.handleWheel.bind(this),
      onKeyDown: this.handleKeyDown.bind(this),
      onKeyUp: this.handleKeyUp.bind(this),
      onPointerLockChange: this.handlePointerLockChange.bind(this),
      onContextMenu: (e: MouseEvent) => {
        if (this.mode === 'playtest') e.preventDefault();
      },
      onWebglLost: (e: Event) => {
        e.preventDefault();
        this.errorMessage = 'Contexto WebGL perdido. Tentando restaurar...';
        this.emitSnapshot();
      },
      onWebglRestored: () => {
        this.errorMessage = null;
        this.emitSnapshot();
      },
    };

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.boundHandlers.onPointerDown);
    dom.addEventListener('pointermove', this.boundHandlers.onPointerMove);
    dom.addEventListener('pointerup', this.boundHandlers.onPointerUp);
    dom.addEventListener('wheel', this.boundHandlers.onWheel, { passive: true });
    dom.addEventListener('contextmenu', this.boundHandlers.onContextMenu);
    dom.addEventListener('webglcontextlost', this.boundHandlers.onWebglLost);
    dom.addEventListener('webglcontextrestored', this.boundHandlers.onWebglRestored);
    window.addEventListener('keydown', this.boundHandlers.onKeyDown);
    window.addEventListener('keyup', this.boundHandlers.onKeyUp);
    document.addEventListener('pointerlockchange', this.boundHandlers.onPointerLockChange);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    // Preload Adam/Eva assets in background for Playtest character rig
    preloadAdamAssets().catch(() => {});

    // Populate initial starter scene so viewport is alive and immediately testable
    void this.seedStarterScene();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.startLoop();
  }

  private async seedStarterScene(): Promise<void> {
    await this.addBuiltinAsset('spawn_point', [0, 0, 8], false);
    await this.addBuiltinAsset('house_god', [0, 0, -4], false);
    await this.addBuiltinAsset('container_blue', [9, 0, 2], false);
    this.selectObject(null);
    this.emitSnapshot();
  }

  private handleResize(): void {
    if (this.disposed) return;
    const w = Math.max(320, this.container.clientWidth || window.innerWidth);
    const h = Math.max(240, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTimeMs) / 1000));
      this.lastTimeMs = now;

      this.fpsAccum += dt;
      this.fpsFrames += 1;
      if (this.fpsAccum >= 0.4) {
        this.currentFps = Math.round(this.fpsFrames / this.fpsAccum);
        this.fpsAccum = 0;
        this.fpsFrames = 0;
      }

      if (this.statusTimer > 0) {
        this.statusTimer -= dt;
        if (this.statusTimer <= 0) {
          this.statusMessage = null;
          this.emitSnapshot();
        }
      }

      // Advance active object animations in editor mode
      for (let i = 0; i < this.entries.length; i++) {
        const e = this.entries[i];
        if (e.mixer && e.animPlaying) {
          e.mixer.update(dt * e.animSpeed);
        }
      }

      if (this.mode === 'editor') {
        if (this.cameraLerpActive) {
          const alpha = 1 - Math.exp(-8 * dt);
          this.camera.position.lerp(this.cameraLerpPos, alpha);
          this.orbitControls.target.lerp(this.cameraLerpTarget, alpha);
          if (
            this.camera.position.distanceTo(this.cameraLerpPos) < 0.05 &&
            this.orbitControls.target.distanceTo(this.cameraLerpTarget) < 0.05
          ) {
            this.cameraLerpActive = false;
          }
        }
        this.orbitControls.update();
      } else {
        this.updatePlaytest(dt);
      }

      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(tick, 16);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl.fenceSync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  // ==========================
  // Loading GLB / GLTF / Prefabs
  // ==========================

  public async loadGlbFromFile(file: File, role: AssetRole = 'asset'): Promise<void> {
    this.setLoading(true, `Carregando ${file.name}...`);
    try {
      const buffer = await file.arrayBuffer();
      const gltf = await this.parseGlbBuffer(buffer);
      const baseName = file.name.replace(/\.(glb|gltf)$/i, '');
      const entry = this.registerLoadedObject({
        name: baseName,
        role,
        sourceType: 'file',
        fileName: file.name,
        rawBuffer: buffer,
        content: gltf.scene,
        animations: gltf.animations ?? [],
        autoGround: true,
      });
      this.selectObject(entry.id);
      this.focusObject(entry.id);
      this.showStatus(`Modelo "${entry.name}" importado na cena.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido ao ler arquivo .glb';
      this.errorMessage = `Falha ao carregar "${file.name}": ${msg}`;
    } finally {
      this.setLoading(false);
      this.emitSnapshot();
    }
  }

  public async loadGlbFromUrl(
    rawUrl: string,
    role: AssetRole = 'asset',
    customName?: string,
  ): Promise<void> {
    const url = normalizeRemoteGlbUrl(rawUrl);
    if (!url) {
      this.errorMessage = 'Informe um link válido para o modelo .glb / .gltf.';
      this.emitSnapshot();
      return;
    }

    this.setLoading(true, 'Baixando modelo 3D pelo link...');
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} (${res.statusText || 'Erro ao baixar'})`);
      }
      const buffer = await res.arrayBuffer();
      const gltf = await this.parseGlbBuffer(buffer, this.getBaseDir(url));

      const guessedName =
        customName?.trim() ||
        decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'Modelo_Link').replace(
          /\.(glb|gltf)$/i,
          '',
        );

      const entry = this.registerLoadedObject({
        name: guessedName,
        role,
        sourceType: 'url',
        sourceUrl: url,
        content: gltf.scene,
        animations: gltf.animations ?? [],
        autoGround: true,
      });
      this.selectObject(entry.id);
      this.focusObject(entry.id);
      this.showStatus(`Modelo "${entry.name}" carregado via link.`);
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const corsHint = /Failed to fetch|NetworkError|CORS/i.test(rawMsg)
        ? ' O servidor do link pode estar bloqueando CORS. Tente um link raw do GitHub, HuggingFace ou faça upload do arquivo .glb.'
        : '';
      this.errorMessage = `Não foi possível carregar o link: ${rawMsg}.${corsHint}`;
    } finally {
      this.setLoading(false);
      this.emitSnapshot();
    }
  }

  public async addBuiltinAsset(
    builtinId: BuiltinAssetId,
    pos: [number, number, number] = [0, 0, 0],
    recordUndo = true,
  ): Promise<void> {
    const item = BUILTIN_CATALOG.find((c) => c.id === builtinId);
    if (!item) return;

    if (item.glbUrl) {
      this.setLoading(true, `Carregando ${item.name}...`);
      try {
        const res = await fetch(item.glbUrl);
        const buffer = await res.arrayBuffer();
        const gltf = await this.parseGlbBuffer(buffer, '/assets/models/');
        // Scale ff_adam / ff_eva cleanly to human 1.78m height
        if (builtinId === 'ff_adam' || builtinId === 'ff_eva') {
          gltf.scene.scale.setScalar(1.78);
        }
        const entry = this.registerLoadedObject({
          name: item.name.replace(' (.glb)', ''),
          role: item.role,
          sourceType: 'builtin',
          builtinId,
          sourceUrl: item.glbUrl,
          content: gltf.scene,
          animations: gltf.animations ?? [],
          position: pos,
          autoGround: true,
          recordUndo,
        });
        this.selectObject(entry.id);
        this.showStatus(`"${entry.name}" adicionado à cena.`);
      } catch (err) {
        this.errorMessage = `Erro ao carregar ${item.name}: ${String(err)}`;
      } finally {
        this.setLoading(false);
        this.emitSnapshot();
      }
      return;
    }

    const group = buildBuiltinPrefabGroup(builtinId, this.textures, this.buildingMats);
    const entry = this.registerLoadedObject({
      name: item.name,
      role: item.role,
      sourceType: 'builtin',
      builtinId,
      content: group,
      animations: [],
      position: pos,
      autoGround: false,
      recordUndo,
    });
    if (recordUndo) {
      this.selectObject(entry.id);
      this.showStatus(`"${entry.name}" adicionado à cena.`);
    }
    this.emitSnapshot();
  }

  private getBaseDir(url: string): string {
    const idx = url.lastIndexOf('/');
    return idx >= 0 ? url.slice(0, idx + 1) : '';
  }

  private parseGlbBuffer(
    buffer: ArrayBuffer,
    resourcePath = '',
  ): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.parse(
        buffer,
        resourcePath,
        (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations ?? [] }),
        (err) => reject(err),
      );
    });
  }

  private registerLoadedObject(opts: {
    id?: string;
    name: string;
    role: AssetRole;
    sourceType: 'file' | 'url' | 'builtin';
    sourceUrl?: string;
    builtinId?: BuiltinAssetId;
    fileName?: string;
    rawBuffer?: ArrayBuffer;
    content: THREE.Object3D;
    animations: THREE.AnimationClip[];
    position?: [number, number, number];
    rotationDeg?: [number, number, number];
    scale?: [number, number, number];
    autoGround?: boolean;
    recordUndo?: boolean;
  }): SceneEntry {
    const root = new THREE.Group();
    const id = opts.id || uid('obj');
    root.name = opts.name;
    root.userData.studioEntryId = id;

    this.prepareContentMeshes(opts.content, id);
    root.add(opts.content);

    if (opts.position) {
      root.position.set(...opts.position);
    }
    if (opts.rotationDeg) {
      root.rotation.set(
        degToRad(opts.rotationDeg[0]),
        degToRad(opts.rotationDeg[1]),
        degToRad(opts.rotationDeg[2]),
      );
    }
    if (opts.scale) {
      root.scale.set(...opts.scale);
    }

    if (opts.autoGround) {
      root.updateMatrixWorld(true);
      _box3.setFromObject(root);
      if (!_box3.isEmpty() && isFinite(_box3.min.y)) {
        root.position.y -= _box3.min.y;
      }
    }

    this.editorObjectsGroup.add(root);

    let mixer: THREE.AnimationMixer | null = null;
    if (opts.animations.length > 0) {
      mixer = new THREE.AnimationMixer(opts.content);
      const firstAction = mixer.clipAction(opts.animations[0]);
      firstAction.play();
    }

    const isSpawn = opts.role === 'spawn';
    const entry: SceneEntry = {
      id,
      name: opts.name,
      role: opts.role,
      sourceType: opts.sourceType,
      sourceUrl: opts.sourceUrl,
      builtinId: opts.builtinId,
      fileName: opts.fileName,
      rawBuffer: opts.rawBuffer,
      root,
      content: opts.content,
      visible: true,
      locked: false,
      collisionEnabled: !isSpawn && opts.role !== 'weapon',
      walkableEnabled: !isSpawn && opts.role !== 'weapon',
      castShadow: true,
      receiveShadow: true,
      animations: opts.animations,
      mixer,
      activeAnimIndex: 0,
      animPlaying: opts.animations.length > 0,
      animLoop: true,
      animSpeed: 1,
      materialOverride: { ...DEFAULT_MATERIAL_OVERRIDE },
      meshCount: 0,
      triangleCount: 0,
      dimensions: [1, 1, 1],
    };

    this.recomputeEntryStats(entry);
    this.entries.push(entry);

    if (opts.recordUndo !== false) {
      this.pushUndo({
        label: `Adicionar ${entry.name}`,
        undo: () => this.detachEntryWithoutDispose(entry.id),
        redo: () => this.reattachEntry(entry),
      });
    }

    return entry;
  }

  private prepareContentMeshes(obj: THREE.Object3D, entryId: string): void {
    obj.traverse((child) => {
      child.userData.studioEntryId = entryId;
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;

      // Clone materials so each placed instance can be edited independently
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => m.clone());
      } else if (mesh.material) {
        mesh.material = mesh.material.clone();
      }

      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (mat) {
        const std = mat as THREE.MeshStandardMaterial;
        if (std.map) {
          std.map.colorSpace = THREE.SRGBColorSpace;
          std.map.needsUpdate = true;
        }
        if (!mesh.userData.__origMat) {
          const orig: OrigMatSnapshot = {
            colorHex: std.color ? `#${std.color.getHexString()}` : '#ffffff',
            roughness: typeof std.roughness === 'number' ? std.roughness : 0.7,
            metalness: typeof std.metalness === 'number' ? std.metalness : 0.05,
            emissiveHex: std.emissive ? `#${std.emissive.getHexString()}` : '#000000',
            emissiveIntensity: typeof std.emissiveIntensity === 'number' ? std.emissiveIntensity : 0,
            wireframe: Boolean(std.wireframe),
            side: std.side ?? THREE.FrontSide,
          };
          mesh.userData.__origMat = orig;
        }
      }
    });
  }

  private recomputeEntryStats(entry: SceneEntry): void {
    let meshes = 0;
    let tris = 0;
    entry.root.traverse((child) => {
      const m = child as THREE.Mesh;
      if (!m.isMesh) return;
      meshes += 1;
      const geo = m.geometry;
      if (geo) {
        if (geo.index) {
          tris += Math.round(geo.index.count / 3);
        } else if (geo.attributes.position) {
          tris += Math.round(geo.attributes.position.count / 3);
        }
      }
    });
    entry.root.updateMatrixWorld(true);
    _box3.setFromObject(entry.root);
    const size = _box3.isEmpty()
      ? _vec3A.set(0, 0, 0)
      : _box3.getSize(_vec3A);
    entry.meshCount = meshes;
    entry.triangleCount = tris;
    entry.dimensions = [round3(size.x), round3(size.y), round3(size.z)];
  }

  // ==========================
  // Selection, Gizmo & Transforms
  // ==========================

  public selectObject(id: string | null): void {
    this.selectedId = id;
    const entry = this.getSelectedEntry();
    if (entry && !entry.locked && this.transformMode !== 'select' && this.mode === 'editor') {
      this.transformControls.attach(entry.root);
    } else {
      this.transformControls.detach();
    }
    this.updateSelectionHelper();
    this.emitSnapshot();
  }

  private getSelectedEntry(): SceneEntry | null {
    if (!this.selectedId) return null;
    return this.entries.find((e) => e.id === this.selectedId) ?? null;
  }

  private updateSelectionHelper(): void {
    const entry = this.getSelectedEntry();
    if (!entry || this.mode !== 'editor' || !entry.visible) {
      this.selectionBoxHelper.visible = false;
      return;
    }
    entry.root.updateMatrixWorld(true);
    _box3.setFromObject(entry.root);
    if (_box3.isEmpty()) {
      this.selectionBoxHelper.visible = false;
      return;
    }
    this.selectionBoxHelper.box.copy(_box3);
    this.selectionBoxHelper.visible = true;
  }

  public setTransformMode(mode: TransformMode): void {
    this.transformMode = mode;
    if (mode === 'select') {
      this.transformControls.detach();
    } else {
      this.transformControls.setMode(mode);
      const entry = this.getSelectedEntry();
      if (entry && !entry.locked && this.mode === 'editor') {
        this.transformControls.attach(entry.root);
      }
    }
    this.emitSnapshot();
  }

  public setTransformSpace(space: TransformSpace): void {
    this.transformSpace = space;
    this.transformControls.setSpace(space);
    this.emitSnapshot();
  }

  public toggleSnap(): void {
    this.snapEnabled = !this.snapEnabled;
    this.transformControls.setTranslationSnap(this.snapEnabled ? this.translateSnap : null);
    this.transformControls.setRotationSnap(
      this.snapEnabled ? degToRad(this.rotateSnapDeg) : null,
    );
    this.transformControls.setScaleSnap(this.snapEnabled ? 0.1 : null);
    this.emitSnapshot();
  }

  public updateObjectTransform(
    id: string,
    patch: Partial<{
      position: [number, number, number];
      rotationDeg: [number, number, number];
      scale: [number, number, number];
    }>,
    recordUndo = true,
  ): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry || entry.locked) return;

    const before = this.captureTransform(entry);
    if (patch.position) {
      entry.root.position.set(patch.position[0], patch.position[1], patch.position[2]);
    }
    if (patch.rotationDeg) {
      entry.root.rotation.set(
        degToRad(patch.rotationDeg[0]),
        degToRad(patch.rotationDeg[1]),
        degToRad(patch.rotationDeg[2]),
      );
    }
    if (patch.scale) {
      entry.root.scale.set(
        Math.max(0.001, patch.scale[0]),
        Math.max(0.001, patch.scale[1]),
        Math.max(0.001, patch.scale[2]),
      );
    }
    const after = this.captureTransform(entry);

    if (recordUndo && JSON.stringify(before) !== JSON.stringify(after)) {
      this.pushUndo({
        label: `Editar Transform de ${entry.name}`,
        undo: () => this.applyTransformSnapshot(id, before),
        redo: () => this.applyTransformSnapshot(id, after),
      });
    }

    this.recomputeEntryStats(entry);
    this.updateSelectionHelper();
    this.emitSnapshot();
  }

  public snapObjectToGround(id: string): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry || entry.locked) return;
    const before = this.captureTransform(entry);

    entry.root.updateMatrixWorld(true);
    _box3.setFromObject(entry.root);
    if (!_box3.isEmpty()) {
      entry.root.position.y -= _box3.min.y;
    }

    const after = this.captureTransform(entry);
    this.pushUndo({
      label: `Apoiar ${entry.name} no chão`,
      undo: () => this.applyTransformSnapshot(id, before),
      redo: () => this.applyTransformSnapshot(id, after),
    });
    this.recomputeEntryStats(entry);
    this.updateSelectionHelper();
    this.emitSnapshot();
  }

  public centerObject(id: string): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry || entry.locked) return;
    const before = this.captureTransform(entry);

    entry.root.updateMatrixWorld(true);
    _box3.setFromObject(entry.root);
    if (!_box3.isEmpty()) {
      const center = _box3.getCenter(_vec3A);
      entry.root.position.x -= center.x;
      entry.root.position.z -= center.z;
    }

    const after = this.captureTransform(entry);
    this.pushUndo({
      label: `Centralizar ${entry.name}`,
      undo: () => this.applyTransformSnapshot(id, before),
      redo: () => this.applyTransformSnapshot(id, after),
    });
    this.recomputeEntryStats(entry);
    this.updateSelectionHelper();
    this.emitSnapshot();
  }

  public normalizeObjectScale(id: string, targetSizeMeters = 4): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry || entry.locked) return;
    const before = this.captureTransform(entry);

    entry.root.updateMatrixWorld(true);
    _box3.setFromObject(entry.root);
    const size = _box3.getSize(_vec3A);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0.0001) {
      const factor = targetSizeMeters / maxDim;
      entry.root.scale.multiplyScalar(factor);
      entry.root.updateMatrixWorld(true);
      _box3.setFromObject(entry.root);
      entry.root.position.y -= _box3.min.y;
    }

    const after = this.captureTransform(entry);
    this.pushUndo({
      label: `Normalizar escala de ${entry.name}`,
      undo: () => this.applyTransformSnapshot(id, before),
      redo: () => this.applyTransformSnapshot(id, after),
    });
    this.recomputeEntryStats(entry);
    this.updateSelectionHelper();
    this.emitSnapshot();
  }

  public resetObjectTransform(id: string): void {
    this.updateObjectTransform(id, {
      position: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      scale: [1, 1, 1],
    });
  }

  public updateObjectMeta(
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
  ): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return;

    if (patch.name !== undefined) {
      entry.name = patch.name;
      entry.root.name = patch.name;
    }
    if (patch.role !== undefined) entry.role = patch.role;
    if (patch.visible !== undefined) {
      entry.visible = patch.visible;
      entry.root.visible = patch.visible;
    }
    if (patch.locked !== undefined) {
      entry.locked = patch.locked;
      if (entry.locked && this.selectedId === id) {
        this.transformControls.detach();
      } else if (!entry.locked && this.selectedId === id && this.transformMode !== 'select') {
        this.transformControls.attach(entry.root);
      }
    }
    if (patch.collisionEnabled !== undefined) entry.collisionEnabled = patch.collisionEnabled;
    if (patch.walkableEnabled !== undefined) entry.walkableEnabled = patch.walkableEnabled;
    if (patch.castShadow !== undefined || patch.receiveShadow !== undefined) {
      if (patch.castShadow !== undefined) entry.castShadow = patch.castShadow;
      if (patch.receiveShadow !== undefined) entry.receiveShadow = patch.receiveShadow;
      entry.content.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = entry.castShadow;
          m.receiveShadow = entry.receiveShadow;
        }
      });
    }

    this.updateSelectionHelper();
    this.emitSnapshot();
  }

  public updateObjectMaterial(id: string, patch: Partial<MaterialOverride>): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return;

    entry.materialOverride = { ...entry.materialOverride, ...patch };
    const ov = entry.materialOverride;

    entry.content.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const orig = mesh.userData.__origMat as OrigMatSnapshot | undefined;
      for (let i = 0; i < mats.length; i++) {
        const mat = mats[i] as THREE.MeshStandardMaterial;
        if (!mat) continue;
        if (mat.color) {
          mat.color.set(ov.useTint ? ov.tint : orig?.colorHex ?? '#ffffff');
        }
        if (typeof mat.roughness === 'number') {
          mat.roughness = ov.roughness >= 0 ? ov.roughness : orig?.roughness ?? 0.7;
        }
        if (typeof mat.metalness === 'number') {
          mat.metalness = ov.metalness >= 0 ? ov.metalness : orig?.metalness ?? 0.05;
        }
        if (mat.emissive) {
          if (ov.emissiveIntensity > 0) {
            mat.emissive.set(ov.emissiveColor);
            mat.emissiveIntensity = ov.emissiveIntensity;
          } else {
            mat.emissive.set(orig?.emissiveHex ?? '#000000');
            mat.emissiveIntensity = orig?.emissiveIntensity ?? 0;
          }
        }
        mat.wireframe = ov.wireframe || Boolean(orig?.wireframe);
        mat.side = ov.doubleSide ? THREE.DoubleSide : orig?.side ?? THREE.FrontSide;
        mat.needsUpdate = true;
      }
    });
    this.emitSnapshot();
  }

  public resetObjectMaterial(id: string): void {
    this.updateObjectMaterial(id, { ...DEFAULT_MATERIAL_OVERRIDE });
  }

  public updateSubMesh(
    entryId: string,
    meshUuid: string,
    patch: Partial<{ visible: boolean; colorHex: string; roughness: number; metalness: number }>,
  ): void {
    const entry = this.entries.find((e) => e.id === entryId);
    if (!entry) return;
    const target = entry.content.getObjectByProperty('uuid', meshUuid) as THREE.Mesh | undefined;
    if (!target || !target.isMesh) return;

    if (patch.visible !== undefined) target.visible = patch.visible;
    const mat = (Array.isArray(target.material) ? target.material[0] : target.material) as
      | THREE.MeshStandardMaterial
      | undefined;
    if (mat) {
      if (patch.colorHex !== undefined && mat.color) mat.color.set(patch.colorHex);
      if (patch.roughness !== undefined && typeof mat.roughness === 'number') {
        mat.roughness = patch.roughness;
      }
      if (patch.metalness !== undefined && typeof mat.metalness === 'number') {
        mat.metalness = patch.metalness;
      }
      mat.needsUpdate = true;
    }
    this.emitSnapshot();
  }

  public updateObjectAnimation(
    id: string,
    patch: Partial<{
      activeAnimIndex: number;
      animPlaying: boolean;
      animLoop: boolean;
      animSpeed: number;
    }>,
  ): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry || !entry.mixer || entry.animations.length === 0) return;

    if (patch.activeAnimIndex !== undefined) {
      entry.activeAnimIndex = THREE.MathUtils.clamp(
        patch.activeAnimIndex,
        0,
        entry.animations.length - 1,
      );
      entry.mixer.stopAllAction();
      const clip = entry.animations[entry.activeAnimIndex];
      const act = entry.mixer.clipAction(clip);
      act.setLoop(entry.animLoop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      act.clampWhenFinished = !entry.animLoop;
      act.reset().play();
      entry.animPlaying = true;
    }
    if (patch.animLoop !== undefined) {
      entry.animLoop = patch.animLoop;
      const clip = entry.animations[entry.activeAnimIndex];
      if (clip) {
        const act = entry.mixer.clipAction(clip);
        act.setLoop(entry.animLoop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      }
    }
    if (patch.animPlaying !== undefined) {
      entry.animPlaying = patch.animPlaying;
    }
    if (patch.animSpeed !== undefined) {
      entry.animSpeed = patch.animSpeed;
    }
    this.emitSnapshot();
  }

  public duplicateObject(id: string): void {
    const src = this.entries.find((e) => e.id === id);
    if (!src) return;

    const clonedContent = SkeletonUtils.clone(src.content);
    const clonedEntry = this.registerLoadedObject({
      name: `${src.name} (Cópia)`,
      role: src.role,
      sourceType: src.sourceType,
      sourceUrl: src.sourceUrl,
      builtinId: src.builtinId,
      fileName: src.fileName,
      rawBuffer: src.rawBuffer,
      content: clonedContent,
      animations: src.animations,
      position: [
        round3(src.root.position.x + 2),
        round3(src.root.position.y),
        round3(src.root.position.z + 2),
      ],
      rotationDeg: [
        round3(radToDeg(src.root.rotation.x)),
        round3(radToDeg(src.root.rotation.y)),
        round3(radToDeg(src.root.rotation.z)),
      ],
      scale: [round3(src.root.scale.x), round3(src.root.scale.y), round3(src.root.scale.z)],
      autoGround: false,
      recordUndo: true,
    });
    clonedEntry.collisionEnabled = src.collisionEnabled;
    clonedEntry.walkableEnabled = src.walkableEnabled;
    clonedEntry.castShadow = src.castShadow;
    clonedEntry.receiveShadow = src.receiveShadow;
    this.updateObjectMaterial(clonedEntry.id, src.materialOverride);
    this.selectObject(clonedEntry.id);
    this.showStatus(`Duplicado "${src.name}".`);
  }

  public deleteObject(id: string): void {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) return;
    const entry = this.entries[idx];

    this.pushUndo({
      label: `Excluir ${entry.name}`,
      undo: () => this.reattachEntry(entry, idx),
      redo: () => this.detachEntryWithoutDispose(entry.id),
    });

    this.detachEntryWithoutDispose(id);
    this.showStatus(`"${entry.name}" removido da cena.`);
  }

  private detachEntryWithoutDispose(id: string): void {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) return;
    const entry = this.entries[idx];
    this.editorObjectsGroup.remove(entry.root);
    this.entries.splice(idx, 1);
    if (this.selectedId === id) {
      this.selectObject(null);
    } else {
      this.emitSnapshot();
    }
  }

  private reattachEntry(entry: SceneEntry, atIndex?: number): void {
    if (this.entries.some((e) => e.id === entry.id)) return;
    this.editorObjectsGroup.add(entry.root);
    if (typeof atIndex === 'number' && atIndex >= 0 && atIndex <= this.entries.length) {
      this.entries.splice(atIndex, 0, entry);
    } else {
      this.entries.push(entry);
    }
    this.selectObject(entry.id);
  }

  public clearScene(): void {
    if (this.entries.length === 0) return;
    this.transformControls.detach();
    for (let i = 0; i < this.entries.length; i++) {
      this.editorObjectsGroup.remove(this.entries[i].root);
    }
    this.entries = [];
    this.undoStack = [];
    this.redoStack = [];
    this.selectedId = null;
    this.selectionBoxHelper.visible = false;
    this.showStatus('Cena limpa.');
    this.emitSnapshot();
  }

  // ==========================
  // Camera Presets & Focus
  // ==========================

  public focusObject(id: string): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return;
    entry.root.updateMatrixWorld(true);
    _box3.setFromObject(entry.root);
    const center = _box3.isEmpty() ? entry.root.position.clone() : _box3.getCenter(new THREE.Vector3());
    const size = _box3.isEmpty() ? new THREE.Vector3(4, 4, 4) : _box3.getSize(new THREE.Vector3());
    const radius = Math.max(2.5, size.length() * 0.75);

    this.cameraLerpTarget.copy(center);
    this.cameraLerpPos.copy(center).add(new THREE.Vector3(radius, radius * 0.65, radius));
    this.cameraLerpActive = true;
  }

  public setCameraPreset(preset: CameraPreset): void {
    const target = this.getSelectedEntry()
      ? _box3.setFromObject(this.getSelectedEntry()!.root).getCenter(new THREE.Vector3())
      : new THREE.Vector3(0, 1.5, 0);
    const dist = 24;
    this.cameraLerpTarget.copy(target);
    if (preset === 'top') {
      this.cameraLerpPos.set(target.x, target.y + dist * 1.4, target.z + 0.01);
    } else if (preset === 'front') {
      this.cameraLerpPos.set(target.x, target.y + 3, target.z + dist);
    } else if (preset === 'side') {
      this.cameraLerpPos.set(target.x + dist, target.y + 3, target.z);
    } else {
      this.cameraLerpPos.set(target.x + 15, target.y + 10, target.z + 18);
    }
    this.cameraLerpActive = true;
  }

  // ==========================
  // Environment & Presets
  // ==========================

  public applyEnvironmentPreset(preset: EnvironmentPreset): void {
    let next: Partial<EnvironmentSettings> = { preset };
    if (preset === 'daylight') {
      next = {
        ...next,
        sunAzimuthDeg: 42,
        sunElevationDeg: 52,
        sunIntensity: 2.1,
        exposure: 1.08,
        skyColor: '#1a2433',
        groundColor: '#363d47',
        fogDensity: 0.0045,
      };
    } else if (preset === 'sunset') {
      next = {
        ...next,
        sunAzimuthDeg: 215,
        sunElevationDeg: 14,
        sunIntensity: 2.35,
        exposure: 1.05,
        skyColor: '#2a1c22',
        groundColor: '#3a302d',
        fogDensity: 0.006,
      };
    } else if (preset === 'studio') {
      next = {
        ...next,
        sunAzimuthDeg: 35,
        sunElevationDeg: 62,
        sunIntensity: 1.75,
        exposure: 1.0,
        skyColor: '#161920',
        groundColor: '#272c35',
        fogDensity: 0.0025,
      };
    } else if (preset === 'night') {
      next = {
        ...next,
        sunAzimuthDeg: -50,
        sunElevationDeg: 38,
        sunIntensity: 0.95,
        exposure: 0.95,
        skyColor: '#090d16',
        groundColor: '#1a202c',
        fogDensity: 0.0075,
      };
    }
    this.applyEnvironmentSettings(next);
  }

  public applyEnvironmentSettings(patch: Partial<EnvironmentSettings>, emit = true): void {
    this.environment = { ...this.environment, ...patch };
    const env = this.environment;

    const az = degToRad(env.sunAzimuthDeg);
    const el = degToRad(env.sunElevationDeg);
    const sunDist = 75;
    this.keyLight.position.set(
      Math.cos(el) * Math.sin(az) * sunDist,
      Math.sin(el) * sunDist,
      Math.cos(el) * Math.cos(az) * sunDist,
    );
    this.keyLight.intensity = env.sunIntensity;

    if (env.preset === 'sunset') {
      this.keyLight.color.set(0xffb478);
      this.hemiLight.color.set(0xfda4af);
      this.hemiLight.groundColor.set(0x281e24);
    } else if (env.preset === 'night') {
      this.keyLight.color.set(0x9ec5ff);
      this.hemiLight.color.set(0x475569);
      this.hemiLight.groundColor.set(0x0f172a);
    } else {
      this.keyLight.color.set(0xfff4df);
      this.hemiLight.color.set(0xc2dcff);
      this.hemiLight.groundColor.set(0x2d333d);
    }

    this.renderer.toneMappingExposure = env.exposure;
    this.scene.background = new THREE.Color(env.skyColor);
    this.scene.fog = env.fogEnabled ? new THREE.FogExp2(env.skyColor, env.fogDensity) : null;

    this.gridHelper.visible = this.mode === 'editor' && env.showGrid;
    this.groundMesh.visible = env.showGroundPlane;
    (this.groundMesh.material as THREE.MeshStandardMaterial).color.set(env.groundColor);

    if (emit) this.emitSnapshot();
  }

  public applyGraphicsQuality(quality: GraphicsQuality): void {
    const dpr = window.devicePixelRatio || 1;
    const pixelRatio = this.isSoftwareGl
      ? 1
      : quality === 'low'
        ? 1
        : quality === 'medium'
          ? Math.min(dpr, 1.5)
          : Math.min(dpr, 2);
    this.renderer.setPixelRatio(pixelRatio);

    const shadowsOn = !this.isSoftwareGl && quality !== 'low';
    this.renderer.shadowMap.enabled = shadowsOn;
    this.keyLight.castShadow = shadowsOn;

    const mapSize = quality === 'high' ? 2048 : 1024;
    if (this.keyLight.shadow.mapSize.x !== mapSize) {
      this.keyLight.shadow.mapSize.set(mapSize, mapSize);
      this.keyLight.shadow.map?.dispose();
      this.keyLight.shadow.map = null;
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  private getWeaponForSlot(slot: WeaponSlotId): WeaponId | 'none' {
    if (slot === 1) return this.playtestSettings.slot1Weapon;
    if (slot === 2) return this.playtestSettings.slot2Weapon;
    if (slot === 3) return this.playtestSettings.slot3Weapon;
    return 'none';
  }

  private resetPlaytestAmmo(): void {
    const s1 = this.playtestSettings.slot1Weapon;
    const s2 = this.playtestSettings.slot2Weapon;
    const s3 = this.playtestSettings.slot3Weapon;
    this.playtestSlots = {
      1: { weaponId: s1, ammoInMag: WEAPONS[s1].magSize, magSize: WEAPONS[s1].magSize },
      2: { weaponId: s2, ammoInMag: WEAPONS[s2].magSize, magSize: WEAPONS[s2].magSize },
      3: { weaponId: s3, ammoInMag: WEAPONS[s3].magSize, magSize: WEAPONS[s3].magSize },
    };
  }

  private syncRigWeapons(): void {
    if (!this.playerRig) return;
    const active = this.playtestSettings.activeSlot;
    const activeWeapon = this.getWeaponForSlot(active);
    this.playerRig.setWeapon(activeWeapon === 'none' ? null : activeWeapon);

    if (active === 1) {
      this.playerRig.setBackWeapons(this.playtestSettings.slot2Weapon, null);
    } else if (active === 2) {
      this.playerRig.setBackWeapons(this.playtestSettings.slot1Weapon, null);
    } else {
      this.playerRig.setBackWeapons(
        this.playtestSettings.slot1Weapon,
        this.playtestSettings.slot2Weapon,
      );
    }
    this.playerRig.setPistolBackWeapon?.(
      active === 3 ? null : this.playtestSettings.slot3Weapon,
    );
  }

  public updatePlaytestSettings(patch: Partial<PlaytestSettings>): void {
    const prevQuality = this.playtestSettings.quality;
    const next = { ...this.playtestSettings, ...patch };

    // Keep weaponId and slots consistent
    if (patch.slot1Weapon && patch.slot1Weapon !== this.playtestSettings.slot1Weapon) {
      this.playtestSlots[1] = {
        weaponId: patch.slot1Weapon,
        ammoInMag: WEAPONS[patch.slot1Weapon].magSize,
        magSize: WEAPONS[patch.slot1Weapon].magSize,
      };
    }
    if (patch.slot2Weapon && patch.slot2Weapon !== this.playtestSettings.slot2Weapon) {
      this.playtestSlots[2] = {
        weaponId: patch.slot2Weapon,
        ammoInMag: WEAPONS[patch.slot2Weapon].magSize,
        magSize: WEAPONS[patch.slot2Weapon].magSize,
      };
    }
    if (patch.slot3Weapon && patch.slot3Weapon !== this.playtestSettings.slot3Weapon) {
      this.playtestSlots[3] = {
        weaponId: patch.slot3Weapon,
        ammoInMag: WEAPONS[patch.slot3Weapon].magSize,
        magSize: WEAPONS[patch.slot3Weapon].magSize,
      };
    }

    if (patch.weaponId !== undefined && patch.activeSlot === undefined) {
      if (patch.weaponId === 'none') {
        next.activeSlot = 4;
      } else {
        const targetSlot: 1 | 2 | 3 = next.activeSlot === 4 ? 1 : next.activeSlot;
        next.activeSlot = targetSlot;
        if (targetSlot === 1) next.slot1Weapon = patch.weaponId;
        if (targetSlot === 2) next.slot2Weapon = patch.weaponId;
        if (targetSlot === 3) next.slot3Weapon = patch.weaponId;
        this.playtestSlots[targetSlot] = {
          weaponId: patch.weaponId,
          ammoInMag: WEAPONS[patch.weaponId].magSize,
          magSize: WEAPONS[patch.weaponId].magSize,
        };
      }
    }

    this.playtestSettings = next;
    this.playtestSettings.weaponId = this.getWeaponForSlot(this.playtestSettings.activeSlot);

    if (patch.quality && patch.quality !== prevQuality) {
      this.applyGraphicsQuality(patch.quality);
    }

    if (this.mode === 'playtest') {
      this.isReloading = false;
      this.reloadElapsed = 0;
      this.syncRigWeapons();
    }

    savePlaytestPrefs(this.playtestSettings);
    this.emitSnapshot();
  }

  // ==========================
  // Export & Import (.GLB & .JSON)
  // ==========================

  public async exportSceneAsGlb(): Promise<void> {
    if (this.entries.length === 0) {
      this.errorMessage = 'A cena está vazia. Adicione ao menos um modelo antes de exportar.';
      this.emitSnapshot();
      return;
    }

    this.setLoading(true, 'Gerando arquivo .glb da cena completa...');
    try {
      const targets: THREE.Object3D[] = [];
      const perTargetAnims: THREE.AnimationClip[][] = [];
      let hasAnyAnim = false;

      for (const e of this.entries) {
        if (!e.visible || e.role === 'spawn') continue;
        targets.push(e.root);
        perTargetAnims.push(e.animations);
        if (e.animations.length > 0) hasAnyAnim = true;
      }

      if (targets.length === 0) {
        throw new Error('Nenhum modelo visível para exportar.');
      }

      const animOpt = !hasAnyAnim
        ? undefined
        : targets.length === 1
          ? perTargetAnims[0]
          : perTargetAnims;

      const result = await this.exporter.parseAsync(targets, {
        binary: true,
        onlyVisible: true,
        animations: animOpt,
      });

      if (!(result instanceof ArrayBuffer)) {
        throw new Error('Falha ao gerar binário GLB.');
      }

      this.triggerDownload(
        new Blob([result], { type: 'model/gltf-binary' }),
        `cena_studio_${Date.now()}.glb`,
      );
      this.showStatus('Cena completa exportada em .GLB!');
    } catch (err) {
      this.errorMessage = `Erro ao exportar .GLB: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      this.setLoading(false);
      this.emitSnapshot();
    }
  }

  public async exportSelectedAsGlb(id: string): Promise<void> {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return;

    this.setLoading(true, `Exportando ${entry.name}.glb...`);
    try {
      const result = await this.exporter.parseAsync(entry.root, {
        binary: true,
        onlyVisible: true,
        animations: entry.animations.length > 0 ? entry.animations : undefined,
      });
      if (!(result instanceof ArrayBuffer)) {
        throw new Error('Falha ao gerar binário GLB.');
      }
      const safeName = entry.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      this.triggerDownload(new Blob([result], { type: 'model/gltf-binary' }), `${safeName}.glb`);
      this.showStatus(`Asset "${entry.name}.glb" exportado!`);
    } catch (err) {
      this.errorMessage = `Erro ao exportar asset: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      this.setLoading(false);
      this.emitSnapshot();
    }
  }

  public async exportProjectAsJson(): Promise<void> {
    this.setLoading(true, 'Empacotando projeto .json...');
    try {
      const serialized: SerializedSceneObject[] = [];
      for (const e of this.entries) {
        let embeddedGlbBase64: string | undefined;
        if (e.sourceType === 'file') {
          if (e.rawBuffer && e.rawBuffer.byteLength <= 12 * 1024 * 1024) {
            embeddedGlbBase64 = arrayBufferToBase64(e.rawBuffer);
          } else {
            // Re-export geometry cleanly if rawBuffer missing or large
            const bin = await this.exporter.parseAsync(e.content, { binary: true });
            if (bin instanceof ArrayBuffer && bin.byteLength <= 12 * 1024 * 1024) {
              embeddedGlbBase64 = arrayBufferToBase64(bin);
            }
          }
        }
        serialized.push({
          id: e.id,
          name: e.name,
          role: e.role,
          sourceType: e.sourceType,
          sourceUrl: e.sourceUrl,
          builtinId: e.builtinId,
          fileName: e.fileName,
          embeddedGlbBase64,
          visible: e.visible,
          locked: e.locked,
          collisionEnabled: e.collisionEnabled,
          walkableEnabled: e.walkableEnabled,
          castShadow: e.castShadow,
          receiveShadow: e.receiveShadow,
          position: [round3(e.root.position.x), round3(e.root.position.y), round3(e.root.position.z)],
          rotationDeg: [
            round3(radToDeg(e.root.rotation.x)),
            round3(radToDeg(e.root.rotation.y)),
            round3(radToDeg(e.root.rotation.z)),
          ],
          scale: [round3(e.root.scale.x), round3(e.root.scale.y), round3(e.root.scale.z)],
          activeAnimIndex: e.activeAnimIndex,
          animPlaying: e.animPlaying,
          animLoop: e.animLoop,
          animSpeed: e.animSpeed,
          materialOverride: { ...e.materialOverride },
        });
      }

      const project: StudioProjectFile = {
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        environment: { ...this.environment },
        playtestSettings: { ...this.playtestSettings },
        objects: serialized,
      };

      const jsonText = JSON.stringify(project, null, 2);
      this.triggerDownload(
        new Blob([jsonText], { type: 'application/json' }),
        `projeto_studio_${Date.now()}.json`,
      );
      this.showStatus('Projeto salvo em .JSON!');
    } catch (err) {
      this.errorMessage = `Erro ao salvar projeto: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      this.setLoading(false);
      this.emitSnapshot();
    }
  }

  public async importProjectFromJson(file: File): Promise<void> {
    this.setLoading(true, `Importando projeto ${file.name}...`);
    try {
      const text = await file.text();
      const project = JSON.parse(text) as StudioProjectFile;
      if (!project || project.schemaVersion !== 1 || !Array.isArray(project.objects)) {
        throw new Error('Arquivo JSON não é um projeto válido do Studio 3D.');
      }

      this.clearScene();
      if (project.environment) {
        this.applyEnvironmentSettings(project.environment, false);
      }
      if (project.playtestSettings) {
        this.playtestSettings = { ...DEFAULT_PLAYTEST_SETTINGS, ...project.playtestSettings };
      }

      for (const item of project.objects) {
        let content: THREE.Object3D | null = null;
        let animations: THREE.AnimationClip[] = [];
        let rawBuffer: ArrayBuffer | undefined;

        if (item.sourceType === 'builtin' && item.builtinId) {
          const cat = BUILTIN_CATALOG.find((c) => c.id === item.builtinId);
          if (cat?.glbUrl) {
            const res = await fetch(cat.glbUrl);
            const buf = await res.arrayBuffer();
            const gltf = await this.parseGlbBuffer(buf, '/assets/models/');
            if (item.builtinId === 'ff_adam' || item.builtinId === 'ff_eva') {
              gltf.scene.scale.setScalar(1.78);
            }
            content = gltf.scene;
            animations = gltf.animations;
          } else {
            content = buildBuiltinPrefabGroup(item.builtinId, this.textures, this.buildingMats);
          }
        } else if (item.embeddedGlbBase64) {
          rawBuffer = base64ToArrayBuffer(item.embeddedGlbBase64);
          const gltf = await this.parseGlbBuffer(rawBuffer);
          content = gltf.scene;
          animations = gltf.animations;
        } else if (item.sourceUrl) {
          const res = await fetch(item.sourceUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status} ao carregar ${item.sourceUrl}`);
          rawBuffer = await res.arrayBuffer();
          const gltf = await this.parseGlbBuffer(rawBuffer, this.getBaseDir(item.sourceUrl));
          content = gltf.scene;
          animations = gltf.animations;
        }

        if (!content) continue;

        const entry = this.registerLoadedObject({
          id: item.id,
          name: item.name,
          role: item.role,
          sourceType: item.sourceType,
          sourceUrl: item.sourceUrl,
          builtinId: item.builtinId,
          fileName: item.fileName,
          rawBuffer,
          content,
          animations,
          position: item.position,
          rotationDeg: item.rotationDeg,
          scale: item.scale,
          autoGround: false,
          recordUndo: false,
        });

        this.updateObjectMeta(entry.id, {
          visible: item.visible,
          locked: item.locked,
          collisionEnabled: item.collisionEnabled,
          walkableEnabled: item.walkableEnabled,
          castShadow: item.castShadow,
          receiveShadow: item.receiveShadow,
        });
        this.updateObjectMaterial(entry.id, item.materialOverride);
        if (entry.animations.length > 0) {
          this.updateObjectAnimation(entry.id, {
            activeAnimIndex: item.activeAnimIndex,
            animPlaying: item.animPlaying,
            animLoop: item.animLoop,
            animSpeed: item.animSpeed,
          });
        }
      }

      this.showStatus(`Projeto "${file.name}" importado com ${this.entries.length} objeto(s).`);
    } catch (err) {
      this.errorMessage = `Erro ao importar JSON: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      this.setLoading(false);
      this.emitSnapshot();
    }
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ==========================
  // Playtest Mode (Walk, Jump, Aim, Shoot on edited GLBs!)
  // ==========================

  public async startPlaytest(): Promise<void> {
    if (this.mode === 'playtest') return;

    this.mode = 'playtest';
    this.transformControls.detach();
    this.selectionBoxHelper.visible = false;
    this.gridHelper.visible = false;
    this.orbitControls.enabled = false;

    // Hide spawn point markers during playtest
    for (const e of this.entries) {
      if (e.role === 'spawn') {
        e.root.visible = false;
      }
    }

    // Build collision & walkable mesh lists
    this.walkableMeshes = [];
    this.collisionMeshes = [];
    if (this.environment.showGroundPlane) {
      this.walkableMeshes.push(this.groundMesh);
    }
    for (const e of this.entries) {
      if (!e.visible || e.role === 'spawn') continue;
      if (
        this.playtestSettings.playerModel === 'custom' &&
        e.id === this.playtestSettings.customCharacterObjectId
      ) {
        continue; // don't collide with self
      }
      e.root.updateMatrixWorld(true);
      e.root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.visible) return;
        if (e.walkableEnabled) this.walkableMeshes.push(mesh);
        if (e.collisionEnabled) this.collisionMeshes.push(mesh);
      });
    }

    // Determine spawn coordinates
    const spawnEntry = this.entries.find((e) => e.role === 'spawn');
    const spawnX = spawnEntry ? spawnEntry.root.position.x : 0;
    const spawnZ = spawnEntry ? spawnEntry.root.position.z : 8;
    const spawnRotY = spawnEntry ? spawnEntry.root.rotation.y : Math.PI;
    const startY = this.sampleGroundHeight(spawnX, spawnZ, (spawnEntry?.root.position.y ?? 0) + 40);

    this.playerPos.set(spawnX, startY !== null ? startY : 0, spawnZ);
    this.playerVel.set(0, 0, 0);
    this.playerYaw = spawnRotY;
    this.camYaw = spawnRotY + Math.PI;
    this.camPitch = 0.22;
    this.stance = 'stand';
    this.isGrounded = true;
    this.isSprintingState = false;
    this.isAiming = false;
    this.isFiring = false;
    this.isReloading = false;
    this.reloadElapsed = 0;
    this.mobileMoveX = 0;
    this.mobileMoveY = 0;
    this.mobileSprintLock = false;
    this.lastHitDistance = null;
    this.lastHitMeshName = null;
    this.resetPlaytestAmmo();
    this.playtestSettings.weaponId = this.getWeaponForSlot(this.playtestSettings.activeSlot);
    this.playerAnimator.reset();

    // Ensure Adam/Eva GLBs are ready if selected
    if (this.playtestSettings.playerModel !== 'custom') {
      await preloadAdamAssets();
    }

    this.spawnPlaytestCharacter();
    this.updatePlaytestCamera(0.016);
    this.showStatus('Modo Playtest ativo — teste com teclado/mouse ou HUD Mobile.');
    this.emitSnapshot();
  }

  private spawnPlaytestCharacter(): void {
    this.cleanupPlaytestCharacter();

    const customEntry =
      this.playtestSettings.playerModel === 'custom' &&
      this.playtestSettings.customCharacterObjectId
        ? this.entries.find((e) => e.id === this.playtestSettings.customCharacterObjectId)
        : null;

    if (customEntry) {
      const cloned = SkeletonUtils.clone(customEntry.content);
      cloned.scale.copy(customEntry.root.scale);
      cloned.position.set(0, 0, 0);
      this.customPlayerObject = cloned;
      this.playtestGroup.add(cloned);
      if (customEntry.animations.length > 0) {
        this.customPlayerMixer = new THREE.AnimationMixer(cloned);
        const clip = customEntry.animations[customEntry.activeAnimIndex] ?? customEntry.animations[0];
        this.customPlayerMixer.clipAction(clip).play();
      }
      return;
    }

    const cfg: CharacterConfig = {
      ...DEFAULT_PLAYTEST_CHAR,
      modelId: this.playtestSettings.playerModel === 'eva' ? 'eva' : 'adam',
    };
    const rig = createCharacterRig(cfg, this.textures.camoParachute, this.textures.contactShadow);
    this.playerRig = rig;
    this.syncRigWeapons();
    this.playtestGroup.add(rig.root);
  }

  private cleanupPlaytestCharacter(): void {
    if (this.playerRig) {
      this.playtestGroup.remove(this.playerRig.root);
      this.playerRig.dispose();
      this.playerRig = null;
    }
    if (this.customPlayerObject) {
      this.playtestGroup.remove(this.customPlayerObject);
      this.customPlayerObject = null;
    }
    if (this.customPlayerMixer) {
      this.customPlayerMixer.stopAllAction();
      this.customPlayerMixer = null;
    }
  }

  public stopPlaytest(): void {
    if (this.mode !== 'playtest') return;
    this.mode = 'editor';
    this.keys.clear();
    this.isAiming = false;
    this.isFiring = false;
    this.isReloading = false;
    this.reloadElapsed = 0;
    this.isSprintingState = false;
    this.mobileMoveX = 0;
    this.mobileMoveY = 0;
    this.mobileSprintLock = false;
    this.playtestDragLook = false;

    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }

    this.camera.fov = 55;
    this.camera.updateProjectionMatrix();

    this.cleanupPlaytestCharacter();
    for (const tr of this.tracers) {
      this.scene.remove(tr.line);
      this.scene.remove(tr.impactMesh);
      tr.line.geometry.dispose();
      (tr.line.material as THREE.Material).dispose();
      tr.impactMesh.geometry.dispose();
      (tr.impactMesh.material as THREE.Material).dispose();
    }
    this.tracers = [];

    // Restore spawn marker visibility
    for (const e of this.entries) {
      if (e.role === 'spawn') {
        e.root.visible = e.visible;
      }
    }

    this.gridHelper.visible = this.environment.showGrid;
    this.orbitControls.enabled = true;
    const entry = this.getSelectedEntry();
    if (entry && !entry.locked && this.transformMode !== 'select') {
      this.transformControls.attach(entry.root);
    }
    this.updateSelectionHelper();
    this.camera.position.set(
      this.playerPos.x + 12,
      this.playerPos.y + 8,
      this.playerPos.z + 12,
    );
    this.orbitControls.target.copy(this.playerPos).add(new THREE.Vector3(0, 1.5, 0));
    this.orbitControls.update();
    this.showStatus('Voltou ao Editor 3D.');
    this.emitSnapshot();
  }

  public togglePlaytestCamera(): void {
    const next = this.playtestSettings.cameraMode === 'third' ? 'first' : 'third';
    this.playtestSettings = { ...this.playtestSettings, cameraMode: next };
    if (this.playerRig) {
      this.playerRig.root.visible = next === 'third';
    }
    if (this.customPlayerObject) {
      this.customPlayerObject.visible = next === 'third';
    }
    this.emitSnapshot();
  }

  // ==========================
  // Mobile HUD & Playtest Input Actions
  // ==========================

  public setMobileMove(x: number, y: number): void {
    this.mobileMoveX = THREE.MathUtils.clamp(x, -1, 1);
    this.mobileMoveY = THREE.MathUtils.clamp(y, -1, 1);
  }

  private getActiveSensitivityMultiplier(): number {
    const isSniperZoom = this.isAiming && this.playtestSettings.weaponId === 'awm';
    const raw = isSniperZoom
      ? this.playtestSettings.scopeSensitivity
      : this.isAiming
        ? this.playtestSettings.aimSensitivity
        : this.playtestSettings.generalSensitivity;
    return 0.2 + (THREE.MathUtils.clamp(raw, 0, 100) / 100) * 1.8;
  }

  public addPlaytestLookDelta(dx: number, dy: number): void {
    if (this.mode !== 'playtest') return;
    const sens = this.getActiveSensitivityMultiplier();
    const ySign = this.playtestSettings.invertY ? -1 : 1;
    this.camYaw -= dx * 0.0042 * sens;
    this.camPitch = THREE.MathUtils.clamp(
      this.camPitch + dy * 0.0036 * sens * ySign,
      -1.15,
      1.25,
    );
  }

  public setPlaytestFire(firing: boolean): void {
    if (this.mode !== 'playtest') return;
    this.isFiring = firing;
  }

  public setPlaytestAim(aiming: boolean): void {
    if (this.mode !== 'playtest') return;
    this.isAiming = aiming;
    this.emitSnapshot();
  }

  public togglePlaytestAim(): void {
    if (this.mode !== 'playtest') return;
    this.isAiming = !this.isAiming;
    this.emitSnapshot();
  }

  public triggerPlaytestJump(): void {
    if (this.mode !== 'playtest' || !this.isGrounded) return;
    if (this.stance !== 'stand') {
      this.stance = 'stand';
    } else {
      this.playerVel.y = this.playtestSettings.jumpForce;
      this.isGrounded = false;
    }
    this.emitSnapshot();
  }

  public togglePlaytestCrouch(): void {
    if (this.mode !== 'playtest') return;
    this.stance = this.stance === 'crouch' ? 'stand' : 'crouch';
    this.emitSnapshot();
  }

  public togglePlaytestProne(): void {
    if (this.mode !== 'playtest') return;
    this.stance = this.stance === 'prone' ? 'stand' : 'prone';
    this.emitSnapshot();
  }

  public togglePlaytestSprint(): void {
    if (this.mode !== 'playtest') return;
    this.mobileSprintLock = !this.mobileSprintLock;
    if (this.mobileSprintLock && this.stance !== 'stand') {
      this.stance = 'stand';
    }
    this.emitSnapshot();
  }

  public triggerPlaytestReload(): void {
    if (this.mode !== 'playtest' || this.isReloading) return;
    const slot = this.playtestSettings.activeSlot;
    if (slot === 4) return;
    const slotState = this.playtestSlots[slot];
    if (slotState.ammoInMag >= slotState.magSize) return;
    this.isReloading = true;
    this.reloadElapsed = 0;
    this.reloadDuration = WEAPONS[slotState.weaponId].reloadTimeSec;
    this.emitSnapshot();
  }

  public selectPlaytestWeaponSlot(slot: WeaponSlotId): void {
    if (this.playtestSettings.activeSlot === slot) return;
    this.isReloading = false;
    this.reloadElapsed = 0;
    this.isAiming = false;
    this.isFiring = false;
    this.fireCooldown = 0;
    this.playtestSettings = {
      ...this.playtestSettings,
      activeSlot: slot,
      weaponId: this.getWeaponForSlot(slot),
    };
    if (this.mode === 'playtest') {
      this.syncRigWeapons();
    }
    this.emitSnapshot();
  }

  private sampleGroundHeight(x: number, z: number, rayTopY: number): number | null {
    if (this.walkableMeshes.length === 0) {
      return this.environment.showGroundPlane ? 0 : null;
    }

    const offsets: Array<[number, number]> = [
      [0, 0],
      [0.24, 0],
      [-0.24, 0],
      [0, 0.24],
      [0, -0.24],
    ];
    let bestY: number | null = null;
    this.raycaster.near = 0;
    this.raycaster.far = 300;

    for (let i = 0; i < offsets.length; i++) {
      _vec3A.set(x + offsets[i][0], rayTopY, z + offsets[i][1]);
      this.raycaster.set(_vec3A, _downVec);
      const hits = this.raycaster.intersectObjects(this.walkableMeshes, false);
      if (hits.length > 0) {
        const y = hits[0].point.y;
        if (bestY === null || y > bestY) {
          bestY = y;
        }
      }
    }

    if (bestY === null && this.environment.showGroundPlane) {
      return 0;
    }
    return bestY;
  }

  private resolveHorizontalCollision(pos: THREE.Vector3, radius = 0.38): void {
    if (this.collisionMeshes.length === 0) return;

    const heights = [0.48, 1.15];
    this.raycaster.near = 0;
    this.raycaster.far = radius + 0.08;

    for (let hIdx = 0; hIdx < heights.length; hIdx++) {
      const rayY = pos.y + heights[hIdx];
      for (let a = 0; a < 8; a++) {
        const ang = (a * Math.PI) / 4;
        const dx = Math.cos(ang);
        const dz = Math.sin(ang);
        _vec3A.set(pos.x, rayY, pos.z);
        _rayDir.set(dx, 0, dz);
        this.raycaster.set(_vec3A, _rayDir);
        const hits = this.raycaster.intersectObjects(this.collisionMeshes, false);
        if (hits.length > 0 && hits[0].distance < radius) {
          const push = radius - hits[0].distance;
          pos.x -= dx * push;
          pos.z -= dz * push;
        }
      }
    }
  }

  private updatePlaytest(dt: number): void {
    // Movement input (keyboard + mobile virtual joystick)
    let forward = this.mobileMoveY;
    let strafe = this.mobileMoveX;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1;

    // Sprint lock moves forward automatically if user isn't steering backward
    if (this.mobileSprintLock && forward === 0 && strafe === 0) {
      forward = 1;
    }

    const inputLen = Math.hypot(forward, strafe);
    if (inputLen > 1) {
      forward /= inputLen;
      strafe /= inputLen;
    }

    const isMovingInput = inputLen > 0.05;
    const joystickSprint = this.mobileMoveY > 0.85 && Math.hypot(this.mobileMoveX, this.mobileMoveY) > 0.88;
    const keySprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const isSprinting =
      isMovingInput &&
      (keySprint || this.mobileSprintLock || joystickSprint) &&
      this.stance === 'stand' &&
      !this.isAiming;
    this.isSprintingState = isSprinting;

    const baseSpeed = isSprinting
      ? this.playtestSettings.sprintSpeed
      : this.stance === 'crouch'
        ? this.playtestSettings.moveSpeed * 0.58
        : this.stance === 'prone'
          ? this.playtestSettings.moveSpeed * 0.34
          : this.playtestSettings.moveSpeed;

    _camForward.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw)).normalize();
    _camRight.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw)).normalize();
    _moveDir.set(0, 0, 0).addScaledVector(_camForward, forward).addScaledVector(_camRight, strafe);

    const targetVx = _moveDir.x * baseSpeed;
    const targetVz = _moveDir.z * baseSpeed;
    const accel = this.isGrounded ? 16 : 6;
    this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, targetVx, accel, dt);
    this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, targetVz, accel, dt);

    // Jump
    if (this.keys.has('Space') && this.isGrounded) {
      if (this.stance !== 'stand') {
        this.stance = 'stand';
      } else {
        this.playerVel.y = this.playtestSettings.jumpForce;
        this.isGrounded = false;
      }
    }

    // Gravity & movement integration
    this.playerVel.y -= this.playtestSettings.gravity * dt;
    this.playerPos.x += this.playerVel.x * dt;
    this.playerPos.z += this.playerVel.z * dt;
    this.resolveHorizontalCollision(this.playerPos, 0.38);

    const prevY = this.playerPos.y;
    this.playerPos.y += this.playerVel.y * dt;

    // Ground snap / step-up
    const groundY = this.sampleGroundHeight(this.playerPos.x, this.playerPos.z, prevY + 0.9);
    if (groundY !== null && this.playerPos.y <= groundY + 0.02 && this.playerVel.y <= 0.1) {
      if (!this.isGrounded && this.playerVel.y < -3) {
        this.playerAnimator.triggerLanding();
      }
      this.playerPos.y = groundY;
      this.playerVel.y = 0;
      this.isGrounded = true;
    } else if (groundY === null && this.playerPos.y < -40) {
      // Safety respawn if player falls off floating map
      this.playerPos.set(0, 5, 8);
      this.playerVel.set(0, 0, 0);
    } else if (groundY !== null && this.playerPos.y > groundY + 0.12) {
      this.isGrounded = false;
    }

    // Reload progress
    if (this.isReloading) {
      this.reloadElapsed += dt;
      if (this.reloadElapsed >= this.reloadDuration) {
        const slot = this.playtestSettings.activeSlot;
        if (slot !== 4) {
          this.playtestSlots[slot].ammoInMag = this.playtestSlots[slot].magSize;
        }
        this.isReloading = false;
        this.reloadElapsed = 0;
        this.emitSnapshot();
      }
    }

    const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);

    // Character orientation
    let turnDelta = 0;
    if (this.isAiming || this.isFiring || this.playtestSettings.cameraMode === 'first') {
      const targetYaw = this.camYaw + Math.PI;
      const diff = Math.atan2(Math.sin(targetYaw - this.playerYaw), Math.cos(targetYaw - this.playerYaw));
      turnDelta = diff;
      this.playerYaw += diff * Math.min(1, dt * 16);
    } else if (horizSpeed > 0.35) {
      const targetYaw = Math.atan2(this.playerVel.x, this.playerVel.z);
      const diff = Math.atan2(Math.sin(targetYaw - this.playerYaw), Math.cos(targetYaw - this.playerYaw));
      turnDelta = diff;
      this.playerYaw += diff * Math.min(1, dt * 12);
    }

    // Update character visual rig
    if (this.playerRig) {
      this.playerRig.root.position.copy(this.playerPos);
      this.playerRig.root.rotation.y = this.playerYaw;
      this.playerRig.root.visible = this.playtestSettings.cameraMode === 'third';
      this.playerAnimator.update(this.playerRig, {
        dt,
        speed: horizSpeed,
        stance: this.stance,
        isGrounded: this.isGrounded,
        isSprinting,
        isAiming: this.isAiming,
        isFiring: this.isFiring,
        isReloading: this.isReloading,
        isLobby: false,
        isSkydiving: false,
        isParachuting: false,
        isDead: false,
        hasWeapon: this.playtestSettings.weaponId !== 'none',
        turnDeltaRad: turnDelta,
        pitchRad: this.camPitch,
      });
    } else if (this.customPlayerObject) {
      this.customPlayerObject.position.copy(this.playerPos);
      this.customPlayerObject.rotation.y = this.playerYaw;
      this.customPlayerObject.visible = this.playtestSettings.cameraMode === 'third';
      if (this.customPlayerMixer) {
        this.customPlayerMixer.update(dt * (horizSpeed > 0.35 ? 1.2 : 0.6));
      }
    }

    // Weapon test firing
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.isFiring && this.fireCooldown <= 0 && !this.isReloading) {
      const activeSlot = this.playtestSettings.activeSlot;
      if (activeSlot === 4 || this.playtestSettings.weaponId === 'none') {
        this.fireTestShot();
        this.fireCooldown = 0.35;
      } else {
        const slotState = this.playtestSlots[activeSlot];
        if (slotState.ammoInMag > 0) {
          slotState.ammoInMag -= 1;
          this.fireTestShot();
          const def = WEAPONS[slotState.weaponId];
          this.fireCooldown = def.fireRateMs / 1000;
          if (!def.automatic) {
            this.isFiring = false;
          }
          if (slotState.ammoInMag <= 0) {
            this.triggerPlaytestReload();
          }
        } else {
          this.triggerPlaytestReload();
        }
      }
    }

    // Update tracer FX
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.ttl -= dt;
      if (tr.ttl <= 0) {
        this.scene.remove(tr.line);
        this.scene.remove(tr.impactMesh);
        tr.line.geometry.dispose();
        (tr.line.material as THREE.Material).dispose();
        tr.impactMesh.geometry.dispose();
        (tr.impactMesh.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      } else {
        const mat = tr.line.material as THREE.LineBasicMaterial;
        mat.opacity = tr.ttl / 0.25;
      }
    }

    this.updatePlaytestCamera(dt);

    // Throttled HUD snapshot update
    this.hudThrottleTimer += dt;
    if (this.hudThrottleTimer >= 0.08) {
      this.hudThrottleTimer = 0;
      this.emitSnapshot();
    }
  }

  private updatePlaytestCamera(dt: number): void {
    const isSniperZoom = this.isAiming && this.playtestSettings.weaponId === 'awm';
    const targetFov = isSniperZoom ? 18 : this.isAiming ? 42 : 58;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 14, dt);
      this.camera.updateProjectionMatrix();
    }

    const eyeHeight = this.stance === 'crouch' ? 1.08 : this.stance === 'prone' ? 0.45 : 1.56;
    if (this.playtestSettings.cameraMode === 'first' || isSniperZoom) {
      _vec3A.set(this.playerPos.x, this.playerPos.y + eyeHeight, this.playerPos.z);
      this.camera.position.copy(_vec3A);
      _vec3B.set(
        _vec3A.x - Math.sin(this.camYaw) * Math.cos(this.camPitch),
        _vec3A.y - Math.sin(this.camPitch),
        _vec3A.z - Math.cos(this.camYaw) * Math.cos(this.camPitch),
      );
      this.camera.lookAt(_vec3B);
      return;
    }

    // Third-person over-shoulder camera with spring-arm collision
    const pivot = _vec3A.set(this.playerPos.x, this.playerPos.y + eyeHeight, this.playerPos.z);
    const sideOffset = this.isAiming ? 0.65 : 0.42;
    const armDist = this.isAiming ? 2.1 : 3.6;

    const sinY = Math.sin(this.camYaw);
    const cosY = Math.cos(this.camYaw);
    const cosP = Math.cos(this.camPitch);
    const sinP = Math.sin(this.camPitch);

    const rightX = cosY;
    const rightZ = -sinY;

    const desiredCam = _vec3B.set(
      pivot.x + sinY * cosP * armDist + rightX * sideOffset,
      pivot.y + sinP * armDist + 0.15,
      pivot.z + cosY * cosP * armDist + rightZ * sideOffset,
    );

    if (this.collisionMeshes.length > 0) {
      _rayDir.copy(desiredCam).sub(pivot);
      const maxLen = _rayDir.length();
      if (maxLen > 0.01) {
        _rayDir.normalize();
        this.raycaster.near = 0.2;
        this.raycaster.far = maxLen;
        this.raycaster.set(pivot, _rayDir);
        const hits = this.raycaster.intersectObjects(this.collisionMeshes, false);
        if (hits.length > 0) {
          const safeDist = Math.max(0.55, hits[0].distance - 0.25);
          desiredCam.copy(pivot).addScaledVector(_rayDir, safeDist);
        }
      }
    }

    const smooth = 1 - Math.exp(-22 * dt);
    this.camera.position.lerp(desiredCam, smooth);
    _vec3C.set(
      pivot.x - sinY * 12 + rightX * sideOffset * 0.4,
      pivot.y - sinP * 12,
      pivot.z - cosY * 12 + rightZ * sideOffset * 0.4,
    );
    this.camera.lookAt(_vec3C);
  }

  private fireTestShot(): void {
    this.playerAnimator.triggerFire();
    if (this.playtestSettings.weaponId === 'none') {
      this.playerAnimator.triggerPunch();
      return;
    }

    this.raycaster.near = 0.2;
    this.raycaster.far = 350;
    this.raycaster.setFromCamera(_mouseNdc.set(0, 0), this.camera);
    const targets = [...this.collisionMeshes, ...this.walkableMeshes];
    const hits = this.raycaster.intersectObjects(targets, false);

    const startPt = new THREE.Vector3(
      this.playerPos.x + Math.cos(this.camYaw) * 0.25,
      this.playerPos.y + (this.stance === 'crouch' ? 1.0 : 1.42),
      this.playerPos.z - Math.sin(this.camYaw) * 0.25,
    );
    const endPt =
      hits.length > 0
        ? hits[0].point.clone()
        : this.raycaster.ray.origin.clone().addScaledVector(this.raycaster.ray.direction, 120);

    if (hits.length > 0) {
      this.lastHitDistance = round3(hits[0].distance);
      this.lastHitMeshName = hits[0].object.name || 'Malha';
    } else {
      this.lastHitDistance = null;
      this.lastHitMeshName = null;
    }

    const lineGeo = new THREE.BufferGeometry().setFromPoints([startPt, endPt]);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.95,
    });
    const line = new THREE.Line(lineGeo, lineMat);
    this.scene.add(line);

    const impactMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshBasicMaterial({ color: hits.length > 0 ? 0xf59e0b : 0x64748b }),
    );
    impactMesh.position.copy(endPt);
    impactMesh.visible = hits.length > 0;
    this.scene.add(impactMesh);

    this.tracers.push({ line, impactMesh, ttl: 0.25 });
  }

  // ==========================
  // Pointer & Keyboard Handlers
  // ==========================

  private handlePointerDown(e: PointerEvent): void {
    this.pointerDownPos = { x: e.clientX, y: e.clientY };

    if (this.mode === 'playtest') {
      if (e.pointerType === 'touch') {
        // Touch controls are handled by PlaytestOverlay mobile touch layer & HUD buttons
        return;
      }
      if (e.button === 2) {
        this.isAiming = true;
        this.emitSnapshot();
      } else if (e.button === 0) {
        if (!this.pointerLocked && document.pointerLockElement !== this.renderer.domElement) {
          this.renderer.domElement.requestPointerLock?.();
        }
        if (this.pointerLocked) {
          this.isFiring = true;
        } else {
          this.playtestDragLook = true;
          this.lastPlaytestDragPos = { x: e.clientX, y: e.clientY };
        }
      }
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.mode !== 'playtest') return;
    if (e.pointerType === 'touch') return;

    const sens = this.getActiveSensitivityMultiplier();
    const ySign = this.playtestSettings.invertY ? -1 : 1;

    if (this.pointerLocked) {
      this.camYaw -= e.movementX * 0.0022 * sens;
      this.camPitch = THREE.MathUtils.clamp(
        this.camPitch + e.movementY * 0.002 * sens * ySign,
        -1.15,
        1.25,
      );
    } else if (this.playtestDragLook) {
      const dx = e.clientX - this.lastPlaytestDragPos.x;
      const dy = e.clientY - this.lastPlaytestDragPos.y;
      this.lastPlaytestDragPos = { x: e.clientX, y: e.clientY };
      this.camYaw -= dx * 0.0038 * sens;
      this.camPitch = THREE.MathUtils.clamp(
        this.camPitch + dy * 0.0033 * sens * ySign,
        -1.15,
        1.25,
      );
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (this.mode === 'playtest') {
      if (e.pointerType === 'touch') return;
      if (e.button === 2) {
        this.isAiming = false;
        this.emitSnapshot();
      }
      if (e.button === 0) {
        this.isFiring = false;
        this.playtestDragLook = false;
      }
      return;
    }

    // Editor mode: click-to-select if not orbiting/dragging
    if (e.button !== 0) return;
    if (this.transformControls.dragging) return;

    const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
    if (dist > 5) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    _mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.near = 0.1;
    this.raycaster.far = 1500;
    this.raycaster.setFromCamera(_mouseNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.editorObjectsGroup.children, true);

    if (hits.length > 0) {
      let cur: THREE.Object3D | null = hits[0].object;
      while (cur && !cur.userData.studioEntryId) {
        cur = cur.parent;
      }
      const entryId = cur?.userData.studioEntryId as string | undefined;
      if (entryId) {
        this.selectObject(entryId);
        return;
      }
    }
    this.selectObject(null);
  }

  private handleWheel(e: WheelEvent): void {
    if (this.mode !== 'playtest') return;
    if (e.deltaY !== 0 && this.playtestSettings.cameraMode === 'third') {
      // Optional subtle zoom or ignore
    }
  }

  private handlePointerLockChange(): void {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    if (!this.pointerLocked) {
      this.isFiring = false;
      this.isAiming = false;
    }
    this.emitSnapshot();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
    ) {
      return;
    }

    if (this.mode === 'playtest') {
      this.keys.add(e.code);
      if (e.code === 'KeyC') {
        this.togglePlaytestCrouch();
      } else if (e.code === 'KeyZ') {
        this.togglePlaytestProne();
      } else if (e.code === 'KeyV') {
        this.togglePlaytestCamera();
      } else if (e.code === 'KeyF') {
        this.isFiring = true;
      } else if (e.code === 'KeyR') {
        this.triggerPlaytestReload();
      } else if (e.code === 'Digit1') {
        this.selectPlaytestWeaponSlot(1);
      } else if (e.code === 'Digit2') {
        this.selectPlaytestWeaponSlot(2);
      } else if (e.code === 'Digit3') {
        this.selectPlaytestWeaponSlot(3);
      } else if (e.code === 'Digit4') {
        this.selectPlaytestWeaponSlot(4);
      }
      return;
    }

    // Editor shortcuts
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
      e.preventDefault();
      this.redo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD' && this.selectedId) {
      e.preventDefault();
      this.duplicateObject(this.selectedId);
      return;
    }

    if (e.code === 'KeyQ') this.setTransformMode('select');
    else if (e.code === 'KeyW') this.setTransformMode('translate');
    else if (e.code === 'KeyE') this.setTransformMode('rotate');
    else if (e.code === 'KeyR') this.setTransformMode('scale');
    else if (e.code === 'KeyF' && this.selectedId) this.focusObject(this.selectedId);
    else if (e.code === 'End' && this.selectedId) this.snapObjectToGround(this.selectedId);
    else if ((e.code === 'Delete' || e.code === 'Backspace') && this.selectedId) {
      this.deleteObject(this.selectedId);
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code);
    if (this.mode === 'playtest' && e.code === 'KeyF') {
      this.isFiring = false;
    }
  }

  // ==========================
  // Undo / Redo Helpers
  // ==========================

  private captureTransform(entry: SceneEntry): TransformSnapshot {
    return {
      position: [
        round3(entry.root.position.x),
        round3(entry.root.position.y),
        round3(entry.root.position.z),
      ],
      rotationDeg: [
        round3(radToDeg(entry.root.rotation.x)),
        round3(radToDeg(entry.root.rotation.y)),
        round3(radToDeg(entry.root.rotation.z)),
      ],
      scale: [round3(entry.root.scale.x), round3(entry.root.scale.y), round3(entry.root.scale.z)],
    };
  }

  private applyTransformSnapshot(id: string, snap: TransformSnapshot): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return;
    entry.root.position.set(...snap.position);
    entry.root.rotation.set(
      degToRad(snap.rotationDeg[0]),
      degToRad(snap.rotationDeg[1]),
      degToRad(snap.rotationDeg[2]),
    );
    entry.root.scale.set(...snap.scale);
    this.recomputeEntryStats(entry);
    this.updateSelectionHelper();
    this.emitSnapshot();
  }

  private pushUndo(action: UndoAction): void {
    this.undoStack.push(action);
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.redoStack = [];
  }

  public undo(): void {
    const act = this.undoStack.pop();
    if (!act) return;
    act.undo();
    this.redoStack.push(act);
    this.showStatus(`Desfeito: ${act.label}`);
    this.emitSnapshot();
  }

  public redo(): void {
    const act = this.redoStack.pop();
    if (!act) return;
    act.redo();
    this.undoStack.push(act);
    this.showStatus(`Refeito: ${act.label}`);
    this.emitSnapshot();
  }

  // ==========================
  // Snapshot Emission & Disposal
  // ==========================

  private setLoading(loading: boolean, msg = ''): void {
    this.isLoading = loading;
    this.loadingMessage = msg;
    if (loading) this.errorMessage = null;
  }

  private showStatus(msg: string): void {
    this.statusMessage = msg;
    this.statusTimer = 3.2;
  }

  public clearError(): void {
    this.errorMessage = null;
    this.emitSnapshot();
  }

  private extractSubMeshes(entry: SceneEntry): SubMeshInfo[] {
    const list: SubMeshInfo[] = [];
    entry.content.traverse((child) => {
      const m = child as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as
        | THREE.MeshStandardMaterial
        | undefined;
      list.push({
        uuid: m.uuid,
        name: m.name || `Malha ${list.length + 1}`,
        visible: m.visible,
        materialName: mat?.name || 'Material Padrão',
        colorHex: mat?.color ? `#${mat.color.getHexString()}` : '#ffffff',
        roughness: typeof mat?.roughness === 'number' ? round3(mat.roughness) : 0.7,
        metalness: typeof mat?.metalness === 'number' ? round3(mat.metalness) : 0.05,
        emissiveHex: mat?.emissive ? `#${mat.emissive.getHexString()}` : '#000000',
        emissiveIntensity: typeof mat?.emissiveIntensity === 'number' ? mat.emissiveIntensity : 0,
        wireframe: Boolean(mat?.wireframe),
        doubleSide: mat?.side === THREE.DoubleSide,
      });
    });
    return list;
  }

  public emitSnapshot(): void {
    const objects: SceneObjectMeta[] = this.entries.map((e) => ({
      id: e.id,
      name: e.name,
      role: e.role,
      sourceType: e.sourceType,
      sourceUrl: e.sourceUrl,
      builtinId: e.builtinId,
      fileName: e.fileName,
      visible: e.visible,
      locked: e.locked,
      collisionEnabled: e.collisionEnabled,
      walkableEnabled: e.walkableEnabled,
      castShadow: e.castShadow,
      receiveShadow: e.receiveShadow,
      position: [round3(e.root.position.x), round3(e.root.position.y), round3(e.root.position.z)],
      rotationDeg: [
        round3(radToDeg(e.root.rotation.x)),
        round3(radToDeg(e.root.rotation.y)),
        round3(radToDeg(e.root.rotation.z)),
      ],
      scale: [round3(e.root.scale.x), round3(e.root.scale.y), round3(e.root.scale.z)],
      meshCount: e.meshCount,
      triangleCount: e.triangleCount,
      dimensions: e.dimensions,
      animations: e.animations.map((a, idx) => a.name || `Clip ${idx + 1}`),
      activeAnimIndex: e.activeAnimIndex,
      animPlaying: e.animPlaying,
      animLoop: e.animLoop,
      animSpeed: e.animSpeed,
      materialOverride: { ...e.materialOverride },
      subMeshes: e.id === this.selectedId ? this.extractSubMeshes(e) : [],
    }));

    const playtestHud: PlaytestHudState = {
      active: this.mode === 'playtest',
      fps: this.currentFps,
      playerPos: [round3(this.playerPos.x), round3(this.playerPos.y), round3(this.playerPos.z)],
      speed: round3(Math.hypot(this.playerVel.x, this.playerVel.z)),
      stance: this.stance,
      isGrounded: this.isGrounded,
      isSprinting: this.isSprintingState,
      isAiming: this.isAiming,
      isReloading: this.isReloading,
      reloadProgress:
        this.isReloading && this.reloadDuration > 0
          ? Math.min(1, this.reloadElapsed / this.reloadDuration)
          : 0,
      pointerLocked: this.pointerLocked,
      cameraMode: this.playtestSettings.cameraMode,
      activeSlot: this.playtestSettings.activeSlot,
      slots: {
        1: { ...this.playtestSlots[1] },
        2: { ...this.playtestSlots[2] },
        3: { ...this.playtestSlots[3] },
      },
      lastHitDistance: this.lastHitDistance,
      lastHitMeshName: this.lastHitMeshName,
    };

    this.onSnapshot({
      mode: this.mode,
      objects,
      selectedId: this.selectedId,
      transformMode: this.transformMode,
      transformSpace: this.transformSpace,
      snapEnabled: this.snapEnabled,
      translateSnap: this.translateSnap,
      rotateSnapDeg: this.rotateSnapDeg,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      environment: { ...this.environment },
      playtestSettings: { ...this.playtestSettings },
      playtestHud,
      isLoading: this.isLoading,
      loadingMessage: this.loadingMessage,
      errorMessage: this.errorMessage,
      statusMessage: this.statusMessage,
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.boundHandlers.onPointerDown);
    dom.removeEventListener('pointermove', this.boundHandlers.onPointerMove);
    dom.removeEventListener('pointerup', this.boundHandlers.onPointerUp);
    dom.removeEventListener('wheel', this.boundHandlers.onWheel);
    dom.removeEventListener('contextmenu', this.boundHandlers.onContextMenu);
    dom.removeEventListener('webglcontextlost', this.boundHandlers.onWebglLost);
    dom.removeEventListener('webglcontextrestored', this.boundHandlers.onWebglRestored);
    window.removeEventListener('keydown', this.boundHandlers.onKeyDown);
    window.removeEventListener('keyup', this.boundHandlers.onKeyUp);
    document.removeEventListener('pointerlockchange', this.boundHandlers.onPointerLockChange);

    this.cleanupPlaytestCharacter();
    this.transformControls.dispose();
    this.orbitControls.dispose();
    this.dracoLoader.dispose();
    this.textures.dispose();
    this.groundMesh.geometry.dispose();
    (this.groundMesh.material as THREE.Material).dispose();

    this.scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
        if (Array.isArray(m.material)) m.material.forEach((mt) => mt.dispose());
        else m.material?.dispose();
      }
    });

    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
