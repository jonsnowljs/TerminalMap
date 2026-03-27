import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { MindmapNodeData } from '../../store/graphStore.js';

const ErrorNode = memo(({ data, selected }: NodeProps<MindmapNodeData>) => {
  const node = data.graphNode;
  const preview = node.content.split('\n').slice(0, 3).join('\n');

  return (
    <div
      className={`px-3 py-2 rounded-lg border-2 min-w-[200px] max-w-[320px] ${
        selected ? 'border-red-500 shadow-lg shadow-red-500/20' : 'border-red-800'
      } bg-red-950/30`}
    >
      <Handle type="target" position={Position.Top} className="!bg-red-500 !w-2 !h-2" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">error</span>
        {node.exitCode !== null && (
          <span className="text-[10px] px-1.5 rounded bg-red-900 text-red-300">exit {node.exitCode}</span>
        )}
      </div>
      <pre className="font-mono text-xs text-red-300/70 whitespace-pre-wrap truncate max-h-[60px] overflow-hidden">
        {preview}
      </pre>
      <Handle type="source" position={Position.Bottom} className="!bg-red-500 !w-2 !h-2" />
    </div>
  );
});

ErrorNode.displayName = 'ErrorNode';
export default ErrorNode;
