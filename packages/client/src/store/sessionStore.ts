import { create } from 'zustand';

interface SessionInfo {
  id: string;
  name: string | null;
  cwd: string;
  status: string;
  branchId?: string;
}

interface SessionState {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  setActiveSession: (id: string, info?: Partial<SessionInfo>) => void;
  addSession: (s: SessionInfo) => void;
  updateSession: (id: string, updates: Partial<SessionInfo>) => void;
  removeSession: (id: string) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  activeSessionId: null,
  setActiveSession: (id, info) =>
    set((state) => {
      if (info && !state.sessions.find((s) => s.id === id)) {
        return {
          activeSessionId: id,
          sessions: [...state.sessions, { id, name: null, cwd: '', status: 'active', ...info }],
        };
      }
      return { activeSessionId: id };
    }),
  addSession: (s) =>
    set((state) => ({ sessions: [...state.sessions, s] })),
  updateSession: (id, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    })),
  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
    })),
}));
