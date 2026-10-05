import Link from 'next/link';
import { InlineAction } from '@/components/ActionForm';
import { Card, EmptyState, PageHeader, Pill, shortDate } from '@/components/ui';
import { getContext } from '@/lib/panel';
import { demoMembers } from '@/lib/demo';
import { giveRoleAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  const { config, guild, demo, info } = await getContext();

  const members = guild
    ? [...guild.members.cache.values()]
        .filter((m) => !m.user.bot)
        .sort((a, b) => (a.joinedTimestamp ?? 0) - (b.joinedTimestamp ?? 0))
        .slice(0, 100)
        .map((m) => ({
          id: m.id,
          tag: m.user.tag,
          displayName: m.displayName,
          avatarUrl: m.displayAvatarURL({ size: 64 }),
          joinedAt: m.joinedAt?.toISOString() ?? null,
          roles: [...m.roles.cache.values()]
            .filter((r) => r.id !== guild.roles.everyone.id)
            .map((r) => r.name)
            .slice(0, 4),
          hasRole: m.roles.cache.some((r) => r.name.toLowerCase() === config.role.name.toLowerCase()),
          isOwner: m.id === guild.ownerId,
        }))
    : demoMembers(14).map((m) => ({
        id: m.id,
        tag: m.tag,
        displayName: m.displayName,
        avatarUrl: null as string | null,
        joinedAt: m.joinedAt,
        roles: ['limerencien'],
        hasRole: true,
        isOwner: false,
      }));

  return (
    <>
      <PageHeader
        title="Membres"
        description={`${info.memberCount} membres sur le serveur · rôle automatique « ${config.role.name} »`}
      />

      {demo ? (
        <div className="mb-4 rounded-2xl border border-line bg-white/[0.02] p-4 text-sm text-white/50">
          Membres de démonstration. La liste réelle s’affiche quand le bot est connecté (active
          l’intent <strong>Server Members</strong> pour voir tout le monde).
        </div>
      ) : null}

      <Card title="Liste" subtitle={`${members.length} membre(s) affiché(s)`}>
        {members.length === 0 ? (
          <EmptyState>Aucun membre récupéré. Vérifie l’intent « Server Members ».</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Membre</th>
                  <th>Rôles</th>
                  <th>Arrivée</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        {m.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.avatarUrl} alt="" className="h-8 w-8 rounded-lg" />
                        ) : (
                          <div className="grid h-8 w-8 place-items-center rounded-lg bg-lilac/15 text-[11px] text-white/70">
                            {m.displayName.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-white/85">{m.displayName}</p>
                          <p className="mono text-xs text-white/35">{m.tag}</p>
                        </div>
                        {m.isOwner ? <Pill tone="info">propriétaire</Pill> : null}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {m.hasRole ? <Pill tone="ok">{config.role.name}</Pill> : <Pill tone="warn">sans rôle</Pill>}
                        {m.roles
                          .filter((r) => r.toLowerCase() !== config.role.name.toLowerCase())
                          .map((r) => (
                            <span
                              key={r}
                              className="rounded-full border border-line px-2 py-0.5 text-xs text-white/45"
                            >
                              {r}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="text-xs text-white/45">{m.joinedAt ? shortDate(m.joinedAt) : '—'}</td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-2">
                        {!m.hasRole ? (
                          <InlineAction
                            action={giveRoleAction}
                            fields={{ userId: m.id }}
                            className="btn btn-success btn-xs"
                          >
                            Donner le rôle
                          </InlineAction>
                        ) : null}
                        {!m.isOwner ? (
                          <Link href="/moderation" className="btn btn-ghost btn-xs">
                            Modérer
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
