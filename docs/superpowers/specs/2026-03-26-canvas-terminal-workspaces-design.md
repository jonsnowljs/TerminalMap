# Canvas Terminal Workspaces Design

## Goal

Replace the fixed bottom terminal panel with terminal nodes that live directly on the graph canvas, while evolving "branching" from the current Git-like branch model into linked mindmap workspaces.

The result should let a user:

- place multiple terminal nodes inside a mindmap
- run multiple terminal nodes concurrently inside the same mindmap
- activate one terminal node at a time for live interaction
- keep non-live terminal nodes visible from rolling-buffer snapshots
- manually connect terminal nodes as mindmap branches
- create a linked child mindmap from a selected node
- choose whether that child mindmap clones the live terminal state or starts fresh from selected node context

## Product Direction

This change is not a visual retheme. It is a structural interaction change.

The current product model is:

- one active terminal panel below the graph
- one graph representing commands and outputs from that terminal session
- branch actions that align with the current branch/session model

The target product model is:

- terminals are first-class graph nodes
- a mindmap is a workspace that can contain multiple terminal nodes and regular graph nodes
- terminal nodes can be connected to each other as explicit branch relationships inside the same workspace
- links between mindmaps represent exploratory branching in the product sense, not Git branching
- terminal nodes can keep running concurrently on the server
- only the selected terminal node is mounted as a live xterm in the client
- all other terminal nodes remain visible from buffered output and snapshots

## Constraints

- Keep the existing PTY-based execution model.
- Allow multiple PTY sessions to keep running concurrently in the same workspace.
- Avoid mounting multiple active xterm instances for the same visible workspace.
- Prefer bounded rolling output buffers over unbounded full-history replay.
- Preserve current command and output graphing behavior where possible.
- Treat workspace branching as product-level navigation, not repository branch management.
- Make room for future multi-workspace navigation without requiring that full navigation redesign in the first implementation.

## Approved Interaction Decisions

### Terminal Nodes

Each mindmap can contain multiple terminal nodes.

Each terminal node has two presentation modes:

- `live`: currently mounted as an interactive xterm in the client
- `buffered`: not mounted live, but still backed by a running or resumable PTY session and rendered from rolling output plus snapshot data

Multiple terminal nodes in the same workspace may be running at the same time.

Only one terminal node per visible workspace should be mounted as a live xterm at a time.

When the user focuses a different terminal node:

1. the currently live terminal node is detached from the client view
2. its latest buffered output and snapshot remain persisted
3. the newly selected terminal node is attached to the client view
4. the live xterm surface is mounted into that node

Detaching a terminal node from the client view must not pause or kill its PTY session.

### Mindmap Branching

Branching no longer means Git branching.

Branching means creating or opening a linked child workspace from a selected node in the current workspace.

The branch action must offer two user-selectable modes:

- `Clone live terminal`
- `New terminal from node context`

`Clone live terminal` creates a child workspace whose initial terminal node inherits the parent terminal's live execution state.

`New terminal from node context` creates a child workspace with a fresh terminal session seeded from the selected node's context, such as command, output, cwd, and related metadata.

### Manual Terminal Connections

Terminal nodes must support direct manual connections inside the same workspace.

These connections have two meanings at once:

- they are visible mindmap edges
- they record provenance that one terminal branch came from another

Manual connection behavior depends on the drop target:

1. dragging from terminal A to empty canvas:
   - creates child terminal B at the drop point
   - creates edge A -> B
   - seeds B from A's current terminal context
   - starts B as a fresh PTY-backed session

2. dragging from terminal A to existing terminal B:
   - creates or updates edge A -> B
   - reparents B visually and semantically under A
   - does not reseed, reset, or mutate B's existing terminal context

This distinction is required so users can reorganize mindmap structure without accidentally changing live terminal state.

## Architecture Overview

The implementation should separate four concerns that are currently conflated:

- canvas node identity
- live PTY session identity
- workspace identity
- cross-workspace linkage

This produces a clearer model:

- a `terminal node` is a graph object on the canvas
- a `terminal session` is a PTY-backed execution resource
- a `workspace` is a mindmap containing nodes and edges
- a `workspace link` connects a source node in one workspace to another workspace
- a `terminal link` connects one terminal node to another terminal node within the same workspace

