import { create } from 'zustand';
import type { Edge as FlowEdge, Node as FlowNode } from '@xyflow/react';
import type {
  GraphEdge,
  GraphNode,
  TerminalSnapshot,
  Workspace,
  WorkspaceGraphPayload,
  WorkspaceLink,
  TerminalLink,
  WorkspaceTerminalNode,
} from '@mindmap/shared';

export interface MindmapNodeData {
  graphNode: GraphNode;
  label: string;
  [key: string]: unknown;
}

export interface PendingBranchAction {
  sourceNodeId: string;
  sourceTerminalNodeId: string | null;
  creationMode: 'clone_live_terminal' | 'new_from_node_context';
}

export type MindmapFlowNode = FlowNode<MindmapNodeData>;

function graphNodeToFlow(node: GraphNode, index: number): MindmapFlowNode {
  return {
    id: node.id,
    type: node.type,
    position: { x: 0, y: index * 120 },
    data: {
      graphNode: node,
      label: node.content.slice(0, 80),
    },
  };
}

function graphEdgeToFlow(edge: GraphEdge): FlowEdge {
  return {
    id: edge.id,
    source: edge.sourceId,
    target: edge.targetId,
    type: edge.type === 'branch' ? 'branch' : 'default',
    animated: edge.type === 'branch',
  };
}

interface GraphState {
  workspace: Workspace | null;
  workspaceLinks: WorkspaceLink[];
  terminalLinks: TerminalLink[];
  activeTerminalNodeId: string | null;
  terminalNodes: WorkspaceTerminalNode[];
  nodes: MindmapFlowNode[];
  edges: FlowEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  pendingBranchAction: PendingBranchAction | null;
  viewMode: 'graph' | 'timeline';

  setGraph: (nodes: GraphNode[], edges: GraphEdge[]) => void;
  addNode: (node: GraphNode) => void;
  addEdge: (edge: GraphEdge) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  setViewMode: (mode: 'graph' | 'timeline') => void;
  setPendingBranchAction: (action: PendingBranchAction) => void;
  clearPendingBranchAction: () => void;
  clearGraph: () => void;
  hydrateWorkspace: (payload: WorkspaceGraphPayload) => void;
  setActiveTerminalNode: (terminalNodeId: string) => void;
  updateTerminalSnapshot: (terminalNodeId: string, snapshot: TerminalSnapshot) => void;
  updateTerminalPosition: (terminalNodeId: string, position: { x: number; y: number }) => void;
  updateTerminalSize: (terminalNodeId: string, size: { width: number; height: number }) => void;
  resetWorkspaceState: () => void;
}

function createEmptyWorkspaceState() {
  return {
    workspace: null,
    workspaceLinks: [],
    terminalLinks: [],
    activeTerminalNodeId: null,
    terminalNodes: [],
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    pendingBranchAction: null,
  };
}

function normalizeTerminalModes(
  terminalNodes: WorkspaceTerminalNode[],
  activeTerminalNodeId: string | null,
): WorkspaceTerminalNode[] {
  return terminalNodes.map((node) => ({
    ...node,
    mode: node.terminalNodeId === activeTerminalNodeId ? 'active' : 'snapshot',
  }));
}

export const useGraphStore = create<GraphState>((set) => ({
  workspace: null,
  workspaceLinks: [],
  terminalLinks: [],
  activeTerminalNodeId: null,
  terminalNodes: [],
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  pendingBranchAction: null,
  viewMode: 'graph',

  setGraph: (graphNodes, graphEdges) =>
    set({
      ...createEmptyWorkspaceState(),
      nodes: graphNodes.map((n, i) => graphNodeToFlow(n, i)),
      edges: graphEdges.map(graphEdgeToFlow),
    }),

  addNode: (node) =>
    set((state) => ({
      nodes: [...state.nodes, graphNodeToFlow(node, state.nodes.length)],
    })),

  addEdge: (edge) =>
    set((state) => ({
      edges: [...state.edges, graphEdgeToFlow(edge)],
    })),

  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),

  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setPendingBranchAction: (pendingBranchAction) => set({ pendingBranchAction }),

  clearPendingBranchAction: () => set({ pendingBranchAction: null }),

  clearGraph: () => set(createEmptyWorkspaceState()),

  hydrateWorkspace: (payload) =>
    set({
      ...createEmptyWorkspaceState(),
      workspace: payload.workspace,
      workspaceLinks: payload.workspaceLinks ?? [],
      terminalLinks: payload.terminalLinks ?? [],
      activeTerminalNodeId: payload.activeTerminalNodeId ?? null,
      terminalNodes: normalizeTerminalModes(payload.terminalNodes, payload.activeTerminalNodeId ?? null),
      nodes: payload.graphNodes.map((node, index) => graphNodeToFlow(node, index)),
      edges: payload.graphEdges.map(graphEdgeToFlow),
    }),

  setActiveTerminalNode: (terminalNodeId) =>
    set((state) => {
      const hasTerminal = state.terminalNodes.some((node) => node.terminalNodeId === terminalNodeId);
      if (!hasTerminal) return {};

      return {
        activeTerminalNodeId: terminalNodeId,
        terminalNodes: normalizeTerminalModes(state.terminalNodes, terminalNodeId),
      };
    }),

  updateTerminalSnapshot: (terminalNodeId, snapshot) =>
    set((state) => ({
      terminalNodes: state.terminalNodes.map((node) =>
        node.terminalNodeId === terminalNodeId
          ? {
              ...node,
              snapshot,
              status: snapshot.status,
            }
          : node,
      ),
    })),

  updateTerminalPosition: (terminalNodeId, position) =>
    set((state) => ({
      terminalNodes: state.terminalNodes.map((node) =>
        node.terminalNodeId === terminalNodeId
          ? {
              ...node,
              position,
            }
          : node,
      ),
    })),

  updateTerminalSize: (terminalNodeId, size) =>
    set((state) => ({
      terminalNodes: state.terminalNodes.map((node) =>
        node.terminalNodeId === terminalNodeId
          ? {
              ...node,
              size,
            }
          : node,
      ),
    })),

  resetWorkspaceState: () => set(createEmptyWorkspaceState()),
}));
