<script setup>
import {computed, ref, watch} from "vue";
import {useAlgsetStore} from "@/stores/AlgsetStore";
import {useSessionStore} from "@/stores/SessionStore";
import {useAuthStore} from "@/stores/AuthStore";
import {useSolveSyncStore} from "@/stores/SolveSyncStore";
import {useLetterSchemeStore} from "@/stores/LetterSchemeStore";
import {apiFetch} from "@/helpers/api";
import {matchesWildcard} from "@/helpers/helpers";
import {msToHumanReadable} from "@/helpers/time_formatter";
import CaseInfoModal from "@/components/select_view/CaseInfoModal.vue";
import AlgsetPicker from "@/components/select_view/AlgsetPicker.vue";

const algset = useAlgsetStore()
const session = useSessionStore()
const auth = useAuthStore()
const sync = useSolveSyncStore()
const ls = useLetterSchemeStore()

const searchText = ref('')
const sortBy = ref('default') // 'default' | 'count' | 'avg'
const infoKey = ref(null)

// Search help box: shown while hovering the "?" icon, or pinned by clicking it.
const helpPinned = ref(false)
const helpHover = ref(false)
const helpVisible = computed(() => helpPinned.value || helpHover.value)

// --- first-level (buffer / LTCT set) filter ---
// Sets with many cases per group filter the grid down to one group; the text
// search always goes over ALL cases. 'all' = no group filtering.
const filterMode = computed(() => algset.active.statsGroupFilter ?? null)
const groupOptions = computed(() => {
  if (!filterMode.value) return []
  return algset.tree.map(n => {
    const d = algset.active.levels[0].display(n.value, {toLetter: s => ls.toLetter(s)})
    return {value: n.value, label: d.secondary ? `${d.primary} (${d.secondary})` : d.primary}
  })
})
const groupFilter = ref('all')
// default to the first group ("normally you look at one set"); reset on set switch
watch([() => algset.activeId, () => algset.loaded], () => {
  groupFilter.value = groupOptions.value[0]?.value ?? 'all'
}, {immediate: true})

// Per-case aggregates from the account database. Null when logged out or the
// API is unreachable — then the local spaced-repetition data fills in.
const serverStats = ref(null)
const loading = ref(false)

const loadServerStats = async () => {
  if (!auth.loggedIn) {
    serverStats.value = null
    return
  }
  loading.value = true
  try {
    const data = await apiFetch('/api/stats?algset=' + encodeURIComponent(algset.activeId))
    const map = {}
    for (const c of data?.cases ?? []) map[c.caseKey] = c
    serverStats.value = map
  } catch (_) {
    serverStats.value = null
  } finally {
    loading.value = false
  }
}

watch(
    [() => auth.loggedIn, () => algset.activeId, () => sync.syncedSignal],
    loadServerStats,
    {immediate: true}
)

const caseLevel = computed(() => algset.active.levels[algset.active.levels.length - 1])

const rows = computed(() => algset.cases.map(c => {
  const toLetter = s => ls.toLetter(s)
  // Sets can define their own stats label (e.g. LTCT: set + letter pair);
  // otherwise fall back to the deepest level's display.
  const display = algset.active.statsDisplay
      ? algset.active.statsDisplay(c, toLetter)
      : caseLevel.value.display(c.path[c.path.length - 1], {toLetter})
  const srv = serverStats.value ? serverStats.value[c.id] : null
  const local = session.srsData[c.id]
  const count = srv ? srv.count : (local?.n ?? 0)
  const avgMs = srv ? srv.avgMs : (local?.a != null ? Math.round(local.a * 1000) : null)
  const bestMs = srv ? srv.bestMs : null
  return {
    id: c.id,
    group: c.path[0],
    primary: display.primary,
    secondary: display.secondary ?? '',
    path: c.path.join(' '),
    count, avgMs, bestMs,
  }
}))

// The rows in the picked group ('all' = everything). The trained/reps
// counters and the grid (when not searching) work on this scope.
const scopedRows = computed(() => {
  if (filterMode.value && groupFilter.value !== 'all') {
    return rows.value.filter(r => r.group === groupFilter.value)
  }
  return rows.value
})

const filtered = computed(() => {
  const q = searchText.value
  // no search: show the picked group (the search itself spans all cases)
  if (!q.trim()) return scopedRows.value
  return rows.value.filter(r => {
    // "UD NP": lets patterns span the set and the letter pair (e.g. "UD*P")
    const label = r.secondary ? r.secondary + ' ' + r.primary : r.primary
    return matchesWildcard(q, r.primary)
        || (r.secondary && matchesWildcard(q, r.secondary))
        || matchesWildcard(q, label)
        || matchesWildcard(q, r.path)
        || matchesWildcard(q, r.id)
  })
})

const sorted = computed(() => {
  const list = [...filtered.value]
  if (sortBy.value === 'count') {
    list.sort((a, b) => b.count - a.count)
  } else if (sortBy.value === 'avg') {
    list.sort((a, b) => (b.avgMs ?? -1) - (a.avgMs ?? -1))
  }
  return list
})

const totalReps = computed(() => scopedRows.value.reduce((sum, r) => sum + r.count, 0))
const trainedCases = computed(() => scopedRows.value.filter(r => r.count > 0).length)

const fmt = (ms) => ms == null ? '—' : msToHumanReadable(ms, 1, true)
</script>

