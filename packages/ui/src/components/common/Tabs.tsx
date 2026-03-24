import { useState, type ReactNode } from 'react';

interface Tab {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  children: (activeTab: string) => ReactNode;
  className?: string;
}

export function Tabs({ tabs, defaultTab, activeTab: controlledTab, onTabChange, children, className = '' }: TabsProps) {
  const [internalTab, setInternalTab] = useState(defaultTab ?? tabs[0]?.id ?? '');
  const activeTab = controlledTab ?? internalTab;

  const handleTabClick = (tabId: string) => {
    setInternalTab(tabId);
    onTabChange?.(tabId);
  };

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex border-b border-[var(--color-border)]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabClick(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            {tab.icon && <span>{tab.icon}</span>}
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto">{children(activeTab)}</div>
    </div>
  );
}
