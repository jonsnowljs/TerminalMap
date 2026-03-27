import { strict as assert } from 'assert';
import type { WebSocket } from 'ws';
import { SessionManager } from './SessionManager.js';

const manager = new SessionManager();
const workspaceId = 'workspace-concurrent';
const ws = {} as WebSocket;

const sessionA = manager.create({
  sessionId: 'session-a',
  branchId: 'branch-a',
  workspaceId,
  shell: '/bin/sh',
  cwd: process.cwd(),
  cols: 80,
  rows: 24,
});
const sessionB = manager.create({
  sessionId: 'session-b',
  branchId: 'branch-b',
  workspaceId,
  shell: '/bin/sh',
  cwd: process.cwd(),
  cols: 80,
  rows: 24,
});

manager.bindTerminalNode(sessionA.id, workspaceId, 'term-a');
manager.bindTerminalNode(sessionB.id, workspaceId, 'term-b');

manager.attachTerminalNode(workspaceId, 'term-a', sessionA.id, ws);
assert.equal(sessionA.attachedClients.has(ws), true);
assert.equal(sessionA.activeTerminalNodeId, 'term-a');

manager.attachTerminalNode(workspaceId, 'term-b', sessionB.id, ws);

assert.equal(sessionA.attachedClients.has(ws), true);
assert.equal(sessionB.attachedClients.has(ws), true);
assert.equal(sessionA.activeTerminalNodeId, 'term-a');
assert.equal(sessionB.activeTerminalNodeId, 'term-b');
assert.equal(manager.getTerminalAttachment('term-a')?.sessionId, 'session-a');
assert.equal(manager.getTerminalAttachment('term-b')?.sessionId, 'session-b');

manager.killAll();