## Data Model

### Workspace

Introduce a top-level workspace entity:

```ts
interface Workspace {
  id: string;
  name: string;
  parentWorkspaceId?: string | null;
  createdFromNodeId?: string | null;
  rootTerminalNodeId?: string | null;
  createdAt: string;
}
```

Responsibilities:

- groups nodes and edges into a single mindmap
- records provenance from parent workspace and source node
- provides a stable unit for navigation and persistence

### Graph Nodes

Extend the graph node system to include a `terminal` node type.

Existing content node types remain:

- command
- output
- error
- note
- prompt
- exploration
- file_edit

New type:

- terminal

### Terminal Node

Terminal nodes need graph placement and execution metadata:

```ts
interface TerminalNodeData {
  terminalNodeId: string;
  workspaceId: string;
  sessionId?: string | null;
  title: string;
  mode: 'live' | 'buffered';
  status: 'idle' | 'running' | 'exited' | 'disconnected';
  sourceNodeId?: string | null;
  snapshot: TerminalSnapshot | null;
}
```

Graph placement continues to live in the graph layout layer through node position and size.

### Terminal Snapshot and Rolling Buffer

Snapshot data must be lightweight, serializable, and renderable without xterm:

```ts
interface TerminalSnapshot {
  cwd: string;
  lastCommand?: string | null;
  previewLines: string[];
  cursorRow?: number | null;
  cursorCol?: number | null;
  updatedAt: string;
  status: 'idle' | 'running' | 'exited' | 'disconnected';
}
```

Snapshots are not the same thing as terminal history. They are a lightweight visual summary.

Each terminal session should also keep a bounded rolling output buffer for reattach:

```ts
interface TerminalOutputBuffer {
  terminalNodeId: string;
  sessionId: string;
  maxBytes: number;
  recentOutput: string;
}
```

Design requirements for the buffer:

- bounded in size
- updated on every PTY stdout event
- replayed when a buffered terminal becomes live again
- large enough to preserve recent command context without promising full-history scrollback

### Workspace Link

Each branch action should create an explicit relationship between source node and child workspace:

```ts
interface WorkspaceLink {
  id: string;
  sourceWorkspaceId: string;
  sourceNodeId: string;
  targetWorkspaceId: string;
  creationMode: 'clone_live_terminal' | 'new_from_node_context';
  createdAt: string;
}
```

This gives the UI a direct way to show that one node leads to another mindmap.

### Terminal Link

Manual terminal-to-terminal connections should persist as their own relation:

```ts
interface TerminalLink {
  id: string;
  workspaceId: string;
  sourceTerminalNodeId: string;
  targetTerminalNodeId: string;
  createdAt: string;
}
```

This relation exists for:

- manual terminal-to-terminal branch structure
- visual rendering of terminal edges
- provenance that a terminal was created from another terminal

It should not directly mutate PTY state after creation.

## Client Architecture

### App Shell

[`/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/layout/AppShell.tsx`](/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/layout/AppShell.tsx)

The bottom terminal panel should be removed from the shell layout. The shell becomes toolbar plus main content region. Terminal rendering responsibility moves into the graph canvas.

### Top-Level App State

[`/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/App.tsx`](/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/App.tsx)

Responsibilities should change from:

- owning one global attached terminal container
- creating one session for the page

to:

- owning the active workspace
- coordinating which terminal node is currently attached
- routing websocket messages by workspace and terminal node identity
- loading and switching linked workspaces

The page should no longer assume a single terminal `sessionId` for the whole UI.

### Graph View

[`/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/graph/GraphView.tsx`](/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/graph/GraphView.tsx)

GraphView should register a new `terminal` node type and render terminal nodes alongside existing graph nodes.

The graph surface remains the placement model for:

- command and output nodes
- note and error nodes
- terminal nodes
- terminal-to-terminal branch edges
- visual links to child workspaces

### Terminal Node Component

Add a dedicated component such as:

- `packages/client/src/components/graph/TerminalNode.tsx`

Responsibilities:

- render snapshot mode without xterm
- render active mode with a real mounted xterm instance
- show metadata such as cwd, status, last command, and snapshot age
- provide activation affordance on click
- expose source and target handles for manual terminal connections
- support resizable node dimensions

