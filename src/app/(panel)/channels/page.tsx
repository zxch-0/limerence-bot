import { ActionForm } from '@/components/ActionForm';
import { Card, Field, PageHeader, Pill } from '@/components/ui';
import { ChannelsEditor } from '@/components/ChannelsEditor';
import { getContext } from '@/lib/panel';
import { DEFAULT_CATEGORIES, allChannels } from '@/lib/config';
import { channelDeletionPhrase } from '@/lib/maintenance';
import { deleteAllChannelsAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ChannelsPage() {
  const { config, guild, demo } = await getContext();
  if (guild) await guild.channels.fetch().catch(() => undefined);
  const channels = allChannels(config);
  const text = channels.filter((c) => c.kind === 'text');
  const voice = channels.filter((c) => c.kind === 'voice');

  return (
    <>
      <PageHeader
        title="Salons & catégories"
        description="Modifie le blueprint : tout salon texte respecte la règle ➥ nom emoji, les salons vocaux portent un 🔊 et le hub permet de créer des salons privés temporaires."
      />

      <Card className="mb-4" title="Règle d’or" subtitle="Rappel automatique">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="mono rounded-lg bg-black/40 px-3 py-1.5 text-lilac">
            {config.prefix} nom-du-salon 💬
          </span>
          <span className="text-white/45">← les {text.length} salons texte du blueprint</span>
          <span className="mono rounded-lg bg-black/40 px-3 py-1.5 text-lilac">🔊 Nom du vocal</span>
          <span className="text-white/45">← les {voice.length} salons vocaux</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {config.categories.map((c) => (
            <Pill key={c.key} tone="muted">
              {c.emoji} {c.slug} · {c.channels.length}
            </Pill>
          ))}
        </div>
      </Card>

      <ChannelsEditor
        initial={config.categories}
        defaults={DEFAULT_CATEGORIES}
        prefix={config.prefix}
      />

      <Card className="mt-6 border-rose-400/35" title="🚨 Suppression d’urgence" subtitle="À utiliser uniquement si la structure du serveur doit être entièrement reconstruite">
        <div className="space-y-3 text-sm">
          <p className="text-rose-200/85">
            Cette action efface tous les salons Discord du serveur : textes, vocaux, forums et catégories. Les messages hébergés dans ces salons seront perdus. Elle ne touche ni aux rôles ni aux membres.
          </p>
          {guild ? (
            <>
              <p className="text-white/55">Salons et catégories actuellement détectés : <strong className="text-white">{guild.channels.cache.size}</strong>.</p>
              <ActionForm action={deleteAllChannelsAction} submitLabel="🗑️ Supprimer tous les salons" pendingLabel="Suppression en cours…" className="max-w-xl space-y-3">
                <Field label={`Pour confirmer, saisis exactement : ${channelDeletionPhrase(guild.id)}`} hint="La confirmation est propre à ce serveur et ne peut pas être déclenchée par erreur de clic.">
                  <input className="field mono" name="confirmation" required autoComplete="off" placeholder={channelDeletionPhrase(guild.id)} />
                </Field>
              </ActionForm>
              <p className="text-xs text-white/40">Après la suppression, relance « Déployer le blueprint » ou /setup pour reconstruire la structure. Les salons personnalisés hors blueprint ne seront pas recréés.</p>
            </>
          ) : (
            <p className="text-xs text-white/45">{demo ? 'Connecte le bot à Discord pour utiliser cette action.' : 'Le bot doit être connecté au serveur.'}</p>
          )}
        </div>
      </Card>
    </>
  );
}
