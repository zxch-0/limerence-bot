import { ActionForm } from '@/components/ActionForm';
import { Card, PageHeader, Pill } from '@/components/ui';
import { buildCommands } from '@/bot/commandDefs';
import { economyCommands, moderationCommands, utilityCommands } from '@/bot/commandDefs';
import { getContext, inviteUrl } from '@/lib/panel';
import { storageKind } from '@/lib/store';
import { restartBotAction, resetConfigAction, saveGuildAction } from '../actions/config';
import { wipeEconomyAction } from '../actions/economy';

export const dynamic = 'force-dynamic';

const COMMAND_GROUPS = [
  { label: 'Économie & jeux', emoji: '💰', commands: economyCommands() },
  { label: 'Modération', emoji: '🛡️', commands: moderationCommands() },
  { label: 'Communauté & vocal', emoji: '🪄', commands: utilityCommands() },
] as const;

export default async function SettingsPage() {
  const { state, config, bot, info, demo } = await getContext();
  const invite = inviteUrl();
  const commands = buildCommands();

  return (
    <>
      <PageHeader
        title="Réglages"
        description="Connexion du bot, serveur géré, référence des commandes et remise à zéro."
        action={
          invite ? (
            <a className="btn btn-primary" href={invite} target="_blank" rel="noreferrer">
              Inviter le bot
            </a>
          ) : (
            <span className="text-xs text-white/40">Ajoute DISCORD_CLIENT_ID pour générer le lien d’invitation.</span>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Bot" subtitle="État de la connexion et du stockage">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Cell label="Statut" value={bot.connected ? 'en ligne' : bot.demo ? 'mode démo' : 'hors ligne'} />
            <Cell label="Identité" value={bot.tag ?? '—'} />
            <Cell label="Latence" value={bot.ping ? `${bot.ping} ms` : '—'} />
            <Cell label="Stockage" value={storageKind()} />
            <Cell label="Serveur" value={`${info.name} (${info.id})`} />
            <Cell label="Commandes" value={String(commands.length)} />
          </dl>
          {bot.error ? <p className="mt-3 text-xs text-rose-300">{bot.error}</p> : null}
          <ActionForm
            action={restartBotAction}
            submitLabel="Redémarrer le bot et resynchroniser les commandes"
            className="mt-4 space-y-3"
            pendingLabel="Redémarrage…"
          />
        </Card>

        <Card title="Serveur géré" subtitle="Le bot applique sa configuration à ce serveur">
          <ActionForm action={saveGuildAction} submitLabel="Enregistrer" className="space-y-3">
            <div>
              <label className="label">Identifiant du serveur</label>
              <input name="guildId" className="field mono" defaultValue={config.guildId ?? ''} placeholder="laisse vide pour auto-détection" />
              <p className="mt-1 text-xs text-white/35">
                {demo
                  ? 'Mode démo : aucune connexion Discord, la valeur est simplement enregistrée.'
                  : 'Utilisé par le panel pour lister les salons et les rôles réels.'}
              </p>
            </div>
          </ActionForm>
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill tone={config.economy.enabled ? 'ok' : 'warn'}>économie</Pill>
            <Pill tone={config.blackjack.enabled ? 'ok' : 'warn'}>blackjack</Pill>
            <Pill tone={config.shop.enabled ? 'ok' : 'warn'}>boutique</Pill>
            <Pill tone={config.moderation.automodEnabled ? 'ok' : 'warn'}>auto-modération</Pill>
            <Pill tone={config.joinToCreate.enabled ? 'ok' : 'warn'}>vocaux temporaires</Pill>
            <Pill tone={config.confessions.enabled ? 'ok' : 'warn'}>confessions</Pill>
          </div>
        </Card>

        <Card title="Variables d'environnement" subtitle="À définir dans Render (ou ton hébergeur)">
          <ul className="space-y-1.5 text-xs text-white/60">
            {[
              ['DISCORD_TOKEN', 'token du bot (obligatoire)'],
              ['DISCORD_CLIENT_ID', 'identifiant de l’application (OAuth + commandes)'],
              ['DISCORD_CLIENT_SECRET', 'secret OAuth pour la connexion admin'],
              ['DISCORD_GUILD_ID', 'serveur géré par défaut'],
              ['OWNER_DISCORD_ID', 'identifiant du propriétaire'],
              ['ADMIN_DISCORD_IDS', 'identifiants des administrateurs, séparés par des virgules'],
              ['SESSION_SECRET', 'clé de chiffrement des sessions (32 caractères minimum)'],
              ['PUBLIC_URL', 'URL publique du panel (callback OAuth)'],
              ['DATABASE_URL', 'PostgreSQL (facultatif, sinon fichier JSON)'],
              ['DEMO_MODE', 'force le mode démo'],
              ['KEEPALIVE_MINUTES', 'fréquence du ping interne'],
              ['TEMP_ROOMS_PER_USER', 'salons vocaux temporaires par membre'],
            ].map(([name, hint]) => (
              <li key={name} className="flex flex-wrap items-baseline gap-2 border-b border-line/50 pb-1.5 last:border-none">
                <code className="text-lilac">{name}</code>
                <span className="text-white/40">{hint}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Zone sensible" subtitle="Remises à zéro">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-white/80">Configuration</p>
              <p className="mb-2 text-xs text-white/40">
                Remet les {state.config.version ? '' : ''}options d’économie, blackjack, boutique et modération
                aux valeurs par défaut. Les données des membres sont conservées.
              </p>
              <ActionForm
                action={resetConfigAction}
                submitLabel="Réinitialiser la configuration"
                className="space-y-3"
              />
            </div>
            <div className="border-t border-line pt-4">
              <p className="text-sm text-white/80">Économie</p>
              <p className="mb-2 text-xs text-white/40">
                Supprime tous les comptes, soldes, inventaires et historiques de transactions.
              </p>
              <ActionForm
                action={wipeEconomyAction}
                submitLabel="Remettre l’économie à zéro"
                className="space-y-3"
              />
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-5" title="Commandes disponibles" subtitle={`${commands.length} commandes slash synchronisées avec Discord`}>
        <div className="grid gap-4 md:grid-cols-3">
          {COMMAND_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-2 text-sm font-medium text-white/85">
                {group.emoji} {group.label}
              </p>
              <ul className="space-y-1 text-xs">
                {group.commands.map((command) => {
                  const options = (command.options ?? []) as unknown as Array<{ name: string }>;
                  return (
                    <li key={command.name} className="border-b border-line/40 pb-1 last:border-none">
                      <code className="text-lilac">/{command.name}</code>
                      <span className="ml-1 text-white/50">{command.description}</span>
                      {options.length ? (
                        <span className="block text-white/35">
                          {options.map((option) => option.name).join(' · ')}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-white/[0.02] px-3 py-2">
      <dt className="text-xs uppercase tracking-wider text-white/40">{label}</dt>
      <dd className="mt-0.5 text-sm text-white/80">{value}</dd>
    </div>
  );
}
