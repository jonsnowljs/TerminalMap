import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type {
  Branch,
  GraphEdge,
  GraphNode,
  Session,
  TerminalLink,
  TerminalRestoreState,
  TerminalSnapshot,
  Workspace,
  WorkspaceLink,
  WorkspaceTerminalNode,
} from '@mindmap/shared';

// Row types from SQLite (snake_case)
interface NodeRow {
  id: string;
  session_id: string;
  branch_id: string;
  type: string;
  content: string;
  exit_code: number | null;
  cwd: string | null;
  duration_ms: number | null;
  metadata: string;
  seq: number;
  created_at: string;
}

interface EdgeRow {
  id: string;
  source_id: string;
  target_id: string;
  type: string;
  metadata: string;
}

interface SessionRow {
  id: string;
  workspace_id: string;
  name: string | null;
  shell: string;
  cwd: string;
  pid: number | null;
  status: string;
  exit_code: number | null;
  created_at: string;
  updated_at: string;
}

interface BranchRow {
  id: string;
  session_id: string;
  parent_branch_id: string | null;
  fork_node_id: string | null;
  name: string | null;
  is_active: number;
  created_at: string;
}

interface WorkspaceRow {
  id: string;
  name: string;
  cwd: string;
  parent_workspace_id: string | null;
  created_from_node_id: string | null;
  root_terminal_node_id: string | null;
  active_terminal_node_id: string | null;
  created_at: string;
  updated_at: string;
}

interface WorkspaceTerminalNodeRow {
  terminal_node_id: string;
  workspace_id: string;
  session_id: string | null;
  title: string;
  source_node_id: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  mode: string;
  status: string;
  snapshot_json: string | null;
  scrollback_text: string | null;
  restore_state_json: string | null;
  created_at: string;
  updated_at: string;
}

interface WorkspaceLinkRow {
  id: string;
  source_workspace_id: string;
  source_node_id: string;
  target_workspace_id: string;
  creation_mode: string;
  created_at: string;
}

interface TerminalLinkRow {
  id: string;
  workspace_id: string;
  source_terminal_node_id: string;
  target_terminal_node_id: string;
  created_at: string;
}

function rowToNode(row: NodeRow): GraphNode {
  return {
    id: row.id,
    sessionId: row.session_id,
    branchId: row.branch_id,
    type: row.type as GraphNode['type'],
    content: row.content,
    exitCode: row.exit_code,
    cwd: row.cwd,
    durationMs: row.duration_ms,
    metadata: JSON.parse(row.metadata || '{}'),
    seq: row.seq,
    createdAt: row.created_at,
  };
}

function rowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    parentWorkspaceId: row.parent_workspace_id,
    createdFromNodeId: row.created_from_node_id,
    rootTerminalNodeId: row.root_terminal_node_id,
    cwd: row.cwd,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToWorkspaceTerminalNode(row: WorkspaceTerminalNodeRow): WorkspaceTerminalNode {
  return {
    terminalNodeId: row.terminal_node_id,
    workspaceId: row.workspace_id,
    sessionId: row.session_id,
    title: row.title,
    mode: row.mode as WorkspaceTerminalNode['mode'],
    status: row.status as WorkspaceTerminalNode['status'],
    sourceNodeId: row.source_node_id,
    snapshot: row.snapshot_json ? JSON.parse(row.snapshot_json) as TerminalSnapshot : null,
    scrollback: row.scrollback_text,
    restoreState: row.restore_state_json ? JSON.parse(row.restore_state_json) as TerminalRestoreState : null,
    position: {
      x: row.x,
      y: row.y,
    },
    size: {
      width: row.width,
      height: row.height,
    },
  };
}

function rowToWorkspaceLink(row: WorkspaceLinkRow): WorkspaceLink {
  return {
    id: row.id,
    sourceWorkspaceId: row.source_workspace_id,
    sourceNodeId: row.source_node_id,
    targetWorkspaceId: row.target_workspace_id,
    creationMode: row.creation_mode as WorkspaceLink['creationMode'],
    createdAt: row.created_at,
  };
}

