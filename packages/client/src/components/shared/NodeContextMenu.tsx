import type { PendingBranchAction } from '../../store/graphStore.js';
import { useCallback } from 'react';

interface NodeContextMenuProps {
  x: number;
  y: number;
  nodeId: string;
  onCreateWorkspaceBranch: (nodeId: string, creationMode: PendingBranchAction['creationMode']) => void;
  onCreateChildTerminal?: (nodeId: string) => void;
  onClose: () => void;
}

export default function NodeContextMenu({
  x,
  y,
  nodeId,
  onCreateWorkspaceBranch,
  onCreateChildTerminal,
  onClose,
}: NodeContextMenuProps) {
  const handleBranch = useCallback((creationMode: PendingBranchAction['creationMode']) => {
    onCreateWorkspaceBranch(nodeId, creationMode);
    onClose();
  }, [nodeId, onCreateWorkspaceBranch, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* Menu */}
      <div
        className="fixed z-50 min-w-[180px] rounded-xl border py-1 shadow-xl"
        style={{
          left: x,
          top: y,
          backgroundColor: 'var(--panel-bg)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <button
          onClick={() => {
            onCreateChildTerminal?.(nodeId);
            onClose();
          }}
          className="w-full px-4 py-2 text-left text-sm text-[var(--text-strong)] transition-colors hover:bg-[var(--accent-command-soft)] hover:text-[var(--accent-command)]"
        >
          Explore This Option in Child Terminal
        </button>
        <button
          onClick={() => handleBranch('clone_live_terminal')}
          className="w-full px-4 py-2 text-left text-sm text-[var(--text-strong)] transition-colors hover:bg-[var(--accent-command-soft)] hover:text-[var(--accent-command)]"
        >
          Create Child Mindmap from Live Terminal
        </button>
        <button
          onClick={() => handleBranch('new_from_node_context')}
          className="w-full px-4 py-2 text-left text-sm text-[var(--text-strong)] transition-colors hover:bg-[var(--accent-command-soft)] hover:text-[var(--accent-command)]"
        >
          Create Child Mindmap from This Node
        </button>
      </div>
    </>
  );
}
