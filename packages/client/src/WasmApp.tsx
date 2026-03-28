import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EdgeType, NodeType, TerminalStatus, type GraphNode, type TerminalLink, type TerminalSnapshot, type Workspace, type WorkspaceGraphPayload, type WorkspaceTerminalNode } from '@mindmap/shared'
import type { Terminal } from '@xterm/xterm'
import { useGraphStore } from './store/graphStore.js'
import { useTerminalManager } from './hooks/useTerminalManager.js'
import AppShell from './components/layout/AppShell.js'
import GraphView from './components/graph/GraphView.js'
import TimelineView from './components/timeline/TimelineView.js'
import ViewToggle from './components/shared/ViewToggle.js'
import Sidebar from './components/layout/Sidebar.js'

const WASM_BROWSER_STORAGE_KEY = 'mindmap:wasm-browser-state:v1'
const WORKSPACE_NAME = 'Browser Shell'
const DEFAULT_CWD = '/root'
const DEFAULT_TERMINAL_SIZE = { width: 960, height: 540 }
const WASM_BOOTSTRAP_SCRIPT = [
  `PROMPT_COMMAND='printf "\\033]133;D;$?\\007\\033]633;P;%s\\007" "$PWD"'`,
  `PS1='\\[\\033]133;A\\007\\]\\[\\033[32m\\]$ \\[\\033[0m\\]\\[\\033]133;B\\007\\]'`,
  'clear',
  '',
].join('\n')

type WasmSessionStatus = 'idle' | 'initializing' | 'ready' | 'error'

interface SidebarSessionInfo {
  id: string
  name: string | null
  cwd: string
  status: string
  workspaceId: string
  workspaceName?: string | null
  terminalNodeId?: string | null
}

interface WasmBrowserWorkspaceState {
  graph: WorkspaceGraphPayload
}

interface WasmBrowserState {
  activeSessionId: string | null
  activeWorkspaceId: string
  workspaces: Record<string, WasmBrowserWorkspaceState>
}

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
  suppressBootstrapEcho: boolean
  suppressBuffer: string
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
    'Preparing a bash session powered by WebAssembly.\r\n',
    '\x1b[2mThe first launch fetches bash from the Wasmer registry.\x1b[0m\r\n\r\n',
  ].join('')
}

function filterBootstrapEcho(sessionEntry: WasmSessionEntry, chunk: string) {
  if (!sessionEntry.suppressBootstrapEcho) {
    return chunk
  }

  sessionEntry.suppressBuffer += chunk
  const stripped = sessionEntry.suppressBuffer.replace(WASM_BOOTSTRAP_SCRIPT, '')
  if (stripped !== sessionEntry.suppressBuffer) {
    sessionEntry.suppressBootstrapEcho = false
    sessionEntry.suppressBuffer = ''
    return stripped
  }

  if (sessionEntry.suppressBuffer.length > WASM_BOOTSTRAP_SCRIPT.length * 2) {
    sessionEntry.suppressBootstrapEcho = false
    const fallback = sessionEntry.suppressBuffer
    sessionEntry.suppressBuffer = ''
    return fallback
  }

  return ''
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
  workspaceId,
  sessionId,
  title,
  position,
  status = TerminalStatus.IDLE,
}: {
  id: string
  position: { x: number; y: number }
  workspaceId: string
  sessionId: string
  status?: typeof TerminalStatus[keyof typeof TerminalStatus]
  title: string
}): WorkspaceTerminalNode {
  return {
    terminalNodeId: id,
    workspaceId,
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
        'Browser shell will start automatically.',
        'Commands run inside WebAssembly in this tab.',
      ],
    ),
    scrollback: null,
    restoreState: null,
    position,
    size: DEFAULT_TERMINAL_SIZE,
  }
}

function createWorkspacePayload({
  sessionId,
  terminalNodeId,
  title,
  workspaceId,
  workspaceName,
}: {
  sessionId: string
  terminalNodeId: string
  title: string
  workspaceId: string
  workspaceName: string
}): WorkspaceGraphPayload {
  const now = new Date().toISOString()

  return {
    workspace: {
      id: workspaceId,
      name: workspaceName,
      parentWorkspaceId: null,
      createdFromNodeId: null,
      rootTerminalNodeId: terminalNodeId,
      cwd: DEFAULT_CWD,
      createdAt: now,
      updatedAt: now,
    },
    graphNodes: [],
    graphEdges: [],
    workspaceLinks: [],
    terminalLinks: [],
    activeTerminalNodeId: terminalNodeId,
    terminalNodes: [
      createTerminalNode({
        id: terminalNodeId,
        workspaceId,
        sessionId,
        title,
        position: { x: 96, y: 72 },
      }),
    ],
  }
}

