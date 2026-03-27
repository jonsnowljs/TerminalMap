import { useGraphStore } from '../../store/graphStore.js';
import TimelineEntry from './TimelineEntry.js';

interface TimelineViewProps {
  onBranchFromNode?: (nodeId: string) => void;
}

export default function TimelineView({ onBranchFromNode }: TimelineViewProps) {
  const nodes = useGraphStore((s) => s.nodes);
  const selectNode = useGraphStore((s) => s.selectNode);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);

  // Sort by the original data's seq
  const sorted = [...nodes].sort((a, b) => {
    const seqA = a.data?.graphNode?.seq ?? 0;
    const seqB = b.data?.graphNode?.seq ?? 0;
    return seqA - seqB;
  });

  return (
    <div className="h-full overflow-y-auto bg-[var(--panel-bg)] p-3">
      {sorted.length === 0 && (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">
          No terminal activity yet. Activate a terminal node to start building this mindmap.
        </div>
      )}
      <div className="space-y-1">
        {sorted.map((flowNode) => (
          <TimelineEntry
            key={flowNode.id}
            node={flowNode.data.graphNode}
            isSelected={flowNode.id === selectedNodeId}
            onClick={() => selectNode(flowNode.id)}
            onBranch={onBranchFromNode}
          />
        ))}
      </div>
    </div>
  );
}
