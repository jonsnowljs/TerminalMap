import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from '@xyflow/react';
import type { Node as FlowNode } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useGraphStore } from '../../store/graphStore.js';
import { computeLayout } from '../../lib/layout.js';
import CommandNode from './CommandNode.js';
import OutputNode from './OutputNode.js';
import ErrorNode from './ErrorNode.js';
import NoteNode from './NoteNode.js';
import NodeContextMenu from '../shared/NodeContextMenu.js';

// MUST be defined at module scope
const nodeTypes = {
  command: CommandNode,
  output: OutputNode,
  error: ErrorNode,
  note: NoteNode,
  prompt: CommandNode,
  exploration: CommandNode,
  file_edit: CommandNode,
};

interface GraphViewProps {
  onBranchFromNode?: (nodeId: string) => void;
}

export default function GraphView({ onBranchFromNode }: GraphViewProps) {
  const storeNodes = useGraphStore((s) => s.nodes);
  const storeEdges = useGraphStore((s) => s.edges);
  const selectNode = useGraphStore((s) => s.selectNode);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

  const layoutNodes = useMemo(
    () => computeLayout(storeNodes, storeEdges),
    [storeNodes, storeEdges],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);

  useEffect(() => {
    setNodes(layoutNodes);
  }, [layoutNodes, setNodes]);

  useEffect(() => {
    setEdges(storeEdges);
  }, [storeEdges, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: FlowNode) => {
      selectNode(node.id);
    },
    [selectNode],
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
    setContextMenu(null);
  }, [selectNode]);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: FlowNode) => {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
    },
    [],
  );

  const handleBranch = useCallback(
    (nodeId: string) => {
      onBranchFromNode?.(nodeId);
    },
    [onBranchFromNode],
  );

  return (
    <div className="h-full w-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeContextMenu={onNodeContextMenu}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          style: { stroke: '#6b7280', strokeWidth: 2 },
          type: 'smoothstep',
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#1f2937" />
        <Controls
          className="!bg-gray-900 !border-gray-700 !shadow-lg [&>button]:!bg-gray-800 [&>button]:!border-gray-700 [&>button]:!text-gray-400 [&>button:hover]:!bg-gray-700"
        />
        <MiniMap
          className="!bg-gray-900 !border-gray-700"
          nodeColor="#6b21a8"
          maskColor="rgba(0,0,0,0.7)"
        />
      </ReactFlow>

      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          onBranch={handleBranch}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
