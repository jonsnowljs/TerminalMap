import { memo, useCallback } from 'react';
import type { GraphNode } from '@mindmap/shared';

interface TimelineEntryProps {
  node: GraphNode;
  isSelected: boolean;
  onClick: () => void;
  onBranch?: (nodeId: string) => void;
}

const typeStyles: Record<string, { label: string; bg: string; text: string; border: string }> = {
  command: { label: 'CMD', bg: 'var(--panel-bg)', text: 'var(--accent-command)', border: 'var(--border-subtle)' },
  output: { label: 'OUT', bg: 'var(--accent-output-soft)', text: 'var(--accent-output)', border: '#cfe0fa' },
  error: { label: 'ERR', bg: 'var(--accent-error-soft)', text: 'var(--accent-error)', border: '#ebcaca' },
  note: { label: 'NOTE', bg: 'var(--accent-note-soft)', text: 'var(--accent-note)', border: '#eadfb7' },
  exploration: { label: 'EXPLORE', bg: 'var(--accent-explore-soft)', text: 'var(--accent-explore)', border: '#cfe2d4' },
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
      className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors hover:opacity-95"
      style={{
        backgroundColor: style.bg,
        borderColor: style.border,
        boxShadow: isSelected ? '0 0 0 1px var(--accent-command)' : undefined,
      }}
    >
      {/* Type badge */}
      <span className="mt-0.5 w-10 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider" style={{ color: style.text }}>
        {style.label}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="truncate font-mono text-xs text-[var(--text-strong)]">{preview || '(empty)'}</div>
        <div className="flex items-center gap-2 mt-0.5">
          {node.exitCode !== null && node.exitCode !== undefined && (
            <span
              className={`text-[10px] px-1 rounded ${
                node.exitCode === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}
            >
              exit {node.exitCode}
            </span>
          )}
          {node.durationMs !== null && node.durationMs !== undefined && (
            <span className="text-[10px] text-[var(--text-faint)]">{node.durationMs}ms</span>
          )}
          <span className="ml-auto text-[10px] text-[var(--text-faint)]">{node.branchId.slice(0, 6)}</span>
        </div>
      </div>
    </div>
  );
});

TimelineEntry.displayName = 'TimelineEntry';
export default TimelineEntry;
