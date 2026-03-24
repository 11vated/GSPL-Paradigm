import { useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { useUiStore } from '../../stores/uiStore';

interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export function AppShell({ sidebar, children }: AppShellProps) {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(256);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.max(200, Math.min(400, startWidthRef.current + delta));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div className="flex h-screen flex-col bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <>
            <aside
              className="flex flex-shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]"
              style={{ width: sidebarWidth }}
            >
              {sidebar}
            </aside>
            {/* Resize handle */}
            <div
              role="separator"
              onMouseDown={handleMouseDown}
              className={`w-1 flex-shrink-0 cursor-col-resize transition-colors ${
                isResizing ? 'bg-[var(--color-primary)]' : 'bg-transparent hover:bg-[var(--color-border-bright)]'
              }`}
            />
          </>
        )}
        {/* Main content */}
        <main className="relative flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
