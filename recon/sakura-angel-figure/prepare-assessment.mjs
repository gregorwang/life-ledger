import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const assessmentPath = path.join(directory, "pre-spec-assessment.json");
const inventoryPath = path.join(directory, "detail-inventory.json");
const anatomyPath = path.join(directory, "anatomy.json");

const assessment = JSON.parse(fs.readFileSync(assessmentPath, "utf8"));
const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const anatomy = JSON.parse(fs.readFileSync(anatomyPath, "utf8"));
const pre = assessment.preSpecAssessment;

pre.objectClass = {
  primaryType: "seated PVC anime figurine with ornate staff and feather display base",
  primaryDomain: "hybrid",
  formLanguage: [
    "stylized organic character anatomy",
    "layered radial feather repetition",
    "faceted crystalline accents",
    "slender assembled ceremonial staff",
  ],
  structureKind: [
    "continuous sculpt for head, torso and limbs",
    "fiber-strand hair clumps",
    "conforming bodice shell",
    "assembled feather plates",
    "tube-and-profile staff assembly",
    "faceted gemstone inserts",
  ],
  motionPotential: [
    "whole-object orbit",
    "named-part selection",
    "radial explode inspection",
  ],
  materialFamilies: [
    "warm matte skin PVC",
    "satin chestnut hair PVC",
    "ivory feather PVC",
    "metallic gold trim",
    "clear-coated pink staff",
    "translucent cyan and red crystals",
    "smoked iridescent display base",
  ],
  notes:
    "Three admitted views cover front, close front, and rear. No true side view exists, so lateral thickness and hidden pelvis/hand geometry remain evidence-labelled inference.",
};

pre.complexity = {
  tier: "ultra-complex",
  scores: {
    silhouetteComplexity: 3,
    componentCount: 3,
    hierarchyDepth: 3,
    repetitionDensity: 3,
    materialLayerCount: 3,
    localDetailDensity: 3,
    occlusionRisk: 3,
    actionReadinessNeed: 2,
  },
  estimatedCounts: {
    macroComponents: 12,
    mesoComponents: 46,
    microFeatureGroups: 22,
    materialLayers: 9,
    repetitionSystems: 5,
  },
  reasoning: [
    "The identity depends on the simultaneous read of stylized anatomy, a diagonal staff, layered hair, and a dense radial feather base.",
    "The rear reference reveals a separate back ornament and longer asymmetric feather tail that cannot be represented by a shallow front-only shell.",
    "Metal, matte PVC, clear-coated lacquer, translucent crystal, and smoked clear base require distinct PBR responses.",
    "The hands, staff, legs, collar, and dress overlap heavily; attachment contracts are required to prevent floating or fused parts.",
  ],
};

pre.specDepthDecision = {
  requiredDepth: "ultra-complex",
  minimumComponentLevels: ["macro", "meso", "micro"],
  needsRepetitionSystems: true,
  needsMaterialLocalOverrides: true,
  needsMultipleReviewViews: true,
  needsActionReadyHierarchy: true,
  rationale:
    "A maximum-likeness character reconstruction needs explicit anatomy, repeated feathers/hair locks, multiple material families, front/rear review cameras, named parts, and per-region uncertainty.",
};

pre.resolvedUncertaintyRegister = [
  {
    region: "left and right side profile",
    uncertainty:
      "No true side photograph; head depth, torso thickness and radial skirt height must be inferred from front/rear parallax.",
    mitigation:
      "Use conservative ellipsoid depth and validate two non-degenerate orbit views; mark side confidence medium.",
  },
  {
    region: "hands and staff contact",
    uncertainty:
      "Fingers are partly hidden by the staff and sleeve feathers.",
    mitigation:
      "Model palm volumes plus individual finger capsules wrapped around a shared staff socket; mark fine finger placement medium.",
  },
  {
    region: "pelvis and upper legs",
    uncertainty:
      "Feather skirt obscures the seated contact surface.",
    mitigation:
      "Build a plausible seated pelvis and thigh chain beneath the dress, but do not claim scan-exact hidden anatomy.",
  },
  {
    region: "display base",
    uncertainty:
      "Only narrow gaps reveal the dark iridescent base and its exact plan shape.",
    mitigation:
      "Use a low smoked circular plinth under the feather mound with low-confidence label.",
  },
];
pre.unknownsToResolveBeforeImplementation = [];

