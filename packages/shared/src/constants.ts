export const NodeType = {
  PROMPT: 'prompt',
  COMMAND: 'command',
  OUTPUT: 'output',
  ERROR: 'error',
  FILE_EDIT: 'file_edit',
  EXPLORATION: 'exploration',
  NOTE: 'note',
  TERMINAL: 'terminal',
} as const;
export type NodeType = (typeof NodeType)[keyof typeof NodeType];

export const EdgeType = {
  SEQUENTIAL: 'sequential',
  BRANCH: 'branch',
  DEPENDENCY: 'dependency',
} as const;
export type EdgeType = (typeof EdgeType)[keyof typeof EdgeType];

export const SessionStatus = {
  ACTIVE: 'active',
  DETACHED: 'detached',
  EXITED: 'exited',
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export const TerminalStatus = {
  IDLE: 'idle',
  RUNNING: 'running',
  EXITED: 'exited',
  DISCONNECTED: 'disconnected',
} as const;
export type TerminalStatus = (typeof TerminalStatus)[keyof typeof TerminalStatus];

// WebSocket message types
export const MsgType = {
  // Client → Server
  SESSION_CREATE: 'session.create',
  SESSION_ATTACH: 'session.attach',
  SESSION_DETACH: 'session.detach',
  SESSION_DELETE: 'session.delete',
  SESSION_RENAME: 'session.rename',
  SESSION_RESIZE: 'session.resize',
  SESSION_LIST: 'session.list',
  TERMINAL_STDIN: 'terminal.stdin',
  GRAPH_GET: 'graph.get',
  GRAPH_SEARCH: 'graph.search',
  NODE_ANNOTATE: 'node.annotate',
  TERMINAL_NODE_CREATE: 'terminal.node.create',
  WORKSPACE_GET: 'workspace.get',
  WORKSPACE_RENAME: 'workspace.rename',
  WORKSPACE_DELETE: 'workspace.delete',
  WORKSPACE_CREATE: 'workspace.create',
  WORKSPACE_BRANCH_CREATE: 'workspace.branch.create',
  TERMINAL_NODE_ATTACH: 'terminal.node.attach',
  TERMINAL_NODE_DETACH: 'terminal.node.detach',
  TERMINAL_NODE_SNAPSHOT: 'terminal.node.snapshot',
  TERMINAL_NODE_ACTIVATED: 'terminal.node.activated',
  TERMINAL_NODE_MOVE: 'terminal.node.move',
  TERMINAL_NODE_RESIZE: 'terminal.node.resize',
  TERMINAL_NODE_DELETE: 'terminal.node.delete',
  TERMINAL_NODE_RESUME: 'terminal.node.resume',
  TERMINAL_LINK_CREATE: 'terminal.link.create',
  TERMINAL_LINK_DELETE: 'terminal.link.delete',
  NODE_DELETE: 'node.delete',
  EDGE_DELETE: 'edge.delete',

  // Server → Client
  TERMINAL_STDOUT: 'terminal.stdout',
  SESSION_CREATED: 'session.created',
  SESSION_ATTACHED: 'session.attached',
  SESSION_EXITED: 'session.exited',
  SESSION_DELETED: 'session.deleted',
  SESSION_LIST_RESULT: 'session.list.result',
  NODE_CREATED: 'node.created',
  NODE_UPDATED: 'node.updated',
  EDGE_CREATED: 'edge.created',
  BRANCH_CREATED: 'branch.created',
  ERROR: 'error',
  PONG: 'pong',
  PING: 'ping',
} as const;
export type MsgType = (typeof MsgType)[keyof typeof MsgType];
