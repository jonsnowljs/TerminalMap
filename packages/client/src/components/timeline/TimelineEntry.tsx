import { memo, useCallback } from 'react';
import type { GraphNode } from '@mindmap/shared';

interface TimelineEntryProps {
  node: GraphNode;
  isSelected: boolean;
  onClick: () => void;
  onBranch?: (nodeId: string) => void;
}

const typeStyles: Record<string, { label: string; bg: string; text: string; border: string }> = {
  command: { label: 'CMD', bg: 'bg-gray-900', text: 'text-purple-400', border: 'border-purple-800' },
  output: { label: 'OUT', bg: 'bg-gray-950', text: 'text-blue-400', border: 'border-gray-800' },
  error: { label: 'ERR', bg: 'bg-red-950/30', text: 'text-red-400', border: 'border-red-800' },
  note: { label: 'NOTE', bg: 'bg-yellow-950/20', text: 'text-yellow-400', border: 'border-yellow-800/50' },
  exploration: { label: 'EXPLORE', bg: 'bg-green-950/20', text: 'text-green-400', border: 'border-green-800' },
};

const TimelineEntry = memo(({ node, isSelected, onClick, onBranch }: TimelineEntryProps) => {
  const style = typeStyles[node.type] || typeStyles.command;
  const preview = node.content.split('\n').slice(0, 2).join(' ').slice(0, 120);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onBranch?.(node.id);
    },
    [node.id, onBranch],
  );

  return (
    <div
      onClick={onClick}
      onContextMenu={handleContextMenu}
      className={`flex items-start gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${style.bg} ${style.border} ${
        isSelected ? 'ring-1 ring-purple-500' : 'hover:bg-gray-800/50'
      }`}
    >
      {/* Type badge */}
      <span className={`text-[10px] font-semibold uppercase tracking-wider ${style.text} mt-0.5 w-10 flex-shrink-0`}>
        {style.label}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs text-gray-300 truncate">{preview || '(empty)'}</div>
        <div className="flex items-center gap-2 mt-0.5">
          {node.exitCode !== null && node.exitCode !== undefined && (
            <span
              className={`text-[10px] px-1 rounded ${
                node.exitCode === 0 ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
              }`}
            >
              exit {node.exitCode}
            </span>
          )}
          {node.durationMs !== null && node.durationMs !== undefined && (
            <span className="text-[10px] text-gray-600">{node.durationMs}ms</span>
          )}
          <span className="text-[10px] text-gray-700 ml-auto">{node.branchId.slice(0, 6)}</span>
        </div>
      </div>
    </div>
  );
});

TimelineEntry.displayName = 'TimelineEntry';
export default TimelineEntry;