<template>
  <div class="pt-3 pb-5">
    <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
      <h4 class="m-0 me-auto">{{ $t('stats.title') }}</h4>
      <AlgsetPicker/>
    </div>

    <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
      <div class="search-wrap flex-grow-1">
        <i class="bi bi-search search-icon"/>
        <input
            v-model="searchText"
            type="search"
            class="form-control search-input"
            :placeholder="$t('stats.search_placeholder')"/>
        <span
            class="help-anchor"
            @mouseenter="helpHover = true"
            @mouseleave="helpHover = false">
          <i
              class="bi bi-question-circle help-icon clickable"
              :class="{pinned: helpPinned}"
              @click="helpPinned = !helpPinned"/>
          <div v-if="helpVisible" class="search-help border rounded-2 shadow-sm p-2">
            <div>{{ $t('stats.search_help_intro') }}</div>
            <div class="fw-bold mt-2">{{ $t('stats.search_help_examples') }}</div>
            <table class="help-examples">
              <tbody>
                <tr><td><code>NP</code></td><td>{{ $t('stats.search_help_ex_pair') }}</td></tr>
                <tr><td><code>RDF</code></td><td>{{ $t('stats.search_help_ex_piece') }}</td></tr>
                <tr><td><code>UD*P</code></td><td>{{ $t('stats.search_help_ex_star') }}</td></tr>
                <tr><td><code>N?</code></td><td>{{ $t('stats.search_help_ex_qmark') }}</td></tr>
              </tbody>
            </table>
            <div class="mt-2 opacity-75">{{ $t('stats.search_help_whole') }}</div>
          </div>
        </span>
      </div>
      <select v-if="filterMode" v-model="groupFilter" class="form-select group-select">
        <option value="all">{{ $t('stats.filter_all_cases') }}</option>
        <option v-for="g in groupOptions" :key="g.value" :value="g.value">{{ g.label }}</option>
      </select>
      <select v-model="sortBy" class="form-select sort-select">
        <option value="default">{{ $t('stats.sort_default') }}</option>
        <option value="count">{{ $t('stats.sort_count') }}</option>
        <option value="avg">{{ $t('stats.sort_avg') }}</option>
      </select>
    </div>

    <div class="mb-2 small text-muted d-flex flex-wrap gap-3">
      <span><i class="bi bi-collection me-1"/>{{ $t('stats.cases_trained', {trained: trainedCases, total: scopedRows.length}) }}</span>
      <span><i class="bi bi-arrow-repeat me-1"/>{{ $t('stats.total_reps', {count: totalReps}) }}</span>
      <span v-if="loading"><i class="bi bi-cloud-arrow-down me-1"/>{{ $t('stats.loading') }}</span>
    </div>

    <div v-if="!auth.loggedIn && auth.loaded" class="alert alert-info py-2 small">
      <i class="bi bi-person-circle me-1"/>
      {{ $t('stats.local_hint') }}
      <a href="#" class="alert-link" @click.prevent="auth.login()">{{ $t('auth.login_with_wca') }}</a>
    </div>

    <div v-if="!algset.loaded" class="text-muted">{{ $t('select.loading') }}</div>
    <div v-else-if="sorted.length === 0" class="text-muted">{{ $t('stats.no_matches') }}</div>

    <div class="stats-grid">
      <div
          v-for="r in sorted"
          :key="r.id"
          class="stat-cell border rounded-1 clickable"
          :class="{untrained: r.count === 0}"
          @click="infoKey = r.id">
        <div class="d-flex justify-content-between align-items-center px-1 pt-1">
          <small class="opacity-75 text-truncate">{{ r.secondary }}</small>
        </div>
        <div class="text-center fs-5 fw-bold">{{ r.primary }}</div>
        <div class="stat-nums d-flex justify-content-between align-items-center px-1 pb-1">
          <span class="badge count-badge" :class="r.count > 0 ? 'text-bg-secondary' : 'text-bg-light'">
            {{ r.count }}×
          </span>
          <span class="avg-time" :title="r.bestMs != null ? $t('stats.best') + ': ' + fmt(r.bestMs) : ''">
            {{ fmt(r.avgMs) }}
          </span>
        </div>
      </div>
    </div>

    <CaseInfoModal v-if="infoKey" :caseKey="infoKey" :closeCallback="() => infoKey = null"/>
  </div>
</template>

<style scoped>
.search-wrap {
  position: relative;
  min-width: 180px;
}
.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0.5;
  pointer-events: none;
}
.search-input {
  padding-left: 32px;
  padding-right: 60px; /* room for the "?" icon next to the native clear button */
}
.help-anchor {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  /* the transform traps the box's z-index in this stacking context, so the
     anchor itself must sit above the (opacity-layered) stat cells */
  z-index: 1050;
}
.help-icon {
  opacity: 0.5;
}
.help-icon:hover,
.help-icon.pinned {
  opacity: 1;
  color: var(--bs-primary);
}
.search-help {
  position: absolute;
  right: -8px;
  top: calc(100% + 8px);
  width: min(340px, 85vw);
  background: var(--bs-body-bg);
  font-size: 0.85rem;
  z-index: 1050;
  cursor: default;
}
.help-examples td {
  padding: 1px 0;
}
.help-examples td:first-child {
  padding-right: 12px;
  white-space: nowrap;
}
.sort-select,
.group-select {
  width: auto;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 8px;
}
.stat-cell {
  background: var(--bs-body-bg);
}
.stat-cell:hover {
  border-color: var(--bs-primary) !important;
}
.stat-cell.untrained {
  opacity: 0.55;
}
.stat-nums {
  font-size: 0.85rem;
}
.avg-time {
  font-variant-numeric: tabular-nums;
}
.clickable {
  cursor: pointer;
}
@media (max-width: 575.98px) {
  .stats-grid {
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 6px;
  }
}
</style>
