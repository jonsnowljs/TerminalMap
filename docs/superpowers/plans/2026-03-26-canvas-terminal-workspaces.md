# Canvas Terminal Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bottom terminal panel with on-canvas terminal nodes, add workspace-to-workspace branching, and support one live terminal plus snapshot terminals per visible workspace.

**Architecture:** The implementation keeps the current PTY core but changes the ownership model from page-global `sessionId` state to workspace-scoped terminal nodes. Shared contracts and persistence are expanded first, then websocket and session routing are made terminal-node aware, while client state keeps terminal workspace nodes separate from the legacy graph node list until the React Flow surface and node handlers are ready to render them directly on the canvas.

**Tech Stack:** React 19, Zustand, React Flow, xterm.js, Fastify websockets, node-pty, SQLite, TypeScript, Vitest

---

## File Map

### Shared contracts

- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/protocol.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/client/src/store/graphStore.test.ts`

### Server persistence and graph/workspace services

- Modify: `packages/server/src/db/schema.sql`
- Modify: `packages/server/src/db/queries.ts`
- Modify: `packages/server/src/graph/GraphService.ts`
- Create: `packages/server/src/graph/WorkspaceService.ts`
- Create: `packages/server/src/graph/workspaceService.smoke.ts`

### Server PTY and websocket routing

- Modify: `packages/server/src/pty/SessionManager.ts`
- Modify: `packages/server/src/ws/handler.ts`
- Modify: `packages/server/src/index.ts`

### Client terminal node and canvas integration

- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/components/layout/AppShell.tsx`
- Modify: `packages/client/src/components/graph/GraphView.tsx`
- Modify: `packages/client/src/hooks/useTerminal.ts`
- Modify: `packages/client/src/store/graphStore.ts`
- Modify: `packages/client/src/lib/layout.ts`
- Create: `packages/client/src/components/graph/TerminalNode.tsx`
- Create: `packages/client/src/lib/terminalSnapshot.ts`
- Create: `packages/client/src/lib/terminalSnapshot.test.ts`

### Branching and workspace navigation UX

- Modify: `packages/client/src/components/shared/NodeContextMenu.tsx`
- Modify: `packages/client/src/components/layout/Sidebar.tsx`
- Modify: `packages/client/src/components/timeline/TimelineView.tsx`

## Task 1: Expand Shared Types and Separate Terminal Workspace State

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/protocol.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/client/src/store/graphStore.test.ts`

- [ ] **Step 1: Write the failing client store test for separate terminal workspace state**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useGraphStore } from './graphStore.js';

describe('graphStore workspace terminal state', () => {
  beforeEach(() => {
    useGraphStore.getState().resetWorkspaceState();
  });

  it('keeps terminal workspace nodes separate from the graph node list', () => {
    useGraphStore.getState().hydrateWorkspace({
      workspace: { id: 'ws-1', name: 'Root', parentWorkspaceId: null, createdFromNodeId: null, rootTerminalNodeId: 'term-1', cwd: '/workspace/root', createdAt: '2026-03-26T00:00:00.000Z', updatedAt: '2026-03-26T00:00:00.000Z' },
      graphNodes: [{ id: 'node-1', sessionId: 'sess-1', branchId: 'branch-1', type: 'command', content: 'echo hello', exitCode: 0, cwd: '/workspace/root', durationMs: 12, metadata: {}, seq: 1, createdAt: '2026-03-26T00:00:00.000Z' }],
      terminalNodes: [
        {
          terminalNodeId: 'term-1',
          workspaceId: 'ws-1',
          sessionId: 'sess-1',
          mode: 'active',
          title: 'Main terminal',
          status: 'idle',
          sourceNodeId: null,
          snapshot: null,
          position: { x: 0, y: 0 },
        },
        {
          terminalNodeId: 'term-2',
          workspaceId: 'ws-1',
          sessionId: 'sess-2',
          mode: 'snapshot',
          title: 'Child terminal',
          status: 'idle',
          sourceNodeId: 'node-9',
          snapshot: { cwd: '/tmp', lastCommand: 'ls', previewLines: ['a', 'b'], cursorRow: 1, cursorCol: 1, updatedAt: '2026-03-26T00:00:00.000Z', status: 'idle' },
          position: { x: 300, y: 0 },
        },
      ],
      graphEdges: [],
      workspaceLinks: [],
      activeTerminalNodeId: 'term-1',
    });

    expect(useGraphStore.getState().nodes).toHaveLength(1);
    expect(useGraphStore.getState().terminalNodes).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to verify the current store shape fails**

Run: `pnpm --filter @mindmap/client test -- packages/client/src/store/graphStore.test.ts`

Expected: FAIL because `hydrateWorkspace`, `terminalNodes`, `workspaceLinks`, `activeTerminalNodeId`, and `resetWorkspaceState` do not exist yet.

- [ ] **Step 3: Add the shared terminal and workspace types**

```ts
export interface Workspace {
  id: string;
  name: string;
  parentWorkspaceId: string | null;
  createdFromNodeId: string | null;
  rootTerminalNodeId: string | null;
  cwd: string;
  createdAt: string;
  updatedAt: string;
}

