import { ConfigEditor } from '@/components/ConfigEditor';
import { InlineAction } from '@/components/ActionForm';
import { Card, EmptyState, PageHeader, Pill, relativeDate } from '@/components/ui';
import { BLACKJACK_FIELDS, BLACKJACK_OPTIONS_COUNT, BLACKJACK_SECTIONS } from '@/lib/blackjack/config';
import { formatMoney } from '@/lib/economy/core';
import { getContext } from '@/lib/panel';
import { sectionViews, valuesOf } from '@/lib/panelViews';
import type { Card as PlayingCard, Suit } from '@/lib/types';
import { resetSectionAction, saveBlackjackConfigAction } from '../actions/config';

export const dynamic = 'force-dynamic';

const SUITS: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

function hand(cards: PlayingCard[]): string {
  if (!cards.length) return '—';
  return cards.map((card) => `${card.rank}${SUITS[card.suit]}`).join(' ');
}

function score(cards: PlayingCard[]): number {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    if (card.rank === 'A') {
      aces += 1;
      total += 11;
    } else if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J') {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

export default async function BlackjackPage() {
  const { state } = await getContext();
  const config = state.config.blackjack;
  const economy = state.config.economy;
  const views = sectionViews(BLACKJACK_FIELDS, BLACKJACK_SECTIONS);

  const games = Object.values(state.blackjack).sort((a, b) => b.updatedAt - a.updatedAt);
  const stats = Object.values(state.blackjackStats);
  const totals = stats.reduce(
    (acc, entry) => ({
      hands: acc.hands + entry.hands,
      wins: acc.wins + entry.wins,
      losses: acc.losses + entry.losses,
      pushes: acc.pushes + entry.pushes,
      blackjacks: acc.blackjacks + entry.blackjacks,
      wagered: acc.wagered + entry.wagered,
      returned: acc.returned + entry.returned,
      biggestWin: Math.max(acc.biggestWin, entry.biggestWin),
    }),
    { hands: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, wagered: 0, returned: 0, biggestWin: 0 },
  );

  const houseEdge = totals.wagered > 0 ? ((totals.wagered - totals.returned) / totals.wagered) * 100 : 0;
  const players = Object.entries(state.blackjackStats)
    .sort((a, b) => b[1].hands - a[1].hands)
    .slice(0, 12);

  return (
    <>
      <PageHeader
        title="Blackjack"
        description={`${BLACKJACK_OPTIONS_COUNT} options : règles de table, sabot, partages, assurance, payouts et rythme de jeu.`}
        action={
          <InlineAction
            action={resetSectionAction}
            fields={{ section: 'blackjack' }}
            className="btn btn-danger"
            confirm="Remettre toutes les options de blackjack aux valeurs par défaut ?"
          >
            Valeurs par défaut
          </InlineAction>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Mini label="Mains jouées" value={String(totals.hands)} hint={`${totals.blackjacks} blackjack(s)`} />
        <Mini
          label="Mises / retours"
          value={`${formatMoney(economy, totals.wagered)} / ${formatMoney(economy, totals.returned)}`}
          hint={`avantage maison : ${houseEdge.toFixed(2)} %`}
        />
        <Mini
          label="Victoires / défaites"
          value={`${totals.wins} / ${totals.losses}`}
          hint={`${totals.pushes} égalité(s)`}
        />
        <Mini
          label="Mise"
          value={`${formatMoney(economy, config.minBet)} → ${formatMoney(economy, config.maxBet)}`}
          hint={`taxe de table : ${config.taxPercent} %`}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Tables en cours" subtitle="Une partie par membre, expirée automatiquement">
          {games.length === 0 ? (
            <EmptyState>Aucune partie en cours. Les membres jouent avec /blackjack jouer.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Membre</th>
                    <th>Mains</th>
                    <th>Croupier</th>
                    <th>Mise</th>
                    <th>État</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map((game) => (
                    <tr key={game.id}>
                      <td className="mono text-xs">{game.userId}</td>
                      <td className="text-xs">
                        {game.hands.map((item, index) => (
                          <div key={index}>
                            <span className="mono">{hand(item.cards)}</span>
                            <span className="text-white/40"> = {score(item.cards)}</span>
                          </div>
                        ))}
                      </td>
                      <td className="mono text-xs">
                        {hand(game.dealer)}
                        <span className="text-white/40"> = {score(game.dealer)}</span>
                      </td>
                      <td className="text-xs">{formatMoney(economy, game.baseBet)}</td>
                      <td>
                        <Pill tone={game.status === 'finished' ? 'muted' : game.status === 'abandoned' ? 'warn' : 'ok'}>
                          {game.status === 'insurance'
                            ? 'assurance'
                            : game.status === 'playing'
                              ? `tour ${game.activeHand + 1}/${game.hands.length}`
                              : game.status}
                        </Pill>
                        <span className="ml-1 text-xs text-white/35">{relativeDate(new Date(game.updatedAt).toISOString())}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Meilleurs joueurs" subtitle="Par nombre de mains jouées">
          {players.length === 0 ? (
            <EmptyState>Aucune statistique pour le moment.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Membre</th>
                    <th>Mains</th>
                    <th>V / D</th>
                    <th>Taux</th>
                    <th>Record</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map(([userId, entry]) => {
                    const rate = entry.hands ? (entry.wins / entry.hands) * 100 : 0;
                    return (
                      <tr key={userId}>
                        <td className="mono text-xs">{userId}</td>
                        <td>{entry.hands}</td>
                        <td>
                          {entry.wins} / {entry.losses}
                        </td>
                        <td className="text-mint">{rate.toFixed(0)} %</td>
                        <td className="text-xs">{formatMoney(economy, entry.biggestWin)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-white/35">
            Plus gros gain enregistré : {formatMoney(economy, totals.biggestWin)} · meilleure série :{' '}
            {Math.max(0, ...stats.map((entry) => entry.bestStreak))}
          </p>
        </Card>
      </div>

      <div className="mt-6">
        <ConfigEditor
          sections={views}
          values={valuesOf(config)}
          action={saveBlackjackConfigAction}
          submitLabel="Enregistrer le blackjack"
        />
      </div>
    </>
  );
}

function Mini({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="glass rounded-2xl border border-line p-4">
      <p className="text-xs uppercase tracking-wider text-white/45">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-white/40">{hint}</p> : null}
    </div>
  );
}
