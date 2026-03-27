import { useCallback, useEffect, useRef, useState } from 'react'
import { Handle, Position, type Node as FlowNode, type NodeProps } from '@xyflow/react'
import type { WorkspaceTerminalNode } from '@mindmap/shared'
import { useGraphStore } from '../../store/graphStore.js'
import { sanitizeTranscript, summarizeSnapshotLines } from '../../lib/terminalSnapshot.js'

type TerminalFlowNodeData = WorkspaceTerminalNode & {
  onResizeTerminalNode?: (terminalNodeId: string, size: { width: number; height: number }) => void
  onMoveTerminalNode?: (terminalNodeId: string, position: { x: number; y: number }) => void
  onDeleteTerminalNode?: (terminalNodeId: string) => void
  onCreateTerminalBranch?: (sourceTerminalNodeId: string, position?: { x: number; y: number }) => void
  onRenameSession?: (sessionId: string, name: string) => void
  onResumeTerminalNode?: (terminalNodeId: string) => void
} & Record<string, unknown>
type TerminalFlowNode = FlowNode<TerminalFlowNodeData, 'terminal'>

const MIN_WIDTH = 360
const MIN_HEIGHT = 320

export default function TerminalNode({ data, selected }: NodeProps<TerminalFlowNode>) {
  const setActiveTerminalNode = useGraphStore((state) => state.setActiveTerminalNode)
  const selectNode = useGraphStore((state) => state.selectNode)
  const updateTerminalSize = useGraphStore((state) => state.updateTerminalSize)
  const updateTerminalPosition = useGraphStore((state) => state.updateTerminalPosition)
  const isLive = data.sessionId !== null && data.status !== 'disconnected'
  const showResizeRails = selected || isLive
  const previewLines = data.snapshot?.previewLines ?? []
  const snapshotLines = data.scrollback ? sanitizeTranscript(data.scrollback, 400) : summarizeSnapshotLines(previewLines, 6)
  const currentWidth = data.size?.width ?? 960
  const currentHeight = data.size?.height ?? 540
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(data.title)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!isEditingTitle) {
      setDraftTitle(data.title)
    }
  }, [data.title, isEditingTitle])

  useEffect(() => {
    if (isEditingTitle) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditingTitle])

  const startResize = useCallback(
    (edge: 'top' | 'right' | 'bottom' | 'left', startClientX: number, startClientY: number) => {
      const startSize = { width: currentWidth, height: currentHeight }
      const startPosition = { ...data.position }

      const onPointerMove = (event: PointerEvent) => {
        const dx = event.clientX - startClientX
        const dy = event.clientY - startClientY

        let nextWidth = startSize.width
        let nextHeight = startSize.height
        let nextX = startPosition.x
        let nextY = startPosition.y

        if (edge === 'right') {
          nextWidth = Math.max(MIN_WIDTH, startSize.width + dx)
        } else if (edge === 'bottom') {
          nextHeight = Math.max(MIN_HEIGHT, startSize.height + dy)
        } else if (edge === 'left') {
          nextWidth = Math.max(MIN_WIDTH, startSize.width - dx)
          nextX = startPosition.x + (startSize.width - nextWidth)
        } else if (edge === 'top') {
          nextHeight = Math.max(MIN_HEIGHT, startSize.height - dy)
          nextY = startPosition.y + (startSize.height - nextHeight)
        }

        updateTerminalSize(data.terminalNodeId, { width: nextWidth, height: nextHeight })
        if (nextX !== startPosition.x || nextY !== startPosition.y) {
          updateTerminalPosition(data.terminalNodeId, { x: nextX, y: nextY })
        }
      }

      const onPointerUp = () => {
        const latestWidth = useGraphStore.getState().terminalNodes.find((node) => node.terminalNodeId === data.terminalNodeId)?.size.width ?? startSize.width
        const latestHeight = useGraphStore.getState().terminalNodes.find((node) => node.terminalNodeId === data.terminalNodeId)?.size.height ?? startSize.height
        const latestPosition = useGraphStore.getState().terminalNodes.find((node) => node.terminalNodeId === data.terminalNodeId)?.position ?? startPosition

        data.onResizeTerminalNode?.(data.terminalNodeId, { width: latestWidth, height: latestHeight })
        if (latestPosition.x !== startPosition.x || latestPosition.y !== startPosition.y) {
          data.onMoveTerminalNode?.(data.terminalNodeId, latestPosition)
        }

        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
    },
    [currentHeight, currentWidth, data, updateTerminalPosition, updateTerminalSize],
  )

  const commitRename = useCallback(() => {
    const trimmedTitle = draftTitle.trim()
    setIsEditingTitle(false)
    if (!data.sessionId || !trimmedTitle || trimmedTitle === data.title) {
      setDraftTitle(data.title)
      return
    }
    data.onRenameSession?.(data.sessionId, trimmedTitle)
  }, [data, draftTitle])

  const cancelRename = useCallback(() => {
    setDraftTitle(data.title)
    setIsEditingTitle(false)
  }, [data.title])

  const handleCreateBranch = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      data.onCreateTerminalBranch?.(data.terminalNodeId, {
        x: data.position.x + 120,
        y: data.position.y + 96,
      })
    },
    [data],
  )

  return (
    <div
      className={`relative h-full w-full rounded-2xl border shadow-lg transition-shadow ${selected ? 'shadow-[0_0_0_2px_var(--accent-command)]' : 'shadow-black/5'}`}
      style={{
        backgroundColor: 'var(--panel-bg)',
        borderColor: selected ? 'var(--accent-command)' : 'var(--border-subtle)',
        width: currentWidth,
        height: currentHeight,
        minWidth: MIN_WIDTH,
        minHeight: MIN_HEIGHT,
      }}
      onClick={() => {
        selectNode(data.terminalNodeId)
        setActiveTerminalNode(data.terminalNodeId)
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        selectNode(data.terminalNodeId)
      }}
    >
      {showResizeRails && (
        <>
          <div
            className="nodrag nopan absolute left-2 right-2 top-0 z-30 h-3 cursor-ns-resize"
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              startResize('top', event.clientX, event.clientY)
            }}
          >
            <div className="absolute left-1/2 top-0.5 h-1 w-16 -translate-x-1/2 rounded-full" style={{ backgroundColor: 'var(--accent-command)', opacity: 0.55 }} />
          </div>
          <div
            className="nodrag nopan absolute bottom-2 right-0 top-2 z-30 w-3 cursor-ew-resize"
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              startResize('right', event.clientX, event.clientY)
            }}
          >
            <div className="absolute right-0.5 top-1/2 h-16 w-1 -translate-y-1/2 rounded-full" style={{ backgroundColor: 'var(--accent-command)', opacity: 0.55 }} />
          </div>
          <div
            className="nodrag nopan absolute bottom-0 left-2 right-2 z-30 h-3 cursor-ns-resize"
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              startResize('bottom', event.clientX, event.clientY)
            }}
          >
            <div className="absolute bottom-0.5 left-1/2 h-1 w-16 -translate-x-1/2 rounded-full" style={{ backgroundColor: 'var(--accent-command)', opacity: 0.55 }} />
          </div>
          <div
            className="nodrag nopan absolute bottom-2 left-0 top-2 z-30 w-3 cursor-ew-resize"
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              startResize('left', event.clientX, event.clientY)
            }}
          >
            <div className="absolute left-0.5 top-1/2 h-16 w-1 -translate-y-1/2 rounded-full" style={{ backgroundColor: 'var(--accent-command)', opacity: 0.55 }} />
          </div>
        </>
      )}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-6 !w-6 !border-2 !border-white !bg-[var(--accent-command)] !shadow-md"
      />
      <header className="flex items-start justify-between gap-3 border-b px-3 py-2" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex items-center gap-1.5 pt-0.5">
            <button
              type="button"
              aria-label="Delete terminal"
              title="Delete terminal"
              className="nodrag nopan group relative flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#d04f45] bg-[#ff5f57] transition-transform hover:scale-105"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                data.onDeleteTerminalNode?.(data.terminalNodeId)
              }}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] leading-none text-[#7a1d17] opacity-0 transition-opacity group-hover:opacity-100"
                style={{ transform: 'translateY(-0.25px)' }}
              >
                ×
              </span>
            </button>
          </div>
          <div className="min-w-0">
            {isEditingTitle ? (
              <input
                ref={inputRef}
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                onBlur={commitRename}
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitRename()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelRename()
                  }
                }}
                className="nodrag nopan w-full rounded border px-1 py-0 text-sm font-semibold text-[var(--text-strong)] outline-none"
                style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'white' }}
                maxLength={120}
              />
            ) : (
              <button
                type="button"
                className="block max-w-full truncate text-left text-sm font-semibold text-[var(--text-strong)]"
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (data.sessionId) {
                    setIsEditingTitle(true)
                  }
                }}
                title={data.sessionId ? 'Double-click to rename session' : data.title}
              >
                {data.title}
              </button>
            )}
            <div className="truncate font-mono text-[10px] text-[var(--text-faint)]">{data.snapshot?.cwd ?? data.sourceNodeId ?? 'workspace terminal'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="nodrag nopan rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors hover:bg-[var(--accent-command-soft)]"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--accent-command)' }}
            onClick={handleCreateBranch}
            title="Create child terminal"
          >
            branch
          </button>
          {isLive ? (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: 'var(--accent-command-soft)',
                color: 'var(--accent-command)',
              }}
            >
              live
            </span>
          ) : (
            <button
              type="button"
              className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors hover:bg-[var(--panel-muted)]"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                data.onResumeTerminalNode?.(data.terminalNodeId)
              }}
            >
              resume
            </button>
          )}
        </div>
      </header>

      {isLive ? (
        <div
          data-terminal-container={data.terminalNodeId}
          className="nodrag nopan nowheel mx-3 mb-3 mt-3 overflow-hidden rounded-xl border"
          style={{
            backgroundColor: 'var(--terminal-bg)',
            borderColor: 'rgba(255,255,255,0.08)',
            height: Math.max((data.size?.height ?? 540) - 78, 180),
          }}
        />
      ) : (
        <pre
          className="nodrag nopan nowheel mx-3 mb-3 overflow-auto rounded-xl border px-3 py-2 text-[11px] leading-5 whitespace-pre-wrap"
          style={{
            backgroundColor: 'var(--terminal-bg)',
            borderColor: 'rgba(255,255,255,0.08)',
            color: 'var(--terminal-fg)',
            height: Math.max((data.size?.height ?? 540) - 78, 180),
          }}
        >
          {snapshotLines.length > 0 ? snapshotLines.join('\n') : 'No snapshot yet'}
        </pre>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-6 !w-6 !border-2 !border-white !bg-[var(--accent-command)] !shadow-md"
      />
    </div>
  )
}
