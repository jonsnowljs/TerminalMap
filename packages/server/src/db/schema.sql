CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  cwd         TEXT NOT NULL,
  parent_workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  created_from_node_id TEXT,
  root_terminal_node_id TEXT,
  active_terminal_node_id TEXT,
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

CREATE TABLE IF NOT EXISTS workspace_terminal_nodes (
  terminal_node_id TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id     TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  source_node_id TEXT,
  x              REAL NOT NULL DEFAULT 0,
  y              REAL NOT NULL DEFAULT 0,
  width          REAL NOT NULL DEFAULT 960,
  height         REAL NOT NULL DEFAULT 540,
  mode           TEXT NOT NULL CHECK(mode IN ('active','snapshot')),
  status         TEXT NOT NULL CHECK(status IN ('idle','running','exited','disconnected')),
  snapshot_json  TEXT,
  scrollback_text TEXT,
  restore_state_json TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workspace_terminal_nodes_workspace ON workspace_terminal_nodes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_terminal_nodes_session ON workspace_terminal_nodes(session_id);

CREATE TABLE IF NOT EXISTS workspace_links (
  id                 TEXT PRIMARY KEY,
  source_workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_node_id      TEXT NOT NULL,
  target_workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  creation_mode       TEXT NOT NULL CHECK(creation_mode IN ('clone_live_terminal','new_from_node_context')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workspace_links_source_workspace ON workspace_links(source_workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_links_target_workspace ON workspace_links(target_workspace_id);

CREATE TABLE IF NOT EXISTS terminal_links (
  id                    TEXT PRIMARY KEY,
  workspace_id          TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_terminal_node_id TEXT NOT NULL REFERENCES workspace_terminal_nodes(terminal_node_id) ON DELETE CASCADE,
  target_terminal_node_id TEXT NOT NULL REFERENCES workspace_terminal_nodes(terminal_node_id) ON DELETE CASCADE,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, target_terminal_node_id)
);
CREATE INDEX IF NOT EXISTS idx_terminal_links_workspace ON terminal_links(workspace_id);
CREATE INDEX IF NOT EXISTS idx_terminal_links_source ON terminal_links(source_terminal_node_id);
CREATE INDEX IF NOT EXISTS idx_terminal_links_target ON terminal_links(target_terminal_node_id);

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
