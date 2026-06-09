<script setup>
import LangDropdown from "@/components/nav/LangDropdown.vue";
import ThemeSwitcher from "@/components/nav/ThemeSwitcher.vue";
import {useSelectedStore} from "@/stores/SelectedStore";
import {useDisplayStore} from "@/stores/DisplayStore";
import {useRouter, useRoute} from "vue-router";
import {computed, onMounted, onUnmounted, ref} from "vue";
import {useSessionStore} from "@/stores/SessionStore";
import {useBluetoothCubeStore} from "@/stores/BluetoothCubeStore";
import {useI18n} from 'vue-i18n'

const {t} = useI18n()
const selected = useSelectedStore();
const session = useSessionStore()
const bt = useBluetoothCubeStore()

// When connected the button disconnects; when disconnected it opens a small
// menu to pick the cube brand (different libraries handle GAN vs MoYu/QiYi).
const showConnectMenu = ref(false)
const btConnectWrap = ref(null)
const onBluetoothClick = () => {
  if (bt.connected) { bt.disconnect(); return }
  showConnectMenu.value = !showConnectMenu.value
}
const connectBrand = (brand) => {
  showConnectMenu.value = false
  bt.connect(brand)
}
const onDocClick = (e) => {
  if (showConnectMenu.value && btConnectWrap.value && !btConnectWrap.value.contains(e.target)) {
    showConnectMenu.value = false
  }
}
const btBtnClass = computed(() => bt.connected ? 'btn-info' : 'btn-outline-secondary')
const btTooltip = computed(() => bt.connected
    ? t('nav.bluetooth_disconnect') + (bt.deviceName ? ` (${bt.deviceName})` : '')
    : t('nav.bluetooth_connect')
)
const router = useRouter();
const route = useRoute()
const displayStore = useDisplayStore()

const isTimerView = computed(() => route.fullPath.endsWith("timer"))
const settingsBtnClass = computed(() => displayStore.showSettings ? 'btn-info' : 'btn-outline-info')
const tinySelectBtnText = computed(() => {
  return isTimerView && session.store.recapMode
      ? (session.casesWithZeroCount.length + '/' + selected.totalZbllsSelected())
      : selected.totalZbllsSelected()
})

const onGlobalKeyDown = (e) => {
  if (!e.altKey || !bt.connected) return
  if (e.key === 'y' || e.key === 'Y') {
    bt.paused ? bt.resumeTracking() : bt.pauseTracking()
    e.preventDefault()
  } else if (e.key === 'm' || e.key === 'M') {
    bt.resetToSolved()
    e.preventDefault()
  }
}
onMounted(() => {
  window.addEventListener('keydown', onGlobalKeyDown)
  document.addEventListener('click', onDocClick)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeyDown)
  document.removeEventListener('click', onDocClick)
})
</script>

