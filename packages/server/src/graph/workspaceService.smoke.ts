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
const workDir = mkdtempSync(join(tmpdir(), 'mindmap-workspace-smoke-'));
const dbPath = join(workDir, 'mindmap.db');
mkdirSync(workDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.exec(schema);

const queries = new Queries(db);
const graphService = new GraphService(queries);
const workspaceService = new WorkspaceService(queries);

const workspace = workspaceService.createWorkspace({
  name: 'Smoke Workspace',
  cwd: '/workspace/root',
  parentWorkspaceId: null,
  createdFromNodeId: null,
  rootTerminalNodeId: null,
});

const sessionId = 'session-1';
const branchId = 'branch-1';
queries.createSession(sessionId, workspace.id, '/bin/zsh', '/workspace/root', null);
queries.createBranch(branchId, sessionId, null, null, 'main');

const graphNodeA = graphService.createNode(sessionId, branchId, 'note', 'Root note', 0);
const graphNodeB = graphService.createNode(sessionId, branchId, 'command', 'ls', 1);
graphService.createEdge(graphNodeA.id, graphNodeB.id);

const childWorkspace = workspaceService.createWorkspace({
  name: 'Child Workspace',
  cwd: '/workspace/root/child',
  parentWorkspaceId: workspace.id,
  createdFromNodeId: graphNodeB.id,
  rootTerminalNodeId: null,
});

const terminalNode = workspaceService.createTerminalNode({
  workspaceId: workspace.id,
  title: 'Terminal A',
  sessionId: null,
  mode: 'snapshot',
  status: 'idle',
  sourceNodeId: graphNodeB.id,
  snapshot: null,
  position: { x: 120, y: 180 },
});

workspaceService.setActiveTerminalNode(workspace.id, terminalNode.terminalNodeId);
workspaceService.updateTerminalSnapshot(terminalNode.terminalNodeId, {
  cwd: '/workspace/root',
  lastCommand: 'ls',
  previewLines: ['one', 'two'],
  cursorRow: 1,
  cursorCol: 2,
  updatedAt: '2026-03-27T00:00:00.000Z',
  status: 'running',
});

workspaceService.createWorkspaceLink({
  sourceWorkspaceId: workspace.id,
  sourceNodeId: graphNodeB.id,
  targetWorkspaceId: childWorkspace.id,
  creationMode: 'new_from_node_context',
});

const graph = workspaceService.getWorkspaceGraph(workspace.id);

assert.equal(graph.workspace.id, workspace.id);
assert.equal(graph.workspace.name, 'Smoke Workspace');
assert.equal(graph.workspace.rootTerminalNodeId, terminalNode.terminalNodeId);
assert.equal(graph.graphNodes.length, 2);
assert.equal(graph.graphEdges.length, 1);
assert.equal(graph.terminalNodes.length, 1);
assert.equal(graph.terminalNodes[0].terminalNodeId, terminalNode.terminalNodeId);
assert.equal(graph.terminalNodes[0].title, 'Terminal A');
assert.equal(graph.terminalNodes[0].mode, 'active');
assert.equal(graph.terminalNodes[0].sessionId, null);
assert.equal(graph.terminalNodes[0].status, 'running');
assert.equal(graph.terminalNodes[0].snapshot?.lastCommand, 'ls');
assert.equal(graph.terminalNodes[0].snapshot?.status, 'running');
assert.deepEqual(graph.terminalNodes[0].position, { x: 120, y: 180 });
assert.equal(graph.workspaceLinks.length, 1);
assert.equal(graph.workspaceLinks[0].sourceNodeId, graphNodeB.id);
assert.equal(graph.workspaceLinks[0].targetWorkspaceId, childWorkspace.id);
assert.equal(graph.activeTerminalNodeId, terminalNode.terminalNodeId);

db.close();
