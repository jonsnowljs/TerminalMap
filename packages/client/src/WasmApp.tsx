import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { EdgeType, NodeType, TerminalStatus, type GraphNode, type TerminalSnapshot, type WorkspaceGraphPayload } from '@mindmap/shared'
import { useWasmShell, type CompletedCommand } from './demo/useWasmShell.js'
import { useGraphStore } from './store/graphStore.js'
import AppShell from './components/layout/AppShell.js'
import GraphView from './components/graph/GraphView.js'
import TimelineView from './components/timeline/TimelineView.js'
import ViewToggle from './components/shared/ViewToggle.js'

const WORKSPACE_ID = 'wasm-workspace'
const WORKSPACE_NAME = 'Browser Shell'
const SESSION_ID = 'wasm-session'
const SESSION_NAME = 'browser-shell'
const TERMINAL_NODE_ID = 'wasm-terminal'
const BRANCH_ID = 'wasm-main'
const DEFAULT_CWD = '/root'

function buildPreviewLines(output: string) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(-6)
}

function makeSnapshot(status: typeof TerminalStatus[keyof typeof TerminalStatus], cwd: string, lastCommand: string | null, previewLines: string[]): TerminalSnapshot {
  return {
    cwd,
    lastCommand,
    previewLines,
    cursorRow: null,
    cursorCol: null,
    updatedAt: new Date().toISOString(),
    status,
  }
}

function createInitialWorkspacePayload(): WorkspaceGraphPayload {
  const now = new Date().toISOString()

  return {
    workspace: {
      id: WORKSPACE_ID,
      name: WORKSPACE_NAME,
      parentWorkspaceId: null,
      createdFromNodeId: null,
      rootTerminalNodeId: TERMINAL_NODE_ID,
      cwd: DEFAULT_CWD,
      createdAt: now,
      updatedAt: now,
    },
    graphNodes: [],
    graphEdges: [],
    workspaceLinks: [],
    terminalLinks: [],
    activeTerminalNodeId: TERMINAL_NODE_ID,
    terminalNodes: [
      {
        terminalNodeId: TERMINAL_NODE_ID,
        workspaceId: WORKSPACE_ID,
        sessionId: SESSION_ID,
        title: SESSION_NAME,
        mode: 'active',
        status: TerminalStatus.IDLE,
        sourceNodeId: null,
        snapshot: makeSnapshot(
          TerminalStatus.IDLE,
          DEFAULT_CWD,
          null,
          [
            'Start the browser shell to begin.',
            'Commands run inside WebAssembly in this tab.',
          ],
        ),
        scrollback: null,
        restoreState: null,
        position: { x: 96, y: 72 },
        size: { width: 960, height: 540 },
      },
    ],
  }
}

function WasmSidebar({
  commandCount,
  currentCwd,
  error,
  status,
}: {
  commandCount: number
  currentCwd: string
  error: string | null
  status: 'idle' | 'initializing' | 'ready' | 'error'
}) {
  return (
    <aside
      className="flex w-72 flex-col overflow-hidden border-r"
      style={{ backgroundColor: 'var(--panel-muted)', borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--border-subtle)' }}>
        <img src="/logo.svg" alt="TerminalMap logo" className="h-9 w-9 rounded-lg bg-white/80 p-1 shadow-sm" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--text-strong)]">TerminalMap</div>
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-faint)]">Browser Terminal</div>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4">
        <section
          className="rounded-2xl border bg-white/80 px-4 py-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-faint)]">Workspace</div>
              <div className="mt-1 text-sm font-semibold text-[var(--text-strong)]">{WORKSPACE_NAME}</div>
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: status === 'error' ? 'var(--accent-error-soft)' : 'var(--accent-command-soft)',
                color: status === 'error' ? 'var(--accent-error)' : 'var(--accent-command)',
              }}
            >
              {status === 'initializing' ? 'loading' : status}
            </span>
          </div>
          <div className="mt-3 space-y-2 text-xs text-[var(--text-muted)]">
            <div className="flex items-center justify-between gap-3">
              <span>Transport</span>
              <span className="font-mono text-[var(--text-strong)]">wasm</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Current cwd</span>
              <span className="truncate font-mono text-[var(--text-strong)]">{currentCwd}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Commands captured</span>
              <span className="font-mono text-[var(--text-strong)]">{commandCount}</span>
            </div>
          </div>
        </section>

        <section
          className="rounded-2xl border bg-white/80 px-4 py-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-faint)]">Notes</div>
          <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-muted)]">
            <p>The terminal runs entirely in your browser through WebAssembly.</p>
            <p>The first launch downloads bash from the Wasmer registry.</p>
            {error ? (
              <p className="rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: 'var(--accent-error-soft)', color: 'var(--accent-error)' }}>
                {error}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </aside>
  )
}

