import { ActionForm, InlineAction } from '@/components/ActionForm';
import { Card, EmptyState, Field, PageHeader, Pill, relativeDate, Toggle } from '@/components/ui';
import { getContext } from '@/lib/panel';
import { allChannels } from '@/lib/config';
import { deleteTempRoomAction, reconcileRoomsAction, saveVoiceAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function VoicePage() {
  const { config, state, guild } = await getContext();
  const cfg = config.joinToCreate;
  const voiceChannels = allChannels(config).filter((c) => c.kind === 'voice');

  const rooms = state.tempRooms.map((room) => {
    const channel = guild?.channels.cache.get(room.channelId);
    const owner = guild?.members.cache.get(room.ownerId);
    return {
      ...room,
      name: channel?.name ?? 'salon supprimé',
      ownerName: owner?.user.tag ?? room.ownerId,
      members: channel && channel.isVoiceBased() ? channel.members.size : 0,
      alive: Boolean(channel),
    };
  });

  return (
    <>
      <PageHeader
        title="Vocaux privés"
        description="Salons fixes (solo, duo, trio, quatuor, sections) + système « rejoindre pour créer » : chaque membre obtient son propre salon temporaire, avec panneau de contrôle et suppression automatique quand il se vide."
      />

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card title="Système join-to-create" subtitle="Comportement des salons temporaires">
          <ActionForm action={saveVoiceAction} submitLabel="💾 Enregistrer">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Salon hub (➊ rejoindre pour créer)">
                <select className="field" name="hubChannelKey" defaultValue={cfg.hubChannelKey}>
                  {voiceChannels.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.emoji} {c.label ?? c.slug}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Catégorie des salons créés">
                <select className="field" name="categoryKey" defaultValue={cfg.categoryKey}>
                  {config.categories.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.emoji} {c.slug}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Places par défaut"
                hint="0 = illimité. Le propriétaire peut changer avec /vocal limite."
              >
                <input
                  type="number"
                  min={0}
                  max={99}
                  className="field"
                  name="defaultSize"
                  defaultValue={cfg.defaultSize}
                />
              </Field>
              <Field label="Salons temporaires actifs">
                <div className="field flex items-center justify-between">
                  <span>{rooms.filter((r) => r.alive).length}</span>
                  <span className="text-xs text-white/40">en direct</span>
                </div>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle
                name="enabled"
                label="Activer le join-to-create"
                description="Le hub crée un salon dès qu’on le rejoint."
                defaultChecked={cfg.enabled}
              />
              <Toggle
                name="autoDelete"
                label="Supprimer le salon quand il est vide"
                defaultChecked={cfg.autoDelete}
              />
              <Toggle
                name="moveOwner"
                label="Déplacer automatiquement le créateur"
                description="Il est basculé dans son nouveau salon."
                defaultChecked={cfg.moveOwner}
              />
              <Toggle
                name="onePerMember"
                label="Un seul salon par membre"
                description="Le hub le renvoie dans son salon existant."
                defaultChecked={cfg.onePerMember}
              />
              <Toggle
                name="allowRename"
                label="Autoriser le propriétaire à renommer"
                defaultChecked={cfg.allowRename}
              />
              <Toggle
                name="allowLock"
                label="Autoriser le propriétaire à verrouiller"
                defaultChecked={cfg.allowLock}
              />
            </div>
          </ActionForm>
        </Card>

        <div className="space-y-4">
          <Card
            title="Salons temporaires actifs"
            subtitle="Créés par les membres via le hub"
            action={
              <ActionForm action={reconcileRoomsAction} submitLabel="🧹 Nettoyer" className="" pendingLabel="…">
                <span />
              </ActionForm>
            }
          >
            {rooms.length === 0 ? (
              <EmptyState>
                Aucun salon temporaire pour l’instant. Un membre rejoint{' '}
                <span className="mono">
                  {voiceChannels.find((c) => c.isHub)?.emoji}{' '}
                  {voiceChannels.find((c) => c.isHub)?.label ?? 'créer-ton-salon'}
                </span>{' '}
                et son salon apparaît ici.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Salon</th>
                      <th>Propriétaire</th>
                      <th>Dedans</th>
                      <th>État</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((room) => (
                      <tr key={room.channelId}>
                        <td className="text-white/80">{room.name}</td>
                        <td className="text-white/55">{room.ownerName}</td>
                        <td className="text-white/55">{room.members}</td>
                        <td>
                          {room.locked ? <Pill tone="warn">verrouillé</Pill> : <Pill tone="muted">ouvert</Pill>}
                          {!room.alive ? <Pill tone="error">orphelin</Pill> : null}
                        </td>
                        <td className="text-right">
                          <InlineAction
                            action={deleteTempRoomAction}
                            fields={{ channelId: room.channelId }}
                            className="btn btn-danger btn-xs"
                          >
                            Supprimer
                          </InlineAction>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Ce que voient les membres">
            <ul className="space-y-2 text-sm text-white/60">
              <li>
                🎧 Ils rejoignent le hub{' '}
                <span className="mono text-lilac">
                  {voiceChannels.find((c) => c.isHub)?.emoji}{' '}
                  {voiceChannels.find((c) => c.isHub)?.label ?? 'créer-ton-salon'}
                </span>{' '}
                → un salon privé est créé à leur nom.
              </li>
              <li>
                🎛️ Ils reçoivent un MP avec les boutons{' '}
                <em>renommer / verrouiller / limite / réclamer / supprimer</em>.
              </li>
              <li>
                👑 Ils restent maîtres du salon : les commandes{' '}
                <span className="mono">/vocal autoriser</span>,{' '}
                <span className="mono">/vocal expulser</span>,{' '}
                <span className="mono">/vocal transferer</span> sont à eux.
              </li>
              <li>
                🗑️ Le salon disparaît automatiquement quand il est vide
                {cfg.autoDelete ? '' : ' (désactivé actuellement)'}.
              </li>
              <li className="text-xs text-white/40">
                Dernier salon créé {relativeDate(state.tempRooms[0]?.createdAt)}
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
