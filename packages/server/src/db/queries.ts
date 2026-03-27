import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type { GraphNode, GraphEdge, Session, Branch, Workspace } from '@mindmap/shared';

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
  createWorkspace(id: string, name: string, cwd: string): void {
    this.db.prepare(
      'INSERT INTO workspaces (id, name, cwd) VALUES (?, ?, ?)',
    ).run(id, name, cwd);
  }

  getOrCreateWorkspace(cwd: string): string {
    const row = this.db.prepare(
      'SELECT id FROM workspaces WHERE cwd = ?',
    ).get(cwd) as { id: string } | undefined;
    if (row) return row.id;
    const id = nanoid();
    this.createWorkspace(id, `workspace-${id.slice(0, 6)}`, cwd);
    return id;
  }

  // Session
  createSession(id: string, workspaceId: string, shell: string, cwd: string, pid: number | null): void {
    this.db.prepare(
      'INSERT INTO sessions (id, workspace_id, shell, cwd, pid, status) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, workspaceId, shell, cwd, pid, 'active');
  }

  updateSessionStatus(id: string, status: string, exitCode?: number): void {
    this.db.prepare(
      'UPDATE sessions SET status = ?, exit_code = ?, updated_at = datetime(\'now\') WHERE id = ?',
    ).run(status, exitCode ?? null, id);
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
}