<template>
  <nav class="navbar bg-secondary bg-opacity-25 py-lg-3 py-1 w-100">
    <div class="navbar-inner w-100 d-flex align-items-center">
      <div class="me-auto">
        <button
            v-if="isTimerView"
            tabindex="-1"
            @keydown.space.prevent=""
            @click="router.push('select')"
            class="mx-2 btn btn-primary">
          <span class="d-none d-sm-inline-block">{{ $t("nav.select_btn") }}</span>
          <i class="bi bi-card-checklist d-inline-block d-sm-none">
            {{ ` ${tinySelectBtnText}` }}
          </i>
        </button>
        <button
            v-if="isTimerView"
            @click="displayStore.showStatistics = !displayStore.showStatistics"
            :class="displayStore.showStatistics ? 'btn-primary' : 'btn-outline-primary'"
            class="mx-2 btn d-inline-block d-sm-none m-0">
          <i class="bi bi-list-columns"></i>
        </button>
        <span v-else class="mx-3 logoText">
          {{ $t("nav.zbll_trainer") }}
        </span>
        <span class="mx-2 d-none d-sm-inline-block">
          {{ $t("nav.n_cases", selected.totalZbllsSelected()) }}
        </span>
        <span class="mx-2 d-none d-sm-inline-block" v-if="isTimerView && session.store.recapMode">
          {{ $t("nav.n_to_recap", session.casesWithZeroCount.length) }}
        </span>
      </div>
      <div class="d-flex align-items-center justify-content-end p-0 gap-1">
        <LangDropdown/>
        <span ref="btConnectWrap" class="bt-connect-wrap">
          <button
              class="btn"
              tabindex="-1" @keydown.space.prevent=""
              :class="btBtnClass"
              @click.stop="onBluetoothClick"
              :title="btTooltip">
            <i class="bi-bluetooth"/>
          </button>
          <div v-if="showConnectMenu && !bt.connected" class="bt-connect-menu">
            <div class="bt-connect-menu-title">{{ $t('nav.bluetooth_select_brand') }}</div>
            <button class="bt-connect-item" @click.stop="connectBrand('gan')">GAN</button>
            <button class="bt-connect-item" @click.stop="connectBrand('moyu')">MoYu / QiYi</button>
          </div>
        </span>
        <span v-if="bt.connected && bt.battery !== null" class="bt-battery-wrap d-flex align-items-center"
              tabindex="0" @touchstart.prevent="">
          <svg width="20" height="10" viewBox="0 0 20 10">
            <rect x="0" y="0" width="17" height="10" rx="1.5" fill="none"
                  :stroke="bt.battery <= 20 ? 'var(--bs-danger)' : 'currentColor'" stroke-width="1.2"/>
            <rect x="17" y="3" width="2.5" height="4" rx="0.5"
                  :fill="bt.battery <= 20 ? 'var(--bs-danger)' : 'currentColor'"/>
            <rect v-if="bt.battery > 5" x="1.5" y="1.5" width="4" height="7" rx="0.5"
                  :fill="bt.battery <= 20 ? 'var(--bs-danger)' : 'var(--bs-success)'"/>
            <rect v-if="bt.battery > 33" x="6.5" y="1.5" width="4" height="7" rx="0.5"
                  :fill="'var(--bs-success)'"/>
            <rect v-if="bt.battery > 66" x="11.5" y="1.5" width="4" height="7" rx="0.5"
                  :fill="'var(--bs-success)'"/>
          </svg>
          <span class="bt-battery-tooltip">{{ bt.battery }}%</span>
        </span>
        <span v-if="bt.connected" class="bt-feature-wrap" tabindex="0" @touchstart.prevent="">
          <button
              class="btn"
              tabindex="-1" @keydown.space.prevent=""
              :class="bt.paused ? 'btn-warning' : 'btn-outline-secondary'"
              @click="bt.paused ? bt.resumeTracking() : bt.pauseTracking()">
            <i :class="bt.paused ? 'bi-play-fill' : 'bi-pause-fill'"/>
          </button>
          <i class="bi-bluetooth bt-feature-badge"/>
          <span class="bt-feature-tooltip">{{ bt.paused ? $t('nav.bluetooth_resume') : $t('nav.bluetooth_pause') }} (Alt+Y)</span>
        </span>
        <span v-if="bt.connected" class="bt-feature-wrap" tabindex="0" @touchstart.prevent="">
          <button
              class="btn btn-outline-secondary"
              tabindex="-1" @keydown.space.prevent=""
              @click="bt.resetToSolved()">
            <i class="bi-arrow-counterclockwise"/>
          </button>
          <i class="bi-bluetooth bt-feature-badge"/>
          <span class="bt-feature-tooltip">{{ $t('nav.bluetooth_reset_to_solved') }} (Alt+M)</span>
        </span>
        <button
            class="btn"
            tabindex="-1" @keydown.space.prevent=""
            :class="settingsBtnClass"
            @click="displayStore.showSettings = !displayStore.showSettings"
            :title="$t('nav.settings')">
          <i class="bi-wrench"/>
        </button>
        <ThemeSwitcher/>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.logoText {
  font-weight: 900;
}
.bt-connect-wrap {
  position: relative;
  display: inline-block;
}
.bt-connect-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 1050;
  min-width: 160px;
  padding: 4px;
  background: var(--bs-body-bg);
  border: 1px solid var(--bs-border-color, rgba(0, 0, 0, 0.15));
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}
.bt-connect-menu-title {
  font-size: 0.7rem;
  text-transform: uppercase;
  opacity: 0.6;
  padding: 4px 10px 2px;
}
.bt-connect-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 10px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--bs-body-color);
  font-size: 0.9rem;
  cursor: pointer;
}
.bt-connect-item:hover {
  background: var(--bs-primary);
  color: #fff;
}
.navbar-inner {
  max-width: 1500px;
  width: 100%;
  margin: 0 auto;
  padding-left: var(--app-gutter);
  padding-right: var(--app-gutter);
}
.bt-battery-wrap {
  position: relative;
  cursor: pointer;
}
.bt-battery-tooltip {
  display: none;
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 8px;
  background: var(--bs-dark, #333);
  color: var(--bs-light, #fff);
  border-radius: 4px;
  font-size: 0.75rem;
  white-space: nowrap;
  z-index: 1070;
  pointer-events: none;
}
.bt-battery-wrap:hover .bt-battery-tooltip,
.bt-battery-wrap:active .bt-battery-tooltip,
.bt-battery-wrap:focus .bt-battery-tooltip {
  display: block;
}
.bt-feature-wrap {
  position: relative;
  display: inline-flex;
  outline: none;
}
.bt-feature-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: var(--bs-info);
  color: #fff;
  border-radius: 50%;
  width: 14px;
  height: 14px;
  font-size: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  box-shadow: 0 0 0 1.5px var(--bs-body-bg);
}
.bt-feature-tooltip {
  display: none;
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 8px;
  background: var(--bs-dark, #333);
  color: var(--bs-light, #fff);
  border-radius: 4px;
  font-size: 0.75rem;
  white-space: nowrap;
  z-index: 1070;
  pointer-events: none;
}
.bt-feature-wrap:hover .bt-feature-tooltip,
.bt-feature-wrap:focus .bt-feature-tooltip,
.bt-feature-wrap:focus-within .bt-feature-tooltip {
  display: block;
}
</style>