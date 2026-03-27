import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { MindmapFlowNode } from '../../store/graphStore.js';

const ErrorNode = memo(({ data, selected }: NodeProps<MindmapFlowNode>) => {
  const node = data.graphNode;
  const preview = node.content.split('\n').slice(0, 3).join('\n');

  return (
    <div
      className="min-w-[200px] max-w-[320px] rounded-xl border px-3 py-2"
      style={{
        borderColor: selected ? 'var(--accent-error)' : '#e7c4c4',
        backgroundColor: 'var(--accent-error-soft)',
        boxShadow: selected ? '0 10px 30px rgba(197, 83, 83, 0.14)' : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-[var(--accent-error)]" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-error)]">error</span>
        {node.exitCode !== null && (
          <span className="rounded bg-rose-100 px-1.5 text-[10px] text-rose-700">exit {node.exitCode}</span>
        )}
      </div>
      <pre className="max-h-[60px] overflow-hidden truncate whitespace-pre-wrap font-mono text-xs text-rose-800/80">
        {preview}
      </pre>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-[var(--accent-error)]" />
    </div>
  );
});

ErrorNode.displayName = 'ErrorNode';
export default ErrorNode;
