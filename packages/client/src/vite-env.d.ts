/// <reference types="vite/client" />

declare const __CF_PAGES__: boolean;

interface ImportMetaEnv {
  readonly VITE_TERMINAL_BACKEND?: 'ws' | 'wasm';
}

declare module '*.svg' {
  const src: string;
  export default src;
}
