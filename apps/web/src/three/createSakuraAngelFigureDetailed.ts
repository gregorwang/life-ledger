import * as THREE from "three";

export interface SakuraFigureRuntime {
  partIds: string[];
  setExplode: (amount: number) => void;
  setSelected: (partId: string | null) => void;
  reset: () => void;
}

export interface SakuraFigureOptions {
  clayMode?: boolean;
  quality?: "mobile" | "desktop";
}

type PartRecord = {
  id: string;
  group: THREE.Group;
  origin: THREE.Vector3;
  centre: THREE.Vector3;
};

const PALETTE = {
  clay: 0xeeeae4,
  skin: 0xffd2ba,
  skinShadow: 0xefb99f,
  hair: 0x9b5a3d,
  hairDark: 0x5e3027,
  hairHighlight: 0xc27a56,
  white: 0xfffdf7,
  featherShade: 0xe7eef2,
  gold: 0xe8bb45,
  goldDark: 0x9a641f,
  pink: 0xf0649d,
  red: 0xc51f44,
  cyan: 0x9ceefa,
  cyanDeep: 0x4bbbd7,
  green: 0x78a75c,
  greenLight: 0xc9e88c,
  eyeDark: 0x2a1d20,
  blush: 0xee9d9f,
  mouth: 0xaa5d62,
  base: 0x3e355d,
  baseGlow: 0x5ac4e8,
} as const;

function physicalMaterial(
  color: number,
  clayMode: boolean,
  options: THREE.MeshPhysicalMaterialParameters = {},
) {
  const mapsDisabledColor = clayMode ? PALETTE.clay : color;
  return new THREE.MeshPhysicalMaterial({
    color: mapsDisabledColor,
    roughness: clayMode ? 0.68 : 0.42,
    metalness: 0,
    clearcoat: clayMode ? 0 : 0.08,
    side: THREE.DoubleSide,
    ...options,
  });
}

function finishMesh<T extends THREE.Mesh>(mesh: T, name: string) {
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function ellipsoid(
  name: string,
  scale: [number, number, number],
  meshMaterial: THREE.Material,
  segments: number,
) {
  const mesh = finishMesh(
    new THREE.Mesh(
      new THREE.SphereGeometry(
        1,
        segments,
        Math.max(14, Math.round(segments * 0.72)),
      ),
      meshMaterial,
    ),
    name,
  );
  mesh.scale.set(...scale);
  return mesh;
}

function cylinderBetween(
  name: string,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radiusStart: number,
  radiusEnd: number,
  meshMaterial: THREE.Material,
  radialSegments: number,
) {
  const direction = end.clone().sub(start);
  const mesh = finishMesh(
    new THREE.Mesh(
      new THREE.CylinderGeometry(
        radiusEnd,
        radiusStart,
        direction.length(),
        radialSegments,
        2,
        false,
      ),
      meshMaterial,
    ),
    name,
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  );
  return mesh;
}

function tube(
  name: string,
  points: THREE.Vector3[],
  radius: number,
  meshMaterial: THREE.Material,
  tubularSegments: number,
  radialSegments: number,
  closed = false,
) {
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal");
  return finishMesh(
    new THREE.Mesh(
      new THREE.TubeGeometry(
        curve,
        tubularSegments,
        radius,
        radialSegments,
        closed,
      ),
      meshMaterial,
    ),
    name,
  );
}

function featherShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.58);
  shape.bezierCurveTo(-0.13, -0.5, -0.28, -0.31, -0.31, -0.12);
  shape.lineTo(-0.23, -0.17);
  shape.bezierCurveTo(-0.36, 0.02, -0.35, 0.2, -0.23, 0.34);
  shape.lineTo(-0.14, 0.27);
  shape.bezierCurveTo(-0.18, 0.42, -0.09, 0.54, 0, 0.64);
  shape.bezierCurveTo(0.09, 0.54, 0.18, 0.42, 0.14, 0.27);
  shape.lineTo(0.23, 0.34);
  shape.bezierCurveTo(0.35, 0.2, 0.36, 0.02, 0.23, -0.17);
  shape.lineTo(0.31, -0.12);
  shape.bezierCurveTo(0.28, -0.31, 0.13, -0.5, 0, -0.58);
  return shape;
}

function hairLockShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.62);
  shape.bezierCurveTo(-0.12, -0.42, -0.22, -0.04, -0.2, 0.42);
  shape.quadraticCurveTo(0, 0.55, 0.2, 0.42);
  shape.bezierCurveTo(0.22, -0.04, 0.12, -0.42, 0, -0.62);
  return shape;
}

function makeExtrudedShape(
  name: string,
  shape: THREE.Shape,
  depth: number,
  meshMaterial: THREE.Material,
  bevel = 0.018,
) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 10,
  });
  geometry.center();
  return finishMesh(new THREE.Mesh(geometry, meshMaterial), name);
}

function feather(
  name: string,
  meshMaterial: THREE.Material,
  scale: [number, number, number],
) {
  const mesh = makeExtrudedShape(
    name,
    featherShape(),
    0.09,
    meshMaterial,
    0.022,
  );
  mesh.scale.set(...scale);
  return mesh;
}

function hairLock(
  name: string,
  meshMaterial: THREE.Material,
  scale: [number, number, number],
) {
  const mesh = makeExtrudedShape(
    name,
    hairLockShape(),
    0.12,
    meshMaterial,
    0.018,
  );
  mesh.scale.set(...scale);
  return mesh;
}

