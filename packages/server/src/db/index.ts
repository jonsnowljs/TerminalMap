import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

function hasColumn(database: Database.Database, table: string, column: string): boolean {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function runAdditiveMigrations(database: Database.Database): void {
  if (!hasColumn(database, 'workspaces', 'parent_workspace_id')) {
    database.exec('ALTER TABLE workspaces ADD COLUMN parent_workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL');
  }
  if (!hasColumn(database, 'workspaces', 'created_from_node_id')) {
    database.exec('ALTER TABLE workspaces ADD COLUMN created_from_node_id TEXT');
  }
  if (!hasColumn(database, 'workspaces', 'root_terminal_node_id')) {
    database.exec('ALTER TABLE workspaces ADD COLUMN root_terminal_node_id TEXT');
  }
  if (!hasColumn(database, 'workspaces', 'active_terminal_node_id')) {
    database.exec('ALTER TABLE workspaces ADD COLUMN active_terminal_node_id TEXT');
  }
  if (!hasColumn(database, 'workspace_terminal_nodes', 'width')) {
    database.exec('ALTER TABLE workspace_terminal_nodes ADD COLUMN width REAL NOT NULL DEFAULT 960');
  }
  if (!hasColumn(database, 'workspace_terminal_nodes', 'height')) {
    database.exec('ALTER TABLE workspace_terminal_nodes ADD COLUMN height REAL NOT NULL DEFAULT 540');
  }
  if (!hasColumn(database, 'workspace_terminal_nodes', 'scrollback_text')) {
    database.exec('ALTER TABLE workspace_terminal_nodes ADD COLUMN scrollback_text TEXT');
  }
  if (!hasColumn(database, 'workspace_terminal_nodes', 'restore_state_json')) {
    database.exec('ALTER TABLE workspace_terminal_nodes ADD COLUMN restore_state_json TEXT');
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS terminal_links (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      source_terminal_node_id TEXT NOT NULL REFERENCES workspace_terminal_nodes(terminal_node_id) ON DELETE CASCADE,
      target_terminal_node_id TEXT NOT NULL REFERENCES workspace_terminal_nodes(terminal_node_id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(workspace_id, target_terminal_node_id)
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_terminal_links_workspace ON terminal_links(workspace_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_terminal_links_source ON terminal_links(source_terminal_node_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_terminal_links_target ON terminal_links(target_terminal_node_id)');
}

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = join(process.cwd(), 'mindmap.db');
  db = new Database(dbPath);

  // Performance pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  // Run schema
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  runAdditiveMigrations(db);

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
