'use client';

import { useState } from 'react';

// ============================================================
//  Aperçu du rendu Discord dans le panel.
//  Les cartes sont calculées côté serveur par les mêmes fonctions
//  pures que le bot (`src/bot/ui.ts`) : ce que tu vois ici est
//  exactement ce que Discord affichera.
// ============================================================

export interface PreviewField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface PreviewCard {
  section: string;
  title: string;
  description: string;
  fields: PreviewField[];
  footer?: string;
}

export interface PreviewTab {
  id: string;
  label: string;
  emoji: string;
  color: string;
  card: PreviewCard;
  buttons: string[];
  selectLabel: string | null;
}

/** Markdown minimal de Discord : gras, italique, code. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index}`;
    index += 1;
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="rounded bg-black/40 px-1 py-0.5 text-[11px] text-[#e8d9ff]">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(
        <em key={key} className="italic text-white/80">
          {token.slice(1, -1)}
        </em>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Block({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, lineIndex) => (
        <span key={lineIndex}>
          {lineIndex > 0 ? <br /> : null}
          {renderInline(line, `l${lineIndex}`)}
        </span>
      ))}
    </>
  );
}

export function DiscordPreview({
  tabs,
  brand,
  accent,
  showTimestamp,
  botTag,
  showSelect,
  showButtons,
}: {
  tabs: PreviewTab[];
  brand: string;
  accent: string;
  showTimestamp: boolean;
  botTag: string;
  showSelect: boolean;
  showButtons: boolean;
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? 'hub');
  const tab = tabs.find((item) => item.id === active) ?? tabs[0];
  if (!tab) return <p className="text-sm text-white/40">Aucune section activée.</p>;

  const { card } = tab;

  // Champs alignés côte à côte regroupés comme le fait Discord (3 max).
  const ordered: { fields: PreviewField[]; inline: boolean }[] = [];
  for (const field of card.fields) {
    if (field.inline) {
      if (!ordered.length || !ordered[ordered.length - 1].inline) ordered.push({ fields: [], inline: true });
      ordered[ordered.length - 1].fields.push(field);
    } else {
      ordered.push({ fields: [field], inline: false });
    }
  }

  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActive(item.id)}
            className={`rounded-full px-3 py-1 text-xs transition ${
              item.id === active ? 'bg-white/15 text-white' : 'bg-white/5 text-white/55 hover:text-white/80'
            }`}
          >
            {item.emoji} {item.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-white/5 bg-[#2b2d31]">
        <div className="flex gap-3 p-4">
          <div className="mt-1 h-10 w-10 shrink-0 rounded-full" style={{ background: accent }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              {brand}
              <span className="rounded bg-[#5865f2] px-1 py-px text-[9px] font-bold tracking-wide text-white">BOT</span>
              <span className="text-xs font-normal text-white/35">{botTag}</span>
            </div>

            <div className="mt-2 overflow-hidden rounded border-l-4 bg-[#313338] p-3" style={{ borderColor: tab.color }}>
              <div className="text-[11px] text-white/50">
                {tab.emoji} {brand}
              </div>
              <h4 className="mt-1 text-sm font-bold text-white">{card.title}</h4>
              {card.description ? (
                <div className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-white/75">
                  <Block text={card.description} />
                </div>
              ) : null}

              {ordered.map((group, groupIndex) => (
                <div
                  key={groupIndex}
                  className={`mt-3 grid gap-3 ${group.inline ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1'}`}
                >
                  {group.fields.map((field, fieldIndex) => (
                    <div key={fieldIndex} className="min-w-0">
                      <div className="text-[11px] font-semibold text-white">{field.name}</div>
                      <div className="mt-0.5 break-words text-[12px] leading-relaxed text-white/70">
                        <Block text={field.value} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              {card.footer || showTimestamp ? (
                <div className="mt-3 border-t border-white/5 pt-2 text-[10px] text-white/40">
                  {card.footer}
                  {card.footer && showTimestamp ? ' · ' : ''}
                  {showTimestamp ? new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                </div>
              ) : null}
            </div>

            {showSelect && tab.selectLabel ? (
              <div className="mt-2 max-w-sm rounded border border-white/10 bg-[#1e1f22] px-3 py-1.5 text-[13px] text-white/60">
                {tab.selectLabel}
                <span className="ml-2 text-white/30">▾</span>
              </div>
            ) : null}

            {showButtons ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tab.buttons.map((button, index) => (
                  <span
                    key={index}
                    className={`rounded px-2.5 py-1 text-[12px] ${
                      index === 0 ? 'bg-[#5865f2] text-white' : 'bg-[#4e5058] text-white/85'
                    }`}
                  >
                    {button}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
