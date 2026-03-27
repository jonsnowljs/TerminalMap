import { create } from 'zustand';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';
import type { GraphNode, GraphEdge, Branch } from '@mindmap/shared';

// Custom data types for our nodes
export interface MindmapNodeData {
  graphNode: GraphNode;
  label: string;
  [key: string]: unknown;
}

function graphNodeToFlow(node: GraphNode, index: number): FlowNode<MindmapNodeData> {
  return {
    id: node.id,
    type: node.type, // maps to our custom node types
    position: { x: 0, y: index * 120 }, // layout computed later
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
  nodes: FlowNode<MindmapNodeData>[];
  edges: FlowEdge[];
  selectedNodeId: string | null;
  branches: Branch[];
  activeBranchId: string | null;
  viewMode: 'graph' | 'timeline';

  setGraph: (nodes: GraphNode[], edges: GraphEdge[], branches?: Branch[]) => void;
  addNode: (node: GraphNode) => void;
  addEdge: (edge: GraphEdge) => void;
  selectNode: (id: string | null) => void;
  setViewMode: (mode: 'graph' | 'timeline') => void;
  setBranches: (branches: Branch[]) => void;
  setActiveBranch: (id: string) => void;
  clearGraph: () => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  branches: [],
  activeBranchId: null,
  viewMode: 'graph',

  setGraph: (graphNodes, graphEdges, branches) =>
    set({
      nodes: graphNodes.map((n, i) => graphNodeToFlow(n, i)),
      edges: graphEdges.map(graphEdgeToFlow),
      branches: branches || [],
    }),

  addNode: (node) =>
    set((state) => ({
      nodes: [...state.nodes, graphNodeToFlow(node, state.nodes.length)],
    })),

  addEdge: (edge) =>
    set((state) => ({
      edges: [...state.edges, graphEdgeToFlow(edge)],
    })),

  selectNode: (id) => set({ selectedNodeId: id }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setBranches: (branches) => set({ branches }),

  setActiveBranch: (id) => set({ activeBranchId: id }),

  clearGraph: () => set({ nodes: [], edges: [], selectedNodeId: null, branches: [] }),
}));
