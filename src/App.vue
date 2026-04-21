<script setup>
import {RouterView} from 'vue-router'
import NavBar from "@/components/nav/NavBar.vue";
import "@/assets/global.css"
import {useThemeStore} from "@/stores/ThemeStore";
import {useSessionStore} from "@/stores/SessionStore";
import {useSelectedStore} from "@/stores/SelectedStore";
import {useDisplayStore} from "@/stores/DisplayStore";
import {watch} from "vue";

useThemeStore().applyCurrentTheme();
const selected = useSelectedStore()
const session = useSessionStore()
const display = useDisplayStore()

// bind selectStore and sessionStore
watch(() => selected.store.keys, () => {
  session.setSelectedKeys(selected.store.keys)
})
session.setSelectedKeys(selected.store.keys)

</script>

<template>
  <div class="min-vh-100 d-flex flex-column">
    <NavBar/>
    <div class="app-content flex-grow-1 d-flex flex-column">
      <RouterView/>
    </div>
    <div v-if="display.toastVisible" class="app-toast" :class="'toast-' + display.toastType"
         @click="display.toastVisible = false">
      {{ display.toastMessage }}
    </div>
  </div>
</template>

<style>
:root {
  --app-gutter: 12px;
}
.app-content {
  max-width: 1500px;
  width: 100%;
  margin: 0 auto;
  padding-left: var(--app-gutter);
  padding-right: var(--app-gutter);
}
.app-toast {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 0.9rem;
  z-index: 1080;
  cursor: pointer;
  animation: toast-in 0.25s ease-out;
  box-shadow: 0 2px 12px rgba(0,0,0,0.2);
}
.toast-success { background: var(--bs-success); color: #fff; }
.toast-danger { background: var(--bs-danger); color: #fff; }
.toast-info { background: var(--bs-info); color: #fff; }
@keyframes toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
</style>

