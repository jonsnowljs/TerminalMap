CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  cwd         TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name        TEXT,
  shell       TEXT NOT NULL DEFAULT '/bin/zsh',
  cwd         TEXT NOT NULL,
  pid         INTEGER,
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK(status IN ('active','detached','exited')),
  exit_code   INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

CREATE TABLE IF NOT EXISTS branches (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  parent_branch_id TEXT REFERENCES branches(id),
  fork_node_id TEXT,
  name        TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_branches_session ON branches(session_id);

CREATE TABLE IF NOT EXISTS nodes (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  branch_id   TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  type        TEXT NOT NULL
              CHECK(type IN ('prompt','command','output','error','file_edit','exploration','note')),
  content     TEXT NOT NULL DEFAULT '',
  exit_code   INTEGER,
  cwd         TEXT,
  duration_ms INTEGER,
  metadata    TEXT DEFAULT '{}',
  seq         INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_nodes_branch_seq ON nodes(branch_id, seq);
CREATE INDEX IF NOT EXISTS idx_nodes_session ON nodes(session_id);

CREATE TABLE IF NOT EXISTS edges (
  id          TEXT PRIMARY KEY,
  source_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'sequential'
              CHECK(type IN ('sequential','branch','dependency')),
  metadata    TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);

-- FTS5 for full-text search on node content
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  content,
  content=nodes,
  content_rowid=rowid
);

CREATE TRIGGER IF NOT EXISTS nodes_fts_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER IF NOT EXISTS nodes_fts_ad AFTER DELETE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, content) VALUES('delete', old.rowid, old.content);
END;
CREATE TRIGGER IF NOT EXISTS nodes_fts_au AFTER UPDATE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, content) VALUES('delete', old.rowid, old.content);
  INSERT INTO nodes_fts(rowid, content) VALUES (new.rowid, new.content);
END;
