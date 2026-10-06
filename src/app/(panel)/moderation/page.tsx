import { ActionForm } from '@/components/ActionForm';
import { Card, EmptyState, Field, PageHeader, Pill, relativeDate } from '@/components/ui';
import { getContext } from '@/lib/panel';
import { banAction, kickAction, lockAction, purgeAction, slowmodeAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ModerationPage() {
  const { channels, state, demo } = await getContext();
  const textChannels = channels.filter((c) => c.type === 'text');
  const voiceChannels = channels.filter((c) => c.type === 'voice');
  const modLogs = state.logs.filter((l) => l.level === 'moderation').slice(0, 12);

  return (
    <>
      <PageHeader
        title="Modération"
        description="Outils d’administration du serveur. Chaque action est journalisée dans le panel et dans le salon de logs Discord."
      />

      {demo ? (
        <div className="mb-4 rounded-2xl border border-sand/30 bg-sand/10 p-4 text-sm text-sand">
          Mode démo : les actions nécessitent une connexion réelle du bot.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="🧹 Purge de messages" subtitle="Supprime de 1 à 100 messages d’un salon">
          <ActionForm action={purgeAction} submitLabel="Supprimer les messages">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Salon">
                <select className="field" name="channelId" required>
                  {textChannels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nombre (1-100)">
                <input type="number" min={1} max={100} defaultValue={10} className="field" name="count" />
              </Field>
              <Field label="Limiter à un auteur (ID, optionnel)" className="sm:col-span-2">
                <input className="field mono" name="userId" placeholder="ex. 123456789012345678" />
              </Field>
            </div>
          </ActionForm>
        </Card>

        <Card title="🔒 Verrouiller un salon" subtitle="Coupe l’écriture pour @everyone">
          <ActionForm action={lockAction} submitLabel="Appliquer">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Salon">
                <select className="field" name="channelId" required>
                  {[...textChannels, ...voiceChannels].map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Action">
                <select className="field" name="mode" defaultValue="lock">
                  <option value="lock">Verrouiller</option>
                  <option value="unlock">Déverrouiller</option>
                </select>
              </Field>
            </div>
          </ActionForm>
        </Card>

        <Card title="👋 Expulser un membre" subtitle="Il peut revenir avec une invitation">
          <ActionForm action={kickAction} submitLabel="Expulser" pendingLabel="…">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Identifiant du membre" hint="Clic droit sur le membre → Copier l’identifiant">
                <input className="field mono" name="userId" required placeholder="123456789012345678" />
              </Field>
              <Field label="Raison">
                <input className="field" name="reason" placeholder="Raison de l’expulsion" />
              </Field>
            </div>
          </ActionForm>
        </Card>

        <Card title="⛔ Bannir un membre" subtitle="Il ne pourra plus revenir">
          <ActionForm action={banAction} submitLabel="Bannir" pendingLabel="…">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Identifiant du membre">
                <input className="field mono" name="userId" required placeholder="123456789012345678" />
              </Field>
              <Field label="Raison">
                <input className="field" name="reason" placeholder="Raison du bannissement" />
              </Field>
            </div>
          </ActionForm>
        </Card>
      </div>

      <Card className="mt-4" title="⏳ Slowmode" subtitle="Limite la fréquence d’envoi des messages d’un salon">
        <ActionForm action={slowmodeAction} submitLabel="Appliquer le slowmode">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Salon textuel">
              <select className="field" name="channelId" required>
                {textChannels.map((channel) => (
                  <option key={channel.id} value={channel.id}>{channel.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Délai en secondes" hint="0 désactive le slowmode · maximum 21 600 secondes">
              <input className="field" type="number" name="seconds" min={0} max={21600} step={1} defaultValue={0} required />
            </Field>
          </div>
        </ActionForm>
      </Card>

      <Card className="mt-4" title="Dernières actions de modération">
        {modLogs.length === 0 ? (
          <EmptyState>Aucune action de modération enregistrée.</EmptyState>
        ) : (
          <ul className="space-y-2 text-sm">
            {modLogs.map((log) => (
              <li key={log.id} className="flex items-start gap-3 border-b border-line/50 pb-2 last:border-none">
                <span>🔨</span>
                <span className="flex-1">
                  <span className="block text-white/85">{log.action}</span>
                  <span className="block text-xs text-white/40">
                    {log.detail} · {relativeDate(log.at)} · {log.source}
                  </span>
                </span>
                <Pill tone="muted">modération</Pill>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
