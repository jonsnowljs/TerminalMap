import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EdgeType, NodeType, TerminalStatus, type GraphNode, type TerminalLink, type TerminalSnapshot, type WorkspaceGraphPayload, type WorkspaceTerminalNode } from '@mindmap/shared'
import type { Terminal } from '@xterm/xterm'
import { useGraphStore } from './store/graphStore.js'
import { useTerminalManager } from './hooks/useTerminalManager.js'
import AppShell from './components/layout/AppShell.js'
import GraphView from './components/graph/GraphView.js'
import TimelineView from './components/timeline/TimelineView.js'
import ViewToggle from './components/shared/ViewToggle.js'

const WORKSPACE_ID = 'wasm-workspace'
const WORKSPACE_NAME = 'Browser Shell'
const ROOT_TERMINAL_NODE_ID = 'wasm-terminal-root'
const ROOT_SESSION_ID = 'wasm-session-root'
const DEFAULT_CWD = '/root'
const DEFAULT_TERMINAL_SIZE = { width: 960, height: 540 }

type WasmSessionStatus = 'idle' | 'initializing' | 'ready' | 'error'

interface CompletedCommand {
  command: string
  output: string
  exitCode: number | null
  timestamp: number
}

interface WasmSessionEntry {
  branchId: string
  cwd: string
  error: string | null
  inputBuffer: string
  lastCommand: string | null
  mountedTerm: Terminal | null
  nodeId: string
  oscBuffer: string
  outputBuffer: string
  previewLines: string[]
  sessionId: string
  startPromise: Promise<void> | null
  status: WasmSessionStatus
  writer: WritableStreamDefaultWriter<Uint8Array> | null
  activeCommand: {
    command: string
    rawOutput: string
    timestamp: number
  } | null
  inOsc: boolean
}

function buildPreviewLines(output: string) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(-6)
}

function buildIntroTranscript(title: string) {
  return [
    `\x1b[1;36m${title}\x1b[0m \x1b[2m– Browser Shell\x1b[0m\r\n`,
    'Use the toolbar button to start a bash session powered by WebAssembly.\r\n',
    '\x1b[2mThe first launch fetches bash from the Wasmer registry.\x1b[0m\r\n\r\n',
  ].join('')
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

function createTerminalNode({
  id,
  sessionId,
  title,
  position,
  status = TerminalStatus.IDLE,
}: {
  id: string
  position: { x: number; y: number }
  sessionId: string
  status?: typeof TerminalStatus[keyof typeof TerminalStatus]
  title: string
}): WorkspaceTerminalNode {
  return {
    terminalNodeId: id,
    workspaceId: WORKSPACE_ID,
    sessionId,
    title,
    mode: 'active',
    status,
    sourceNodeId: null,
    snapshot: makeSnapshot(
      status,
      DEFAULT_CWD,
      null,
      [
        'Start the browser shell to begin.',
        'Commands run inside WebAssembly in this tab.',
      ],
    ),
    scrollback: null,
    restoreState: null,
    position,
    size: DEFAULT_TERMINAL_SIZE,
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
      rootTerminalNodeId: ROOT_TERMINAL_NODE_ID,
      cwd: DEFAULT_CWD,
      createdAt: now,
      updatedAt: now,
    },
    graphNodes: [],
    graphEdges: [],
    workspaceLinks: [],
    terminalLinks: [],
    activeTerminalNodeId: ROOT_TERMINAL_NODE_ID,
    terminalNodes: [
      createTerminalNode({
        id: ROOT_TERMINAL_NODE_ID,
        sessionId: ROOT_SESSION_ID,
        title: 'Browser Shell',
        position: { x: 96, y: 72 },
      }),
    ],
  }
}

