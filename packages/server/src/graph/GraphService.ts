import { nanoid } from 'nanoid';
import { NodeType, EdgeType } from '@mindmap/shared';
import type { GraphNode, GraphEdge, Branch, SessionGraph, WorkspaceGraphPayload } from '@mindmap/shared';
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

  getWorkspaceGraphNode(workspaceId: string, nodeId: string): GraphNode | undefined {
    return this.queries.getWorkspaceGraphNode(workspaceId, nodeId);
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

  getWorkspaceGraph(workspaceId: string): WorkspaceGraphPayload {
    const workspace = this.queries.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    return {
      workspace,
      graphNodes: this.queries.getWorkspaceGraphNodes(workspaceId),
      graphEdges: this.queries.getWorkspaceGraphEdges(workspaceId),
      terminalNodes: this.queries.listTerminalNodes(workspaceId),
      workspaceLinks: this.queries.listWorkspaceLinks(workspaceId),
      terminalLinks: this.queries.listTerminalLinks(workspaceId),
      activeTerminalNodeId: this.queries.getWorkspaceActiveTerminalNodeId(workspaceId),
    };
  }

  searchNodes(sessionId: string, query: string): GraphNode[] {
    return this.queries.searchNodes(sessionId, query);
  }
}
