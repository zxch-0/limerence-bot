import Link from 'next/link';
import { ConfigEditor } from '@/components/ConfigEditor';
import { InlineAction } from '@/components/ActionForm';
import { Card, PageHeader, Pill } from '@/components/ui';
import { ECONOMY_FIELDS, ECONOMY_OPTIONS_COUNT, ECONOMY_SECTIONS } from '@/lib/economy/config';
import { formatMoney } from '@/lib/economy/core';
import { getContext } from '@/lib/panel';
import { sectionViews, valuesOf } from '@/lib/panelViews';
import { saveEconomyConfigAction, resetSectionAction } from '../actions/config';

export const dynamic = 'force-dynamic';

export default async function EconomyPage() {
  const { state } = await getContext();
  const config = state.config.economy;
  const views = sectionViews(ECONOMY_FIELDS, ECONOMY_SECTIONS);

  const rows: Array<[string, string]> = [
    ['Solde de départ', formatMoney(config, config.startBalance)],
    ['Message (par message éligible)', `${formatMoney(config, config.messageMin)} → ${formatMoney(config, config.messageMax)} · toutes les ${Math.round(config.messageCooldownSeconds)}s`],
    ['Vocal (par heure)', `${formatMoney(config, config.voiceMinPerHour)} → ${formatMoney(config, config.voiceMaxPerHour)}`],
    ['/daily', `${formatMoney(config, config.dailyMin)} → ${formatMoney(config, config.dailyMax)} (+${config.dailyStreakBonus}% par jour de série)`],
    ['/work', `${formatMoney(config, config.workMin)} → ${formatMoney(config, config.workMax)} · ${config.workFailChancePercent}% d’échec`],
    ['/crime', `${formatMoney(config, config.crimeMin)} → ${formatMoney(config, config.crimeMax)} · ${100 - config.crimeSuccessChancePercent}% de risque`],
    ['/rob', `${config.robMinPercent}% → ${config.robMaxPercent}% du solde de la victime · ${100 - config.robSuccessChancePercent}% de risque`],
    ['Drop automatique', `${formatMoney(config, config.dropMin)} → ${formatMoney(config, config.dropMax)} toutes les ${config.dropCooldownMinutes} min`],
    ['Transfert (/pay)', `taxe ${config.payTaxPercent}% · ${formatMoney(config, config.payMinAmount)} minimum`],
    ['Paris', `mise ${formatMoney(config, config.betMin)} → ${formatMoney(config, config.betMax)} · taxe ${config.gamblingTaxPercent}%`],
    [
      'Intérêts bancaires',
      config.interestEnabled
        ? `${config.interestRatePercent}% toutes les ${config.interestIntervalHours}h (max ${formatMoney(config, config.interestMax)})`
        : 'désactivés',
    ],
  ];

  return (
    <>
      <PageHeader
        title="Économie"
        description={`${ECONOMY_OPTIONS_COUNT} options configurables : gains passifs, commandes, drops, paris, banque et anti-abus.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link className="btn btn-ghost" href="/economy/players">
              Comptes des membres
            </Link>
            <InlineAction
              action={resetSectionAction}
              fields={{ section: 'economy' }}
              className="btn btn-danger"
              confirm="Remettre toutes les options d’économie aux valeurs par défaut ?"
            >
              Valeurs par défaut
            </InlineAction>
          </div>
        }
      />

      <Card title="Ce que gagnent tes membres" subtitle="Résumé calculé depuis la configuration actuelle">
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-line bg-white/[0.02] px-3 py-2">
              <p className="text-xs uppercase tracking-wider text-white/40">{label}</p>
              <p className="mt-0.5 text-sm text-white/85">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {config.enabled ? <Pill tone="ok">économie active</Pill> : <Pill tone="warn">économie désactivée</Pill>}
          {config.bankEnabled ? <Pill tone="ok">banque active</Pill> : <Pill tone="muted">banque désactivée</Pill>}
          {config.dropEnabled ? <Pill tone="ok">drops actifs</Pill> : <Pill tone="muted">drops coupés</Pill>}
          {config.gamblingEnabled ? <Pill tone="ok">paris autorisés</Pill> : <Pill tone="muted">paris coupés</Pill>}
          {config.economyChannelOnly ? <Pill tone="warn">restreinte à certains salons</Pill> : null}
        </div>
      </Card>

      <div className="mt-6">
        <ConfigEditor
          sections={views}
          values={valuesOf(config)}
          action={saveEconomyConfigAction}
          submitLabel="Enregistrer l’économie"
        />
      </div>
    </>
  );
}
