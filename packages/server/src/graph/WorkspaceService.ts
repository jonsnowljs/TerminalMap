import { nanoid } from 'nanoid';
import type {
  TerminalSnapshot,
  TerminalStatus,
  Workspace,
  WorkspaceBranchCreateResponsePayload,
  WorkspaceGraphPayload,
  WorkspaceLink,
  WorkspaceTerminalNode,
} from '@mindmap/shared';
import { GraphService } from './GraphService.js';
import { Queries } from '../db/queries.js';

export interface CreateWorkspaceInput {
  name?: string;
  cwd: string;
  parentWorkspaceId?: string | null;
  createdFromNodeId?: string | null;
  rootTerminalNodeId?: string | null;
}

export interface CreateTerminalNodeInput {
  workspaceId: string;
  title: string;
  sessionId: string | null;
  mode: WorkspaceTerminalNode['mode'];
  status: TerminalStatus;
  sourceNodeId: string | null;
  snapshot: TerminalSnapshot | null;
  position: { x: number; y: number };
}

export interface CreateWorkspaceLinkInput {
  sourceWorkspaceId: string;
  sourceNodeId: string;
  targetWorkspaceId: string;
  creationMode: WorkspaceLink['creationMode'];
}

export interface CreateWorkspaceBranchInput {
  workspaceId: string;
  sessionId: string;
  sourceWorkspaceId: string;
  sourceNodeId: string;
  sourceTerminalNodeId: string;
  creationMode: WorkspaceLink['creationMode'];
  cwd: string;
  name?: string;
  title?: string;
  position?: { x: number; y: number };
}

export class WorkspaceService {
  private graphService: GraphService;

  constructor(private queries: Queries) {
    this.graphService = new GraphService(queries);
  }

  createWorkspace(input: CreateWorkspaceInput): Workspace {
    const id = nanoid();
    return this.queries.createWorkspace(
      id,
      input.name ?? `w-${id.slice(0, 6)}`,
      input.cwd,
      {
        parentWorkspaceId: input.parentWorkspaceId ?? null,
        createdFromNodeId: input.createdFromNodeId ?? null,
        rootTerminalNodeId: input.rootTerminalNodeId ?? null,
      },
    );
  }

  createTerminalNode(input: CreateTerminalNodeInput): WorkspaceTerminalNode {
    const id = nanoid();
    const terminalNode = this.queries.createTerminalNode(
      id,
      input.workspaceId,
      input.sessionId,
      input.title,
      input.sourceNodeId,
      input.mode,
      input.status,
      input.snapshot,
      input.position,
    );

    const workspace = this.queries.getWorkspace(input.workspaceId);
    if (workspace && !workspace.rootTerminalNodeId) {
      this.queries.updateWorkspaceRootTerminalNode(input.workspaceId, id);
    }
    if (input.mode === 'active') {
      this.queries.setWorkspaceActiveTerminalNode(input.workspaceId, id);
    }

    return terminalNode;
  }

  updateTerminalSnapshot(terminalNodeId: string, snapshot: TerminalSnapshot): void {
    this.queries.updateTerminalNodeSnapshot(terminalNodeId, snapshot);
  }

  setActiveTerminalNode(workspaceId: string, terminalNodeId: string): void {
    this.queries.setWorkspaceActiveTerminalNode(workspaceId, terminalNodeId);
  }

  createWorkspaceLink(input: CreateWorkspaceLinkInput): WorkspaceLink {
    const id = nanoid();
    return this.queries.createWorkspaceLink(
      id,
      input.sourceWorkspaceId,
      input.sourceNodeId,
      input.targetWorkspaceId,
      input.creationMode,
    );
  }

  createWorkspaceBranch(input: CreateWorkspaceBranchInput): WorkspaceBranchCreateResponsePayload {
    const workspace = this.queries.getWorkspace(input.workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${input.workspaceId}`);
    }

    const sourceWorkspace = this.queries.getWorkspace(input.sourceWorkspaceId);
    if (!sourceWorkspace) {
      throw new Error(`Workspace not found: ${input.sourceWorkspaceId}`);
    }

    const sourceNode = this.graphService.getWorkspaceGraphNode(input.sourceWorkspaceId, input.sourceNodeId);
    if (!sourceNode) {
      throw new Error(`Source graph node not found in workspace: ${input.sourceNodeId}`);
    }

    const sourceTerminalNode = this.queries.getWorkspaceTerminalNode(input.sourceWorkspaceId, input.sourceTerminalNodeId);
    if (!sourceTerminalNode) {
      throw new Error(`Source terminal node not found in workspace: ${input.sourceTerminalNodeId}`);
    }

    if (input.creationMode === 'clone_live_terminal' && sourceTerminalNode.sessionId === null) {
      throw new Error(`Cannot clone disconnected terminal node: ${input.sourceTerminalNodeId}`);
    }

    const now = new Date().toISOString();
    const terminalTitle = input.title
      ?? (input.creationMode === 'clone_live_terminal' ? sourceTerminalNode.title : `t-${input.sessionId.slice(0, 6)}`);
    // We cannot clone the underlying PTY process state; the best supported approximation is
    // to seed the child terminal with the source terminal snapshot/cwd and mark the new PTY idle.
    const terminalSnapshot: TerminalSnapshot = input.creationMode === 'clone_live_terminal'
      ? (sourceTerminalNode.snapshot
        ? {
            ...sourceTerminalNode.snapshot,
            status: 'idle',
            updatedAt: now,
          }
        : {
            cwd: input.cwd,
            lastCommand: null,
            previewLines: [],
            cursorRow: null,
            cursorCol: null,
            updatedAt: now,
            status: 'idle',
          })
      : {
          cwd: input.cwd,
          lastCommand: null,
          previewLines: [],
          cursorRow: null,
          cursorCol: null,
          updatedAt: now,
          status: 'idle',
        };

    const terminalNode = this.queries.createTerminalNode(
      nanoid(),
      workspace.id,
      input.sessionId,
      terminalTitle,
      sourceNode.id,
      'active',
      terminalSnapshot.status,
      terminalSnapshot,
      input.position ?? { x: 0, y: 0 },
    );

    this.queries.updateWorkspaceRootTerminalNode(workspace.id, terminalNode.terminalNodeId);
    this.queries.setWorkspaceActiveTerminalNode(workspace.id, terminalNode.terminalNodeId);
    this.createWorkspaceLink({
      sourceWorkspaceId: sourceWorkspace.id,
      sourceNodeId: sourceNode.id,
      targetWorkspaceId: workspace.id,
      creationMode: input.creationMode,
    });

    const updatedWorkspace = this.queries.getWorkspace(workspace.id) ?? workspace;

    return {
      workspace: updatedWorkspace,
      graph: this.getWorkspaceGraph(workspace.id),
      workspaceId: workspace.id,
    };
  }

  getWorkspaceGraph(workspaceId: string): WorkspaceGraphPayload {
    return this.graphService.getWorkspaceGraph(workspaceId);
  }
}
