import { z } from 'zod';

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

export const BranchCreatePayload = z.object({
  sessionId: z.string(),
  nodeId: z.string(),
  name: z.string().optional(),
});

export const BranchSwitchPayload = z.object({
  sessionId: z.string(),
  branchId: z.string(),
});

export const NodeAnnotatePayload = z.object({
  nodeId: z.string(),
  note: z.string(),
});
