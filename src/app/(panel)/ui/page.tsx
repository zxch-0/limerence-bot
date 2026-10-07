import Link from 'next/link';
import { ConfigEditor } from '@/components/ConfigEditor';
import { DiscordPreview, type PreviewTab } from '@/components/DiscordPreview';
import { InlineAction } from '@/components/ActionForm';
import { Card, PageHeader, Pill, Stat } from '@/components/ui';
import { UI_FIELDS, UI_OPTIONS_COUNT, UI_SECTIONS } from '@/lib/ui/config';
import {
  cardFor,
  featureFlags,
  navButtons,
  navSelect,
  parseColor,
  visibleSections,
  type UiContext,
  type UiSectionId,
} from '@/bot/ui';
import { getContext } from '@/lib/panel';
import { sectionViews, valuesOf } from '@/lib/panelViews';
import { resetSectionAction, saveUiConfigAction } from '../actions/config';

export const dynamic = 'force-dynamic';

function hex(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}

/** Libellés lisibles pour les boutons de l'aperçu. */
function buttonLabels(rows: ReturnType<typeof navButtons>): string[] {
  return rows.flatMap((row) =>
    row.components.map((component) => (component.data as { label?: string }).label ?? '•'),
  );
}

function selectLabel(rows: ReturnType<typeof navSelect>): string | null {
  return rows[0]?.components[0]?.data.placeholder ?? null;
}

export default async function UiPage() {
  const { state, config, guild, demo, bot } = await getContext();
  const views = sectionViews(UI_FIELDS, UI_SECTIONS);
  const features = featureFlags(config);

  // Contexte d'aperçu : un membre réel s'il existe, sinon un membre fictif.
  const previewUserId = Object.keys(state.accounts)[0] ?? process.env.OWNER_DISCORD_ID ?? '100000000000000000';
  const ctx: UiContext = {
    userId: previewUserId,
    userName: 'Membre',
    isStaff: true,
    guildName: guild?.name ?? 'Serveur Limerence',
    memberCount: guild?.memberCount ?? 128,
    channelCount: guild?.channels.cache.size ?? 24,
    roleCount: guild?.roles.cache.size ?? 12,
    webUrl: process.env.PUBLIC_URL ?? 'https://mon-panel.example',
  };

  const sections = visibleSections(config.ui, features, true);
  const ids: UiSectionId[] = ['hub', ...sections.map((section) => section.id)];
  const tabs: PreviewTab[] = ids.map((id) => {
    const section = id === 'hub' ? null : sections.find((item) => item.id === id);
    const color = section && config.ui.colorizeBySection ? section.color : parseColor(config.ui.accentColor);
    return {
      id,
      label: id === 'hub' ? 'Menu central' : (section?.label ?? id),
      emoji: id === 'hub' ? '🧭' : (section?.emoji ?? '•'),
      color: hex(color),
      card: cardFor(id, state, config, ctx, sections),
      buttons: buttonLabels(navButtons(config.ui, sections, id)),
      selectLabel: selectLabel(navSelect(config.ui, sections, id)),
    };
  });

  const enabledSections = sections.length;
  const hiddenCount = 6 - enabledSections;

  return (
    <>
      <PageHeader
        title="Interface du bot"
        description={`${UI_OPTIONS_COUNT} options : thème, menu central et cartes. Tout ce que le bot affiche passe par ces réglages.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link className="btn btn-ghost" href="/welcome">
              Message de bienvenue
            </Link>
            <InlineAction
              action={resetSectionAction}
              fields={{ section: 'ui' }}
              className="btn btn-danger"
              confirm="Remettre l’interface aux valeurs par défaut ?"
            >
              Valeurs par défaut
            </InlineAction>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Options d’interface" value={String(UI_OPTIONS_COUNT)} />
        <Stat label="Sections visibles" value={`${enabledSections} / 6`} />
        <Stat label="Sections masquées" value={String(Math.max(0, hiddenCount))} />
        <Stat label="État du menu" value={config.ui.hubEnabled ? 'actif' : 'coupé'} />
      </div>

      <div className="mt-5 grid gap-3 sm:flex-row sm:flex-wrap">
        <Pill tone={config.ui.hubEnabled ? 'ok' : 'warn'}>{config.ui.hubEnabled ? 'menu central actif' : 'menu central coupé'}</Pill>
        <Pill tone="info">accent {config.ui.accentColor}</Pill>
        <Pill tone={bot.connected ? 'ok' : 'muted'}>{demo ? 'aperçu (aucun serveur)' : 'serveur connecté'}</Pill>
        <Pill tone="muted">commande Discord : /panel</Pill>
      </div>

      <Card
        className="mt-5"
        title="Aperçu du rendu Discord"
        subtitle="Calculé avec les mêmes fonctions que le bot : change une option, enregistre, l'aperçu suit."
      >
        <DiscordPreview
          tabs={tabs}
          brand={config.ui.brandName}
          accent={hex(parseColor(config.ui.accentColor))}
          showTimestamp={config.ui.showTimestamp}
          botTag={state.meta.botTag ?? 'Limerence'}
          showSelect={config.ui.hubUseSelectMenu}
          showButtons={config.ui.hubUseButtons}
        />
        <p className="mt-3 text-xs text-white/35">
          Les données affichées (soldes, classement, boutique, dossiers) sont celles réellement enregistrées sur ce
          serveur.
        </p>
      </Card>

      <div className="mt-6">
        <ConfigEditor
          sections={views}
          values={valuesOf(config.ui)}
          action={saveUiConfigAction}
          submitLabel="Enregistrer l’interface"
        />
      </div>
    </>
  );
}
