import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { MindmapFlowNode } from '../../store/graphStore.js'

const CommandNode = memo(({ data, selected }: NodeProps<MindmapFlowNode>) => {
  const node = data.graphNode
  const hasError = node.exitCode !== null && node.exitCode !== 0

  return (
    <div
      className={`min-w-[200px] max-w-[320px] rounded-xl border px-3 py-2 ${selected ? 'shadow-lg' : ''}`}
      style={{
        borderColor: selected ? 'var(--accent-command)' : 'var(--border-subtle)',
        backgroundColor: hasError ? 'var(--accent-error-soft)' : 'var(--panel-bg)',
        boxShadow: selected ? '0 10px 30px rgba(85, 111, 138, 0.16)' : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-[var(--accent-command)]" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-command)]">cmd</span>
        {node.exitCode !== null && <span className={`rounded px-1.5 text-[10px] ${node.exitCode === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{node.exitCode}</span>}
        {node.durationMs !== null && <span className="ml-auto text-[10px] text-[var(--text-faint)]">{node.durationMs}ms</span>}
      </div>
      <div className="truncate font-mono text-sm text-[var(--text-strong)]">{node.content}</div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-[var(--accent-command)]" />
    </div>
  )
})

CommandNode.displayName = 'CommandNode'
export default CommandNode
