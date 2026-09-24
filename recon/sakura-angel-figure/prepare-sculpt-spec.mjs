import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const specPath = path.join(directory, "object-sculpt-spec.json");
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const sourceComponent = spec.componentTree.find((component) => component.id === "head");
const sourceMaterial = spec.materials.find((material) => material.id === "base");

const materialRecipes = {
  hidden: ["rgba(255,255,255,0)", "rgba(255,255,255,0)", "plastic"],
  skin: ["rgba(255,218,194,1)", "rgba(246,184,162,1)", "skin"],
  hair: ["rgba(139,77,52,1)", "rgba(84,42,33,1)", "plastic"],
  "feather-white": ["rgba(250,248,242,1)", "rgba(220,225,229,1)", "plastic"],
  "metallic-gold": ["rgba(230,181,53,1)", "rgba(139,83,14,1)", "metal"],
  "staff-pink": ["rgba(239,91,143,1)", "rgba(171,32,86,1)", "plastic"],
  "crystal-cyan": ["rgba(151,232,245,0.68)", "rgba(74,170,207,0.48)", "glass"],
  "crystal-red": ["rgba(187,27,53,0.94)", "rgba(92,6,26,0.98)", "glass"],
  eyes: ["rgba(90,144,81,1)", "rgba(21,53,26,1)", "glass"],
  mouth: ["rgba(192,94,91,1)", "rgba(130,49,56,1)", "plastic"],
  "smoked-base": ["rgba(64,54,84,0.72)", "rgba(30,42,78,0.82)", "glass"],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function actionProfile(id, material, role = "static") {
  const profile = clone(sourceComponent.actionProfile);
  profile.animationRole = role;
  profile.pivot.mode = "semantic-root";
  profile.pivot.confidence = 0.72;
  profile.collider.type = "capsule";
  profile.collider.notes = "simplified selection and orbit proxy";
  profile.destruction.fractureGroup = id;
  profile.destruction.debrisMaterial = material;
  profile.sockets = [
    {
      id: `${id}-socket`,
      localPosition: [0, 0, 0],
      localAxis: [0, 1, 0],
    },
  ];
  return profile;
}

function attachment(parent, start = [0, 0, 0], end = [0, 0.1, 0]) {
  return {
    parentId: parent,
    parentSocket: `${parent}-socket`,
    localStart: start,
    localEnd: end,
    contactType: "embedded-overlap",
    embedDepth: 0.035,
    overlap: 0.045,
    gapTolerance: 0.012,
    baseRadius: 0.04,
    endRadius: 0.035,
    evidenceRefs: ["front-wide", "back-view"],
  };
}

function component({
  id,
  name,
  level,
  role,
  primitive,
  topologyClass,
  rationale,
  parent = "root",
  material,
  dimensions,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  features = [],
  evidence = ["front-wide"],
  confidence = 0.8,
  importance = 0.8,
  animationRole = "static",
}) {
  const result = clone(sourceComponent);
  const recipe = materialRecipes[material] ?? materialRecipes["feather-white"];
  result.id = id;
  result.name = name;
  result.level = level;
  result.role = role;
  result.importance = importance;
  result.confidence = confidence;
  result.primitive = primitive;
  result.topologyClass = topologyClass;
  result.topologyRationale = rationale;
  result.geometryDescriptor.topologyIntent = rationale;
  result.geometryDescriptor.edgeTreatment = {
    type: topologyClass === "assembled-solid" ? "micro-bevel" : "continuous-soft-transition",
    bevelRadius: topologyClass === "assembled-solid" ? 0.018 : 0.008,
    segments: 3,
  };
  result.parent = parent;
  result.attachment = parent ? attachment(parent) : null;
  result.dimensions = {
    width: dimensions[0],
    height: dimensions[1],
    depth: dimensions[2],
    units: "relative",
    confidence,
  };
  result.transform = {
    position,
    rotation,
    scale: [1, 1, 1],
  };
  result.actionProfile = actionProfile(id, material, animationRole);
  result.material = material;
  result.materialLayers = [material];
  result.localFeatures = features;
  result.surfaceDetail = {
    macroRoughness: topologyClass === "continuous-sculpt" ? 0.38 : 0.28,
    microRoughness: 0.08,
    bumpAmplitude: 0.008,
    normalPattern: "subtle injection-moulded PVC highlight breakup",
    displacementPattern: "geometry for silhouette-critical relief only",
    occlusionPattern: "contact darkening at layered overlaps",
    edgeWearPattern: "none; display-condition collectible",
    notes: "Reference-derived material response; no painted fake depth.",
  };
  result.evidenceRefs = evidence;
  result.details = features;
  result.fidelityTier = level === "macro" ? "blockout" : level === "meso" ? "structural" : "feature";
  result.colorMaterialRecipe = {
    dominantAlbedo: recipe[0],
    secondaryAlbedo: recipe[1],
    materialClass: recipe[2],
    materialClassConfidence: 0.82,
    colorGradient: {
      type: "linear",
      stops: [
        {offset: 0, color: recipe[0]},
        {offset: 1, color: recipe[1]},
      ],
    },
    evidenceRefs: evidence,
  };
  return result;
}

spec.suitability = "conditional";
spec.scores = {
  silhouette: 3,
  proportions: 3,
  materials: 3,
  details: 3,
  actionReadiness: 2,
};
spec.referenceCamera = JSON.parse(
  fs.readFileSync(path.join(directory, "camera-front.json"), "utf8"),
);
spec.qualityTargets = {
  targetFidelity: 0.88,
  mustMatch: [
    "front and rear silhouette",
    "4.5-head stylized proportions and seated leg sweep",
    "green eye, layered bob, ahoge and side-curl placement",
    "diagonal staff proportions, hand contact and winged solar head",
    "collar and skirt feather repetition with asymmetric rear tail",
    "distinct PVC, gold, lacquer, crystal and smoked-base response",
  ],
  niceToHave: [
    "subtle moulded-PVC surface breakup",
    "fine finger segmentation visible at close orbit",
    "soft blue crystal caustic impression without expensive refraction",
  ],
  fpsTarget: 60,
  reviewViewpoints: [
    "front-reference",
    "rear-reference",
    "three-quarter-left",
    "three-quarter-right",
    "top-oblique",
  ],
};
spec.lookDevTargets.qualityPriority = "balanced-reference-real-time";
spec.lookDevTargets.materialPass.minimumTextureResolution = 512;
spec.lookDevTargets.materialPass.preferredTextureResolution = 1024;
spec.lookDevTargets.materialPass.referencePbrExtraction.requiredWhenSourceImagePresent = false;
spec.lookDevTargets.materialPass.referencePbrExtraction.acceptedLimitation =
  "The supplied photographs include background and baked lighting. Materials use de-lit palette evidence and independent procedural PBR channels; no exact inverse-rendering claim.";
spec.performanceBudget = {
  qualityPriority: "hero-browser-reconstruction",
  targetTriangles: 185000,
  maxDrawCalls: 145,
  textureSize: 1024,
  fpsTarget: 60,
  optimizationPolicy:
    "Preserve the face, hair silhouette, staff head and feather boundaries; instance repeated feather/ray/crystal systems and lazy-load Three.js only on the collectible route.",
};
spec.viewEvidence = [
  {
    id: "front-wide",
    view: "front three-quarter",
    image: "references/front-wide.png",
    imageRegion: {x: 0, y: 0, width: 1, height: 1, units: "normalized"},
    observations: [
      "whole figure, staff endpoints, seated pose, feather skirt and shoe silhouette",
    ],
    confidence: 0.88,
  },
  {
    id: "front-close",
    view: "front close",
    image: "references/front-close.png",
    imageRegion: {x: 0, y: 0, width: 1, height: 1, units: "normalized"},
    observations: [
      "green eyes, hair locks, collar layers, hand grip, gold bodice trim and cyan crystals",
    ],
    confidence: 0.92,
  },
  {
    id: "back-view",
    view: "rear three-quarter",
    image: "references/back.png",
    imageRegion: {x: 0, y: 0, width: 1, height: 1, units: "normalized"},
    observations: [
      "rear bob shell, crown feather, back trim, waist starburst and long rear feather tail",
    ],
    confidence: 0.9,
  },
];

spec.componentTree = [
  component({
    id: "root", name: "Sakura angel figure root", level: "macro", role: "root",
    primitive: "ellipsoid", topologyClass: "assembled-solid",
    rationale: "Hidden semantic root groups all selectable solid parts around the display centre.",
    parent: null, material: "hidden", dimensions: [4.8, 6.5, 3.5], confidence: 0.86,
    evidence: ["front-wide", "back-view"], importance: 1, animationRole: "root",
  }),
  component({
    id: "display-base", name: "Smoked iridescent display base", level: "macro", role: "support",
    primitive: "cylinder", topologyClass: "assembled-solid",
    rationale: "A low transparent plinth is visible through gaps beneath the feather skirt.",
    material: "smoked-base", dimensions: [4.45, 0.26, 3.05], position: [0.15, -2.08, 0],
    features: ["display-base.iridescent-clear"], evidence: ["front-wide", "back-view"], confidence: 0.58,
  }),
  component({
    id: "feather-skirt", name: "Concentric feather skirt assembly", level: "macro", role: "shell",
    primitive: "instanced-cluster", topologyClass: "conforming-shell",
    rationale: "Three overlapping radial rings of separately tapered feathers form the dominant skirt volume.",
    material: "feather-white", dimensions: [4.75, 1.85, 3.28], position: [0.16, -1.38, -0.04],
    features: ["feather-skirt.concentric-rings", "feather-skirt.rear-tail"], evidence: ["front-wide", "back-view"], confidence: 0.93, importance: 1,
  }),
  component({
    id: "dress-core", name: "Seated dress and pelvis core", level: "macro", role: "shell",
    primitive: "lathe", topologyClass: "conforming-shell",
    rationale: "A bell-shaped dress core supports the body and anchors feather plates while hiding inferred pelvis geometry.",
    material: "feather-white", dimensions: [2.1, 1.72, 1.72], position: [0.24, -0.74, -0.08],
    evidence: ["front-wide", "back-view"], confidence: 0.64,
  }),
  component({
    id: "torso", name: "Upright torso", level: "macro", role: "body",
    primitive: "capsule", topologyClass: "continuous-sculpt",
    rationale: "The upper body is a compact organic volume with slight twist and tapered waist.",
    material: "skin", dimensions: [1.05, 1.55, 0.72], position: [0.25, 0.42, 0.04],
    evidence: ["front-close", "back-view"], confidence: 0.76, importance: 1,
  }),
  component({
    id: "head", name: "Stylized head and jaw", level: "macro", role: "body",
    primitive: "ellipsoid", topologyClass: "continuous-sculpt",
    rationale: "The large tapered anime head is a rounded volume with a shallow face plane and narrower chin.",
    material: "skin", dimensions: [1.38, 1.52, 1.18], position: [0.18, 1.92, 0.04],
    evidence: ["front-close", "back-view"], confidence: 0.86, importance: 1,
  }),
  component({
    id: "hair", name: "Chestnut bob hair assembly", level: "macro", role: "hair",
    primitive: "instanced-cluster", topologyClass: "fiber-strand",
    rationale: "A rear shell plus many pointed overlapping locks creates the bob rather than a smooth helmet.",
    material: "hair", dimensions: [1.7, 1.58, 1.48], position: [0.15, 2.02, -0.07],
    features: ["hair.lock-repetition", "hair.ahoge-curves", "hair.side-curl"], evidence: ["front-close", "back-view"], confidence: 0.91, importance: 1,
  }),
  component({
    id: "collar", name: "Layered feather collar", level: "macro", role: "shell",
    primitive: "instanced-cluster", topologyClass: "conforming-shell",
    rationale: "Two offset rows of separate feathers radiate from the neck and shoulders.",
    material: "feather-white", dimensions: [2.25, 0.76, 1.08], position: [0.18, 0.98, 0.02],
    features: ["collar.feather-repetition"], evidence: ["front-close", "back-view"], confidence: 0.9,
  }),
  component({
    id: "left-leg", name: "Left sweeping leg", level: "macro", role: "limb",
    primitive: "curve-sweep", topologyClass: "continuous-sculpt",
    rationale: "The exposed leg follows a bent three-dimensional centreline from hidden hip to viewer-left ankle.",
    material: "skin", dimensions: [2.45, 0.52, 0.5], position: [-0.6, -0.72, 0.34],
    features: ["legs.crossed-seated-pose"], evidence: ["front-wide"], confidence: 0.78, animationRole: "limb",
  }),
  component({
    id: "right-leg", name: "Right crossing leg", level: "macro", role: "limb",
    primitive: "curve-sweep", topologyClass: "continuous-sculpt",
    rationale: "A second bent leg overlaps the first and exits the feather skirt at a different depth.",
    material: "skin", dimensions: [2.25, 0.5, 0.48], position: [-0.42, -0.9, 0.52],
    features: ["legs.crossed-seated-pose"], evidence: ["front-wide"], confidence: 0.73, animationRole: "limb",
  }),
  component({
    id: "left-arm", name: "Left staff-gripping arm", level: "macro", role: "limb",
    primitive: "curve-sweep", topologyClass: "continuous-sculpt",
    rationale: "The arm bends from shoulder to an upper staff grip and must remain volumetric around the elbow.",
    material: "skin", dimensions: [1.35, 0.32, 0.32], position: [-0.22, 0.55, 0.38],
    evidence: ["front-close", "back-view"], confidence: 0.7, animationRole: "limb",
  }),
  component({
    id: "right-arm", name: "Right staff-gripping arm", level: "macro", role: "limb",
    primitive: "curve-sweep", topologyClass: "continuous-sculpt",
    rationale: "The opposite arm reaches a lower grip with a distinct elbow bend and depth offset.",
    material: "skin", dimensions: [1.45, 0.32, 0.32], position: [0.38, 0.44, 0.42],
    evidence: ["front-close", "back-view"], confidence: 0.69, animationRole: "limb",
  }),
  component({
    id: "staff", name: "Ceremonial winged staff assembly", level: "macro", role: "prop",
    primitive: "tube", topologyClass: "assembled-solid",
    rationale: "The long diagonal prop combines a cylindrical shaft, collars, pointed tip and a complex winged head.",
    material: "staff-pink", dimensions: [0.26, 5.75, 0.26], position: [0.05, 0.3, 0.52],
    features: ["staff-shaft.pink-clearcoat"], evidence: ["front-wide", "back-view"], confidence: 0.92, importance: 1, animationRole: "prop",
  }),
  component({
    id: "face", name: "Face feature plane", level: "meso", role: "face",
    primitive: "ellipsoid", topologyClass: "surface-relief",
    rationale: "A shallow curved facial surface carries eye sockets, nose relief, mouth groove and blush.",
    parent: "head", material: "skin", dimensions: [1.1, 0.86, 0.16], position: [0, -0.08, 0.52],
    features: ["face.mouth-and-blush"], evidence: ["front-close"], confidence: 0.86,
  }),
  component({
    id: "eyes", name: "Green eye pair", level: "meso", role: "face",
    primitive: "ellipsoid", topologyClass: "assembled-solid",
    rationale: "Two glossy convex eye volumes carry separate green gradients, pupils, lashes and catchlights.",
    parent: "face", material: "eyes", dimensions: [0.72, 0.34, 0.11], position: [0, 0.12, 0.08],
    features: ["eyes.iris-gradient-catchlights"], evidence: ["front-close"], confidence: 0.93, importance: 1,
  }),
  component({
    id: "mouth", name: "Smile groove and cheek colour", level: "micro", role: "face-detail",
    primitive: "tube", topologyClass: "surface-relief",
    rationale: "A short curved groove and two thin blush patches define the small smile.",
    parent: "face", material: "mouth", dimensions: [0.27, 0.06, 0.04], position: [0, -0.2, 0.11],
    features: ["face.mouth-and-blush"], evidence: ["front-close"], confidence: 0.8,
  }),
  component({
    id: "nose", name: "Tiny nose relief", level: "micro", role: "face-detail",
    primitive: "ellipsoid", topologyClass: "surface-relief",
    rationale: "A subtle convex wedge catches light between the eyes and mouth without a realistic nose mass.",
    parent: "face", material: "skin", dimensions: [0.09, 0.11, 0.06], position: [0, -0.07, 0.1],
    evidence: ["front-close"], confidence: 0.61,
  }),
  component({
    id: "hair-back-shell", name: "Rear bob shell", level: "meso", role: "hair",
    primitive: "ellipsoid", topologyClass: "conforming-shell",
    rationale: "A rounded rear cap provides depth beneath independently modelled pointed hair locks.",
    parent: "hair", material: "hair", dimensions: [1.55, 1.38, 1.34], position: [0, 0.02, -0.14],
    evidence: ["back-view"], confidence: 0.84,
  }),
  component({
    id: "hair-locks", name: "Layered bob lock system", level: "meso", role: "hair",
    primitive: "instanced-cluster", topologyClass: "fiber-strand",
    rationale: "Twenty-four tapered curved locks overlap the cap and define the scalloped silhouette.",
    parent: "hair", material: "hair", dimensions: [1.72, 1.52, 1.48], position: [0, -0.02, 0],
    features: ["hair.lock-repetition"], evidence: ["front-close", "back-view"], confidence: 0.92,
  }),
  component({
    id: "hair-bangs", name: "Front bang lock system", level: "meso", role: "hair",
    primitive: "instanced-cluster", topologyClass: "fiber-strand",
    rationale: "Eight shorter pointed locks cross the forehead at different angles and depths.",
    parent: "hair", material: "hair", dimensions: [1.32, 0.64, 0.42], position: [0, 0.25, 0.55],
    features: ["hair.lock-repetition"], evidence: ["front-close"], confidence: 0.91,
  }),
  component({
    id: "ahoge", name: "Twin ahoge curves", level: "micro", role: "hair-strand",
    primitive: "tube", topologyClass: "fiber-strand",
    rationale: "Two narrow three-dimensional curves emerge from the crown and bend independently.",
    parent: "hair", material: "hair", dimensions: [0.52, 0.58, 0.18], position: [0.06, 0.77, 0.02],
    features: ["hair.ahoge-curves"], evidence: ["front-close"], confidence: 0.9, animationRole: "strand",
  }),
  component({
    id: "side-curl", name: "Long side curl", level: "micro", role: "hair-strand",
    primitive: "tube", topologyClass: "fiber-strand",
    rationale: "A thin S-curved strand hangs free from the side of the bob and must hold in orbit.",
    parent: "hair", material: "hair", dimensions: [0.28, 0.8, 0.22], position: [0.66, -0.12, 0.3],
    features: ["hair.side-curl"], evidence: ["front-close"], confidence: 0.88, animationRole: "strand",
  }),
  component({
    id: "head-feather-crown", name: "White feather crown fan", level: "meso", role: "ornament",
    primitive: "instanced-cluster", topologyClass: "assembled-solid",
    rationale: "Six narrow feather blades rise behind the hair and form a visible crown-like fan.",
    parent: "hair", material: "feather-white", dimensions: [0.88, 0.72, 0.22], position: [0.1, 0.71, -0.3],
    features: ["head-ornament.feather-fan"], evidence: ["back-view", "front-close"], confidence: 0.87,
  }),
  component({
    id: "bodice", name: "White fitted bodice", level: "meso", role: "shell",
    primitive: "lathe", topologyClass: "conforming-shell",
    rationale: "A fitted white shell follows the torso and supports raised gold front and rear trim.",
    parent: "torso", material: "feather-white", dimensions: [1.12, 1.18, 0.78], position: [0, 0, 0],
    features: ["bodice.gold-drip-trim", "bodice.back-gold-trim"], evidence: ["front-close", "back-view"], confidence: 0.86,
  }),
  component({
    id: "bodice-gold-trim", name: "Raised gold bodice trim", level: "micro", role: "trim",
    primitive: "extrude", topologyClass: "surface-relief",
    rationale: "Thin raised metallic profiles follow the front drip contour and rear wrap seam.",
    parent: "bodice", material: "metallic-gold", dimensions: [1.04, 0.7, 0.06], position: [0, 0.08, 0.39],
    features: ["bodice.gold-drip-trim", "bodice.back-gold-trim"], evidence: ["front-close", "back-view"], confidence: 0.84,
  }),
  component({
    id: "collar-feathers", name: "Double-row collar feathers", level: "meso", role: "ornament",
    primitive: "instanced-cluster", topologyClass: "conforming-shell",
    rationale: "Sixteen tapered feathers overlap in inner and outer arcs around the shoulders.",
    parent: "collar", material: "feather-white", dimensions: [2.18, 0.7, 1.04], position: [0, 0, 0],
    features: ["collar.feather-repetition"], evidence: ["front-close", "back-view"], confidence: 0.92,
  }),
  component({
    id: "neck-crystal", name: "Cyan neck snowflake", level: "micro", role: "ornament",
    primitive: "instanced-cluster", topologyClass: "assembled-solid",
    rationale: "Six translucent faceted rays radiate from a central cyan gem at the collar.",
    parent: "collar", material: "crystal-cyan", dimensions: [0.46, 0.46, 0.12], position: [0, -0.06, 0.53],
    features: ["crystal.neck-snowflake"], evidence: ["front-close"], confidence: 0.9,
  }),
  component({
    id: "waist-ornament", name: "Gold waist starburst", level: "meso", role: "ornament",
    primitive: "instanced-cluster", topologyClass: "assembled-solid",
    rationale: "Layered thin metallic star plates project from both hips and the lower back.",
    parent: "dress-core", material: "metallic-gold", dimensions: [2.62, 0.72, 1.7], position: [0, 0.58, 0],
    features: ["waist-ornament.starburst-plates"], evidence: ["front-close", "back-view"], confidence: 0.94,
  }),
  component({
    id: "skirt-ring-inner", name: "Inner feather ring", level: "meso", role: "feather-system",
    primitive: "instanced-cluster", topologyClass: "conforming-shell",
    rationale: "Short steep feathers bridge the dress core to the middle skirt ring.",
    parent: "feather-skirt", material: "feather-white", dimensions: [2.65, 1.15, 2.2], position: [0, 0.36, 0],
    features: ["feather-skirt.concentric-rings"], evidence: ["front-wide", "back-view"], confidence: 0.91,
  }),
  component({
    id: "skirt-ring-middle", name: "Middle feather ring", level: "meso", role: "feather-system",
    primitive: "instanced-cluster", topologyClass: "conforming-shell",
    rationale: "Medium feathers overlap the inner and outer rings with alternating angular offsets.",
    parent: "feather-skirt", material: "feather-white", dimensions: [3.75, 1.28, 2.75], position: [0, 0.08, 0],
    features: ["feather-skirt.concentric-rings"], evidence: ["front-wide", "back-view"], confidence: 0.94,
  }),
  component({
    id: "skirt-ring-outer", name: "Outer feather ring", level: "meso", role: "feather-system",
    primitive: "instanced-cluster", topologyClass: "conforming-shell",
    rationale: "Long low-angle feathers create the large radial rim seen around the base.",
    parent: "feather-skirt", material: "feather-white", dimensions: [4.68, 1.02, 3.2], position: [0, -0.22, 0],
    features: ["feather-skirt.concentric-rings"], evidence: ["front-wide", "back-view"], confidence: 0.95,
  }),
  component({
    id: "rear-feather-tail", name: "Asymmetric rear feather tail", level: "meso", role: "feather-system",
    primitive: "instanced-cluster", topologyClass: "assembled-solid",
    rationale: "Five extra-long feathers extend farther behind and to one side than the regular outer ring.",
    parent: "feather-skirt", material: "feather-white", dimensions: [3.1, 0.82, 2.1], position: [0.32, -0.08, -1.08],
    features: ["feather-skirt.rear-tail"], evidence: ["back-view"], confidence: 0.93,
  }),
  component({
    id: "left-hand", name: "Left gripping hand", level: "meso", role: "hand",
    primitive: "capsule", topologyClass: "continuous-sculpt",
    rationale: "A palm volume and five bent finger capsules wrap around the upper shaft socket.",
    parent: "left-arm", material: "skin", dimensions: [0.34, 0.3, 0.26], position: [0, -0.48, 0],
    features: ["hands.staff-grip-fingers"], evidence: ["front-close", "back-view"], confidence: 0.72, animationRole: "hand",
  }),
  component({
    id: "right-hand", name: "Right gripping hand", level: "meso", role: "hand",
    primitive: "capsule", topologyClass: "continuous-sculpt",
    rationale: "A second palm and finger set closes around the lower staff position.",
    parent: "right-arm", material: "skin", dimensions: [0.34, 0.3, 0.26], position: [0, -0.5, 0],
    features: ["hands.staff-grip-fingers"], evidence: ["front-close", "back-view"], confidence: 0.7, animationRole: "hand",
  }),
  component({
    id: "left-shoe", name: "Left white and gold shoe", level: "meso", role: "shoe",
    primitive: "curve-sweep", topologyClass: "conforming-shell",
    rationale: "The pointed white shoe follows the foot volume and carries raised gold toe and heel trim.",
    parent: "left-leg", material: "feather-white", dimensions: [0.76, 0.34, 0.42], position: [-0.98, -0.08, 0],
    features: ["shoes.crystal-ankle-bows", "shoes.gold-trim"], evidence: ["front-wide"], confidence: 0.82,
  }),
  component({
    id: "right-shoe", name: "Right white and gold shoe", level: "meso", role: "shoe",
    primitive: "curve-sweep", topologyClass: "conforming-shell",
    rationale: "The second pointed shoe is rotated differently and remains a separate solid part.",
    parent: "right-leg", material: "feather-white", dimensions: [0.76, 0.34, 0.42], position: [-0.9, -0.06, 0],
    features: ["shoes.crystal-ankle-bows", "shoes.gold-trim"], evidence: ["front-wide"], confidence: 0.8,
  }),
  component({
    id: "ankle-crystals", name: "Cyan ankle crystal bows", level: "micro", role: "ornament",
    primitive: "instanced-cluster", topologyClass: "assembled-solid",
    rationale: "Faceted translucent loops and snowflake rays cluster around both ankles.",
    parent: "dress-core", material: "crystal-cyan", dimensions: [2.15, 0.55, 0.5], position: [-0.95, -0.58, 0.35],
    features: ["shoes.crystal-ankle-bows"], evidence: ["front-wide"], confidence: 0.83,
  }),
  component({
    id: "shoe-gold-trim", name: "Raised gold shoe trim", level: "micro", role: "trim",
    primitive: "instanced-cluster", topologyClass: "surface-relief",
    rationale: "Separate gold toe caps, heel rings and sole strips provide real relief around each shoe.",
    parent: "dress-core", material: "metallic-gold", dimensions: [2.2, 0.46, 0.52], position: [-1.0, -0.62, 0.34],
    features: ["shoes.gold-trim"], evidence: ["front-wide"], confidence: 0.84,
  }),
  component({
    id: "staff-shaft", name: "Glossy pink staff shaft", level: "meso", role: "handle",
    primitive: "tube", topologyClass: "assembled-solid",
    rationale: "A continuous pink cylinder runs diagonally through both hand grip sockets.",
    parent: "staff", material: "staff-pink", dimensions: [0.2, 4.85, 0.2], position: [0, -0.2, 0],
    features: ["staff-shaft.pink-clearcoat"], evidence: ["front-wide", "back-view"], confidence: 0.95, animationRole: "handle",
  }),
  component({
    id: "staff-collars", name: "Red gem staff collars", level: "micro", role: "connector",
    primitive: "instanced-cluster", topologyClass: "assembled-solid",
    rationale: "Two glossy red faceted collars connect the pink shaft to gold end hardware.",
    parent: "staff", material: "crystal-red", dimensions: [0.38, 4.15, 0.38], position: [0, -0.1, 0],
    features: ["staff-collars.red-gem"], evidence: ["front-wide"], confidence: 0.91,
  }),
  component({
    id: "staff-tip", name: "Gold and red pointed staff tip", level: "meso", role: "connector",
    primitive: "cone", topologyClass: "assembled-solid",
    rationale: "A gold collar supports a red pointed terminal at the lower end of the shaft.",
    parent: "staff", material: "metallic-gold", dimensions: [0.42, 0.72, 0.42], position: [0, -2.58, 0],
    evidence: ["front-wide"], confidence: 0.9,
  }),
  component({
    id: "staff-head", name: "Gold winged solar staff head", level: "meso", role: "ornament",
    primitive: "instanced-cluster", topologyClass: "assembled-solid",
    rationale: "A gold solar ring and rays anchor layered white wings and the central blue crystal.",
    parent: "staff", material: "metallic-gold", dimensions: [2.08, 1.25, 0.38], position: [0, 2.56, 0],
    features: ["staff-head.winged-sun"], evidence: ["front-wide", "back-view"], confidence: 0.94, importance: 1,
  }),
  component({
    id: "staff-wings", name: "Layered white staff wings", level: "meso", role: "wing",
    primitive: "instanced-cluster", topologyClass: "assembled-solid",
    rationale: "Two mirrored groups of tapered white feather solids extend from the solar ring.",
    parent: "staff-head", material: "feather-white", dimensions: [2.35, 0.82, 0.28], position: [0, 0, 0],
    features: ["staff-head.winged-sun"], evidence: ["front-wide", "back-view"], confidence: 0.91, animationRole: "wing",
  }),
  component({
    id: "staff-rays", name: "Gold staff solar rays", level: "micro", role: "ornament",
    primitive: "instanced-cluster", topologyClass: "assembled-solid",
    rationale: "Eight tapered gold rays project from the ring at observed non-uniform lengths.",
    parent: "staff-head", material: "metallic-gold", dimensions: [1.18, 1.18, 0.16], position: [0, 0.18, 0.04],
    features: ["staff-head.winged-sun"], evidence: ["front-wide"], confidence: 0.9,
  }),
  component({
    id: "staff-crystal", name: "Faceted blue staff crystal", level: "micro", role: "ornament",
    primitive: "extrude", topologyClass: "assembled-solid",
    rationale: "A thick faceted translucent blue polygon sits within the solar ring and remains volumetric in orbit.",
    parent: "staff-head", material: "crystal-cyan", dimensions: [0.56, 0.56, 0.22], position: [0, 0.17, 0.06],
    features: ["crystal.staff-center"], evidence: ["front-wide"], confidence: 0.89,
  }),
];

function material(id, name, color, secondary, roughness, metalness, options = {}) {
  const result = clone(sourceMaterial);
  result.id = id;
  result.name = name;
  result.baseColor = color;
  result.color = color;
  result.albedo = {
    dominant: color,
    secondary: [secondary],
    samplingNotes: "Sampled from admitted de-lit front/rear references, then separated from runtime lighting.",
  };
  result.colorVariation.palette = [color, secondary];
  result.colorVariation.pattern = options.pattern ?? "subtle object-space variation";
  result.colorVariation.amplitude = options.variation ?? 0.035;
  result.roughness = {
    base: roughness,
    variation: Math.min(0.12, Math.max(0.02, roughness * 0.12)),
    map: "independent-procedural-roughness",
    localResponse: "independent from albedo; cavity and grazing-light response tuned per material",
  };
  result.metalness = {base: metalness, variation: metalness ? 0.04 : 0};
  result.normal = {
    pattern: options.normal ?? "micro moulded surface field",
    strength: options.normalStrength ?? 0.08,
    scale: options.normalScale ?? 80,
    space: "tangent",
  };
  result.ambientOcclusion = {
    cavityStrength: options.ao ?? 0.22,
    contactShadowBias: 0.3,
    notes: "Independent contact/cavity response; not copied from albedo.",
  };
  result.localOverrides = options.localOverrides ?? [];
  result.textureResolution = 1024;
  result.textureProjection = {
    mode: "object-space procedural",
    repeat: [1, 1],
    anisotropy: 8,
    texelDensityIntent: "Stable detail density independent of component scale.",
  };
  result.qualityTier = options.qualityTier ?? "hero";
  result.notes = options.notes ?? "Reference-derived palette with independent real-time PBR response.";
  if (options.physical) {
    result.type = "physical";
    result.shaderModel = "MeshPhysicalMaterial";
    Object.assign(result, options.physical);
  }
  return result;
}

spec.materials = [
  material("hidden", "Hidden root material", "#ffffff", "#ffffff", 1, 0, {qualityTier: "utility"}),
  material("skin", "Warm matte skin PVC", "#ffd8c1", "#f2b89f", 0.48, 0, {
    normal: "very fine satin PVC field", normalStrength: 0.035, variation: 0.022,
  }),
  material("hair", "Chestnut satin hair PVC", "#8b4c35", "#532b22", 0.34, 0, {
    normal: "directional hair-lock highlight breakup", normalStrength: 0.07, normalScale: 46,
  }),
  material("feather-white", "Ivory feather PVC", "#faf8f1", "#dfe7eb", 0.39, 0, {
    normal: "fine feather vane ridges", normalStrength: 0.1, normalScale: 52,
    localOverrides: [{id: "feather-edge-satin", roughness: 0.3, mask: "geometry-edge"}],
  }),
  material("metallic-gold", "Warm metallic gold trim", "#e4b638", "#8c560f", 0.23, 0.9, {
    normal: "polished metal micro orange-peel", normalStrength: 0.045, normalScale: 96,
    localOverrides: [{id: "shoes.gold-trim", roughness: 0.2, metalness: 0.94}],
    physical: {clearcoat: 0.18, clearcoatRoughness: 0.22},
  }),
  material("staff-pink", "Clear-coated pink staff lacquer", "#ed5c91", "#ab225b", 0.18, 0, {
    normal: "very fine lacquer field", normalStrength: 0.025,
    localOverrides: [{id: "staff-shaft.pink-clearcoat", roughness: 0.13, clearcoat: 0.82}],
    physical: {clearcoat: 0.82, clearcoatRoughness: 0.12},
  }),
  material("crystal-cyan", "Translucent cyan crystals", "#9de9f2", "#51a9cf", 0.1, 0, {
    normal: "faceted geometry only", normalStrength: 0,
    localOverrides: [
      {id: "crystal.neck-snowflake", roughness: 0.08, transmission: 0.7},
      {id: "crystal.staff-center", roughness: 0.06, transmission: 0.78},
    ],
    physical: {transmission: 0.72, thickness: 0.18, ior: 1.47, clearcoat: 0.32},
  }),
  material("crystal-red", "Deep red gem collars", "#bd1b36", "#5e071c", 0.11, 0, {
    normal: "faceted geometry only", normalStrength: 0,
    localOverrides: [{id: "staff-collars.red-gem", roughness: 0.08, transmission: 0.38}],
    physical: {transmission: 0.34, thickness: 0.2, ior: 1.5, clearcoat: 0.48},
  }),
  material("eyes", "Green gradient eye lacquer", "#5d9355", "#183b1f", 0.08, 0, {
    normal: "smooth convex lens", normalStrength: 0,
    localOverrides: [{id: "eyes.iris-gradient-catchlights", roughness: 0.04, clearcoat: 1}],
    physical: {clearcoat: 1, clearcoatRoughness: 0.04},
  }),
  material("mouth", "Soft rose mouth and blush", "#c15f5b", "#843139", 0.52, 0, {
    qualityTier: "utility", normalStrength: 0,
  }),
  material("smoked-base", "Smoked blue-violet iridescent base", "#403654", "#1e2b50", 0.12, 0, {
    localOverrides: [{id: "display-base.iridescent-clear", roughness: 0.08, iridescence: 0.72}],
    physical: {transmission: 0.45, opacity: 0.78, transparent: true, ior: 1.45, iridescence: 0.65},
  }),
];

spec.repetitionSystems = [
  {
    id: "skirt-feather-rings",
    componentRef: "feather-skirt",
    realization: "instanced-geometry",
    buildsGeometry: true,
    geometry: "tapered feather extrude with central vane ridge and curved root-to-tip profile",
    instances: 48,
    distribution: "three eccentric radial rings; 14 inner, 16 middle, 18 outer",
    variation: "length, yaw, pitch, overlap and tip curl from deterministic seed 520",
  },
  {
    id: "collar-feather-rows",
    componentRef: "collar-feathers",
    realization: "instanced-geometry",
    buildsGeometry: true,
    geometry: "short tapered feather solids",
    instances: 16,
    distribution: "two offset shoulder arcs",
    variation: "length and roll follow shoulder curvature",
  },
  {
    id: "hair-lock-system",
    componentRef: "hair-locks",
    realization: "generated-geometry",
    buildsGeometry: true,
    geometry: "curved tapered hair clumps with pointed tips",
    instances: 24,
    distribution: "rear bob circumference plus eight front bangs",
    variation: "width, curl, tip direction and overlap from reference zones",
  },
  {
    id: "staff-wing-feathers",
    componentRef: "staff-wings",
    realization: "instanced-geometry",
    buildsGeometry: true,
    geometry: "mirrored tapered feather solids",
    instances: 12,
    distribution: "six feathers per wing around gold solar ring",
    variation: "outer feathers are longer and more swept",
  },
  {
    id: "crystal-and-ray-clusters",
    componentRef: "staff-rays",
    realization: "generated-geometry",
    buildsGeometry: true,
    geometry: "eight gold solar rays, six neck-crystal rays and paired ankle-bow facets",
    instances: 24,
    distribution: "radial around staff and neck plus bilateral ankles",
    variation: "reference-matched length hierarchy and facet rotations",
  },
];

spec.featureReviewTargets = [
  {
    id: "anatomy-proportion",
    name: "4.5-head anatomy and seated pose",
    tier: "critical",
    passIds: ["blockout", "proportion-lock"],
    minimumScore: 0.82,
    mustPass: true,
    componentRefs: ["head", "torso", "left-leg", "right-leg", "dress-core"],
    evidenceRefs: ["front-wide", "back-view"],
  },
  {
    id: "pose-silhouette",
    name: "Seated leg sweep and diagonal staff silhouette",
    tier: "critical",
    passIds: ["blockout", "structural-pass"],
    minimumScore: 0.84,
    mustPass: true,
    componentRefs: ["left-leg", "right-leg", "staff", "feather-skirt"],
    evidenceRefs: ["front-wide"],
  },
  {
    id: "face-landmark-placement",
    name: "Green eyes, jaw, mouth and hairline",
    tier: "critical",
    passIds: ["feature-placement"],
    minimumScore: 0.84,
    mustPass: true,
    componentRefs: ["head", "face", "eyes", "mouth", "hair-bangs"],
    evidenceRefs: ["front-close"],
  },
  {
    id: "hair-identity",
    name: "Layered bob, ahoge and side curl",
    tier: "critical",
    passIds: ["structural-pass", "feature-placement"],
    minimumScore: 0.82,
    mustPass: true,
    componentRefs: ["hair-back-shell", "hair-locks", "hair-bangs", "ahoge", "side-curl"],
    evidenceRefs: ["front-close", "back-view"],
  },
  {
    id: "feather-systems",
    name: "Collar rows, skirt rings and rear feather tail",
    tier: "critical",
    passIds: ["structural-pass", "form-pass"],
    minimumScore: 0.84,
    mustPass: true,
    componentRefs: ["collar-feathers", "skirt-ring-inner", "skirt-ring-middle", "skirt-ring-outer", "rear-feather-tail"],
    evidenceRefs: ["front-wide", "back-view"],
  },
  {
    id: "staff-identity",
    name: "Winged sun staff and hand contact",
    tier: "critical",
    passIds: ["structural-pass", "feature-placement"],
    minimumScore: 0.85,
    mustPass: true,
    componentRefs: ["staff-shaft", "staff-collars", "staff-tip", "staff-head", "staff-wings", "staff-rays", "staff-crystal", "left-hand", "right-hand"],
    evidenceRefs: ["front-wide", "back-view"],
  },
  {
    id: "outfit-and-palette",
    name: "Bodice, gold trim, crystals and shoe accents",
    tier: "important",
    passIds: ["material-pass"],
    minimumScore: 0.78,
    mustPass: false,
    componentRefs: ["bodice", "bodice-gold-trim", "waist-ornament", "neck-crystal", "ankle-crystals", "shoe-gold-trim"],
    evidenceRefs: ["front-close", "back-view"],
  },
  {
    id: "material-separation",
    name: "PVC, lacquer, gold, glass and base response",
    tier: "important",
    passIds: ["material-pass", "lighting-pass"],
    minimumScore: 0.78,
    mustPass: false,
    componentRefs: ["head", "hair-locks", "feather-skirt", "staff-shaft", "staff-crystal", "display-base"],
    evidenceRefs: ["front-wide", "front-close", "back-view"],
  },
];

const allRefs = spec.componentTree.map((component) => component.id);
spec.buildPasses = [
  {
    id: "blockout",
    goal: "Lock composition, 4.5-head proportion, seated leg sweep, feather mound and staff endpoints.",
    componentRefs: ["root", "display-base", "feather-skirt", "dress-core", "torso", "head", "left-leg", "right-leg", "left-arm", "right-arm", "staff"],
    acceptance: ["Front silhouette matches the reference without materials; staff and legs occupy the correct negative spaces."],
  },
  {
    id: "proportion-lock",
    goal: "Lock measured head, torso, limb and skirt proportions before local detail.",
    componentRefs: ["head", "torso", "dress-core", "left-leg", "right-leg", "left-arm", "right-arm", "feather-skirt"],
    acceptance: ["Head-unit ratios and seated joint angles agree with anatomy.json from front and rear views."],
  },
  {
    id: "structural-pass",
    goal: "Build named volume hierarchy, attachment sockets and all repeated feather, hair and staff systems.",
    componentRefs: allRefs,
    acceptance: ["All macro and meso parts exist as named Object3D groups; no limb, wing, feather ring or staff part floats or collapses to a plane."],
  },
  {
    id: "form-pass",
    goal: "Refine continuous organic forms, feather taper/curl, hair locks, hands and shoe profiles.",
    componentRefs: ["head", "face", "torso", "left-leg", "right-leg", "left-arm", "right-arm", "left-hand", "right-hand", "hair-locks", "hair-bangs", "skirt-ring-inner", "skirt-ring-middle", "skirt-ring-outer", "rear-feather-tail"],
    acceptance: ["Three-quarter orbits remain volumetric and the rear silhouette agrees with the back reference."],
  },
  {
    id: "feature-placement",
    goal: "Place eyes, mouth, hair silhouette, crown, trims, crystals, hand grip and staff head.",
    componentRefs: ["eyes", "mouth", "nose", "hair-bangs", "ahoge", "side-curl", "head-feather-crown", "bodice-gold-trim", "neck-crystal", "waist-ornament", "ankle-crystals", "shoe-gold-trim", "staff-collars", "staff-tip", "staff-head", "staff-wings", "staff-rays", "staff-crystal"],
    acceptance: ["Every critical likeness cue passes its per-feature reference comparison."],
  },
  {
    id: "material-pass",
    goal: "Apply independent real-time PBR responses from the de-lit reference palette.",
    componentRefs: allRefs,
    acceptance: ["Skin, hair, feathers, gold, pink lacquer, cyan/red crystal and smoked base stay visibly distinct under neutral and grazing light."],
  },
  {
    id: "lighting-pass",
    goal: "Reproduce the bright product-photo key while preserving neutral material readability.",
    componentRefs: allRefs,
    acceptance: ["Reference-matched and neutral-light captures both retain contact shadows, crystalline highlights and feather separation."],
  },
  {
    id: "interaction-pass",
    goal: "Expose orbit, named-part picking and center-scaled explode inspection.",
    componentRefs: allRefs,
    acceptance: ["Every named part can be highlighted and explode view opens real gaps without breaking nested attachments."],
  },
  {
    id: "optimization-pass",
    goal: "Lazy-load the viewer and instance repeated systems without removing identity geometry.",
    componentRefs: allRefs,
    acceptance: ["Desktop and mobile sustain the target interaction budget; the model route does not block initial app navigation."],
  },
];

spec.sculptPipeline = {
  passGateMode: "locked-sequential",
  passOrder: spec.buildPasses.map((pass) => pass.id),
  currentPass: "blockout",
  completedPasses: [],
  lastCompletedPass: "",
  blockedReason:
    "blockout requires a browser screenshot and self-correction review before proportion-lock unlocks",
  nextRequiredEvidence: [
    "blockout browser render screenshot",
    "side-by-side front reference/render comparison sheet",
    "AI vision score and per-layer mismatch critique",
    "critical feature scores from the same image pair",
    "reviewHistory entry for blockout with action=continue",
  ],
};
spec.selfCorrectLoop.reviewAfterPasses = spec.buildPasses.map((pass) => pass.id);
spec.lightingFromPhoto = [
  "Key light: large soft rectangle above and viewer-left, 5600K, intensity calibrated to preserve ivory feather detail.",
  "Fill light: broad cool sky fill from front-right at roughly 35 percent of key intensity.",
  "Rim light: soft cyan-white rear light separates the hair, staff wings and rear feather tail.",
  "Exposure and tone mapping: ACES Filmic, exposure near 1.05, highlights protected below clipping.",
  "Background: pale blue studio-sky gradient derived from the product photography without baking it into albedo.",
  "Contact shadow: soft ground shadow plus ambient occlusion under the skirt, hands, collar layers and hair locks.",
];
spec.proceduralStrategy = [
  "Block macro silhouette from front and rear evidence before adding materials.",
  "Use ellipsoid/capsule/curve-sweep volumes for anatomy; never substitute image planes.",
  "Generate deterministic tapered feather, hair-lock, ray, finger and crystal geometry as named repeated systems.",
  "Use physical metallic, lacquer and transmission responses with independent roughness/normal/AO fields.",
  "Keep every macro and meso part under a stable named group shared by picking and center-scaled explode behavior.",
  "Lazy-load Three.js and the reconstruction factory only on the cyber-collection route.",
];
spec.assumptions = [
  "Side depth is inferred from front/rear overlap because no side photograph was supplied.",
  "The hidden pelvis and thigh roots are plausible structural supports, not scan-exact reconstruction.",
  "The smoked base plan shape is approximated as circular because only narrow gaps reveal it.",
  "The result targets maximum likeness within code-only procedural Three.js, not photogrammetric ground truth.",
];
spec.risks = [
  "Hand/finger placement may require an additional side close-up for scan-level correction.",
  "The feather skirt is the dominant triangle and draw-call budget; lower LOD may merge only non-silhouette internal vanes.",
  "Transparent crystals and smoked base require careful sorting on mobile GPUs.",
];

fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
