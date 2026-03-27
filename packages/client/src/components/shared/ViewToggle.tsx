import { useGraphStore } from '../../store/graphStore.js';

export default function ViewToggle() {
  const viewMode = useGraphStore((s) => s.viewMode);
  const setViewMode = useGraphStore((s) => s.setViewMode);

  return (
    <div className="flex items-center bg-gray-800 rounded-lg p-0.5">
      <button
        onClick={() => setViewMode('graph')}
        className={`px-3 py-1 text-xs rounded-md transition-colors ${
          viewMode === 'graph'
            ? 'bg-purple-900 text-purple-300'
            : 'text-gray-400 hover:text-gray-200'
        }`}
      >
        Graph
      </button>
      <button
        onClick={() => setViewMode('timeline')}
        className={`px-3 py-1 text-xs rounded-md transition-colors ${
          viewMode === 'timeline'
            ? 'bg-purple-900 text-purple-300'
            : 'text-gray-400 hover:text-gray-200'
        }`}
      >
        Timeline
      </button>
    </div>
  );
}
