import Link from 'next/link';
import { ActionForm } from '@/components/ActionForm';
import { Card, PageHeader, Pill, EmptyState, shortDate } from '@/components/ui';
import { getContext, inviteUrl } from '@/lib/panel';
import { allChannels } from '@/lib/config';
import { runBlueprintAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const { state, config, bot, info, demo } = await getContext();
  const channels = allChannels(config);
  const report = state.meta.blueprintReport;
  const invite = inviteUrl();

  return (
    <>
      <PageHeader
        title="Déployer le blueprint"
        description="Le bot crée toute la structure du serveur : catégories, salons texte (➥ … emoji), salons vocaux, salons privés et rôle automatique. L’opération est idempotente : relance-la autant de fois que tu veux, rien ne sera dupliqué."
      />

      {!bot.connected ? (
        <Card className="mb-4 border-sand/30" title="Avant de déployer" subtitle="Checklist de mise en route">
          <ol className="space-y-3 text-sm text-white/70">
            <Step done={!demo} title="1. Créer l’application Discord">
              Sur <span className="text-lilac">discord.com/developers/applications</span> → New
              Application → onglet <strong>Bot</strong> → <em>Reset Token</em> puis copie le token
              dans la variable <code>DISCORD_TOKEN</code>.
            </Step>
            <Step done={!demo} title="2. Activer les intents">
              Onglet <strong>Bot</strong> → active <strong>SERVER MEMBERS INTENT</strong>{' '}
              (indispensable pour le rôle automatique et la liste des membres).
            </Step>
            <Step done={Boolean(invite)} title="3. Inviter le bot">
              {invite ? (
                <>
                  Ajoute <code>DISCORD_CLIENT_ID</code> puis{' '}
                  <a href={invite} target="_blank" rel="noreferrer" className="text-lilac underline">
                    invite le bot avec toutes les permissions
                  </a>
                  . Coche « Administrateur » lors de l’invitation : il en a besoin pour créer
                  catégories, salons et rôle.
                </>
              ) : (
                <>Renseigne <code>DISCORD_CLIENT_ID</code> pour générer le lien d’invitation.</>
              )}
            </Step>
            <Step done={Boolean(config.guildId)} title="4. Indiquer le serveur">
              <code>DISCORD_GUILD_ID</code> (clic droit sur le serveur → Copier l’identifiant) ou laisse
              vide si le bot n’est que sur un seul serveur.
            </Step>
            <Step done={bot.connected} title="5. Déployer">
              Clique sur « Appliquer le blueprint » ci-dessous, ou tape <code>/setup</code> sur
              Discord.
            </Step>
          </ol>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card
          title="Lancer le déploiement"
          subtitle="Sur le serveur : tous les salons manquants sont créés, les existants alignés"
        >
          {demo ? (
            <div className="rounded-xl border border-line bg-white/[0.02] p-4 text-sm text-white/50">
              Le mode démo est actif : connecte le bot pour pouvoir appliquer le blueprint.
              L’aperçu ci-contre montre exactement ce qui sera créé.
            </div>
          ) : (
            <ActionForm
              action={runBlueprintAction}
              submitLabel="🚀 Appliquer le blueprint"
              pendingLabel="Déploiement en cours…"
              footer={
                <button type="submit" name="apercu" value="1" className="btn btn-ghost">
                  🧪 Simuler d’abord
                </button>
              }
            >
              <div className="rounded-xl border border-line bg-white/[0.02] p-3">
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" name="role_existants" defaultChecked className="mt-0.5 h-4 w-4 accent-[#c9b8ff]" />
                  <span>
                    <span className="block text-white/85">
                      Attribuer le rôle « {config.role.name} » aux membres déjà présents
                    </span>
                    <span className="block text-xs text-white/40">
                      Décoche si tu ne veux le donner qu’aux prochains arrivants.
                    </span>
                  </span>
                </label>
              </div>

              <div className="rounded-xl border border-line bg-white/[0.02] p-3 text-xs text-white/45">
                💡 Discord limite la création de salons (10 par 10 minutes). Si le déploiement
                s’arrête à mi-chemin, relance-le : il reprend là où il s’est arrêté.
              </div>
            </ActionForm>
          )}

          {report ? (
            <div className="mt-5 rounded-xl border border-line bg-black/25 p-4">
              <p className="mb-2 text-xs uppercase tracking-wider text-white/40">
                Dernier rapport · {shortDate(report.finishedAt)} · {state.meta.lastSetupBy ?? '—'}
              </p>
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                <Pill tone="ok">{report.totals.created} créé(s)</Pill>
                <Pill tone="info">{report.totals.updated} mis à jour</Pill>
                <Pill tone="muted">{report.totals.ok} conforme(s)</Pill>
                {report.totals.error ? <Pill tone="error">{report.totals.error} erreur(s)</Pill> : null}
              </div>
              <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1 text-xs">
                {report.steps
                  .filter((s) => s.level !== 'ok')
                  .map((s, i) => (
                    <li key={i} className="flex gap-2 text-white/65">
                      <span>
                        {{ created: '🟢', updated: '🔵', skipped: '⚪', error: '🔴', ok: '⚪' }[s.level]}
                      </span>
                      <span>{s.message}</span>
                    </li>
                  ))}
              </ul>
              <Link href="/structure" className="mt-3 inline-block text-xs text-lilac hover:underline">
                Voir l’audit complet →
              </Link>
            </div>
          ) : null}
        </Card>

        <Card title="Aperçu" subtitle={`${channels.length} salons · ${config.categories.length} catégories`}>
          <div className="space-y-4 text-sm">
            <div className="rounded-xl border border-line bg-white/[0.02] p-3">
              <p className="text-xs uppercase tracking-wider text-white/40">Rôle</p>
              <p className="mt-1 flex items-center gap-2">
                <span
                  className="h-3.5 w-3.5 rounded-full border border-white/20"
                  style={{ backgroundColor: config.role.color }}
                />
                <span className="text-white/85">{config.role.name}</span>
                <span className="mono text-white/35">{config.role.color}</span>
              </p>
            </div>

            {config.categories.map((cat) => (
              <div key={cat.key}>
                <p className="flex items-center gap-2 text-white/85">
                  <span>{cat.emoji}</span>
                  <span className="font-medium">{cat.slug}</span>
                  {cat.adminOnly ? <Pill tone="muted">admin</Pill> : null}
                </p>
                <ul className="mt-1.5 ml-5 space-y-1 border-l border-line pl-4 text-xs text-white/55">
                  {cat.channels.map((ch) => (
                    <li key={ch.key}>
                      {ch.kind === 'voice' ? (
                        <>
                          {ch.emoji} {ch.label ?? ch.slug}
                          {ch.userLimit ? <span className="text-white/35"> · {ch.userLimit} place(s)</span> : null}
                          {ch.isHub ? <span className="text-lilac"> · hub join-to-create</span> : null}
                        </>
                      ) : (
                        <>
                          {config.prefix} {ch.slug} {ch.emoji}
                          {ch.readOnly ? <span className="text-white/35"> · lecture seule</span> : null}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {!report ? <EmptyState>Aucun déploiement lancé pour l’instant.</EmptyState> : null}
          <p className="mt-4 text-xs text-white/35">
            Serveur ciblé : {info.name} <span className="mono">({info.id})</span>
          </p>
        </Card>
      </div>
    </>
  );
}

function Step({
  done,
  title,
  children,
}: {
  done?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className={`mt-0.5 ${done ? 'text-mint' : 'text-white/25'}`}>{done ? '✓' : '○'}</span>
      <span>
        <span className="block text-white/85">{title}</span>
        <span className="block text-xs text-white/50">{children}</span>
      </span>
    </li>
  );
}
