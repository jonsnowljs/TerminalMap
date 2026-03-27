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
const workDir = mkdtempSync(join(tmpdir(), 'mindmap-workspace-branch-smoke-'));
const dbPath = join(workDir, 'mindmap.db');
mkdirSync(workDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.exec(schema);

const queries = new Queries(db);
const graphService = new GraphService(queries);
const workspaceService = new WorkspaceService(queries);

const sourceWorkspace = workspaceService.createWorkspace({
  name: 'Source Workspace',
  cwd: '/workspace/source',
  parentWorkspaceId: null,
  createdFromNodeId: null,
  rootTerminalNodeId: null,
});

const sourceSessionId = 'source-session';
const sourceBranchId = 'source-branch';
queries.createSession(sourceSessionId, sourceWorkspace.id, '/bin/zsh', '/workspace/source', null);
queries.createBranch(sourceBranchId, sourceSessionId, null, null, 'main');

const sourceGraphNode = graphService.createNode(sourceSessionId, sourceBranchId, 'command', 'echo source', 0, {
  cwd: '/workspace/source/app',
});
const sourceTerminal = workspaceService.createTerminalNode({
  workspaceId: sourceWorkspace.id,
  title: 'Live terminal',
  sessionId: sourceSessionId,
  mode: 'active',
  status: 'idle',
  sourceNodeId: sourceGraphNode.id,
  snapshot: {
    cwd: '/workspace/source/app',
    lastCommand: 'echo source',
    previewLines: ['source output'],
    cursorRow: 1,
    cursorCol: 2,
    updatedAt: '2026-03-27T00:00:00.000Z',
    status: 'idle',
  },
  position: { x: 80, y: 120 },
});

const createBranch = (
  creationMode: 'clone_live_terminal' | 'new_from_node_context',
  sourceNodeId = sourceGraphNode.id,
  workspaceId = `child-${creationMode}`,
  sessionId = `session-${creationMode}`,
) => {
  queries.createWorkspace(workspaceId, `${creationMode}-workspace`, '/workspace/source/app', {
    parentWorkspaceId: sourceWorkspace.id,
    createdFromNodeId: sourceNodeId,
    rootTerminalNodeId: null,
  });
  queries.createSession(sessionId, workspaceId, '/bin/zsh', '/workspace/source/app', null);

  const result = (workspaceService as any).createWorkspaceBranch({
    workspaceId,
    sessionId,
    sourceWorkspaceId: sourceWorkspace.id,
    sourceNodeId,
    sourceTerminalNodeId: sourceTerminal.terminalNodeId,
    creationMode,
    cwd: '/workspace/source/app',
    title: creationMode === 'clone_live_terminal' ? 'Cloned terminal' : 'Branch terminal',
    position: { x: 256, y: 192 },
  });

  assert.equal(result.workspace.id, workspaceId);
  assert.equal(result.workspace.rootTerminalNodeId, result.graph.terminalNodes[0].terminalNodeId);
  assert.equal(result.graph.workspace.id, workspaceId);
  assert.equal(result.graph.terminalNodes.length, 1);
  assert.equal(result.graph.terminalNodes[0].workspaceId, workspaceId);
  assert.equal(result.graph.terminalNodes[0].sessionId, sessionId);
  assert.equal(result.graph.terminalNodes[0].mode, 'active');
  assert.equal(result.graph.workspaceLinks.length, 0);

  return result;
};

const branchedFromNode = createBranch('new_from_node_context');
assert.equal(branchedFromNode.graph.terminalNodes[0].sourceNodeId, sourceGraphNode.id);
assert.equal(branchedFromNode.graph.terminalNodes[0].snapshot?.cwd, '/workspace/source/app');
assert.equal(branchedFromNode.graph.terminalNodes[0].snapshot?.lastCommand, null);

const clonedFromTerminal = createBranch('clone_live_terminal');
assert.equal(clonedFromTerminal.graph.terminalNodes[0].title, 'Cloned terminal');
assert.equal(clonedFromTerminal.graph.terminalNodes[0].snapshot?.lastCommand, 'echo source');
assert.equal(clonedFromTerminal.graph.terminalNodes[0].snapshot?.previewLines[0], 'source output');

const sourceGraph = workspaceService.getWorkspaceGraph(sourceWorkspace.id);
assert.equal(sourceGraph.workspaceLinks.length, 2);
assert.equal(sourceGraph.workspaceLinks[0].sourceWorkspaceId, sourceWorkspace.id);
assert.equal(sourceGraph.workspaceLinks[0].targetWorkspaceId, 'child-new_from_node_context');

assert.throws(
  () => createBranch('new_from_node_context', sourceTerminal.terminalNodeId, 'child-invalid-terminal', 'session-invalid-terminal'),
  /graph node/i,
);

assert.throws(
  () => createBranch('new_from_node_context', 'missing-node', 'child-invalid-node', 'session-invalid-node'),
  /graph node/i,
);

db.close();
