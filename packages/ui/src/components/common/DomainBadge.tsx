import { DOMAIN_COLORS } from '@paradigm/studio';

interface DomainBadgeProps {
  domain: string;
}

export function DomainBadge({ domain }: DomainBadgeProps) {
  const color = DOMAIN_COLORS[domain] ?? '#71717a';

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white/90"
      style={{ backgroundColor: `${color}33`, color }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {domain}
    </span>
  );
}
