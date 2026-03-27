import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import { MsgType, NodeType, EdgeType } from '@mindmap/shared';
import type { SessionManager } from '../pty/SessionManager.js';
import type { GraphService } from '../graph/GraphService.js';
import type { BranchService } from '../graph/BranchService.js';
import type { Queries } from '../db/queries.js';
import type { CommandStartEvent, CommandEndEvent } from '../pty/CommandDetector.js';
import { config } from '../config.js';

interface WsMessage {
  id: string;
  type: string;
  seq: number;
  payload: Record<string, unknown>;
}

function send(ws: WebSocket, type: string, payload: unknown, replyTo?: string) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify({
    id: replyTo || nanoid(),
    type,
    seq: 0,
    payload,
  }));
}

function broadcast(clients: Set<WebSocket>, type: string, payload: unknown) {
  const msg = JSON.stringify({
    id: nanoid(),
    type,
    seq: 0,
    payload,
  });
  for (const client of clients) {
    if (client.readyState === client.OPEN) {
      client.send(msg);
    }
  }
}

interface HandlerDeps {
  sessionManager: SessionManager;
  graphService: GraphService;
  branchService: BranchService;
  queries: Queries;
}

export function registerWebSocket(app: FastifyInstance, deps: HandlerDeps) {
  const { sessionManager, graphService, branchService, queries } = deps;

  app.get('/ws', { websocket: true }, (socket: WebSocket) => {
    const attachedSessionIds = new Set<string>();

    socket.on('message', (raw: Buffer) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send(socket, MsgType.ERROR, { message: 'Invalid JSON' });
        return;
      }

      const { type, payload, id } = msg;

      switch (type) {
        case MsgType.SESSION_CREATE: {
          const { name, shell, cwd, cols, rows } = payload as {
            name?: string;
            shell?: string;
            cwd?: string;
            cols: number;
            rows: number;
          };

          const sessionId = nanoid();
          const sessionCwd = cwd || config.defaultCwd;

          // Create workspace + session + branch in DB (order matters for FK constraints)
          const workspaceId = queries.getOrCreateWorkspace(sessionCwd);
          queries.createSession(sessionId, workspaceId, shell || config.defaultShell, sessionCwd, null);
          const branchId = branchService.createRootBranch(sessionId);

          let session;
          try {
            session = sessionManager.create({
              sessionId,
              branchId,
              shell: shell || config.defaultShell,
              cwd: sessionCwd,
              cols: cols || 80,
              rows: rows || 24,
            });
          } catch (err) {
            queries.updateSessionStatus(sessionId, 'exited', -1);
            send(socket, MsgType.ERROR, {
              message: `Failed to create session: ${err instanceof Error ? err.message : err}`,
            }, id);
            break;
          }

          // Update DB with PID
          queries.updateSessionStatus(sessionId, 'active');

          // Attach client
          sessionManager.attach(sessionId, socket);
          attachedSessionIds.add(sessionId);

          // Wire PTY output → clients + command detector
          session.pty.onData((data: string) => {
            // Send raw output to all attached clients
            broadcast(session.attachedClients, MsgType.TERMINAL_STDOUT, {
              sessionId,
              data: Buffer.from(data).toString('base64'),
            });
            // Feed to command detector
            session.commandDetector.feed(data);
          });

          // Wire command detector events → graph + broadcast
          session.commandDetector.on('commandStart', (event: CommandStartEvent) => {
            const seq = ++session.nodeSeqCounter;
            const node = graphService.createNode(
              sessionId, session.branchId, NodeType.COMMAND,
              event.command, seq,
              { cwd: session.cwd },
            );

            // Create edge from previous node
            if (session.lastNodeId) {
              const edge = graphService.createEdge(session.lastNodeId, node.id, EdgeType.SEQUENTIAL);
              broadcast(session.attachedClients, MsgType.EDGE_CREATED, { edge });
            }
            session.lastNodeId = node.id;

            broadcast(session.attachedClients, MsgType.NODE_CREATED, { node });
          });

          session.commandDetector.on('commandEnd', (event: CommandEndEvent) => {
            if (!session.lastNodeId) return;

            // Update the command node with exit code and duration
            graphService.updateNode(session.lastNodeId, {
              exitCode: event.exitCode ?? undefined,
              durationMs: event.durationMs,
            });

            // Create output node if there's output
            if (event.output.trim()) {
              const seq = ++session.nodeSeqCounter;
              const nodeType = (event.exitCode && event.exitCode !== 0) ? NodeType.ERROR : NodeType.OUTPUT;
              const outputNode = graphService.createNode(
                sessionId, session.branchId, nodeType,
                event.output, seq,
                { exitCode: event.exitCode ?? undefined },
              );

              const edge = graphService.createEdge(session.lastNodeId, outputNode.id, EdgeType.SEQUENTIAL);
              broadcast(session.attachedClients, MsgType.NODE_CREATED, { node: outputNode });
              broadcast(session.attachedClients, MsgType.EDGE_CREATED, { edge });
              session.lastNodeId = outputNode.id;
            }
          });

          session.pty.onExit(({ exitCode }) => {
            broadcast(session.attachedClients, MsgType.SESSION_EXITED, {
              sessionId,
              exitCode,
            });
            queries.updateSessionStatus(sessionId, 'exited', exitCode);
            sessionManager.kill(sessionId);
          });

          send(socket, MsgType.SESSION_CREATED, {
            session: {
              id: sessionId,
              name: name || null,
              shell: session.pty.process,
              cwd: session.cwd,
              status: 'active',
              branchId,
            },
          }, id);
          break;
        }

        case MsgType.SESSION_ATTACH: {
          const { sessionId } = payload as { sessionId: string };
          const session = sessionManager.attach(sessionId, socket);
          if (!session) {
            send(socket, MsgType.ERROR, { message: `Session ${sessionId} not found` }, id);
            return;
          }
          attachedSessionIds.add(sessionId);

          // Send full graph on attach
          const graph = graphService.getSessionGraph(sessionId);
          send(socket, MsgType.SESSION_ATTACHED, {
            session: { id: sessionId, cwd: session.cwd, status: 'active' },
            graph,
          }, id);
          break;
        }

        case MsgType.SESSION_DETACH: {
          const { sessionId } = payload as { sessionId: string };
          sessionManager.detach(sessionId, socket);
          attachedSessionIds.delete(sessionId);
          break;
        }

        case MsgType.TERMINAL_STDIN: {
          const { sessionId, data } = payload as { sessionId: string; data: string };
          sessionManager.write(sessionId, data);
          break;
        }

        case MsgType.SESSION_RESIZE: {
          const { sessionId, cols, rows } = payload as { sessionId: string; cols: number; rows: number };
          sessionManager.resize(sessionId, cols, rows);
          break;
        }

        case MsgType.SESSION_LIST: {
          const sessions = sessionManager.listActive().map(s => ({
            id: s.id,
            cwd: s.cwd,
            status: 'active',
          }));
          send(socket, MsgType.SESSION_LIST_RESULT, { sessions }, id);
          break;
        }

        case MsgType.GRAPH_GET: {
          const { sessionId } = payload as { sessionId: string };
          const graph = graphService.getSessionGraph(sessionId);
          send(socket, MsgType.SESSION_ATTACHED, { graph }, id);
          break;
        }

        case MsgType.GRAPH_SEARCH: {
          const { sessionId, query } = payload as { sessionId: string; query: string };
          const results = graphService.searchNodes(sessionId, query);
          send(socket, 'graph.search.result', { nodes: results }, id);
          break;
        }

        case MsgType.BRANCH_CREATE: {
          const { sessionId, nodeId, name: branchName } = payload as {
            sessionId: string;
            nodeId: string;
            name?: string;
          };

          const session = sessionManager.get(sessionId);
          if (!session) {
            send(socket, MsgType.ERROR, { message: `Session ${sessionId} not found` }, id);
            break;
          }

          // Create new branch in DB
          const newBranchId = branchService.branchFromNode(sessionId, nodeId, branchName);

          // Update session's active branch
          session.branchId = newBranchId;
          session.lastNodeId = nodeId; // Continue the chain from the fork node

          // Notify clients
          const branches = branchService.listBranches(sessionId);
          broadcast(session.attachedClients, MsgType.BRANCH_CREATED, {
            branchId: newBranchId,
            forkNodeId: nodeId,
            branches,
          });

          send(socket, MsgType.BRANCH_CREATED, { branchId: newBranchId, branches }, id);
          break;
        }

        case MsgType.BRANCH_SWITCH: {
          const { sessionId, branchId: targetBranchId } = payload as {
            sessionId: string;
            branchId: string;
          };

          const session = sessionManager.get(sessionId);
          if (!session) {
            send(socket, MsgType.ERROR, { message: `Session ${sessionId} not found` }, id);
            break;
          }

          session.branchId = targetBranchId;

          // Find the last node on this branch to continue the chain
          const branchNodes = graphService.getSessionGraph(sessionId).nodes
            .filter(n => n.branchId === targetBranchId);
          session.lastNodeId = branchNodes.length > 0
            ? branchNodes[branchNodes.length - 1].id
            : null;

          send(socket, 'branch.switched', { branchId: targetBranchId }, id);
          break;
        }

        case MsgType.BRANCH_LIST: {
          const { sessionId } = payload as { sessionId: string };
          const branches = branchService.listBranches(sessionId);
          send(socket, 'branch.list.result', { branches }, id);
          break;
        }

        case MsgType.PING: {
          send(socket, MsgType.PONG, {}, id);
          break;
        }

        default:
          send(socket, MsgType.ERROR, { message: `Unknown message type: ${type}` }, id);
      }
    });

    socket.on('close', () => {
      sessionManager.detachAll(socket);
      attachedSessionIds.clear();
    });
  });
}
