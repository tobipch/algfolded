<script setup>
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from "vue";
import {useCommandPaletteStore} from "@/stores/CommandPaletteStore";
import {useSelectedStore} from "@/stores/SelectedStore";
import {useDisplayStore} from "@/stores/DisplayStore";
import {useCommands} from "@/components/command_palette/commands";
import {fuzzyScore} from "@/components/command_palette/fuzzy";
import {useI18n} from "vue-i18n";

const palette = useCommandPaletteStore();
const selected = useSelectedStore();
const display = useDisplayStore();
const commandList = useCommands();
const {t} = useI18n();

const query = ref("");
const activeIndex = ref(0);
const inputEl = ref(null);

// Parse the query into a mode. "*" anywhere = wildcard selection; a leading
// "+"/"-" = add/remove wildcard; "#"/"@"/">" restrict to a section.
const parsed = computed(() => {
  const q = query.value;
  if (q.startsWith("+")) return {type: "wildcard", op: "add", pattern: q.slice(1).trim()};
  if (q.startsWith("-")) return {type: "wildcard", op: "remove", pattern: q.slice(1).trim()};
  if (q.includes("*")) return {type: "wildcard", op: "select", pattern: q.trim()};
  if (q.startsWith("#")) return {type: "commands", section: "algset", term: q.slice(1).trim()};
  if (q.startsWith("@")) return {type: "commands", section: "presets", term: q.slice(1).trim()};
  if (q.startsWith(">")) return {type: "commands", section: null, term: q.slice(1).trim()};
  return {type: "commands", section: null, term: q.trim()};
});

// Section label a "#"/"@" filter maps to (compared against command.section).
const sectionLabel = computed(() => ({
  algset: t("cmd.section.algset"),
  presets: t("cmd.section.presets"),
}));

// The selectable rows for the current query.
const items = computed(() => {
  const p = parsed.value;
  if (p.type === "wildcard") {
    if (!p.pattern) return [];
    const count = selected.countMatching(p.pattern);
    return [{
      id: "wc", kind: "wildcard", op: p.op, pattern: p.pattern, count,
      icon: p.op === "add" ? "bi-plus-lg" : p.op === "remove" ? "bi-dash-lg" : "bi-asterisk",
      title: t(`cmd.wc_${p.op}`, {count}),
      run: () => {
        const n = p.op === "add" ? selected.addByPattern(p.pattern)
          : p.op === "remove" ? selected.removeByPattern(p.pattern)
          : selected.selectByPattern(p.pattern);
        display.showToast(t(`cmd.wc_${p.op}_done`, {count: n}), "success");
      },
    }];
  }
  let list = commandList.value;
  if (p.section) list = list.filter((c) => c.section === sectionLabel.value[p.section]);
  if (!p.term) return list.map((c) => ({...c, kind: "command"}));
  return list
    .map((c) => ({c, score: fuzzyScore(`${c.title} ${c.keywords ?? ""} ${c.section}`, p.term)}))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => ({...x.c, kind: "command"}));
});

// Reset highlight whenever the result set changes.
watch(items, () => { activeIndex.value = 0; });

const move = (delta) => {
  const n = items.value.length;
  if (!n) return;
  activeIndex.value = (activeIndex.value + delta + n) % n;
};

const runActive = async () => {
  const item = items.value[activeIndex.value];
  if (!item) return;
  palette.close();
  await item.run();
};

// Focus + reset each time the palette opens.
watch(() => palette.open, (open) => {
  if (open) {
    query.value = palette.initialQuery;
    activeIndex.value = 0;
    nextTick(() => inputEl.value?.focus());
  }
});

// Global Alt+K toggles the palette (capture phase so it beats input focus).
const onGlobalKey = (e) => {
  if (e.altKey && (e.key === "k" || e.key === "K")) {
    e.preventDefault();
    palette.toggle();
  }
};
onMounted(() => window.addEventListener("keydown", onGlobalKey, true));
onUnmounted(() => window.removeEventListener("keydown", onGlobalKey, true));
</script>

<template>
  <Teleport to="body">
    <div v-if="palette.open" class="cp-backdrop" @mousedown.self="palette.close()">
      <div class="cp-box shadow-lg" role="dialog" aria-modal="true">
        <div class="cp-input-row">
          <i class="bi bi-search cp-search-icon"></i>
          <input
              ref="inputEl"
              v-model="query"
              class="cp-input"
              :placeholder="$t('cmd.placeholder')"
              @keydown.down.prevent="move(1)"
              @keydown.up.prevent="move(-1)"
              @keydown.enter.prevent="runActive"
              @keydown.esc.prevent="palette.close()"
          />
          <kbd class="cp-esc" @click="palette.close()">esc</kbd>
        </div>

        <div class="cp-list">
          <template v-for="(item, i) in items" :key="item.id">
            <div
                class="cp-row"
                :class="{active: i === activeIndex}"
                @mousemove="activeIndex = i"
                @click="activeIndex = i; runActive()"
            >
              <i class="bi cp-row-icon" :class="item.icon || 'bi-dot'"></i>
              <div class="cp-row-body">
                <div class="cp-row-title">{{ item.title }}</div>
                <div v-if="item.kind === 'wildcard'" class="cp-row-sub">{{ item.pattern }}</div>
                <div v-else class="cp-row-sub">{{ item.section }}</div>
              </div>
              <i v-if="item.active" class="bi bi-check-lg cp-row-check"></i>
            </div>
          </template>

          <div v-if="items.length === 0" class="cp-empty">{{ $t('cmd.no_results') }}</div>
        </div>

        <div class="cp-footer">{{ $t('cmd.prefix_hint') }}</div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cp-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  z-index: 2000;
}
.cp-box {
  width: min(640px, 92vw);
  background: var(--bs-body-bg);
  color: var(--bs-body-color);
  border: 1px solid var(--bs-border-color);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 70vh;
}
.cp-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--bs-border-color);
}
.cp-search-icon {
  font-size: 1.1rem;
  opacity: 0.6;
}
.cp-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font-size: 1.05rem;
}
.cp-esc {
  cursor: pointer;
  font-size: 0.7rem;
  opacity: 0.6;
}
.cp-list {
  overflow-y: auto;
  padding: 6px;
}
.cp-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.cp-row.active {
  background: rgba(var(--bs-primary-rgb), 0.15);
}
.cp-row-icon {
  font-size: 1rem;
  opacity: 0.8;
  width: 1.2rem;
  text-align: center;
}
.cp-row-body {
  flex: 1;
  min-width: 0;
}
.cp-row-title {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cp-row-sub {
  font-size: 0.78rem;
  opacity: 0.55;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cp-row-check {
  color: var(--bs-primary);
}
.cp-empty {
  padding: 18px;
  text-align: center;
  opacity: 0.6;
}
.cp-footer {
  padding: 8px 14px;
  border-top: 1px solid var(--bs-border-color);
  font-size: 0.75rem;
  opacity: 0.6;
}
</style>
