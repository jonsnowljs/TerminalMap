import { nanoid } from 'nanoid';
import { NodeType, EdgeType } from '@mindmap/shared';
import type { GraphNode, GraphEdge, Branch, SessionGraph } from '@mindmap/shared';
import { Queries } from '../db/queries.js';

export class GraphService {
  constructor(private queries: Queries) {}

  createNode(
    sessionId: string,
    branchId: string,
    type: string,
    content: string,
    seq: number,
    opts?: { cwd?: string; exitCode?: number; durationMs?: number; metadata?: Record<string, unknown> },
  ): GraphNode {
    const id = nanoid();
    return this.queries.createNode(
      id, sessionId, branchId, type, content, seq,
      opts?.cwd, opts?.exitCode, opts?.durationMs, opts?.metadata,
    );
  }

  updateNode(id: string, updates: { content?: string; exitCode?: number; durationMs?: number }): void {
    this.queries.updateNode(id, updates);
  }

  createEdge(sourceId: string, targetId: string, type: string = EdgeType.SEQUENTIAL): GraphEdge {
    const id = nanoid();
    return this.queries.createEdge(id, sourceId, targetId, type);
  }

  getSessionGraph(sessionId: string): SessionGraph {
    return {
      nodes: this.queries.getSessionNodes(sessionId),
      edges: this.queries.getSessionEdges(sessionId),
      branches: this.queries.listBranches(sessionId),
    };
  }

  searchNodes(sessionId: string, query: string): GraphNode[] {
    return this.queries.searchNodes(sessionId, query);
  }
}