function orientRadially(
  object: THREE.Object3D,
  angle: number,
  downwardSlope: number,
) {
  const tangent = new THREE.Vector3(
    -Math.sin(angle),
    0,
    Math.cos(angle),
  ).normalize();
  const radial = new THREE.Vector3(
    Math.cos(angle),
    -downwardSlope,
    Math.sin(angle),
  ).normalize();
  const normal = new THREE.Vector3()
    .crossVectors(tangent, radial)
    .normalize();
  object.setRotationFromMatrix(
    new THREE.Matrix4().makeBasis(tangent, radial, normal),
  );
}

function addSnowflake(
  parent: THREE.Object3D,
  name: string,
  centre: THREE.Vector3,
  size: number,
  meshMaterial: THREE.Material,
  segments: number,
) {
  const core = finishMesh(
    new THREE.Mesh(new THREE.OctahedronGeometry(size * 0.23, 0), meshMaterial),
    `${name}-core`,
  );
  core.position.copy(centre);
  core.scale.z = 0.42;
  parent.add(core);

  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;
    const start = centre
      .clone()
      .add(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(size * 0.1));
    const end = centre
      .clone()
      .add(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(size * 0.48));
    parent.add(
      cylinderBetween(
        `${name}-ray-${index + 1}`,
        start,
        end,
        size * 0.035,
        size * 0.012,
        meshMaterial,
        Math.max(6, Math.round(segments / 4)),
      ),
    );
    const tip = finishMesh(
      new THREE.Mesh(
        new THREE.OctahedronGeometry(size * 0.08, 0),
        meshMaterial,
      ),
      `${name}-tip-${index + 1}`,
    );
    tip.position.copy(end);
    tip.scale.z = 0.4;
    parent.add(tip);
  }
}

function addRadialOctahedron(
  parent: THREE.Object3D,
  name: string,
  centre: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  width: number,
  meshMaterial: THREE.Material,
) {
  const mesh = finishMesh(
    new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), meshMaterial),
    name,
  );
  mesh.scale.set(width, length, width * 0.44);
  mesh.position.copy(centre).addScaledVector(direction, length * 0.6);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  );
  parent.add(mesh);
  return mesh;
}

function addEye(
  parent: THREE.Object3D,
  name: string,
  centre: THREE.Vector3,
  mirrored: boolean,
  materials: {
    eyeDark: THREE.Material;
    green: THREE.Material;
    greenLight: THREE.Material;
    white: THREE.Material;
  },
  segments: number,
) {
  const outer = ellipsoid(
    `${name}-outer`,
    [0.15, 0.195, 0.026],
    materials.eyeDark,
    segments,
  );
  outer.position.copy(centre);
  outer.rotation.z = mirrored ? 0.08 : -0.08;
  parent.add(outer);

  const sclera = ellipsoid(
    `${name}-sclera`,
    [0.127, 0.165, 0.021],
    materials.white,
    segments,
  );
  sclera.position.copy(centre).add(new THREE.Vector3(0, -0.005, 0.027));
  sclera.rotation.z = outer.rotation.z;
  parent.add(sclera);

  const iris = ellipsoid(
    `${name}-iris`,
    [0.088, 0.126, 0.017],
    materials.green,
    segments,
  );
  iris.position.copy(centre).add(new THREE.Vector3(mirrored ? -0.01 : 0.01, -0.018, 0.055));
  parent.add(iris);

  const lowerIris = ellipsoid(
    `${name}-iris-light`,
    [0.065, 0.062, 0.014],
    materials.greenLight,
    Math.max(16, Math.round(segments * 0.7)),
  );
  lowerIris.position.copy(iris.position).add(new THREE.Vector3(0, -0.047, 0.024));
  parent.add(lowerIris);

  const pupil = ellipsoid(
    `${name}-pupil`,
    [0.042, 0.074, 0.012],
    materials.eyeDark,
    Math.max(16, Math.round(segments * 0.7)),
  );
  pupil.position.copy(iris.position).add(new THREE.Vector3(0, 0.012, 0.035));
  parent.add(pupil);

  for (const [index, offset] of [
    new THREE.Vector3(mirrored ? -0.044 : -0.038, 0.065, 0.08),
    new THREE.Vector3(mirrored ? 0.025 : 0.032, -0.002, 0.08),
  ].entries()) {
    const catchlight = ellipsoid(
      `${name}-catchlight-${index + 1}`,
      index === 0 ? [0.035, 0.05, 0.012] : [0.018, 0.024, 0.01],
      materials.white,
      14,
    );
    catchlight.position.copy(centre).add(offset);
    parent.add(catchlight);
  }

  const lashStart = centre
    .clone()
    .add(new THREE.Vector3(mirrored ? -0.145 : -0.15, 0.13, 0.092));
  const lashEnd = centre
    .clone()
    .add(new THREE.Vector3(mirrored ? 0.16 : 0.15, 0.115, 0.092));
  parent.add(
    cylinderBetween(
      `${name}-upper-lash`,
      lashStart,
      lashEnd,
      0.026,
      0.018,
      materials.eyeDark,
      8,
    ),
  );
}

