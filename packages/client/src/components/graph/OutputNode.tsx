import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { MindmapFlowNode } from '../../store/graphStore.js';

const OutputNode = memo(({ data, selected }: NodeProps<MindmapFlowNode>) => {
  const node = data.graphNode;
  const lines = node.content.split('\n').filter(Boolean);
  const preview = lines.slice(0, 3).join('\n');
  const hasMore = lines.length > 3;

  return (
    <div
      className="min-w-[200px] max-w-[320px] rounded-xl border px-3 py-2"
      style={{
        borderColor: selected ? 'var(--accent-output)' : 'var(--border-subtle)',
        backgroundColor: 'var(--accent-output-soft)',
        boxShadow: selected ? '0 10px 30px rgba(47, 109, 179, 0.14)' : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-[var(--accent-output)]" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-output)]">output</span>
        <span className="text-[10px] text-[var(--text-faint)]">{lines.length} lines</span>
      </div>
      <pre className="max-h-[60px] overflow-hidden truncate whitespace-pre-wrap font-mono text-xs text-[var(--text-muted)]">
        {preview}
      </pre>
      {hasMore && <div className="mt-1 text-[10px] text-[var(--text-faint)]">+{lines.length - 3} more lines</div>}
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-[var(--accent-output)]" />
    </div>
  );
});

OutputNode.displayName = 'OutputNode';
export default OutputNode;