function rowToTerminalLink(row: TerminalLinkRow): TerminalLink {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sourceTerminalNodeId: row.source_terminal_node_id,
    targetTerminalNodeId: row.target_terminal_node_id,
    createdAt: row.created_at,
  };
}

function rowToEdge(row: EdgeRow): GraphEdge {
  return {
    id: row.id,
    sourceId: row.source_id,
    targetId: row.target_id,
    type: row.type as GraphEdge['type'],
    metadata: JSON.parse(row.metadata || '{}'),
  };
}

function rowToBranch(row: BranchRow): Branch {
  return {
    id: row.id,
    sessionId: row.session_id,
    parentBranchId: row.parent_branch_id,
    forkNodeId: row.fork_node_id,
    name: row.name,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  };
}

export class Queries {
  constructor(private db: Database.Database) {}

  // Workspace
  createWorkspace(
    id: string,
    name: string,
    cwd: string,
    opts?: {
      parentWorkspaceId?: string | null;
      createdFromNodeId?: string | null;
      rootTerminalNodeId?: string | null;
      activeTerminalNodeId?: string | null;
    },
  ): Workspace {
    this.db.prepare(
      `INSERT INTO workspaces (
         id, name, cwd, parent_workspace_id, created_from_node_id, root_terminal_node_id, active_terminal_node_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      name,
      cwd,
      opts?.parentWorkspaceId ?? null,
      opts?.createdFromNodeId ?? null,
      opts?.rootTerminalNodeId ?? null,
      opts?.activeTerminalNodeId ?? null,
    );
    return this.getWorkspace(id)!;
  }

  getOrCreateWorkspace(cwd: string): string {
    const row = this.db.prepare(
      'SELECT id FROM workspaces WHERE cwd = ?',
    ).get(cwd) as { id: string } | undefined;
    if (row) return row.id;
    const id = nanoid();
    this.createWorkspace(id, `w-${id.slice(0, 6)}`, cwd);
    return id;
  }

  getWorkspace(id: string): Workspace | undefined {
    const row = this.db.prepare(
      'SELECT * FROM workspaces WHERE id = ?',
    ).get(id) as WorkspaceRow | undefined;
    return row ? rowToWorkspace(row) : undefined;
  }

  updateWorkspaceName(id: string, name: string): void {
    this.db.prepare(
      'UPDATE workspaces SET name = ?, updated_at = datetime(\'now\') WHERE id = ?',
    ).run(name, id);
  }

  deleteWorkspace(id: string): Workspace | undefined {
    const workspace = this.getWorkspace(id);
    if (!workspace) return undefined;

    this.db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
    return workspace;
  }

  getWorkspaceActiveTerminalNodeId(workspaceId: string): string | null {
    const row = this.db.prepare(
      'SELECT active_terminal_node_id FROM workspaces WHERE id = ?',
    ).get(workspaceId) as { active_terminal_node_id: string | null } | undefined;
    return row?.active_terminal_node_id ?? null;
  }

  updateWorkspaceRootTerminalNode(workspaceId: string, terminalNodeId: string | null): void {
    this.db.prepare(
      'UPDATE workspaces SET root_terminal_node_id = ?, updated_at = datetime(\'now\') WHERE id = ?',
    ).run(terminalNodeId, workspaceId);
  }

  setWorkspaceActiveTerminalNode(workspaceId: string, terminalNodeId: string | null): void {
    const tx = this.db.transaction((workspaceIdArg: string, terminalNodeIdArg: string | null) => {
      this.db.prepare(
        'UPDATE workspaces SET active_terminal_node_id = ?, updated_at = datetime(\'now\') WHERE id = ?',
      ).run(terminalNodeIdArg, workspaceIdArg);
      this.db.prepare(
        `UPDATE workspace_terminal_nodes
         SET mode = CASE WHEN terminal_node_id = ? THEN 'active' ELSE 'snapshot' END,
             updated_at = datetime('now')
         WHERE workspace_id = ?`,
      ).run(terminalNodeIdArg, workspaceIdArg);
    });
    tx(workspaceId, terminalNodeId);
  }

  // Session
  createSession(id: string, workspaceId: string, shell: string, cwd: string, pid: number | null, name?: string | null): void {
    this.db.prepare(
      'INSERT INTO sessions (id, workspace_id, name, shell, cwd, pid, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, workspaceId, name ?? null, shell, cwd, pid, 'active');
  }

  updateSessionStatus(id: string, status: string, exitCode?: number): void {
    this.db.prepare(
      'UPDATE sessions SET status = ?, exit_code = ?, updated_at = datetime(\'now\') WHERE id = ?',
    ).run(status, exitCode ?? null, id);
  }

  updateSessionName(id: string, name: string | null): void {
    this.db.prepare(
      'UPDATE sessions SET name = ?, updated_at = datetime(\'now\') WHERE id = ?',
    ).run(name, id);
  }

  deleteSession(id: string): SessionRow | undefined {
    const session = this.getSession(id);
    if (!session) return undefined;

    const terminalRows = this.db.prepare(
      'SELECT terminal_node_id, snapshot_json FROM workspace_terminal_nodes WHERE session_id = ?',
    ).all(id) as Array<{ terminal_node_id: string; snapshot_json: string | null }>;
    const activeTerminalNodeId = this.getWorkspaceActiveTerminalNodeId(session.workspace_id);

    const updateTerminalNode = this.db.prepare(
      `UPDATE workspace_terminal_nodes
       SET session_id = NULL,
           mode = 'snapshot',
           status = 'disconnected',
           snapshot_json = ?,
           updated_at = datetime('now')
       WHERE terminal_node_id = ?`,
    );

    for (const row of terminalRows) {
      const snapshot = row.snapshot_json ? JSON.parse(row.snapshot_json) as TerminalSnapshot : null;
      const snapshotJson = snapshot
        ? JSON.stringify({
            ...snapshot,
            status: 'disconnected',
            updatedAt: new Date().toISOString(),
          })
        : null;
      updateTerminalNode.run(snapshotJson, row.terminal_node_id);
    }

    if (activeTerminalNodeId && terminalRows.some((row) => row.terminal_node_id === activeTerminalNodeId)) {
      this.db.prepare(
        'UPDATE workspaces SET active_terminal_node_id = NULL, updated_at = datetime(\'now\') WHERE id = ?',
      ).run(session.workspace_id);
    }

    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return session;
  }

  getSession(id: string): SessionRow | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
  }

  listSessions(): SessionRow[] {
    return this.db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all() as SessionRow[];
  }

  // Branch
  createBranch(id: string, sessionId: string, parentBranchId: string | null, forkNodeId: string | null, name: string | null): void {
    this.db.prepare(
      'INSERT INTO branches (id, session_id, parent_branch_id, fork_node_id, name) VALUES (?, ?, ?, ?, ?)',
    ).run(id, sessionId, parentBranchId, forkNodeId, name);
  }

  getBranch(id: string): BranchRow | undefined {
    return this.db.prepare('SELECT * FROM branches WHERE id = ?').get(id) as BranchRow | undefined;
  }

  listBranches(sessionId: string): Branch[] {
    const rows = this.db.prepare(
      'SELECT * FROM branches WHERE session_id = ? ORDER BY created_at',
    ).all(sessionId) as BranchRow[];
    return rows.map(rowToBranch);
  }

  // Node
  createNode(
    id: string,
    sessionId: string,
    branchId: string,
    type: string,
    content: string,
    seq: number,
    cwd?: string | null,
    exitCode?: number | null,
    durationMs?: number | null,
    metadata?: Record<string, unknown>,
  ): GraphNode {
    this.db.prepare(
      `INSERT INTO nodes (id, session_id, branch_id, type, content, seq, cwd, exit_code, duration_ms, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, sessionId, branchId, type, content, seq, cwd ?? null, exitCode ?? null, durationMs ?? null, JSON.stringify(metadata || {}));

    return {
      id, sessionId, branchId,
      type: type as GraphNode['type'],
      content, seq,
      cwd: cwd ?? null,
      exitCode: exitCode ?? null,
      durationMs: durationMs ?? null,
      metadata: metadata || {},
      createdAt: new Date().toISOString(),
    };
  }

  updateNode(id: string, updates: { content?: string; exitCode?: number; durationMs?: number }): void {
    const parts: string[] = [];
    const values: unknown[] = [];
    if (updates.content !== undefined) { parts.push('content = ?'); values.push(updates.content); }
    if (updates.exitCode !== undefined) { parts.push('exit_code = ?'); values.push(updates.exitCode); }
    if (updates.durationMs !== undefined) { parts.push('duration_ms = ?'); values.push(updates.durationMs); }
    if (parts.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE nodes SET ${parts.join(', ')} WHERE id = ?`).run(...values);
  }

  deleteWorkspaceGraphNode(workspaceId: string, nodeId: string): GraphNode | undefined {
    const node = this.getWorkspaceGraphNode(workspaceId, nodeId);
    if (!node) return undefined;

    const tx = this.db.transaction(() => {
      this.db.prepare(
        `UPDATE workspace_terminal_nodes
         SET source_node_id = NULL, updated_at = datetime('now')
         WHERE workspace_id = ? AND source_node_id = ?`,
      ).run(workspaceId, nodeId);
      this.db.prepare('DELETE FROM nodes WHERE id = ?').run(nodeId);
    });
    tx();
    return node;
  }

  getSessionNodes(sessionId: string): GraphNode[] {
    const rows = this.db.prepare(
      'SELECT * FROM nodes WHERE session_id = ? ORDER BY seq',
    ).all(sessionId) as NodeRow[];
    return rows.map(rowToNode);
  }

  getBranchNodes(branchId: string): GraphNode[] {
    const rows = this.db.prepare(
      'SELECT * FROM nodes WHERE branch_id = ? ORDER BY seq',
    ).all(branchId) as NodeRow[];
    return rows.map(rowToNode);
  }

  getWorkspaceGraphNodes(workspaceId: string): GraphNode[] {
    const rows = this.db.prepare(
      `SELECT n.* FROM nodes n
       JOIN sessions s ON s.id = n.session_id
       WHERE s.workspace_id = ?
       ORDER BY n.seq`,
    ).all(workspaceId) as NodeRow[];
    return rows.map(rowToNode);
  }

  getWorkspaceGraphEdges(workspaceId: string): GraphEdge[] {
    const rows = this.db.prepare(
      `SELECT e.* FROM edges e
       JOIN nodes n ON e.source_id = n.id
       JOIN sessions s ON s.id = n.session_id
       WHERE s.workspace_id = ?
       ORDER BY e.id`,
    ).all(workspaceId) as EdgeRow[];
    return rows.map(rowToEdge);
  }

  getWorkspaceGraphNode(workspaceId: string, nodeId: string): GraphNode | undefined {
    const row = this.db.prepare(
      `SELECT n.* FROM nodes n
       JOIN sessions s ON s.id = n.session_id
       WHERE s.workspace_id = ? AND n.id = ?`,
    ).get(workspaceId, nodeId) as NodeRow | undefined;
    return row ? rowToNode(row) : undefined;
  }

  // Edge
  createEdge(id: string, sourceId: string, targetId: string, type: string = 'sequential'): GraphEdge {
    this.db.prepare(
      'INSERT INTO edges (id, source_id, target_id, type) VALUES (?, ?, ?, ?)',
    ).run(id, sourceId, targetId, type);
    return { id, sourceId, targetId, type: type as GraphEdge['type'], metadata: {} };
  }

  getSessionEdges(sessionId: string): GraphEdge[] {
    const rows = this.db.prepare(
      `SELECT e.* FROM edges e
       JOIN nodes n ON e.source_id = n.id
       WHERE n.session_id = ?`,
    ).all(sessionId) as EdgeRow[];
    return rows.map(rowToEdge);
  }

  getWorkspaceGraphEdge(workspaceId: string, edgeId: string): GraphEdge | undefined {
    const row = this.db.prepare(
      `SELECT e.* FROM edges e
       JOIN nodes n ON e.source_id = n.id
       JOIN sessions s ON s.id = n.session_id
       WHERE s.workspace_id = ? AND e.id = ?`,
    ).get(workspaceId, edgeId) as EdgeRow | undefined;
    return row ? rowToEdge(row) : undefined;
  }

  deleteWorkspaceGraphEdge(workspaceId: string, edgeId: string): GraphEdge | undefined {
    const edge = this.getWorkspaceGraphEdge(workspaceId, edgeId);
    if (!edge) return undefined;
    this.db.prepare('DELETE FROM edges WHERE id = ?').run(edgeId);
    return edge;
  }

  // Search
  searchNodes(sessionId: string, query: string): GraphNode[] {
    const rows = this.db.prepare(
      `SELECT n.* FROM nodes n
       JOIN nodes_fts fts ON n.rowid = fts.rowid
       WHERE n.session_id = ? AND nodes_fts MATCH ?
       ORDER BY rank`,
    ).all(sessionId, query) as NodeRow[];
    return rows.map(rowToNode);
  }

  // Workspace terminal nodes and links
  createTerminalNode(
    id: string,
    workspaceId: string,
    sessionId: string | null,
    title: string,
    sourceNodeId: string | null,
    mode: WorkspaceTerminalNode['mode'],
    status: WorkspaceTerminalNode['status'],
    snapshot: TerminalSnapshot | null,
    position: { x: number; y: number },
  ): WorkspaceTerminalNode {
    this.db.prepare(
      `INSERT INTO workspace_terminal_nodes (
         terminal_node_id, workspace_id, session_id, title, source_node_id, x, y, width, height, mode, status, snapshot_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      workspaceId,
      sessionId,
      title,
      sourceNodeId,
      position.x,
      position.y,
      960,
      540,
      mode,
      status,
      snapshot ? JSON.stringify(snapshot) : null,
    );
    return this.getTerminalNode(id)!;
  }

  getTerminalNode(terminalNodeId: string): WorkspaceTerminalNode | undefined {
    const row = this.db.prepare(
      'SELECT * FROM workspace_terminal_nodes WHERE terminal_node_id = ?',
    ).get(terminalNodeId) as WorkspaceTerminalNodeRow | undefined;
    return row ? rowToWorkspaceTerminalNode(row) : undefined;
  }

  getWorkspaceTerminalNode(workspaceId: string, terminalNodeId: string): WorkspaceTerminalNode | undefined {
    const row = this.db.prepare(
      'SELECT * FROM workspace_terminal_nodes WHERE workspace_id = ? AND terminal_node_id = ?',
    ).get(workspaceId, terminalNodeId) as WorkspaceTerminalNodeRow | undefined;
    return row ? rowToWorkspaceTerminalNode(row) : undefined;
  }

  getTerminalNodeBySessionId(sessionId: string): WorkspaceTerminalNode | undefined {
    const row = this.db.prepare(
      'SELECT * FROM workspace_terminal_nodes WHERE session_id = ? LIMIT 1',
    ).get(sessionId) as WorkspaceTerminalNodeRow | undefined;
    return row ? rowToWorkspaceTerminalNode(row) : undefined;
  }

  listTerminalNodes(workspaceId: string): WorkspaceTerminalNode[] {
    const rows = this.db.prepare(
      'SELECT * FROM workspace_terminal_nodes WHERE workspace_id = ? ORDER BY created_at',
    ).all(workspaceId) as WorkspaceTerminalNodeRow[];
    return rows.map(rowToWorkspaceTerminalNode);
  }

  updateTerminalNodeSnapshot(terminalNodeId: string, snapshot: TerminalSnapshot): void {
    this.db.prepare(
      `UPDATE workspace_terminal_nodes
       SET snapshot_json = ?, status = ?, updated_at = datetime('now')
       WHERE terminal_node_id = ?`,
    ).run(JSON.stringify(snapshot), snapshot.status, terminalNodeId);
  }

  updateTerminalNodeRestoreState(terminalNodeId: string, restoreState: TerminalRestoreState): void {
    this.db.prepare(
      `UPDATE workspace_terminal_nodes
       SET restore_state_json = ?, updated_at = datetime('now')
       WHERE terminal_node_id = ?`,
    ).run(JSON.stringify(restoreState), terminalNodeId);
  }

  updateTerminalNodeScrollback(terminalNodeId: string, scrollback: string): void {
    this.db.prepare(
      `UPDATE workspace_terminal_nodes
       SET scrollback_text = ?, updated_at = datetime('now')
       WHERE terminal_node_id = ?`,
    ).run(scrollback, terminalNodeId);
  }

  updateTerminalNodePosition(terminalNodeId: string, position: { x: number; y: number }): void {
    this.db.prepare(
      `UPDATE workspace_terminal_nodes
       SET x = ?, y = ?, updated_at = datetime('now')
       WHERE terminal_node_id = ?`,
    ).run(position.x, position.y, terminalNodeId);
  }

  updateTerminalNodeSize(terminalNodeId: string, size: { width: number; height: number }): void {
    this.db.prepare(
      `UPDATE workspace_terminal_nodes
       SET width = ?, height = ?, updated_at = datetime('now')
       WHERE terminal_node_id = ?`,
    ).run(size.width, size.height, terminalNodeId);
  }

  updateTerminalNodeSessionBinding(
    terminalNodeId: string,
    sessionId: string | null,
    mode: WorkspaceTerminalNode['mode'],
    status: WorkspaceTerminalNode['status'],
  ): void {
    this.db.prepare(
      `UPDATE workspace_terminal_nodes
       SET session_id = ?, mode = ?, status = ?, updated_at = datetime('now')
       WHERE terminal_node_id = ?`,
    ).run(sessionId, mode, status, terminalNodeId);
  }

  updateTerminalNodeTitle(terminalNodeId: string, title: string): void {
    this.db.prepare(
      `UPDATE workspace_terminal_nodes
       SET title = ?, updated_at = datetime('now')
       WHERE terminal_node_id = ?`,
    ).run(title, terminalNodeId);
  }

  deleteTerminalNode(workspaceId: string, terminalNodeId: string): WorkspaceTerminalNode | undefined {
    const terminalNode = this.getWorkspaceTerminalNode(workspaceId, terminalNodeId);
    if (!terminalNode) return undefined;

    const tx = this.db.transaction(() => {
      const workspace = this.getWorkspace(workspaceId);
      if (workspace?.rootTerminalNodeId === terminalNodeId) {
        this.updateWorkspaceRootTerminalNode(workspaceId, null);
      }
      if (this.getWorkspaceActiveTerminalNodeId(workspaceId) === terminalNodeId) {
        this.setWorkspaceActiveTerminalNode(workspaceId, null);
      }
      this.db.prepare(
        'DELETE FROM workspace_terminal_nodes WHERE workspace_id = ? AND terminal_node_id = ?',
      ).run(workspaceId, terminalNodeId);
    });
    tx();
    return terminalNode;
  }

  createWorkspaceLink(
    id: string,
    sourceWorkspaceId: string,
    sourceNodeId: string,
    targetWorkspaceId: string,
    creationMode: WorkspaceLink['creationMode'],
  ): WorkspaceLink {
    this.db.prepare(
      `INSERT INTO workspace_links (
         id, source_workspace_id, source_node_id, target_workspace_id, creation_mode
       ) VALUES (?, ?, ?, ?, ?)`,
    ).run(id, sourceWorkspaceId, sourceNodeId, targetWorkspaceId, creationMode);
    return this.getWorkspaceLink(id)!;
  }

  getWorkspaceLink(id: string): WorkspaceLink | undefined {
    const row = this.db.prepare(
      'SELECT * FROM workspace_links WHERE id = ?',
    ).get(id) as WorkspaceLinkRow | undefined;
    return row ? rowToWorkspaceLink(row) : undefined;
  }

  listWorkspaceLinks(workspaceId: string): WorkspaceLink[] {
    const rows = this.db.prepare(
      'SELECT * FROM workspace_links WHERE source_workspace_id = ? ORDER BY created_at',
    ).all(workspaceId) as WorkspaceLinkRow[];
    return rows.map(rowToWorkspaceLink);
  }

  upsertTerminalLink(
    id: string,
    workspaceId: string,
    sourceTerminalNodeId: string,
    targetTerminalNodeId: string,
  ): TerminalLink {
    this.db.prepare(
      `INSERT INTO terminal_links (id, workspace_id, source_terminal_node_id, target_terminal_node_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(workspace_id, target_terminal_node_id)
       DO UPDATE SET
         id = excluded.id,
         source_terminal_node_id = excluded.source_terminal_node_id`,
    ).run(id, workspaceId, sourceTerminalNodeId, targetTerminalNodeId);
    return this.getTerminalLinkByTarget(workspaceId, targetTerminalNodeId)!;
  }

  getTerminalLinkByTarget(workspaceId: string, targetTerminalNodeId: string): TerminalLink | undefined {
    const row = this.db.prepare(
      'SELECT * FROM terminal_links WHERE workspace_id = ? AND target_terminal_node_id = ?',
    ).get(workspaceId, targetTerminalNodeId) as TerminalLinkRow | undefined;
    return row ? rowToTerminalLink(row) : undefined;
  }

  getTerminalLink(id: string): TerminalLink | undefined {
    const row = this.db.prepare(
      'SELECT * FROM terminal_links WHERE id = ?',
    ).get(id) as TerminalLinkRow | undefined;
    return row ? rowToTerminalLink(row) : undefined;
  }

  deleteTerminalLink(workspaceId: string, terminalLinkId: string): TerminalLink | undefined {
    const link = this.getTerminalLink(terminalLinkId);
    if (!link || link.workspaceId !== workspaceId) return undefined;
    this.db.prepare('DELETE FROM terminal_links WHERE id = ?').run(terminalLinkId);
    return link;
  }

  listTerminalLinks(workspaceId: string): TerminalLink[] {
    const rows = this.db.prepare(
      'SELECT * FROM terminal_links WHERE workspace_id = ? ORDER BY created_at',
    ).all(workspaceId) as TerminalLinkRow[];
    return rows.map(rowToTerminalLink);
  }

  recoverRestorableTerminals(): void {
    const tx = this.db.transaction(() => {
      this.db.prepare(
        `UPDATE workspace_terminal_nodes
         SET mode = 'snapshot',
             status = 'disconnected',
             updated_at = datetime('now')
         WHERE session_id IS NOT NULL`,
      ).run();
      this.db.prepare(
        `UPDATE workspaces
         SET active_terminal_node_id = NULL,
             updated_at = datetime('now')
         WHERE active_terminal_node_id IS NOT NULL`,
      ).run();
      this.db.prepare(
        `UPDATE sessions
         SET status = 'detached',
             updated_at = datetime('now')
         WHERE status = 'active'`,
      ).run();
    });
    tx();
  }
}
