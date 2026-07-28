import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
// @ts-expect-error -- plain .mjs plugin, no types
import jsonRaw from './scripts/vite-plugin-json-raw.mjs'

// Separate config for the *.bench.ts stopwatches, so `npm test` stays a pure
// correctness run and doesn't pay for (or print) the timing files.
//   npm run bench
export default defineConfig({
  plugins: [vue(), jsonRaw()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.bench.ts'],
  },
})
