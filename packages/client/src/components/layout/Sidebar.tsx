import type { Branch } from '@mindmap/shared';

interface SessionInfo {
  id: string;
  cwd: string;
  status: string;
}

interface SidebarProps {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  branches: Branch[];
  activeBranchId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onSwitchBranch: (branchId: string) => void;
}

export default function Sidebar({
  sessions,
  activeSessionId,
  branches,
  activeBranchId,
  onSelectSession,
  onNewSession,
  onSwitchBranch,
}: SidebarProps) {
  return (
    <div className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden">
      {/* Sessions */}
      <div className="px-3 py-3 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Sessions</h2>
        <button
          onClick={onNewSession}
          className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
          title="New session"
        >
          + New
        </button>
      </div>
      <div className="overflow-y-auto py-1 max-h-[30%]">
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelectSession(s.id)}
            className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
              s.id === activeSessionId
                ? 'bg-purple-900/30 text-purple-300 border-l-2 border-purple-500'
                : 'text-gray-400 hover:bg-gray-800 border-l-2 border-transparent'
            }`}
          >
            <div className="font-mono truncate">{s.id.slice(0, 10)}</div>
            <div className="text-[10px] text-gray-600 truncate">{s.cwd.split('/').pop()}</div>
          </button>
        ))}
      </div>

      {/* Branches */}
      <div className="px-3 py-3 border-t border-b border-gray-800">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Branches</h2>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {branches.length === 0 && (
          <div className="px-3 py-2 text-xs text-gray-600">No branches</div>
        )}
        {branches.map((branch) => (
          <button
            key={branch.id}
            onClick={() => onSwitchBranch(branch.id)}
            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
              branch.id === activeBranchId
                ? 'bg-purple-900/30 text-purple-300 border-l-2 border-purple-500'
                : 'text-gray-400 hover:bg-gray-800 border-l-2 border-transparent'
            }`}
          >
            <div className="font-mono text-xs truncate">{branch.name || branch.id.slice(0, 8)}</div>
            {branch.parentBranchId && (
              <div className="text-[10px] text-gray-600 mt-0.5">forked</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
