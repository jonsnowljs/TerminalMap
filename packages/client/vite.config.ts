import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Cross-Origin isolation is required by @wasmer/sdk (uses SharedArrayBuffer)
const coiHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  define: {
    __CF_PAGES__: JSON.stringify(process.env.CF_PAGES === '1'),
  },
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // Wasmer resolves sibling runtime assets via import.meta.url; prebundling breaks
    // those relative URLs in dev because the copied .vite dep does not include them.
    exclude: ['@wasmer/sdk'],
  },
  server: {
    port: 5173,
    headers: coiHeaders,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
  preview: {
    headers: coiHeaders,
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        demo: 'demo.html',
      },
    },
  },
});
