import Link from 'next/link';
import { ActionForm, InlineAction } from '@/components/ActionForm';
import { Card, EmptyState, PageHeader, Pill, shortDate } from '@/components/ui';
import { CASE_TYPE_EMOJI, CASE_TYPE_LABELS, activeWarns, nextAutoAction } from '@/lib/moderation/cases';
import { getContext } from '@/lib/panel';
import type { ModCase } from '@/lib/types';
import { clearWarnsAction, revokeCaseAction, warnMemberAction } from '../actions/moderation';

export const dynamic = 'force-dynamic';

export default async function WarnsPage({ searchParams }: { searchParams: Promise<{ membre?: string }> }) {
  const { membre } = await searchParams;
  const { state } = await getContext();
  const config = state.config.moderation;
  const userId = (membre ?? '').trim();

  const allWarns = state.cases
    .filter((modCase) => modCase.type === 'warn')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const memberCases = userId ? state.cases.filter((modCase) => modCase.userId === userId) : [];
  const memberWarns = userId ? activeWarns(state, userId, config) : [];
  const nextAction = userId ? nextAutoAction(config, memberWarns.length + 1) : 'none';

  return (
    <>
      <PageHeader
        title="Avertissements"
        description="Chaque avertissement crée un dossier, prévient le membre en MP et peut déclencher une sanction automatique."
        action={
          <Link className="btn btn-ghost" href="/moderation">
            ← Modération
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <div className="space-y-5">
          <Card title="Chercher un membre" subtitle="Identifiant Discord ou mention">
            <form className="flex gap-2" method="get">
              <input
                type="search"
                name="membre"
                className="field mono"
                placeholder="123456789012345678"
                defaultValue={userId}
              />
              <button className="btn btn-ghost" type="submit">
                Voir
              </button>
            </form>

            {userId ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="info">{userId}</Pill>
                  <Pill tone={memberWarns.length ? 'warn' : 'ok'}>{memberWarns.length} actif(s)</Pill>
                  <Pill tone="muted">{memberCases.length} dossier(s)</Pill>
                </div>

                {config.warnDecayEnabled ? (
                  <p className="text-xs text-white/40">
                    Expiration automatique après {config.warnDecayDays} jour(s).
                  </p>
                ) : null}

                {memberWarns.length > 0 ? (
                  <InlineAction
                    action={clearWarnsAction}
                    fields={{ userId }}
                    className="btn btn-danger"
                    confirm="Effacer tous les avertissements actifs de ce membre ?"
                  >
                    Tout effacer
                  </InlineAction>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card title="Avertir" subtitle="Le membre reçoit un MP détaillé">
            <ActionForm action={warnMemberAction} submitLabel="Avertir" className="space-y-3">
              <div>
                <label className="label">Membre</label>
                <input name="userId" className="field mono" defaultValue={userId} placeholder="mention ou identifiant" required />
              </div>
              <div>
                <label className="label">Raison</label>
                <textarea name="reason" className="field min-h-20" rows={3} placeholder="Rappel du règlement…" />
              </div>
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input type="checkbox" name="notifyChannel" defaultChecked className="h-4 w-4 accent-[#c9b8ff]" />
                Publier dans le salon de modération
              </label>
            </ActionForm>
            {userId ? (
              <p className="mt-3 text-xs text-white/40">
                Prochaine sanction automatique si cet avertissement est le {memberWarns.length + 1}
                <sup>e</sup> actif :{' '}
                <strong className="text-white/70">
                  {nextAction === 'none' ? 'aucune' : nextAction === 'timeout' ? `mute ${config.warnTimeoutMinutes} min` : nextAction}
                </strong>
              </p>
            ) : null}
          </Card>

          <Card title="Barème automatique" subtitle="Appliqué selon le nombre d'avertissements actifs">
            <ul className="space-y-1.5 text-sm text-white/60">
              <li className="flex justify-between">
                <span>Mute</span>
                <span className="text-white/80">
                  {config.warnTimeoutEnabled ? `dès ${config.warnTimeoutThreshold} · ${config.warnTimeoutMinutes} min` : 'désactivé'}
                </span>
              </li>
              <li className="flex justify-between">
                <span>Kick</span>
                <span className="text-white/80">{config.warnKickEnabled ? `dès ${config.warnKickThreshold}` : 'désactivé'}</span>
              </li>
              <li className="flex justify-between">
                <span>Ban</span>
                <span className="text-white/80">{config.warnBanEnabled ? `dès ${config.warnBanThreshold}` : 'désactivé'}</span>
              </li>
              <li className="flex justify-between">
                <span>MP au membre</span>
                <span className="text-white/80">{config.warnDirectMessage ? 'oui' : 'non'}</span>
              </li>
              <li className="flex justify-between">
                <span>Expiration</span>
                <span className="text-white/80">{config.warnDecayEnabled ? `${config.warnDecayDays} jour(s)` : 'jamais'}</span>
              </li>
            </ul>
          </Card>
        </div>

        <div className="space-y-5">
          <Card
            title={userId ? `Historique de ${userId}` : 'Tous les avertissements'}
            subtitle={userId ? `${memberCases.length} dossier(s)` : `${allWarns.length} avertissement(s) enregistré(s)`}
          >
            {userId ? (
              memberCases.length === 0 ? (
                <EmptyState>Aucun dossier pour ce membre.</EmptyState>
              ) : (
                <CaseTable cases={memberCases} />
              )
            ) : allWarns.length === 0 ? (
              <EmptyState>Aucun avertissement pour le moment.</EmptyState>
            ) : (
              <CaseTable cases={allWarns} />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function CaseTable({ cases }: { cases: ModCase[] }) {
  return (
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
            <th />
          </tr>
        </thead>
        <tbody>
          {cases.slice(0, 80).map((modCase) => (
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
                  {modCase.directMessageSent ? <Pill tone="info">MP</Pill> : null}
                  {modCase.autoAction ? <Pill tone="warn">{modCase.autoAction}</Pill> : null}
                </div>
              </td>
              <td>
                {modCase.active ? (
                  <InlineAction
                    action={revokeCaseAction}
                    fields={{ caseId: modCase.id }}
                    className="btn btn-ghost btn-xs"
                    confirm="Retirer ce dossier ?"
                  >
                    Retirer
                  </InlineAction>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
