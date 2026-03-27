import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { MindmapNodeData } from '../../store/graphStore.js';

const NoteNode = memo(({ data, selected }: NodeProps<MindmapNodeData>) => {
  return (
    <div
      className={`px-3 py-2 rounded-lg border min-w-[160px] max-w-[280px] ${
        selected ? 'border-yellow-500 shadow-lg shadow-yellow-500/20' : 'border-yellow-800/50'
      } bg-yellow-950/20`}
    >
      <Handle type="target" position={Position.Top} className="!bg-yellow-500 !w-2 !h-2" />
      <div className="text-[10px] font-semibold uppercase tracking-wider text-yellow-500 mb-1">note</div>
      <div className="text-xs text-yellow-200/70">{data.graphNode.content}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-yellow-500 !w-2 !h-2" />
    </div>
  );
});

NoteNode.displayName = 'NoteNode';
export default NoteNode;
