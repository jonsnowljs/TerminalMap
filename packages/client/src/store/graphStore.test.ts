import { beforeEach, describe, expect, it } from 'vitest';
import type { WorkspaceGraphPayload } from '@mindmap/shared';
import { WorkspaceCreatePayload } from '@mindmap/shared';
import { useGraphStore } from './graphStore.js';

const workspaceGraph: WorkspaceGraphPayload = {
  workspace: {
    id: 'ws-1',
    name: 'Root',
    parentWorkspaceId: null,
    createdFromNodeId: null,
    rootTerminalNodeId: 'term-1',
    cwd: '/workspace/root',
    createdAt: '2026-03-26T00:00:00.000Z',
    updatedAt: '2026-03-26T00:00:00.000Z',
  },
  graphNodes: [
    {
      id: 'node-1',
      sessionId: 'sess-1',
      branchId: 'branch-1',
      type: 'command',
      content: 'echo hello',
      exitCode: 0,
      cwd: '/workspace/root',
      durationMs: 12,
      metadata: { kind: 'command' },
      seq: 1,
      createdAt: '2026-03-26T00:00:00.000Z',
    },
  ],
  graphEdges: [],
  workspaceLinks: [],
  terminalLinks: [],
  activeTerminalNodeId: 'term-1',
  terminalNodes: [
    {
      terminalNodeId: 'term-1',
      workspaceId: 'ws-1',
      sessionId: 'sess-1',
      title: 'Main terminal',
      mode: 'active',
      status: 'idle',
      sourceNodeId: null,
      snapshot: null,
      scrollback: null,
      restoreState: null,
      position: { x: 42, y: 84 },
      size: { width: 960, height: 540 },
    },
    {
      terminalNodeId: 'term-2',
      workspaceId: 'ws-1',
      sessionId: 'sess-2',
      title: 'Child terminal',
      mode: 'snapshot',
      status: 'idle',
      sourceNodeId: 'node-1',
      snapshot: {
        cwd: '/tmp',
        lastCommand: 'ls',
        previewLines: ['a', 'b'],
        cursorRow: 1,
        cursorCol: 1,
        updatedAt: '2026-03-26T00:00:00.000Z',
        status: 'idle',
      },
      scrollback: 'a\nb',
      restoreState: {
        cwd: '/tmp',
        lastCommand: 'ls',
        shell: '/bin/zsh',
        env: { TERM: 'xterm-256color' },
        updatedAt: '2026-03-26T00:00:00.000Z',
      },
      position: { x: 512, y: 240 },
      size: { width: 960, height: 540 },
    },
  ],
};

