<script setup>
import {computed, ref} from "vue";
import {useBluetoothCubeStore} from "@/stores/BluetoothCubeStore";

const bt = useBluetoothCubeStore();
const text = computed(() => bt.diagnostics.join('\n'))
const copied = ref(false)
const taRef = ref(null)

const copy = async () => {
  const value = text.value
  let ok = false
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value)
      ok = true
    }
  } catch (_) { /* fall through to the textarea method */ }
  if (!ok && taRef.value) {
    // Bluefy / older iOS: select the textarea and use execCommand.
    taRef.value.focus()
    taRef.value.select()
    try { ok = document.execCommand('copy') } catch (_) { ok = false }
  }
  copied.value = ok
  if (ok) setTimeout(() => { copied.value = false }, 2000)
}

const selectAll = () => {
  if (taRef.value) { taRef.value.focus(); taRef.value.select() }
}
</script>

<template>
  <div class="diag-overlay" @click.self="bt.closeDiagnostics()">
    <div class="diag-card">
      <div class="diag-header">
        <strong>{{ $t('nav.diag_title') }}</strong>
        <button class="btn-close" :aria-label="$t('nav.diag_close')" @click="bt.closeDiagnostics()"></button>
      </div>
      <p class="diag-hint">{{ $t('nav.diag_hint') }}</p>
      <textarea
          ref="taRef"
          class="diag-text"
          readonly
          :value="text"
          @focus="selectAll"></textarea>
      <div class="diag-actions">
        <button class="btn btn-sm btn-primary" @click="copy">
          <i class="bi bi-clipboard me-1"></i>{{ copied ? $t('nav.diag_copied') : $t('nav.diag_copy') }}
        </button>
        <button class="btn btn-sm btn-outline-secondary" @click="selectAll">
          {{ $t('nav.diag_select_all') }}
        </button>
        <button class="btn btn-sm btn-outline-secondary ms-auto" @click="bt.closeDiagnostics()">
          {{ $t('nav.diag_close') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diag-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.diag-card {
  background: var(--bs-body-bg);
  color: var(--bs-body-color);
  border: 1px solid var(--bs-border-color);
  border-radius: 10px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
  width: 100%;
  max-width: 640px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  padding: 14px;
}
.diag-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.diag-hint {
  font-size: 0.85rem;
  opacity: 0.75;
  margin: 0 0 8px;
}
.diag-text {
  flex: 1 1 auto;
  min-height: 200px;
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.72rem;
  line-height: 1.35;
  white-space: pre;
  overflow: auto;
  resize: vertical;
  background: var(--bs-tertiary-bg, rgba(128, 128, 128, 0.1));
  color: var(--bs-body-color);
  border: 1px solid var(--bs-border-color);
  border-radius: 6px;
  padding: 8px;
}
.diag-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
</style>
