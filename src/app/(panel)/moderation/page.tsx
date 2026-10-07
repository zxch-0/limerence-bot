import Link from 'next/link';
import { ConfigEditor } from '@/components/ConfigEditor';
import { ActionForm, InlineAction } from '@/components/ActionForm';
import { ChannelPicker } from '@/components/ChannelPicker';
import { RolePicker } from '@/components/RolePicker';
import { Card, EmptyState, PageHeader, Pill, shortDate } from '@/components/ui';
import { MODERATION_FIELDS, MODERATION_OPTIONS_COUNT, MODERATION_SECTIONS } from '@/lib/moderation/config';
import { CASE_TYPE_EMOJI, CASE_TYPE_LABELS, activeWarns } from '@/lib/moderation/cases';
import { getContext } from '@/lib/panel';
import { sectionViews, valuesOf } from '@/lib/panelViews';
import {
  banMemberAction,
  clearWarnsAction,
  kickMemberAction,
  lockChannelAction,
  manageRoleAction,
  nicknameAction,
  nukeChannelAction,
  pruneCasesAction,
  purgeAction,
  revokeCaseAction,
  slowmodeAction,
  softbanMemberAction,
  timeoutMemberAction,
  unbanMemberAction,
  untimeoutMemberAction,
  warnMemberAction,
} from '../actions/moderation';
import { resetSectionAction, saveModerationConfigAction } from '../actions/config';

export const dynamic = 'force-dynamic';

