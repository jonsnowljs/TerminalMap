# Light Neutral UI Palette Design

## Goal

Refactor the client UI to use a light neutral, documentation-style visual palette inspired by Fumadocs while preserving the current page structure, interaction model, and information architecture.

This work does not change layout, component hierarchy, or feature scope. The sidebar stays on the left, the toolbar stays at the top, the graph or timeline remains in the upper panel, and the terminal remains in the lower panel. The redesign is strictly visual.

## Constraints

- Keep the current shell structure intact.
- Do not introduce new panels, inspectors, drawers, or navigation changes.
- Keep graph node types visually distinguishable with semantic accents.
- Shift the surrounding UI chrome to a light neutral palette.
- Keep the terminal readable and visually integrated with the lighter shell.

## Reference Interpretation

The relevant cues from Fumadocs are not its exact components or page structure. The useful references are:

- soft off-white page backgrounds instead of pure white or dark fills
- white content surfaces separated by subtle borders
- low-contrast muted grays for secondary information
- restrained, calm visual hierarchy rather than saturated dashboard styling
- rounded controls and panels with light translucent or layered chrome

This redesign should borrow that tone, not copy the site.

## Visual Direction

### Shell Palette

The application shell should move from dark gray and purple-heavy styling to a light neutral system:

- app background: warm off-white
- primary surfaces: white
- secondary surfaces: very light gray
- borders: soft gray with low contrast
- primary text: dark charcoal
- secondary text: muted gray
- hover states: slightly darkened neutral surfaces
- active shell states: neutral highlight with restrained tint, not saturated fills

The result should feel closer to a documentation workspace than a terminal dashboard.

### Semantic Accents

Node types should remain meaningfully color-coded, but in a more refined way than the current design. Colors should appear as:

- badges
- small metadata chips
- selection rings
- connector handles
- subtle tinted node backgrounds

The node accents should not overpower the neutral shell.

Recommended semantic mapping:

- command and prompt: muted violet
- output: muted blue
- error: muted red
- note: muted amber
- exploration: muted green if present in timeline or future graph states

### Terminal Treatment

The terminal must stay highly legible, but it should no longer feel disconnected from the rest of the interface.

Recommended treatment:

- terminal wrapper surface should match the light shell
- terminal viewport may remain darker than the shell if needed for readability
- selection, cursor, and focus accents should align with the updated violet accent family
- surrounding terminal chrome, split bar, and panel framing should become light neutral

This creates a deliberate contrast between the command surface and the broader documentation-style UI without reverting the entire app to a dark theme.

## Component Scope

### Global Styling

[`/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/index.css`](/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/index.css)

Responsibilities:

- define global color variables for shell surfaces, text, borders, and semantic accents
- establish app background and default text color
- provide a single palette source for components

### Top-Level App Toolbar

[`/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/App.tsx`](/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/App.tsx)

Responsibilities:

- convert toolbar from dark chrome to a light surface
- restyle session and branch metadata text to match neutral hierarchy
- restyle connection indicator surrounding text to fit the new palette

### App Shell Split Surface

[`/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/layout/AppShell.tsx`](/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/layout/AppShell.tsx)

Responsibilities:

- restyle split handle from dark gray/purple hover to neutral light chrome
- ensure top and bottom surfaces feel like part of the same light shell

### Sidebar

[`/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/layout/Sidebar.tsx`](/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/layout/Sidebar.tsx)

Responsibilities:

- move from dark panel styling to white/light-gray layered surfaces
- preserve current section structure for sessions and branches
- use subtle active states with restrained tinting
- improve text contrast hierarchy for ids, labels, and cwd previews

### View Toggle

[`/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/shared/ViewToggle.tsx`](/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/shared/ViewToggle.tsx)

Responsibilities:

- restyle segmented control into a light pill-based toggle
- preserve current behavior exactly

### Context Menu

[`/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/shared/NodeContextMenu.tsx`](/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/shared/NodeContextMenu.tsx)

Responsibilities:

- move to a light floating surface with subtle shadow and border
- keep action emphasis via semantic accent

### Graph View Canvas

[`/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/graph/GraphView.tsx`](/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/graph/GraphView.tsx)

Responsibilities:

- change graph canvas background from dark to a light neutral field
- retheme background dots, controls, minimap, and edge defaults
- preserve layout behavior and node rendering logic

### Graph Nodes

- [`/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/graph/CommandNode.tsx`](/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/graph/CommandNode.tsx)
- [`/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/graph/OutputNode.tsx`](/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/graph/OutputNode.tsx)
- [`/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/graph/ErrorNode.tsx`](/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/graph/ErrorNode.tsx)
- [`/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/graph/NoteNode.tsx`](/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/graph/NoteNode.tsx)

Responsibilities:

- preserve node structure and content
- move from dark cards to light cards with semantic tinting
- preserve strong distinction between selected and unselected states
- improve text readability on lighter surfaces

### Timeline View

- [`/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/timeline/TimelineView.tsx`](/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/timeline/TimelineView.tsx)
- [`/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/timeline/TimelineEntry.tsx`](/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/components/timeline/TimelineEntry.tsx)

Responsibilities:

- move timeline shell to the same light neutral system
- preserve semantic type differentiation inside entries
- keep selected state obvious without dark background dependence

### Terminal Theme

[`/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/hooks/useTerminal.ts`](/Users/jiasheng/Projects/MindmapTerminal/packages/client/src/hooks/useTerminal.ts)

Responsibilities:

- retheme xterm to align with the new shell
- keep font settings and sizing unchanged unless necessary for contrast
- choose either a light terminal theme or a restrained dark editor-like viewport inside a light container

Preferred decision:

- use a restrained dark viewport inside a light panel, because it protects terminal readability while still matching the redesigned shell

## Interaction and Behavior

No interaction changes are in scope.

Specifically:

- no changes to websocket behavior
- no changes to session or branch actions
- no changes to graph layout
- no changes to view switching
- no changes to terminal input or resizing behavior

## Accessibility and Readability

The lighter palette must still maintain usable contrast.

Requirements:

- primary text must remain clearly readable on all shell surfaces
- muted metadata text must still be legible, especially in sidebar session and branch rows
- selected states must remain visually obvious in graph nodes, timeline entries, and toggles
- semantic colors must remain distinguishable without relying on very dark backgrounds

## Testing Expectations

This work needs visual and functional verification rather than logic changes.

Minimum checks:

- client typecheck passes
- app renders without Tailwind class errors
- toolbar, sidebar, graph view, timeline view, and terminal all display coherently in the new palette
- selected and hover states remain visible
- graph node type differentiation remains clear
- terminal remains readable and usable

## Out of Scope

- layout changes
- structural refactors
- new design system abstraction layer
- animation changes
- typography overhaul
- feature additions
- server or shared package changes

## Implementation Notes

The safest implementation path is:

1. establish reusable palette variables in global CSS
2. retheme shared shell surfaces
3. retheme graph and timeline surfaces
4. retheme node components
5. retheme terminal wrapper and xterm theme
6. verify readability and selection states end to end

This keeps the refactor focused, reduces regressions, and avoids accidental scope creep into layout work.