export interface TerminalSnapshot {
  cwd: string;
  lastCommand: string | null;
  previewLines: string[];
  cursorRow: number | null;
  cursorCol: number | null;
  updatedAt: string;
  status: TerminalStatus;
}

export const TerminalStatus = {
  IDLE: 'idle',
  RUNNING: 'running',
  EXITED: 'exited',
  DISCONNECTED: 'disconnected',
} as const;
export type TerminalStatus = (typeof TerminalStatus)[keyof typeof TerminalStatus];

export interface TerminalNodeData {
  terminalNodeId: string;
  workspaceId: string;
  sessionId: string | null;
  title: string;
  mode: 'active' | 'snapshot';
  status: TerminalStatus;
  sourceNodeId: string | null;
  snapshot: TerminalSnapshot | null;
}

export interface WorkspaceTerminalNode extends TerminalNodeData {
  position: { x: number; y: number };
}

export interface WorkspaceLink {
  id: string;
  sourceWorkspaceId: string;
  sourceNodeId: string;
  targetWorkspaceId: string;
  creationMode: 'clone_live_terminal' | 'new_from_node_context';
  createdAt: string;
}

export interface WorkspaceGraphPayload {
  workspace: Workspace;
  graphNodes: GraphNode[];
  terminalNodes: WorkspaceTerminalNode[];
  graphEdges: GraphEdge[];
  workspaceLinks: WorkspaceLink[];
  activeTerminalNodeId: string | null;
}
```

- [ ] **Step 4: Extend constants and protocol messages for workspace-aware terminal actions**

```ts
export const NodeType = {
  PROMPT: 'prompt',
  COMMAND: 'command',
  OUTPUT: 'output',
  ERROR: 'error',
  FILE_EDIT: 'file_edit',
  EXPLORATION: 'exploration',
  NOTE: 'note',
  TERMINAL: 'terminal',
} as const;

export const MsgType = {
  WORKSPACE_GET: 'workspace.get',
  WORKSPACE_CREATE: 'workspace.create',
  WORKSPACE_BRANCH_CREATE: 'workspace.branch.create',
  TERMINAL_NODE_CREATE: 'terminal.node.create',
  TERMINAL_NODE_ATTACH: 'terminal.node.attach',
  TERMINAL_NODE_DETACH: 'terminal.node.detach',
  TERMINAL_NODE_SNAPSHOT: 'terminal.node.snapshot',
  TERMINAL_NODE_ACTIVATED: 'terminal.node.activated',
  // keep existing keys until later migration cleanup
} as const;
```

```ts
export const WorkspaceBranchCreatePayload = z.object({
  workspaceId: z.string(),
  sourceNodeId: z.string(),
  creationMode: z.enum(['clone_live_terminal', 'new_from_node_context']),
  sourceTerminalNodeId: z.string(),
});

