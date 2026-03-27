import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, Background, Controls, MiniMap, Connection, ConnectionMode, type FinalConnectionState, type ReactFlowInstance, useNodesState, useEdgesState, BackgroundVariant } from '@xyflow/react'
import type { Node as FlowNode } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { WorkspaceTerminalNode } from '@mindmap/shared'
import { useGraphStore } from '../../store/graphStore.js'
import { buildNodeToTerminalEdges, buildTerminalLinkEdges } from '../../lib/terminalConnections.js'
import { isCanvasBranchDropTarget } from '../../lib/terminalBranchDrop.js'
import TerminalNode from './TerminalNode.js'
import { shouldFitWorkspaceCanvas } from '../../lib/workspaceViewport.js'

type TerminalFlowNodeData = WorkspaceTerminalNode & Record<string, unknown>
type TerminalFlowNode = FlowNode<TerminalFlowNodeData, 'terminal'>

const nodeTypes = {
  terminal: TerminalNode,
}

interface GraphViewProps {
  onCreateWorkspaceBranch?: (nodeId: string, creationMode: 'clone_live_terminal' | 'new_from_node_context') => void
  onCreateChildTerminal?: (nodeId: string) => void
  onCreateTerminalLink?: (sourceTerminalNodeId: string, targetTerminalNodeId?: string, position?: { x: number; y: number }) => void
  onMoveTerminalNode?: (terminalNodeId: string, position: { x: number; y: number }) => void
  onResizeTerminalNode?: (terminalNodeId: string, size: { width: number; height: number }) => void
  onDeleteTerminalNode?: (terminalNodeId: string) => void
  onRenameSession?: (sessionId: string, name: string) => void
  onResumeTerminalNode?: (terminalNodeId: string) => void
  centerOnTerminalNodeId?: string | null
  onTerminalNodeCentered?: (terminalNodeId: string) => void
  focusMode?: 'center' | 'session'
}

