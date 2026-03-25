/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface PilgrimDataPayload {
  walks: import('./parsers/types').Walk[]
  rawWalks: unknown[]
  manifest?: import('./parsers/types').PilgrimManifest
}
