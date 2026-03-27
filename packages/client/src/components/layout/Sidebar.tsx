import { useEffect, useMemo, useRef, useState } from 'react';
import type { Workspace, WorkspaceLink } from '@mindmap/shared';

interface SessionInfo {
  id: string;
  name: string | null;
  cwd: string;
  status: string;
  workspaceId: string;
  workspaceName?: string | null;
}

interface SidebarProps {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  workspace: Workspace | null;
  workspaceLinks: WorkspaceLink[];
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onNewSession: (workspaceId: string) => void;
  onNewTerminal: () => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onRenameWorkspace: (workspaceId: string, name: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
}

interface WindowItem {
  id: string;
  label: string;
  isCurrent: boolean;
}

export default function Sidebar({
  sessions,
  activeSessionId,
  workspace,
  workspaceLinks,
  onSelectSession,
  onDeleteSession,
  onNewSession,
  onNewTerminal,
  onSelectWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
}: SidebarProps) {
  const windows = useMemo<WindowItem[]>(() => {
    const ids: string[] = [];
    if (workspace) {
      ids.push(workspace.id);
    }
    for (const link of workspaceLinks) {
      if (!ids.includes(link.targetWorkspaceId)) {
        ids.push(link.targetWorkspaceId);
      }
    }
    for (const session of sessions) {
      if (!ids.includes(session.workspaceId)) {
        ids.push(session.workspaceId);
      }
    }

    return ids.map((id, index) => ({
      id,
      label: sessions.find((session) => session.workspaceId === id)?.workspaceName || (workspace?.id === id && workspace.name ? workspace.name : `Window-${index + 1}`),
      isCurrent: workspace?.id === id,
    }));
  }, [sessions, workspace, workspaceLinks]);

  const [expandedWindowIds, setExpandedWindowIds] = useState<string[]>([]);
  const [editingWindowId, setEditingWindowId] = useState<string | null>(null);
  const [draftWindowName, setDraftWindowName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const windowInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const openWindowIds = expandedWindowIds.length > 0
    ? expandedWindowIds
    : windows.filter((windowItem) => windowItem.isCurrent).map((windowItem) => windowItem.id);

  const toggleWindow = (workspaceId: string) => {
    setExpandedWindowIds((current) => (
      current.includes(workspaceId)
        ? current.filter((id) => id !== workspaceId)
        : [...current, workspaceId]
    ));
  };

  useEffect(() => {
    if (editingWindowId) {
      windowInputRef.current?.focus();
      windowInputRef.current?.select();
    }
  }, [editingWindowId]);

  const commitWindowRename = (workspaceId: string, currentLabel: string) => {
    const trimmedName = draftWindowName.trim();
    setEditingWindowId(null);
    if (!trimmedName || trimmedName === currentLabel) {
      setDraftWindowName(currentLabel);
      return;
    }
    onRenameWorkspace(workspaceId, trimmedName);
  };

  const cancelWindowRename = (currentLabel: string) => {
    setDraftWindowName(currentLabel);
    setEditingWindowId(null);
  };

  return (
    <div
      className="flex w-64 flex-col overflow-hidden border-r"
      style={{ backgroundColor: 'var(--panel-muted)', borderColor: 'var(--border-subtle)' }}
    >
      <div
        className="flex items-center gap-3 border-b px-3 py-3"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <img src="/logo.svg" alt="TerminalMap logo" className="h-9 w-9 rounded-lg bg-white/80 p-1 shadow-sm" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--text-strong)]">TerminalMap</div>
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-faint)]">Workspace Navigator</div>
        </div>
      </div>

      <div
        className="flex items-center justify-between border-b px-3 py-3"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Windows</h2>
        <button
          onClick={onNewTerminal}
          className="flex h-7 w-7 items-center justify-center rounded-full border text-sm transition-colors hover:bg-white/80"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--accent-command)' }}
          title="Add new window"
        >
          +
        </button>
      </div>

      <div className="border-b px-3 py-3" style={{ borderColor: 'var(--border-subtle)' }}>
        <div
          className="flex items-center gap-2 rounded-xl border bg-white/85 px-3 py-2 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0 text-[var(--text-faint)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search windows or sessions"
            className="w-full bg-transparent text-sm text-[var(--text-strong)] outline-none placeholder:text-[var(--text-faint)]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="space-y-2">
          {windows.map((windowItem) => {
            const isExpanded = openWindowIds.includes(windowItem.id);
            const windowSessions = sessions.filter((session) => session.workspaceId === windowItem.id);
            const workspaceMatches = normalizedSearchQuery.length === 0
              || windowItem.label.toLowerCase().includes(normalizedSearchQuery);
            const matchingSessions = normalizedSearchQuery.length === 0
              ? windowSessions
              : windowSessions.filter((session) => {
                  const sessionName = session.name?.trim() || '';
                  return sessionName.toLowerCase().includes(normalizedSearchQuery);
                });

            if (normalizedSearchQuery.length > 0 && !workspaceMatches && matchingSessions.length === 0) {
              return null;
            }

            const visibleSessions = workspaceMatches ? windowSessions : matchingSessions;

            return (
              <div
                key={windowItem.id}
                className="overflow-hidden rounded-2xl border bg-white/75 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-center gap-2 px-3 py-3">
                  <button
                    type="button"
                    onClick={() => onSelectWorkspace(windowItem.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleWindow(windowItem.id);
                      }}
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] leading-none transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      style={{ color: 'var(--text-faint)', backgroundColor: 'var(--panel-muted)' }}
                    >
                      <span style={{ transform: 'translateX(0.5px)' }}>▶</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      {editingWindowId === windowItem.id ? (
                        <input
                          ref={windowInputRef}
                          value={draftWindowName}
                          onChange={(event) => setDraftWindowName(event.target.value)}
                          onBlur={() => commitWindowRename(windowItem.id, windowItem.label)}
                          onClick={(event) => event.stopPropagation()}
                          onDoubleClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitWindowRename(windowItem.id, windowItem.label);
                            } else if (event.key === 'Escape') {
                              event.preventDefault();
                              cancelWindowRename(windowItem.label);
                            }
                          }}
                          className="w-full rounded border px-1 py-0 text-sm font-semibold text-[var(--text-strong)] outline-none"
                          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'white' }}
                          maxLength={120}
                        />
                      ) : (
                        <span
                          className="block max-w-full truncate text-left text-[15px] font-semibold text-[var(--text-strong)]"
                          onClick={(event) => event.stopPropagation()}
                          onDoubleClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setEditingWindowId(windowItem.id);
                            setDraftWindowName(windowItem.label);
                          }}
                          title="Double-click to rename window"
                        >
                          {windowItem.label}
                        </span>
                      )}
                      <span className="mt-0.5 block text-[10px] font-mono text-[var(--text-faint)]">
                        {windowItem.isCurrent ? 'current window' : windowItem.id.slice(0, 12)}
                      </span>
                    </span>
                  </button>
                  <div className="flex h-8 shrink-0 items-center gap-0.5 rounded-full border bg-white/85 p-0.5 shadow-sm" style={{ borderColor: 'var(--border-subtle)' }}>
                    <button
                      onClick={() => onNewSession(windowItem.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-[var(--panel-muted)]"
                      style={{ color: 'var(--accent-command)' }}
                      title="Add session"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                      >
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                      </svg>
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteWorkspace(windowItem.id);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-faint)] transition-colors hover:bg-rose-50 hover:text-rose-600"
                      title="Delete workspace"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18" />
                        <path d="M8 6V4.75A1.75 1.75 0 0 1 9.75 3h4.5A1.75 1.75 0 0 1 16 4.75V6" />
                        <path d="M18 6l-.8 11.2A2 2 0 0 1 15.2 19H8.8a2 2 0 0 1-1.99-1.8L6 6" />
                        <path d="M10 10.25v5.5" />
                        <path d="M14 10.25v5.5" />
                      </svg>
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div
                    className="border-t px-2 py-2"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    {visibleSessions.length === 0 ? (
                      <div className="px-2 py-1 text-[11px] text-[var(--text-faint)]">No sessions</div>
                    ) : (
                      <div className="space-y-1">
                        {visibleSessions.map((session, index) => (
                          <div
                            key={session.id}
                            className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors ${
                              session.id === activeSessionId
                                ? 'bg-white text-[var(--text-strong)] shadow-sm'
                                : 'text-[var(--text-muted)] hover:bg-white/80'
                            }`}
                          >
                            <button
                              onClick={() => onSelectSession(session.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="truncate font-medium">{session.name?.trim() || `Session ${index + 1}`}</div>
                            </button>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                onDeleteSession(session.id);
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-faint)] transition-colors hover:bg-rose-50 hover:text-rose-600"
                              title="Delete session"
                            >
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                className="h-3.5 w-3.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.9"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M3 6h18" />
                                <path d="M8 6V4.75A1.75 1.75 0 0 1 9.75 3h4.5A1.75 1.75 0 0 1 16 4.75V6" />
                                <path d="M18 6l-.8 11.2A2 2 0 0 1 15.2 19H8.8a2 2 0 0 1-1.99-1.8L6 6" />
                                <path d="M10 10.25v5.5" />
                                <path d="M14 10.25v5.5" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {windows.length === 0 && (
            <div className="px-2 py-4 text-xs text-[var(--text-faint)]">No windows loaded</div>
          )}
        </div>
      </div>
    </div>
  );
}
