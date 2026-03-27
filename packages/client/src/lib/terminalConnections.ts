import type { Edge as FlowEdge } from '@xyflow/react'
import type { TerminalLink, WorkspaceTerminalNode } from '@mindmap/shared'

export function buildNodeToTerminalEdges(terminalNodes: WorkspaceTerminalNode[]): FlowEdge[] {
  return terminalNodes
    .filter((node) => Boolean(node.sourceNodeId))
    .map((node) => ({
      id: `terminal-link-${node.sourceNodeId}-${node.terminalNodeId}`,
      source: node.sourceNodeId!,
      target: node.terminalNodeId,
      type: 'smoothstep',
      animated: true,
      style: {
        stroke: '#7e95ab',
        strokeWidth: 2,
        strokeDasharray: '6 4',
      },
    }))
}

export function buildTerminalLinkEdges(terminalLinks: TerminalLink[]): FlowEdge[] {
  return terminalLinks.map((link) => ({
    id: `terminal-branch-${link.id}`,
    source: link.sourceTerminalNodeId,
    target: link.targetTerminalNodeId,
    type: 'smoothstep',
    animated: true,
    style: {
      stroke: '#556f8a',
      strokeWidth: 2.5,
    },
  }))
}
