import Link from 'next/link';
import { ConfigEditor } from '@/components/ConfigEditor';
import { ActionForm } from '@/components/ActionForm';
import { Card, PageHeader, Pill } from '@/components/ui';
import { MODERATION_FIELDS, MODERATION_SECTIONS } from '@/lib/moderation/config';
import { getContext } from '@/lib/panel';
import { sectionViews, valuesOf } from '@/lib/panelViews';
import { saveModerationConfigAction } from '../actions/config';
import { testAutomodAction } from '../actions/rooms';

export const dynamic = 'force-dynamic';

/** Règles affichées dans le tableau récapitulatif. */
const RULES = [
  { key: 'automodBlockLinks', label: 'Liens', detail: 'Tout lien hors liste blanche est bloqué.' },
  { key: 'automodBlockInvites', label: 'Invitations Discord', detail: 'Les discord.gg / discord.com/invite sont bloqués.' },
  { key: 'automodBlockMassMentions', label: 'Mentions massives', detail: 'Au-delà du seuil de mentions.' },
  { key: 'automodBlockCaps', label: 'MAJUSCULES', detail: 'Selon le pourcentage de majuscules et la longueur minimale.' },
  { key: 'automodBlockDuplicates', label: 'Messages répétés', detail: 'Deux messages identiques dans la fenêtre de temps.' },
  { key: 'automodBannedWords', label: 'Mots interdits', detail: 'Liste de mots ou expressions bloquées.' },
  { key: 'automodMaxLength', label: 'Longueur', detail: 'Messages trop longs (murs de texte).' },
  { key: 'automodMaxEmojis', label: 'Emojis', detail: 'Trop d’emojis dans un seul message.' },
] as const;

export default async function AutomodPage() {
  const { state } = await getContext();
  const config = state.config.moderation;

  const automodSections = MODERATION_SECTIONS.filter((section) => section.id === 'automod' || section.id === 'raid');
  const views = sectionViews(
    MODERATION_FIELDS.filter((field) => field.section === 'automod' || field.section === 'raid'),
    automodSections,
  );

  const automodLogs = state.logs.filter((entry) => entry.source === 'automod').slice(0, 15);

  return (
    <>
      <PageHeader
        title="Auto-modération"
        description="Le bot analyse chaque message en temps réel. Teste un texte ci-dessous pour vérifier le verdict avant de l'activer."
        action={
          <Link className="btn btn-ghost" href="/moderation">
            ← Modération
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Testeur" subtitle="Analyse un message avec la configuration actuelle">
          <ActionForm action={testAutomodAction} submitLabel="Tester" className="space-y-3">
            <div>
              <label className="label">Message</label>
              <textarea name="content" className="field min-h-24" rows={4} placeholder="Colle ici un message à tester…" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Mentions</label>
                <input name="mentions" type="number" min={0} className="field" defaultValue={0} />
              </div>
              <div>
                <label className="label">Emojis</label>
                <input name="emojis" type="number" min={0} className="field" defaultValue={0} />
              </div>
            </div>
            <div>
              <label className="label">Rôles du membre (identifiants, séparés par des virgules)</label>
              <input name="roleIds" className="field mono" placeholder="123456789012345678, 123456789012345679" />
            </div>
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input type="checkbox" name="isBot" className="h-4 w-4 accent-[#c9b8ff]" />
              Le message vient d’un bot
            </label>
          </ActionForm>
        </Card>

        <Card title="Règles actives" subtitle="Ce que le bot surveille maintenant">
          <ul className="space-y-2">
            {RULES.map((rule) => {
              const enabled = config[rule.key as keyof typeof config] === true;
              const configured = rule.key === 'automodBannedWords' ? (config.automodBannedWords ?? []).length > 0 : enabled;
              return (
                <li key={rule.key} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-white/[0.02] p-3">
                  <span>
                    <span className="block text-sm text-white/85">{rule.label}</span>
                    <span className="block text-xs text-white/40">{rule.detail}</span>
                  </span>
                  {configured ? <Pill tone="ok">actif</Pill> : <Pill tone="muted">inactif</Pill>}
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Pill tone={config.automodEnabled ? 'ok' : 'warn'}>
              auto-modération {config.automodEnabled ? 'activée' : 'désactivée'}
            </Pill>
            <Pill tone="info">action : {config.automodAction}</Pill>
            {config.automodAction === 'timeout' ? <Pill tone="info">mute {config.automodTimeoutMinutes} min</Pill> : null}
            <Pill tone="muted">{(config.automodLinkWhitelist ?? []).length} domaine(s) en liste blanche</Pill>
            <Pill tone="muted">{(config.automodIgnoredRoles ?? []).length} rôle(s) ignoré(s)</Pill>
          </div>
        </Card>
      </div>

      <Card className="mt-5" title="Détections récentes" subtitle="Journal de l'auto-modération">
        {automodLogs.length === 0 ? (
          <p className="text-sm text-white/45">Aucune détection pour l’instant.</p>
        ) : (
          <ul className="space-y-1.5 text-sm text-white/60">
            {automodLogs.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-3 border-b border-line/50 pb-1.5 last:border-none">
                <span>
                  {entry.action}
                  {entry.detail ? <span className="text-white/40"> — {entry.detail}</span> : null}
                </span>
                <span className="text-xs text-white/30">{new Date(entry.at).toLocaleString('fr-FR')}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-6">
        <ConfigEditor
          sections={views}
          values={valuesOf(config)}
          action={saveModerationConfigAction}
          submitLabel="Enregistrer l'auto-modération"
          footer={
            <p className="text-xs text-white/35">
              Cet éditeur enregistre la configuration de modération complète : les options d’avertissements,
              de dossiers et de sanctions restent celles de la page{' '}
              <Link className="underline" href="/moderation">
                Modération
              </Link>
              .
            </p>
          }
        />
      </div>
    </>
  );
}
