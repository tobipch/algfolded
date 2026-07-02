<script setup>
import { computed } from "vue";
import { useLetterSchemeStore } from "@/stores/LetterSchemeStore";
import { useSettingsStore } from "@/stores/SettingsStore";

const ls = useLetterSchemeStore();
const settings = useSettingsStore();

// Each face: 3x3 grid. 3-char = corner sticker, 2-char = edge sticker,
// "label" = center. Corner inputs bind the corner scheme, edge inputs the edge
// scheme (dispatched by sticker length in schemeFor()).
const faces = {
  U: { grid: ["UBL", "UB", "UBR", "UL", "label", "UR", "UFL", "UF", "UFR"] },
  L: { grid: ["LUB", "LU", "LUF", "LB", "label", "LF", "LDB", "LD", "LDF"] },
  F: { grid: ["FUL", "FU", "FUR", "FL", "label", "FR", "FDL", "FD", "FDR"] },
  R: { grid: ["RUF", "RU", "RUB", "RF", "label", "RB", "RDF", "RD", "RDB"] },
  B: { grid: ["BUR", "BU", "BUL", "BR", "label", "BL", "BDR", "BD", "BDL"] },
  D: { grid: ["DFL", "DF", "DFR", "DL", "label", "DR", "DBL", "DB", "DBR"] },
};

// The reactive scheme object a given sticker belongs to (edge if 2 chars).
const schemeFor = (cell) => (cell.length === 2 ? ls.edgeScheme : ls.scheme);

// Standard face colors (default orientation: U=white, F=green)
const BASE_COLORS = { U: "#ffffff", D: "#ffdd00", F: "#00aa44", B: "#0055bb", L: "#ff8800", R: "#cc0000" };

// How each rotation remaps faces: rotation -> { newFace: originalFace }
const ROTATION_MAP = {
  "":    { U:"U", D:"D", F:"F", B:"B", L:"L", R:"R" },
  "y":   { U:"U", D:"D", F:"R", B:"L", L:"F", R:"B" },
  "y'":  { U:"U", D:"D", F:"L", B:"R", L:"B", R:"F" },
  "y2":  { U:"U", D:"D", F:"B", B:"F", L:"R", R:"L" },
  "x":   { U:"F", D:"B", F:"D", B:"U", L:"L", R:"R" },
  "x'":  { U:"B", D:"F", F:"U", B:"D", L:"L", R:"R" },
  "x2":  { U:"D", D:"U", F:"B", B:"F", L:"L", R:"R" },
  "z":   { U:"L", D:"R", F:"F", B:"B", L:"D", R:"U" },
  "z'":  { U:"R", D:"L", F:"F", B:"B", L:"U", R:"D" },
  "z2":  { U:"D", D:"U", F:"F", B:"B", L:"R", R:"L" },
};

function applyRotation(map, rot) {
  // Apply a single rotation to a face mapping
  const rmap = ROTATION_MAP[rot];
  if (!rmap) return map;
  const result = {};
  for (const face of Object.keys(rmap)) {
    result[face] = map[rmap[face]];
  }
  return result;
}

const faceColors = computed(() => {
  const orient = (settings.store.cubeOrientation || "").trim();
  if (!orient) return BASE_COLORS;

  // Parse orientation into individual rotations (e.g., "x y" -> ["x", "y"])
  const rotations = orient.split(/\s+/).filter(Boolean);
  let mapping = { U:"U", D:"D", F:"F", B:"B", L:"L", R:"R" };
  for (const rot of rotations) {
    mapping = applyRotation(mapping, rot);
  }
  // mapping[face] = which original face is now at position 'face'
  const result = {};
  for (const face of Object.keys(BASE_COLORS)) {
    result[face] = BASE_COLORS[mapping[face]] || BASE_COLORS[face];
  }
  return result;
});

const faceStyle = (face) => ({
  borderColor: faceColors.value[face],
  borderWidth: '2px',
  borderStyle: 'solid',
  borderRadius: '4px',
  padding: '2px',
});

