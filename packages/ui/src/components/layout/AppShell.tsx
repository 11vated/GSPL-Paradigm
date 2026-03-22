import type { ReactNode } from 'react';

interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export function AppShell({ sidebar, children }: AppShellProps) {
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <aside className="w-64 flex-shrink-0 border-r border-zinc-800 bg-zinc-900 flex flex-col">
        {sidebar}
      </aside>
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
