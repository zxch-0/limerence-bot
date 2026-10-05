import { ActionForm } from '@/components/ActionForm';
import { CopyButton } from '@/components/CopyButton';
import { Card, Field, PageHeader, Pill, Toggle, shortDate } from '@/components/ui';
import { getContext, inviteUrl } from '@/lib/panel';
import { storageKind } from '@/lib/store';
import { isDemoMode } from '@/lib/auth';
import {
  resetConfigAction,
  restartBotAction,
  saveGeneralAction,
} from '../actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const { config, bot, state, info } = await getContext();
  const invite = inviteUrl();

  const envChecks: Array<{ key: string; label: string; hint: string; required?: boolean }> = [
    { key: 'DISCORD_TOKEN', label: 'Token du bot', hint: 'Dev Portal → Bot → Reset Token', required: true },
    { key: 'DISCORD_CLIENT_ID', label: 'Application ID', hint: 'Dev Portal → General Information', required: true },
    { key: 'DISCORD_CLIENT_SECRET', label: 'Client Secret', hint: 'Dev Portal → OAuth2 (connexion au panel)', required: true },
    { key: 'DISCORD_GUILD_ID', label: 'ID du serveur', hint: 'Clic droit sur le serveur → Copier l’identifiant' },
    { key: 'SESSION_SECRET', label: 'Secret de session', hint: 'Généré automatiquement par Render' },
    { key: 'DATABASE_URL', label: 'Base Postgres', hint: 'Optionnel : config persistante entre redéploiements' },
    { key: 'OWNER_DISCORD_ID', label: 'ID du propriétaire', hint: 'Accès admin garanti au panel' },
  ];

  return (
    <>
      <PageHeader
        title="Réglages"
        description="Configuration du bot, variables d’environnement, déploiement et maintenance."
      />

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card title="Paramètres généraux" subtitle="Préfixe des salons texte, serveur ciblé, redémarrage">
          <ActionForm action={saveGeneralAction} submitLabel="💾 Enregistrer">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Symbole d’ouverture des salons texte"
                hint="Tous les salons texte seront renommés « préfixe nom emoji »."
              >
                <input className="field mono" name="prefix" defaultValue={config.prefix} maxLength={4} />
              </Field>
              <Field label="ID du serveur Discord" hint="Vide = le premier serveur du bot">
                <input
                  className="field mono"
                  name="guildId"
                  defaultValue={config.guildId ?? ''}
                  placeholder="123456789012345678"
                />
              </Field>
            </div>

            <Toggle
              name="autoSetupOnBoot"
              label="Déployer automatiquement le blueprint à chaque démarrage"
              description="Pratique : si un salon est supprimé pendant une nuit, le bot le recrée."
              defaultChecked={config.autoSetupOnBoot}
            />
          </ActionForm>

          <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <ActionForm action={restartBotAction} submitLabel="♻️ Redémarrer le bot" className="" pendingLabel="…">
              <span className="text-xs text-white/45">
                Reconnecte la passerelle et réenregistre les commandes slash.
              </span>
            </ActionForm>
            <ActionForm
              action={resetConfigAction}
              submitLabel="↺ Réinitialiser la configuration"
              className=""
              pendingLabel="…"
            >
              <span className="text-xs text-white/45">
                Revient au blueprint Limerence d’origine (n’efface rien sur Discord).
              </span>
            </ActionForm>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Variables d’environnement" subtitle="Statut sur ce déploiement">
            <ul className="space-y-2 text-sm">
              {envChecks.map((v) => {
                const set = Boolean(process.env[v.key]?.trim());
                return (
                  <li
                    key={v.key}
                    className="flex items-start justify-between gap-3 border-b border-line/50 pb-2 last:border-none"
                  >
                    <span>
                      <span className="mono block text-xs text-white/70">{v.key}</span>
                      <span className="block text-xs text-white/35">
                        {v.label} — {v.hint}
                      </span>
                    </span>
                    {set ? (
                      <Pill tone="ok">défini</Pill>
                    ) : (
                      <Pill tone={v.required ? 'error' : 'muted'}>
                        {v.required ? 'à définir' : 'optionnel'}
                      </Pill>
                    )}
                  </li>
                );
              })}
            </ul>
            {isDemoMode() ? (
              <p className="mt-3 rounded-xl border border-sand/25 bg-sand/10 p-3 text-xs text-sand">
                Le mode démo s’active automatiquement tant que le token, l’ID et le secret Discord ne
                sont pas renseignés.
              </p>
            ) : null}
          </Card>

          <Card title="Invitation du bot" subtitle="Permission Administrateur requise pour créer la structure">
            {invite ? (
              <>
                <p className="mono break-all rounded-xl bg-black/40 p-3 text-xs text-lilac">{invite}</p>
                <div className="mt-3 flex gap-2">
                  <CopyButton value={invite} label="Copier le lien" />
                  <a href={invite} target="_blank" rel="noreferrer" className="btn btn-ghost btn-xs">
                    Ouvrir Discord
                  </a>
                </div>
              </>
            ) : (
              <p className="text-sm text-white/50">
                Renseigne <code>DISCORD_CLIENT_ID</code> pour générer le lien d’invitation.
              </p>
            )}
          </Card>

          <Card title="Persistance & hébergement" subtitle="Render (plan gratuit) + UptimeRobot">
            <ul className="space-y-2 text-sm text-white/60">
              <li>
                💾 Stockage actuel : <Pill tone={storageKind() === 'postgres' ? 'ok' : 'muted'}>{storageKind()}</Pill>
              </li>
              <li>
                🌐 URL publique :{' '}
                <span className="mono text-xs text-white/70">
                  {process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'localhost'}
                </span>
              </li>
              <li>
                ⏱️ Auto-ping interne : toutes les {process.env.KEEPALIVE_MINUTES ?? '10'} minutes vers{' '}
                <span className="mono text-xs">/health</span>
              </li>
              <li>
                🔔 Ajoute <strong>UptimeRobot</strong> sur{' '}
                <span className="mono text-xs">
                  {(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'https://ton-app.onrender.com') +
                    '/health'}
                </span>{' '}
                (toutes les 5 min) : le bot reste éveillé 24/7 sans plan payant.
              </li>
              <li>
                🧠 Sans <code>DATABASE_URL</code>, le fichier JSON est effacé à chaque redéploiement :
                la structure Discord n’est pas perdue, seuls confessions/annonces/logs le sont.
              </li>
            </ul>
          </Card>

          <Card title="État" subtitle="Résumé du déploiement">
            <ul className="space-y-2 text-sm text-white/60">
              <li>
                🤖 Bot :{' '}
                {bot.connected ? (
                  <Pill tone="ok">en ligne{bot.tag ? ` · ${bot.tag}` : ''}</Pill>
                ) : bot.demo ? (
                  <Pill tone="warn">mode démo</Pill>
                ) : (
                  <Pill tone="error">hors ligne</Pill>
                )}
              </li>
              <li>
                🏠 Serveur : {info.name} <span className="mono text-xs">({info.id})</span>
              </li>
              <li>
                🚀 Dernier blueprint :{' '}
                {state.meta.blueprintReport ? shortDate(state.meta.blueprintReport.finishedAt) : 'jamais'}
              </li>
              <li>
                🧾 Journal : {state.logs.length} entrées · 🤫 {state.confessions.length} confessions ·
                📣 {state.announcements.length} annonces
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
