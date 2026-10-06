'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { logoutAction } from '@/app/(panel)/actions';

export interface NavItem {
  href: string;
  label: string;
  emoji: string;
  badge?: number;
}

export function Sidebar({
  items,
  user,
  bot,
}: {
  items: NavItem[];
  user: { name: string; avatarUrl: string | null };
  bot: { connected: boolean; demo: boolean; tag: string | null };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-ghost fixed left-4 top-4 z-40 lg:hidden"
        aria-label="Menu"
      >
        ☰
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-line bg-ink-soft/95 backdrop-blur transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-lilac to-blush text-lg text-ink">
            ✦
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Limerence</p>
            <p className="text-xs text-white/40">Panel d’administration</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {items.map((item) => {
            const active =
              item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                  active
                    ? 'bg-lilac/15 text-white ring-1 ring-lilac/25'
                    : 'text-white/60 hover:bg-white/5 hover:text-white/90'
                }`}
              >
                <span className="w-5 text-center">{item.emoji}</span>
                <span className="flex-1">{item.label}</span>
                {item.badge ? (
                  <span className="rounded-full bg-blush/20 px-2 py-0.5 text-[11px] text-blush">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line p-4">
          <div className="mb-3 flex items-center gap-2 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${
                bot.connected ? 'bg-mint' : bot.demo ? 'bg-sand' : 'bg-rose-400'
              }`}
            />
            <span className="text-white/55">
              {bot.connected
                ? `Bot en ligne ${bot.tag ? `· ${bot.tag}` : ''}`
                : bot.demo
                  ? 'Mode démo (bot non configuré)'
                  : 'Bot hors ligne'}
            </span>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] p-2.5">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-lg" />
            ) : (
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-lilac/20 text-xs">
                {user.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-white/80">{user.name}</p>
              <p className="text-[11px] text-white/35">Administrateur</p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                title="Se déconnecter"
                className="rounded-lg px-2 py-1 text-xs text-white/50 hover:bg-white/5 hover:text-white"
              >
                ⎋
              </button>
            </form>
          </div>
        </div>
      </aside>

      {open ? (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}
    </>
  );
}