### Terminal Mount Strategy

The recommended implementation is a single live xterm mount per visible workspace.

That means:

- multiple terminal sessions may keep running concurrently on the server
- only the currently selected terminal node mounts xterm into its DOM container
- when another node is activated, xterm is disposed or remounted into the new container
- non-live terminal nodes render from rolling-buffer and snapshot state only

This avoids the overhead and fragility of keeping multiple active xterm instances live inside React Flow while still allowing real concurrent execution.

## Server Architecture

### Session Manager Evolution

[`/Users/jiasheng/Projects/MindmapTerminal/packages/server/src/pty/SessionManager.ts`](/Users/jiasheng/Projects/MindmapTerminal/packages/server/src/pty/SessionManager.ts)

The server must move from a page-level session assumption to a workspace-aware multi-terminal model.

Required responsibilities:

- create a session for a terminal node
- let multiple terminal-node sessions continue running concurrently in one workspace
- attach a session to the currently live client-visible terminal node
- detach a session from the client view without destroying it
- clone a live session for child workspace creation
- create a fresh session using selected node context
- maintain bounded recent-output buffers per terminal session
- persist or emit snapshot data for buffered terminal nodes

### Graph and Workspace Services

The graph layer should add a workspace-aware abstraction instead of treating the entire app state as one graph.

Likely additions:

- workspace creation service
- workspace load/list APIs
- workspace link persistence
- terminal link persistence
- graph queries scoped by workspace id

### WebSocket Protocol

[`/Users/jiasheng/Projects/MindmapTerminal/packages/shared/src/protocol.ts`](/Users/jiasheng/Projects/MindmapTerminal/packages/shared/src/protocol.ts)

[`/Users/jiasheng/Projects/MindmapTerminal/packages/shared/src/constants.ts`](/Users/jiasheng/Projects/MindmapTerminal/packages/shared/src/constants.ts)

Current websocket messages assume a single active session pipeline.

The protocol should evolve so terminal operations are explicit about:

- `workspaceId`
- `terminalNodeId`
- `sessionId` when necessary

New message families will likely include:

- terminal node create
- terminal child create from terminal
- terminal connect
- terminal attach
- terminal detach
- terminal snapshot update
- workspace create
- workspace open
- workspace branch create

Stdout and lifecycle events should be routed back to the correct terminal node, not to a page-global terminal instance.

Attach semantics should be terminal-specific:

- attaching a terminal node replays its rolling buffer to the requesting client
- detaching a terminal node stops live client streaming only
- terminal execution continues unless the session is explicitly exited or deleted

## Runtime Rules

### Live Mount Rule

Only one terminal node per visible workspace may be mounted as a live xterm in the client.

If the user activates terminal node B while terminal node A is live:

1. detach A from the live client stream
2. persist latest snapshot or rolling-buffer metadata for A
3. attach B to its session
4. mount xterm into B
5. mark B as live and A as buffered

This is a UI performance rule, not a process-execution rule.

### Concurrent Execution Rule

Terminal nodes with active sessions continue running whether or not they are currently live in the client.

That means:

- long-running commands continue in the background
- buffered output continues accumulating
- status updates still propagate to the graph store
- switching away from a terminal does not pause execution

### Terminal Link Rule

Terminal-to-terminal links inside a workspace follow creation-vs-reparent semantics.

If the user drags from terminal A to empty canvas:

1. create a new terminal node B
2. seed B from A's context at creation time
3. persist terminal link A -> B
4. render the edge immediately

If the user drags from terminal A to existing terminal B:

1. persist or update terminal link A -> B
2. render the edge immediately
3. do not alter B's PTY session, cwd, snapshot, or buffered output

### Buffered Terminal Rule

Buffered terminal nodes:

- do not capture keyboard input
- do not require xterm
- remain visible and informative on the canvas
- render from rolling recent output plus snapshot metadata
- update when the server emits newer output or snapshot state

Snapshot or buffer-derived updates should be emitted at practical boundaries:

- prompt ready
- command completion
- terminal detach from the live client
- periodic throttle while long-running output is active

### Workspace Branch Rule

