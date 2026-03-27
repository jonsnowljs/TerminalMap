import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import App from './App.js';
import WasmApp from './WasmApp.js';
import './index.css';

function resolveTerminalBackend() {
  const configured = import.meta.env.VITE_TERMINAL_BACKEND?.trim().toLowerCase();
  if (configured === 'wasm' || configured === 'ws') {
    return configured;
  }

  return __CF_PAGES__ && !import.meta.env.VITE_WS_URL ? 'wasm' : 'ws';
}

const RootApp = resolveTerminalBackend() === 'wasm' ? WasmApp : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
);
