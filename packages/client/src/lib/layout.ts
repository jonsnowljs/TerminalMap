import dagre from 'dagre';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';

const NODE_DIMS: Record<string, { w: number; h: number }> = {
  command: { w: 280, h: 56 },
  output: { w: 280, h: 80 },
  error: { w: 280, h: 80 },
  note: { w: 220, h: 48 },
  prompt: { w: 280, h: 40 },
  exploration: { w: 280, h: 56 },
  file_edit: { w: 280, h: 56 },
};

export function computeLayout(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  if (nodes.length === 0) return nodes;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60, marginx: 20, marginy: 20 });

  for (const node of nodes) {
    const dims = NODE_DIMS[node.type ?? 'command'] ?? NODE_DIMS.command;
    g.setNode(node.id, { width: dims.w, height: dims.h });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    if (!pos) return node;
    const dims = NODE_DIMS[node.type ?? 'command'] ?? NODE_DIMS.command;
    return {
      ...node,
      position: { x: pos.x - dims.w / 2, y: pos.y - dims.h / 2 },
    };
  });
}
