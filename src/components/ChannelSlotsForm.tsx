import { CHANNEL_SLOTS, CHANNEL_SLOT_META, type AppConfig } from '@/lib/types';
import { missingSlots } from '@/lib/channels';
import type { ChannelOption } from '@/lib/demo';
import { saveChannelsAction } from '@/app/(panel)/actions/config';
import { ActionForm } from './ActionForm';
import { ChannelPicker } from './ChannelPicker';
import { Pill } from './ui';

// ============================================================
//  Association des salons Discord utilisés par le bot.
//  Le bot ne crée plus de structure : chaque emplacement pointe
//  vers un salon existant choisi ici.
// ============================================================

export function ChannelSlotsForm({
  config,
  channels,
}: {
  config: AppConfig;
  channels: ChannelOption[];
}) {
  const missing = new Set(missingSlots(config));

  return (
    <ActionForm action={saveChannelsAction} submitLabel="Enregistrer les salons" className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {CHANNEL_SLOTS.map((slot) => {
          const meta = CHANNEL_SLOT_META[slot];
          return (
            <div key={slot} className="rounded-xl border border-line bg-white/[0.02] p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm text-white/85">
                    {meta.emoji} {meta.label}
                  </p>
                  <p className="text-xs text-white/40">{meta.hint}</p>
                </div>
                {missing.has(slot) ? <Pill tone="warn">manquant</Pill> : <Pill tone="ok">ok</Pill>}
              </div>
              <ChannelPicker
                name={`slot:${slot}`}
                value={config.channels[slot]}
                options={channels}
                types={['text']}
                emptyLabel="— non défini —"
              />
            </div>
          );
        })}
      </div>
      <p className="text-xs text-white/35">
        Chaque emplacement est optionnel : sans salon associé, le bot ignore simplement la sortie
        concernée et continue de fonctionner.
      </p>
    </ActionForm>
  );
}
