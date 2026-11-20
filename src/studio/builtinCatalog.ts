import * as THREE from 'three';
import {
  createCasaGod,
  createCeleiro,
  createEnterableHouse,
  BuildingMaterials,
} from '../game/buildingPrefabs';
import { ProceduralTextureSet } from '../game/textures';
import { AssetRole, BuiltinAssetId } from './types';

export interface BuiltinCatalogItem {
  id: BuiltinAssetId;
  name: string;
  category: 'Personagem' | 'Estrutura' | 'Natureza' | 'Marcador';
  role: AssetRole;
  description: string;
  glbUrl?: string;
}

export const BUILTIN_CATALOG: BuiltinCatalogItem[] = [
  {
    id: 'ff_adam',
    name: 'Adam (.glb)',
    category: 'Personagem',
    role: 'character',
    description: 'Modelo oficial Adam com esqueleto e animações.',
    glbUrl: '/assets/models/ff_adam.glb',
  },
  {
    id: 'ff_eva',
    name: 'Eva (.glb)',
    category: 'Personagem',
    role: 'character',
    description: 'Modelo oficial Eva com esqueleto e animações.',
    glbUrl: '/assets/models/ff_eva.glb',
  },
  {
    id: 'house_god',
    name: 'Casa God (2 Andares)',
    category: 'Estrutura',
    role: 'asset',
    description: 'Sobrado tático com escada interna, 2º andar e terraço.',
  },
  {
    id: 'house_wood',
    name: 'Casa de Madeira',
    category: 'Estrutura',
    role: 'asset',
    description: 'Casa térrea acessível com porta e janelas.',
  },
  {
    id: 'warehouse',
    name: 'Celeiro Clássico',
    category: 'Estrutura',
    role: 'asset',
    description: 'Celeiro aberto com mezanino e rampa.',
  },
  {
    id: 'container_blue',
    name: 'Contêiner Industrial',
    category: 'Estrutura',
    role: 'asset',
    description: 'Contêiner metálico para cobertura e cenário.',
  },
  {
    id: 'tree_tropical',
    name: 'Árvore Tropical',
    category: 'Natureza',
    role: 'asset',
    description: 'Árvore de copa em camadas com tronco detalhado.',
  },
  {
    id: 'rock_boulder',
    name: 'Rocha Tática',
    category: 'Natureza',
    role: 'asset',
    description: 'Afloramento rochoso multi-bloco para cobertura.',
  },
  {
    id: 'spawn_point',
    name: 'Ponto de Spawn',
    category: 'Marcador',
    role: 'spawn',
    description: 'Define onde o jogador nasce ao clicar em Testar Jogando.',
  },
];

export function createBuildingMaterials(textures: ProceduralTextureSet): BuildingMaterials {
  return {
    stuccoWall: new THREE.MeshStandardMaterial({
      map: textures.stuccoWall,
      roughness: 0.86,
      metalness: 0.02,
    }),
    brickWall: new THREE.MeshStandardMaterial({
      map: textures.brickWall,
      roughness: 0.82,
      metalness: 0.04,
    }),
    woodWall: new THREE.MeshStandardMaterial({
      map: textures.woodPlank,
      roughness: 0.84,
      metalness: 0.03,
    }),
    barnWood: new THREE.MeshStandardMaterial({
      map: textures.barnWood,
      roughness: 0.86,
      metalness: 0.03,
    }),
    concrete: new THREE.MeshStandardMaterial({
      map: textures.concrete,
      roughness: 0.88,
      metalness: 0.05,
    }),
    interiorFloor: new THREE.MeshStandardMaterial({
      map: textures.interiorFloor,
      roughness: 0.72,
      metalness: 0.04,
    }),
    stairConcrete: new THREE.MeshStandardMaterial({
      map: textures.stairConcrete,
      roughness: 0.78,
      metalness: 0.06,
    }),
    roofTile: new THREE.MeshStandardMaterial({
      map: textures.roofTile,
      roughness: 0.76,
      metalness: 0.08,
    }),
    trim: new THREE.MeshStandardMaterial({
      color: 0x3b4046,
      roughness: 0.55,
      metalness: 0.25,
    }),
  };
}

export function buildSpawnMarkerGroup(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'SpawnPointMarker';

  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xb45309,
    emissiveIntensity: 0.45,
    roughness: 0.35,
    metalness: 0.4,
  });
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.5,
    metalness: 0.6,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.08, 24), baseMat);
  base.position.y = 0.04;
  base.name = 'SpawnBase';

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.045, 10, 28), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.09;
  ring.name = 'SpawnRing';

  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 12), ringMat);
  pillar.position.y = 0.75;
  pillar.name = 'SpawnBeacon';

  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.42, 12), ringMat);
  arrow.rotation.x = Math.PI / 2;
  arrow.position.set(0, 0.9, 0.32);
  arrow.name = 'SpawnDirectionArrow';

  group.add(base, ring, pillar, arrow);
  return group;
}