describe('graphStore workspace terminal state', () => {
  beforeEach(() => {
    useGraphStore.getState().resetWorkspaceState();
  });

  it('hydrates graph nodes separately from terminal workspace nodes', () => {
    useGraphStore.getState().hydrateWorkspace(workspaceGraph);

    expect(useGraphStore.getState().nodes).toHaveLength(1);
    expect(useGraphStore.getState().nodes[0]?.id).toBe('node-1');
    expect(useGraphStore.getState().terminalNodes).toHaveLength(2);
    expect(useGraphStore.getState().terminalNodes[0]).toMatchObject({
      terminalNodeId: 'term-1',
      title: 'Main terminal',
      position: { x: 42, y: 84 },
      mode: 'active',
    });
  });

  it('tracks one active terminal node and leaves the others as snapshots', () => {
    useGraphStore.getState().hydrateWorkspace(workspaceGraph);
    useGraphStore.getState().setActiveTerminalNode('term-2');

    expect(useGraphStore.getState().activeTerminalNodeId).toBe('term-2');
    expect(useGraphStore.getState().terminalNodes.find((node) => node.terminalNodeId === 'term-1')?.mode).toBe('snapshot');
    expect(useGraphStore.getState().terminalNodes.find((node) => node.terminalNodeId === 'term-2')?.mode).toBe('active');
  });

  it('updates terminal snapshots without mutating graph nodes', () => {
    useGraphStore.getState().hydrateWorkspace(workspaceGraph);
    useGraphStore.getState().updateTerminalSnapshot('term-2', {
      cwd: '/tmp/project',
      lastCommand: 'pwd',
      previewLines: ['cwd /tmp/project'],
      cursorRow: 2,
      cursorCol: 5,
      updatedAt: '2026-03-26T01:00:00.000Z',
      status: 'running',
    });

    expect(useGraphStore.getState().nodes[0]?.data.graphNode.content).toBe('echo hello');
    expect(useGraphStore.getState().terminalNodes.find((node) => node.terminalNodeId === 'term-2')).toMatchObject({
      status: 'running',
      snapshot: {
        cwd: '/tmp/project',
        lastCommand: 'pwd',
      },
    });
  });

  it('updates terminal positions without changing graph nodes', () => {
    useGraphStore.getState().hydrateWorkspace(workspaceGraph);
    useGraphStore.getState().updateTerminalPosition('term-2', { x: 700, y: 320 });

    expect(useGraphStore.getState().nodes[0]?.id).toBe('node-1');
    expect(useGraphStore.getState().terminalNodes.find((node) => node.terminalNodeId === 'term-2')?.position).toEqual({
      x: 700,
      y: 320,
    });
  });

  it('updates terminal sizes without changing graph nodes', () => {
    useGraphStore.getState().hydrateWorkspace(workspaceGraph);
    useGraphStore.getState().updateTerminalSize('term-2', { width: 640, height: 480 });

    expect(useGraphStore.getState().nodes[0]?.id).toBe('node-1');
    expect(useGraphStore.getState().terminalNodes.find((node) => node.terminalNodeId === 'term-2')?.size).toEqual({
      width: 640,
      height: 480,
    });
  });

  it('adds a terminal node without stealing the active mode from the current terminal', () => {
    useGraphStore.getState().hydrateWorkspace(workspaceGraph);
    useGraphStore.getState().addTerminalNode({
      terminalNodeId: 'term-3',
      workspaceId: 'ws-1',
      sessionId: 'sess-3',
      title: 'Browser Shell 3',
      mode: 'active',
      status: 'idle',
      sourceNodeId: null,
      snapshot: null,
      scrollback: null,
      restoreState: null,
      position: { x: 640, y: 360 },
      size: { width: 960, height: 540 },
    });

    expect(useGraphStore.getState().terminalNodes).toHaveLength(3);
    expect(useGraphStore.getState().activeTerminalNodeId).toBe('term-1');
    expect(useGraphStore.getState().terminalNodes.find((node) => node.terminalNodeId === 'term-1')?.mode).toBe('active');
    expect(useGraphStore.getState().terminalNodes.find((node) => node.terminalNodeId === 'term-3')?.mode).toBe('snapshot');
  });

  it('stores terminal links separately from graph edges', () => {
    useGraphStore.getState().hydrateWorkspace(workspaceGraph);
    useGraphStore.getState().addTerminalLink({
      id: 'term-link-1',
      workspaceId: 'ws-1',
      sourceTerminalNodeId: 'term-1',
      targetTerminalNodeId: 'term-3',
      createdAt: '2026-03-26T02:00:00.000Z',
    });

    expect(useGraphStore.getState().terminalLinks).toEqual([
      {
        id: 'term-link-1',
        workspaceId: 'ws-1',
        sourceTerminalNodeId: 'term-1',
        targetTerminalNodeId: 'term-3',
        createdAt: '2026-03-26T02:00:00.000Z',
      },
    ]);
    expect(useGraphStore.getState().edges).toEqual([]);
  });

  it('ignores activation requests for unknown terminal nodes', () => {
    useGraphStore.getState().hydrateWorkspace(workspaceGraph);
    useGraphStore.getState().setActiveTerminalNode('missing-terminal');

    expect(useGraphStore.getState().activeTerminalNodeId).toBe('term-1');
    expect(useGraphStore.getState().terminalNodes.find((node) => node.terminalNodeId === 'term-1')?.mode).toBe('active');
    expect(useGraphStore.getState().terminalNodes.find((node) => node.terminalNodeId === 'term-2')?.mode).toBe('snapshot');
  });

  it('rejects partial derived workspace create payloads', () => {
    expect(WorkspaceCreatePayload.safeParse({ sourceWorkspaceId: 'ws-2' }).success).toBe(false);
    expect(
      WorkspaceCreatePayload.safeParse({
        creationMode: 'clone_live_terminal',
        sourceWorkspaceId: 'ws-2',
        sourceNodeId: 'node-9',
      }).success,
    ).toBe(true);
  });

  it('resets hydrated workspace state back to empty defaults', () => {
    useGraphStore.getState().hydrateWorkspace(workspaceGraph);
    useGraphStore.getState().resetWorkspaceState();

    expect(useGraphStore.getState().workspace).toBeNull();
    expect(useGraphStore.getState().workspaceLinks).toEqual([]);
    expect(useGraphStore.getState().terminalLinks).toEqual([]);
    expect(useGraphStore.getState().nodes).toEqual([]);
    expect(useGraphStore.getState().terminalNodes).toEqual([]);
    expect(useGraphStore.getState().activeTerminalNodeId).toBeNull();
  });

  it('stores a pending workspace branch action before creation', () => {
    useGraphStore.getState().setPendingBranchAction({
      sourceNodeId: 'node-5',
      sourceTerminalNodeId: 'term-1',
      creationMode: 'new_from_node_context',
    });

    expect(useGraphStore.getState().pendingBranchAction?.creationMode).toBe('new_from_node_context');
  });
});
