import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useWasmShell, type CompletedCommand } from './useWasmShell.js';
import CommandGraph from './CommandGraph.js';

export default function DemoApp() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [termReady, setTermReady] = useState(false);
  const [commands, setCommands] = useState<CompletedCommand[]>([]);

  const handleCommandComplete = useCallback((cmd: CompletedCommand) => {
    setCommands((prev) => [...prev, cmd]);
  }, []);

  const { status, startShell } = useWasmShell(termRef, handleCommandComplete);

  // Mount xterm.js once the container div is in the DOM
  useEffect(() => {
    const container = containerRef.current;
    if (!container || termRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      theme: {
        background: '#1d1b19',
        foreground: '#f4efe7',
        cursor: '#7e95ab',
        selectionBackground: '#556f8a4d',
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    termRef.current = term;
    fitAddonRef.current = fitAddon;

    requestAnimationFrame(() => fitAddon.fit());

    const ro = new ResizeObserver(() => requestAnimationFrame(() => fitAddon.fit()));
    ro.observe(container);

    term.write('\x1b[1;36mTerminalMap\x1b[0m \x1b[2m– WASM Demo\x1b[0m\r\n\r\n');
    term.write('Click \x1b[1mStart shell\x1b[0m to launch a real bash session\r\n');
    term.write('running entirely in your browser via WebAssembly.\r\n\r\n');
    term.write('\x1b[2mNote: first start fetches bash from the Wasmer registry (~10 MB).\x1b[0m\r\n');

    setTermReady(true);

    return () => {
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      setTermReady(false);
    };
  }, []);

  return (
    <div className="flex h-screen flex-col" style={{ background: 'var(--app-bg)', color: 'var(--text-strong)' }}>
      {/* Header */}
      <header
        className="flex shrink-0 items-center gap-3 border-b px-4 py-3"
        style={{ borderColor: 'var(--border-subtle)', background: 'var(--panel-bg)' }}
      >
        <span className="text-base font-semibold" style={{ color: 'var(--text-strong)' }}>
          TerminalMap
        </span>
        <span
          className="rounded px-1.5 py-0.5 text-xs font-medium text-white"
          style={{ background: '#b88929' }}
        >
          demo
        </span>

        <div className="ml-auto flex items-center gap-3">
          {status === 'idle' && termReady && (
            <button
              onClick={startShell}
              className="rounded px-3 py-1.5 text-sm font-medium text-white transition-colors hover:opacity-90"
              style={{ background: 'var(--accent-command)' }}
            >
              Start shell
            </button>
          )}
          {status === 'initializing' && (
            <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--accent-note)' }}>
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
              Loading WASM…
            </span>
          )}
          {status === 'ready' && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600">
              <span className="inline-block h-2 w-2 rounded-full bg-current" />
              Shell ready
            </span>
          )}
          {status === 'error' && (
            <span className="text-sm text-red-500">Shell failed – check console</span>
          )}
        </div>
      </header>

      {/* Split pane */}
      <div className="flex min-h-0 flex-1">
        {/* Terminal – 55% */}
        <div className="flex flex-col" style={{ width: '55%', borderRight: '1px solid var(--border-subtle)' }}>
          <div
            className="shrink-0 px-3 py-1.5 text-xs"
            style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-faint)', background: 'var(--panel-muted)' }}
          >
            bash (WASM)
          </div>
          {/* xterm.js fills the rest */}
          <div ref={containerRef} className="min-h-0 flex-1" style={{ background: '#1d1b19' }} />
        </div>

        {/* Graph – 45% */}
        <div className="flex flex-col" style={{ width: '45%', background: 'var(--panel-bg)' }}>
          <div
            className="shrink-0 px-3 py-1.5 text-xs"
            style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-faint)', background: 'var(--panel-muted)' }}
          >
            Execution graph
            {commands.length > 0 && (
              <span
                className="ml-2 rounded px-1.5 py-0.5 font-medium"
                style={{ background: 'var(--accent-command-soft)', color: 'var(--accent-command)' }}
              >
                {commands.length} command{commands.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1">
            <CommandGraph commands={commands} />
          </div>
        </div>
      </div>
    </div>
  );
}
