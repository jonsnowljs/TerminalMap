import { useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { CompletedCommand } from './useWasmShell.js';

interface CommandNodeData extends Record<string, unknown> {
  command: string;
  output: string;
  exitCode: number | null;
}

// Strip ANSI escape codes for plain-text preview
function stripAnsi(raw: string): string {
  return raw.replace(/\x1b\[[^m]*m/g, '').replace(/\r/g, '');
}

function CommandNode({ data }: NodeProps<Node<CommandNodeData>>) {
  const success = data.exitCode === 0 || data.exitCode === null;
  const preview = stripAnsi(data.output)
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(0, 3)
    .join('\n');

  return (
    <div
      style={{ minWidth: 200, maxWidth: 300 }}
      className={`rounded-lg border px-3 py-2 shadow-md ${
        success ? 'border-emerald-700/60 bg-stone-900' : 'border-red-700/60 bg-stone-900'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${success ? 'bg-emerald-500' : 'bg-red-500'}`}
        />
        <code className="truncate text-sm font-semibold text-stone-100">$ {data.command}</code>
      </div>
      {preview && (
        <pre className="mt-1.5 max-h-14 overflow-hidden whitespace-pre-wrap break-all text-xs leading-relaxed text-stone-500">
          {preview}
        </pre>
      )}
      {data.exitCode !== null && data.exitCode !== 0 && (
        <div className="mt-1 text-xs text-red-400">exit {data.exitCode}</div>
      )}
    </div>
  );
}

const nodeTypes = { command: CommandNode };

// Auto-fits the viewport whenever the command count changes
function FitOnUpdate({ count }: { count: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const id = requestAnimationFrame(() => fitView({ padding: 0.35, duration: 250 }));
    return () => cancelAnimationFrame(id);
  }, [count, fitView]);
  return null;
}

interface CommandGraphProps {
  commands: CompletedCommand[];
}

export default function CommandGraph({ commands }: CommandGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CommandNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    setNodes(
      commands.map((cmd, index) => ({
        id: cmd.id,
        type: 'command',
        position: { x: 0, y: index * 130 },
        data: { command: cmd.command, output: cmd.output, exitCode: cmd.exitCode },
      })),
    );

    setEdges(
      commands.slice(1).map((cmd, index) => ({
        id: `e-${index}`,
        source: commands[index]!.id,
        target: cmd.id,
        type: 'smoothstep',
        style: { stroke: '#57534e', strokeWidth: 2 },
      })),
    );
  }, [commands, setNodes, setEdges]);

  if (commands.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-stone-600">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="12" cy="5" r="2" />
          <circle cx="5" cy="19" r="2" />
          <circle cx="19" cy="19" r="2" />
          <line x1="12" y1="7" x2="5" y2="17" />
          <line x1="12" y1="7" x2="19" y2="17" />
        </svg>
        <p className="text-sm">Run commands to see the graph</p>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
      fitView
      fitViewOptions={{ padding: 0.35 }}
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={{
        style: { stroke: '#57534e', strokeWidth: 2 },
        type: 'smoothstep',
      }}
    >
      <FitOnUpdate count={commands.length} />
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#292524" />
      <Controls
        className="!border-stone-700 !bg-stone-800 [&>button]:!border-stone-700 [&>button]:!bg-stone-800 [&>button]:!text-stone-300"
        showInteractive={false}
      />
    </ReactFlow>
  );
}
