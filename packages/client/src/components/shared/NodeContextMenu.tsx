import { useCallback } from 'react';

interface NodeContextMenuProps {
  x: number;
  y: number;
  nodeId: string;
  onBranch: (nodeId: string) => void;
  onClose: () => void;
}

export default function NodeContextMenu({ x, y, nodeId, onBranch, onClose }: NodeContextMenuProps) {
  const handleBranch = useCallback(() => {
    onBranch(nodeId);
    onClose();
  }, [nodeId, onBranch, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* Menu */}
      <div
        className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[180px]"
        style={{ left: x, top: y }}
      >
        <button
          onClick={handleBranch}
          className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-purple-900/50 hover:text-purple-300 transition-colors"
        >
          Branch from here
        </button>
      </div>
    </>
  );
}