function contrastText(hex) {
  // Parse hex color and compute relative luminance
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#333' : '#fff';
}

const centerStyle = (face) => {
  const bg = faceColors.value[face];
  return {
    backgroundColor: bg,
    borderRadius: '3px',
    color: contrastText(bg),
  };
};

const onReset = () => {
  ls.resetDefaults();
};
</script>

<template>
  <div class="letter-scheme-editor">
    <div class="cube-net">
      <!-- Top row: U face centered -->
      <div class="net-row">
        <div class="face-spacer"></div>
        <div class="face-grid">
          <div class="grid-3x3" :style="faceStyle('U')">
            <template v-for="(cell, idx) in faces.U.grid" :key="'U-'+idx">
              <input
                v-if="cell && cell !== 'label'"
                class="scheme-input" :class="{ 'edge-input': cell.length === 2 }"
                maxlength="2"
                v-model="schemeFor(cell)[cell]"
                :title="cell"
              />
              <div v-else-if="cell === 'label'" class="grid-center" :style="centerStyle('U')">U</div>
              <div v-else class="grid-edge"></div>
            </template>
          </div>
        </div>
        <div class="face-spacer"></div>
        <div class="face-spacer"></div>
      </div>

      <!-- Middle row: L, F, R, B -->
      <div class="net-row">
        <div v-for="face in ['L', 'F', 'R', 'B']" :key="face" class="face-grid">
          <div class="grid-3x3" :style="faceStyle(face)">
            <template v-for="(cell, idx) in faces[face].grid" :key="face+'-'+idx">
              <input
                v-if="cell && cell !== 'label'"
                class="scheme-input" :class="{ 'edge-input': cell.length === 2 }"
                maxlength="2"
                v-model="schemeFor(cell)[cell]"
                :title="cell"
              />
              <div v-else-if="cell === 'label'" class="grid-center" :style="centerStyle(face)">{{ face }}</div>
              <div v-else class="grid-edge"></div>
            </template>
          </div>
        </div>
      </div>

      <!-- Bottom row: D face centered -->
      <div class="net-row">
        <div class="face-spacer"></div>
        <div class="face-grid">
          <div class="grid-3x3" :style="faceStyle('D')">
            <template v-for="(cell, idx) in faces.D.grid" :key="'D-'+idx">
              <input
                v-if="cell && cell !== 'label'"
                class="scheme-input" :class="{ 'edge-input': cell.length === 2 }"
                maxlength="2"
                v-model="schemeFor(cell)[cell]"
                :title="cell"
              />
              <div v-else-if="cell === 'label'" class="grid-center" :style="centerStyle('D')">D</div>
              <div v-else class="grid-edge"></div>
            </template>
          </div>
        </div>
        <div class="face-spacer"></div>
        <div class="face-spacer"></div>
      </div>
    </div>

    <button type="button" class="btn btn-sm btn-outline-secondary mt-2" @click="onReset">
      Reset to Speffz
    </button>
  </div>
</template>

<style scoped>
.cube-net {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.net-row {
  display: flex;
  gap: 2px;
}

.face-spacer {
  width: 92px;
  flex-shrink: 0;
}

.face-grid {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.grid-3x3 {
  display: grid;
  grid-template-columns: repeat(3, 28px);
  grid-template-rows: repeat(3, 28px);
  gap: 1px;
}

.scheme-input {
  width: 28px;
  height: 28px;
  text-align: center;
  font-weight: bold;
  font-size: 0.85rem;
  padding: 0;
  border: 1px solid var(--bs-secondary);
  border-radius: 3px;
  background: var(--bs-body-bg);
  color: var(--bs-body-color);
}

.scheme-input:focus {
  outline: 2px solid var(--bs-primary);
  outline-offset: -1px;
}

/* Edge stickers are tinted so they read as a separate set from the corners. */
.scheme-input.edge-input {
  border-style: dashed;
  opacity: 0.9;
}

.grid-center {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 0.75rem;
}

.grid-edge {
  background: var(--bs-secondary);
  opacity: 0.15;
  border-radius: 2px;
}
</style>
