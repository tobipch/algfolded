<script setup>
import LangDropdown from "@/components/nav/LangDropdown.vue";
import ThemeSwitcher from "@/components/nav/ThemeSwitcher.vue";
import BtDiagnosticsModal from "@/components/nav/BtDiagnosticsModal.vue";
import {useSelectedStore} from "@/stores/SelectedStore";
import {useDisplayStore} from "@/stores/DisplayStore";
import {useRouter, useRoute} from "vue-router";
import {computed, onMounted, onUnmounted, ref, watch} from "vue";
import {useSessionStore} from "@/stores/SessionStore";
import {useBluetoothCubeStore} from "@/stores/BluetoothCubeStore";
import {useCommandPaletteStore} from "@/stores/CommandPaletteStore";
import {useAuthStore} from "@/stores/AuthStore";
import {useI18n} from 'vue-i18n'

const {t} = useI18n()
const selected = useSelectedStore();
const session = useSessionStore()
const bt = useBluetoothCubeStore()
const palette = useCommandPaletteStore()
const auth = useAuthStore()

// Mobile: the action buttons collapse into a hamburger panel.
const showMobileMenu = ref(false)
const navActionsWrap = ref(null)
const burgerBtn = ref(null)

// Account dropdown (login with WCA / logout)
const showAccountMenu = ref(false)
const accountWrap = ref(null)
const onAccountClick = () => {
  if (!auth.loggedIn) { auth.login(); return }
  showAccountMenu.value = !showAccountMenu.value
}
const onLogoutClick = async () => {
  showAccountMenu.value = false
  await auth.logout()
}
onMounted(() => auth.checkAuthError(t))

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
  if (showAccountMenu.value && accountWrap.value && !accountWrap.value.contains(e.target)) {
    showAccountMenu.value = false
  }
  if (showMobileMenu.value
      && navActionsWrap.value && !navActionsWrap.value.contains(e.target)
      && burgerBtn.value && !burgerBtn.value.contains(e.target)) {
    showMobileMenu.value = false
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
const isSettingsView = computed(() => route.name === 'settings')
const isStatsView = computed(() => route.name === 'stats')
const settingsBtnClass = computed(() => isSettingsView.value ? 'btn-info' : 'btn-outline-info')

// Open settings remembering where we came from, so closing returns there
// (e.g. open from the trainer -> back to the trainer).
const openSettings = () => router.push({name: 'settings', query: {from: route.name}})
const closeSettings = () => router.push({name: route.query.from === 'timer' ? 'timer' : 'select'})
const statsBtnClass = computed(() => isStatsView.value ? 'btn-info' : 'btn-outline-info')
const tinySelectBtnText = computed(() => {
  return isTimerView && session.store.recapMode
      ? (session.casesWithZeroCount.length + '/' + selected.totalCasesSelected())
      : selected.totalCasesSelected()
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
// Close the mobile menu after navigating somewhere from within it.
watch(() => route.fullPath, () => { showMobileMenu.value = false })

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
      <div class="me-auto d-flex align-items-center">
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
        <span v-else class="mx-3 logoText clickable d-inline-flex align-items-center" @click="router.push('select')">
          <img src="/favicons/favicon.svg" alt="" class="logo-icon me-2"/>
          {{ $t("nav.trainer_title") }}
        </span>
        <span class="mx-2 d-none d-sm-inline-block">
          {{ $t("nav.n_cases", selected.totalCasesSelected()) }}
        </span>
        <span class="mx-2 d-none d-sm-inline-block" v-if="isTimerView && session.store.recapMode">
          {{ $t("nav.n_to_recap", session.casesWithZeroCount.length) }}
        </span>
      </div>
      <div class="nav-right d-flex align-items-center">
        <button
            ref="burgerBtn"
            class="btn btn-outline-secondary burger-btn d-sm-none"
            tabindex="-1" @keydown.space.prevent=""
            :title="$t('nav.menu')"
            @click.stop="showMobileMenu = !showMobileMenu">
          <i class="bi" :class="showMobileMenu ? 'bi-x-lg' : 'bi-list'"></i>
        </button>
      <div ref="navActionsWrap" class="nav-actions d-flex align-items-center gap-1" :class="{open: showMobileMenu}">
        <div class="nav-item">
          <span class="nav-label">{{ $t('nav.language') }}</span>
          <LangDropdown/>
        </div>
        <div class="nav-item">
          <span class="nav-label">{{ bt.connected ? $t('nav.bluetooth_disconnect') : $t('nav.bluetooth_connect') }}</span>
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
              <button class="bt-connect-item bt-connect-log" @click.stop="showConnectMenu = false; bt.openDiagnostics()">
                <i class="bi bi-file-earmark-text me-1"/>{{ $t('nav.bluetooth_log') }}
              </button>
            </div>
          </span>
        </div>
        <div v-if="bt.connected && bt.battery !== null" class="nav-item">
          <span class="nav-label">{{ $t('nav.battery') }}</span>
          <span class="bt-battery-wrap d-flex align-items-center" tabindex="0" @touchstart.prevent="">
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
        </div>
        <div v-if="bt.connected" class="nav-item">
          <span class="nav-label">{{ bt.paused ? $t('nav.bluetooth_resume') : $t('nav.bluetooth_pause') }}</span>
          <span class="bt-feature-wrap" tabindex="0" @touchstart.prevent="">
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
        </div>
        <div v-if="bt.connected" class="nav-item">
          <span class="nav-label">{{ $t('nav.bluetooth_reset_to_solved') }}</span>
          <span class="bt-feature-wrap" tabindex="0" @touchstart.prevent="">
            <button
                class="btn btn-outline-secondary"
                tabindex="-1" @keydown.space.prevent=""
                @click="bt.resetToSolved()">
              <i class="bi-arrow-counterclockwise"/>
            </button>
            <i class="bi-bluetooth bt-feature-badge"/>
            <span class="bt-feature-tooltip">{{ $t('nav.bluetooth_reset_to_solved') }} (Alt+M)</span>
          </span>
        </div>
        <div class="nav-item">
          <span class="nav-label">{{ $t('cmd.open') }}</span>
          <button
              class="btn btn-outline-info"
              tabindex="-1" @keydown.space.prevent=""
              @click="palette.openPalette()"
              :title="$t('cmd.open') + ' (Alt+K)'">
            <i class="bi-command"/>
          </button>
        </div>
        <div class="nav-item">
          <span class="nav-label">{{ $t('nav.stats') }}</span>
          <button
              class="btn"
              tabindex="-1" @keydown.space.prevent=""
              :class="statsBtnClass"
              @click="isStatsView ? router.push('select') : router.push('stats')"
              :title="$t('nav.stats')">
            <i class="bi-bar-chart"/>
          </button>
        </div>
        <div class="nav-item">
          <span class="nav-label">{{ $t('nav.settings') }}</span>
          <button
              class="btn"
              tabindex="-1" @keydown.space.prevent=""
              :class="settingsBtnClass"
              @click="isSettingsView ? closeSettings() : openSettings()"
              :title="$t('nav.settings')">
            <i class="bi-wrench"/>
          </button>
        </div>
        <div class="nav-item">
          <span class="nav-label">{{ auth.loggedIn ? auth.user.name : $t('auth.login_with_wca') }}</span>
          <span ref="accountWrap" class="bt-connect-wrap">
            <button
                class="btn"
                tabindex="-1" @keydown.space.prevent=""
                :class="auth.loggedIn ? 'btn-success' : 'btn-outline-secondary'"
                @click.stop="onAccountClick"
                :title="auth.loggedIn ? auth.user.name : $t('auth.login_with_wca')">
              <img v-if="auth.loggedIn && auth.user.avatarUrl"
                   :src="auth.user.avatarUrl" class="account-avatar" alt=""/>
              <i v-else class="bi-person-circle"/>
            </button>
            <div v-if="showAccountMenu && auth.loggedIn" class="bt-connect-menu">
              <div class="bt-connect-menu-title">{{ auth.user.name }}<template v-if="auth.user.wcaId"> · {{ auth.user.wcaId }}</template></div>
              <button class="bt-connect-item" @click.stop="showAccountMenu = false; router.push('stats')">
                <i class="bi-bar-chart me-1"/>{{ $t('nav.stats') }}
              </button>
              <button class="bt-connect-item" @click.stop="onLogoutClick">
                <i class="bi-box-arrow-right me-1"/>{{ $t('auth.logout') }}
              </button>
            </div>
          </span>
        </div>
        <div class="nav-item">
          <span class="nav-label">{{ $t('nav.toggle_night_mode') }}</span>
          <ThemeSwitcher/>
        </div>
      </div>
      </div>
    </div>
  </nav>
  <BtDiagnosticsModal v-if="bt.diagnosticsVisible"/>
</template>

<style scoped>
.logoText {
  font-weight: 900;
}

/* Mobile: the action buttons collapse behind a hamburger so the bar never
   overflows. Desktop keeps them inline (the media query below is a no-op
   there, and the burger is d-sm-none). */
.nav-right {
  position: relative;
}
/* Desktop: nav-item is transparent to layout, so each control flows as a
   direct flex child exactly as before; the labels stay hidden. */
.nav-item {
  display: contents;
}
.nav-label {
  display: none;
}
@media (max-width: 575.98px) {
  .nav-actions {
    display: none !important;
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 1060;
    flex-direction: column;
    align-items: stretch;
    width: max-content;
    min-width: 220px;
    max-width: calc(100vw - 2 * var(--app-gutter, 12px));
    padding: 8px;
    gap: 4px !important;
    background: var(--bs-body-bg);
    border: 1px solid var(--bs-border-color);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  }
  .nav-actions.open {
    display: flex !important;
  }
  /* Each control becomes a full-width row: label on the left, icon on the right. */
  .nav-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 2px 4px;
  }
  .nav-label {
    display: inline;
    font-size: 0.92rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
.logo-icon {
  height: 1.4em;
  width: auto;
  vertical-align: middle;
 }
/* The avatar renders 28px but only takes 24px in the layout (negative
   margins), so the button stays exactly as tall as its 38px siblings. */
.account-avatar {
  width: 28px;
  height: 28px;
  margin: -2px 0;
  border-radius: 50%;
  object-fit: cover;
  display: block;
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