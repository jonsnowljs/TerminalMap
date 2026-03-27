import * as pty from 'node-pty';
import { accessSync, chmodSync, constants, statSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import type { WebSocket } from 'ws';
import { config } from '../config.js';
import { CommandDetector } from './CommandDetector.js';

export interface ManagedSession {
  id: string;
  workspaceId: string;
  pty: pty.IPty;
  commandDetector: CommandDetector;
  attachedClients: Set<WebSocket>;
  cols: number;
  rows: number;
  cwd: string;
  shell: string;
  env: Record<string, string>;
  branchId: string;
  activeTerminalNodeId: string | null;
  lastCommand: string | null;
  recentOutput: string;
  nodeSeqCounter: number;
  lastNodeId: string | null;
}

export interface WorkspaceAttachment {
  workspaceId: string;
  terminalNodeId: string;
  sessionId: string;
}

export interface CreateSessionOpts {
  sessionId: string;
  branchId: string;
  workspaceId: string;
  shell?: string;
  cwd?: string;
  cols: number;
  rows: number;
}

export class SessionManager {
  private sessions = new Map<string, ManagedSession>();
  private attachmentsByTerminalNode = new Map<string, WorkspaceAttachment>();
  private static readonly MAX_RECENT_OUTPUT_BYTES = 64 * 1024;
  private static nodePtyHelperChecked = false;

  private isExecutableFile(path: string): boolean {
    try {
      accessSync(path, constants.X_OK);
      return statSync(path).isFile();
    } catch {
      return false;
    }
  }

  private isUsableDirectory(path: string): boolean {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  }

  private resolveShell(preferredShell?: string): string {
    const candidates = [
      preferredShell,
      config.defaultShell,
      '/bin/zsh',
      '/bin/bash',
      '/bin/sh',
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);

    for (const candidate of candidates) {
      if (this.isExecutableFile(candidate)) {
        return candidate;
      }
    }

    throw new Error(`No executable shell found. Tried: ${candidates.join(', ')}`);
  }

  private resolveCwd(preferredCwd?: string): string {
    if (preferredCwd && this.isUsableDirectory(preferredCwd)) {
      return preferredCwd;
    }
    if (this.isUsableDirectory(config.defaultCwd)) {
      return config.defaultCwd;
    }
    return process.cwd();
  }

  private ensureNodePtyHelperExecutable(): void {
    if (SessionManager.nodePtyHelperChecked || process.platform !== 'darwin') {
      return;
    }
    SessionManager.nodePtyHelperChecked = true;

    try {
      const require = createRequire(import.meta.url);
      const packageJsonPath = require.resolve('node-pty/package.json');
      const helperPath = join(dirname(packageJsonPath), 'prebuilds', `darwin-${process.arch}`, 'spawn-helper');

      if (this.isExecutableFile(helperPath)) {
        return;
      }

      chmodSync(helperPath, 0o755);

      if (!this.isExecutableFile(helperPath)) {
        throw new Error(`spawn-helper is still not executable at ${helperPath}`);
      }
    } catch (error) {
      SessionManager.nodePtyHelperChecked = false;
      throw new Error(
        `Failed to prepare node-pty spawn-helper: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  create(opts: CreateSessionOpts): ManagedSession {
    this.ensureNodePtyHelperExecutable();

    const shell = this.resolveShell(opts.shell);
    const cwd = this.resolveCwd(opts.cwd);

    // Filter env to only string values (node-pty requires this)
    const env: Record<string, string> = {};
    for (const [key, val] of Object.entries(process.env)) {
      if (val !== undefined) env[key] = val;
    }
    env.TERM = 'xterm-256color';
    env.COLORTERM = 'truecolor';
    if (!env.LANG) {
      env.LANG = 'C.UTF-8';
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
      workspaceId: opts.workspaceId,
      pty: ptyProcess,
      commandDetector: new CommandDetector(),
      attachedClients: new Set(),
      cols: opts.cols,
      rows: opts.rows,
      cwd,
      shell,
      env,
      branchId: opts.branchId,
      activeTerminalNodeId: null,
      lastCommand: null,
      recentOutput: '',
      nodeSeqCounter: 0,
      lastNodeId: null,
    };

    ptyProcess.onData((data: string) => {
      const next = session.recentOutput + data;
      session.recentOutput = next.length > SessionManager.MAX_RECENT_OUTPUT_BYTES
        ? next.slice(-SessionManager.MAX_RECENT_OUTPUT_BYTES)
        : next;
    });

    this.sessions.set(opts.sessionId, session);
    return session;
  }

  get(sessionId: string): ManagedSession | undefined {
    return this.sessions.get(sessionId);
  }

  bindTerminalNode(sessionId: string, workspaceId: string, terminalNodeId: string): ManagedSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    session.workspaceId = workspaceId;
    session.activeTerminalNodeId = terminalNodeId;
    return session;
  }

  attach(sessionId: string, ws: WebSocket): ManagedSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.attachedClients.add(ws);
    }
    return session;
  }

  attachTerminalNode(workspaceId: string, terminalNodeId: string, sessionId: string, ws: WebSocket): ManagedSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    session.attachedClients.add(ws);
    session.workspaceId = workspaceId;
    session.activeTerminalNodeId = terminalNodeId;
    this.attachmentsByTerminalNode.set(terminalNodeId, { workspaceId, terminalNodeId, sessionId });
    return session;
  }

  detach(sessionId: string, ws: WebSocket): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.attachedClients.delete(ws);
      if (session.attachedClients.size === 0) {
        for (const [terminalNodeId, attachment] of this.attachmentsByTerminalNode.entries()) {
          if (attachment.sessionId === sessionId) {
            this.attachmentsByTerminalNode.delete(terminalNodeId);
          }
        }
      }
    }
  }

  detachAll(ws: WebSocket): void {
    for (const session of this.sessions.values()) {
      session.attachedClients.delete(ws);
    }
    for (const [terminalNodeId, attachment] of this.attachmentsByTerminalNode.entries()) {
      const session = this.sessions.get(attachment.sessionId);
      if (!session || session.attachedClients.size === 0) {
        this.attachmentsByTerminalNode.delete(terminalNodeId);
      }
    }
  }

  detachTerminalNode(workspaceId: string, terminalNodeId: string, ws: WebSocket): void {
    const attachment = this.attachmentsByTerminalNode.get(terminalNodeId);
    const session = attachment ? this.sessions.get(attachment.sessionId) : undefined;
    if (!attachment || attachment.workspaceId !== workspaceId || !session) {
      return;
    }

    session.attachedClients.delete(ws);
    if (session.attachedClients.size === 0) {
      this.attachmentsByTerminalNode.delete(terminalNodeId);
    }
  }

  getActiveTerminalNode(workspaceId: string): string | null {
    for (const attachment of this.attachmentsByTerminalNode.values()) {
      if (attachment.workspaceId === workspaceId) {
        return attachment.terminalNodeId;
      }
    }
    return null;
  }

  getWorkspaceAttachment(workspaceId: string): WorkspaceAttachment | undefined {
    for (const attachment of this.attachmentsByTerminalNode.values()) {
      if (attachment.workspaceId === workspaceId) {
        return attachment;
      }
    }
    return undefined;
  }

  getTerminalAttachment(terminalNodeId: string): WorkspaceAttachment | undefined {
    return this.attachmentsByTerminalNode.get(terminalNodeId);
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
      for (const [terminalNodeId, attachment] of this.attachmentsByTerminalNode.entries()) {
        if (attachment.sessionId === sessionId) {
          this.attachmentsByTerminalNode.delete(terminalNodeId);
        }
      }
      session.activeTerminalNodeId = null;
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
    this.attachmentsByTerminalNode.clear();
  }
}
