import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { MindmapNodeData } from '../../store/graphStore.js';

const CommandNode = memo(({ data, selected }: NodeProps<MindmapNodeData>) => {
  const node = data.graphNode;
  const hasError = node.exitCode !== null && node.exitCode !== 0;

  return (
    <div
      className={`px-3 py-2 rounded-lg border-2 min-w-[200px] max-w-[320px] ${
        selected ? 'border-purple-500 shadow-lg shadow-purple-500/20' : 'border-gray-700'
      } ${hasError ? 'bg-red-950/50' : 'bg-gray-900'}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-purple-500 !w-2 !h-2" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400">cmd</span>
        {node.exitCode !== null && (
          <span
            className={`text-[10px] px-1.5 rounded ${
              node.exitCode === 0 ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
            }`}
          >
            {node.exitCode}
          </span>
        )}
        {node.durationMs !== null && (
          <span className="text-[10px] text-gray-500 ml-auto">{node.durationMs}ms</span>
        )}
      </div>
      <div className="font-mono text-sm text-gray-200 truncate">{node.content}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-purple-500 !w-2 !h-2" />
    </div>
  );
});

CommandNode.displayName = 'CommandNode';
export default CommandNode;