function cloneBrowserState(state: WasmBrowserState): WasmBrowserState {
  return JSON.parse(JSON.stringify(state)) as WasmBrowserState
}

function persistBrowserState(state: WasmBrowserState) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(WASM_BROWSER_STORAGE_KEY, JSON.stringify(state))
}

function createInitialBrowserState(): WasmBrowserState {
  const workspaceId = `wasm-workspace-${crypto.randomUUID()}`
  const terminalNodeId = `wasm-terminal-${crypto.randomUUID()}`
  const sessionId = `wasm-session-${crypto.randomUUID()}`
  return {
    activeSessionId: sessionId,
    activeWorkspaceId: workspaceId,
    workspaces: {
      [workspaceId]: {
        graph: createWorkspacePayload({
          sessionId,
          terminalNodeId,
          title: 'Browser Shell',
          workspaceId,
          workspaceName: WORKSPACE_NAME,
        }),
      },
    },
  }
}

function loadBrowserState(): WasmBrowserState {
  if (typeof window === 'undefined') {
    return createInitialBrowserState()
  }

  try {
    const rawState = window.localStorage.getItem(WASM_BROWSER_STORAGE_KEY)
    if (!rawState) {
      return createInitialBrowserState()
    }
    const parsed = JSON.parse(rawState) as Partial<WasmBrowserState>
    if (!parsed || typeof parsed !== 'object' || !parsed.activeWorkspaceId || !parsed.workspaces || Object.keys(parsed.workspaces).length === 0) {
      return createInitialBrowserState()
    }
    if (!parsed.workspaces[parsed.activeWorkspaceId]) {
      return createInitialBrowserState()
    }
    return parsed as WasmBrowserState
  } catch {
    return createInitialBrowserState()
  }
}

function buildSidebarSessions(browserState: WasmBrowserState): SidebarSessionInfo[] {
  return Object.values(browserState.workspaces)
    .flatMap(({ graph }) =>
      graph.terminalNodes
        .filter((terminalNode) => Boolean(terminalNode.sessionId))
        .map<SidebarSessionInfo>((terminalNode) => ({
          id: terminalNode.sessionId!,
          name: terminalNode.title,
          cwd: terminalNode.snapshot?.cwd ?? DEFAULT_CWD,
          status: graph.activeTerminalNodeId === terminalNode.terminalNodeId ? 'active' : 'idle',
          workspaceId: graph.workspace.id,
          workspaceName: graph.workspace.name,
          terminalNodeId: terminalNode.terminalNodeId,
        })),
    )
    .sort((left, right) => left.workspaceName?.localeCompare(right.workspaceName ?? '') ?? 0)
}

function findWorkspaceIdBySession(state: WasmBrowserState, sessionId: string) {
  return Object.entries(state.workspaces).find(([, workspaceState]) =>
    workspaceState.graph.terminalNodes.some((terminalNode) => terminalNode.sessionId === sessionId),
  )?.[0] ?? null
}