pre.detailInventory = inventory.detailInventory;
pre.anatomy = {
  applies: true,
  ...anatomy.anatomy,
  note:
    "Landmarks were fitted from admitted front/rear images. Values describe the stylized figurine, not realistic adult anatomy.",
};

assessment.qualityContract.definitionOfDone = [
  "Front view preserves the large head, green eyes, short chestnut bob, seated leg sweep, diagonal staff and concentric feather-skirt silhouette.",
  "Rear view preserves the layered bob shell, gold back ornament and asymmetric long feather tail instead of collapsing to a front-only slab.",
  "The staff includes a glossy pink shaft, red collars, gold winged solar head and translucent blue center with credible hand contact.",
  "White PVC, warm skin, chestnut hair, metallic gold, lacquered pink, translucent cyan/red and smoked base remain materially distinct under relighting.",
  "Every macro component is named, selectable, and participates in a center-scaled explode view without breaking child attachments.",
  "Front, rear, three-quarter-left, three-quarter-right and top-oblique review views remain volumetric and non-degenerate.",
  "Hidden side and underside geometry is explicitly reported as inferred rather than scan-exact.",
];

assessment.qualityContract.featureGroups.push(
  {
    id: "character-likeness",
    name: "Character anatomy and facial likeness",
    required: true,
    qualityCriteria: [
      "Head-to-body ratio, green eye placement, tapered jaw, bob silhouette, ahoge and side curl follow measured landmarks.",
      "The seated pose reads without the feather skirt, and the staff grip remains attached during explode inspection.",
    ],
    evidenceRefs: ["references/front-close.png", "anatomy.json"],
    failureModes: [
      "generic mannequin face",
      "standing or symmetric leg pose",
      "hair represented as one smooth helmet",
    ],
  },
  {
    id: "feather-repetition",
    name: "Feather systems and rear silhouette",
    required: true,
    qualityCriteria: [
      "Collar and skirt use separate, overlapping feather geometry with tapered profiles and non-uniform radial distribution.",
      "Rear tail feathers extend farther than the front ring and remain visible in the rear review.",
    ],
    evidenceRefs: ["references/front-wide.png", "references/back.png"],
    failureModes: [
      "single scalloped disc used as a skirt",
      "uniform repeated cones",
      "front-only feather silhouette",
    ],
  },
  {
    id: "staff-identity",
    name: "Ceremonial staff identity",
    required: true,
    qualityCriteria: [
      "Shaft angle, overall length, winged sun head, crystal center, red collars and gold pointed tip match the references.",
      "Hands visibly wrap the shaft instead of floating beside it.",
    ],
    evidenceRefs: ["references/front-wide.png", "references/back.png"],
    failureModes: [
      "generic wand",
      "missing wing feathers or solar rays",
      "staff detached from hands",
    ],
  },
);

assessment.qualityContract.visualDeltaChecks.push(
  "front/rear head-to-skirt scale and vertical placement delta",
  "staff endpoint, angle, wing span and hand-contact delta",
  "eye line, eye spacing, jaw width and bob contour delta",
  "collar/skirt feather count, overlap, taper and rear-tail delta",
  "gold trim, pink lacquer, cyan crystal and smoked-base material separation delta",
);

assessment.authoringInstruction =
  "Assessment completed from three admitted views. Generate the character/hybrid sculpt spec, preserve all mapped detail references, and carry hidden-side uncertainty into review.";

fs.writeFileSync(assessmentPath, `${JSON.stringify(assessment, null, 2)}\n`);