Branching always originates from a selected graph node.

The context menu should offer:

- open linked workspace, when one already exists
- create child workspace from live terminal
- create child workspace from node context

The child workspace should retain provenance so the user can understand where it came from.

## UX Details

### Terminal Node Presentation

Terminal nodes should be visibly larger than regular content nodes and should support resizing.

Buffered mode should display:

- terminal title
- cwd
- status
- last command
- a clipped preview from recent buffered terminal lines
- last updated timestamp

Live mode should display:

- live xterm surface
- clear active/focus styling
- same metadata header where useful

Terminal nodes should expose visible connection handles so a user can drag from one terminal to another or into empty canvas to create a child branch.

### Workspace Navigation

The first implementation does not need a full multi-pane workspace navigator, but it must support moving between linked workspaces in a coherent way.

Minimum acceptable behavior:

- create child workspace from node action
- switch current view to the child workspace after creation
- preserve enough metadata to allow future return navigation

### Failure States

Terminal nodes must make inactive or broken states understandable:

- if a session exits, show exited state in both live and buffered renderings
- if attach fails, preserve buffered preview and show disconnected state
- if clone is unsupported for a shell state, fail explicitly and offer fallback to fresh session from context

## Migration Strategy

This change is large enough that it should be staged.

Recommended implementation order:

1. introduce workspace entities and workspace-scoped graph loading
2. add terminal node type with buffered preview rendering
3. allow multiple PTY-backed terminal sessions to run concurrently
4. move live xterm mounting from bottom panel into selected terminal node
5. add manual terminal-to-terminal connection persistence and handles
6. support drag-to-empty child terminal creation with inherited terminal context
7. add child workspace creation and linkage
8. implement the two branch creation modes
9. remove obsolete Git-like branch assumptions from the UI language

## Out of Scope

- keeping multiple xterm instances mounted live simultaneously in one workspace
- full tabbed or split-screen multi-workspace navigation
- complete historical terminal replay with unbounded scrollback retention
- replacing PTY execution with a synthetic terminal renderer
- broad redesign of graph layout unrelated to terminal integration

## Testing Expectations

Minimum verification for implementation:

- client typecheck passes
- server typecheck passes
- one workspace can render multiple terminal nodes
- one workspace can render terminal-to-terminal branch edges
- multiple terminal sessions can run concurrently in one workspace
- only the live terminal node accepts input
- switching live terminal nodes preserves previous node buffered preview
- dragging terminal A to empty canvas creates child terminal B with inherited context and edge A -> B
- dragging terminal A to existing terminal B only reparents visually and preserves B runtime state
- child workspace creation works from selected node
- both branch creation modes are available and correctly differentiated
- stdout is routed to the correct terminal session and node identity
- buffered nodes remain visually stable while other terminals run live

## Risks and Tradeoffs

### Xterm in React Flow

Mounting xterm inside a zoomable, draggable graph node is feasible, but it introduces sizing and focus complexity. Restricting live rendering to one mounted terminal node keeps that complexity bounded while still allowing concurrent server-side execution.

### Concurrent PTY Resource Usage

Allowing multiple terminals to keep running at once increases CPU, memory, and websocket event volume. Bounded rolling buffers and a single live xterm mount keep the browser cost controlled, but server-side resource usage still grows with the number of concurrent sessions.

### Session Cloning

Cloning a live shell state may be platform-sensitive or incomplete depending on what the PTY layer can actually duplicate. The UX must allow fallback to fresh-session-from-context if a true clone is not possible.

### Protocol Churn

This feature changes assumptions across client state, websocket events, and persistence. Trying to preserve the old single-session protocol shape too long will create brittle compatibility code.

## Success Criteria

The feature is successful when:

- the bottom terminal panel no longer exists
- terminals can be placed and used directly on the canvas
- multiple terminal nodes can coexist in one workspace
- multiple terminal nodes can run concurrently in one workspace
- terminal nodes can be manually connected as mindmap branches
- only one terminal node is mounted live at a time
- non-live terminal nodes remain visible as useful buffered previews
- a selected node can create a linked child mindmap
- the user can choose between cloning the live terminal or starting fresh from node context
- the product language and behavior no longer frame this as Git branching
