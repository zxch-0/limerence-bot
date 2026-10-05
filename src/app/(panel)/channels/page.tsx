import { Card, PageHeader, Pill } from '@/components/ui';
import { ChannelsEditor } from '@/components/ChannelsEditor';
import { getContext } from '@/lib/panel';
import { DEFAULT_CATEGORIES, allChannels } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default async function ChannelsPage() {
  const { config } = await getContext();
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
    </>
  );
}
