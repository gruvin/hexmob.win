/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VERSION?: string
  // Brand stamped by deploy.sh from TARGET ("hexmob" | "tsa"). Absent under `yarn dev`,
  // where App.tsx falls back to hostname detection.
  readonly VITE_BRAND?: "hexmob" | "tsa"
  readonly VITE_REOWN_APPKIT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
