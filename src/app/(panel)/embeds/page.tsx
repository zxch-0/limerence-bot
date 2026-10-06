import { ActionForm, InlineAction } from '@/components/ActionForm';
import { EmbedComposer } from '@/components/EmbedComposer';
import { Card, EmptyState, Field, PageHeader, Pill } from '@/components/ui';
import { getContext } from '@/lib/panel';
import { resolveChannel } from '@/lib/blueprint';
import { createEmbedAction, deleteEmbedAction, publishEmbedAction, updateEmbedAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EmbedsPage() {
  const { state, config, channels, guild, demo } = await getContext();
  const textChannels = channels.filter((channel) => channel.type === 'text');
  const rulesChannel = guild ? await resolveChannel(guild, config, 'rules') : null;
  const defaultChannelId = rulesChannel?.id ?? '';

  return (
    <>
      <PageHeader
        title="Embeds personnalisés"
        description="Crée des cartes Discord pour le règlement, les informations, les rôles ou les annonces. Enregistre un modèle depuis le site, puis publie-le ici ou avec les commandes /embed."
      />

      {demo ? (
        <div className="mb-4 rounded-2xl border border-sand/30 bg-sand/10 p-4 text-sm text-sand">
          Mode démo : tu peux explorer le créateur, mais la publication nécessite un bot connecté. Aucun salon fictif ne sera enregistré comme cible.
        </div>
      ) : null}

      <Card title="Créer un embed" subtitle="Aperçu en direct · liens, images, champs et salon de publication">
        <EmbedComposer
          action={createEmbedAction}
          channels={demo ? [] : textChannels}
          defaultChannelId={demo ? '' : defaultChannelId}
        />
      </Card>

      <Card className="mt-4" title="Modèles enregistrés" subtitle={`${state.embeds.length} modèle(s) disponibles dans le panel et sur Discord`}>
        {state.embeds.length === 0 ? (
          <EmptyState>Aucun modèle pour le moment. Crée par exemple un embed « Règlement » au-dessus.</EmptyState>
        ) : (
          <ul className="space-y-4">
            {state.embeds.map((template) => (
              <li key={template.id} className="rounded-xl border border-line bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="mt-1 h-4 w-4 shrink-0 rounded-full border border-white/20" style={{ backgroundColor: template.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-white/90">{template.name}</h3>
                      <Pill tone="muted">ID {template.id.slice(0, 8)}</Pill>
                      <Pill tone={template.channelId ? 'info' : 'warn'}>{template.channelId ? 'salon mémorisé' : 'brouillon'}</Pill>
                    </div>
                    {template.title ? <p className="mt-1 text-sm text-white/80">{template.title}</p> : null}
                    {template.description ? <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-white/50">{template.description}</p> : null}
                    <p className="mt-2 text-xs text-white/35">{template.fields.length} champ(s) · créé par {template.createdBy}</p>
                  </div>
                  <InlineAction
                    action={deleteEmbedAction}
                    fields={{ id: template.id }}
                    className="btn btn-danger btn-xs"
                    confirm="Supprimer ce modèle ?"
                  >
                    Supprimer
                  </InlineAction>
                </div>

                <ActionForm action={publishEmbedAction} submitLabel="📨 Publier cet embed" className="mt-4 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={template.id} />
                  <label className="min-w-[240px] flex-1">
                    <span className="label">Salon de destination</span>
                    <select className="field" name="channelId" defaultValue={template.channelId ?? ''} required>
                      <option value="" disabled>Choisir un salon textuel…</option>
                      {textChannels.map((channel) => (
                        <option key={channel.id} value={channel.id}>#{channel.name}{channel.parentName ? ` · ${channel.parentName}` : ''}</option>
                      ))}
                    </select>
                  </label>
                </ActionForm>

                <details className="mt-3 rounded-xl border border-line bg-black/10 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-lilac">Modifier le modèle sur le site</summary>
                  <ActionForm action={updateEmbedAction} submitLabel="💾 Enregistrer les modifications" className="mt-3 space-y-3">
                    <input type="hidden" name="id" value={template.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Nom du modèle">
                        <input className="field" name="name" defaultValue={template.name} maxLength={64} required />
                      </Field>
                      <Field label="Couleur (#RRGGBB)">
                        <input className="field mono" name="color" defaultValue={template.color} maxLength={7} required />
                      </Field>
                      <Field label="Titre">
                        <input className="field" name="title" defaultValue={template.title ?? ''} maxLength={256} />
                      </Field>
                      <Field label="Pied de page">
                        <input className="field" name="footer" defaultValue={template.footer ?? ''} maxLength={2048} />
                      </Field>
                      <Field label="Salon par défaut" className="sm:col-span-2">
                        <select className="field" name="channelId" defaultValue={template.channelId ?? ''}>
                          <option value="">Aucun — brouillon</option>
                          {textChannels.map((channel) => (
                            <option key={channel.id} value={channel.id}>#{channel.name}{channel.parentName ? ` · ${channel.parentName}` : ''}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Description" className="sm:col-span-2">
                        <textarea className="field min-h-24" name="description" defaultValue={template.description ?? ''} maxLength={4096} />
                      </Field>
                    </div>
                  </ActionForm>
                  <p className="mt-2 text-xs text-white/35">Les champs, liens et images avancés du modèle sont conservés lors de cette modification simplifiée.</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4" title="Depuis Discord" subtitle="Les modèles restent synchronisés avec ce panel">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <Command name="/embed creer" description="Ouvre un formulaire Discord, enregistre un modèle et peut le publier dans le salon choisi." />
          <Command name="/embed liste · publier · modifier · supprimer" description="Gère les modèles enregistrés depuis une commande slash." />
          <Command name="/regles" description="Crée un règlement avec un formulaire et le publie dans le salon règles du blueprint." />
          <Command name="/salons tout-supprimer" description="Outil d’urgence protégé par une phrase de confirmation liée à ton serveur." />
        </div>
      </Card>
    </>
  );
}

function Command({ name, description }: { name: string; description: string }) {
  return (
    <div className="rounded-xl border border-line bg-white/[0.02] p-3">
      <code className="text-lilac">{name}</code>
      <p className="mt-1 text-xs leading-relaxed text-white/45">{description}</p>
    </div>
  );
}