export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ membre?: string }> }) {
  const { membre } = await searchParams;
  const { state, channels, roles } = await getContext();
  const config = state.config.moderation;
  const views = sectionViews(MODERATION_FIELDS, MODERATION_SECTIONS);
  const userId = (membre ?? '').trim();

  const cases = [...state.cases].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const warns = userId ? activeWarns(state, userId, config) : [];

  return (
    <>
      <PageHeader
        title="Modération"
        description={`${MODERATION_OPTIONS_COUNT} options : avertissements avec MP automatique, sanctions graduées, dossiers et nettoyage de salons.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link className="btn btn-ghost" href="/warns">
              Avertissements
            </Link>
            <Link className="btn btn-ghost" href="/automod">
              Auto-modération
            </Link>
            <ActionForm action={pruneCasesAction} submitLabel="Purger les dossiers expirés" className="contents" />
            <InlineAction
              action={resetSectionAction}
              fields={{ section: 'moderation' }}
              className="btn btn-danger"
              confirm="Remettre les options de modération aux valeurs par défaut ?"
            >
              Valeurs par défaut
            </InlineAction>
          </div>
        }
      />

      <Card title="Cible" subtitle="Identifiant Discord ou mention, utilisé par toutes les actions ci-dessous">
        <form className="flex flex-wrap gap-2" method="get">
          <input
            type="search"
            name="membre"
            className="field mono max-w-sm"
            placeholder="mention ou identifiant du membre"
            defaultValue={userId}
          />
          <button className="btn btn-ghost" type="submit">
            Sélectionner
          </button>
        </form>
        {userId ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Pill tone="info">cible : {userId}</Pill>
            <Pill tone={warns.length ? 'warn' : 'ok'}>
              {warns.length} avertissement(s) actif(s)
            </Pill>
            <InlineAction
              action={clearWarnsAction}
              fields={{ userId }}
              className="btn btn-ghost btn-xs"
              confirm="Effacer tous les avertissements de ce membre ?"
            >
              Effacer ses avertissements
            </InlineAction>
          </div>
        ) : (
          <p className="mt-2 text-xs text-white/40">
            Sans cible, les formulaires demandent quand même l’identifiant dans leur propre champ.
          </p>
        )}
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Avertir" subtitle={`Dossier + MP automatique${config.warnDirectMessage ? '' : ' (MP désactivé)'}`}>
          <ActionForm action={warnMemberAction} submitLabel="Avertir" className="space-y-3">
            <input type="hidden" name="userId" value={userId} />
            <div>
              <label className="label">Raison</label>
              <textarea name="reason" className="field min-h-20" rows={2} placeholder="Rappel du règlement…" />
            </div>
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input type="checkbox" name="notifyChannel" defaultChecked className="h-4 w-4 accent-[#c9b8ff]" />
              Publier dans le salon de modération
            </label>
          </ActionForm>
          <p className="mt-3 text-xs text-white/35">
            Sanction automatique : mute après {config.warnTimeoutThreshold} · kick après{' '}
            {config.warnKickThreshold} · ban après {config.warnBanThreshold}.
          </p>
        </Card>

        <Card title="Sanctions" subtitle="Timeout, kick, ban, softban">
          <div className="grid gap-3 sm:grid-cols-2">
            <ActionForm action={timeoutMemberAction} submitLabel="Mute" className="space-y-2">
              <input type="hidden" name="userId" value={userId} />
              <input name="minutes" type="number" min={1} className="field" defaultValue={config.defaultTimeoutMinutes} aria-label="Minutes" />
              <input name="reason" className="field" placeholder="Raison" />
            </ActionForm>

            <ActionForm action={untimeoutMemberAction} submitLabel="Unmute" className="space-y-2">
              <input type="hidden" name="userId" value={userId} />
              <input name="reason" className="field" placeholder="Raison" />
            </ActionForm>

            <ActionForm action={kickMemberAction} submitLabel="Kick" className="space-y-2">
              <input type="hidden" name="userId" value={userId} />
              <input name="reason" className="field" placeholder="Raison" />
            </ActionForm>

            <ActionForm action={banMemberAction} submitLabel="Ban" className="space-y-2">
              <input type="hidden" name="userId" value={userId} />
              <input name="days" type="number" min={0} max={7} className="field" defaultValue={config.banDeleteMessageDays} aria-label="Jours de messages supprimés" />
              <input name="reason" className="field" placeholder="Raison" />
            </ActionForm>

            <ActionForm action={unbanMemberAction} submitLabel="Débannir" className="space-y-2">
              <input type="hidden" name="userId" value={userId} />
              <input name="reason" className="field" placeholder="Raison" />
            </ActionForm>

            <ActionForm action={softbanMemberAction} submitLabel="Softban" className="space-y-2">
              <input type="hidden" name="userId" value={userId} />
              <input name="reason" className="field" placeholder="Raison" />
            </ActionForm>
          </div>
        </Card>

        <Card title="Rôles & pseudonyme">
          <div className="grid gap-3 sm:grid-cols-2">
            <ActionForm action={manageRoleAction} submitLabel="Ajouter le rôle" className="space-y-2">
              <input type="hidden" name="userId" value={userId} />
              <RolePicker name="roleId" value="" roles={roles} allowEmpty={false} emptyLabel="— choisir un rôle —" />
            </ActionForm>
            <ActionForm action={manageRoleAction} submitLabel="Retirer le rôle" className="space-y-2">
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="remove" value="on" />
              <RolePicker name="roleId" value="" roles={roles} allowEmpty={false} emptyLabel="— choisir un rôle —" />
            </ActionForm>
            <ActionForm action={nicknameAction} submitLabel="Changer le pseudo" className="space-y-2 sm:col-span-2">
              <input type="hidden" name="userId" value={userId} />
              <input name="nickname" className="field" placeholder="Nouveau pseudonyme (vide = réinitialiser)" maxLength={32} />
            </ActionForm>
          </div>
        </Card>

        <Card title="Salons" subtitle="Purge, verrouillage, slowmode, nuke">
          <ActionForm action={purgeAction} submitLabel="Purger" className="space-y-3">
            <div>
              <label className="label">Salon</label>
              <ChannelPicker name="channelId" value="" options={channels} allowEmpty={false} emptyLabel="— choisir un salon —" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Nombre (1-100)</label>
                <input name="count" type="number" min={1} max={100} className="field" defaultValue={25} />
              </div>
              <div>
                <label className="label">D’un membre (facultatif)</label>
                <input name="userId" className="field mono" placeholder="identifiant" />
              </div>
            </div>
            <div>
              <label className="label">Contient</label>
              <input name="contains" className="field" placeholder="mot-clé (facultatif)" />
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-white/60">
              {(['links', 'attachments', 'embeds', 'mentions', 'bots'] as const).map((key) => (
                <label key={key} className="flex items-center gap-1.5">
                  <input type="checkbox" name={key} className="h-3.5 w-3.5 accent-[#c9b8ff]" />
                  {key === 'links'
                    ? 'liens'
                    : key === 'attachments'
                      ? 'pièces jointes'
                      : key === 'embeds'
                        ? 'embeds'
                        : key === 'mentions'
                          ? 'mentions'
                          : 'bots'}
                </label>
              ))}
            </div>
          </ActionForm>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <ActionForm action={lockChannelAction} submitLabel="Verrouiller" className="space-y-2">
              <ChannelPicker name="channelId" value="" options={channels} allowEmpty={false} emptyLabel="— salon —" />
            </ActionForm>
            <ActionForm action={lockChannelAction} submitLabel="Déverrouiller" className="space-y-2">
              <input type="hidden" name="unlock" value="on" />
              <ChannelPicker name="channelId" value="" options={channels} allowEmpty={false} emptyLabel="— salon —" />
            </ActionForm>
            <ActionForm action={nukeChannelAction} submitLabel="Nuke" className="space-y-2">
              <ChannelPicker name="channelId" value="" options={channels} allowEmpty={false} emptyLabel="— salon —" />
            </ActionForm>
            <ActionForm action={slowmodeAction} submitLabel="Slowmode" className="space-y-2 sm:col-span-3">
              <ChannelPicker name="channelId" value="" options={channels} allowEmpty={false} emptyLabel="— salon —" />
              <input name="seconds" type="number" min={0} className="field" defaultValue={5} aria-label="Secondes entre deux messages" />
            </ActionForm>
          </div>
        </Card>
      </div>

      <Card className="mt-5" title="Dossiers de modération" subtitle={`${cases.length} dossier(s) · ${state.cases.filter((c) => c.active).length} actif(s)`}>
        {cases.length === 0 ? (
          <EmptyState>Aucun dossier. Chaque sanction du bot ou du panel en crée un.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Type</th>
                  <th>Membre</th>
                  <th>Modérateur</th>
                  <th>Raison</th>
                  <th>Date</th>
                  <th>État</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cases.slice(0, 60).map((modCase) => (
                  <tr key={modCase.id}>
                    <td className="mono text-xs">{modCase.number}</td>
                    <td className="text-xs">
                      {CASE_TYPE_EMOJI[modCase.type]} {CASE_TYPE_LABELS[modCase.type]}
                    </td>
                    <td className="mono text-xs">{modCase.userName || modCase.userId}</td>
                    <td className="text-xs text-white/55">{modCase.moderatorName}</td>
                    <td className="text-xs text-white/60">{modCase.reason}</td>
                    <td className="text-xs text-white/45">{shortDate(modCase.createdAt)}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {modCase.active ? <Pill tone="ok">actif</Pill> : <Pill tone="muted">retiré</Pill>}
                        {modCase.directMessageSent ? <Pill tone="info">MP envoyé</Pill> : null}
                        {modCase.autoAction ? <Pill tone="warn">{modCase.autoAction}</Pill> : null}
                      </div>
                    </td>
                    <td>
                      {modCase.active ? (
                        <InlineAction
                          action={revokeCaseAction}
                          fields={{ caseId: modCase.id }}
                          className="btn btn-ghost btn-xs"
                          confirm="Retirer ce dossier du passif du membre ?"
                        >
                          Retirer
                        </InlineAction>
                      ) : (
                        <span className="text-xs text-white/30">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-6">
        <ConfigEditor
          sections={views}
          values={valuesOf(config)}
          action={saveModerationConfigAction}
          submitLabel="Enregistrer la modération"
        />
      </div>
    </>
  );
}