function WasmSidebar({
  activeCwd,
  activeError,
  activeStatus,
  activeTitle,
  commandCount,
  terminalCount,
}: {
  activeCwd: string
  activeError: string | null
  activeStatus: WasmSessionStatus
  activeTitle: string
  commandCount: number
  terminalCount: number
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
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-faint)]">Active terminal</div>
              <div className="mt-1 text-sm font-semibold text-[var(--text-strong)]">{activeTitle}</div>
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: activeStatus === 'error' ? 'var(--accent-error-soft)' : 'var(--accent-command-soft)',
                color: activeStatus === 'error' ? 'var(--accent-error)' : 'var(--accent-command)',
              }}
            >
              {activeStatus === 'initializing' ? 'loading' : activeStatus}
            </span>
          </div>
          <div className="mt-3 space-y-2 text-xs text-[var(--text-muted)]">
            <div className="flex items-center justify-between gap-3">
              <span>Transport</span>
              <span className="font-mono text-[var(--text-strong)]">wasm</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Current cwd</span>
              <span className="truncate font-mono text-[var(--text-strong)]">{activeCwd}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Live terminals</span>
              <span className="font-mono text-[var(--text-strong)]">{terminalCount}</span>
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
            <p>The main client is still running, but its terminals are powered by WebAssembly instead of the websocket backend.</p>
            <p>Drag from a terminal handle to create another browser-backed terminal node.</p>
            {activeError ? (
              <p className="rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: 'var(--accent-error-soft)', color: 'var(--accent-error)' }}>
                {activeError}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </aside>
  )
}

