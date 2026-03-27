import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { MindmapNodeData } from '../../store/graphStore.js';

const OutputNode = memo(({ data, selected }: NodeProps<MindmapNodeData>) => {
  const node = data.graphNode;
  const lines = node.content.split('\n').filter(Boolean);
  const preview = lines.slice(0, 3).join('\n');
  const hasMore = lines.length > 3;

  return (
    <div
      className={`px-3 py-2 rounded-lg border min-w-[200px] max-w-[320px] ${
        selected ? 'border-blue-500 shadow-lg shadow-blue-500/20' : 'border-gray-800'
      } bg-gray-950`}
    >
      <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-2 !h-2" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">output</span>
        <span className="text-[10px] text-gray-600">{lines.length} lines</span>
      </div>
      <pre className="font-mono text-xs text-gray-400 whitespace-pre-wrap truncate max-h-[60px] overflow-hidden">
        {preview}
      </pre>
      {hasMore && <div className="text-[10px] text-gray-600 mt-1">+{lines.length - 3} more lines</div>}
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-2 !h-2" />
    </div>
  );
});

OutputNode.displayName = 'OutputNode';
export default OutputNode;
