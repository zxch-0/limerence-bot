import { ConfigEditor } from '@/components/ConfigEditor';
import { Card, PageHeader, Pill } from '@/components/ui';
import { GAMES_FIELDS, GAMES_OPTIONS_COUNT, GAMES_SECTIONS } from '@/lib/games/config';
import { formatMoney } from '@/lib/economy/core';
import { getContext } from '@/lib/panel';
import { sectionViews, valuesOf } from '@/lib/panelViews';
import { enabledGames } from '@/lib/games/table';
import { saveGamesConfigAction } from '../actions/config';

export const dynamic = 'force-dynamic';

export default async function CasinoPage() {
  const { state } = await getContext();
  const games = state.config.games;
  const economy = state.config.economy;
  const views = sectionViews(GAMES_FIELDS, GAMES_SECTIONS);
  const active = enabledGames(games);

  return (
    <>
      <PageHeader
        title="Casino"
        description={`${GAMES_OPTIONS_COUNT} options pour les jeux d’argent : roulette, pile ou face, dés, machine à sous, mines, crash et plinko.`}
      />

      <Card title="Jeux ouverts" subtitle="Commandes disponibles pour les membres">
        <div className="grid gap-2 sm:grid-cols-2">
          {active.length === 0 ? (
            <p className="text-sm text-white/55">Aucun jeu n’est activé.</p>
          ) : (
            active.map((game) => (
              <div key={game.id} className="rounded-xl border border-line bg-white/[0.02] px-3 py-2">
                <p className="text-sm text-white/85">
                  {game.emoji} {game.label}
                </p>
                <p className="mt-0.5 text-xs text-white/40">Paiements {game.minPayout}</p>
              </div>
            ))
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {games.enabled ? <Pill tone="ok">casino ouvert</Pill> : <Pill tone="warn">casino fermé</Pill>}
          {economy.gamblingEnabled ? <Pill tone="ok">paris autorisés</Pill> : <Pill tone="muted">paris coupés (économie)</Pill>}
          <Pill tone="muted">
            mise min {formatMoney(economy, Math.max(1, economy.betMin))} · taxe {economy.gamblingTaxPercent} %
          </Pill>
        </div>
      </Card>

      <div className="mt-6">
        <ConfigEditor
          sections={views}
          values={valuesOf(games)}
          action={saveGamesConfigAction}
          submitLabel="Enregistrer le casino"
        />
      </div>
    </>
  );
}
