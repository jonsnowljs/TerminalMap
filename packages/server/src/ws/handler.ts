import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import {
  MsgType,
  NodeType,
  EdgeType,
  EdgeDeletePayload,
  NodeDeletePayload,
  SessionDeletePayload,
  SessionRenamePayload,
  TerminalLinkCreatePayload,
  TerminalLinkDeletePayload,
  TerminalNodeCreatePayload,
  TerminalNodeAttachPayload,
  TerminalNodeDeletePayload,
  TerminalNodeDetachPayload,
  TerminalNodeMovePayload,
  TerminalNodeResumePayload,
  TerminalNodeResizePayload,
  SessionDeletedPayload,
  TerminalNodeSnapshotPayload,
  WorkspaceBranchCreatePayload,
  type WorkspaceBranchCreateResponsePayload,
  WorkspaceDeletePayload,
  WorkspaceGetPayload,
  WorkspaceRenamePayload,
} from '@mindmap/shared';
import type { TerminalSnapshot } from '@mindmap/shared';
import type { ManagedSession, SessionManager } from '../pty/SessionManager.js';
import type { GraphService } from '../graph/GraphService.js';
import type { BranchService } from '../graph/BranchService.js';
import { WorkspaceService } from '../graph/WorkspaceService.js';
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

function summarizeOutput(output: string): string[] {
  const lines = output.replace(/\r/g, '').split('\n');
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.slice(-8);
}

function makeTerminalSnapshot(
  cwd: string,
  lastCommand: string | null,
  previewLines: string[],
  status: TerminalSnapshot['status'],
): TerminalSnapshot {
  return {
    cwd,
    lastCommand,
    previewLines,
    cursorRow: null,
    cursorCol: null,
    updatedAt: new Date().toISOString(),
    status,
  };
}

interface HandlerDeps {
  sessionManager: SessionManager;
  graphService: GraphService;
  branchService: BranchService;
  workspaceService?: WorkspaceService;
  queries: Queries;
}

