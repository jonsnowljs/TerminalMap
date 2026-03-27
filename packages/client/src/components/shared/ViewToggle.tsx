import { useGraphStore } from '../../store/graphStore.js';

export default function ViewToggle() {
  const viewMode = useGraphStore((s) => s.viewMode);
  const setViewMode = useGraphStore((s) => s.setViewMode);

  return (
    <div className="flex items-center self-stretch">
      <button
        onClick={() => setViewMode('graph')}
        className={`relative flex h-full items-center border-b-2 px-1 py-2 text-sm transition-colors ${
          viewMode === 'graph'
            ? 'text-[var(--text-strong)]'
            : 'text-[var(--text-muted)] hover:text-[var(--text-strong)]'
        }`}
        style={{ borderBottomColor: viewMode === 'graph' ? 'var(--accent-command)' : 'transparent' }}
      >
        Graph
      </button>
      <button
        onClick={() => setViewMode('timeline')}
        className={`relative ml-4 flex h-full items-center border-b-2 px-1 py-2 text-sm transition-colors ${
          viewMode === 'timeline'
            ? 'text-[var(--text-strong)]'
            : 'text-[var(--text-muted)] hover:text-[var(--text-strong)]'
        }`}
        style={{ borderBottomColor: viewMode === 'timeline' ? 'var(--accent-command)' : 'transparent' }}
      >
        Timeline
      </button>
    </div>
  );
}
