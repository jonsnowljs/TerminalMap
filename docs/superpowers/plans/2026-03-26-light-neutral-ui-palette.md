# Light Neutral UI Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-theme the existing client UI to a light neutral documentation-style palette while keeping the current layout, behavior, and semantic node differentiation intact.

**Architecture:** The refactor stays inside the existing Vite React client and is limited to presentational changes. Global CSS variables become the palette source of truth, then existing components are updated in place to consume the new light shell colors and refined semantic accents. The terminal keeps its existing integration and behavior, but its xterm theme and container chrome are retuned to fit the lighter shell.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vite, XYFlow, xterm

---

## File Structure

**Modify**
- `packages/client/src/index.css`
  - Add app-wide color tokens and base document styling for the light neutral shell.
- `packages/client/src/App.tsx`
  - Retheme the toolbar and terminal wrapper surface without changing structure.
- `packages/client/src/components/layout/AppShell.tsx`
  - Retheme the split handle and panel container chrome.
- `packages/client/src/components/layout/Sidebar.tsx`
  - Move sidebar surfaces, headings, and active states to the new palette.
- `packages/client/src/components/shared/ViewToggle.tsx`
  - Retheme the segmented control to a light pill style.
- `packages/client/src/components/shared/NodeContextMenu.tsx`
  - Retheme the contextual menu to a light floating card.
- `packages/client/src/components/graph/GraphView.tsx`
  - Retheme the canvas, controls, minimap, and default edges.
- `packages/client/src/components/graph/CommandNode.tsx`
  - Retheme command-like nodes with light surfaces and muted violet accents.
- `packages/client/src/components/graph/OutputNode.tsx`
  - Retheme output nodes with light surfaces and muted blue accents.
- `packages/client/src/components/graph/ErrorNode.tsx`
  - Retheme error nodes with light surfaces and muted red accents.
- `packages/client/src/components/graph/NoteNode.tsx`
  - Retheme note nodes with light surfaces and muted amber accents.
- `packages/client/src/components/timeline/TimelineView.tsx`
  - Retheme the timeline container and empty state.
- `packages/client/src/components/timeline/TimelineEntry.tsx`
  - Retheme timeline cards and semantic badges for the new shell.
- `packages/client/src/hooks/useTerminal.ts`
  - Update the xterm theme so the viewport and shell feel consistent.

**Verification commands**
- `pnpm --filter @mindmap/client typecheck`
- `pnpm --filter @mindmap/client build`

**Manual verification**
- Run the client and inspect toolbar, sidebar, graph view, timeline view, node selection, context menu, and terminal readability.

### Task 1: Establish Global Palette Tokens

**Files:**
- Modify: `packages/client/src/index.css`

- [ ] **Step 1: Write the palette token block**

```css
@import "tailwindcss";

:root {
  --app-bg: #f6f4ef;
  --panel-bg: #ffffff;
  --panel-muted: #f2efe8;
  --panel-elevated: rgba(255, 255, 255, 0.82);
  --border-subtle: #ddd7cc;
  --border-strong: #c9c1b3;
  --text-strong: #241f17;
  --text-muted: #6f675c;
  --text-faint: #978f84;

  --accent-command: #7357d8;
  --accent-command-soft: #efeaff;
  --accent-output: #2f6db3;
  --accent-output-soft: #e8f1ff;
  --accent-error: #c55353;
  --accent-error-soft: #fff0f0;
  --accent-note: #b88929;
  --accent-note-soft: #fff6df;
  --accent-explore: #4d8b5b;
  --accent-explore-soft: #ebf7ee;

  --terminal-bg: #1d1b19;
  --terminal-fg: #f4efe7;
  --terminal-selection: #7357d84d;
}
```

- [ ] **Step 2: Add base document styling that uses the new variables**

```css
html,
body,
#root {
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: var(--app-bg);
  color: var(--text-strong);
}

body {
  font-family: Inter, "Segoe UI", sans-serif;
}

button,
input,
textarea,
select {
  font: inherit;
}
```

- [ ] **Step 3: Run typecheck to verify the CSS import path and client compile path still work**

