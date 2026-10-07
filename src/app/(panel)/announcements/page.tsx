import { ActionForm, InlineAction } from '@/components/ActionForm';
import { ChannelPicker } from '@/components/ChannelPicker';
import { Card, EmptyState, Field, PageHeader, Pill, shortDate } from '@/components/ui';
import { getContext } from '@/lib/panel';
import {
  cancelAnnouncementAction,
  createAnnouncementAction,
  deleteAnnouncementAction,
  sendAnnouncementNowAction,
} from '../actions/content';

export const dynamic = 'force-dynamic';

export default async function AnnouncementsPage() {
  const { state, channels } = await getContext();

  return (
    <>
      <PageHeader
        title="Annonces"
        description="Publie immédiatement ou programme un envoi (30m, 2h, 3j ou une date précise). Le bot poste une carte annonce propre dans le salon choisi."
      />

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Card title="Nouvelle annonce" subtitle="Envoi immédiat ou programmé">
          <ActionForm action={createAnnouncementAction} submitLabel="📣 Publier / programmer">
            <Field label="Message">
              <textarea
                className="field min-h-28"
                name="content"
                required
                maxLength={1800}
                placeholder="Ex : Soirée jeux ce samedi à 21h, venez nombreux ✨"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Salon">
                <ChannelPicker
                  name="channelId"
                  value=""
                  options={channels}
                  emptyLabel="— emplacement « Annonces » —"
                />
              </Field>
              <Field label="Quand" hint="Vide = tout de suite · 30m · 2h · 3j · 2026-10-06T20:00">
                <input className="field" name="when" placeholder="tout de suite" />
              </Field>
              <Field label="Mention" className="sm:col-span-2">
                <select className="field" name="ping" defaultValue="none">
                  <option value="none">Aucune mention</option>
                  <option value="here">@here</option>
                  <option value="everyone">@everyone</option>
                </select>
              </Field>
            </div>
          </ActionForm>
        </Card>

        <Card title="Historique" subtitle={`${state.announcements.length} annonce(s)`}>
          {state.announcements.length === 0 ? (
            <EmptyState>Aucune annonce pour le moment.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {state.announcements.map((a) => (
                <li key={a.id} className="rounded-xl border border-line bg-white/[0.02] p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-white/40">
                    {a.status === 'sent' ? (
                      <Pill tone="ok">envoyée</Pill>
                    ) : a.status === 'scheduled' ? (
                      <Pill tone="info">programmée</Pill>
                    ) : a.status === 'failed' ? (
                      <Pill tone="error">échec</Pill>
                    ) : (
                      <Pill tone="muted">annulée</Pill>
                    )}
                    {a.channelId ? (
                      <span className="mono">salon {a.channelId}</span>
                    ) : (
                      <span className="text-white/40">emplacement « Annonces »</span>
                    )}
                    <span>
                      {a.status === 'scheduled' && a.scheduledFor
                        ? `envoi ${shortDate(a.scheduledFor)}`
                        : a.sentAt
                          ? `envoyée ${shortDate(a.sentAt)}`
                          : shortDate(a.createdAt)}
                    </span>
                    <span className="ml-auto mono">#{a.id.slice(0, 8)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-white/80">{a.content}</p>
                  {a.error ? <p className="mt-1 text-xs text-rose-300">{a.error}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {a.status !== 'sent' ? (
                      <InlineAction
                        action={sendAnnouncementNowAction}
                        fields={{ id: a.id }}
                        className="btn btn-success btn-xs"
                      >
                        Envoyer maintenant
                      </InlineAction>
                    ) : null}
                    {a.status === 'scheduled' ? (
                      <InlineAction
                        action={cancelAnnouncementAction}
                        fields={{ id: a.id }}
                        className="btn btn-ghost btn-xs"
                      >
                        Annuler
                      </InlineAction>
                    ) : null}
                    <InlineAction
                      action={deleteAnnouncementAction}
                      fields={{ id: a.id }}
                      className="btn btn-danger btn-xs"
                    >
                      Supprimer
                    </InlineAction>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
