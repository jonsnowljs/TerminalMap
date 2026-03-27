import type { NodeType, EdgeType, SessionStatus } from './constants.js';

export interface Workspace {
  id: string;
  name: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  workspaceId: string;
  name: string | null;
  shell: string;
  cwd: string;
  pid: number | null;
  status: SessionStatus;
  exitCode: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Branch {
  id: string;
  sessionId: string;
  parentBranchId: string | null;
  forkNodeId: string | null;
  name: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface GraphNode {
  id: string;
  sessionId: string;
  branchId: string;
  type: NodeType;
  content: string;
  exitCode: number | null;
  cwd: string | null;
  durationMs: number | null;
  metadata: Record<string, unknown>;
  seq: number;
  createdAt: string;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: EdgeType;
  metadata: Record<string, unknown>;
}

export interface SessionGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  branches: Branch[];
}
