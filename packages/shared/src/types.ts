import type { NodeType, EdgeType, SessionStatus, TerminalStatus } from './constants.js';

export interface Workspace {
  id: string;
  name: string;
  parentWorkspaceId: string | null;
  createdFromNodeId: string | null;
  rootTerminalNodeId: string | null;
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

export interface TerminalSnapshot {
  cwd: string;
  lastCommand: string | null;
  previewLines: string[];
  cursorRow: number | null;
  cursorCol: number | null;
  updatedAt: string;
  status: TerminalStatus;
}

export interface TerminalRestoreState {
  cwd: string;
  lastCommand: string | null;
  shell: string;
  env: Record<string, string>;
  updatedAt: string;
}

export interface TerminalNodeData {
  terminalNodeId: string;
  workspaceId: string;
  sessionId: string | null;
  title: string;
  mode: 'active' | 'snapshot';
  status: TerminalStatus;
  sourceNodeId: string | null;
  snapshot: TerminalSnapshot | null;
  scrollback: string | null;
  restoreState: TerminalRestoreState | null;
}

export interface WorkspaceTerminalNode extends TerminalNodeData {
  position: {
    x: number;
    y: number;
  };
  size: {
    width: number;
    height: number;
  };
}

export interface WorkspaceLink {
  id: string;
  sourceWorkspaceId: string;
  sourceNodeId: string;
  targetWorkspaceId: string;
  creationMode: 'clone_live_terminal' | 'new_from_node_context';
  createdAt: string;
}

export interface TerminalLink {
  id: string;
  workspaceId: string;
  sourceTerminalNodeId: string;
  targetTerminalNodeId: string;
  createdAt: string;
}

export interface WorkspaceGraphPayload {
  workspace: Workspace;
  graphNodes: GraphNode[];
  terminalNodes: WorkspaceTerminalNode[];
  graphEdges: GraphEdge[];
  workspaceLinks: WorkspaceLink[];
  terminalLinks: TerminalLink[];
  activeTerminalNodeId: string | null;
}

export interface WorkspaceBranchCreateResponsePayload {
  workspaceId: string;
  workspace: Workspace;
  graph: WorkspaceGraphPayload;
}

export interface SessionGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  branches: Branch[];
}
