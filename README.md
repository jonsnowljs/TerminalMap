# Terminal Mindmap

A local-first developer tool that transforms terminal sessions into a **branchable, searchable execution graph**. Think "Git + terminal + chat + debugger combined."

Every command you run becomes a node in a visual DAG. You can branch from any point, explore ideas freely, and never lose context.

## Quick Start

```bash
pnpm install
pnpm dev          # starts both server (:3001) and client (:5173)
```

Or run individually:

```bash
pnpm dev:server   # backend on http://localhost:3001
pnpm dev:client   # frontend on http://localhost:5173
```

Open http://localhost:5173 in your browser.

## Architecture

### Monorepo Structure

```
packages/
  shared/         @mindmap/shared — types, constants, WebSocket protocol schemas
  server/         @mindmap/server — Node.js backend (Fastify + node-pty + SQLite)
  client/         @mindmap/client — React frontend (Vite + React Flow + xterm.js)
```

### System Overview

```
┌─────────────────────────────────────────────────┐
│                   Browser                        │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐ │
│  │ Sidebar  │  │ GraphView│  │  TimelineView  │ │
│  │ Sessions │  │ (React   │  │  (chronological│ │
│  │ Branches │  │  Flow)   │  │   list)        │ │
│  └──────────┘  └──────────┘  └───────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │          Terminal (xterm.js)                 │ │
│  └─────────────────────────────────────────────┘ │
│                    │ WebSocket                    │
└────────────────────┼────────────────────────────┘
                     │
┌────────────────────┼────────────────────────────┐
│              Node.js Server                      │
│  ┌──────────────┐  ┌───────────────────────┐    │
│  │ SessionManager│  │  CommandDetector       │    │
│  │ (node-pty)   │──│  (OSC 133 + regex)     │    │
│  └──────────────┘  └───────────┬───────────┘    │
│                                │                 │
│  ┌──────────────┐  ┌──────────┴────────────┐    │
│  │ BranchService│  │  GraphService          │    │
│  └──────┬───────┘  └──────────┬────────────┘    │
│         │                     │                  │
│  ┌──────┴─────────────────────┴────────────┐    │
│  │         SQLite (better-sqlite3)          │    │
│  │   WAL mode · FTS5 search · FK indexes    │    │
│  └──────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Graph visualization | React Flow (dagre layout) |
| Terminal emulator | xterm.js v6 |
| State management | Zustand |
| Backend | Node.js, Fastify, @fastify/websocket |
| PTY management | node-pty |
| Database | SQLite via better-sqlite3 (WAL mode) |
| Protocol | Zod-validated WebSocket messages |

### Data Model

```
Workspace → Sessions → Branches → Nodes → Edges
```

- **Nodes** represent events: commands, output, errors, notes, explorations
- **Edges** represent causality: what led to what
- **Branches** enable forking from any node to explore alternatives
- **Sessions** persist independently of the UI (survive page reloads)

### Key Components

#### Backend

| File | Purpose |
|------|---------|
| `server/src/pty/SessionManager.ts` | PTY lifecycle — create, attach, detach, resize, kill |
| `server/src/pty/CommandDetector.ts` | Two-tier command boundary detection (OSC 133 shell integration + regex fallback) |
| `server/src/pty/OutputBuffer.ts` | Accumulates output between commands (1MB cap) |
| `server/src/graph/GraphService.ts` | Node/edge CRUD against SQLite |
| `server/src/graph/BranchService.ts` | Branch creation and traversal |
| `server/src/ws/handler.ts` | WebSocket message dispatch — session management, terminal I/O, graph queries, branching |
| `server/src/db/schema.sql` | Database DDL — workspaces, sessions, branches, nodes, edges, FTS5 |

#### Frontend

| File | Purpose |
|------|---------|
| `client/src/hooks/useWebSocket.ts` | Custom WebSocket client with reconnect, request/response correlation |
| `client/src/hooks/useTerminal.ts` | xterm.js lifecycle via useRef, ResizeObserver for auto-fit |
| `client/src/store/graphStore.ts` | Zustand store for nodes, edges, branches, view mode |
| `client/src/components/graph/GraphView.tsx` | React Flow canvas with context menu for branching |
| `client/src/components/graph/CommandNode.tsx` | Custom node: command with exit code and duration |
| `client/src/components/graph/OutputNode.tsx` | Custom node: truncated output preview |
| `client/src/components/graph/ErrorNode.tsx` | Custom node: error with exit code |
| `client/src/components/timeline/TimelineView.tsx` | Chronological list view of all nodes |
| `client/src/components/layout/Sidebar.tsx` | Session list, branch tree, new session button |
| `client/src/components/layout/AppShell.tsx` | Resizable split pane (graph/timeline + terminal) |
| `client/src/lib/layout.ts` | Dagre graph layout computation |

### WebSocket Protocol

All messages follow `{ id, type, seq, payload }` envelope.

**Client to Server:**
- `session.create` / `session.attach` / `session.detach` / `session.list`
- `session.resize`
- `terminal.stdin` — keyboard input
- `graph.get` / `graph.search` — fetch graph or FTS search
- `branch.create` / `branch.switch` / `branch.list`

**Server to Client:**
- `terminal.stdout` — PTY output (base64 encoded)
- `session.created` / `session.attached` / `session.exited`
- `node.created` / `node.updated` / `edge.created` — real-time graph updates
- `branch.created`

### How Command Detection Works

Terminal output is fed through `CommandDetector` which uses two strategies:

1. **OSC 133 (primary):** Parses `\x1b]133;A/B/C/D` shell integration escape sequences for precise command start, execution, and exit code boundaries
2. **Regex fallback:** Matches common prompt patterns (`$`, `%`, `#`, `❯`, `➜`) and tracks user stdin to detect when Enter is pressed with typed text

When a command boundary is detected, a node is created in SQLite and broadcast to all attached clients via WebSocket.

### How Branching Works

1. Right-click any node in the graph view
2. Select "Branch from here"
3. Server creates a new branch record in SQLite, linked to the fork node
4. New commands on that branch create nodes with the new `branchId`
5. Switch between branches via the sidebar
6. The graph view shows the fork as diverging edges

## Project Status

This is an MVP. Working features:

- Run terminal commands in a real PTY (bash/zsh)
- Automatic command detection and graph node creation
- Visual DAG with React Flow (auto-layout, zoom, pan, minimap)
- Graph view and Timeline view toggle
- Branch from any node
- Session persistence in SQLite
- Multiple sessions with sidebar navigation
- FTS5 full-text search on command content
- Resizable split pane UI

## Requirements

- Node.js 22+
- pnpm 10+
- macOS or Linux (node-pty requires native compilation)