export const TerminalNodeAttachPayload = z.object({
  workspaceId: z.string(),
  terminalNodeId: z.string(),
  sessionId: z.string(),
  cols: z.number(),
  rows: z.number(),
});
```

- [ ] **Step 5: Update the Zustand store shape to support workspace hydration and one active terminal**

```ts
interface GraphState {
  workspace: Workspace | null;
  workspaceLinks: WorkspaceLink[];
  activeTerminalNodeId: string | null;
  terminalNodes: WorkspaceTerminalNode[];
  nodes: FlowNode<MindmapNodeData>[];
  edges: FlowEdge[];
  hydrateWorkspace: (payload: WorkspaceGraphPayload) => void;
  setActiveTerminalNode: (terminalNodeId: string) => void;
  updateTerminalSnapshot: (terminalNodeId: string, snapshot: TerminalSnapshot) => void;
  resetWorkspaceState: () => void;
}
```

- [ ] **Step 6: Run the focused test to verify the new store contract passes**

Run: `pnpm --filter @mindmap/client test -- packages/client/src/store/graphStore.test.ts`

Expected: PASS with one test passing for active terminal switching.

- [ ] **Step 7: Run shared and client typecheck**

Run: `pnpm --filter @mindmap/shared typecheck && pnpm --filter @mindmap/client typecheck`

Expected: PASS

- [ ] **Step 8: Commit the contract changes**

```bash
git add packages/shared/src/constants.ts packages/shared/src/types.ts packages/shared/src/protocol.ts packages/shared/src/index.ts packages/client/src/store/graphStore.ts packages/client/src/store/graphStore.test.ts
git commit -m "feat: add workspace terminal contracts"
```

## Task 2: Add Workspace Links and Terminal Node Persistence

**Files:**
- Modify: `packages/server/src/db/schema.sql`
- Modify: `packages/server/src/db/queries.ts`
- Modify: `packages/server/src/graph/GraphService.ts`
- Create: `packages/server/src/graph/WorkspaceService.ts`
- Create: `packages/server/src/graph/workspaceService.smoke.ts`

- [ ] **Step 1: Write the failing persistence test as a query-level TypeScript script**

```ts
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { Queries } from '../db/queries.js';

const db = new Database(':memory:');
db.exec(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));

const queries = new Queries(db);
queries.createWorkspace('ws-root', 'Root', '/tmp');
queries.createTerminalNode('term-1', 'ws-root', 'sess-1', 'Main terminal', null, null);
queries.createWorkspaceLink('link-1', 'ws-root', 'node-1', 'ws-child', 'clone_live_terminal');

const terminalNodes = queries.listTerminalNodes('ws-root');
const links = queries.listWorkspaceLinks('ws-root');