export default function WasmApp() {
  const hydrateWorkspace = useGraphStore((state) => state.hydrateWorkspace)
  const resetWorkspaceState = useGraphStore((state) => state.resetWorkspaceState)
  const addNode = useGraphStore((state) => state.addNode)
  const addEdge = useGraphStore((state) => state.addEdge)
  const updateTerminalSnapshot = useGraphStore((state) => state.updateTerminalSnapshot)
  const viewMode = useGraphStore((state) => state.viewMode)
  const nodes = useGraphStore((state) => state.nodes)

  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const mountedContainerRef = useRef<HTMLDivElement | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const introWrittenRef = useRef(false)
  const previousGraphNodeIdRef = useRef<string | null>(null)
  const sequenceRef = useRef(1)
  const currentCwdRef = useRef(DEFAULT_CWD)
  const lastCommandRef = useRef<string | null>(null)
  const previewLinesRef = useRef<string[]>([
    'Start the browser shell to begin.',
    'Commands run inside WebAssembly in this tab.',
  ])

  const [currentCwd, setCurrentCwd] = useState(DEFAULT_CWD)

  const commandCount = useMemo(
    () => nodes.filter((node) => node.data.graphNode.type === NodeType.COMMAND).length,
    [nodes],
  )

  const updateSnapshot = useCallback(
    (status: typeof TerminalStatus[keyof typeof TerminalStatus]) => {
      updateTerminalSnapshot(
        TERMINAL_NODE_ID,
        makeSnapshot(status, currentCwdRef.current, lastCommandRef.current, previewLinesRef.current),
      )
    },
    [updateTerminalSnapshot],
  )

  const appendGraphNode = useCallback(
    (node: GraphNode) => {
      addNode(node)
      if (previousGraphNodeIdRef.current) {
        addEdge({
          id: crypto.randomUUID(),
          sourceId: previousGraphNodeIdRef.current,
          targetId: node.id,
          type: EdgeType.SEQUENTIAL,
          metadata: { transport: 'wasm' },
        })
      }
      previousGraphNodeIdRef.current = node.id
    },
    [addEdge, addNode],
  )

  const handleCommandComplete = useCallback(
    (command: CompletedCommand) => {
      const timestamp = new Date(command.timestamp).toISOString()
      lastCommandRef.current = command.command
      previewLinesRef.current = buildPreviewLines(command.output)

      appendGraphNode({
        id: crypto.randomUUID(),
        sessionId: SESSION_ID,
        branchId: BRANCH_ID,
        type: NodeType.COMMAND,
        content: command.command,
        exitCode: command.exitCode,
        cwd: currentCwdRef.current,
        durationMs: null,
        metadata: { transport: 'wasm' },
        seq: sequenceRef.current++,
        createdAt: timestamp,
      })

      const output = command.output.trim()
      if (output.length > 0) {
        appendGraphNode({
          id: crypto.randomUUID(),
          sessionId: SESSION_ID,
          branchId: BRANCH_ID,
          type: command.exitCode === 0 ? NodeType.OUTPUT : NodeType.ERROR,
          content: output,
          exitCode: command.exitCode,
          cwd: currentCwdRef.current,
          durationMs: null,
          metadata: { transport: 'wasm' },
          seq: sequenceRef.current++,
          createdAt: timestamp,
        })
      }

      updateSnapshot(TerminalStatus.IDLE)
    },
    [appendGraphNode, updateSnapshot],
  )

  const { error, startShell, status } = useWasmShell(termRef, handleCommandComplete, {
    onWorkingDirectoryChange: (cwd) => {
      currentCwdRef.current = cwd
      setCurrentCwd(cwd)
      updateSnapshot(TerminalStatus.IDLE)
    },
  })

  useEffect(() => {
    hydrateWorkspace(createInitialWorkspacePayload())

    return () => {
      resizeObserverRef.current?.disconnect()
      termRef.current?.dispose()
      mountedContainerRef.current = null
      termRef.current = null
      fitAddonRef.current = null
      resetWorkspaceState()
    }
  }, [hydrateWorkspace, resetWorkspaceState])

  useEffect(() => {
    updateSnapshot(
      status === 'initializing'
        ? TerminalStatus.RUNNING
        : status === 'error'
          ? TerminalStatus.EXITED
          : TerminalStatus.IDLE,
    )
  }, [status, updateSnapshot])

  useEffect(() => {
    if (viewMode !== 'graph') {
      return
    }

    const container = document.querySelector<HTMLDivElement>(`[data-terminal-container="${TERMINAL_NODE_ID}"]`)
    if (!container) {
      return
    }

    if (!termRef.current) {
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
      })
      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      termRef.current = term
      fitAddonRef.current = fitAddon
    }

    if (mountedContainerRef.current !== container) {
      resizeObserverRef.current?.disconnect()
      container.replaceChildren()
      termRef.current.open(container)
      mountedContainerRef.current = container
      requestAnimationFrame(() => fitAddonRef.current?.fit())

      const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => fitAddonRef.current?.fit())
      })
      resizeObserver.observe(container)
      resizeObserverRef.current = resizeObserver
    }

    if (!introWrittenRef.current) {
      termRef.current.write('\x1b[1;36mTerminalMap\x1b[0m \x1b[2m– Browser Shell\x1b[0m\r\n\r\n')
      termRef.current.write('Use the toolbar button to start a bash session powered by WebAssembly.\r\n')
      termRef.current.write('\x1b[2mThe first launch fetches bash from the Wasmer registry.\x1b[0m\r\n\r\n')
      introWrittenRef.current = true
    }
  }, [viewMode])

  const toolbar = (
    <div
      className="flex items-center justify-between border-b px-5 py-3 backdrop-blur-sm"
      style={{
        backgroundColor: 'var(--panel-elevated)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="flex items-center gap-6 self-stretch">
        <ViewToggle />
      </div>
      <div className="flex items-center gap-3">
        {status === 'idle' ? (
          <button
            type="button"
            onClick={() => {
              void startShell()
            }}
            className="rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--accent-command)' }}
          >
            Start Browser Shell
          </button>
        ) : null}
        {status === 'initializing' ? (
          <span className="text-sm font-medium" style={{ color: 'var(--accent-note)' }}>
            Loading WASM runtime…
          </span>
        ) : null}
        {status === 'ready' ? (
          <span className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700" style={{ backgroundColor: '#e7f7eb' }}>
            Shell ready
          </span>
        ) : null}
        {status === 'error' ? (
          <span className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide" style={{ backgroundColor: 'var(--accent-error-soft)', color: 'var(--accent-error)' }}>
            Shell failed
          </span>
        ) : null}
      </div>
    </div>
  )

  return (
    <div className="flex h-full">
      <WasmSidebar commandCount={commandCount} currentCwd={currentCwd} error={error} status={status} />
      <div className="flex-1">
        <AppShell
          toolbar={toolbar}
          top={
            viewMode === 'graph' ? (
              <GraphView />
            ) : (
              <TimelineView />
            )
          }
        />
      </div>
    </div>
  )
}