Run: `pnpm --filter @mindmap/client typecheck`
Expected: PASS with no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/index.css
git commit -m "refactor: add light neutral palette tokens"
```

### Task 2: Retheme Shell Chrome

**Files:**
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/components/layout/AppShell.tsx`
- Modify: `packages/client/src/components/layout/Sidebar.tsx`
- Modify: `packages/client/src/components/shared/ViewToggle.tsx`
- Modify: `packages/client/src/components/shared/NodeContextMenu.tsx`

- [ ] **Step 1: Update the toolbar container and metadata classes in `App.tsx`**

```tsx
const toolbar = (
  <div
    className="flex items-center justify-between border-b px-4 py-2 backdrop-blur-sm"
    style={{
      backgroundColor: 'var(--panel-elevated)',
      borderColor: 'var(--border-subtle)',
    }}
  >
    <div className="flex items-center gap-3">
      <h1 className="text-sm font-semibold text-[var(--text-strong)]">Terminal Mindmap</h1>
      {sessionId && (
        <span className="font-mono text-xs text-[var(--text-muted)]">session: {sessionId.slice(0, 8)}</span>
      )}
      {activeBranchId && (
        <span className="font-mono text-xs text-[var(--text-faint)]">
          branch: {branches.find((b) => b.id === activeBranchId)?.name || activeBranchId.slice(0, 6)}
        </span>
      )}
    </div>
```

- [ ] **Step 2: Update the connection status text and terminal wrapper in `App.tsx`**

```tsx
<div className="flex items-center gap-3">
  <ViewToggle />
  <span
    className={`inline-block h-2 w-2 rounded-full ${
      isConnected ? 'bg-emerald-500' : 'bg-rose-500'
    }`}
  />
  <span className="text-xs text-[var(--text-muted)]">
    {isConnected ? 'connected' : 'disconnected'}
  </span>
</div>

// ...
bottom={
  <div className="h-full bg-[var(--panel-bg)] p-2" ref={termContainerRef} />
}
```

- [ ] **Step 3: Retheme the split handle in `AppShell.tsx`**

```tsx
<div
  onMouseDown={onMouseDown}
  className="h-1.5 flex-shrink-0 cursor-row-resize transition-colors"
  style={{ backgroundColor: 'var(--border-subtle)' }}
  onMouseEnter={(event) => {
    event.currentTarget.style.backgroundColor = 'var(--border-strong)';
  }}
  onMouseLeave={(event) => {
    event.currentTarget.style.backgroundColor = 'var(--border-subtle)';
  }}
/>
```

- [ ] **Step 4: Retheme the sidebar surface and row states in `Sidebar.tsx`**

```tsx
<div
  className="flex w-56 flex-col overflow-hidden border-r"
  style={{ backgroundColor: 'var(--panel-muted)', borderColor: 'var(--border-subtle)' }}
>
```

```tsx
className={`w-full border-l-2 px-3 py-1.5 text-left text-xs transition-colors ${
  s.id === activeSessionId
    ? 'border-[var(--accent-command)] bg-white text-[var(--text-strong)]'
    : 'border-transparent text-[var(--text-muted)] hover:bg-white/80'
}`}
```

- [ ] **Step 5: Retheme `ViewToggle.tsx` and `NodeContextMenu.tsx` to light floating controls**

```tsx
<div className="flex items-center rounded-full border p-0.5" style={{ backgroundColor: 'var(--panel-bg)', borderColor: 'var(--border-subtle)' }}>
```

```tsx
<div
  className="fixed z-50 min-w-[180px] rounded-xl border py-1 shadow-xl"
  style={{
    left: x,
    top: y,
    backgroundColor: 'var(--panel-bg)',
    borderColor: 'var(--border-subtle)',
  }}
>
```

- [ ] **Step 6: Run typecheck to verify the shell component edits**