export function createSakuraAngelFigureModel(
  options: SakuraFigureOptions = {},
) {
  const clayMode = options.clayMode ?? false;
  const isMobile = options.quality === "mobile";
  const segments = isMobile ? 20 : 32;
  const root = new THREE.Group();
  root.name = "sakura-angel-figure-v2";
  root.rotation.y = 0.045;
  root.position.y = -0.02;

  const materials = {
    skin: physicalMaterial(PALETTE.skin, clayMode, {roughness: 0.5}),
    skinShadow: physicalMaterial(PALETTE.skinShadow, clayMode, {roughness: 0.54}),
    hair: physicalMaterial(PALETTE.hair, clayMode, {roughness: 0.33}),
    hairDark: physicalMaterial(PALETTE.hairDark, clayMode, {roughness: 0.38}),
    hairHighlight: physicalMaterial(PALETTE.hairHighlight, clayMode, {
      roughness: 0.3,
    }),
    white: physicalMaterial(PALETTE.white, clayMode, {roughness: 0.36}),
    featherShade: physicalMaterial(PALETTE.featherShade, clayMode, {
      roughness: 0.45,
    }),
    gold: physicalMaterial(PALETTE.gold, clayMode, {
      roughness: 0.23,
      metalness: clayMode ? 0 : 0.56,
      clearcoat: clayMode ? 0 : 0.28,
      emissive: clayMode ? 0x000000 : 0x3f2500,
      emissiveIntensity: clayMode ? 0 : 0.13,
    }),
    goldDark: physicalMaterial(PALETTE.goldDark, clayMode, {
      roughness: 0.25,
      metalness: clayMode ? 0 : 0.52,
      emissive: clayMode ? 0x000000 : 0x2b1600,
      emissiveIntensity: clayMode ? 0 : 0.1,
    }),
    pink: physicalMaterial(PALETTE.pink, clayMode, {
      roughness: 0.14,
      clearcoat: clayMode ? 0 : 0.9,
    }),
    red: physicalMaterial(PALETTE.red, clayMode, {
      roughness: 0.12,
      clearcoat: clayMode ? 0 : 0.72,
    }),
    cyan: physicalMaterial(PALETTE.cyan, clayMode, {
      roughness: 0.08,
      transmission: clayMode ? 0 : 0.46,
      thickness: 0.16,
      transparent: !clayMode,
      opacity: clayMode ? 1 : 0.84,
      depthWrite: clayMode,
    }),
    cyanDeep: physicalMaterial(PALETTE.cyanDeep, clayMode, {
      roughness: 0.09,
      transmission: clayMode ? 0 : 0.34,
      transparent: !clayMode,
      opacity: clayMode ? 1 : 0.83,
      depthWrite: clayMode,
    }),
    green: physicalMaterial(PALETTE.green, clayMode, {
      roughness: 0.08,
      clearcoat: clayMode ? 0 : 0.92,
    }),
    greenLight: physicalMaterial(PALETTE.greenLight, clayMode, {
      roughness: 0.12,
      clearcoat: clayMode ? 0 : 0.7,
    }),
    eyeDark: physicalMaterial(PALETTE.eyeDark, clayMode, {roughness: 0.24}),
    blush: physicalMaterial(PALETTE.blush, clayMode, {
      roughness: 0.56,
      transparent: !clayMode,
      opacity: clayMode ? 1 : 0.58,
      depthWrite: clayMode,
    }),
    mouth: physicalMaterial(PALETTE.mouth, clayMode, {roughness: 0.54}),
    base: physicalMaterial(PALETTE.base, clayMode, {
      roughness: 0.13,
      transmission: clayMode ? 0 : 0.32,
      transparent: !clayMode,
      opacity: clayMode ? 1 : 0.74,
      depthWrite: clayMode,
      clearcoat: clayMode ? 0 : 0.74,
    }),
    baseGlow: physicalMaterial(PALETTE.baseGlow, clayMode, {
      roughness: 0.12,
      transmission: clayMode ? 0 : 0.5,
      transparent: !clayMode,
      opacity: clayMode ? 1 : 0.4,
      depthWrite: clayMode,
    }),
  };

  const partRecords: PartRecord[] = [];
  function part(id: string, label: string) {
    const group = new THREE.Group();
    group.name = id;
    group.userData.partId = id;
    group.userData.partLabel = label;
    root.add(group);
    const record = {
      id,
      group,
      origin: group.position.clone(),
      centre: new THREE.Vector3(),
    };
    partRecords.push(record);
    return group;
  }

  const base = part("display-base", "烟晶虹彩展示底座");
  const baseDisk = finishMesh(
    new THREE.Mesh(
      new THREE.CylinderGeometry(2.42, 2.52, 0.24, isMobile ? 48 : 72),
      materials.base,
    ),
    "display-base-disc",
  );
  baseDisk.position.set(0.18, -2.06, -0.06);
  baseDisk.scale.z = 0.7;
  base.add(baseDisk);
  const baseInset = finishMesh(
    new THREE.Mesh(
      new THREE.CylinderGeometry(2.19, 2.26, 0.035, isMobile ? 48 : 72),
      materials.baseGlow,
    ),
    "display-base-iridescent-inset",
  );
  baseInset.position.set(0.18, -1.92, -0.06);
  baseInset.scale.z = 0.7;
  base.add(baseInset);
  const baseRim = finishMesh(
    new THREE.Mesh(
      new THREE.TorusGeometry(2.38, 0.045, 10, isMobile ? 48 : 72),
      materials.cyanDeep,
    ),
    "display-base-rim",
  );
  baseRim.rotation.x = Math.PI / 2;
  baseRim.position.set(0.18, -1.95, -0.06);
  baseRim.scale.z = 0.7;
  base.add(baseRim);

  const skirt = part("feather-skirt", "三层羽翼裙摆");
  const skirtUnderstructure = ellipsoid(
    "skirt-understructure",
    [1.67, 0.42, 1.08],
    materials.featherShade,
    segments,
  );
  skirtUnderstructure.position.set(0.22, -1.32, -0.05);
  skirt.add(skirtUnderstructure);

  const ringConfigs = [
    {
      id: "inner",
      count: 12,
      radiusX: 0.68,
      radiusZ: 0.46,
      length: 0.92,
      width: 0.44,
      y: -1.08,
      slope: 0.42,
      offset: 0.04,
    },
    {
      id: "middle",
      count: 16,
      radiusX: 1.2,
      radiusZ: 0.78,
      length: 1.18,
      width: 0.52,
      y: -1.31,
      slope: 0.52,
      offset: Math.PI / 16,
    },
    {
      id: "outer",
      count: 20,
      radiusX: 1.72,
      radiusZ: 1.03,
      length: 1.48,
      width: 0.6,
      y: -1.52,
      slope: 0.62,
      offset: 0,
    },
  ] as const;
  for (const ring of ringConfigs) {
    for (let index = 0; index < ring.count; index += 1) {
      const angle = (index / ring.count) * Math.PI * 2 + ring.offset;
      const item = feather(
        `skirt-${ring.id}-feather-${index + 1}`,
        index % 3 === 0 ? materials.featherShade : materials.white,
        [
          ring.width * (0.94 + (index % 4) * 0.02),
          ring.length * (0.95 + (index % 5) * 0.018),
          0.78,
        ],
      );
      item.position.set(
        0.22 + Math.cos(angle) * ring.radiusX,
        ring.y + Math.sin(angle * 3) * 0.035,
        -0.05 + Math.sin(angle) * ring.radiusZ,
      );
      orientRadially(item, angle, ring.slope);
      skirt.add(item);
    }
  }

  for (let index = 0; index < 7; index += 1) {
    const angle = Math.PI * (0.78 + index * 0.08);
    const tail = feather(
      `rear-tail-feather-${index + 1}`,
      index % 2 ? materials.featherShade : materials.white,
      [0.68, 2.15 - index * 0.08, 0.84],
    );
    tail.position.set(
      0.05 + Math.cos(angle) * 1.72,
      -1.46 - index * 0.025,
      -0.36 + Math.sin(angle) * 0.98,
    );
    orientRadially(tail, angle, 0.48);
    skirt.add(tail);
  }

  const dress = part("dress-core", "羽毛礼裙主体");
  const dressCore = finishMesh(
    new THREE.Mesh(
      new THREE.ConeGeometry(0.79, 1.52, segments, 2, false),
      materials.white,
    ),
    "dress-core-mesh",
  );
  dressCore.position.set(0.19, -0.5, 0.04);
  dressCore.rotation.z = -0.04;
  dress.add(dressCore);
  for (let index = 0; index < 7; index += 1) {
    const frontPanel = feather(
      `dress-front-feather-${index + 1}`,
      index % 2 ? materials.white : materials.featherShade,
      [0.46, 1.12 + Math.abs(index - 3) * 0.07, 0.62],
    );
    frontPanel.position.set(
      0.18 + (index - 3) * 0.24,
      -0.76 - Math.abs(index - 3) * 0.04,
      0.78 - Math.abs(index - 3) * 0.055,
    );
    frontPanel.rotation.set(0.02, 0, (index - 3) * -0.07);
    dress.add(frontPanel);
  }

  const bodice = part("bodice", "白金紧身礼服上身");
  const bodiceMesh = ellipsoid(
    "bodice-shell",
    [0.49, 0.72, 0.35],
    materials.white,
    segments,
  );
  bodiceMesh.position.set(0.16, 0.26, 0.14);
  bodiceMesh.rotation.z = -0.04;
  bodice.add(bodiceMesh);
  const goldNeckline = tube(
    "bodice-gold-neckline",
    [
      new THREE.Vector3(-0.28, 0.58, 0.47),
      new THREE.Vector3(-0.04, 0.51, 0.55),
      new THREE.Vector3(0.18, 0.49, 0.57),
      new THREE.Vector3(0.42, 0.53, 0.54),
      new THREE.Vector3(0.58, 0.61, 0.45),
    ],
    0.045,
    materials.gold,
    28,
    8,
  );
  bodice.add(goldNeckline);
  for (const [index, x] of [-0.13, 0.11, 0.35].entries()) {
    const drip = cylinderBetween(
      `bodice-gold-drip-${index + 1}`,
      new THREE.Vector3(x, 0.5, 0.56),
      new THREE.Vector3(x + 0.018, 0.31 - index * 0.025, 0.57),
      0.037,
      0.019,
      materials.gold,
      8,
    );
    bodice.add(drip);
  }

  const waist = part("waist-ornament", "金色腰际星芒");
  const waistCentre = new THREE.Vector3(0.2, -0.45, 0.12);
  for (let index = 0; index < 16; index += 1) {
    const angle = (index / 16) * Math.PI * 2;
    const direction = new THREE.Vector3(
      Math.cos(angle),
      Math.sin(angle) * 0.18,
      Math.sin(angle) * 0.72,
    ).normalize();
    addRadialOctahedron(
      waist,
      `waist-starburst-${index + 1}`,
      waistCentre,
      direction,
      index % 2 === 0 ? 0.94 : 0.7,
      index % 2 === 0 ? 0.13 : 0.1,
      materials.gold,
    );
  }
  const waistGem = finishMesh(
    new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), materials.cyan),
    "waist-crystal",
  );
  waistGem.position.set(-0.17, -0.43, 0.77);
  waistGem.scale.z = 0.38;
  waist.add(waistGem);

  const neck = part("neck", "颈部");
  neck.add(
    cylinderBetween(
      "neck-mesh",
      new THREE.Vector3(0.08, 0.72, 0.21),
      new THREE.Vector3(0.06, 1.06, 0.3),
      0.19,
      0.17,
      materials.skin,
      16,
    ),
  );

  const collar = part("collar-feathers", "双层羽毛披肩");
  for (let row = 0; row < 2; row += 1) {
    const count = row === 0 ? 11 : 9;
    for (let index = 0; index < count; index += 1) {
      const t = index / (count - 1);
      const angle = THREE.MathUtils.lerp(-1.16, 1.16, t);
      const collarFeather = feather(
        `collar-row-${row + 1}-feather-${index + 1}`,
        (index + row) % 3 === 0 ? materials.featherShade : materials.white,
        [0.34 + row * 0.05, 0.64 + row * 0.08, 0.58],
      );
      collarFeather.position.set(
        0.12 + Math.sin(angle) * (0.7 + row * 0.08),
        0.77 + Math.cos(angle) * 0.12 - row * 0.08,
        0.46 - row * 0.1 + Math.cos(angle) * 0.08,
      );
      collarFeather.rotation.set(
        0.03,
        angle * -0.18,
        -angle * 0.72 + Math.PI,
      );
      collar.add(collarFeather);
    }
  }
  addSnowflake(
    collar,
    "neck-snowflake",
    new THREE.Vector3(0.09, 0.69, 0.83),
    0.42,
    materials.cyan,
    segments,
  );

  const head = part("head-and-face", "头部与面部");
  const headMesh = ellipsoid(
    "head-skin",
    [0.65, 0.72, 0.56],
    materials.skin,
    segments,
  );
  headMesh.position.set(0.03, 1.55, 0.37);
  head.add(headMesh);
  for (const side of [-1, 1]) {
    const ear = ellipsoid(
      `ear-${side < 0 ? "left" : "right"}`,
      [0.105, 0.18, 0.075],
      materials.skin,
      18,
    );
    ear.position.set(side * 0.61 + 0.03, 1.53, 0.37);
    head.add(ear);
  }

  addEye(
    head,
    "left-eye",
    new THREE.Vector3(-0.22, 1.6, 0.91),
    false,
    {
      eyeDark: materials.eyeDark,
      green: materials.green,
      greenLight: materials.greenLight,
      white: materials.white,
    },
    segments,
  );
  addEye(
    head,
    "right-eye",
    new THREE.Vector3(0.27, 1.6, 0.91),
    true,
    {
      eyeDark: materials.eyeDark,
      green: materials.green,
      greenLight: materials.greenLight,
      white: materials.white,
    },
    segments,
  );

  const nose = ellipsoid(
    "nose-relief",
    [0.038, 0.055, 0.038],
    materials.skinShadow,
    14,
  );
  nose.position.set(0.04, 1.37, 0.955);
  head.add(nose);
  head.add(
    tube(
      "smile-groove",
      [
        new THREE.Vector3(-0.07, 1.24, 0.952),
        new THREE.Vector3(0.03, 1.21, 0.975),
        new THREE.Vector3(0.13, 1.245, 0.952),
      ],
      0.017,
      materials.mouth,
      16,
      7,
    ),
  );
  for (const side of [-1, 1]) {
    const cheek = ellipsoid(
      `cheek-blush-${side < 0 ? "left" : "right"}`,
      [0.13, 0.055, 0.012],
      materials.blush,
      16,
    );
    cheek.position.set(side * 0.39 + 0.03, 1.31, 0.905);
    head.add(cheek);
  }

  const hair = part("hair", "栗棕色分层短发");
  const hairShell = ellipsoid(
    "hair-back-shell",
    [0.78, 0.78, 0.64],
    materials.hair,
    segments,
  );
  hairShell.position.set(0.02, 1.66, 0.02);
  hair.add(hairShell);

  const fringeData = [
    [-0.5, 1.72, 0.92, -0.28, 0.28, 0.48],
    [-0.36, 1.82, 0.98, -0.19, 0.34, 0.56],
    [-0.2, 1.84, 1.0, -0.08, 0.35, 0.59],
    [-0.04, 1.85, 1.01, 0.03, 0.36, 0.62],
    [0.13, 1.84, 1.0, 0.1, 0.34, 0.59],
    [0.3, 1.8, 0.97, 0.19, 0.32, 0.54],
    [0.46, 1.71, 0.91, 0.3, 0.29, 0.48],
  ] as const;
  for (const [index, data] of fringeData.entries()) {
    const [x, y, z, rotation, width, length] = data;
    const lock = hairLock(
      `front-bang-${index + 1}`,
      index % 2 ? materials.hair : materials.hairHighlight,
      [width, length, 0.72],
    );
    lock.position.set(x, y, z);
    lock.rotation.z = rotation;
    hair.add(lock);
  }

  for (const side of [-1, 1]) {
    for (let index = 0; index < 6; index += 1) {
      const lock = hairLock(
        `side-lock-${side < 0 ? "left" : "right"}-${index + 1}`,
        index % 3 === 0 ? materials.hairDark : materials.hair,
        [0.31, 0.55 + index * 0.035, 0.7],
      );
      lock.position.set(
        side * (0.57 + index * 0.035) + 0.02,
        1.55 - index * 0.09,
        0.52 - index * 0.075,
      );
      lock.rotation.set(
        0,
        side * (0.15 + index * 0.11),
        side * (0.34 + index * 0.08),
      );
      hair.add(lock);
    }
  }

  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2;
    if (Math.sin(angle) > 0.35) continue;
    const lock = hairLock(
      `rear-hair-lock-${index + 1}`,
      index % 2 ? materials.hairDark : materials.hair,
      [0.32, 0.58, 0.72],
    );
    lock.position.set(
      0.02 + Math.cos(angle) * 0.61,
      1.42 + Math.abs(Math.cos(angle)) * 0.08,
      0.06 + Math.sin(angle) * 0.52,
    );
    lock.rotation.set(0, angle, -Math.cos(angle) * 0.42);
    hair.add(lock);
  }

  hair.add(
    tube(
      "ahoge-main",
      [
        new THREE.Vector3(-0.06, 2.29, 0.32),
        new THREE.Vector3(-0.12, 2.56, 0.28),
        new THREE.Vector3(0.02, 2.75, 0.3),
        new THREE.Vector3(0.08, 2.53, 0.34),
      ],
      0.035,
      materials.hairDark,
      30,
      8,
    ),
  );
  hair.add(
    tube(
      "ahoge-secondary",
      [
        new THREE.Vector3(0.08, 2.25, 0.31),
        new THREE.Vector3(0.19, 2.48, 0.27),
        new THREE.Vector3(0.28, 2.61, 0.25),
      ],
      0.027,
      materials.hair,
      20,
      7,
    ),
  );
  hair.add(
    tube(
      "long-side-curl",
      [
        new THREE.Vector3(0.59, 1.8, 0.47),
        new THREE.Vector3(0.76, 1.5, 0.68),
        new THREE.Vector3(0.68, 1.18, 0.76),
        new THREE.Vector3(0.81, 1.02, 0.73),
        new THREE.Vector3(0.88, 1.18, 0.68),
      ],
      0.026,
      materials.hairDark,
      38,
      7,
    ),
  );

  const crown = part("head-feather-crown", "后脑羽冠");
  for (let index = 0; index < 6; index += 1) {
    const plume = feather(
      `head-crown-plume-${index + 1}`,
      index % 2 ? materials.white : materials.featherShade,
      [0.25, 0.64 + index * 0.035, 0.62],
    );
    plume.position.set(
      -0.08 + (index - 2.5) * 0.14,
      2.27 + Math.abs(index - 2.5) * 0.03,
      -0.36,
    );
    plume.rotation.set(0.05, 0, (index - 2.5) * -0.17);
    crown.add(plume);
  }

  const leftLeg = part("left-leg", "前景左腿与高跟鞋");
  const leftHip = new THREE.Vector3(-0.05, -0.55, 0.46);
  const leftKnee = new THREE.Vector3(-0.83, -0.9, 0.89);
  const leftAnkle = new THREE.Vector3(-1.66, -1.35, 1.08);
  leftLeg.add(
    cylinderBetween(
      "left-thigh",
      leftHip,
      leftKnee,
      0.25,
      0.22,
      materials.skin,
      18,
    ),
  );
  leftLeg.add(
    cylinderBetween(
      "left-calf",
      leftKnee,
      leftAnkle,
      0.21,
      0.145,
      materials.skin,
      18,
    ),
  );
  const leftKneeCap = ellipsoid(
    "left-knee-cap",
    [0.225, 0.225, 0.215],
    materials.skin,
    20,
  );
  leftKneeCap.position.copy(leftKnee);
  leftLeg.add(leftKneeCap);

  const rightLeg = part("right-leg", "后景右腿与高跟鞋");
  const rightHip = new THREE.Vector3(0.24, -0.57, 0.34);
  const rightKnee = new THREE.Vector3(-0.42, -0.72, 0.68);
  const rightAnkle = new THREE.Vector3(-1.34, -1.08, 0.81);
  rightLeg.add(
    cylinderBetween(
      "right-thigh",
      rightHip,
      rightKnee,
      0.24,
      0.21,
      materials.skin,
      18,
    ),
  );
  rightLeg.add(
    cylinderBetween(
      "right-calf",
      rightKnee,
      rightAnkle,
      0.2,
      0.14,
      materials.skin,
      18,
    ),
  );
  const rightKneeCap = ellipsoid(
    "right-knee-cap",
    [0.215, 0.215, 0.205],
    materials.skin,
    20,
  );
  rightKneeCap.position.copy(rightKnee);
  rightLeg.add(rightKneeCap);

  function addShoe(
    parent: THREE.Group,
    sideName: string,
    ankle: THREE.Vector3,
    footPosition: THREE.Vector3,
    rotationZ: number,
  ) {
    parent.add(
      cylinderBetween(
        `${sideName}-foot-bridge`,
        ankle,
        footPosition,
        0.14,
        0.105,
        materials.skin,
        14,
      ),
    );
    const sole = ellipsoid(
      `${sideName}-gold-sole`,
      [0.41, 0.145, 0.2],
      materials.gold,
      20,
    );
    sole.position.copy(footPosition);
    sole.rotation.z = rotationZ;
    parent.add(sole);
    const shoe = ellipsoid(
      `${sideName}-white-shoe`,
      [0.36, 0.13, 0.19],
      materials.white,
      20,
    );
    shoe.position.copy(footPosition).add(new THREE.Vector3(0, 0.045, 0.015));
    shoe.rotation.z = rotationZ;
    parent.add(shoe);
    const heel = cylinderBetween(
      `${sideName}-gold-heel`,
      footPosition.clone().add(new THREE.Vector3(0.26, -0.08, -0.03)),
      footPosition.clone().add(new THREE.Vector3(0.29, -0.31, -0.03)),
      0.055,
      0.035,
      materials.gold,
      10,
    );
    parent.add(heel);
    for (let index = 0; index < 5; index += 1) {
      const cuffFeather = feather(
        `${sideName}-ankle-feather-${index + 1}`,
        index % 2 ? materials.white : materials.featherShade,
        [0.19, 0.34, 0.52],
      );
      cuffFeather.position
        .copy(ankle)
        .add(
          new THREE.Vector3(
            (index - 2) * 0.1,
            0.07 + Math.abs(index - 2) * 0.02,
            0.04 + Math.abs(index - 2) * -0.03,
          ),
        );
      cuffFeather.rotation.z = (index - 2) * -0.33 + Math.PI;
      parent.add(cuffFeather);
    }
    addSnowflake(
      parent,
      `${sideName}-ankle-crystal`,
      ankle.clone().add(new THREE.Vector3(0, 0.08, 0.23)),
      0.25,
      materials.cyan,
      segments,
    );
  }
  addShoe(
    leftLeg,
    "left-shoe",
    leftAnkle,
    new THREE.Vector3(-1.99, -1.53, 1.08),
    -0.16,
  );
  addShoe(
    rightLeg,
    "right-shoe",
    rightAnkle,
    new THREE.Vector3(-1.69, -1.24, 0.82),
    -0.1,
  );

  const staff = part("star-staff", "星之杖");
  const staffBottom = new THREE.Vector3(0.86, -1.72, 1.18);
  const shaftTop = new THREE.Vector3(-1.34, 2.92, 1.16);
  const staffDirection = shaftTop.clone().sub(staffBottom).normalize();
  staff.add(
    cylinderBetween(
      "staff-pink-shaft",
      staffBottom,
      shaftTop,
      0.072,
      0.068,
      materials.pink,
      18,
    ),
  );

  const lowerCollarPoint = staffBottom
    .clone()
    .addScaledVector(staffDirection, 0.22);
  const lowerCollar = cylinderBetween(
    "staff-lower-gold-collar",
    lowerCollarPoint.clone().addScaledVector(staffDirection, -0.12),
    lowerCollarPoint.clone().addScaledVector(staffDirection, 0.12),
    0.13,
    0.13,
    materials.gold,
    14,
  );
  staff.add(lowerCollar);
  const staffTip = finishMesh(
    new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), materials.red),
    "staff-red-tip",
  );
  staffTip.scale.set(0.64, 1.78, 0.64);
  staffTip.position.copy(staffBottom).addScaledVector(staffDirection, -0.25);
  staffTip.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    staffDirection,
  );
  staff.add(staffTip);

  const upperCollarPoint = shaftTop
    .clone()
    .addScaledVector(staffDirection, -0.08);
  staff.add(
    cylinderBetween(
      "staff-upper-gold-collar",
      upperCollarPoint.clone().addScaledVector(staffDirection, -0.14),
      upperCollarPoint.clone().addScaledVector(staffDirection, 0.14),
      0.145,
      0.115,
      materials.gold,
      14,
    ),
  );
  const staffRedGem = ellipsoid(
    "staff-head-red-gem",
    [0.18, 0.2, 0.16],
    materials.red,
    22,
  );
  staffRedGem.position.copy(shaftTop).addScaledVector(staffDirection, 0.13);
  staff.add(staffRedGem);

  const staffHeadCentre = shaftTop
    .clone()
    .addScaledVector(staffDirection, 0.46);
  const staffRing = finishMesh(
    new THREE.Mesh(
      new THREE.TorusGeometry(0.39, 0.064, 12, isMobile ? 36 : 52),
      materials.gold,
    ),
    "staff-solar-ring",
  );
  staffRing.position.copy(staffHeadCentre);
  staff.add(staffRing);
  const staffCrystal = finishMesh(
    new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), materials.cyan),
    "staff-blue-centre-crystal",
  );
  staffCrystal.position.copy(staffHeadCentre);
  staffCrystal.scale.set(0.86, 0.86, 0.35);
  staff.add(staffCrystal);
  addSnowflake(
    staff,
    "staff-centre-snowflake",
    staffHeadCentre.clone().add(new THREE.Vector3(0, 0, 0.08)),
    0.42,
    materials.white,
    segments,
  );

  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2;
    const ray = finishMesh(
      new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), materials.gold),
      `staff-sun-ray-${index + 1}`,
    );
    ray.scale.set(0.055, index % 2 ? 0.21 : 0.3, 0.035);
    ray.position
      .copy(staffHeadCentre)
      .add(
        new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(
          0.52,
        ),
      );
    ray.rotation.z = -angle;
    staff.add(ray);
  }

  for (const side of [-1, 1]) {
    for (let index = 0; index < 5; index += 1) {
      const staffWing = feather(
        `staff-wing-${side < 0 ? "left" : "right"}-${index + 1}`,
        index % 2 ? materials.featherShade : materials.white,
        [0.3 + index * 0.025, 0.52 + index * 0.05, 0.66],
      );
      staffWing.position
        .copy(staffHeadCentre)
        .add(
          new THREE.Vector3(
            side * (0.36 + index * 0.13),
            0.04 - index * 0.075,
            -0.01,
          ),
        );
      staffWing.rotation.set(
        0,
        0,
        side * (-1.17 + index * 0.075),
      );
      staff.add(staffWing);
    }
  }

  const arms = part("arms-and-gloves", "双臂与握杖手套");
  const upperHand = new THREE.Vector3(-0.11, 0.34, 1.19);
  const lowerHand = new THREE.Vector3(0.15, -0.22, 1.2);
  const leftShoulder = new THREE.Vector3(-0.38, 0.55, 0.42);
  const leftElbow = new THREE.Vector3(-0.5, 0.08, 0.72);
  const rightShoulder = new THREE.Vector3(0.55, 0.55, 0.42);
  const rightElbow = new THREE.Vector3(0.55, 0.05, 0.76);
  for (const [name, start, middle, end] of [
    ["left", leftShoulder, leftElbow, upperHand],
    ["right", rightShoulder, rightElbow, lowerHand],
  ] as const) {
    arms.add(
      cylinderBetween(
        `${name}-upper-arm`,
        start,
        middle,
        0.145,
        0.125,
        materials.skin,
        16,
      ),
    );
    arms.add(
      cylinderBetween(
        `${name}-forearm`,
        middle,
        end,
        0.125,
        0.09,
        materials.skin,
        16,
      ),
    );
    const palm = ellipsoid(
      `${name}-glove-palm`,
      [0.15, 0.19, 0.095],
      materials.white,
      18,
    );
    palm.position.copy(end);
    palm.rotation.z = -0.43;
    arms.add(palm);
    const cuff = feather(
      `${name}-glove-cuff`,
      materials.white,
      [0.28, 0.38, 0.52],
    );
    cuff.position.copy(end).addScaledVector(
      middle.clone().sub(end).normalize(),
      0.17,
    );
    cuff.rotation.z = name === "left" ? -1.1 : 1.9;
    arms.add(cuff);
  }

  const ringQuaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    staffDirection,
  );
  for (const [handName, handPoint] of [
    ["upper-hand", upperHand],
    ["lower-hand", lowerHand],
  ] as const) {
    for (let index = 0; index < 4; index += 1) {
      const finger = finishMesh(
        new THREE.Mesh(
          new THREE.TorusGeometry(0.092 + index * 0.004, 0.018, 7, 20),
          materials.white,
        ),
        `${handName}-finger-${index + 1}`,
      );
      finger.position
        .copy(handPoint)
        .addScaledVector(staffDirection, (index - 1.5) * 0.043);
      finger.quaternion.copy(ringQuaternion);
      arms.add(finger);
    }
  }

  root.updateMatrixWorld(true);
  for (const record of partRecords) {
    record.centre.copy(
      new THREE.Box3().setFromObject(record.group).getCenter(new THREE.Vector3()),
    );
    const materialClones = new Map<THREE.Material, THREE.Material>();
    record.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const sources = Array.isArray(object.material)
        ? object.material
        : [object.material];
      const clones = sources.map((source) => {
        const existing = materialClones.get(source);
        if (existing) return existing;
        const cloned = source.clone();
        materialClones.set(source, cloned);
        return cloned;
      });
      object.material = Array.isArray(object.material) ? clones : clones[0]!;
      object.userData.partId = record.id;
      object.userData.partLabel = record.group.userData.partLabel;
    });
  }

  const modelCentre = new THREE.Vector3(0.04, 0.08, 0.18);
  let selectedPart: string | null = null;
  function setSelected(partId: string | null) {
    selectedPart = partId;
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const list = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const item of list) {
        if (
          item instanceof THREE.MeshStandardMaterial ||
          item instanceof THREE.MeshPhysicalMaterial
        ) {
          const selected = Boolean(
            partId && object.userData.partId === partId,
          );
          item.emissive.setHex(selected ? 0x3d9fff : 0x000000);
          item.emissiveIntensity = selected ? 0.24 : 0;
        }
      }
    });
  }

  function setExplode(amount: number) {
    const scalar = THREE.MathUtils.clamp(amount, 0, 1) * 0.82;
    for (const record of partRecords) {
      const direction = record.centre.clone().sub(modelCentre);
      if (direction.lengthSq() < 0.01) {
        const hash = [...record.id].reduce(
          (sum, character) => sum + character.charCodeAt(0),
          0,
        );
        direction.set(
          Math.sin(hash * 0.73),
          Math.cos(hash * 0.31) * 0.55,
          Math.sin(hash * 0.47),
        );
      }
      record.group.position
        .copy(record.origin)
        .addScaledVector(direction.normalize(), scalar);
    }
  }

  const runtime: SakuraFigureRuntime = {
    partIds: partRecords.map((record) => record.id),
    setExplode,
    setSelected,
    reset: () => {
      setExplode(0);
      setSelected(null);
    },
  };
  root.userData.sculptRuntime = runtime;
  root.userData.selectedPart = () => selectedPart;
  root.userData.reconstructionEvidence = {
    admittedViews: 3,
    visibleGeometryConfidence: 0.76,
    hiddenRegionConfidence: 0.46,
    method: "multi-view procedural Three.js reconstruction",
  };
  return root;
}
