/// <reference types="vite/client" />

// SFC shim so `.vue` imports are typed when referenced from .ts files.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>
  export default component
}
