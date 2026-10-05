import type { ReactNode } from 'react';

// ============================================================
//  Petits composants d'interface partagés (serveur)
// ============================================================

export function Card({
  children,
  className = '',
  title,
  subtitle,
  action,
}: {
  children?: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={`glass rounded-2xl border border-line p-5 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.9)] ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title ? <h2 className="text-base font-semibold text-white/90">{title}</h2> : null}
            {subtitle ? <p className="mt-0.5 text-sm text-white/45">{subtitle}</p> : null}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-white/50">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

const TONES = {
  ok: 'bg-mint/12 text-mint border-mint/30',
  warn: 'bg-sand/12 text-sand border-sand/30',
  error: 'bg-rose-400/12 text-rose-300 border-rose-400/30',
  info: 'bg-lilac/12 text-lilac border-lilac/30',
  muted: 'bg-white/5 text-white/60 border-white/10',
} as const;

export function Pill({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'info',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'info' | 'ok' | 'warn' | 'error';
}) {
  const accents = {
    info: 'from-lilac/25',
    ok: 'from-mint/25',
    warn: 'from-sand/25',
    error: 'from-rose-400/25',
  } as const;
  return (
    <div className="glass relative overflow-hidden rounded-2xl border border-line p-4">
      <div className={`absolute inset-x-0 -top-16 h-24 bg-gradient-to-b ${accents[tone]} to-transparent`} />
      <p className="relative text-xs uppercase tracking-wider text-white/45">{label}</p>
      <p className="relative mt-1 text-2xl font-semibold text-white">{value}</p>
      {hint ? <p className="relative mt-1 text-xs text-white/40">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white/[0.02] px-4 py-8 text-center text-sm text-white/45">
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  className = '',
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-xs text-white/35">{hint}</p> : null}
    </div>
  );
}

export function Toggle({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string;
  label: string;
  description?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-white/[0.02] p-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 accent-[#c9b8ff]"
      />
      <span>
        <span className="block text-sm text-white/85">{label}</span>
        {description ? <span className="block text-xs text-white/40">{description}</span> : null}
      </span>
    </label>
  );
}

export function relativeDate(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  if (abs < 60_000) return rtf.format(Math.round(-diff / 1000), 'second');
  if (abs < 3_600_000) return rtf.format(Math.round(-diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(-diff / 3_600_000), 'hour');
  return rtf.format(Math.round(-diff / 86_400_000), 'day');
}

export function shortDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
