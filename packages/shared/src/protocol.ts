import { z } from 'zod';
import { TerminalStatus } from './constants.js';

// Base message envelope
export const WsMessageSchema = z.object({
  id: z.string(),
  type: z.string(),
  seq: z.number(),
  payload: z.unknown(),
});
export type WsMessage = z.infer<typeof WsMessageSchema>;

// Client → Server payloads
export const SessionCreatePayload = z.object({
  name: z.string().optional(),
  shell: z.string().optional(),
  cwd: z.string().optional(),
  cols: z.number(),
  rows: z.number(),
});

export const SessionAttachPayload = z.object({
  sessionId: z.string(),
});

export const SessionDetachPayload = z.object({
  sessionId: z.string(),
});

export const SessionDeletePayload = z.object({
  sessionId: z.string(),
});

export const SessionRenamePayload = z.object({
  sessionId: z.string(),
  name: z.string().min(1).max(120),
});

export const SessionResizePayload = z.object({
  sessionId: z.string(),
  cols: z.number(),
  rows: z.number(),
});

export const TerminalStdinPayload = z.object({
  sessionId: z.string(),
  data: z.string(),
});

export const GraphGetPayload = z.object({
  sessionId: z.string(),
});

export const GraphSearchPayload = z.object({
  sessionId: z.string(),
  query: z.string(),
});

export const NodeAnnotatePayload = z.object({
  nodeId: z.string(),
  note: z.string(),
});

export const NodeDeletePayload = z.object({
  workspaceId: z.string(),
  nodeId: z.string(),
});

export const EdgeDeletePayload = z.object({
  workspaceId: z.string(),
  edgeId: z.string(),
});

export const TerminalNodeCreatePayload = z.object({
  workspaceId: z.string(),
  title: z.string().optional(),
  parentTerminalNodeId: z.string().nullable().optional(),
  sourceNodeId: z.string().nullable().optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
});

export const WorkspaceGetPayload = z.object({
  workspaceId: z.string(),
});

export const WorkspaceRenamePayload = z.object({
  workspaceId: z.string(),
  name: z.string().min(1).max(120),
});

export const WorkspaceDeletePayload = z.object({
  workspaceId: z.string(),
});

const FreshWorkspaceCreatePayload = z.object({
  name: z.string().optional(),
  cwd: z.string().optional(),
}).strict();

const DerivedWorkspaceCreatePayload = z.object({
  name: z.string().optional(),
  cwd: z.string().optional(),
  sourceWorkspaceId: z.string(),
  sourceNodeId: z.string(),
  creationMode: z.enum(['clone_live_terminal', 'new_from_node_context']),
}).strict();

export const WorkspaceCreatePayload = z.union([
  FreshWorkspaceCreatePayload,
  DerivedWorkspaceCreatePayload,
]);

export const WorkspaceBranchCreatePayload = z.object({
  workspaceId: z.string(),
  sourceNodeId: z.string(),
  creationMode: z.enum(['clone_live_terminal', 'new_from_node_context']),
  sourceTerminalNodeId: z.string(),
});

export const WorkspaceBranchCreateResultPayloadSchema = z.object({
  workspaceId: z.string(),
  workspace: z.object({}).passthrough(),
  graph: z.object({}).passthrough(),
});

export const TerminalSnapshotPayload = z.object({
  cwd: z.string(),
  lastCommand: z.string().nullable(),
  previewLines: z.array(z.string()),
  cursorRow: z.number().nullable(),
  cursorCol: z.number().nullable(),
  updatedAt: z.string(),
  status: z.nativeEnum(TerminalStatus),
});

export const TerminalNodeAttachPayload = z.object({
  workspaceId: z.string(),
  terminalNodeId: z.string(),
  sessionId: z.string(),
  cols: z.number(),
  rows: z.number(),
});

export const TerminalNodeDetachPayload = z.object({
  workspaceId: z.string(),
  terminalNodeId: z.string(),
});

export const TerminalNodeMovePayload = z.object({
  workspaceId: z.string(),
  terminalNodeId: z.string(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
});

export const TerminalNodeResizePayload = z.object({
  workspaceId: z.string(),
  terminalNodeId: z.string(),
  size: z.object({
    width: z.number(),
    height: z.number(),
  }),
});

export const TerminalNodeDeletePayload = z.object({
  workspaceId: z.string(),
  terminalNodeId: z.string(),
});

export const TerminalNodeResumePayload = z.object({
  workspaceId: z.string(),
  terminalNodeId: z.string(),
  cols: z.number(),
  rows: z.number(),
});

export const TerminalNodeSnapshotPayload = z.object({
  workspaceId: z.string(),
  terminalNodeId: z.string(),
  snapshot: TerminalSnapshotPayload,
});

export const TerminalNodeActivatedPayload = z.object({
  workspaceId: z.string(),
  terminalNodeId: z.string(),
  sessionId: z.string(),
});

export const TerminalLinkCreatePayload = z.object({
  workspaceId: z.string(),
  sourceTerminalNodeId: z.string(),
  targetTerminalNodeId: z.string().optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
});

export const TerminalLinkDeletePayload = z.object({
  workspaceId: z.string(),
  terminalLinkId: z.string(),
});

export const SessionDeletedPayload = z.object({
  sessionId: z.string(),
});
