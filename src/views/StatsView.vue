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
  const display = caseLevel.value.display(c.path[c.path.length - 1], {toLetter: s => ls.toLetter(s)})
  const srv = serverStats.value ? serverStats.value[c.id] : null
  const local = session.srsData[c.id]
  const count = srv ? srv.count : (local?.n ?? 0)
  const avgMs = srv ? srv.avgMs : (local?.a != null ? Math.round(local.a * 1000) : null)
  const bestMs = srv ? srv.bestMs : null
  return {
    id: c.id,
    primary: display.primary,
    secondary: display.secondary ?? '',
    path: c.path.join(' '),
    count, avgMs, bestMs,
  }
}))

const filtered = computed(() => {
  const q = searchText.value
  if (!q.trim()) return rows.value
  return rows.value.filter(r =>
      matchesWildcard(q, r.primary)
      || (r.secondary && matchesWildcard(q, r.secondary))
      || matchesWildcard(q, r.path)
      || matchesWildcard(q, r.id))
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

const totalReps = computed(() => rows.value.reduce((sum, r) => sum + r.count, 0))
const trainedCases = computed(() => rows.value.filter(r => r.count > 0).length)

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
      </div>
      <select v-model="sortBy" class="form-select sort-select">
        <option value="default">{{ $t('stats.sort_default') }}</option>
        <option value="count">{{ $t('stats.sort_count') }}</option>
        <option value="avg">{{ $t('stats.sort_avg') }}</option>
      </select>
    </div>

    <div class="mb-2 small text-muted d-flex flex-wrap gap-3">
      <span><i class="bi bi-collection me-1"/>{{ $t('stats.cases_trained', {trained: trainedCases, total: rows.length}) }}</span>
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
}
.sort-select {
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
