import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import App from './App.js';
import DemoApp from './demo/DemoApp.js';
import './index.css';

const RootApp = __CF_PAGES__ && !import.meta.env.VITE_WS_URL ? DemoApp : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
);