Run: `pnpm --filter @mindmap/client typecheck`
Expected: PASS with no TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/App.tsx packages/client/src/components/layout/AppShell.tsx packages/client/src/components/layout/Sidebar.tsx packages/client/src/components/shared/ViewToggle.tsx packages/client/src/components/shared/NodeContextMenu.tsx
git commit -m "refactor: retheme app shell to light neutral palette"
```

### Task 3: Retheme Graph Canvas and Nodes

**Files:**
- Modify: `packages/client/src/components/graph/GraphView.tsx`
- Modify: `packages/client/src/components/graph/CommandNode.tsx`
- Modify: `packages/client/src/components/graph/OutputNode.tsx`
- Modify: `packages/client/src/components/graph/ErrorNode.tsx`
- Modify: `packages/client/src/components/graph/NoteNode.tsx`

- [ ] **Step 1: Retheme the graph canvas, controls, minimap, and edges in `GraphView.tsx`**

```tsx
<div className="relative h-full w-full bg-[var(--panel-bg)]">
  <ReactFlow
    // existing props
    defaultEdgeOptions={{
      style: { stroke: '#b8b0a4', strokeWidth: 2 },
      type: 'smoothstep',
    }}
  >
    <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#d8d1c6" />
    <Controls className="!border-[var(--border-subtle)] !bg-white !shadow-lg [&>button]:!border-[var(--border-subtle)] [&>button]:!bg-white [&>button]:!text-[var(--text-muted)] [&>button:hover]:!bg-[var(--panel-muted)]" />
    <MiniMap className="!border-[var(--border-subtle)] !bg-white" nodeColor="#a18fe8" maskColor="rgba(221, 215, 204, 0.45)" />
  </ReactFlow>
</div>
```

- [ ] **Step 2: Retheme `CommandNode.tsx` with a light card and muted violet accents**

```tsx
<div
  className={`min-w-[200px] max-w-[320px] rounded-xl border px-3 py-2 ${
    selected ? 'shadow-lg' : ''
  }`}
  style={{
    borderColor: selected ? 'var(--accent-command)' : 'var(--border-subtle)',
    backgroundColor: hasError ? 'var(--accent-error-soft)' : 'var(--panel-bg)',
    boxShadow: selected ? '0 10px 30px rgba(115, 87, 216, 0.15)' : undefined,
  }}
>
```

- [ ] **Step 3: Retheme `OutputNode.tsx`, `ErrorNode.tsx`, and `NoteNode.tsx` with light cards and semantic soft fills**

```tsx
// OutputNode
style={{
  borderColor: selected ? 'var(--accent-output)' : 'var(--border-subtle)',
  backgroundColor: 'var(--accent-output-soft)',
}}

// ErrorNode
style={{
  borderColor: selected ? 'var(--accent-error)' : '#e7c4c4',
  backgroundColor: 'var(--accent-error-soft)',
}}

// NoteNode
style={{
  borderColor: selected ? 'var(--accent-note)' : '#e7d8aa',
  backgroundColor: 'var(--accent-note-soft)',
}}
```

- [ ] **Step 4: Update node text and badge colors so they remain readable on light surfaces**

```tsx
<span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-output)]">output</span>
<pre className="max-h-[60px] overflow-hidden truncate whitespace-pre-wrap font-mono text-xs text-[var(--text-muted)]">
  {preview}
</pre>
```

- [ ] **Step 5: Run build to verify the graph UI compiles with the updated class strings**

Run: `pnpm --filter @mindmap/client build`
Expected: PASS with a successful Vite production build

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/graph/GraphView.tsx packages/client/src/components/graph/CommandNode.tsx packages/client/src/components/graph/OutputNode.tsx packages/client/src/components/graph/ErrorNode.tsx packages/client/src/components/graph/NoteNode.tsx
git commit -m "refactor: retheme graph canvas and nodes"
```

### Task 4: Retheme Timeline and Terminal

**Files:**
- Modify: `packages/client/src/components/timeline/TimelineView.tsx`
- Modify: `packages/client/src/components/timeline/TimelineEntry.tsx`
- Modify: `packages/client/src/hooks/useTerminal.ts`

- [ ] **Step 1: Retheme the timeline container and empty state in `TimelineView.tsx`**

```tsx
<div className="h-full overflow-y-auto bg-[var(--panel-bg)] p-3">
  {sorted.length === 0 && (
    <div className="py-8 text-center text-sm text-[var(--text-muted)]">
      No commands yet. Type something in the terminal.
    </div>
  )}
</div>
```

- [ ] **Step 2: Retheme timeline entries in `TimelineEntry.tsx`**

