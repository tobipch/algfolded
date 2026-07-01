import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ALGSETS } from '@/algsets/registry'
import { useAlgsetStore } from '@/stores/AlgsetStore'
import { useSelectedStore } from '@/stores/SelectedStore'
import { useSessionStore } from '@/stores/SessionStore'
import { usePresetsStore } from '@/stores/PresetStore'
import { useSettingsStore } from '@/stores/SettingsStore'
import { useThemeStore } from '@/stores/ThemeStore'
import { useLetterSchemeStore } from '@/stores/LetterSchemeStore'
import { useBluetoothCubeStore } from '@/stores/BluetoothCubeStore'
import { useDisplayStore } from '@/stores/DisplayStore'
import { supportedLocales, setLocaleAndReload } from '@/locale'

// Reactive, context-aware list of palette commands. Each command is
// { id, section, title, icon?, keywords?, active?, run() }; the palette closes
// after running one.
export const useCommands = () => {
  const router = useRouter()
  const route = useRoute()
  const { t } = useI18n()
  const algset = useAlgsetStore()
  const selected = useSelectedStore()
  const session = useSessionStore()
  const presets = usePresetsStore()
  const settings = useSettingsStore()
  const theme = useThemeStore()
  const ls = useLetterSchemeStore()
  const bt = useBluetoothCubeStore()
  const display = useDisplayStore()

  const goSettings = () => router.push({ name: 'settings', query: { from: route.name } })

  return computed(() => {
    const S = {
      nav: t('cmd.section.nav'),
      practice: t('cmd.section.practice'),
      algset: t('cmd.section.algset'),
      selection: t('cmd.section.selection'),
      presets: t('cmd.section.presets'),
      settings: t('cmd.section.settings'),
      cube: t('cmd.section.cube'),
    }
    const cmds = []

    // ---- navigation ----
    cmds.push(
      { id: 'nav.select', section: S.nav, icon: 'bi-grid', title: t('cmd.go_select'), run: () => { router.push('select') } },
      { id: 'nav.timer', section: S.nav, icon: 'bi-stopwatch', title: t('cmd.go_timer'), run: () => { router.push('timer') } },
      { id: 'nav.settings', section: S.nav, icon: 'bi-gear', title: t('cmd.go_settings'), run: goSettings },
      { id: 'nav.about', section: S.nav, icon: 'bi-info-circle', title: t('cmd.go_about'), run: () => { router.push('about') } },
    )

    // ---- practice ----
    if (selected.totalCasesSelected() > 0) {
      cmds.push(
        { id: 'practice.start', section: S.practice, icon: 'bi-play-fill', title: t('cmd.start_practice'),
          run: () => { session.store.recapMode = false; router.push('timer') } },
        { id: 'practice.recap', section: S.practice, icon: 'bi-arrow-repeat', title: t('cmd.recap'),
          run: () => { session.startRecap(); router.push('timer') } },
      )
    }

    // ---- switch algset ----
    for (const set of ALGSETS) {
      cmds.push({
        id: `algset.${set.id}`, section: S.algset, icon: 'bi-collection',
        title: t('cmd.switch_to', { name: t(set.name) }), keywords: t(set.name),
        active: algset.activeId === set.id,
        run: () => { algset.activate(set.id) },
      })
    }

    // ---- selection ----
    cmds.push(
      { id: 'sel.all', section: S.selection, icon: 'bi-check2-all', title: t('cmd.select_all'), run: () => selected.selectAll() },
      { id: 'sel.none', section: S.selection, icon: 'bi-x-lg', title: t('cmd.deselect_all'), run: () => selected.deselectAll() },
      { id: 'sel.invert', section: S.selection, icon: 'bi-arrow-left-right', title: t('cmd.invert'), run: () => selected.invertSelection() },
    )

    // ---- presets ----
    for (const name of Object.keys(presets.map)) {
      cmds.push({
        id: `preset.${name}`, section: S.presets, icon: 'bi-bookmark',
        title: t('cmd.load_preset', { name }), keywords: name,
        run: () => selected.applyFromPreset(presets.getCases(name)),
      })
    }
    cmds.push({
      id: 'preset.save', section: S.presets, icon: 'bi-bookmark-plus', title: t('cmd.save_preset'),
      run: () => {
        const name = window.prompt(t('cmd.save_preset_prompt'))?.trim()
        if (name) { presets.setPreset(name, [...selected.store.keys]); display.showToast(t('cmd.preset_saved', { name }), 'success') }
      },
    })

    // ---- settings ----
    cmds.push(
      { id: 'set.smart', section: S.settings, icon: 'bi-shuffle', title: t('cmd.toggle_smart'), active: settings.store.smartSelection,
        run: () => { settings.store.smartSelection = !settings.store.smartSelection } },
      { id: 'set.letterpair', section: S.settings, icon: 'bi-fonts', title: t('cmd.toggle_letterpair'), active: settings.store.letterPairMode,
        run: () => { settings.store.letterPairMode = !settings.store.letterPairMode } },
      { id: 'set.theme', section: S.settings, icon: theme.icon, title: t('cmd.toggle_theme'), run: () => theme.toggleDayNight() },
      { id: 'set.scheme', section: S.settings, icon: 'bi-type', title: t('cmd.reset_scheme'), run: () => ls.resetDefaults() },
    )
    for (const loc of supportedLocales) {
      cmds.push({
        id: `lang.${loc.code}`, section: S.settings, icon: 'bi-translate',
        title: t('cmd.set_lang', { lang: loc.name }), keywords: `${loc.name} ${loc.code}`,
        run: () => setLocaleAndReload(loc.code),
      })
    }

    // ---- smart cube ----
    if (bt.connected) {
      cmds.push(
        { id: 'cube.pause', section: S.cube, icon: 'bi-pause-circle',
          title: bt.paused ? t('cmd.resume_tracking') : t('cmd.pause_tracking'),
          run: () => (bt.paused ? bt.resumeTracking() : bt.pauseTracking()) },
        { id: 'cube.reset', section: S.cube, icon: 'bi-arrow-counterclockwise', title: t('cmd.reset_cube'), run: () => bt.resetToSolved() },
        { id: 'cube.disconnect', section: S.cube, icon: 'bi-bluetooth', title: t('cmd.disconnect_cube'), run: () => bt.disconnect() },
      )
    } else {
      cmds.push(
        { id: 'cube.gan', section: S.cube, icon: 'bi-bluetooth', title: t('cmd.connect_gan'), run: () => bt.connect('gan') },
        { id: 'cube.moyu', section: S.cube, icon: 'bi-bluetooth', title: t('cmd.connect_moyu'), run: () => bt.connect('moyu') },
      )
    }

    // ---- context: current scramble ----
    if (session.currentScramble) {
      cmds.push({
        id: 'timer.copy_scramble', section: S.practice, icon: 'bi-clipboard', title: t('cmd.copy_scramble'),
        run: async () => {
          try { await navigator.clipboard.writeText(session.currentScramble); display.showToast(t('cmd.copied'), 'success') }
          catch { display.showToast(t('cmd.copy_failed'), 'danger') }
        },
      })
    }

    return cmds
  })
}
