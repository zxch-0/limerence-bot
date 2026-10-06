import { Card, PageHeader, Pill } from '@/components/ui';
import { RoleEditor } from '@/components/RoleEditor';
import { getContext } from '@/lib/panel';

export const dynamic = 'force-dynamic';

export default async function RolePage() {
  const { config, guild } = await getContext();

  const realRole = guild?.roles.cache.find(
    (r) => r.name.toLowerCase() === config.role.name.toLowerCase(),
  );
  const count = guild
    ? guild.members.cache.filter((m) => realRole && m.roles.cache.has(realRole.id)).size
    : null;

  return (
    <>
      <PageHeader
        title="Rôle limerencien"
        description="Le rôle donné automatiquement à chaque personne qui rejoint le serveur. Blanc par défaut, comme demandé."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Pill tone={realRole ? 'ok' : 'warn'}>
          {realRole ? 'rôle présent sur le serveur' : 'rôle pas encore créé — lance un déploiement'}
        </Pill>
        <Pill tone="muted">couleur {config.role.color}</Pill>
        {count !== null ? <Pill tone="info">{count} membre(s) avec le rôle</Pill> : null}
      </div>

      <Card title="Configuration du rôle" subtitle="Nom, couleur et attribution automatique">
        <RoleEditor initial={config.role} />
      </Card>

      <Card className="mt-4" title="Comment ça marche">
        <ul className="space-y-2 text-sm text-white/60">
          <li>
            🎉 <strong className="text-white/85">À l’arrivée</strong> : le bot ajoute le rôle
            automatiquement (intent « Server Members » requis) et poste un message de bienvenue dans
            le salon de présentation.
          </li>
          <li>
            🤍 <strong className="text-white/85">Couleur blanche</strong> : <code>#FFFFFF</code>. Discord
            affiche la couleur du rôle le plus haut dans la hiérarchie.
          </li>
          <li>
            🔁 <strong className="text-white/85">Membres existants</strong> : utilise l’option
            « attribuer aux membres déjà présents » lors du déploiement, ou{' '}
            <a href="/members" className="text-lilac underline">
              la page Membres
            </a>{' '}
            pour l’attribuer à la main.
          </li>
        </ul>
      </Card>
    </>
  );
}
