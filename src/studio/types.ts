import { ControlMode, GraphicsQuality, WeaponId, WeaponSlotId } from '../game/types';

export type AssetRole = 'map' | 'asset' | 'character' | 'weapon' | 'spawn';

export type TransformMode = 'select' | 'translate' | 'rotate' | 'scale';

export type TransformSpace = 'world' | 'local';

export type EnvironmentPreset = 'daylight' | 'sunset' | 'studio' | 'night';

export type CameraPreset = 'perspective' | 'top' | 'front' | 'side';

export type BuiltinAssetId =
  | 'ff_adam'
  | 'ff_eva'
  | 'house_wood'
  | 'house_god'
  | 'warehouse'
  | 'container_blue'
  | 'tree_tropical'
  | 'rock_boulder'
  | 'spawn_point';

export interface SubMeshInfo {
  uuid: string;
  name: string;
  visible: boolean;
  materialName: string;
  colorHex: string;
  roughness: number;
  metalness: number;
  emissiveHex: string;
  emissiveIntensity: number;
  wireframe: boolean;
  doubleSide: boolean;
}

export interface MaterialOverride {
  tint: string;
  useTint: boolean;
  roughness: number; // -1 means keep original
  metalness: number; // -1 means keep original
  emissiveColor: string;
  emissiveIntensity: number;
  wireframe: boolean;
  doubleSide: boolean;
}

export interface SceneObjectMeta {
  id: string;
  name: string;
  role: AssetRole;
  sourceType: 'file' | 'url' | 'builtin';
  sourceUrl?: string;
  builtinId?: BuiltinAssetId;
  fileName?: string;
  visible: boolean;
  locked: boolean;
  collisionEnabled: boolean;
  walkableEnabled: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  position: [number, number, number];
  rotationDeg: [number, number, number];
  scale: [number, number, number];
  meshCount: number;
  triangleCount: number;
  dimensions: [number, number, number];
  animations: string[];
  activeAnimIndex: number;
  animPlaying: boolean;
  animLoop: boolean;
  animSpeed: number;
  materialOverride: MaterialOverride;
  subMeshes: SubMeshInfo[];
}

export interface EnvironmentSettings {
  preset: EnvironmentPreset;
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  sunIntensity: number;
  exposure: number;
  fogEnabled: boolean;
  fogDensity: number;
  showGrid: boolean;
  showGroundPlane: boolean;
  groundColor: string;
  skyColor: string;
}

export interface PlaytestWeaponSlot {
  weaponId: WeaponId;
  ammoInMag: number;
  magSize: number;
}

export interface PlaytestSettings {
  playerModel: 'adam' | 'eva' | 'custom';
  customCharacterObjectId: string | null;
  cameraMode: 'third' | 'first';
  moveSpeed: number;
  sprintSpeed: number;
  jumpForce: number;
  gravity: number;
  weaponId: WeaponId | 'none';
  slot1Weapon: WeaponId;
  slot2Weapon: WeaponId;
  slot3Weapon: WeaponId;
  activeSlot: WeaponSlotId;
  quality: GraphicsQuality;
  controlMode: ControlMode;
  generalSensitivity: number; // 0 .. 100
  aimSensitivity: number; // 0 .. 100
  scopeSensitivity: number; // 0 .. 100
  invertY: boolean;
}

export interface PlaytestHudState {
  active: boolean;
  fps: number;
  playerPos: [number, number, number];
  speed: number;
  stance: 'stand' | 'crouch' | 'prone';
  isGrounded: boolean;
  isSprinting: boolean;
  isAiming: boolean;
  isReloading: boolean;
  reloadProgress: number;
  pointerLocked: boolean;
  cameraMode: 'third' | 'first';
  activeSlot: WeaponSlotId;
  slots: {
    1: PlaytestWeaponSlot;
    2: PlaytestWeaponSlot;
    3: PlaytestWeaponSlot;
  };
  lastHitDistance: number | null;
  lastHitMeshName: string | null;
}

export interface StudioSnapshot {
  mode: 'editor' | 'playtest';
  objects: SceneObjectMeta[];
  selectedId: string | null;
  transformMode: TransformMode;
  transformSpace: TransformSpace;
  snapEnabled: boolean;
  translateSnap: number;
  rotateSnapDeg: number;
  canUndo: boolean;
  canRedo: boolean;
  environment: EnvironmentSettings;
  playtestSettings: PlaytestSettings;
  playtestHud: PlaytestHudState;
  isLoading: boolean;
  loadingMessage: string;
  errorMessage: string | null;
  statusMessage: string | null;
}

export interface SerializedSceneObject {
  id: string;
  name: string;
  role: AssetRole;
  sourceType: 'file' | 'url' | 'builtin';
  sourceUrl?: string;
  builtinId?: BuiltinAssetId;
  fileName?: string;
  embeddedGlbBase64?: string;
  visible: boolean;
  locked: boolean;
  collisionEnabled: boolean;
  walkableEnabled: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  position: [number, number, number];
  rotationDeg: [number, number, number];
  scale: [number, number, number];
  activeAnimIndex: number;
  animPlaying: boolean;
  animLoop: boolean;
  animSpeed: number;
  materialOverride: MaterialOverride;
}

export interface StudioProjectFile {
  schemaVersion: 1;
  savedAt: string;
  environment: EnvironmentSettings;
  playtestSettings: PlaytestSettings;
  objects: SerializedSceneObject[];
}

export const DEFAULT_MATERIAL_OVERRIDE: MaterialOverride = {
  tint: '#ffffff',
  useTint: false,
  roughness: -1,
  metalness: -1,
  emissiveColor: '#000000',
  emissiveIntensity: 0,
  wireframe: false,
  doubleSide: false,
};

export const DEFAULT_ENVIRONMENT: EnvironmentSettings = {
  preset: 'daylight',
  sunAzimuthDeg: 42,
  sunElevationDeg: 52,
  sunIntensity: 2.1,
  exposure: 1.08,
  fogEnabled: true,
  fogDensity: 0.0045,
  showGrid: true,
  showGroundPlane: true,
  groundColor: '#363d47',
  skyColor: '#1a2433',
};

export const DEFAULT_PLAYTEST_SETTINGS: PlaytestSettings = {
  playerModel: 'adam',
  customCharacterObjectId: null,
  cameraMode: 'third',
  moveSpeed: 5.8,
  sprintSpeed: 9.2,
  jumpForce: 7.4,
  gravity: 20.0,
  weaponId: 'm4a1',
  slot1Weapon: 'm4a1',
  slot2Weapon: 'ump45',
  slot3Weapon: 'deagle',
  activeSlot: 1,
  quality: 'medium',
  controlMode: 'auto',
  generalSensitivity: 55,
  aimSensitivity: 45,
  scopeSensitivity: 35,
  invertY: false,
};

export const QUALITY_LABELS: Record<GraphicsQuality, string> = {
  low: 'Suave',
  medium: 'Padrão',
  high: 'Ultra',
};

export const ROLE_LABELS: Record<AssetRole, string> = {
  map: 'Mapa / Terreno',
  asset: 'Asset / Prop',
  character: 'Personagem',
  weapon: 'Arma / Item',
  spawn: 'Ponto de Spawn',
};