```tsx
const typeStyles: Record<string, { label: string; bg: string; text: string; border: string }> = {
  command: { label: 'CMD', bg: 'var(--panel-bg)', text: 'var(--accent-command)', border: 'var(--border-subtle)' },
  output: { label: 'OUT', bg: 'var(--accent-output-soft)', text: 'var(--accent-output)', border: '#cfe0fa' },
  error: { label: 'ERR', bg: 'var(--accent-error-soft)', text: 'var(--accent-error)', border: '#ebcaca' },
  note: { label: 'NOTE', bg: 'var(--accent-note-soft)', text: 'var(--accent-note)', border: '#eadfb7' },
  exploration: { label: 'EXPLORE', bg: 'var(--accent-explore-soft)', text: 'var(--accent-explore)', border: '#cfe2d4' },
};
```

```tsx
style={{
  backgroundColor: style.bg,
  borderColor: style.border,
  boxShadow: isSelected ? '0 0 0 1px var(--accent-command)' : undefined,
}}
```

- [ ] **Step 3: Update the xterm theme in `useTerminal.ts`**

```ts
theme: {
  background: '#1d1b19',
  foreground: '#f4efe7',
  cursor: '#a18fe8',
  selectionBackground: '#7357d84d',
},
```

- [ ] **Step 4: Run typecheck and build to verify the final integrated palette**

Run: `pnpm --filter @mindmap/client typecheck && pnpm --filter @mindmap/client build`
Expected: PASS with no TypeScript errors and a successful Vite production build

- [ ] **Step 5: Manually verify the running app**

Run: `pnpm --filter @mindmap/client dev`
Expected: Local Vite server starts and the UI shows:
- light neutral toolbar and sidebar
- light graph canvas with visible dots, edges, controls, and minimap
- semantic node colors still distinguishable
- light timeline entries with visible selected state
- readable dark terminal viewport inside a light panel

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/timeline/TimelineView.tsx packages/client/src/components/timeline/TimelineEntry.tsx packages/client/src/hooks/useTerminal.ts
git commit -m "refactor: finish light neutral timeline and terminal theme"
```

### Task 5: Final Verification and Cleanup

**Files:**
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/index.css`
- Modify: `packages/client/src/components/layout/AppShell.tsx`
- Modify: `packages/client/src/components/layout/Sidebar.tsx`
- Modify: `packages/client/src/components/shared/ViewToggle.tsx`
- Modify: `packages/client/src/components/shared/NodeContextMenu.tsx`
- Modify: `packages/client/src/components/graph/GraphView.tsx`
- Modify: `packages/client/src/components/graph/CommandNode.tsx`
- Modify: `packages/client/src/components/graph/OutputNode.tsx`
- Modify: `packages/client/src/components/graph/ErrorNode.tsx`
- Modify: `packages/client/src/components/graph/NoteNode.tsx`
- Modify: `packages/client/src/components/timeline/TimelineView.tsx`
- Modify: `packages/client/src/components/timeline/TimelineEntry.tsx`
- Modify: `packages/client/src/hooks/useTerminal.ts`

- [ ] **Step 1: Scan for any remaining dark-shell classes that would visually clash**

Run: `rg "gray-9|gray-8|purple-9|purple-8|bg-gray|text-gray|border-gray|bg-purple|text-purple|border-purple" packages/client/src/App.tsx packages/client/src/index.css packages/client/src/components packages/client/src/hooks/useTerminal.ts`
Expected: Only intentional semantic uses remain, or no matches

- [ ] **Step 2: Fix any remaining mismatched shell classes in place**

```tsx
// Example cleanup replacements:
className="text-[var(--text-muted)]"
className="border-[var(--border-subtle)] bg-[var(--panel-bg)]"
className="hover:bg-[var(--panel-muted)]"
```

- [ ] **Step 3: Re-run final verification**

Run: `pnpm --filter @mindmap/client typecheck && pnpm --filter @mindmap/client build`
Expected: PASS with no TypeScript errors and a successful Vite build

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/App.tsx packages/client/src/index.css packages/client/src/components packages/client/src/hooks/useTerminal.ts
git commit -m "refactor: polish light neutral ui palette"
```