export function registerWebSocket(app: FastifyInstance, deps: HandlerDeps) {
  const { sessionManager, graphService, branchService, queries } = deps;
  const workspaceService = deps.workspaceService ?? new WorkspaceService(queries);
  const emitTerminalSnapshot = (session: { workspaceId: string; activeTerminalNodeId: string | null; attachedClients: Set<WebSocket> }, snapshot: TerminalSnapshot) => {
    if (!session.activeTerminalNodeId) return;
    queries.updateTerminalNodeSnapshot(session.activeTerminalNodeId, snapshot);
    broadcast(session.attachedClients, MsgType.TERMINAL_NODE_SNAPSHOT, {
      workspaceId: session.workspaceId,
      terminalNodeId: session.activeTerminalNodeId,
      snapshot,
    });
  };

  const replayRecentOutput = (ws: WebSocket, session: ManagedSession) => {
    if (!session.activeTerminalNodeId || session.recentOutput.length === 0) {
      return;
    }

    send(ws, MsgType.TERMINAL_STDOUT, {
      workspaceId: session.workspaceId,
      terminalNodeId: session.activeTerminalNodeId,
      sessionId: session.id,
      data: Buffer.from(session.recentOutput).toString('base64'),
    });
  };

  const persistTerminalRestoreState = (session: ManagedSession) => {
    if (!session.activeTerminalNodeId) return;
    queries.updateTerminalNodeScrollback(session.activeTerminalNodeId, session.recentOutput);
    queries.updateTerminalNodeRestoreState(session.activeTerminalNodeId, {
      cwd: session.cwd,
      lastCommand: session.lastCommand,
      shell: session.shell,
      env: session.env,
      updatedAt: new Date().toISOString(),
    });
  };

  const wireManagedSession = (session: ManagedSession) => {
    session.pty.onData((data: string) => {
      broadcast(session.attachedClients, MsgType.TERMINAL_STDOUT, {
        workspaceId: session.workspaceId,
        terminalNodeId: session.activeTerminalNodeId,
        sessionId: session.id,
        data: Buffer.from(data).toString('base64'),
      });
      session.commandDetector.feed(data);
      persistTerminalRestoreState(session);
    });

    session.commandDetector.on('commandStart', (event: CommandStartEvent) => {
      session.lastCommand = event.command;
      const seq = ++session.nodeSeqCounter;
      const node = graphService.createNode(
        session.id,
        session.branchId,
        NodeType.COMMAND,
        event.command,
        seq,
        { cwd: session.cwd },
      );

      emitTerminalSnapshot(session, makeTerminalSnapshot(session.cwd, event.command, [], 'running'));
      persistTerminalRestoreState(session);

      if (session.lastNodeId) {
        const edge = graphService.createEdge(session.lastNodeId, node.id, EdgeType.SEQUENTIAL);
        broadcast(session.attachedClients, MsgType.EDGE_CREATED, { edge });
      }
      session.lastNodeId = node.id;

      broadcast(session.attachedClients, MsgType.NODE_CREATED, { node });
    });

    session.commandDetector.on('commandEnd', (event: CommandEndEvent) => {
      if (!session.lastNodeId) return;

      graphService.updateNode(session.lastNodeId, {
        exitCode: event.exitCode ?? undefined,
        durationMs: event.durationMs,
      });

      if (event.output.trim()) {
        const seq = ++session.nodeSeqCounter;
        const nodeType = (event.exitCode && event.exitCode !== 0) ? NodeType.ERROR : NodeType.OUTPUT;
        const outputNode = graphService.createNode(
          session.id,
          session.branchId,
          nodeType,
          event.output,
          seq,
          { exitCode: event.exitCode ?? undefined },
        );

        const edge = graphService.createEdge(session.lastNodeId, outputNode.id, EdgeType.SEQUENTIAL);
        broadcast(session.attachedClients, MsgType.NODE_CREATED, { node: outputNode });
        broadcast(session.attachedClients, MsgType.EDGE_CREATED, { edge });
        session.lastNodeId = outputNode.id;
      }

      emitTerminalSnapshot(
        session,
        makeTerminalSnapshot(session.cwd, session.lastCommand, summarizeOutput(event.output), 'idle'),
      );
      persistTerminalRestoreState(session);
    });

    session.pty.onExit(({ exitCode }) => {
      broadcast(session.attachedClients, MsgType.SESSION_EXITED, {
        workspaceId: session.workspaceId,
        terminalNodeId: session.activeTerminalNodeId,
        sessionId: session.id,
        exitCode,
      });
      queries.updateSessionStatus(session.id, 'exited', exitCode);
      emitTerminalSnapshot(
        session,
        makeTerminalSnapshot(session.cwd, session.lastCommand, [], 'exited'),
      );
      persistTerminalRestoreState(session);
      sessionManager.kill(session.id);
    });
  };

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

      try {
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
          const workspaceId = nanoid();
          queries.createWorkspace(workspaceId, `w-${workspaceId.slice(0, 6)}`, sessionCwd);
          queries.createSession(sessionId, workspaceId, shell || config.defaultShell, sessionCwd, null, name || `t-${sessionId.slice(0, 6)}`);
          const branchId = branchService.createRootBranch(sessionId);
          const terminalNodeId = nanoid();

          let session;
          try {
            session = sessionManager.create({
              sessionId,
              branchId,
              workspaceId,
              shell: shell || config.defaultShell,
              cwd: sessionCwd,
              cols: cols || 80,
              rows: rows || 24,
            });
            wireManagedSession(session);
          } catch (err) {
            queries.updateSessionStatus(sessionId, 'exited', -1);
            send(socket, MsgType.ERROR, {
              message: `Failed to create session: ${err instanceof Error ? err.message : err}`,
            }, id);
            break;
          }

          // Update DB with PID
          queries.updateSessionStatus(sessionId, 'active');

          const workspace = queries.getWorkspace(workspaceId);
          const initialSnapshot = makeTerminalSnapshot(sessionCwd, null, [], 'idle');
          queries.createTerminalNode(
            terminalNodeId,
            workspaceId,
            sessionId,
            name || `t-${sessionId.slice(0, 6)}`,
            null,
            'active',
            'idle',
            initialSnapshot,
            { x: 0, y: 0 },
          );
          if (!workspace?.rootTerminalNodeId) {
            queries.updateWorkspaceRootTerminalNode(workspaceId, terminalNodeId);
          }
          sessionManager.bindTerminalNode(sessionId, workspaceId, terminalNodeId);
          queries.setWorkspaceActiveTerminalNode(workspaceId, terminalNodeId);

          // Attach client
          sessionManager.attachTerminalNode(workspaceId, terminalNodeId, sessionId, socket);
          attachedSessionIds.add(sessionId);
          emitTerminalSnapshot(session, initialSnapshot);
          persistTerminalRestoreState(session);

          send(socket, MsgType.SESSION_CREATED, {
            session: {
              id: sessionId,
              name: name || null,
              shell: session.pty.process,
              cwd: session.cwd,
              status: 'active',
              branchId,
              workspaceId,
              terminalNodeId,
            },
          }, id);
          break;
        }

        case MsgType.SESSION_ATTACH: {
          const { sessionId } = payload as { sessionId: string };
          const session = sessionManager.get(sessionId);
          if (!session) {
            send(socket, MsgType.ERROR, { message: `Session ${sessionId} not found` }, id);
            return;
          }
          const attached = session.activeTerminalNodeId
            ? sessionManager.attachTerminalNode(session.workspaceId, session.activeTerminalNodeId, sessionId, socket)
            : sessionManager.attach(sessionId, socket);
          if (!attached) {
            send(socket, MsgType.ERROR, { message: `Session ${sessionId} not found` }, id);
            return;
          }
          attachedSessionIds.add(sessionId);

          // Send full graph on attach
          const graph = graphService.getSessionGraph(sessionId);
          send(socket, MsgType.SESSION_ATTACHED, {
            session: {
              id: sessionId,
              cwd: session.cwd,
              status: 'active',
              workspaceId: session.workspaceId,
              terminalNodeId: session.activeTerminalNodeId,
            },
            graph,
          }, id);
          break;
        }

        case MsgType.SESSION_DETACH: {
          const { sessionId } = payload as { sessionId: string };
          const session = sessionManager.get(sessionId);
          if (session?.activeTerminalNodeId) {
            sessionManager.detachTerminalNode(session.workspaceId, session.activeTerminalNodeId, socket);
          } else {
            sessionManager.detach(sessionId, socket);
          }
          attachedSessionIds.delete(sessionId);
          break;
        }

        case MsgType.SESSION_DELETE: {
          const { sessionId } = SessionDeletePayload.parse(payload);
          const session = sessionManager.get(sessionId);
          if (!session) {
            send(socket, MsgType.ERROR, { message: `Session ${sessionId} not found` }, id);
            break;
          }

          sessionManager.kill(sessionId);
          queries.deleteSession(sessionId);
          attachedSessionIds.delete(sessionId);
          send(socket, MsgType.SESSION_DELETED, SessionDeletedPayload.parse({ sessionId }), id);
          break;
        }

        case MsgType.SESSION_RENAME: {
          const { sessionId, name } = SessionRenamePayload.parse(payload);
          const trimmedName = name.trim();
          if (!trimmedName) {
            send(socket, MsgType.ERROR, { message: 'Session name cannot be empty' }, id);
            break;
          }

          const session = queries.getSession(sessionId);
          if (!session) {
            send(socket, MsgType.ERROR, { message: `Session ${sessionId} not found` }, id);
            break;
          }

          queries.updateSessionName(sessionId, trimmedName);
          const boundTerminal = queries.listTerminalNodes(session.workspace_id).find((node) => node.sessionId === sessionId);
          if (boundTerminal) {
            queries.updateTerminalNodeTitle(boundTerminal.terminalNodeId, trimmedName);
          }
          send(socket, MsgType.SESSION_ATTACHED, { graph: graphService.getWorkspaceGraph(session.workspace_id) }, id);
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

        case MsgType.TERMINAL_NODE_ATTACH: {
          const { workspaceId, terminalNodeId, sessionId, cols, rows } = TerminalNodeAttachPayload.parse(payload);
          const session = sessionManager.attachTerminalNode(workspaceId, terminalNodeId, sessionId, socket);
          if (!session) {
            send(socket, MsgType.ERROR, { message: `Session ${sessionId} not found` }, id);
            break;
          }
          queries.setWorkspaceActiveTerminalNode(workspaceId, terminalNodeId);
          sessionManager.resize(sessionId, cols, rows);
          attachedSessionIds.add(sessionId);
          replayRecentOutput(socket, session);
          send(socket, MsgType.TERMINAL_NODE_ACTIVATED, { workspaceId, terminalNodeId, sessionId }, id);
          emitTerminalSnapshot(
            session,
            makeTerminalSnapshot(
              session.cwd,
              session.lastCommand,
              summarizeOutput(session.recentOutput),
              'idle',
            ),
          );
          persistTerminalRestoreState(session);
          break;
        }

        case MsgType.TERMINAL_NODE_CREATE: {
          const { workspaceId, title, parentTerminalNodeId, sourceNodeId, position } = TerminalNodeCreatePayload.parse(payload);
          const workspace = queries.getWorkspace(workspaceId);
          if (!workspace) {
            send(socket, MsgType.ERROR, { message: `Workspace ${workspaceId} not found` }, id);
            break;
          }

          const sourceNode = sourceNodeId ? graphService.getWorkspaceGraphNode(workspaceId, sourceNodeId) : undefined;
          if (sourceNodeId && !sourceNode) {
            send(socket, MsgType.ERROR, { message: `Source graph node ${sourceNodeId} not found in workspace ${workspaceId}` }, id);
            break;
          }
          const parentTerminal = parentTerminalNodeId
            ? queries.getWorkspaceTerminalNode(workspaceId, parentTerminalNodeId)
            : undefined;
          if (parentTerminalNodeId && !parentTerminal) {
            send(socket, MsgType.ERROR, { message: `Parent terminal node ${parentTerminalNodeId} not found in workspace ${workspaceId}` }, id);
            break;
          }

          const sessionId = nanoid();
          const shell = config.defaultShell;
          const inheritedSnapshot = parentTerminal?.snapshot ?? null;
          const cwd = inheritedSnapshot?.cwd ?? sourceNode?.cwd ?? workspace.cwd;
          const terminalNodeId = nanoid();
          const terminalPosition = position ?? {
            x: 160 + queries.listTerminalNodes(workspaceId).length * 40,
            y: 120 + queries.listTerminalNodes(workspaceId).length * 32,
          };

          let session: ManagedSession;
          try {
            queries.createSession(sessionId, workspaceId, shell, cwd, null, title || `t-${sessionId.slice(0, 6)}`);
            const branchId = branchService.createRootBranch(sessionId);
            session = sessionManager.create({
              sessionId,
              branchId,
              workspaceId,
              shell,
              cwd,
              cols: 80,
              rows: 24,
            });
            wireManagedSession(session);
            queries.updateSessionStatus(sessionId, 'active');

            const initialSnapshot = inheritedSnapshot
              ? {
                  ...inheritedSnapshot,
                  cwd,
                  updatedAt: new Date().toISOString(),
                  status: 'idle' as const,
                }
              : makeTerminalSnapshot(cwd, null, [], 'idle');
            queries.createTerminalNode(
              terminalNodeId,
              workspaceId,
              sessionId,
              title || `t-${sessionId.slice(0, 6)}`,
              sourceNodeId ?? null,
              'active',
              'idle',
              initialSnapshot,
              terminalPosition,
            );
            if (!workspace.rootTerminalNodeId) {
              queries.updateWorkspaceRootTerminalNode(workspaceId, terminalNodeId);
            }
            sessionManager.bindTerminalNode(sessionId, workspaceId, terminalNodeId);
            queries.setWorkspaceActiveTerminalNode(workspaceId, terminalNodeId);
            if (parentTerminalNodeId) {
              queries.upsertTerminalLink(nanoid(), workspaceId, parentTerminalNodeId, terminalNodeId);
            }
            sessionManager.attachTerminalNode(workspaceId, terminalNodeId, sessionId, socket);
            attachedSessionIds.add(sessionId);
            emitTerminalSnapshot(session, initialSnapshot);
            persistTerminalRestoreState(session);

            send(socket, MsgType.SESSION_CREATED, {
              session: {
                id: sessionId,
                name: title || null,
                shell: session.pty.process,
                cwd: session.cwd,
                status: 'active',
                branchId,
                workspaceId,
                terminalNodeId,
              },
            }, id);
          } catch (err) {
            sessionManager.kill(sessionId);
            queries.deleteSession(sessionId);
            send(socket, MsgType.ERROR, {
              message: `Failed to create terminal node: ${err instanceof Error ? err.message : err}`,
            }, id);
          }
          break;
        }

        case MsgType.TERMINAL_LINK_CREATE: {
          const { workspaceId, sourceTerminalNodeId, targetTerminalNodeId, position } = TerminalLinkCreatePayload.parse(payload);
          const workspace = queries.getWorkspace(workspaceId);
          if (!workspace) {
            send(socket, MsgType.ERROR, { message: `Workspace ${workspaceId} not found` }, id);
            break;
          }

          const sourceTerminal = queries.getWorkspaceTerminalNode(workspaceId, sourceTerminalNodeId);
          if (!sourceTerminal) {
            send(socket, MsgType.ERROR, { message: `Source terminal node ${sourceTerminalNodeId} not found in workspace ${workspaceId}` }, id);
            break;
          }

          if (targetTerminalNodeId) {
            const targetTerminal = queries.getWorkspaceTerminalNode(workspaceId, targetTerminalNodeId);
            if (!targetTerminal) {
              send(socket, MsgType.ERROR, { message: `Target terminal node ${targetTerminalNodeId} not found in workspace ${workspaceId}` }, id);
              break;
            }
            queries.upsertTerminalLink(nanoid(), workspaceId, sourceTerminalNodeId, targetTerminalNodeId);
            send(socket, MsgType.SESSION_ATTACHED, { graph: graphService.getWorkspaceGraph(workspaceId) }, id);
            break;
          }

          const sessionId = nanoid();
          const shell = config.defaultShell;
          const cwd = sourceTerminal.snapshot?.cwd ?? workspace.cwd;
          const terminalNodeId = nanoid();
          const terminalPosition = position ?? {
            x: sourceTerminal.position?.x ?? 300,
            y: sourceTerminal.position?.y ?? 240,
          };

          let session: ManagedSession;
          try {
            queries.createSession(sessionId, workspaceId, shell, cwd, null, `${sourceTerminal.title} branch`);
            const branchId = branchService.createRootBranch(sessionId);
            session = sessionManager.create({
              sessionId,
              branchId,
              workspaceId,
              shell,
              cwd,
              cols: 80,
              rows: 24,
            });
            wireManagedSession(session);
            queries.updateSessionStatus(sessionId, 'active');

            const initialSnapshot = sourceTerminal.snapshot
              ? {
                  ...sourceTerminal.snapshot,
                  cwd,
                  updatedAt: new Date().toISOString(),
                  status: 'idle' as const,
                }
              : makeTerminalSnapshot(cwd, null, [], 'idle');

            queries.createTerminalNode(
              terminalNodeId,
              workspaceId,
              sessionId,
              `${sourceTerminal.title} branch`,
              null,
              'active',
              'idle',
              initialSnapshot,
              terminalPosition,
            );
            sessionManager.bindTerminalNode(sessionId, workspaceId, terminalNodeId);
            queries.upsertTerminalLink(nanoid(), workspaceId, sourceTerminalNodeId, terminalNodeId);
            queries.setWorkspaceActiveTerminalNode(workspaceId, terminalNodeId);
            sessionManager.attachTerminalNode(workspaceId, terminalNodeId, sessionId, socket);
            attachedSessionIds.add(sessionId);
            emitTerminalSnapshot(session, initialSnapshot);
            persistTerminalRestoreState(session);
            send(socket, MsgType.SESSION_CREATED, {
              session: {
                id: sessionId,
                name: `${sourceTerminal.title} branch`,
                shell: session.pty.process,
                cwd: session.cwd,
                status: 'active',
                branchId,
                workspaceId,
                terminalNodeId,
              },
              graph: graphService.getWorkspaceGraph(workspaceId),
            }, id);
          } catch (err) {
            sessionManager.kill(sessionId);
            queries.deleteSession(sessionId);
            send(socket, MsgType.ERROR, {
              message: `Failed to create terminal link: ${err instanceof Error ? err.message : err}`,
            }, id);
          }
          break;
        }

        case MsgType.NODE_DELETE: {
          const { workspaceId, nodeId } = NodeDeletePayload.parse(payload);
          const deleted = queries.deleteWorkspaceGraphNode(workspaceId, nodeId);
          if (!deleted) {
            send(socket, MsgType.ERROR, { message: `Node ${nodeId} not found in workspace ${workspaceId}` }, id);
            break;
          }
          send(socket, MsgType.SESSION_ATTACHED, { graph: graphService.getWorkspaceGraph(workspaceId) }, id);
          break;
        }

        case MsgType.EDGE_DELETE: {
          const { workspaceId, edgeId } = EdgeDeletePayload.parse(payload);
          const deleted = queries.deleteWorkspaceGraphEdge(workspaceId, edgeId);
          if (!deleted) {
            send(socket, MsgType.ERROR, { message: `Edge ${edgeId} not found in workspace ${workspaceId}` }, id);
            break;
          }
          send(socket, MsgType.SESSION_ATTACHED, { graph: graphService.getWorkspaceGraph(workspaceId) }, id);
          break;
        }

        case MsgType.TERMINAL_NODE_DELETE: {
          const { workspaceId, terminalNodeId } = TerminalNodeDeletePayload.parse(payload);
          const terminalNode = queries.getWorkspaceTerminalNode(workspaceId, terminalNodeId);
          if (!terminalNode) {
            send(socket, MsgType.ERROR, { message: `Terminal node ${terminalNodeId} not found in workspace ${workspaceId}` }, id);
            break;
          }
          const terminalAttachment = sessionManager.getTerminalAttachment(terminalNodeId);
          if (terminalAttachment?.workspaceId === workspaceId) {
            sessionManager.detachTerminalNode(workspaceId, terminalNodeId, socket);
            attachedSessionIds.delete(terminalAttachment.sessionId);
          }
          queries.deleteTerminalNode(workspaceId, terminalNodeId);
          if (terminalNode.sessionId) {
            sessionManager.kill(terminalNode.sessionId);
            queries.deleteSession(terminalNode.sessionId);
            attachedSessionIds.delete(terminalNode.sessionId);
          }
          send(socket, MsgType.SESSION_ATTACHED, { graph: graphService.getWorkspaceGraph(workspaceId) }, id);
          break;
        }

        case MsgType.TERMINAL_NODE_RESUME: {
          const { workspaceId, terminalNodeId, cols, rows } = TerminalNodeResumePayload.parse(payload);
          const terminalNode = queries.getWorkspaceTerminalNode(workspaceId, terminalNodeId);
          const workspace = queries.getWorkspace(workspaceId);
          if (!terminalNode || !workspace) {
            send(socket, MsgType.ERROR, { message: `Terminal node ${terminalNodeId} not found in workspace ${workspaceId}` }, id);
            break;
          }

          const restoreState = terminalNode.restoreState;
          const existingSessionId = terminalNode.sessionId;
          const sessionId = existingSessionId ?? nanoid();
          const shell = restoreState?.shell || config.defaultShell;
          const cwd = restoreState?.cwd || terminalNode.snapshot?.cwd || workspace.cwd;

          let session: ManagedSession;
          try {
            const persistedSession = existingSessionId ? queries.getSession(existingSessionId) : undefined;
            if (!persistedSession) {
              queries.createSession(sessionId, workspaceId, shell, cwd, null, terminalNode.title);
            }
            const existingBranch = queries.listBranches(sessionId)[0];
            const branchId = existingBranch?.id ?? branchService.createRootBranch(sessionId);
            session = sessionManager.create({
              sessionId,
              branchId,
              workspaceId,
              shell,
              cwd,
              cols,
              rows,
            });
            wireManagedSession(session);
            queries.updateSessionStatus(sessionId, 'active');
            queries.updateSessionName(sessionId, terminalNode.title);
            queries.updateTerminalNodeSessionBinding(terminalNodeId, sessionId, 'active', 'idle');
            queries.updateTerminalNodeSnapshot(
              terminalNodeId,
              makeTerminalSnapshot(cwd, restoreState?.lastCommand ?? null, summarizeOutput(terminalNode.scrollback ?? ''), 'idle'),
            );
            queries.updateTerminalNodeScrollback(terminalNodeId, terminalNode.scrollback ?? '');
            queries.updateTerminalNodeRestoreState(terminalNodeId, {
              cwd,
              lastCommand: restoreState?.lastCommand ?? null,
              shell,
              env: restoreState?.env ?? {},
              updatedAt: new Date().toISOString(),
            });
            queries.updateTerminalNodeTitle(terminalNodeId, terminalNode.title);
            queries.setWorkspaceActiveTerminalNode(workspaceId, terminalNodeId);
            sessionManager.bindTerminalNode(sessionId, workspaceId, terminalNodeId);
            sessionManager.attachTerminalNode(workspaceId, terminalNodeId, sessionId, socket);
            attachedSessionIds.add(sessionId);
            persistTerminalRestoreState(session);
            replayRecentOutput(socket, session);
            send(socket, MsgType.SESSION_CREATED, {
              session: {
                id: sessionId,
                name: terminalNode.title,
                shell: session.pty.process,
                cwd: session.cwd,
                status: 'active',
                branchId,
                workspaceId,
                terminalNodeId,
              },
              graph: graphService.getWorkspaceGraph(workspaceId),
            }, id);
          } catch (err) {
            sessionManager.kill(sessionId);
            if (!existingSessionId) {
              queries.deleteSession(sessionId);
            }
            send(socket, MsgType.ERROR, {
              message: `Failed to resume terminal node: ${err instanceof Error ? err.message : err}`,
            }, id);
          }
          break;
        }

        case MsgType.TERMINAL_LINK_DELETE: {
          const { workspaceId, terminalLinkId } = TerminalLinkDeletePayload.parse(payload);
          const deleted = queries.deleteTerminalLink(workspaceId, terminalLinkId);
          if (!deleted) {
            send(socket, MsgType.ERROR, { message: `Terminal link ${terminalLinkId} not found in workspace ${workspaceId}` }, id);
            break;
          }
          send(socket, MsgType.SESSION_ATTACHED, { graph: graphService.getWorkspaceGraph(workspaceId) }, id);
          break;
        }

        case MsgType.TERMINAL_NODE_DETACH: {
          const { workspaceId, terminalNodeId } = TerminalNodeDetachPayload.parse(payload);
          const attachment = sessionManager.getTerminalAttachment(terminalNodeId);
          const session = attachment ? sessionManager.get(attachment.sessionId) : undefined;
          if (attachment?.workspaceId === workspaceId && session) {
            sessionManager.detachTerminalNode(workspaceId, terminalNodeId, socket);
          }
          break;
        }

        case MsgType.TERMINAL_NODE_MOVE: {
          const { workspaceId, terminalNodeId, position } = TerminalNodeMovePayload.parse(payload);
          const terminalNode = queries.getWorkspaceTerminalNode(workspaceId, terminalNodeId);
          if (!terminalNode) {
            send(socket, MsgType.ERROR, { message: `Terminal node ${terminalNodeId} not found in workspace ${workspaceId}` }, id);
            break;
          }
          queries.updateTerminalNodePosition(terminalNodeId, position);
          break;
        }

        case MsgType.TERMINAL_NODE_RESIZE: {
          const { workspaceId, terminalNodeId, size } = TerminalNodeResizePayload.parse(payload);
          const terminalNode = queries.getWorkspaceTerminalNode(workspaceId, terminalNodeId);
          if (!terminalNode) {
            send(socket, MsgType.ERROR, { message: `Terminal node ${terminalNodeId} not found in workspace ${workspaceId}` }, id);
            break;
          }
          queries.updateTerminalNodeSize(terminalNodeId, size);
          break;
        }

        case MsgType.TERMINAL_NODE_SNAPSHOT: {
          const { workspaceId, terminalNodeId, snapshot } = TerminalNodeSnapshotPayload.parse(payload);
          queries.updateTerminalNodeSnapshot(terminalNodeId, snapshot);
          const attachment = sessionManager.getTerminalAttachment(terminalNodeId);
          const session = attachment ? sessionManager.get(attachment.sessionId) : undefined;
          if (attachment?.workspaceId === workspaceId && session) {
            broadcast(session.attachedClients, MsgType.TERMINAL_NODE_SNAPSHOT, { workspaceId, terminalNodeId, snapshot });
          }
          break;
        }

        case MsgType.SESSION_LIST: {
          const sessions = queries.listSessions().map((s) => {
            const workspace = queries.getWorkspace(s.workspace_id);
            const terminalNode = queries.getTerminalNodeBySessionId(s.id);
            return {
              id: s.id,
              name: s.name ?? null,
              cwd: s.cwd,
              status: s.status,
              workspaceId: s.workspace_id,
              workspaceName: workspace?.name ?? null,
              terminalNodeId: terminalNode?.terminalNodeId ?? null,
            };
          });
          send(socket, MsgType.SESSION_LIST_RESULT, { sessions }, id);
          break;
        }

        case MsgType.WORKSPACE_GET: {
          const { workspaceId } = WorkspaceGetPayload.parse(payload);
          const graph = graphService.getWorkspaceGraph(workspaceId);
          send(socket, MsgType.SESSION_ATTACHED, { graph }, id);
          break;
        }

        case MsgType.WORKSPACE_RENAME: {
          const { workspaceId, name } = WorkspaceRenamePayload.parse(payload);
          const trimmedName = name.trim();
          if (!trimmedName) {
            send(socket, MsgType.ERROR, { message: 'Workspace name cannot be empty' }, id);
            break;
          }
          const workspace = queries.getWorkspace(workspaceId);
          if (!workspace) {
            send(socket, MsgType.ERROR, { message: `Workspace ${workspaceId} not found` }, id);
            break;
          }
          queries.updateWorkspaceName(workspaceId, trimmedName);
          send(socket, MsgType.SESSION_ATTACHED, { graph: graphService.getWorkspaceGraph(workspaceId) }, id);
          break;
        }

        case MsgType.WORKSPACE_DELETE: {
          const { workspaceId } = WorkspaceDeletePayload.parse(payload);
          const workspace = queries.getWorkspace(workspaceId);
          if (!workspace) {
            send(socket, MsgType.ERROR, { message: `Workspace ${workspaceId} not found` }, id);
            break;
          }

          const terminalNodes = queries.listTerminalNodes(workspaceId);
          for (const terminalNode of terminalNodes) {
            const terminalAttachment = sessionManager.getTerminalAttachment(terminalNode.terminalNodeId);
            if (terminalAttachment?.workspaceId === workspaceId) {
              sessionManager.detachTerminalNode(workspaceId, terminalNode.terminalNodeId, socket);
              attachedSessionIds.delete(terminalAttachment.sessionId);
            }
            if (terminalNode.sessionId) {
              sessionManager.kill(terminalNode.sessionId);
              attachedSessionIds.delete(terminalNode.sessionId);
            }
          }

          queries.deleteWorkspace(workspaceId);
          send(socket, MsgType.SESSION_DELETED, { workspaceId }, id);
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

        case MsgType.WORKSPACE_BRANCH_CREATE: {
          const { workspaceId, sourceNodeId, sourceTerminalNodeId, creationMode } = WorkspaceBranchCreatePayload.parse(payload);
          const sourceWorkspace = queries.getWorkspace(workspaceId);
          if (!sourceWorkspace) {
            send(socket, MsgType.ERROR, { message: `Workspace ${workspaceId} not found` }, id);
            break;
          }

          const sourceNode = graphService.getWorkspaceGraphNode(workspaceId, sourceNodeId);
          if (!sourceNode) {
            send(socket, MsgType.ERROR, { message: `Source graph node ${sourceNodeId} not found in workspace ${workspaceId}` }, id);
            break;
          }

          const sourceTerminal = queries.getWorkspaceTerminalNode(workspaceId, sourceTerminalNodeId);
          if (!sourceTerminal) {
            send(socket, MsgType.ERROR, { message: `Source terminal node ${sourceTerminalNodeId} not found in workspace ${workspaceId}` }, id);
            break;
          }

          if (creationMode === 'clone_live_terminal' && sourceTerminal.sessionId === null) {
            send(socket, MsgType.ERROR, { message: `Cannot clone disconnected terminal node ${sourceTerminalNodeId}` }, id);
            break;
          }

          const childWorkspaceId = nanoid();
          const childSessionId = nanoid();
          const branchCwd = sourceTerminal.snapshot?.cwd ?? sourceNode.cwd ?? sourceWorkspace.cwd;
          const childWorkspaceName = `w-${childWorkspaceId.slice(0, 6)}`;
          const childShell = config.defaultShell;

          queries.createWorkspace(childWorkspaceId, childWorkspaceName, branchCwd, {
            parentWorkspaceId: workspaceId,
            createdFromNodeId: sourceNodeId,
            rootTerminalNodeId: null,
          });

          queries.createSession(
            childSessionId,
            childWorkspaceId,
            childShell,
            branchCwd,
            null,
            creationMode === 'clone_live_terminal' ? sourceTerminal.title : `t-${childSessionId.slice(0, 6)}`,
          );
          const childBranchId = branchService.createRootBranch(childSessionId);

          let session: ManagedSession;
          try {
            session = sessionManager.create({
              sessionId: childSessionId,
              branchId: childBranchId,
              workspaceId: childWorkspaceId,
              shell: childShell,
              cwd: branchCwd,
              cols: 80,
              rows: 24,
            });
            wireManagedSession(session);
            queries.updateSessionStatus(childSessionId, 'active');
            const branchResult = workspaceService.createWorkspaceBranch({
              workspaceId: childWorkspaceId,
              sessionId: childSessionId,
              sourceWorkspaceId: workspaceId,
              sourceNodeId,
              sourceTerminalNodeId,
              creationMode,
              cwd: branchCwd,
              title: creationMode === 'clone_live_terminal' ? sourceTerminal.title : `t-${childSessionId.slice(0, 6)}`,
              position: { x: 0, y: 0 },
            });

            const activeTerminalNodeId = branchResult.graph.activeTerminalNodeId ?? branchResult.workspace.rootTerminalNodeId;
            if (!activeTerminalNodeId) {
              throw new Error('Branch workspace did not create an active terminal node');
            }

            sessionManager.bindTerminalNode(childSessionId, childWorkspaceId, activeTerminalNodeId);
            sessionManager.attachTerminalNode(childWorkspaceId, activeTerminalNodeId, childSessionId, socket);
            attachedSessionIds.add(childSessionId);
            emitTerminalSnapshot(session, branchResult.graph.terminalNodes[0]?.snapshot ?? {
              cwd: branchCwd,
              lastCommand: null,
              previewLines: [],
              cursorRow: null,
              cursorCol: null,
              updatedAt: new Date().toISOString(),
              status: 'idle',
            });

            const resultPayload: WorkspaceBranchCreateResponsePayload = {
              workspaceId: childWorkspaceId,
              workspace: branchResult.workspace,
              graph: branchResult.graph,
            };
            send(socket, MsgType.BRANCH_CREATED, resultPayload, id);
          } catch (err) {
            sessionManager.kill(childSessionId);
            queries.deleteWorkspace(childWorkspaceId);
            send(socket, MsgType.ERROR, {
              message: `Failed to create workspace branch: ${err instanceof Error ? err.message : err}`,
            }, id);
          }
          break;
        }

        case MsgType.PING: {
          send(socket, MsgType.PONG, {}, id);
          break;
        }

        default:
          send(socket, MsgType.ERROR, { message: `Unknown message type: ${type}` }, id);
        }
      } catch (err) {
        send(socket, MsgType.ERROR, {
          message: err instanceof Error ? err.message : 'WebSocket handler error',
        }, id);
      }
    });

    socket.on('close', () => {
      sessionManager.detachAll(socket);
      attachedSessionIds.clear();
    });
  });
}
