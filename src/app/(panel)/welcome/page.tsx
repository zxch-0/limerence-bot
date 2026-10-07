import { ActionForm, InlineAction } from '@/components/ActionForm';
import { ChannelSlotsForm } from '@/components/ChannelSlotsForm';
import { CategoryPicker, ChannelPicker, VoicePicker } from '@/components/ChannelPicker';
import { RolePicker } from '@/components/RolePicker';
import { Card, PageHeader, Pill, relativeDate } from '@/components/ui';
import { getContext } from '@/lib/panel';
import { renderWelcome, welcomeChannelId, WELCOME_TOKENS } from '@/lib/welcome';
import { formatMoney } from '@/lib/economy/core';
import {
  saveConfessionsAction,
  saveJoinToCreateAction,
  saveLogsAction,
  saveWelcomeAction,
} from '../actions/config';
import { deleteTempRoomAction, reconcileRoomsAction } from '../actions/rooms';

export const dynamic = 'force-dynamic';

export default async function WelcomePage() {
  const { state, config, channels, roles, info } = await getContext();

  // Salon réellement utilisé par le bot : choix explicite > emplacement
  // « Bienvenue » > emplacement « Salon principal ».
  const targetId = welcomeChannelId(config);
  const target = channels.find((channel) => channel.id === targetId);
  const source = targetId
    ? config.welcome.channelId.trim() === targetId
      ? 'salon choisi ici'
      : config.channels.welcome === targetId
        ? 'emplacement « Bienvenue »'
        : 'emplacement « Salon principal »'
    : 'aucun salon';

  // Aperçu avec un membre fictif, rendu par le même code que le bot.
  const preview = renderWelcome(config.welcome.message, {
    userId: '000000000000000000',
    displayName: 'Nouveau Membre',
    username: 'nouveau_membre',
    guildName: info.name,
    memberCount: info.memberCount ?? 1,
    balance: formatMoney(config.economy, config.economy.startBalance),
    invites: 0,
  });

  return (
    <>
      <PageHeader
        title="Accueil & salons"
        description="Message d'arrivée, rôle automatique, vocaux temporaires et salons utilisés par le bot. Le bot ne crée aucune structure : il utilise les salons existants que tu choisis."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Message d'arrivée" subtitle="Choisis exactement où le message est publié">
          <ActionForm action={saveWelcomeAction} submitLabel="Enregistrer l'accueil" className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={config.welcome.enabled}
                className="h-4 w-4 accent-[#c9b8ff]"
              />
              Activer l’accueil des nouveaux membres
            </label>
            <div>
              <label className="label">Message</label>
              <textarea
                name="message"
                className="field min-h-24"
                rows={3}
                defaultValue={config.welcome.message}
                placeholder={`Bienvenue {membre} sur {serveur} !`}
              />
              <p className="mt-1 text-xs text-white/35">
                Variables : {WELCOME_TOKENS.join(' ')} (les anciens jetons anglais restent acceptés).
              </p>
            </div>
            <div>
              <label className="label">Salon de publication</label>
              <ChannelPicker name="channelId" value={config.welcome.channelId} options={channels} emptyLabel="— emplacement « Bienvenue » —" />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Pill tone={targetId ? (config.welcome.channelId.trim() === targetId ? 'ok' : 'warn') : 'error'}>
                  {config.welcome.enabled ? `publié dans : ${target ? `#${target.name}` : targetId || 'aucun'}` : 'accueil coupé'}
                </Pill>
                <span className="text-xs text-white/35">{source}</span>
              </div>
              <p className="mt-1 text-xs text-white/35">
                Laisse vide pour utiliser l’emplacement « Bienvenue » défini plus bas, puis « Salon principal ».
              </p>
            </div>
            <div>
              <label className="label">Rôle attribué à l’arrivée</label>
              <RolePicker name="roleId" value={config.welcome.roleId} roles={roles} emptyLabel="— aucun rôle —" />
              <p className="mt-1 text-xs text-white/35">
                Le bot attribue un rôle existant ; il n’en crée jamais.
              </p>
            </div>
            <div>
              <label className="label">Message privé (facultatif)</label>
              <textarea name="directMessage" className="field min-h-20" rows={2} defaultValue={config.welcome.directMessage} />
            </div>
            <div className="grid gap-2">
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  name="mentionMember"
                  defaultChecked={config.welcome.mentionMember}
                  className="h-4 w-4 accent-[#c9b8ff]"
                />
                Mentionner le membre dans le message
              </label>
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  name="assignToExisting"
                  defaultChecked={config.welcome.assignToExisting}
                  className="h-4 w-4 accent-[#c9b8ff]"
                />
                Donner aussi le rôle aux membres déjà présents
              </label>
            </div>
          </ActionForm>

          <div className="mt-4 border-t border-line pt-4">
            <p className="text-sm text-white/80">Aperçu du message</p>
            <p className="mt-1 text-xs text-white/35">
              Rendu avec le même code que le bot, sur un membre fictif.
            </p>
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-black/25 p-3 text-xs text-white/70">{preview}</p>
            {config.welcome.directMessage ? (
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-black/25 p-3 text-xs text-white/70">
                <span className="text-white/40">MP : </span>
                {renderWelcome(config.welcome.directMessage, {
                  userId: '000000000000000000',
                  displayName: 'Nouveau Membre',
                  username: 'nouveau_membre',
                  guildName: info.name,
                  memberCount: info.memberCount ?? 1,
                  balance: formatMoney(config.economy, config.economy.startBalance),
                  invites: 0,
                })}
              </p>
            ) : null}
          </div>
        </Card>

        <Card title="Vocaux temporaires" subtitle="Le membre crée son salon en rejoignant le salon hub">
          <ActionForm action={saveJoinToCreateAction} submitLabel="Enregistrer" className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={config.joinToCreate.enabled}
                className="h-4 w-4 accent-[#c9b8ff]"
              />
              Activer les vocaux temporaires
            </label>
            <div>
              <label className="label">Salon hub (rejoindre pour créer)</label>
              <VoicePicker name="hubChannelId" value={config.joinToCreate.hubChannelId} options={channels} />
            </div>
            <div>
              <label className="label">Catégorie des salons temporaires</label>
              <CategoryPicker name="categoryId" value={config.joinToCreate.categoryId} options={channels} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Places par défaut (0 = illimité)</label>
                <input
                  name="defaultSize"
                  type="number"
                  min={0}
                  max={99}
                  className="field"
                  defaultValue={config.joinToCreate.defaultSize}
                />
              </div>
              <div>
                <label className="label">Nom du salon</label>
                <input name="nameTemplate" className="field" defaultValue={config.joinToCreate.nameTemplate} />
              </div>
            </div>
            <div className="grid gap-2 text-sm text-white/70">
              {[
                ['autoDelete', 'Supprimer le salon quand il est vide', config.joinToCreate.autoDelete],
                ['moveOwner', 'Déplacer automatiquement le créateur', config.joinToCreate.moveOwner],
                ['onePerMember', 'Un seul salon par membre', config.joinToCreate.onePerMember],
                ['allowRename', 'Autoriser /vocal renommer', config.joinToCreate.allowRename],
                ['allowLock', 'Autoriser /vocal verrouiller', config.joinToCreate.allowLock],
              ].map(([name, label, checked]) => (
                <label key={String(name)} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name={String(name)}
                    defaultChecked={Boolean(checked)}
                    className="h-4 w-4 accent-[#c9b8ff]"
                  />
                  {String(label)}
                </label>
              ))}
            </div>
          </ActionForm>

          <div className="mt-4 border-t border-line pt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm text-white/80">Salons temporaires actifs</p>
              <ActionForm action={reconcileRoomsAction} submitLabel="Resynchroniser" className="contents" />
            </div>
            {state.tempRooms.length === 0 ? (
              <p className="text-xs text-white/40">Aucun salon temporaire en cours.</p>
            ) : (
              <ul className="space-y-1.5">
                {state.tempRooms.map((room) => (
                  <li key={room.channelId} className="flex items-center justify-between gap-2 text-xs">
                    <span className="mono text-white/60">
                      {room.channelId}
                      {room.locked ? ' 🔒' : ''} · {relativeDate(room.createdAt)}
                    </span>
                    <InlineAction
                      action={deleteTempRoomAction}
                      fields={{ channelId: room.channelId }}
                      className="btn btn-danger btn-xs"
                      confirm="Supprimer ce salon vocal ?"
                    >
                      Supprimer
                    </InlineAction>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card title="Salons du bot" subtitle="Emplacements utilisés par toutes les fonctionnalités">
          <ChannelSlotsForm config={config} channels={channels} />
        </Card>

        <div className="space-y-5">
          <Card title="Confessions" subtitle="Modération des confessions anonymes">
            <ActionForm action={saveConfessionsAction} submitLabel="Enregistrer" className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={config.confessions.enabled}
                  className="h-4 w-4 accent-[#c9b8ff]"
                />
                Activer les confessions
              </label>
              <div className="grid gap-2">
                <div>
                  <label className="label">Salon public</label>
                  <ChannelPicker
                    name="targetChannelId"
                    value={config.confessions.targetChannelId}
                    options={channels}
                    emptyLabel="— emplacement « Confessions » —"
                  />
                </div>
                <div>
                  <label className="label">Salon de validation</label>
                  <ChannelPicker
                    name="reviewChannelId"
                    value={config.confessions.reviewChannelId}
                    options={channels}
                    emptyLabel="— emplacement « File d'attente » —"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Cooldown (secondes)</label>
                  <input name="cooldownSeconds" type="number" min={0} className="field" defaultValue={config.confessions.cooldownSeconds} />
                </div>
                <div>
                  <label className="label">Longueur maximale</label>
                  <input name="maxLength" type="number" min={20} max={4000} className="field" defaultValue={config.confessions.maxLength} />
                </div>
              </div>
              <div>
                <label className="label">Réactions ajoutées (emojis, séparés par des virgules)</label>
                <input name="reactions" className="field" defaultValue={config.confessions.reactions.join(', ')} />
              </div>
              <div className="grid gap-2 text-sm text-white/70">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="requireApproval"
                    defaultChecked={config.confessions.requireApproval}
                    className="h-4 w-4 accent-[#c9b8ff]"
                  />
                  Validation par l’équipe avant publication
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="notifyReviewChannel"
                    defaultChecked={config.confessions.notifyReviewChannel}
                    className="h-4 w-4 accent-[#c9b8ff]"
                  />
                  Prévenir le salon de validation
                </label>
              </div>
            </ActionForm>
          </Card>

          <Card title="Journal" subtitle="Historique du panel et miroir Discord">
            <ActionForm action={saveLogsAction} submitLabel="Enregistrer" className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input type="checkbox" name="enabled" defaultChecked={config.logs.enabled} className="h-4 w-4 accent-[#c9b8ff]" />
                Activer le miroir Discord
              </label>
              <div>
                <label className="label">Salon de miroir</label>
                <ChannelPicker name="channelId" value={config.logs.channelId} options={channels} emptyLabel="— emplacement « Journal » —" />
              </div>
              <div>
                <label className="label">Entrées conservées dans le panel</label>
                <input name="maxEntries" type="number" min={50} max={5000} className="field" defaultValue={config.logs.maxEntries} />
              </div>
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input type="checkbox" name="keepInPanel" defaultChecked={config.logs.keepInPanel} className="h-4 w-4 accent-[#c9b8ff]" />
                Conserver l’historique dans le panel
              </label>
            </ActionForm>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill tone="info">{state.logs.length} entrée(s)</Pill>
              <Pill tone={config.logs.enabled ? 'ok' : 'muted'}>
                miroir {config.logs.enabled ? 'actif' : 'inactif'}
              </Pill>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
