import * as pty from 'node-pty';
import type { WebSocket } from 'ws';
import { config } from '../config.js';
import { CommandDetector } from './CommandDetector.js';

export interface ManagedSession {
  id: string;
  pty: pty.IPty;
  commandDetector: CommandDetector;
  attachedClients: Set<WebSocket>;
  cols: number;
  rows: number;
  cwd: string;
  branchId: string;
  nodeSeqCounter: number;
  lastNodeId: string | null;
}

export interface CreateSessionOpts {
  sessionId: string;
  branchId: string;
  shell?: string;
  cwd?: string;
  cols: number;
  rows: number;
}

export class SessionManager {
  private sessions = new Map<string, ManagedSession>();

  create(opts: CreateSessionOpts): ManagedSession {
    const shell = opts.shell || config.defaultShell;
    const cwd = opts.cwd || config.defaultCwd;

    // Filter env to only string values (node-pty requires this)
    const env: Record<string, string> = {};
    for (const [key, val] of Object.entries(process.env)) {
      if (val !== undefined) env[key] = val;
    }

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd,
      env,
    });

    const session: ManagedSession = {
      id: opts.sessionId,
      pty: ptyProcess,
      commandDetector: new CommandDetector(),
      attachedClients: new Set(),
      cols: opts.cols,
      rows: opts.rows,
      cwd,
      branchId: opts.branchId,
      nodeSeqCounter: 0,
      lastNodeId: null,
    };

    this.sessions.set(opts.sessionId, session);
    return session;
  }

  get(sessionId: string): ManagedSession | undefined {
    return this.sessions.get(sessionId);
  }

  attach(sessionId: string, ws: WebSocket): ManagedSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.attachedClients.add(ws);
    }
    return session;
  }

  detach(sessionId: string, ws: WebSocket): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.attachedClients.delete(ws);
    }
  }

  detachAll(ws: WebSocket): void {
    for (const session of this.sessions.values()) {
      session.attachedClients.delete(ws);
    }
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Feed stdin to command detector for command boundary tracking
      session.commandDetector.onStdin(data);
      session.pty.write(data);
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.pty.resize(cols, rows);
      session.cols = cols;
      session.rows = rows;
    }
  }

  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.pty.kill();
      this.sessions.delete(sessionId);
    }
  }

  listActive(): ManagedSession[] {
    return Array.from(this.sessions.values());
  }

  killAll(): void {
    for (const session of this.sessions.values()) {
      session.pty.kill();
    }
    this.sessions.clear();
  }
}
