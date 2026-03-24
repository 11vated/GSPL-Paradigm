import type { ReactNode } from 'react';

interface PanelProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
  noPadding?: boolean;
}

export function Panel({ title, subtitle, children, className = '', actions, noPadding }: PanelProps) {
  return (
    <div className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
          <div>
            {title && (
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-4'}>{children}</div>
    </div>
  );
}
