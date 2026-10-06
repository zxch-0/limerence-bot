'use client';

import { useActionState, useMemo, useState } from 'react';
import { SubmitButton } from './ActionForm';
import type { ActionState, EmbedField } from '@/lib/types';
import type { ChannelOption } from '@/lib/demo';

type EmbedAction = (previous: ActionState | null, formData: FormData) => Promise<ActionState>;

export function EmbedComposer({
  action,
  channels,
  defaultChannelId = '',
}: {
  action: EmbedAction;
  channels: ChannelOption[];
  defaultChannelId?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const [name, setName] = useState('Règlement');
  const [title, setTitle] = useState('Règlement du serveur');
  const [description, setDescription] = useState('Bienvenue ! Merci de lire ces règles avant de participer.');
  const [color, setColor] = useState('#C9B8FF');
  const [authorName, setAuthorName] = useState('Limerence');
  const [authorUrl, setAuthorUrl] = useState('');
  const [authorIconUrl, setAuthorIconUrl] = useState('');
  const [footer, setFooter] = useState('Merci de préserver une communauté bienveillante.');
  const [footerIconUrl, setFooterIconUrl] = useState('');
  const [url, setUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [channelId, setChannelId] = useState(defaultChannelId);
  const [fields, setFields] = useState<EmbedField[]>([]);

  const fieldsJson = useMemo(
    () => JSON.stringify(fields.filter((field) => field.name.trim() && field.value.trim())),
    [fields],
  );

  const addField = () => setFields((current) => [...current, { name: '', value: '', inline: false }]);
  const updateField = (index: number, patch: Partial<EmbedField>) =>
    setFields((current) => current.map((field, i) => i === index ? { ...field, ...patch } : field));
  const removeField = (index: number) => setFields((current) => current.filter((_, i) => i !== index));

  return (
    <form action={formAction} className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <input type="hidden" name="fieldsJson" value={fieldsJson} />
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Nom du modèle</span>
            <input className="field" name="name" value={name} maxLength={64} required onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block">
            <span className="label">Salon par défaut</span>
            <select className="field" name="channelId" value={channelId} onChange={(event) => setChannelId(event.target.value)}>
              <option value="">Aucun — garder en brouillon</option>
              {channels.filter((channel) => channel.type === 'text').map((channel) => (
                <option key={channel.id} value={channel.id}>
                  #{channel.name}{channel.parentName ? ` · ${channel.parentName}` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_100px]">
          <label className="block">
            <span className="label">Titre</span>
            <input className="field" name="title" value={title} maxLength={256} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="block">
            <span className="label">Couleur</span>
            <div className="flex h-10 items-center gap-2 rounded-xl border border-line bg-black/30 px-2">
              <input type="color" name="color" value={color} onChange={(event) => setColor(event.target.value.toUpperCase())} className="h-7 w-8 cursor-pointer border-0 bg-transparent p-0" />
              <span className="mono text-xs text-white/60">{color}</span>
            </div>
          </label>
        </div>

        <label className="block">
          <span className="label">Description</span>
          <textarea className="field min-h-32" name="description" value={description} maxLength={4096} onChange={(event) => setDescription(event.target.value)} placeholder="Règles, annonce, informations…" />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Auteur (optionnel)</span>
            <input className="field" name="authorName" value={authorName} maxLength={256} onChange={(event) => setAuthorName(event.target.value)} placeholder="Nom affiché" />
          </label>
          <label className="block">
            <span className="label">Lien du titre (optionnel)</span>
            <input className="field" name="url" value={url} maxLength={2048} type="url" onChange={(event) => setUrl(event.target.value)} placeholder="https://…" />
          </label>
          <label className="block">
            <span className="label">Lien de l’auteur (optionnel)</span>
            <input className="field" name="authorUrl" value={authorUrl} maxLength={2048} type="url" onChange={(event) => setAuthorUrl(event.target.value)} placeholder="https://…" />
          </label>
          <label className="block">
            <span className="label">Icône de l’auteur (URL)</span>
            <input className="field" name="authorIconUrl" value={authorIconUrl} maxLength={2048} type="url" onChange={(event) => setAuthorIconUrl(event.target.value)} placeholder="https://…" />
          </label>
          <label className="block">
            <span className="label">Pied de page</span>
            <input className="field" name="footer" value={footer} maxLength={2048} onChange={(event) => setFooter(event.target.value)} placeholder="Texte discret en bas" />
          </label>
          <label className="block">
            <span className="label">Icône du pied de page (URL)</span>
            <input className="field" name="footerIconUrl" value={footerIconUrl} maxLength={2048} type="url" onChange={(event) => setFooterIconUrl(event.target.value)} placeholder="https://…" />
          </label>
          <label className="block">
            <span className="label">Image large (URL)</span>
            <input className="field" name="imageUrl" value={imageUrl} maxLength={2048} type="url" onChange={(event) => setImageUrl(event.target.value)} placeholder="https://…" />
          </label>
          <label className="block">
            <span className="label">Miniature (URL)</span>
            <input className="field" name="thumbnailUrl" value={thumbnailUrl} maxLength={2048} type="url" onChange={(event) => setThumbnailUrl(event.target.value)} placeholder="https://…" />
          </label>
        </div>

        <section className="rounded-xl border border-line bg-white/[0.02] p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-white/85">Champs supplémentaires</h3>
              <p className="text-xs text-white/40">Jusqu’à 25 lignes, avec mise en page côte à côte.</p>
            </div>
            <button type="button" className="btn btn-ghost btn-xs" onClick={addField} disabled={fields.length >= 25}>＋ Ajouter</button>
          </div>
          {fields.length ? (
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={index} className="grid gap-2 rounded-lg border border-line/70 p-2 sm:grid-cols-[1fr_1.3fr_auto_auto] sm:items-end">
                  <label className="block">
                    <span className="label">Nom</span>
                    <input className="field" value={field.name} maxLength={256} onChange={(event) => updateField(index, { name: event.target.value })} />
                  </label>
                  <label className="block">
                    <span className="label">Valeur</span>
                    <input className="field" value={field.value} maxLength={1024} onChange={(event) => updateField(index, { value: event.target.value })} />
                  </label>
                  <label className="flex items-center gap-2 pb-2 text-xs text-white/60">
                    <input type="checkbox" checked={Boolean(field.inline)} onChange={(event) => updateField(index, { inline: event.target.checked })} className="h-4 w-4 accent-[#c9b8ff]" />
                    Côte à côte
                  </label>
                  <button type="button" className="btn btn-danger btn-xs" onClick={() => removeField(index)} aria-label="Retirer le champ">✕</button>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-white/35">Aucun champ ajouté.</p>}
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pendingLabel="Enregistrement…">💾 Enregistrer le modèle</SubmitButton>
          {state ? <span role="status" className={`text-sm ${state.ok ? 'text-mint' : 'text-rose-300'}`}>{state.message}</span> : null}
        </div>
      </div>

      <aside className="self-start rounded-2xl border border-line bg-[#2b2d31] p-4">
        <div className="mb-3 flex items-center justify-between text-xs text-white/40">
          <span>Aperçu Discord</span>
          {channelId ? <span>→ #{channels.find((channel) => channel.id === channelId)?.name ?? 'salon choisi'}</span> : <span>Brouillon</span>}
        </div>
        <div className="max-w-lg overflow-hidden rounded border-l-4 bg-[#313338] px-4 py-3 text-sm text-white/80" style={{ borderLeftColor: color }}>
          {authorName ? <div className="mb-2 text-xs font-medium text-white/65">{authorName}</div> : null}
          {title ? <div className="mb-1 font-semibold text-white">{title}</div> : null}
          {description ? <div className="whitespace-pre-wrap text-sm leading-relaxed text-white/75">{description}</div> : <div className="text-xs italic text-white/35">Description vide</div>}
          {fields.filter((field) => field.name || field.value).length ? (
            <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
              {fields.filter((field) => field.name || field.value).map((field, index) => (
                <div key={index}>
                  <div className="font-semibold text-white">{field.name || 'Nom du champ'}</div>
                  <div className="whitespace-pre-wrap text-xs text-white/60">{field.value || 'Valeur du champ'}</div>
                </div>
              ))}
            </div>
          ) : null}
          {footer ? <div className="mt-3 border-t border-white/10 pt-2 text-[11px] text-white/45">{footer}</div> : null}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-white/35">Les embeds respectent les limites de Discord. Les mentions sont désactivées à la publication, même si le texte contient @everyone.</p>
      </aside>
    </form>
  );
}
