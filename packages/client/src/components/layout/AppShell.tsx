import { useState, useCallback, useRef, useEffect } from 'react';

interface AppShellProps {
  toolbar: React.ReactNode;
  top: React.ReactNode;
  bottom: React.ReactNode;
}

export default function AppShell({ toolbar, top, bottom }: AppShellProps) {
  const [splitRatio, setSplitRatio] = useState(0.45); // top panel takes 45%
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onMouseDown = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = (e.clientY - rect.top) / rect.height;
      setSplitRatio(Math.max(0.15, Math.min(0.85, ratio)));
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <div className="h-full flex flex-col">
      {toolbar}
      <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden">
        {/* Top panel — graph */}
        <div style={{ height: `${splitRatio * 100}%` }} className="overflow-hidden">
          {top}
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={onMouseDown}
          className="h-1.5 bg-gray-800 hover:bg-purple-600 cursor-row-resize flex-shrink-0 transition-colors"
        />

        {/* Bottom panel — terminal */}
        <div style={{ height: `${(1 - splitRatio) * 100}%` }} className="overflow-hidden">
          {bottom}
        </div>
      </div>
    </div>
  );
}
