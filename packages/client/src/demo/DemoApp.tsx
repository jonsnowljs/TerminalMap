import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useWasmShell, type CompletedCommand } from './useWasmShell.js';
import CommandGraph from './CommandGraph.js';

type MobileTab = 'terminal' | 'graph';

export default function DemoApp() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [termReady, setTermReady] = useState(false);
  const [commands, setCommands] = useState<CompletedCommand[]>([]);
  const [activeTab, setActiveTab] = useState<MobileTab>('terminal');
  // Track unseen commands while graph tab is not visible
  const [unseenCount, setUnseenCount] = useState(0);

  const handleCommandComplete = useCallback((cmd: CompletedCommand) => {
    setCommands((prev) => [...prev, cmd]);
    setUnseenCount((n) => n + 1);
  }, []);

  const { status, startShell } = useWasmShell(termRef, handleCommandComplete);

  const switchToGraph = useCallback(() => {
    setActiveTab('graph');
    setUnseenCount(0);
  }, []);

  const switchToTerminal = useCallback(() => {
    setActiveTab('terminal');
    // Re-fit xterm after it becomes visible again
    requestAnimationFrame(() => fitAddonRef.current?.fit());
  }, []);

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
    term.write('Tap \x1b[1mStart shell\x1b[0m to launch a real bash session\r\n');
    term.write('running entirely in your browser via WebAssembly.\r\n\r\n');
    term.write('\x1b[2mFirst start fetches bash (~10 MB, cached after that).\x1b[0m\r\n');

    setTermReady(true);

    return () => {
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      setTermReady(false);
    };
  }, []);

  const statusBadge =
    status === 'initializing' ? (
      <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--accent-note)' }}>
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
        <span className="hidden sm:inline">Loading WASM…</span>
      </span>
    ) : status === 'ready' ? (
      <span className="flex items-center gap-1.5 text-sm text-emerald-600">
        <span className="inline-block h-2 w-2 rounded-full bg-current" />
        <span className="hidden sm:inline">Shell ready</span>
      </span>
    ) : status === 'error' ? (
      <span className="text-sm text-red-500">Failed</span>
    ) : null;

  return (
    <div className="flex h-screen flex-col" style={{ background: 'var(--app-bg)', color: 'var(--text-strong)' }}>
      {/* ── Header ── */}
      <header
        className="flex shrink-0 items-center gap-2 border-b px-4 py-3"
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
          {statusBadge}
          {status === 'idle' && termReady && (
            <button
              onClick={startShell}
              className="rounded px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 active:opacity-75"
              style={{ background: 'var(--accent-command)' }}
            >
              Start shell
            </button>
          )}
        </div>
      </header>

      {/* ── Body ── */}
      <div className="min-h-0 flex-1 md:flex">

        {/* Terminal pane
            – always rendered so xterm.js stays alive;
              hidden via CSS on mobile when graph tab is active */}
        <div
          className={[
            'flex flex-col md:min-h-0 md:w-[55%]',
            activeTab === 'terminal' ? 'flex min-h-0 flex-1' : 'hidden md:flex',
          ].join(' ')}
          style={{ borderRight: '1px solid var(--border-subtle)' }}
        >
          {/* Pane label – desktop only */}
          <div
            className="hidden shrink-0 px-3 py-1.5 text-xs md:block"
            style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-faint)', background: 'var(--panel-muted)' }}
          >
            bash (WASM)
          </div>
          <div ref={containerRef} className="min-h-0 flex-1" style={{ background: '#1d1b19' }} />
        </div>

        {/* Graph pane */}
        <div
          className={[
            'flex flex-col md:min-h-0 md:w-[45%]',
            activeTab === 'graph' ? 'flex min-h-0 flex-1' : 'hidden md:flex',
          ].join(' ')}
          style={{ background: 'var(--panel-bg)' }}
        >
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

      {/* ── Mobile tab bar (hidden on md+) ── */}
      <nav
        className="flex shrink-0 border-t md:hidden"
        style={{ borderColor: 'var(--border-subtle)', background: 'var(--panel-bg)' }}
      >
        <button
          onClick={switchToTerminal}
          className={[
            'flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors',
            activeTab === 'terminal'
              ? 'border-t-2 border-[var(--accent-command)] text-[var(--accent-command)]'
              : 'text-[var(--text-faint)]',
          ].join(' ')}
        >
          {/* Terminal icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          Terminal
        </button>

        <button
          onClick={switchToGraph}
          className={[
            'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors',
            activeTab === 'graph'
              ? 'border-t-2 border-[var(--accent-command)] text-[var(--accent-command)]'
              : 'text-[var(--text-faint)]',
          ].join(' ')}
        >
          {/* Graph icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="2" />
            <circle cx="5" cy="19" r="2" />
            <circle cx="19" cy="19" r="2" />
            <line x1="12" y1="7" x2="5" y2="17" />
            <line x1="12" y1="7" x2="19" y2="17" />
          </svg>
          Graph
          {/* Badge for unseen commands */}
          {activeTab !== 'graph' && unseenCount > 0 && (
            <span
              className="absolute right-6 top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
              style={{ background: 'var(--accent-command)' }}
            >
              {unseenCount}
            </span>
          )}
        </button>
      </nav>
    </div>
  );
}
