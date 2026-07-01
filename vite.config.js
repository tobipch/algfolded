import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  base: '',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    rollupOptions: {
      output: {
        // Split stable vendor code into long-cacheable chunks. cubing is left
        // alone — it already dynamic-imports its heavy 3D/puzzle parts.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/](@vue|vue|vue-router|pinia|vue-i18n|@intlify)[\\/]/.test(id)) {
            return 'vue-vendor'
          }
          if (/[\\/]node_modules[\\/](bootstrap|@popperjs)[\\/]/.test(id)) {
            return 'bootstrap'
          }
        }
      }
    }
  }
})