export default function WasmApp() {
  const {
    bindRuntime,
    fit: fitTerminal,
    focus: focusTerminal,
    syncRuntimes,
  } = useTerminalManager()
  const hydrateWorkspace = useGraphStore((state) => state.hydrateWorkspace)
  const resetWorkspaceState = useGraphStore((state) => state.resetWorkspaceState)
  const addNode = useGraphStore((state) => state.addNode)
  const addEdge = useGraphStore((state) => state.addEdge)
  const addTerminalLink = useGraphStore((state) => state.addTerminalLink)
  const addTerminalNode = useGraphStore((state) => state.addTerminalNode)
  const updateTerminalSnapshot = useGraphStore((state) => state.updateTerminalSnapshot)
  const setActiveTerminalNode = useGraphStore((state) => state.setActiveTerminalNode)
  const selectNode = useGraphStore((state) => state.selectNode)
  const viewMode = useGraphStore((state) => state.viewMode)
  const nodes = useGraphStore((state) => state.nodes)
  const terminalNodes = useGraphStore((state) => state.terminalNodes)
  const activeTerminalNodeId = useGraphStore((state) => state.activeTerminalNodeId)

  const sessionsRef = useRef<Map<string, WasmSessionEntry>>(new Map())
  const packagePromiseRef = useRef<Promise<any> | null>(null)
  const graphTailByTerminalRef = useRef<Map<string, string>>(new Map())
  const sequenceRef = useRef(1)
  const [uiVersion, setUiVersion] = useState(0)
  const [centerTerminalNodeId, setCenterTerminalNodeId] = useState<string | null>(null)
  const [focusMode, setFocusMode] = useState<'center' | 'session'>('center')

  const bumpUi = useCallback(() => {
    setUiVersion((current) => current + 1)
  }, [])

  const createSessionEntry = useCallback((terminalNode: WorkspaceTerminalNode) => {
    const sessionEntry: WasmSessionEntry = {
      branchId: `wasm-branch-${terminalNode.terminalNodeId}`,
      cwd: terminalNode.snapshot?.cwd ?? DEFAULT_CWD,
      error: null,
      inputBuffer: '',
      lastCommand: terminalNode.snapshot?.lastCommand ?? null,
      mountedTerm: null,
      nodeId: terminalNode.terminalNodeId,
      oscBuffer: '',
      outputBuffer: buildIntroTranscript(terminalNode.title),
      previewLines: terminalNode.snapshot?.previewLines ?? [
        'Start the browser shell to begin.',
        'Commands run inside WebAssembly in this tab.',
      ],
      sessionId: terminalNode.sessionId ?? `wasm-session-${terminalNode.terminalNodeId}`,
      startPromise: null,
      status: 'idle',
      writer: null,
      activeCommand: null,
      inOsc: false,
    }
    sessionsRef.current.set(terminalNode.terminalNodeId, sessionEntry)
    return sessionEntry
  }, [])

  const getSessionEntry = useCallback((terminalNode: WorkspaceTerminalNode) => {
    return sessionsRef.current.get(terminalNode.terminalNodeId) ?? createSessionEntry(terminalNode)
  }, [createSessionEntry])

  const syncSnapshot = useCallback(
    (sessionEntry: WasmSessionEntry, status: typeof TerminalStatus[keyof typeof TerminalStatus]) => {
      updateTerminalSnapshot(
        sessionEntry.nodeId,
        makeSnapshot(status, sessionEntry.cwd, sessionEntry.lastCommand, sessionEntry.previewLines),
      )
    },
    [updateTerminalSnapshot],
  )

  const writeVisible = useCallback((sessionEntry: WasmSessionEntry, text: string) => {
    sessionEntry.outputBuffer += text
    sessionEntry.mountedTerm?.write(text)
  }, [])

  const appendGraphNode = useCallback(
    (terminalNodeId: string, node: GraphNode) => {
      addNode(node)
      const previousNodeId = graphTailByTerminalRef.current.get(terminalNodeId)
      if (previousNodeId) {
        addEdge({
          id: crypto.randomUUID(),
          sourceId: previousNodeId,
          targetId: node.id,
          type: EdgeType.SEQUENTIAL,
          metadata: { terminalNodeId, transport: 'wasm' },
        })
      }
      graphTailByTerminalRef.current.set(terminalNodeId, node.id)
    },
    [addEdge, addNode],
  )

  const completeCommand = useCallback(
    (sessionEntry: WasmSessionEntry, command: CompletedCommand) => {
      const timestamp = new Date(command.timestamp).toISOString()
      sessionEntry.lastCommand = command.command
      sessionEntry.previewLines = buildPreviewLines(command.output)

      appendGraphNode(sessionEntry.nodeId, {
        id: crypto.randomUUID(),
        sessionId: sessionEntry.sessionId,
        branchId: sessionEntry.branchId,
        type: NodeType.COMMAND,
        content: command.command,
        exitCode: command.exitCode,
        cwd: sessionEntry.cwd,
        durationMs: null,
        metadata: { terminalNodeId: sessionEntry.nodeId, transport: 'wasm' },
        seq: sequenceRef.current++,
        createdAt: timestamp,
      })

      const output = command.output.trim()
      if (output.length > 0) {
        appendGraphNode(sessionEntry.nodeId, {
          id: crypto.randomUUID(),
          sessionId: sessionEntry.sessionId,
          branchId: sessionEntry.branchId,
          type: command.exitCode === 0 ? NodeType.OUTPUT : NodeType.ERROR,
          content: output,
          exitCode: command.exitCode,
          cwd: sessionEntry.cwd,
          durationMs: null,
          metadata: { terminalNodeId: sessionEntry.nodeId, transport: 'wasm' },
          seq: sequenceRef.current++,
          createdAt: timestamp,
        })
      }

      syncSnapshot(sessionEntry, TerminalStatus.IDLE)
      bumpUi()
    },
    [appendGraphNode, bumpUi, syncSnapshot],
  )

  const processOutputChunk = useCallback(
    (sessionEntry: WasmSessionEntry, chunk: string) => {
      let visible = ''
      let index = 0

      while (index < chunk.length) {
        const ch = chunk[index]!

        if (sessionEntry.inOsc) {
          sessionEntry.oscBuffer += ch
          const done = ch === '\x07' || sessionEntry.oscBuffer.endsWith('\x1b\\')
          if (done) {
            sessionEntry.inOsc = false
            const body = sessionEntry.oscBuffer.replace(/\x07$/, '').replace(/\x1b\\$/, '')
            sessionEntry.oscBuffer = ''

            if (body.startsWith('133;D')) {
              const exitCodeStr = body.split(';')[2]
              const exitCode = exitCodeStr !== undefined ? parseInt(exitCodeStr, 10) : null
              if (sessionEntry.activeCommand) {
                completeCommand(sessionEntry, {
                  command: sessionEntry.activeCommand.command,
                  output: sessionEntry.activeCommand.rawOutput,
                  exitCode: Number.isNaN(exitCode) ? null : exitCode,
                  timestamp: sessionEntry.activeCommand.timestamp,
                })
                sessionEntry.activeCommand = null
              }
            } else if (body.startsWith('633;P;')) {
              sessionEntry.cwd = body.slice('633;P;'.length)
              syncSnapshot(sessionEntry, sessionEntry.status === 'error' ? TerminalStatus.EXITED : TerminalStatus.IDLE)
              bumpUi()
            }
          }
          index += 1
          continue
        }

        if (ch === '\x1b' && chunk[index + 1] === ']') {
          sessionEntry.inOsc = true
          sessionEntry.oscBuffer = ''
          index += 2
          continue
        }

        visible += ch
        index += 1
      }

      if (visible.length > 0) {
        writeVisible(sessionEntry, visible)
        if (sessionEntry.activeCommand) {
          sessionEntry.activeCommand.rawOutput += visible
        }
      }
    },
    [bumpUi, completeCommand, syncSnapshot, writeVisible],
  )

  const getBashPackage = useCallback(async () => {
    if (!packagePromiseRef.current) {
      packagePromiseRef.current = (async () => {
        const { init, Wasmer } = await import('@wasmer/sdk')
        await init()
        const pkg = await Wasmer.fromRegistry('sharrattj/bash')
        if (!pkg.entrypoint) {
          throw new Error('Package has no entrypoint command')
        }
        return pkg
      })()
    }

    return packagePromiseRef.current
  }, [])

  const startSession = useCallback(
    async (terminalNodeId: string) => {
      const terminalNode = terminalNodes.find((node) => node.terminalNodeId === terminalNodeId)
      if (!terminalNode) {
        return
      }

      const sessionEntry = getSessionEntry(terminalNode)
      if (sessionEntry.status === 'ready' || sessionEntry.status === 'initializing') {
        return
      }
      if (!sessionEntry.mountedTerm) {
        return
      }
      if (sessionEntry.startPromise) {
        await sessionEntry.startPromise
        return
      }

      sessionEntry.startPromise = (async () => {
        try {
          sessionEntry.status = 'initializing'
          sessionEntry.error = null
          syncSnapshot(sessionEntry, TerminalStatus.RUNNING)
          bumpUi()

          writeVisible(sessionEntry, '\x1b[33mInitialising WASM runtime…\x1b[0m\r\n')
          const pkg = await getBashPackage()
          writeVisible(sessionEntry, '\x1b[33mFetching bash from Wasmer registry…\x1b[0m\r\n')

          const instance = await pkg.entrypoint.run({
            args: ['-i'],
            env: {
              TERM: 'xterm-color',
              HOME: '/root',
              PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
              HISTFILE: '/dev/null',
            },
          })

          const writer = instance.stdin!.getWriter()
          sessionEntry.writer = writer

          const encoder = new TextEncoder()
          const setup = [
            `PROMPT_COMMAND='printf "\\033]133;D;$?\\007\\033]633;P;%s\\007" "$PWD"'`,
            `PS1='\\[\\033]133;A\\007\\]\\[\\033[32m\\]$ \\[\\033[0m\\]\\[\\033]133;B\\007\\]'`,
            'clear',
            '',
          ].join('\n')
          await writer.write(encoder.encode(setup))

          const stdoutReader = instance.stdout.pipeThrough(new TextDecoderStream()).getReader()
          void (async () => {
            try {
              for (;;) {
                const { done, value } = await stdoutReader.read()
                if (done) break
                processOutputChunk(sessionEntry, value)
              }
            } catch {
              /* stream closes when shell exits */
            }
          })()

          const stderrReader = instance.stderr.pipeThrough(new TextDecoderStream()).getReader()
          void (async () => {
            try {
              for (;;) {
                const { done, value } = await stderrReader.read()
                if (done) break
                writeVisible(sessionEntry, value)
              }
            } catch {
              /* stream closes when shell exits */
            }
          })()

          sessionEntry.status = 'ready'
          syncSnapshot(sessionEntry, TerminalStatus.IDLE)
          bumpUi()
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          sessionEntry.status = 'error'
          sessionEntry.error = message
          writeVisible(sessionEntry, `\r\n\x1b[31mError: ${message}\x1b[0m\r\n`)
          syncSnapshot(sessionEntry, TerminalStatus.EXITED)
          bumpUi()
        } finally {
          sessionEntry.startPromise = null
        }
      })()

      await sessionEntry.startPromise
    },
    [bumpUi, getBashPackage, getSessionEntry, processOutputChunk, syncSnapshot, terminalNodes, writeVisible],
  )

  const handleTerminalData = useCallback(
    (terminalNodeId: string, data: string) => {
      const sessionEntry = sessionsRef.current.get(terminalNodeId)
      if (!sessionEntry?.writer) {
        return
      }

      const encoder = new TextEncoder()
      if (data === '\r') {
        const command = sessionEntry.inputBuffer.trim()
        writeVisible(sessionEntry, '\r\n')
        if (command) {
          sessionEntry.activeCommand = {
            command,
            rawOutput: '',
            timestamp: Date.now(),
          }
        }
        sessionEntry.inputBuffer = ''
        sessionEntry.writer.write(encoder.encode('\n')).catch(() => {})
        return
      }

      if (data === '\x7f') {
        if (sessionEntry.inputBuffer.length > 0) {
          sessionEntry.inputBuffer = sessionEntry.inputBuffer.slice(0, -1)
          writeVisible(sessionEntry, '\b \b')
        }
        return
      }

      if (data === '\x03') {
        writeVisible(sessionEntry, '^C\r\n')
        sessionEntry.inputBuffer = ''
        sessionEntry.activeCommand = null
        sessionEntry.writer.write(encoder.encode('\x03')).catch(() => {})
        return
      }

      if (data === '\x04') {
        sessionEntry.writer.write(encoder.encode('\x04')).catch(() => {})
        return
      }

      if (data.length === 1 && data.charCodeAt(0) >= 32) {
        sessionEntry.inputBuffer += data
        writeVisible(sessionEntry, data)
      }
    },
    [writeVisible],
  )

  const handleCreateTerminalLink = useCallback(
    (sourceTerminalNodeId: string, targetTerminalNodeId?: string, position?: { x: number; y: number }) => {
      if (targetTerminalNodeId) {
        const existingLink = useGraphStore.getState().terminalLinks.some(
          (link) => link.sourceTerminalNodeId === sourceTerminalNodeId && link.targetTerminalNodeId === targetTerminalNodeId,
        )
        if (!existingLink) {
          addTerminalLink({
            id: crypto.randomUUID(),
            workspaceId: WORKSPACE_ID,
            sourceTerminalNodeId,
            targetTerminalNodeId,
            createdAt: new Date().toISOString(),
          })
        }
        return
      }

      const terminalNodeId = `wasm-terminal-${crypto.randomUUID()}`
      const sessionId = `wasm-session-${crypto.randomUUID()}`
      const title = `Browser Shell ${terminalNodes.length + 1}`
      const nextPosition = position ?? { x: 240 + terminalNodes.length * 48, y: 120 + terminalNodes.length * 36 }
      const terminalNode = createTerminalNode({
        id: terminalNodeId,
        sessionId,
        title,
        position: nextPosition,
      })

      addTerminalNode(terminalNode)
      addTerminalLink({
        id: crypto.randomUUID(),
        workspaceId: WORKSPACE_ID,
        sourceTerminalNodeId,
        targetTerminalNodeId: terminalNodeId,
        createdAt: new Date().toISOString(),
      } satisfies TerminalLink)

      createSessionEntry(terminalNode)
      setActiveTerminalNode(terminalNodeId)
      selectNode(terminalNodeId)
      setCenterTerminalNodeId(terminalNodeId)
      setFocusMode('session')
      bumpUi()
    },
    [addTerminalLink, addTerminalNode, bumpUi, createSessionEntry, selectNode, setActiveTerminalNode, terminalNodes.length],
  )

  useEffect(() => {
    const initialPayload = createInitialWorkspacePayload()
    hydrateWorkspace(initialPayload)
    initialPayload.terminalNodes.forEach((terminalNode) => {
      createSessionEntry(terminalNode)
    })

    return () => {
      syncRuntimes(new Set())
      for (const sessionEntry of sessionsRef.current.values()) {
        sessionEntry.writer?.close().catch(() => {})
        sessionEntry.mountedTerm = null
      }
      sessionsRef.current.clear()
      graphTailByTerminalRef.current.clear()
      resetWorkspaceState()
    }
  }, [createSessionEntry, hydrateWorkspace, resetWorkspaceState, syncRuntimes])

  useEffect(() => {
    if (viewMode !== 'graph') {
      syncRuntimes(new Set())
      for (const sessionEntry of sessionsRef.current.values()) {
        sessionEntry.mountedTerm = null
      }
      return
    }

    const liveTerminalNodeIds = new Set<string>()
    let needsRetry = false
    for (const terminalNode of terminalNodes) {
      if (!terminalNode.sessionId || terminalNode.status === 'disconnected') {
        continue
      }

      liveTerminalNodeIds.add(terminalNode.terminalNodeId)
      const container = document.querySelector<HTMLDivElement>(`[data-terminal-container="${terminalNode.terminalNodeId}"]`)
      if (!container) {
        needsRetry = true
        continue
      }

      const sessionEntry = getSessionEntry(terminalNode)
      const runtime = bindRuntime({
        nodeId: terminalNode.terminalNodeId,
        sessionId: terminalNode.sessionId,
        container,
        onData: (_sessionId, data) => {
          handleTerminalData(terminalNode.terminalNodeId, data)
        },
        onResize: () => {},
      })

      if (sessionEntry.mountedTerm !== runtime.term) {
        sessionEntry.mountedTerm = runtime.term
        runtime.term.reset()
        runtime.term.write(sessionEntry.outputBuffer)
        fitTerminal(terminalNode.terminalNodeId)
      }

      if (activeTerminalNodeId === terminalNode.terminalNodeId) {
        requestAnimationFrame(() => {
          focusTerminal(terminalNode.terminalNodeId)
        })
      }
    }

    syncRuntimes(liveTerminalNodeIds)
    if (needsRetry) {
      requestAnimationFrame(() => {
        bumpUi()
      })
    }
  }, [activeTerminalNodeId, bindRuntime, bumpUi, fitTerminal, focusTerminal, getSessionEntry, handleTerminalData, syncRuntimes, terminalNodes, uiVersion, viewMode])

  const commandCount = useMemo(
    () => nodes.filter((node) => node.data.graphNode.type === NodeType.COMMAND).length,
    [nodes],
  )

  const activeTerminal = terminalNodes.find((node) => node.terminalNodeId === activeTerminalNodeId) ?? terminalNodes[0] ?? null
  const activeSession = activeTerminal ? sessionsRef.current.get(activeTerminal.terminalNodeId) ?? null : null
  void uiVersion

  const activeStatus = activeSession?.status ?? 'idle'
  const activeError = activeSession?.error ?? null
  const activeTitle = activeTerminal?.title ?? 'Browser Shell'
  const activeCwd = activeTerminal?.snapshot?.cwd ?? activeSession?.cwd ?? DEFAULT_CWD

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
        {activeStatus === 'idle' ? (
          <button
            type="button"
            onClick={() => {
              if (activeTerminal) {
                void startSession(activeTerminal.terminalNodeId)
              }
            }}
            className="rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--accent-command)' }}
          >
            Start Browser Shell
          </button>
        ) : null}
        {activeStatus === 'initializing' ? (
          <span className="text-sm font-medium" style={{ color: 'var(--accent-note)' }}>
            Loading WASM runtime…
          </span>
        ) : null}
        {activeStatus === 'ready' ? (
          <span className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700" style={{ backgroundColor: '#e7f7eb' }}>
            Shell ready
          </span>
        ) : null}
        {activeStatus === 'error' ? (
          <button
            type="button"
            onClick={() => {
              if (activeTerminal) {
                void startSession(activeTerminal.terminalNodeId)
              }
            }}
            className="rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--accent-error)' }}
          >
            Retry Browser Shell
          </button>
        ) : null}
      </div>
    </div>
  )

  return (
    <div className="flex h-full">
      <WasmSidebar
        activeCwd={activeCwd}
        activeError={activeError}
        activeStatus={activeStatus}
        activeTitle={activeTitle}
        commandCount={commandCount}
        terminalCount={terminalNodes.length}
      />
      <div className="flex-1">
        <AppShell
          toolbar={toolbar}
          top={
            viewMode === 'graph' ? (
              <GraphView
                onCreateTerminalLink={handleCreateTerminalLink}
                centerOnTerminalNodeId={centerTerminalNodeId}
                focusMode={focusMode}
                onTerminalNodeCentered={(terminalNodeId) => {
                  if (centerTerminalNodeId === terminalNodeId) {
                    setCenterTerminalNodeId(null)
                    setFocusMode('center')
                  }
                }}
              />
            ) : (
              <TimelineView />
            )
          }
        />
      </div>
    </div>
  )
}