if (terminalNodes.length !== 1) throw new Error('terminal node not persisted');
if (links.length !== 1) throw new Error('workspace link not persisted');
```

Save as: `packages/server/src/graph/workspaceService.smoke.ts`

- [ ] **Step 2: Run the script to verify it fails before schema changes**

Run: `pnpm --filter @mindmap/server exec tsx packages/server/src/graph/workspaceService.smoke.ts`

Expected: FAIL because the test fixture methods and tables do not exist yet.

- [ ] **Step 3: Add database tables for terminal nodes and workspace links**

```sql
CREATE TABLE IF NOT EXISTS terminal_nodes (
  id            TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id     TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  source_node_id TEXT,
  x              REAL NOT NULL DEFAULT 0,
  y              REAL NOT NULL DEFAULT 0,
  width          REAL NOT NULL DEFAULT 640,
  height         REAL NOT NULL DEFAULT 360,
  mode           TEXT NOT NULL CHECK(mode IN ('active','snapshot')),
  status         TEXT NOT NULL CHECK(status IN ('idle','running','exited','disconnected')),
  snapshot_json  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workspace_links (
  id                 TEXT PRIMARY KEY,
  source_workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_node_id      TEXT NOT NULL,
  target_workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  creation_mode       TEXT NOT NULL CHECK(creation_mode IN ('clone_live_terminal','new_from_node_context')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 4: Add query helpers and a focused workspace service**

```ts
createTerminalNode(id: string, workspaceId: string, sessionId: string | null, title: string, sourceNodeId: string | null, snapshot: TerminalSnapshot | null): void
listTerminalNodes(workspaceId: string): PersistedTerminalNode[]
updateTerminalNodeSnapshot(id: string, snapshot: TerminalSnapshot): void
setActiveTerminalNode(workspaceId: string, terminalNodeId: string): void
createWorkspaceLink(id: string, sourceWorkspaceId: string, sourceNodeId: string, targetWorkspaceId: string, creationMode: WorkspaceLink['creationMode']): void
listWorkspaceLinks(workspaceId: string): WorkspaceLink[]
```

```ts
export class WorkspaceService {
  constructor(private queries: Queries) {}

  getWorkspaceGraph(workspaceId: string) {
    return {
      workspace: this.queries.getWorkspace(workspaceId),
      nodes: this.queries.getWorkspaceNodes(workspaceId),
      edges: this.queries.getWorkspaceEdges(workspaceId),
      terminalNodes: this.queries.listTerminalNodes(workspaceId),
      workspaceLinks: this.queries.listWorkspaceLinks(workspaceId),
    };
  }
}
```

- [ ] **Step 5: Update the graph service to query by workspace instead of by session**

```ts
getWorkspaceGraph(workspaceId: string): WorkspaceGraph {
  return {
    workspace: this.queries.getWorkspaceById(workspaceId),
    nodes: this.queries.getWorkspaceNodes(workspaceId),
    edges: this.queries.getWorkspaceEdges(workspaceId),
    terminalNodes: this.queries.listTerminalNodes(workspaceId),
    workspaceLinks: this.queries.listWorkspaceLinks(workspaceId),
  };
}
```

- [ ] **Step 6: Replace the temporary script with a real smoke fixture under the new workspace service file**

```ts
if (import.meta.main) {
  const db = new Database(':memory:');
  db.exec(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  const queries = new Queries(db);
  const service = new WorkspaceService(queries);

  queries.createWorkspace('ws-root', 'Root', '/tmp');
  queries.createSession('sess-1', 'ws-root', '/bin/zsh', '/tmp', 100);
  queries.createTerminalNode('term-1', 'ws-root', 'sess-1', 'Main terminal', null, null);

  const graph = service.getWorkspaceGraph('ws-root');
  if (!graph.workspace || graph.terminalNodes.length !== 1) throw new Error('workspace graph missing terminal nodes');
}
```

- [ ] **Step 7: Run server typecheck and the workspace smoke script**

Run: `pnpm --filter @mindmap/server typecheck && pnpm --filter @mindmap/server exec tsx packages/server/src/graph/workspaceService.smoke.ts`

Expected: PASS

- [ ] **Step 8: Commit the persistence layer**

```bash
git add packages/server/src/db/schema.sql packages/server/src/db/queries.ts packages/server/src/graph/GraphService.ts packages/server/src/graph/WorkspaceService.ts packages/server/src/graph/workspaceService.smoke.ts
git commit -m "feat: persist terminal nodes and workspace links"
```

## Task 3: Make Session Management and Websocket Events Terminal-Node Aware

**Files:**
- Modify: `packages/server/src/pty/SessionManager.ts`
- Modify: `packages/server/src/ws/handler.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Write the failing session manager test for active attachment ownership**

```ts
import { SessionManager } from './SessionManager.js';

const manager = new SessionManager();
manager.create({ sessionId: 'sess-1', branchId: 'legacy-root', shell: '/bin/zsh', cwd: '/tmp', cols: 80, rows: 24 });
manager.attachTerminalNode('ws-1', 'term-1', 'sess-1', {} as never);
manager.attachTerminalNode('ws-1', 'term-2', 'sess-1', {} as never);

const active = manager.getActiveTerminalNode('ws-1');
if (active !== 'term-2') throw new Error('latest terminal node should own the attachment');
```

- [ ] **Step 2: Run server typecheck to verify the new APIs are missing**

Run: `pnpm --filter @mindmap/server typecheck`

Expected: FAIL because `attachTerminalNode` and `getActiveTerminalNode` are not defined.

- [ ] **Step 3: Extend the session manager with workspace attachment bookkeeping**

```ts
export interface WorkspaceAttachment {
  workspaceId: string;
  terminalNodeId: string;
  sessionId: string;
}

private activeTerminalByWorkspace = new Map<string, WorkspaceAttachment>();

attachTerminalNode(workspaceId: string, terminalNodeId: string, sessionId: string, ws: WebSocket): ManagedSession | undefined {
  const previous = this.activeTerminalByWorkspace.get(workspaceId);
  if (previous && previous.sessionId !== sessionId) {
    this.detach(previous.sessionId, ws);
  }

  const session = this.attach(sessionId, ws);
  if (!session) return undefined;
  this.activeTerminalByWorkspace.set(workspaceId, { workspaceId, terminalNodeId, sessionId });
  return session;
}
```

- [ ] **Step 4: Emit terminal snapshots alongside stdout and exit events**

```ts
session.pty.onData((data: string) => {
  snapshotBuffer.push(data);
  broadcast(session.attachedClients, MsgType.TERMINAL_STDOUT, {
    workspaceId,
    terminalNodeId,
    sessionId,
    data: Buffer.from(data).toString('base64'),
  });
});

send(socket, MsgType.TERMINAL_NODE_SNAPSHOT, {
  workspaceId,
  terminalNodeId,
  snapshot: buildTerminalSnapshot(snapshotBuffer, session.cwd),
});
```

- [ ] **Step 5: Replace session-global websocket cases with terminal-node actions**

```ts
case MsgType.TERMINAL_NODE_ATTACH: {
  const { workspaceId, terminalNodeId, sessionId, cols, rows } = TerminalNodeAttachPayload.parse(payload);
  const session = sessionManager.attachTerminalNode(workspaceId, terminalNodeId, sessionId, socket);
  if (!session) {
    send(socket, MsgType.ERROR, { message: `Session ${sessionId} not found` }, id);
    break;
  }
  sessionManager.resize(sessionId, cols, rows);
  send(socket, MsgType.TERMINAL_NODE_ACTIVATED, { workspaceId, terminalNodeId, sessionId }, id);
  break;
}
```

```ts
case MsgType.WORKSPACE_GET: {
  const { workspaceId } = payload as { workspaceId: string };
  const graph = workspaceService.getWorkspaceGraph(workspaceId);
  send(socket, MsgType.SESSION_ATTACHED, graph, id);
  break;
}
```

- [ ] **Step 6: Add child workspace creation for both branch modes**

```ts
case MsgType.WORKSPACE_BRANCH_CREATE: {
  const { workspaceId, sourceNodeId, creationMode, sourceTerminalNodeId } = WorkspaceBranchCreatePayload.parse(payload);
  const child = creationMode === 'clone_live_terminal'
    ? workspaceService.createChildWorkspaceFromClone(workspaceId, sourceNodeId, sourceTerminalNodeId)
    : workspaceService.createChildWorkspaceFromNodeContext(workspaceId, sourceNodeId, sourceTerminalNodeId);

  send(socket, MsgType.BRANCH_CREATED, child, id);
  break;
}
```

- [ ] **Step 7: Run server typecheck**

Run: `pnpm --filter @mindmap/server typecheck`

Expected: PASS

- [ ] **Step 8: Commit websocket and PTY routing changes**

```bash
git add packages/server/src/pty/SessionManager.ts packages/server/src/ws/handler.ts packages/server/src/index.ts packages/shared/src/protocol.ts
git commit -m "feat: route terminal sessions by workspace node"
```

## Task 4: Render Terminal Nodes on the Canvas and Remove the Bottom Panel

**Files:**
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/components/layout/AppShell.tsx`
- Modify: `packages/client/src/components/graph/GraphView.tsx`
- Modify: `packages/client/src/hooks/useTerminal.ts`
- Modify: `packages/client/src/store/graphStore.ts`
- Modify: `packages/client/src/lib/layout.ts`
- Create: `packages/client/src/components/graph/TerminalNode.tsx`
- Create: `packages/client/src/lib/terminalSnapshot.ts`
- Test: `packages/client/src/lib/terminalSnapshot.test.ts`

- [ ] **Step 1: Write the failing snapshot renderer test**

```ts
import { describe, expect, it } from 'vitest';
import { summarizeSnapshotLines } from './terminalSnapshot.js';

describe('summarizeSnapshotLines', () => {
  it('keeps the newest visible lines and strips empty tail rows', () => {
    expect(
      summarizeSnapshotLines(['$', 'npm run dev', '', '', 'ready on http://localhost:5173'], 3),
    ).toEqual(['npm run dev', '', 'ready on http://localhost:5173']);
  });
});
```

- [ ] **Step 2: Run the test to verify the helper does not exist yet**

Run: `pnpm --filter @mindmap/client test -- packages/client/src/lib/terminalSnapshot.test.ts`

Expected: FAIL because `summarizeSnapshotLines` is undefined.

- [ ] **Step 3: Add the snapshot helper and terminal node component**

```ts
export function summarizeSnapshotLines(lines: string[], limit = 8): string[] {
  const trimmed = [...lines];
  while (trimmed.length > 0 && trimmed.at(-1) === '') trimmed.pop();
  return trimmed.slice(-limit);
}
```

```tsx
export default function TerminalNode({ data, selected }: NodeProps<FlowTerminalNodeData>) {
  const activateTerminalNode = useGraphStore((state) => state.setActiveTerminalNode);

  return (
    <div className={selected ? 'ring-2 ring-[var(--accent-strong)]' : 'ring-1 ring-[var(--border-subtle)]'}>
      <header className="flex items-center justify-between px-3 py-2">
        <span>{data.title}</span>
        <button onClick={() => activateTerminalNode(data.terminalNodeId)}>Activate</button>
      </header>
      {data.mode === 'active' ? <div data-terminal-container={data.terminalNodeId} className="h-72" /> : <pre>{data.snapshot?.previewLines.join('\n')}</pre>}
    </div>
  );
}
```

- [ ] **Step 4: Refactor `useTerminal` so xterm can mount into a dynamic node container**

```ts
export function useTerminal() {
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const mount = (container: HTMLDivElement) => {
    if (!termRef.current) {
      termRef.current = new Terminal({ cursorBlink: true, fontSize: 14, fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace" });
      fitAddonRef.current = new FitAddon();
      termRef.current.loadAddon(fitAddonRef.current);
    }
    termRef.current.open(container);
    requestAnimationFrame(() => fitAddonRef.current?.fit());
  };
  return { termRef, mount, fit: () => fitAddonRef.current?.fit() };
}
```

- [ ] **Step 5: Remove the bottom panel and merge stored terminal workspace nodes into the rendered graph only after terminal-aware node handling exists**

```tsx
const nodeTypes = {
  command: CommandNode,
  output: OutputNode,
  error: ErrorNode,
  note: NoteNode,
  terminal: TerminalNode,
};
```

```tsx
export default function AppShell({ toolbar, top }: { toolbar: React.ReactNode; top: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col">
      {toolbar}
      <div className="flex-1 overflow-hidden">{top}</div>
    </div>
  );
}
```

- [ ] **Step 6: Update `App.tsx` to attach xterm to the active terminal node instead of a fixed panel**

```tsx
const { termRef, mount, fit } = useTerminal();
const activeTerminalNodeId = useGraphStore((state) => state.activeTerminalNodeId);

useEffect(() => {
  if (!activeTerminalNodeId) return;
  const container = document.querySelector<HTMLDivElement>(`[data-terminal-container="${activeTerminalNodeId}"]`);
  if (!container) return;
  mount(container);
  fit();
}, [activeTerminalNodeId, mount, fit]);
```

- [ ] **Step 7: Run the client tests and typecheck**

Run: `pnpm --filter @mindmap/client test && pnpm --filter @mindmap/client typecheck`

Expected: PASS

- [ ] **Step 8: Commit the canvas terminal UI migration**

```bash
git add packages/client/src/App.tsx packages/client/src/components/layout/AppShell.tsx packages/client/src/components/graph/GraphView.tsx packages/client/src/components/graph/TerminalNode.tsx packages/client/src/hooks/useTerminal.ts packages/client/src/lib/terminalSnapshot.ts packages/client/src/lib/terminalSnapshot.test.ts packages/client/src/store/graphStore.ts packages/client/src/lib/layout.ts
git commit -m "feat: render terminals directly on the canvas"
```

## Task 5: Add Workspace Branch Actions and Sidebar Navigation

**Files:**
- Modify: `packages/client/src/components/shared/NodeContextMenu.tsx`
- Modify: `packages/client/src/components/layout/Sidebar.tsx`
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/store/graphStore.ts`

- [ ] **Step 1: Write the failing UI state test for branch mode selection**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useGraphStore } from '../../store/graphStore.js';

describe('workspace branching state', () => {
  beforeEach(() => useGraphStore.getState().resetWorkspaceState());

  it('stores the pending branch mode before workspace creation', () => {
    useGraphStore.getState().setPendingBranchAction({
      sourceNodeId: 'node-5',
      sourceTerminalNodeId: 'term-1',
      creationMode: 'new_from_node_context',
    });

    expect(useGraphStore.getState().pendingBranchAction?.creationMode).toBe('new_from_node_context');
  });
});
```

- [ ] **Step 2: Run the focused test to verify the branch action state is absent**

Run: `pnpm --filter @mindmap/client test -- packages/client/src/store/graphStore.test.ts`

Expected: FAIL because `pendingBranchAction` and `setPendingBranchAction` do not exist yet.

- [ ] **Step 3: Update the node context menu to offer the two approved branch modes**

```tsx
<button onClick={() => onCreateWorkspaceBranch(nodeId, 'clone_live_terminal')}>
  Create Child Mindmap from Live Terminal
</button>
<button onClick={() => onCreateWorkspaceBranch(nodeId, 'new_from_node_context')}>
  Create Child Mindmap from This Node
</button>
```

- [ ] **Step 4: Add workspace switching and linked workspace rows to the sidebar**

```tsx
<section>
  <h2 className="text-xs font-semibold uppercase tracking-wide">Mindmaps</h2>
  {workspaces.map((workspace) => (
    <button key={workspace.id} onClick={() => onSelectWorkspace(workspace.id)}>
      {workspace.name}
    </button>
  ))}
</section>
```

- [ ] **Step 5: Handle workspace creation responses in `App.tsx` and navigate to the new child workspace**

```tsx
const handleCreateWorkspaceBranch = useCallback(
  async (sourceNodeId: string, creationMode: 'clone_live_terminal' | 'new_from_node_context') => {
    if (!workspace || !activeTerminalNodeId) return;
    const response = await request(MsgType.WORKSPACE_BRANCH_CREATE, {
      workspaceId: workspace.id,
      sourceNodeId,
      creationMode,
      sourceTerminalNodeId: activeTerminalNodeId,
    });

    const payload = response.payload as { workspaceId: string };
    await loadWorkspace(payload.workspaceId);
  },
  [workspace, activeTerminalNodeId, request, loadWorkspace],
);
```

- [ ] **Step 6: Run client tests and typecheck**

Run: `pnpm --filter @mindmap/client test && pnpm --filter @mindmap/client typecheck`

Expected: PASS

- [ ] **Step 7: Commit the workspace branch UX**

```bash
git add packages/client/src/components/shared/NodeContextMenu.tsx packages/client/src/components/layout/Sidebar.tsx packages/client/src/App.tsx packages/client/src/store/graphStore.ts
git commit -m "feat: add linked mindmap branching flows"
```

## Task 6: Remove Legacy Git-Branch Assumptions and Verify End-to-End Flow

**Files:**
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/components/layout/Sidebar.tsx`
- Modify: `packages/client/src/components/timeline/TimelineView.tsx`
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/server/src/ws/handler.ts`

- [ ] **Step 1: Delete legacy branch-first UI labels and fallback state**

```tsx
<span className="font-mono text-xs text-[var(--text-faint)]">
  workspace: {workspace?.name ?? 'unloaded'}
</span>
```

```tsx
<p className="text-sm text-[var(--text-muted)]">
  No terminal activity yet. Activate a terminal node to start building this mindmap.
</p>
```

- [ ] **Step 2: Remove unused branch payload handling after workspace actions are in place**

```ts
interface GraphState {
  workspace: Workspace | null;
  workspaceLinks: WorkspaceLink[];
  activeTerminalNodeId: string | null;
  // remove branches and activeBranchId after client migration completes
}
```

- [ ] **Step 3: Run full verification**

Run: `pnpm typecheck`

Expected: PASS

Run: `pnpm --filter @mindmap/client test`

Expected: PASS

Run: `pnpm dev`

Expected: Client and server both start; manually verify:
- the shell has no bottom terminal panel
- a workspace can show multiple terminal nodes
- activating one terminal node detaches the previous one
- inactive terminal nodes display snapshots
- branching from a node offers both creation modes
- the child mindmap opens after creation

- [ ] **Step 4: Commit the final cleanup**

```bash
git add packages/client/src/App.tsx packages/client/src/components/layout/Sidebar.tsx packages/client/src/components/timeline/TimelineView.tsx packages/shared/src/types.ts packages/server/src/ws/handler.ts
git commit -m "refactor: replace legacy branch UX with workspaces"
```
