import { DOMAIN_COLORS } from '@paradigm/studio';
import type { UniversalSeed } from '@paradigm/types';

export type ViewId = 'garden' | 'seed' | 'evolution' | 'forge' | 'chat';

interface ViewTab {
  id: ViewId;
  label: string;
  icon: string;
}

const VIEW_TABS: ViewTab[] = [
  { id: 'garden', label: 'Garden', icon: '\u{1F331}' },
  { id: 'seed', label: 'Seed', icon: '\u{1F9EC}' },
  { id: 'evolution', label: 'Evolution', icon: '\u{1F4C8}' },
  { id: 'forge', label: 'Forge', icon: '\u{1F528}' },
  { id: 'chat', label: 'Chat', icon: '\u{1F4AC}' },
];

interface SidebarProps {
  seeds: UniversalSeed[];
  selectedSeed: UniversalSeed | null;
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
  onSeedSelect: (seed: UniversalSeed) => void;
}

export function Sidebar({
  seeds,
  selectedSeed,
  activeView,
  onViewChange,
  onSeedSelect,
}: SidebarProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo / Title */}
      <div className="border-b border-zinc-800 px-4 py-3">
        <h1 className="text-lg font-bold tracking-tight text-green-400">
          GSPL Paradigm
        </h1>
        <p className="text-xs text-zinc-500">Genetic Seed Programming</p>
      </div>

      {/* View Tabs */}
      <nav className="border-b border-zinc-800 p-2">
        <ul className="flex flex-col gap-1">
          {VIEW_TABS.map((tab) => (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => onViewChange(tab.id)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  activeView === tab.id
                    ? 'bg-zinc-800 text-green-400'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                }`}
              >
                <span className="text-base">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Seed List */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="mb-2 flex items-center justify-between px-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Seeds
          </span>
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
            {seeds.length}
          </span>
        </div>

        {seeds.length === 0 && (
          <p className="px-2 text-xs text-zinc-600">No seeds yet</p>
        )}

        <ul className="flex flex-col gap-0.5">
          {seeds.map((seed) => {
            const isSelected = selectedSeed?.$hash === seed.$hash;
            const domainColor =
              DOMAIN_COLORS[seed.$domain] ?? '#71717a';

            return (
              <li key={seed.$hash}>
                <button
                  type="button"
                  onClick={() => onSeedSelect(seed)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                    isSelected
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                  }`}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: domainColor }}
                  />
                  <span className="truncate">{seed.$name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