export default function GraphView({
  onCreateWorkspaceBranch,
  onCreateChildTerminal,
  onCreateTerminalLink,
  onMoveTerminalNode,
  onResizeTerminalNode,
  onDeleteTerminalNode,
  onRenameSession,
  onResumeTerminalNode,
  centerOnTerminalNodeId,
  onTerminalNodeCentered,
  focusMode = 'center',
}: GraphViewProps) {
  const storeTerminalNodes = useGraphStore((s) => s.terminalNodes)
  const storeTerminalLinks = useGraphStore((s) => s.terminalLinks)
  const workspace = useGraphStore((s) => s.workspace)
  const selectNode = useGraphStore((s) => s.selectNode)
  const selectEdge = useGraphStore((s) => s.selectEdge)
  const setActiveTerminalNode = useGraphStore((s) => s.setActiveTerminalNode)

  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)
  const [pendingConnection, setPendingConnection] = useState<{ sourceNodeId: string | null } | null>(null)
  const lastFittedWorkspaceIdRef = useRef<string | null>(null)
  const lastFittedNodeCountRef = useRef<number>(-1)
  const terminalNodes = useMemo(
    () =>
      storeTerminalNodes.map<TerminalFlowNode>((node) => ({
        id: node.terminalNodeId,
        type: 'terminal',
        position: node.position,
        data: {
          ...(node as TerminalFlowNodeData),
          onResizeTerminalNode,
          onMoveTerminalNode,
          onDeleteTerminalNode,
          onCreateTerminalBranch: (sourceTerminalNodeId: string, position?: { x: number; y: number }) => {
            onCreateTerminalLink?.(sourceTerminalNodeId, undefined, position)
          },
          onRenameSession,
          onResumeTerminalNode,
        },
      })),
    [onCreateTerminalLink, onDeleteTerminalNode, onMoveTerminalNode, onRenameSession, onResizeTerminalNode, onResumeTerminalNode, storeTerminalNodes],
  )
  const nodeToTerminalEdges = useMemo(() => buildNodeToTerminalEdges(storeTerminalNodes), [storeTerminalNodes])
  const terminalLinkEdges = useMemo(() => buildTerminalLinkEdges(storeTerminalLinks), [storeTerminalLinks])

  const [nodes, setNodes, onNodesChange] = useNodesState<TerminalFlowNode>(terminalNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState([...nodeToTerminalEdges, ...terminalLinkEdges])

  useEffect(() => {
    setNodes(terminalNodes)
  }, [setNodes, terminalNodes])

  useEffect(() => {
    setEdges([...nodeToTerminalEdges, ...terminalLinkEdges])
  }, [nodeToTerminalEdges, setEdges, terminalLinkEdges])

  useEffect(() => {
    if (!reactFlowInstance || !shouldFitWorkspaceCanvas(workspace?.id, terminalNodes.length, lastFittedWorkspaceIdRef.current, lastFittedNodeCountRef.current)) {
      return
    }

    reactFlowInstance.fitView({ padding: 0.3, duration: 0 })
    lastFittedWorkspaceIdRef.current = workspace?.id ?? null
    lastFittedNodeCountRef.current = terminalNodes.length
  }, [reactFlowInstance, terminalNodes.length, workspace?.id])

  useEffect(() => {
    if (!reactFlowInstance || !centerOnTerminalNodeId) {
      return
    }

    const targetNode = storeTerminalNodes.find((node) => node.terminalNodeId === centerOnTerminalNodeId)
    if (!targetNode) {
      return
    }

    const width = targetNode.size?.width ?? 960
    const height = targetNode.size?.height ?? 540
    const centerX = targetNode.position.x + width / 2
    const centerY = targetNode.position.y + height / 2

    if (focusMode === 'session') {
      const viewportElement = document.querySelector('.react-flow__viewport')?.parentElement
      const viewportWidth = viewportElement?.clientWidth ?? window.innerWidth
      const viewportHeight = viewportElement?.clientHeight ?? window.innerHeight
      const desiredZoom = Math.max(0.2, Math.min(1.1, Math.min((viewportWidth * 0.5) / width, (viewportHeight * 0.5) / height)))
      reactFlowInstance.setViewport(
        {
          x: viewportWidth / 2 - centerX * desiredZoom,
          y: viewportHeight / 2 - centerY * desiredZoom,
          zoom: desiredZoom,
        },
        { duration: 280 },
      )
    } else {
      reactFlowInstance.setCenter(centerX, centerY, { duration: 280 })
    }
    onTerminalNodeCentered?.(centerOnTerminalNodeId)
  }, [centerOnTerminalNodeId, focusMode, onTerminalNodeCentered, reactFlowInstance, storeTerminalNodes])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: FlowNode) => {
      selectNode(node.id)
      if (node.type === 'terminal') {
        setActiveTerminalNode(node.id)
      }
    },
    [selectNode, setActiveTerminalNode],
  )

  const onPaneClick = useCallback(() => {
    selectNode(null)
    selectEdge(null)
  }, [selectEdge, selectNode])

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: { id: string }) => {
      selectEdge(edge.id)
    },
    [selectEdge],
  )

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source) return
      const sourceNode = nodes.find((node) => node.id === connection.source)
      const targetNode = connection.target ? nodes.find((node) => node.id === connection.target) : undefined
      if (sourceNode?.type !== 'terminal') {
        return
      }
      if (targetNode?.type === 'terminal') {
        onCreateTerminalLink?.(connection.source, connection.target ?? undefined)
      }
    },
    [nodes, onCreateTerminalLink],
  )

  const handleConnectStart = useCallback((_event: unknown, params: { nodeId?: string | null }) => {
    setPendingConnection({ sourceNodeId: params.nodeId ?? null })
  }, [])

  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      const sourceNodeId = connectionState.fromHandle?.nodeId ?? pendingConnection?.sourceNodeId ?? null

      if (!sourceNodeId || !reactFlowInstance) {
        setPendingConnection(null)
        return
      }
      if (connectionState.toHandle) {
        setPendingConnection(null)
        return
      }

      const sourceNode = nodes.find((node) => node.id === sourceNodeId)
      if (sourceNode?.type !== 'terminal') {
        setPendingConnection(null)
        return
      }

      const target = event.target as HTMLElement | null
      if (!isCanvasBranchDropTarget(target)) {
        setPendingConnection(null)
        return
      }

      const point =
        'changedTouches' in event && event.changedTouches.length > 0
          ? { x: event.changedTouches[0]!.clientX, y: event.changedTouches[0]!.clientY }
          : 'clientX' in event
            ? { x: event.clientX, y: event.clientY }
            : null
      if (!point) {
        setPendingConnection(null)
        return
      }

      const flowPosition = reactFlowInstance.screenToFlowPosition(point)
      onCreateTerminalLink?.(sourceNodeId, undefined, flowPosition)
      setPendingConnection(null)
    },
    [nodes, onCreateTerminalLink, pendingConnection, reactFlowInstance],
  )

  const handleNodeDragStop = useCallback(
    (_: React.MouseEvent, node: FlowNode) => {
      if (node.type !== 'terminal') {
        return
      }
      onMoveTerminalNode?.(node.id, node.position)
    },
    [onMoveTerminalNode],
  )

  return (
    <div className="relative h-full w-full bg-[var(--panel-bg)]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={setReactFlowInstance}
        onNodesChange={onNodesChange as never}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={onPaneClick}
        onConnect={handleConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          style: { stroke: '#b8b0a4', strokeWidth: 2 },
          type: 'smoothstep',
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#d8d1c6" />
        <Controls className="!border-[var(--border-subtle)] !bg-white !shadow-lg [&>button]:!border-[var(--border-subtle)] [&>button]:!bg-white [&>button]:!text-[var(--text-muted)] [&>button:hover]:!bg-[var(--panel-muted)]" />
        <MiniMap className="!border-[var(--border-subtle)] !bg-white" nodeColor="#7e95ab" maskColor="rgba(221, 215, 204, 0.45)" />
      </ReactFlow>
    </div>
  )
}
