export const NodeType = {
  PROMPT: 'prompt',
  COMMAND: 'command',
  OUTPUT: 'output',
  ERROR: 'error',
  FILE_EDIT: 'file_edit',
  EXPLORATION: 'exploration',
  NOTE: 'note',
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

// WebSocket message types
export const MsgType = {
  // Client → Server
  SESSION_CREATE: 'session.create',
  SESSION_ATTACH: 'session.attach',
  SESSION_DETACH: 'session.detach',
  SESSION_RESIZE: 'session.resize',
  SESSION_LIST: 'session.list',
  TERMINAL_STDIN: 'terminal.stdin',
  GRAPH_GET: 'graph.get',
  GRAPH_SEARCH: 'graph.search',
  BRANCH_CREATE: 'branch.create',
  BRANCH_SWITCH: 'branch.switch',
  BRANCH_LIST: 'branch.list',
  NODE_ANNOTATE: 'node.annotate',

  // Server → Client
  TERMINAL_STDOUT: 'terminal.stdout',
  SESSION_CREATED: 'session.created',
  SESSION_ATTACHED: 'session.attached',
  SESSION_EXITED: 'session.exited',
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