export function buildBuiltinPrefabGroup(
  builtinId: BuiltinAssetId,
  textures: ProceduralTextureSet,
  mats: BuildingMaterials,
): THREE.Group {
  if (builtinId === 'spawn_point') {
    return buildSpawnMarkerGroup();
  }

  if (builtinId === 'house_god') {
    const res = createCasaGod(0, 0, 0, 0, mats, [], [], []);
    res.group.position.set(0, 0, 0);
    res.group.name = 'CasaGod';
    return res.group;
  }

  if (builtinId === 'house_wood') {
    const res = createEnterableHouse(0, 0, 8.2, 6.8, 3.1, 0, 0, mats.woodWall, mats, [], [], []);
    res.group.position.set(0, 0, 0);
    res.group.name = 'CasaMadeira';
    return res.group;
  }

  if (builtinId === 'warehouse') {
    const res = createCeleiro(0, 0, 0, 0, mats, [], [], []);
    res.group.position.set(0, 0, 0);
    res.group.name = 'Celeiro';
    return res.group;
  }

  if (builtinId === 'container_blue') {
    const group = new THREE.Group();
    group.name = 'ContainerBlue';
    const bodyMat = new THREE.MeshStandardMaterial({
      map: textures.containerBlue,
      roughness: 0.56,
      metalness: 0.42,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.48,
      metalness: 0.6,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.6, 6.1), bodyMat);
    body.position.y = 1.3;
    body.name = 'ContainerHull';
    const roofRibs = new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.08, 6.14), trimMat);
    roofRibs.position.y = 2.58;
    roofRibs.name = 'ContainerRoofFrame';
    const baseSkid = new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.1, 6.14), trimMat);
    baseSkid.position.y = 0.05;
    baseSkid.name = 'ContainerBaseFrame';
    group.add(baseSkid, body, roofRibs);
    return group;
  }

  if (builtinId === 'tree_tropical') {
    const group = new THREE.Group();
    group.name = 'TreeTropical';
    const trunkMat = new THREE.MeshStandardMaterial({
      map: textures.bark,
      roughness: 0.9,
      metalness: 0.02,
    });
    const leafMat = new THREE.MeshStandardMaterial({
      map: textures.foliage,
      roughness: 0.82,
      metalness: 0.02,
    });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 3.6, 10), trunkMat);
    trunk.position.y = 1.8;
    trunk.name = 'Trunk';

    const branch1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.5, 8), trunkMat);
    branch1.position.set(0.45, 3.1, 0.15);
    branch1.rotation.z = -0.58;
    branch1.name = 'BranchA';

    const canopy1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.65, 1), leafMat);
    canopy1.position.set(0, 4.35, 0);
    canopy1.scale.set(1.15, 0.82, 1.15);
    canopy1.name = 'CanopyMain';

    const canopy2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.15, 1), leafMat);
    canopy2.position.set(0.85, 3.85, 0.45);
    canopy2.scale.set(1.0, 0.78, 1.0);
    canopy2.name = 'CanopySide';

    const canopy3 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.05, 1), leafMat);
    canopy3.position.set(-0.75, 3.95, -0.4);
    canopy3.scale.set(1.05, 0.75, 1.05);
    canopy3.name = 'CanopyCrown';

    group.add(trunk, branch1, canopy1, canopy2, canopy3);
    return group;
  }

  // rock_boulder
  const group = new THREE.Group();
  group.name = 'RockBoulder';
  const rockMat = new THREE.MeshStandardMaterial({
    map: textures.rock,
    roughness: 0.88,
    metalness: 0.05,
  });
  const mainRock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.35, 1), rockMat);
  mainRock.position.set(0, 0.85, 0);
  mainRock.scale.set(1.25, 0.78, 1.05);
  mainRock.name = 'RockCore';

  const sideRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85, 0), rockMat);
  sideRock.position.set(0.95, 0.48, 0.45);
  sideRock.scale.set(1.1, 0.65, 0.9);
  sideRock.name = 'RockShoulder';

  const accentRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 0), rockMat);
  accentRock.position.set(-0.82, 0.38, -0.35);
  accentRock.scale.set(0.95, 0.68, 1.1);
  accentRock.name = 'RockBase';

  group.add(mainRock, sideRock, accentRock);
  return group;
}