function findWorkspaceIdByTerminalNode(state: WasmBrowserState, terminalNodeId: string) {
  return Object.entries(state.workspaces).find(([, workspaceState]) =>
    workspaceState.graph.terminalNodes.some((terminalNode) => terminalNode.terminalNodeId === terminalNodeId),
  )?.[0] ?? null
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
  const updateTerminalPosition = useGraphStore((state) => state.updateTerminalPosition)
  const updateTerminalSize = useGraphStore((state) => state.updateTerminalSize)
  const setActiveTerminalNode = useGraphStore((state) => state.setActiveTerminalNode)
  const selectNode = useGraphStore((state) => state.selectNode)
  const viewMode = useGraphStore((state) => state.viewMode)
  const workspace = useGraphStore((state) => state.workspace)
  const workspaceLinks = useGraphStore((state) => state.workspaceLinks)
  const nodes = useGraphStore((state) => state.nodes)
  const terminalNodes = useGraphStore((state) => state.terminalNodes)
  const activeTerminalNodeId = useGraphStore((state) => state.activeTerminalNodeId)

  const sessionsRef = useRef<Map<string, WasmSessionEntry>>(new Map())
  const browserStateRef = useRef<WasmBrowserState>(loadBrowserState())
  const packagePromiseRef = useRef<Promise<any> | null>(null)
  const graphTailByTerminalRef = useRef<Map<string, string>>(new Map())
  const sequenceRef = useRef(1)
  const [browserState, setBrowserState] = useState<WasmBrowserState>(browserStateRef.current)
  const [uiVersion, setUiVersion] = useState(0)
  const [centerTerminalNodeId, setCenterTerminalNodeId] = useState<string | null>(null)
  const [focusMode, setFocusMode] = useState<'center' | 'session'>('center')

  const bumpUi = useCallback(() => {
    setUiVersion((current) => current + 1)
  }, [])

  const commitBrowserState = useCallback((updater: (draft: WasmBrowserState) => void) => {
    let nextState: WasmBrowserState | null = null

    setBrowserState((current) => {
      const draft = cloneBrowserState(current)
      updater(draft)
      nextState = draft
      browserStateRef.current = draft
      persistBrowserState(draft)
      return draft
    })

    return nextState
  }, [])

  const hydrateWorkspaceById = useCallback(
    (workspaceId: string) => {
      const nextWorkspace = browserStateRef.current.workspaces[workspaceId]
      if (!nextWorkspace) {
        return
      }
      hydrateWorkspace(nextWorkspace.graph)
    },
    [hydrateWorkspace],
  )

  const updateTerminalInBrowserState = useCallback(
    (terminalNodeId: string, updater: (terminalNode: WorkspaceTerminalNode, graph: WorkspaceGraphPayload) => void) => {
      commitBrowserState((draft) => {
        const workspaceId = findWorkspaceIdByTerminalNode(draft, terminalNodeId)
        if (!workspaceId) {
          return
        }
        const graph = draft.workspaces[workspaceId]!.graph
        const terminalNode = graph.terminalNodes.find((node) => node.terminalNodeId === terminalNodeId)
        if (!terminalNode) {
          return
        }
        updater(terminalNode, graph)
      })
    },
    [commitBrowserState],
  )

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
      outputBuffer: terminalNode.scrollback && terminalNode.scrollback.length > 0 ? terminalNode.scrollback : buildIntroTranscript(terminalNode.title),
      previewLines: terminalNode.snapshot?.previewLines ?? [
        'Browser shell will start automatically.',
        'Commands run inside WebAssembly in this tab.',
      ],
      sessionId: terminalNode.sessionId ?? `wasm-session-${terminalNode.terminalNodeId}`,
      suppressBootstrapEcho: false,
      suppressBuffer: '',
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
      const snapshot = makeSnapshot(status, sessionEntry.cwd, sessionEntry.lastCommand, sessionEntry.previewLines)
      updateTerminalInBrowserState(sessionEntry.nodeId, (terminalNode) => {
        terminalNode.snapshot = snapshot
        terminalNode.status = snapshot.status
        terminalNode.scrollback = sessionEntry.outputBuffer
      })
      updateTerminalSnapshot(
        sessionEntry.nodeId,
        snapshot,
      )
    },
    [updateTerminalInBrowserState, updateTerminalSnapshot],
  )

  const writeVisible = useCallback((sessionEntry: WasmSessionEntry, text: string) => {
    sessionEntry.outputBuffer += text
    sessionEntry.mountedTerm?.write(text)
  }, [])

  const appendGraphNode = useCallback(
    (terminalNodeId: string, node: GraphNode) => {
      const previousNodeId = graphTailByTerminalRef.current.get(terminalNodeId) ?? null
      const edge = previousNodeId
        ? {
            id: crypto.randomUUID(),
            sourceId: previousNodeId,
            targetId: node.id,
            type: EdgeType.SEQUENTIAL,
            metadata: { terminalNodeId, transport: 'wasm' },
          }
        : null

      updateTerminalInBrowserState(terminalNodeId, (_terminalNode, graph) => {
        graph.graphNodes.push(node)
        if (edge) {
          graph.graphEdges.push(edge)
        }
      })

      const currentWorkspaceId = workspace?.id
      const targetWorkspaceId = findWorkspaceIdByTerminalNode(browserStateRef.current, terminalNodeId)
      if (currentWorkspaceId && currentWorkspaceId === targetWorkspaceId) {
        addNode(node)
        if (edge) {
          addEdge(edge)
        }
      }

      graphTailByTerminalRef.current.set(terminalNodeId, node.id)
    },
    [addEdge, addNode, updateTerminalInBrowserState, workspace?.id],
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

      const filteredVisible = filterBootstrapEcho(sessionEntry, visible)
      if (filteredVisible.length > 0) {
        writeVisible(sessionEntry, filteredVisible)
        if (sessionEntry.activeCommand) {
          sessionEntry.activeCommand.rawOutput += filteredVisible
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
        let fetchNoticeTimer: number | null = null
        try {
          sessionEntry.status = 'initializing'
          sessionEntry.error = null
          syncSnapshot(sessionEntry, TerminalStatus.RUNNING)
          bumpUi()

          writeVisible(sessionEntry, '\x1b[33mInitialising WASM runtime…\x1b[0m\r\n')
          writeVisible(sessionEntry, '\x1b[33mFetching bash from Wasmer registry…\x1b[0m\r\n')
          fetchNoticeTimer = window.setTimeout(() => {
            writeVisible(
              sessionEntry,
              '\x1b[2mFirst download can take a while. If it never finishes, check network access to Wasmer/CDN endpoints.\x1b[0m\r\n',
            )
          }, 5000)
          const pkg = await getBashPackage()
          if (fetchNoticeTimer !== null) {
            window.clearTimeout(fetchNoticeTimer)
            fetchNoticeTimer = null
          }

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
          sessionEntry.suppressBootstrapEcho = true
          sessionEntry.suppressBuffer = ''

          const encoder = new TextEncoder()
          await writer.write(encoder.encode(WASM_BOOTSTRAP_SCRIPT))

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
          if (fetchNoticeTimer !== null) {
            window.clearTimeout(fetchNoticeTimer)
          }
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
      const currentWorkspaceId = workspace?.id
      if (!currentWorkspaceId) {
        return
      }

      if (targetTerminalNodeId) {
        const existingLink = terminalNodes.some((node) => node.terminalNodeId === sourceTerminalNodeId)
          && useGraphStore.getState().terminalLinks.some(
          (link) => link.sourceTerminalNodeId === sourceTerminalNodeId && link.targetTerminalNodeId === targetTerminalNodeId,
        )
        if (!existingLink) {
          const terminalLink = {
            id: crypto.randomUUID(),
            workspaceId: currentWorkspaceId,
            sourceTerminalNodeId,
            targetTerminalNodeId,
            createdAt: new Date().toISOString(),
          } satisfies TerminalLink
          commitBrowserState((draft) => {
            draft.workspaces[currentWorkspaceId]!.graph.terminalLinks.push(terminalLink)
          })
          addTerminalLink(terminalLink)
        }
        return
      }

      const terminalNodeId = `wasm-terminal-${crypto.randomUUID()}`
      const sessionId = `wasm-session-${crypto.randomUUID()}`
      const title = `Browser Shell ${terminalNodes.length + 1}`
      const nextPosition = position ?? { x: 240 + terminalNodes.length * 48, y: 120 + terminalNodes.length * 36 }
      const terminalNode = createTerminalNode({
        id: terminalNodeId,
        workspaceId: currentWorkspaceId,
        sessionId,
        title,
        position: nextPosition,
      })
      const terminalLink = {
        id: crypto.randomUUID(),
        workspaceId: currentWorkspaceId,
        sourceTerminalNodeId,
        targetTerminalNodeId: terminalNodeId,
        createdAt: new Date().toISOString(),
      } satisfies TerminalLink

      commitBrowserState((draft) => {
        const currentWorkspace = draft.workspaces[currentWorkspaceId]
        if (!currentWorkspace) {
          return
        }
        currentWorkspace.graph.terminalNodes.push(terminalNode)
        currentWorkspace.graph.terminalLinks.push(terminalLink)
        currentWorkspace.graph.activeTerminalNodeId = terminalNodeId
        draft.activeSessionId = sessionId
      })
      addTerminalNode(terminalNode)
      addTerminalLink(terminalLink)
      createSessionEntry(terminalNode)
      setActiveTerminalNode(terminalNodeId)
      selectNode(terminalNodeId)
      setCenterTerminalNodeId(terminalNodeId)
      setFocusMode('session')
      bumpUi()
    },
    [addTerminalLink, addTerminalNode, bumpUi, commitBrowserState, createSessionEntry, selectNode, setActiveTerminalNode, terminalNodes, workspace?.id],
  )

  useEffect(() => {
    const initialState = browserStateRef.current
    Object.values(initialState.workspaces).forEach(({ graph }) => {
      graph.terminalNodes.forEach((terminalNode) => {
        createSessionEntry(terminalNode)
      })
      graph.graphNodes.forEach((node) => {
        const terminalNodeId = typeof node.metadata.terminalNodeId === 'string' ? node.metadata.terminalNodeId : null
        if (terminalNodeId) {
          graphTailByTerminalRef.current.set(terminalNodeId, node.id)
        }
      })
    })

    hydrateWorkspaceById(initialState.activeWorkspaceId)
    const activeWorkspace = initialState.workspaces[initialState.activeWorkspaceId]?.graph
    if (activeWorkspace?.activeTerminalNodeId) {
      setCenterTerminalNodeId(activeWorkspace.activeTerminalNodeId)
      setFocusMode('session')
    }

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
  }, [createSessionEntry, hydrateWorkspaceById, resetWorkspaceState, syncRuntimes])

  useEffect(() => {
    if (!workspace?.id || !activeTerminalNodeId) {
      return
    }

    const activeTerminalNode = terminalNodes.find((node) => node.terminalNodeId === activeTerminalNodeId)
    const nextSessionId = activeTerminalNode?.sessionId ?? null
    commitBrowserState((draft) => {
      if (draft.activeWorkspaceId !== workspace.id) {
        draft.activeWorkspaceId = workspace.id
      }
      draft.activeSessionId = nextSessionId
      const currentWorkspace = draft.workspaces[workspace.id]
      if (currentWorkspace) {
        currentWorkspace.graph.activeTerminalNodeId = activeTerminalNodeId
        currentWorkspace.graph.terminalNodes = terminalNodes.map((terminalNode) => {
          const sessionEntry = sessionsRef.current.get(terminalNode.terminalNodeId)
          return {
            ...terminalNode,
            scrollback: sessionEntry?.outputBuffer ?? terminalNode.scrollback,
          }
        })
      }
    })
  }, [activeTerminalNodeId, commitBrowserState, terminalNodes, workspace?.id])

  const handleCreateWorkspace = useCallback(() => {
    const workspaceId = `wasm-workspace-${crypto.randomUUID()}`
    const terminalNodeId = `wasm-terminal-${crypto.randomUUID()}`
    const sessionId = `wasm-session-${crypto.randomUUID()}`
    const graph = createWorkspacePayload({
      sessionId,
      terminalNodeId,
      title: 'Browser Shell',
      workspaceId,
      workspaceName: `Window ${Object.keys(browserStateRef.current.workspaces).length + 1}`,
    })

    commitBrowserState((draft) => {
      draft.workspaces[workspaceId] = { graph }
      draft.activeWorkspaceId = workspaceId
      draft.activeSessionId = sessionId
    })
    createSessionEntry(graph.terminalNodes[0]!)
    hydrateWorkspace(graph)
    setCenterTerminalNodeId(terminalNodeId)
    setFocusMode('session')
  }, [commitBrowserState, createSessionEntry, hydrateWorkspace])

  const handleCreateSessionInWorkspace = useCallback(
    (workspaceId: string, sourceTerminalNodeId?: string, position?: { x: number; y: number }) => {
      const workspaceState = browserStateRef.current.workspaces[workspaceId]
      if (!workspaceState) {
        return
      }

      const terminalNodeId = `wasm-terminal-${crypto.randomUUID()}`
      const sessionId = `wasm-session-${crypto.randomUUID()}`
      const title = `Browser Shell ${workspaceState.graph.terminalNodes.length + 1}`
      const terminalNode = createTerminalNode({
        id: terminalNodeId,
        workspaceId,
        sessionId,
        title,
        position: position ?? { x: 240 + workspaceState.graph.terminalNodes.length * 48, y: 120 + workspaceState.graph.terminalNodes.length * 36 },
      })
      const terminalLink = sourceTerminalNodeId
        ? ({
            id: crypto.randomUUID(),
            workspaceId,
            sourceTerminalNodeId,
            targetTerminalNodeId: terminalNodeId,
            createdAt: new Date().toISOString(),
          } satisfies TerminalLink)
        : null

      commitBrowserState((draft) => {
        const targetWorkspace = draft.workspaces[workspaceId]
        if (!targetWorkspace) {
          return
        }
        targetWorkspace.graph.terminalNodes.push(terminalNode)
        if (terminalLink) {
          targetWorkspace.graph.terminalLinks.push(terminalLink)
        }
        targetWorkspace.graph.activeTerminalNodeId = terminalNodeId
        draft.activeWorkspaceId = workspaceId
        draft.activeSessionId = sessionId
      })

      createSessionEntry(terminalNode)
      if (workspace?.id === workspaceId) {
        addTerminalNode(terminalNode)
        if (terminalLink) {
          addTerminalLink(terminalLink)
        }
        setActiveTerminalNode(terminalNodeId)
        selectNode(terminalNodeId)
      } else {
        hydrateWorkspaceById(workspaceId)
      }
      setCenterTerminalNodeId(terminalNodeId)
      setFocusMode('session')
      bumpUi()
    },
    [addTerminalLink, addTerminalNode, bumpUi, commitBrowserState, createSessionEntry, hydrateWorkspaceById, selectNode, setActiveTerminalNode, workspace?.id],
  )

  const handleSelectWorkspace = useCallback(
    (workspaceId: string) => {
      const graph = browserStateRef.current.workspaces[workspaceId]?.graph
      if (!graph) {
        return
      }
      commitBrowserState((draft) => {
        draft.activeWorkspaceId = workspaceId
        draft.activeSessionId = graph.terminalNodes.find((node) => node.terminalNodeId === graph.activeTerminalNodeId)?.sessionId ?? null
      })
      hydrateWorkspace(graph)
      if (graph.activeTerminalNodeId) {
        setCenterTerminalNodeId(graph.activeTerminalNodeId)
        setFocusMode('session')
      }
    },
    [commitBrowserState, hydrateWorkspace],
  )

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      const workspaceId = findWorkspaceIdBySession(browserStateRef.current, sessionId)
      if (!workspaceId) {
        return
      }
      const graph = browserStateRef.current.workspaces[workspaceId]?.graph
      const terminalNode = graph?.terminalNodes.find((node) => node.sessionId === sessionId)
      if (!graph || !terminalNode) {
        return
      }

      commitBrowserState((draft) => {
        draft.activeWorkspaceId = workspaceId
        draft.activeSessionId = sessionId
        draft.workspaces[workspaceId]!.graph.activeTerminalNodeId = terminalNode.terminalNodeId
      })
      hydrateWorkspaceById(workspaceId)
      setActiveTerminalNode(terminalNode.terminalNodeId)
      selectNode(terminalNode.terminalNodeId)
      setCenterTerminalNodeId(terminalNode.terminalNodeId)
      setFocusMode('session')
    },
    [commitBrowserState, hydrateWorkspaceById, selectNode, setActiveTerminalNode],
  )

  const handleRenameWorkspace = useCallback(
    (workspaceId: string, name: string) => {
      const trimmedName = name.trim()
      if (!trimmedName) {
        return
      }

      commitBrowserState((draft) => {
        const targetWorkspace = draft.workspaces[workspaceId]
        if (!targetWorkspace) {
          return
        }
        targetWorkspace.graph.workspace.name = trimmedName
        targetWorkspace.graph.workspace.updatedAt = new Date().toISOString()
      })

      if (workspace?.id === workspaceId) {
        hydrateWorkspaceById(workspaceId)
      }
    },
    [commitBrowserState, hydrateWorkspaceById, workspace?.id],
  )

  const handleRenameSession = useCallback(
    (sessionId: string, name: string) => {
      const trimmedName = name.trim()
      if (!trimmedName) {
        return
      }

      const workspaceId = findWorkspaceIdBySession(browserStateRef.current, sessionId)
      if (!workspaceId) {
        return
      }

      commitBrowserState((draft) => {
        const terminalNode = draft.workspaces[workspaceId]?.graph.terminalNodes.find((node) => node.sessionId === sessionId)
        if (!terminalNode) {
          return
        }
        const previousTitle = terminalNode.title
        terminalNode.title = trimmedName
        const sessionEntry = sessionsRef.current.get(terminalNode.terminalNodeId)
        if (sessionEntry) {
          sessionEntry.outputBuffer = sessionEntry.outputBuffer.replace(buildIntroTranscript(previousTitle), buildIntroTranscript(trimmedName))
        }
      })

      if (workspace?.id === workspaceId) {
        hydrateWorkspaceById(workspaceId)
      }
      bumpUi()
    },
    [bumpUi, commitBrowserState, hydrateWorkspaceById, workspace?.id],
  )

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      const workspaceId = findWorkspaceIdBySession(browserStateRef.current, sessionId)
      if (!workspaceId) {
        return
      }

      const targetWorkspace = browserStateRef.current.workspaces[workspaceId]?.graph
      const terminalNode = targetWorkspace?.terminalNodes.find((node) => node.sessionId === sessionId)
      if (!targetWorkspace || !terminalNode) {
        return
      }

      const remainingTerminalNodes = targetWorkspace.terminalNodes.filter((node) => node.sessionId !== sessionId)
      const nextActiveTerminalNodeId = remainingTerminalNodes.find((node) => node.terminalNodeId !== terminalNode.terminalNodeId)?.terminalNodeId ?? null

      commitBrowserState((draft) => {
        const graph = draft.workspaces[workspaceId]?.graph
        if (!graph) {
          return
        }
        graph.terminalNodes = graph.terminalNodes.filter((node) => node.sessionId !== sessionId)
        graph.terminalLinks = graph.terminalLinks.filter((link) => link.sourceTerminalNodeId !== terminalNode.terminalNodeId && link.targetTerminalNodeId !== terminalNode.terminalNodeId)
        if (graph.workspace.rootTerminalNodeId === terminalNode.terminalNodeId) {
          graph.workspace.rootTerminalNodeId = nextActiveTerminalNodeId
        }
        graph.activeTerminalNodeId = nextActiveTerminalNodeId
        if (draft.activeSessionId === sessionId) {
          draft.activeSessionId = nextActiveTerminalNodeId
            ? graph.terminalNodes.find((node) => node.terminalNodeId === nextActiveTerminalNodeId)?.sessionId ?? null
            : null
        }
      })

      const sessionEntry = sessionsRef.current.get(terminalNode.terminalNodeId)
      sessionEntry?.writer?.close().catch(() => {})
      sessionsRef.current.delete(terminalNode.terminalNodeId)
      graphTailByTerminalRef.current.delete(terminalNode.terminalNodeId)

      if (workspace?.id === workspaceId) {
        hydrateWorkspaceById(workspaceId)
        if (nextActiveTerminalNodeId) {
          setActiveTerminalNode(nextActiveTerminalNodeId)
          selectNode(nextActiveTerminalNodeId)
          setCenterTerminalNodeId(nextActiveTerminalNodeId)
          setFocusMode('session')
        }
      }
      bumpUi()
    },
    [bumpUi, commitBrowserState, hydrateWorkspaceById, selectNode, setActiveTerminalNode, workspace?.id],
  )

  const handleDeleteWorkspace = useCallback(
    (workspaceId: string) => {
      const deletedWorkspace = browserStateRef.current.workspaces[workspaceId]?.graph
      if (!deletedWorkspace) {
        return
      }

      deletedWorkspace.terminalNodes.forEach((terminalNode) => {
        const sessionEntry = sessionsRef.current.get(terminalNode.terminalNodeId)
        sessionEntry?.writer?.close().catch(() => {})
        sessionsRef.current.delete(terminalNode.terminalNodeId)
        graphTailByTerminalRef.current.delete(terminalNode.terminalNodeId)
      })

      const remainingWorkspaceIds = Object.keys(browserStateRef.current.workspaces).filter((id) => id !== workspaceId)
      if (remainingWorkspaceIds.length === 0) {
        const replacementWorkspaceId = `wasm-workspace-${crypto.randomUUID()}`
        const replacementTerminalNodeId = `wasm-terminal-${crypto.randomUUID()}`
        const replacementSessionId = `wasm-session-${crypto.randomUUID()}`
        const replacementGraph = createWorkspacePayload({
          sessionId: replacementSessionId,
          terminalNodeId: replacementTerminalNodeId,
          title: 'Browser Shell',
          workspaceId: replacementWorkspaceId,
          workspaceName: WORKSPACE_NAME,
        })

        commitBrowserState((draft) => {
          delete draft.workspaces[workspaceId]
          draft.workspaces[replacementWorkspaceId] = { graph: replacementGraph }
          draft.activeWorkspaceId = replacementWorkspaceId
          draft.activeSessionId = replacementSessionId
        })
        createSessionEntry(replacementGraph.terminalNodes[0]!)
        hydrateWorkspace(replacementGraph)
        setCenterTerminalNodeId(replacementTerminalNodeId)
        setFocusMode('session')
        return
      }

      const nextWorkspaceId = remainingWorkspaceIds[0]!
      const nextGraph = browserStateRef.current.workspaces[nextWorkspaceId]!.graph
      commitBrowserState((draft) => {
        delete draft.workspaces[workspaceId]
        draft.activeWorkspaceId = nextWorkspaceId
        draft.activeSessionId = nextGraph.terminalNodes.find(
          (node) => node.terminalNodeId === nextGraph.activeTerminalNodeId,
        )?.sessionId ?? null
      })

      if (workspace?.id === workspaceId) {
        hydrateWorkspaceById(nextWorkspaceId)
        if (nextGraph.activeTerminalNodeId) {
          setCenterTerminalNodeId(nextGraph.activeTerminalNodeId)
          setFocusMode('session')
        }
      }
    },
    [commitBrowserState, createSessionEntry, hydrateWorkspace, hydrateWorkspaceById, workspace?.id],
  )

  const handleMoveTerminalNode = useCallback(
    (terminalNodeId: string, position: { x: number; y: number }) => {
      updateTerminalInBrowserState(terminalNodeId, (terminalNode) => {
        terminalNode.position = position
      })
      updateTerminalPosition(terminalNodeId, position)
    },
    [updateTerminalInBrowserState, updateTerminalPosition],
  )

  const handleResizeTerminalNode = useCallback(
    (terminalNodeId: string, size: { width: number; height: number }) => {
      updateTerminalInBrowserState(terminalNodeId, (terminalNode) => {
        terminalNode.size = size
      })
      updateTerminalSize(terminalNodeId, size)
    },
    [updateTerminalInBrowserState, updateTerminalSize],
  )

  const sidebarSessions = useMemo(() => buildSidebarSessions(browserState), [browserState])

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
        void startSession(terminalNode.terminalNodeId)
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
  }, [activeTerminalNodeId, bindRuntime, bumpUi, fitTerminal, focusTerminal, getSessionEntry, handleTerminalData, startSession, syncRuntimes, terminalNodes, uiVersion, viewMode])

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
      <div className="min-w-0 px-4 text-center">
        <div className="truncate text-sm font-semibold text-[var(--text-strong)]">{activeTitle}</div>
        <div className="truncate font-mono text-[11px] text-[var(--text-faint)]">
          {activeCwd} • {commandCount} commands
        </div>
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
            title={activeError ?? 'Retry Browser Shell'}
          >
            Retry Browser Shell
          </button>
        ) : null}
      </div>
    </div>
  )

  return (
    <div className="flex h-full">
      <Sidebar
        sessions={sidebarSessions}
        activeSessionId={browserState.activeSessionId}
        workspace={workspace as Workspace | null}
        workspaceLinks={workspaceLinks}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onNewSession={handleCreateSessionInWorkspace}
        onNewTerminal={handleCreateWorkspace}
        onSelectWorkspace={handleSelectWorkspace}
        onRenameWorkspace={handleRenameWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
      />
      <div className="flex-1">
        <AppShell
          toolbar={toolbar}
          top={
            viewMode === 'graph' ? (
              <GraphView
                onCreateTerminalLink={handleCreateTerminalLink}
                onMoveTerminalNode={handleMoveTerminalNode}
                onResizeTerminalNode={handleResizeTerminalNode}
                onDeleteTerminalNode={(terminalNodeId) => {
                  const sessionId = browserStateRef.current.workspaces[workspace?.id ?? browserState.activeWorkspaceId]?.graph.terminalNodes.find(
                    (node) => node.terminalNodeId === terminalNodeId,
                  )?.sessionId
                  if (sessionId) {
                    handleDeleteSession(sessionId)
                  }
                }}
                onRenameSession={handleRenameSession}
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
