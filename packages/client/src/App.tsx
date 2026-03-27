import { useRef, useEffect, useCallback, useState } from 'react';
import { MsgType } from '@mindmap/shared';
import type { GraphNode, GraphEdge, Branch } from '@mindmap/shared';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useTerminal } from './hooks/useTerminal.js';
import { useGraphStore } from './store/graphStore.js';
import AppShell from './components/layout/AppShell.js';
import GraphView from './components/graph/GraphView.js';
import TimelineView from './components/timeline/TimelineView.js';
import ViewToggle from './components/shared/ViewToggle.js';
import Sidebar from './components/layout/Sidebar.js';

interface SessionInfo {
  id: string;
  cwd: string;
  status: string;
}

function App() {
  const termContainerRef = useRef<HTMLDivElement>(null);
  const { termRef, getSize } = useTerminal(termContainerRef);
  const { send, request, onMessage, isConnected } = useWebSocket(
    `ws://${window.location.hostname}:${window.location.port}/ws`,
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const initRef = useRef(false);

  const addNode = useGraphStore((s) => s.addNode);
  const addEdge = useGraphStore((s) => s.addEdge);
  const setGraph = useGraphStore((s) => s.setGraph);
  const clearGraph = useGraphStore((s) => s.clearGraph);
  const branches = useGraphStore((s) => s.branches);
  const activeBranchId = useGraphStore((s) => s.activeBranchId);
  const setBranches = useGraphStore((s) => s.setBranches);
  const setActiveBranch = useGraphStore((s) => s.setActiveBranch);
  const viewMode = useGraphStore((s) => s.viewMode);

  // Handle incoming WS messages
  const handleMessage = useCallback(
    (msg: { type: string; payload: unknown }) => {
      const payload = msg.payload as Record<string, unknown>;
      switch (msg.type) {
        case MsgType.TERMINAL_STDOUT: {
          termRef.current?.write(atob(payload.data as string));
          break;
        }
        case MsgType.NODE_CREATED: {
          addNode(payload.node as GraphNode);
          break;
        }
        case MsgType.EDGE_CREATED: {
          addEdge(payload.edge as GraphEdge);
          break;
        }
        case MsgType.BRANCH_CREATED: {
          if (payload.branches) setBranches(payload.branches as Branch[]);
          if (payload.branchId) setActiveBranch(payload.branchId as string);
          break;
        }
        case MsgType.SESSION_EXITED: {
          termRef.current?.write('\r\n\x1b[33m[Session exited]\x1b[0m\r\n');
          break;
        }
      }
    },
    [termRef, addNode, addEdge, setBranches, setActiveBranch],
  );

  useEffect(() => {
    onMessage(handleMessage);
  }, [onMessage, handleMessage]);

  // Helper: attach to a session and load its graph
  const attachSession = useCallback(
    async (sid: string) => {
      try {
        const resp = await request(MsgType.SESSION_ATTACH, { sessionId: sid });
        const p = resp.payload as { graph?: { nodes: GraphNode[]; edges: GraphEdge[]; branches: Branch[] } };
        setSessionId(sid);
        sessionIdRef.current = sid;

        if (p.graph) {
          setGraph(p.graph.nodes, p.graph.edges, p.graph.branches);
          if (p.graph.branches.length > 0) {
            const active = p.graph.branches.find((b) => b.isActive) || p.graph.branches[0];
            setActiveBranch(active.id);
          }
        }
      } catch (err) {
        console.error('Failed to attach session:', err);
      }
    },
    [request, setGraph, setActiveBranch],
  );

  // Create a new session
  const createSession = useCallback(async () => {
    const { cols, rows } = getSize();
    try {
      const response = await request(MsgType.SESSION_CREATE, { cols, rows });
      const p = response.payload as { session: { id: string; cwd: string; branchId?: string } };
      const sid = p.session.id;
      setSessionId(sid);
      sessionIdRef.current = sid;
      clearGraph();
      setSessions((prev) => [...prev, { id: sid, cwd: p.session.cwd || '', status: 'active' }]);

      if (p.session.branchId) {
        setActiveBranch(p.session.branchId);
        const branchResp = await request('branch.list', { sessionId: sid });
        const bp = branchResp.payload as { branches: Branch[] };
        if (bp.branches) setBranches(bp.branches);
      }

      // Clear terminal for new session
      termRef.current?.reset();
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  }, [request, getSize, clearGraph, setActiveBranch, setBranches, termRef]);

  // On connect: list existing sessions or create new one
  useEffect(() => {
    if (!isConnected || initRef.current) return;
    initRef.current = true;

    const init = async () => {
      try {
        // List existing active sessions
        const resp = await request(MsgType.SESSION_LIST, {});
        const p = resp.payload as { sessions: SessionInfo[] };
        const activeSessions = p.sessions || [];
        setSessions(activeSessions);

        if (activeSessions.length > 0) {
          // Reattach to most recent
          await attachSession(activeSessions[0].id);
        } else {
          // Create new session
          await createSession();
        }
      } catch (err) {
        console.error('Failed to init:', err);
        await createSession();
      }
    };
    init();
  }, [isConnected, request, attachSession, createSession]);

  // Pipe terminal input
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const d = term.onData((data: string) => {
      if (sessionIdRef.current) send(MsgType.TERMINAL_STDIN, { sessionId: sessionIdRef.current, data });
    });
    return () => d.dispose();
  }, [termRef, send]);

  // Resize events
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const d = term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      if (sessionIdRef.current) send(MsgType.SESSION_RESIZE, { sessionId: sessionIdRef.current, cols, rows });
    });
    return () => d.dispose();
  }, [termRef, send]);

  const handleBranchFromNode = useCallback(
    async (nodeId: string) => {
      if (!sessionIdRef.current) return;
      try {
        await request(MsgType.BRANCH_CREATE, { sessionId: sessionIdRef.current, nodeId });
      } catch (err) {
        console.error('Failed to create branch:', err);
      }
    },
    [request],
  );

  const handleSwitchBranch = useCallback(
    async (branchId: string) => {
      if (!sessionIdRef.current) return;
      try {
        await request(MsgType.BRANCH_SWITCH, { sessionId: sessionIdRef.current, branchId });
        setActiveBranch(branchId);
      } catch (err) {
        console.error('Failed to switch branch:', err);
      }
    },
    [request, setActiveBranch],
  );

  const handleSelectSession = useCallback(
    async (sid: string) => {
      if (sid === sessionIdRef.current) return;
      // Detach current session
      if (sessionIdRef.current) {
        send(MsgType.SESSION_DETACH, { sessionId: sessionIdRef.current });
      }
      termRef.current?.reset();
      clearGraph();
      await attachSession(sid);
    },
    [send, termRef, clearGraph, attachSession],
  );

  const toolbar = (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold text-purple-400">Terminal Mindmap</h1>
        {sessionId && (
          <span className="text-xs text-gray-500 font-mono">session: {sessionId.slice(0, 8)}</span>
        )}
        {activeBranchId && (
          <span className="text-xs text-gray-600 font-mono">
            branch: {branches.find((b) => b.id === activeBranchId)?.name || activeBranchId.slice(0, 6)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <ViewToggle />
        <span className={`inline-block w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-xs text-gray-500">{isConnected ? 'connected' : 'disconnected'}</span>
      </div>
    </div>
  );

  return (
    <div className="h-full flex">
      <Sidebar
        sessions={sessions}
        activeSessionId={sessionId}
        branches={branches}
        activeBranchId={activeBranchId}
        onSelectSession={handleSelectSession}
        onNewSession={createSession}
        onSwitchBranch={handleSwitchBranch}
      />
      <div className="flex-1">
        <AppShell
          toolbar={toolbar}
          top={
            viewMode === 'graph'
              ? <GraphView onBranchFromNode={handleBranchFromNode} />
              : <TimelineView onBranchFromNode={handleBranchFromNode} />
          }
          bottom={<div className="h-full p-1" ref={termContainerRef} />}
        />
      </div>
    </div>
  );
}

export default App;
