import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { strict as assert } from 'assert';
import { GraphService } from './GraphService.js';
import { WorkspaceService } from './WorkspaceService.js';
import { Queries } from '../db/queries.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(__dirname, '../db/schema.sql'), 'utf-8');
const workDir = mkdtempSync(join(tmpdir(), 'mindmap-session-delete-smoke-'));
const dbPath = join(workDir, 'mindmap.db');
mkdirSync(workDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.exec(schema);

const queries = new Queries(db);
const graphService = new GraphService(queries);
const workspaceService = new WorkspaceService(queries);

const workspace = workspaceService.createWorkspace({
  name: 'Delete Workspace',
  cwd: '/workspace/delete',
  parentWorkspaceId: null,
  createdFromNodeId: null,
  rootTerminalNodeId: null,
});

const sessionId = 'session-delete';
queries.createSession(sessionId, workspace.id, '/bin/zsh', '/workspace/delete', null);

const terminalNode = workspaceService.createTerminalNode({
  workspaceId: workspace.id,
  title: 'Terminal Delete',
  sessionId,
  mode: 'active',
  status: 'idle',
  sourceNodeId: null,
  snapshot: null,
  position: { x: 64, y: 96 },
});

const deleted = queries.deleteSession(sessionId);

assert.equal(deleted?.id, sessionId);
assert.equal(queries.getSession(sessionId), undefined);
assert.equal(queries.listSessions().length, 0);
assert.equal(queries.getWorkspaceActiveTerminalNodeId(workspace.id), null);

const graph = graphService.getWorkspaceGraph(workspace.id);
assert.equal(graph.graphNodes.length, 0);
assert.equal(graph.workspace.id, workspace.id);
assert.equal(graph.terminalNodes.length, 1);
assert.equal(graph.terminalNodes[0].terminalNodeId, terminalNode.terminalNodeId);
assert.equal(graph.terminalNodes[0].sessionId, null);
assert.equal(graph.terminalNodes[0].mode, 'snapshot');
assert.equal(graph.terminalNodes[0].status, 'disconnected');

db.close();
