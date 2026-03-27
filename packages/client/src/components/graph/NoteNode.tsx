import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { MindmapFlowNode } from '../../store/graphStore.js';

const NoteNode = memo(({ data, selected }: NodeProps<MindmapFlowNode>) => {
  return (
    <div
      className="min-w-[160px] max-w-[280px] rounded-xl border px-3 py-2"
      style={{
        borderColor: selected ? 'var(--accent-note)' : '#e7d8aa',
        backgroundColor: 'var(--accent-note-soft)',
        boxShadow: selected ? '0 10px 30px rgba(184, 137, 41, 0.14)' : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-[var(--accent-note)]" />
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-note)]">note</div>
      <div className="text-xs text-amber-900/80">{data.graphNode.content}</div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-[var(--accent-note)]" />
    </div>
  );
});

NoteNode.displayName = 'NoteNode';
export default NoteNode;
