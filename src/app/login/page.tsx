import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isDemoMode, readSession } from '@/lib/auth';
import { Pill } from '@/components/ui';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  state: 'Session de connexion expirée (protection anti-CSRF). Réessaie.',
  permissions:
    'Ton compte Discord n’a pas la permission « Gérer le serveur » sur ce serveur. Demande à un administrateur, ou renseigne OWNER_DISCORD_ID.',
  oauth: 'Discord a refusé la connexion. Vérifie DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET et l’URL de redirection.',
  refus: 'Tu as annulé l’autorisation Discord.',
  config: 'DISCORD_CLIENT_ID n’est pas configuré sur ce déploiement.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const demo = isDemoMode();

  // déjà connecté ? direction le panel (en démo la session est automatique)
  const session = await readSession().catch(() => null);
  if (session) redirect('/');

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="text-center">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-lilac to-blush text-2xl text-ink">
          ✦
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Limerence</h1>
        <p className="mt-2 max-w-lg text-sm text-white/50">
          Panel d’administration du bot Discord : blueprint du serveur complet (catégories, salons
          texte <span className="mono text-lilac">➥ nom emoji</span>, vocaux, salons privés),
          confessions anonymes, annonces, modération et journal.
        </p>
      </div>

      {error ? (
        <div className="w-full rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-center text-sm text-rose-200">
          {ERRORS[error] ?? 'Connexion impossible.'}
        </div>
      ) : null}

      <div className="glass w-full rounded-2xl border border-line p-6">
        {demo ? (
          <>
            <div className="mb-4 flex items-center justify-center gap-2">
              <Pill tone="warn">mode démo actif</Pill>
            </div>
            <p className="mb-4 text-center text-sm text-white/55">
              Les identifiants Discord ne sont pas encore renseignés : tu peux explorer le panel avec
              des données fictives. Ajoute <code>DISCORD_TOKEN</code>, <code>DISCORD_CLIENT_ID</code>,{' '}
              <code>DISCORD_CLIENT_SECRET</code> et <code>DISCORD_GUILD_ID</code> pour passer en réel.
            </p>
            <Link href="/api/auth/login" className="btn btn-primary w-full">
              Entrer en mode démo →
            </Link>
          </>
        ) : (
          <>
            <p className="mb-4 text-center text-sm text-white/55">
              Connexion réservée aux administrateurs du serveur (permission « Gérer le serveur »).
            </p>
            <a href="/api/auth/login" className="btn btn-primary w-full">
              Se connecter avec Discord
            </a>
            <p className="mt-4 text-center text-xs text-white/35">
              Ajoute <span className="mono">{(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'https://ton-app.onrender.com') + '/api/auth/callback'}</span>{' '}
              dans <em>OAuth2 → Redirects</em> du portail développeur Discord.
            </p>
          </>
        )}
      </div>

      <ul className="grid w-full gap-3 text-sm text-white/45 sm:grid-cols-3">
        {[
          ['🧱', 'Blueprint idempotent', 'Créer ou réparer le serveur en un clic, sans doublon.'],
          ['🤫', 'Confessions anonymes', 'Validation par les admins, réactions, publication propre.'],
          ['🎧', 'Vocaux privés', 'solo, duo, trio, quatuor + salons temporaires à la demande.'],
        ].map(([emoji, title, desc]) => (
          <li key={title} className="rounded-2xl border border-line bg-white/[0.02] p-4">
            <span className="text-lg">{emoji}</span>
            <p className="mt-1 text-white/80">{title}</p>
            <p className="text-xs">{desc}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
