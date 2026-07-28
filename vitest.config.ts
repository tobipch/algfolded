import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
// @ts-expect-error -- plain .mjs plugin, no types
import jsonRaw from './scripts/vite-plugin-json-raw.mjs'

// Separate from vite.config.js so the build config stays untouched.
export default defineConfig({
  plugins: [vue(), jsonRaw()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // jsdom by default so store and component tests get localStorage and a
    // DOM. The pure-logic suites (algsets, helpers) opt back out with a
    // `@vitest-environment node` docblock — they don't need it and node is
    // markedly faster to spin up.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
  },
})
