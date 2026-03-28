import { useRef, useEffect, useCallback, useState } from 'react'
import { MsgType } from '@mindmap/shared'
import type { GraphEdge, GraphNode, WorkspaceGraphPayload } from '@mindmap/shared'
import { useWebSocket } from './hooks/useWebSocket.js'
import { useTerminalManager } from './hooks/useTerminalManager.js'
import { decodeTerminalData } from './lib/terminal.js'
import { useGraphStore } from './store/graphStore.js'
import AppShell from './components/layout/AppShell.js'
import GraphView from './components/graph/GraphView.js'
import TimelineView from './components/timeline/TimelineView.js'
import ViewToggle from './components/shared/ViewToggle.js'
import Sidebar from './components/layout/Sidebar.js'

interface SessionInfo {
  id: string
  name: string | null
  cwd: string
  status: string
  workspaceId: string
  workspaceName?: string | null
  terminalNodeId?: string | null
}

function App() {
  const terminalManager = useTerminalManager()
  const { send, request, onMessage, isConnected } = useWebSocket(`ws://${window.location.hostname}:${window.location.port}/ws`)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [centerTerminalNodeId, setCenterTerminalNodeId] = useState<string | null>(null)
  const [focusMode, setFocusMode] = useState<'center' | 'session'>('center')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const sessionIdRef = useRef<string | null>(null)
  const initRef = useRef(false)
  const attachedTerminalKeysRef = useRef<Map<string, string>>(new Map())

  const addNode = useGraphStore((s) => s.addNode)
  const addEdge = useGraphStore((s) => s.addEdge)
  const setGraph = useGraphStore((s) => s.setGraph)
  const hydrateWorkspace = useGraphStore((s) => s.hydrateWorkspace)
  const clearGraph = useGraphStore((s) => s.clearGraph)
  const workspace = useGraphStore((s) => s.workspace)
  const workspaceLinks = useGraphStore((s) => s.workspaceLinks)
  const terminalNodes = useGraphStore((s) => s.terminalNodes)
  const activeTerminalNodeId = useGraphStore((s) => s.activeTerminalNodeId)
  const setPendingBranchAction = useGraphStore((s) => s.setPendingBranchAction)
  const clearPendingBranchAction = useGraphStore((s) => s.clearPendingBranchAction)
  const updateTerminalSnapshot = useGraphStore((s) => s.updateTerminalSnapshot)
  const updateTerminalPosition = useGraphStore((s) => s.updateTerminalPosition)
  const setActiveTerminalNode = useGraphStore((s) => s.setActiveTerminalNode)
  const viewMode = useGraphStore((s) => s.viewMode)
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId)

  const loadWorkspace = useCallback(
    async (workspaceId: string) => {
      const response = await request(MsgType.WORKSPACE_GET, { workspaceId })
      const payload = response.payload as { graph?: WorkspaceGraphPayload }
      if (payload.graph) {
        hydrateWorkspace(payload.graph)
      }
    },
    [hydrateWorkspace, request],
  )

  const refreshSessions = useCallback(async () => {
    const resp = await request(MsgType.SESSION_LIST, {})
    const p = resp.payload as { sessions?: SessionInfo[] }
    const activeSessions = p.sessions || []
    setSessions(activeSessions)
    return activeSessions
  }, [request])

  const handleMessage = useCallback(
    (msg: { type: string; payload: unknown }) => {
      const payload = msg.payload as Record<string, unknown>
      switch (msg.type) {
        case MsgType.TERMINAL_STDOUT: {
          if (typeof payload.terminalNodeId === 'string' && typeof payload.data === 'string') {
            terminalManager.write(payload.terminalNodeId, decodeTerminalData(payload.data))
          }
          break
        }
        case MsgType.TERMINAL_NODE_SNAPSHOT: {
          if (typeof payload.terminalNodeId === 'string' && payload.snapshot) {
            updateTerminalSnapshot(payload.terminalNodeId, payload.snapshot as never)
          }
          break
        }
        case MsgType.TERMINAL_NODE_ACTIVATED: {
          break
        }
        case MsgType.NODE_CREATED: {
          addNode(payload.node as GraphNode)
          break
        }
        case MsgType.EDGE_CREATED: {
          addEdge(payload.edge as GraphEdge)
          break
        }
        case MsgType.SESSION_EXITED: {
          if (typeof payload.terminalNodeId === 'string') {
            terminalManager.write(payload.terminalNodeId, '\r\n\x1b[33m[Session exited]\x1b[0m\r\n')
          }
          break
        }
      }
    },
    [addEdge, addNode, terminalManager, updateTerminalSnapshot],
  )

  useEffect(() => {
    onMessage(handleMessage)
  }, [onMessage, handleMessage])

  const attachSession = useCallback(
    async (sid: string) => {
      try {
        const resp = await request(MsgType.SESSION_ATTACH, { sessionId: sid })
        const p = resp.payload as {
          session: { id: string; cwd: string; status: string; workspaceId?: string; terminalNodeId?: string | null }
          graph?: { nodes: GraphNode[]; edges: GraphEdge[] }
        }
        setSessionId(sid)
        sessionIdRef.current = sid

        if (p.session.workspaceId) {
          await loadWorkspace(p.session.workspaceId)
        } else if (p.graph) {
          setGraph(p.graph.nodes, p.graph.edges)
        }

        return {
          terminalNodeId: p.session.terminalNodeId ?? null,
          workspaceId: p.session.workspaceId ?? null,
        }
      } catch (err) {
        console.error('Failed to attach session:', err)
        return null
      }
    },
    [loadWorkspace, request, setGraph],
  )

  const createSession = useCallback(async () => {
    const { cols, rows } = { cols: 80, rows: 24 }
    try {
      const response = await request(MsgType.SESSION_CREATE, { cols, rows })
      const p = response.payload as {
        session: {
          id: string
          cwd: string
          workspaceId?: string
          terminalNodeId?: string | null
        }
      }
      const sid = p.session.id
      setSessionId(sid)
      sessionIdRef.current = sid
      attachedTerminalKeysRef.current.clear()
      await refreshSessions()
      clearGraph()

      if (p.session.workspaceId) {
        await loadWorkspace(p.session.workspaceId)
      }
    } catch (err) {
      console.error('Failed to create session:', err)
    }
  }, [clearGraph, loadWorkspace, refreshSessions, request])

  useEffect(() => {
    if (!isConnected || initRef.current) return
    initRef.current = true

    const init = async () => {
      try {
        const activeSessions = await refreshSessions()

        if (activeSessions.length > 0) {
          await attachSession(activeSessions[0].id)
        } else {
          await createSession()
        }
      } catch (err) {
        console.error('Failed to init:', err)
        await createSession()
      }
    }
    init()
  }, [attachSession, createSession, isConnected, refreshSessions])

  useEffect(() => {
    if (viewMode !== 'graph' || !workspace) {
      attachedTerminalKeysRef.current.clear()
      terminalManager.syncRuntimes(new Set())
      return
    }

    const liveTerminalNodes = terminalNodes.filter((node) => node.sessionId && node.status !== 'disconnected')
    const visibleLiveTerminalIds = new Set(liveTerminalNodes.map((node) => node.terminalNodeId))
    terminalManager.syncRuntimes(visibleLiveTerminalIds)

    for (const terminalNode of liveTerminalNodes) {
      const container = document.querySelector<HTMLDivElement>(`[data-terminal-container="${terminalNode.terminalNodeId}"]`)
      if (!container || !terminalNode.sessionId) {
        continue
      }

      const runtime = terminalManager.bindRuntime({
        nodeId: terminalNode.terminalNodeId,
        sessionId: terminalNode.sessionId,
        container,
        onData: (sid, data) => {
          send(MsgType.TERMINAL_STDIN, { sessionId: sid, data })
        },
        onResize: (sid, size) => {
          send(MsgType.SESSION_RESIZE, { sessionId: sid, cols: size.cols, rows: size.rows })
        },
      })

      const attachKey = `${workspace.id}:${terminalNode.terminalNodeId}:${terminalNode.sessionId}`
      if (attachedTerminalKeysRef.current.get(terminalNode.terminalNodeId) !== attachKey) {
        terminalManager.reset(terminalNode.terminalNodeId)
        const { cols, rows } = terminalManager.getSize(terminalNode.terminalNodeId)
        send(MsgType.TERMINAL_NODE_ATTACH, {
          workspaceId: workspace.id,
          terminalNodeId: terminalNode.terminalNodeId,
          sessionId: terminalNode.sessionId,
          cols,
          rows,
        })
        attachedTerminalKeysRef.current.set(terminalNode.terminalNodeId, attachKey)
      } else {
        terminalManager.fit(terminalNode.terminalNodeId)
      }

      if (activeTerminalNodeId === terminalNode.terminalNodeId) {
        requestAnimationFrame(() => {
          terminalManager.focus(terminalNode.terminalNodeId)
        })
      }

      if (activeTerminalNodeId === terminalNode.terminalNodeId) {
        sessionIdRef.current = terminalNode.sessionId
        if (sessionId !== terminalNode.sessionId) {
          setSessionId(terminalNode.sessionId)
        }
      }

      void runtime
    }
  }, [activeTerminalNodeId, request, send, sessionId, terminalManager, terminalNodes, viewMode, workspace])

  const handleCreateWorkspaceBranch = useCallback(
    async (nodeId: string, creationMode: 'clone_live_terminal' | 'new_from_node_context') => {
      if (!workspace || !activeTerminalNodeId) return

      setPendingBranchAction({
        sourceNodeId: nodeId,
        sourceTerminalNodeId: activeTerminalNodeId,
        creationMode,
      })

      try {
        const response = await request(MsgType.WORKSPACE_BRANCH_CREATE, {
          workspaceId: workspace.id,
          sourceNodeId: nodeId,
          creationMode,
          sourceTerminalNodeId: activeTerminalNodeId,
        })
        if (response.type === MsgType.ERROR) {
          const message =
            typeof response.payload === 'object' && response.payload !== null
              ? String((response.payload as { message?: unknown }).message ?? 'Failed to create workspace branch')
              : 'Failed to create workspace branch'
          throw new Error(message)
        }
        const payload = response.payload as { workspaceId?: string }
        if (!payload.workspaceId) {
          throw new Error('Workspace branch response did not include a workspaceId')
        }
        await loadWorkspace(payload.workspaceId)
      } catch (err) {
        console.error('Failed to create workspace branch:', err)
      } finally {
        clearPendingBranchAction()
      }
    },
    [activeTerminalNodeId, clearPendingBranchAction, loadWorkspace, request, setPendingBranchAction, workspace],
  )

  const handleBranchFromNode = useCallback(
    (nodeId: string) => {
      void handleCreateWorkspaceBranch(nodeId, 'new_from_node_context')
    },
    [handleCreateWorkspaceBranch],
  )

  const handleSelectWorkspace = useCallback(
    async (workspaceId: string) => {
      await loadWorkspace(workspaceId)
    },
    [loadWorkspace],
  )

  const handleSelectSession = useCallback(
    async (sid: string) => {
      if (sid === sessionIdRef.current) return
      const sessionInfo = sessions.find((session) => session.id === sid)
      if (sessionInfo && sessionInfo.status !== 'active') {
        setSessionId(sid)
        sessionIdRef.current = sid
        await loadWorkspace(sessionInfo.workspaceId)
        if (sessionInfo.terminalNodeId) {
          setFocusMode('session')
          setCenterTerminalNodeId(sessionInfo.terminalNodeId)
        }
        return
      }
      attachedTerminalKeysRef.current.clear()
      terminalManager.syncRuntimes(new Set())
      clearGraph()
      const attached = await attachSession(sid)
      if (attached?.terminalNodeId) {
        setFocusMode('session')
        setCenterTerminalNodeId(attached.terminalNodeId)
      }
    },
    [attachSession, clearGraph, loadWorkspace, sessions, terminalManager],
  )

  const handleDeleteSession = useCallback(
    async (sid: string) => {
      try {
        const response = await request(MsgType.SESSION_DELETE, { sessionId: sid })
        if (response.type === MsgType.ERROR) {
          throw new Error(
            typeof response.payload === 'object' && response.payload !== null ? String((response.payload as { message?: unknown }).message ?? 'Failed to delete session') : 'Failed to delete session',
          )
        }

        const remainingSessions = (await refreshSessions()).filter((session) => session.id !== sid)

        if (sessionIdRef.current === sid) {
          sessionIdRef.current = null
          setSessionId(null)
          attachedTerminalKeysRef.current.clear()
          terminalManager.syncRuntimes(new Set())
          clearGraph()

          const nextSession = remainingSessions[0]
          if (nextSession) {
            await attachSession(nextSession.id)
          } else {
            await createSession()
          }
        }
      } catch (err) {
        console.error('Failed to delete session:', err)
      }
    },
    [attachSession, clearGraph, createSession, refreshSessions, request, terminalManager],
  )

  const handleCreateTerminal = useCallback(async () => {
    if (!workspace) return

    try {
      const response = await request(MsgType.TERMINAL_NODE_CREATE, {
        workspaceId: workspace.id,
      })
      if (response.type === MsgType.ERROR) {
        const message =
          typeof response.payload === 'object' && response.payload !== null ? String((response.payload as { message?: unknown }).message ?? 'Failed to create terminal') : 'Failed to create terminal'
        throw new Error(message)
      }

      const payload = response.payload as {
        session?: { id?: string; workspaceId?: string; terminalNodeId?: string | null }
      }
      attachedTerminalKeysRef.current.delete(payload.session?.terminalNodeId ?? '')
      await refreshSessions()

      if (payload.session?.id) {
        setSessionId(payload.session.id)
        sessionIdRef.current = payload.session.id
      }
      if (payload.session?.workspaceId) {
        await loadWorkspace(payload.session.workspaceId)
      }
    } catch (err) {
      console.error('Failed to create terminal:', err)
    }
  }, [loadWorkspace, refreshSessions, request, workspace])

  const handleCreateSessionInWorkspace = useCallback(
    async (workspaceId: string) => {
      try {
        const response = await request(MsgType.TERMINAL_NODE_CREATE, {
          workspaceId,
        })
        if (response.type === MsgType.ERROR) {
          const message =
            typeof response.payload === 'object' && response.payload !== null ? String((response.payload as { message?: unknown }).message ?? 'Failed to create session') : 'Failed to create session'
          throw new Error(message)
        }

        const payload = response.payload as {
          session?: { id?: string; workspaceId?: string; terminalNodeId?: string | null }
        }
        attachedTerminalKeysRef.current.delete(payload.session?.terminalNodeId ?? '')
        await refreshSessions()

        if (payload.session?.id) {
          setSessionId(payload.session.id)
          sessionIdRef.current = payload.session.id
        }
        if (payload.session?.workspaceId) {
          await loadWorkspace(payload.session.workspaceId)
        }
      } catch (err) {
        console.error('Failed to create session in workspace:', err)
      }
    },
    [loadWorkspace, refreshSessions, request],
  )

  const handleCreateChildTerminal = useCallback(
    async (sourceNodeId: string) => {
      if (!workspace) return

      try {
        const response = await request(MsgType.TERMINAL_NODE_CREATE, {
          workspaceId: workspace.id,
          sourceNodeId,
        })
        if (response.type === MsgType.ERROR) {
          const message =
            typeof response.payload === 'object' && response.payload !== null
              ? String((response.payload as { message?: unknown }).message ?? 'Failed to create child terminal')
              : 'Failed to create child terminal'
          throw new Error(message)
        }

        const payload = response.payload as {
          session?: { id?: string; workspaceId?: string; terminalNodeId?: string | null }
        }
        attachedTerminalKeysRef.current.delete(payload.session?.terminalNodeId ?? '')
        await refreshSessions()

        if (payload.session?.id) {
          setSessionId(payload.session.id)
          sessionIdRef.current = payload.session.id
        }
        if (payload.session?.workspaceId) {
          await loadWorkspace(payload.session.workspaceId)
        }
      } catch (err) {
        console.error('Failed to create child terminal:', err)
      }
    },
    [loadWorkspace, refreshSessions, request, workspace],
  )

  const handleCreateTerminalLink = useCallback(
    async (sourceTerminalNodeId: string, targetTerminalNodeId?: string, position?: { x: number; y: number }) => {
      if (!workspace) return

      try {
        const response = await request(MsgType.TERMINAL_LINK_CREATE, {
          workspaceId: workspace.id,
          sourceTerminalNodeId,
          targetTerminalNodeId,
          position,
        })
        if (response.type === MsgType.ERROR) {
          const message =
            typeof response.payload === 'object' && response.payload !== null
              ? String((response.payload as { message?: unknown }).message ?? 'Failed to connect terminals')
              : 'Failed to connect terminals'
          throw new Error(message)
        }

        const payload = response.payload as {
          session?: { id?: string; workspaceId?: string }
          graph?: WorkspaceGraphPayload
        }

        await refreshSessions()

        if (payload.graph) {
          hydrateWorkspace(payload.graph)
        } else {
          await loadWorkspace(workspace.id)
        }

        if (payload.session?.id) {
          setSessionId(payload.session.id)
          sessionIdRef.current = payload.session.id
        }
        attachedTerminalKeysRef.current.delete(targetTerminalNodeId ?? '')
      } catch (err) {
        console.error('Failed to connect terminals:', err)
      }
    },
    [hydrateWorkspace, loadWorkspace, refreshSessions, request, workspace],
  )

  const handleMoveTerminalNode = useCallback(
    (terminalNodeId: string, position: { x: number; y: number }) => {
      if (!workspace) return
      updateTerminalPosition(terminalNodeId, position)
      send(MsgType.TERMINAL_NODE_MOVE, {
        workspaceId: workspace.id,
        terminalNodeId,
        position,
      })
    },
    [send, updateTerminalPosition, workspace],
  )

  const handleResizeTerminalNode = useCallback(
    (terminalNodeId: string, size: { width: number; height: number }) => {
      if (!workspace) return
      send(MsgType.TERMINAL_NODE_RESIZE, {
        workspaceId: workspace.id,
        terminalNodeId,
        size,
      })
    },
    [send, workspace],
  )

  const handleDeleteSelection = useCallback(async () => {
    if (!workspace) return

    try {
      if (selectedEdgeId) {
        const messageType = selectedEdgeId.startsWith('terminal-branch-') ? MsgType.TERMINAL_LINK_DELETE : selectedEdgeId.startsWith('terminal-link-') ? null : MsgType.EDGE_DELETE

        if (!messageType) {
          return
        }

        const payload =
          messageType === MsgType.TERMINAL_LINK_DELETE
            ? { workspaceId: workspace.id, terminalLinkId: selectedEdgeId.replace('terminal-branch-', '') }
            : { workspaceId: workspace.id, edgeId: selectedEdgeId }
        const response = await request(messageType, payload)
        if (response.type === MsgType.ERROR) {
          throw new Error(
            typeof response.payload === 'object' && response.payload !== null ? String((response.payload as { message?: unknown }).message ?? 'Failed to delete edge') : 'Failed to delete edge',
          )
        }
        const payloadGraph = response.payload as { graph?: WorkspaceGraphPayload }
        if (payloadGraph.graph) {
          hydrateWorkspace(payloadGraph.graph)
        } else {
          await loadWorkspace(workspace.id)
        }
        return
      }

      if (!selectedNodeId) return

      const isTerminalNode = terminalNodes.some((node) => node.terminalNodeId === selectedNodeId)
      const response = await request(
        isTerminalNode ? MsgType.TERMINAL_NODE_DELETE : MsgType.NODE_DELETE,
        isTerminalNode ? { workspaceId: workspace.id, terminalNodeId: selectedNodeId } : { workspaceId: workspace.id, nodeId: selectedNodeId },
      )
      if (response.type === MsgType.ERROR) {
        throw new Error(
          typeof response.payload === 'object' && response.payload !== null
            ? String((response.payload as { message?: unknown }).message ?? 'Failed to delete selection')
            : 'Failed to delete selection',
        )
      }
      const payloadGraph = response.payload as { graph?: WorkspaceGraphPayload }
      if (isTerminalNode && activeTerminalNodeId === selectedNodeId) {
        attachedTerminalKeysRef.current.delete(selectedNodeId)
        terminalManager.disposeRuntime(selectedNodeId)
      }
      if (payloadGraph.graph) {
        hydrateWorkspace(payloadGraph.graph)
      } else {
        await loadWorkspace(workspace.id)
      }
    } catch (err) {
      console.error('Failed to delete selection:', err)
    }
  }, [activeTerminalNodeId, hydrateWorkspace, loadWorkspace, request, selectedEdgeId, selectedNodeId, terminalManager, terminalNodes, workspace])

  const handleDeleteTerminalNode = useCallback(
    async (terminalNodeId: string) => {
      if (!workspace) return

      try {
        const response = await request(MsgType.TERMINAL_NODE_DELETE, {
          workspaceId: workspace.id,
          terminalNodeId,
        })
        if (response.type === MsgType.ERROR) {
          throw new Error(
            typeof response.payload === 'object' && response.payload !== null
              ? String((response.payload as { message?: unknown }).message ?? 'Failed to delete terminal')
              : 'Failed to delete terminal',
          )
        }

        attachedTerminalKeysRef.current.delete(terminalNodeId)
        terminalManager.disposeRuntime(terminalNodeId)

        const payloadGraph = response.payload as { graph?: WorkspaceGraphPayload }
        if (payloadGraph.graph) {
          hydrateWorkspace(payloadGraph.graph)
        } else {
          await loadWorkspace(workspace.id)
        }
      } catch (err) {
        console.error('Failed to delete terminal:', err)
      }
    },
    [hydrateWorkspace, loadWorkspace, request, terminalManager, workspace],
  )

  const handleRenameSession = useCallback(
    async (sessionIdToRename: string, name: string) => {
      const trimmedName = name.trim()
      if (!trimmedName) return

      try {
        const response = await request(MsgType.SESSION_RENAME, {
          sessionId: sessionIdToRename,
          name: trimmedName,
        })
        if (response.type === MsgType.ERROR) {
          throw new Error(
            typeof response.payload === 'object' && response.payload !== null
              ? String((response.payload as { message?: unknown }).message ?? 'Failed to rename session')
              : 'Failed to rename session',
          )
        }

        await refreshSessions()
        const payloadGraph = response.payload as { graph?: WorkspaceGraphPayload }
        if (payloadGraph.graph) {
          hydrateWorkspace(payloadGraph.graph)
        } else if (workspace) {
          await loadWorkspace(workspace.id)
        }
      } catch (err) {
        console.error('Failed to rename session:', err)
      }
    },
    [hydrateWorkspace, loadWorkspace, refreshSessions, request, workspace],
  )

  const handleRenameWorkspace = useCallback(
    async (workspaceId: string, name: string) => {
      const trimmedName = name.trim()
      if (!trimmedName) return

      try {
        const response = await request(MsgType.WORKSPACE_RENAME, {
          workspaceId,
          name: trimmedName,
        })
        if (response.type === MsgType.ERROR) {
          throw new Error(
            typeof response.payload === 'object' && response.payload !== null
              ? String((response.payload as { message?: unknown }).message ?? 'Failed to rename workspace')
              : 'Failed to rename workspace',
          )
        }

        await refreshSessions()
        const payloadGraph = response.payload as { graph?: WorkspaceGraphPayload }
        if (payloadGraph.graph) {
          hydrateWorkspace(payloadGraph.graph)
        } else if (workspace?.id === workspaceId) {
          await loadWorkspace(workspaceId)
        }
      } catch (err) {
        console.error('Failed to rename workspace:', err)
      }
    },
    [hydrateWorkspace, loadWorkspace, refreshSessions, request, workspace?.id],
  )

  const handleDeleteWorkspace = useCallback(
    async (workspaceId: string) => {
      try {
        const nextWorkspaceId = sessions.find((session) => session.workspaceId !== workspaceId)?.workspaceId
          ?? workspaceLinks.find((link) => link.targetWorkspaceId !== workspaceId)?.targetWorkspaceId
          ?? null

        const response = await request(MsgType.WORKSPACE_DELETE, { workspaceId })
        if (response.type === MsgType.ERROR) {
          throw new Error(
            typeof response.payload === 'object' && response.payload !== null
              ? String((response.payload as { message?: unknown }).message ?? 'Failed to delete workspace')
              : 'Failed to delete workspace',
          )
        }

        const refreshedSessions = await refreshSessions()
        const fallbackWorkspaceId = nextWorkspaceId
          ?? refreshedSessions.find((session) => session.workspaceId !== workspaceId)?.workspaceId
          ?? null

        if (fallbackWorkspaceId) {
          await loadWorkspace(fallbackWorkspaceId)
        } else {
          await createSession()
        }
      } catch (err) {
        console.error('Failed to delete workspace:', err)
      }
    },
    [createSession, loadWorkspace, refreshSessions, request, sessions, workspaceLinks],
  )

  const handleResumeTerminalNode = useCallback(
    async (terminalNodeId: string) => {
      if (!workspace) return
      try {
        const response = await request(MsgType.TERMINAL_NODE_RESUME, {
          workspaceId: workspace.id,
          terminalNodeId,
          cols: 80,
          rows: 24,
        })
        if (response.type === MsgType.ERROR) {
          throw new Error(
            typeof response.payload === 'object' && response.payload !== null
              ? String((response.payload as { message?: unknown }).message ?? 'Failed to resume terminal')
              : 'Failed to resume terminal',
          )
        }
        const payload = response.payload as { session?: { id?: string; workspaceId?: string; terminalNodeId?: string | null }; graph?: WorkspaceGraphPayload }
        await refreshSessions()
        if (payload.graph) {
          hydrateWorkspace(payload.graph)
        } else {
          await loadWorkspace(workspace.id)
        }
        if (payload.session?.id) {
          setSessionId(payload.session.id)
          sessionIdRef.current = payload.session.id
        }
        if (payload.session?.terminalNodeId) {
          attachedTerminalKeysRef.current.delete(payload.session.terminalNodeId)
        }
      } catch (err) {
        console.error('Failed to resume terminal:', err)
      }
    },
    [hydrateWorkspace, loadWorkspace, refreshSessions, request, workspace],
  )

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null
      if (!element) return false
      if (element.isContentEditable) return true
      if (element.closest('input, textarea, select, [contenteditable="true"]')) return true
      if (element.classList.contains('xterm-helper-textarea') || element.closest('.xterm')) return true
      return false
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete') return
      if (isEditableTarget(event.target)) return
      if (!selectedNodeId && !selectedEdgeId) return
      event.preventDefault()
      void handleDeleteSelection()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleDeleteSelection, selectedEdgeId, selectedNodeId])

  const toolbar = (
    <div
      className="flex items-center gap-3 border-b px-3 py-3 backdrop-blur-sm md:px-5"
      style={{
        backgroundColor: 'var(--panel-elevated)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Hamburger – mobile only */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--panel-muted)] md:hidden"
        aria-label="Open sidebar"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <div className="flex items-center gap-6 self-stretch">
        <ViewToggle />
      </div>
      <div className="min-w-0" />
    </div>
  )

  return (
    <div className="flex h-full">
      {/* Backdrop – closes drawer when tapping outside on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar – always visible on md+, slide-over drawer on mobile */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transition-transform duration-300 md:static md:translate-x-0 md:transition-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar
          sessions={sessions}
          activeSessionId={sessionId}
          workspace={workspace}
          workspaceLinks={workspaceLinks}
          onSelectSession={(id) => { handleSelectSession(id); setSidebarOpen(false) }}
          onDeleteSession={handleDeleteSession}
          onNewSession={handleCreateSessionInWorkspace}
          onNewTerminal={createSession}
          onSelectWorkspace={(id) => { handleSelectWorkspace(id); setSidebarOpen(false) }}
          onRenameWorkspace={handleRenameWorkspace}
          onDeleteWorkspace={handleDeleteWorkspace}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      <div className="flex-1 overflow-hidden">
        <AppShell
          toolbar={toolbar}
          top={
            viewMode === 'graph' ? (
              <GraphView
                onCreateWorkspaceBranch={handleCreateWorkspaceBranch}
                onCreateChildTerminal={handleCreateChildTerminal}
                onCreateTerminalLink={handleCreateTerminalLink}
                onMoveTerminalNode={handleMoveTerminalNode}
                onResizeTerminalNode={handleResizeTerminalNode}
                onDeleteTerminalNode={handleDeleteTerminalNode}
                onRenameSession={handleRenameSession}
                onResumeTerminalNode={handleResumeTerminalNode}
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
              <TimelineView onBranchFromNode={handleBranchFromNode} />
            )
          }
        />
      </div>
    </div>
  )
}

export default App
