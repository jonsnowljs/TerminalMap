import { describe, expect, it } from 'vitest';
import { buildNodeToTerminalEdges, buildTerminalLinkEdges } from './terminalConnections.js';

describe('terminal connection edges', () => {
  it('builds visual edges from source graph nodes to child terminal nodes', () => {
    const edges = buildNodeToTerminalEdges([
      {
        terminalNodeId: 'term-a',
        workspaceId: 'ws-1',
        sessionId: 'sess-a',
        title: 'Terminal A',
        mode: 'snapshot',
        status: 'idle',
        sourceNodeId: 'node-option-a',
        snapshot: null,
        scrollback: null,
        restoreState: null,
        position: { x: 100, y: 200 },
        size: { width: 960, height: 540 },
      },
      {
        terminalNodeId: 'term-b',
        workspaceId: 'ws-1',
        sessionId: 'sess-b',
        title: 'Terminal B',
        mode: 'active',
        status: 'running',
        sourceNodeId: null,
        snapshot: null,
        scrollback: null,
        restoreState: null,
        position: { x: 400, y: 200 },
        size: { width: 960, height: 540 },
      },
    ]);

    expect(edges).toEqual([
      expect.objectContaining({
        id: 'terminal-link-node-option-a-term-a',
        source: 'node-option-a',
        target: 'term-a',
        type: 'smoothstep',
      }),
    ]);
  });

  it('builds visual edges between terminal nodes from persisted terminal links', () => {
    const edges = buildTerminalLinkEdges([
      {
        id: 'link-1',
        workspaceId: 'ws-1',
        sourceTerminalNodeId: 'term-a',
        targetTerminalNodeId: 'term-b',
        createdAt: '2026-03-27T00:00:00.000Z',
      },
    ]);

    expect(edges).toEqual([
      expect.objectContaining({
        id: 'terminal-branch-link-1',
        source: 'term-a',
        target: 'term-b',
      }),
    ]);
  });
});
