<script lang="ts">
  import type { Item } from '$lib/types';
  import { ITEMS_PATH, dirOf, structuralType, isMagicItem, invalidateItemCache } from '$lib/itemLibrary';
  import { CATEGORY_LABELS, CATEGORY_TO_DIR, DAMAGE_TYPE_LABELS, PROPERTY_LABELS, PROPERTY_INDEX_BY_LABEL, MASTERY_INFO, masteryLabel, WEAPON_CATEGORY_LABELS, WEAPON_RANGE_LABELS, ARMOR_CATEGORY_LABELS, rarityColor } from '$lib/itemLabels';
  import { formatCost, formatRarity, formatDamageDice, ftToM } from '$lib/itemFormat';
  import { translateItem } from '$lib/services/aiActions/translateAction';
  import type { ItemTranslation } from '$lib/schemas/translation';
  import { convertDistances } from '$lib/utils/distanceText';
  import { normalizeItem } from '$lib/utils/schemaValidation';
  import { SOURCE_KEYS, SOURCE_LABELS, sourceLabel } from '$lib/schemas/source';
  import { prepareItemPrint } from '$lib/utils/printItem';
  import { createCardEditor } from '$lib/editor/cardEditor.svelte';
  import { slugKeepUmlauts } from '$lib/utils/text';
  import { activeFile, invalidateVault } from '$lib/stores/campaign';
  import EditorPanel from './EditorPanel.svelte';
  import AiEditModal from './AiEditModal.svelte';
  import { editItemAction } from '$lib/services/aiActions/itemAction';
  import TranslateModal from './TranslateModal.svelte';
  import Markdown from './Markdown.svelte';
  import MagicFacetFields from './item/MagicFacetFields.svelte';
  import WeaponFields from './item/WeaponFields.svelte';
  import ArmorFields from './item/ArmorFields.svelte';
  import CostWeightFields from './item/CostWeightFields.svelte';
  import Open5eImportPanel from './item/Open5eImportPanel.svelte';

  /** Aktueller Kategorie-Schlüssel (= Ordnername). Quelle: equipment_category (via dirOf). */
  const categoryKeyOf = dirOf;

  /** Kategorie-Schlüssel → DnD-API-konformer Anzeigename (z.B. "wondrous-items" → "Wondrous Items"). */
  function categoryApiName(catKey: string): string {
    return catKey.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  function setDraftCategory(catKey: string) {
    if (!ed.draft) return;
    ed.draft.equipment_category = { index: catKey, name: categoryApiName(catKey) };
  }

  // Text-Spiegel der Listen-/Objektfelder: im Formular Text, im Draft Struktur.
  let draftDescText   = $state('');
  let draftDescDeText = $state('');
  let draftPropsText  = $state('');
  let draftRarityName = $state('');

  /** Pure: liefert eine Kopie von `base` mit eingearbeiteten Text-Spiegeln (Beschreibung,
   *  Eigenschaften, Seltenheit) — ohne `base` zu verändern. Basis für Speichern & Dirty-Check. */
  function mergeDraftFields(base: Item): Item {
    const d = JSON.parse(JSON.stringify(base)) as Item;
    d.desc    = draftDescText.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
    d.desc_de = draftDescDeText ? draftDescDeText.split(/\n\n+/).map(s => s.trim()).filter(Boolean) : undefined;
    d.rarity  = draftRarityName ? { name: draftRarityName } : undefined;
    if (draftPropsText.trim()) {
      d.properties = draftPropsText.split(',').map(s => s.trim()).filter(Boolean)
        .map(label => {
          const index = PROPERTY_INDEX_BY_LABEL[label.toLowerCase()] ?? label.toLowerCase().replace(/\s+/g, '-');
          const name  = PROPERTY_LABELS[index] ?? label;  // englischer Name für JSON
          return { index, name };
        });
    } else {
      d.properties = undefined;
    }
    return d;
  }

  function merged(draft: Item, indent?: number): string {
    return JSON.stringify(mergeDraftFields($state.snapshot(draft) as Item), null, indent);
  }

  function parseItem(content: string): Item | null {
    try { return normalizeItem(JSON.parse(content)); } catch { return null; }
  }

  /** Ordnername eines Item-Pfads (…/items/<dir>/<datei>.json). */
  function dirOfPath(path: string): string {
    return path.split('/').at(-2) ?? '';
  }

  const ed = createCardEditor<Item>({
    type: 'item',
    label: 'Gegenstand',
    parse: parseItem,
    serialize: (d) => merged(d, 2),
    snapshot: (d) => merged(d),
    defaultName: (d) => slugKeepUmlauts(d.name_de || d.name || 'gegenstand'),
    location: {
      // Ablage nach Kategorie (Bucket). Kategoriewechsel im Editor verschiebt die Datei.
      bucketLabel: 'Kategorie',
      bucketOf: (d) => CATEGORY_TO_DIR[categoryKeyOf(d)],
      buckets: () => Object.entries(CATEGORY_LABELS)
        .map(([key, label]) => ({ value: CATEGORY_TO_DIR[key] ?? key, label })),
      resolvePath: (d, name, bucket) =>
        `${ITEMS_PATH}/${bucket ?? CATEGORY_TO_DIR[categoryKeyOf(d)] ?? 'other'}/${name}.json`,
    },
    onSaved: (path, { moved, oldPath }) => {
      invalidateItemCache(dirOfPath(oldPath ?? path));
      if (moved) invalidateItemCache(dirOfPath(path));
      invalidateVault();
    },
  });

  /** Spiegel neu aus dem Draft ziehen — die Baseline gilt erst danach. */
  function syncMirrors(item: Item | null) {
    mirrored = item;
    draftDescText   = (item?.desc    ?? []).join('\n\n');
    draftDescDeText = (item?.desc_de ?? []).join('\n\n');
    draftPropsText  = (item?.properties ?? []).map(p => PROPERTY_LABELS[p.index] ?? p.name).join(', ');
    draftRarityName = item?.rarity?.name ?? '';
    ed.captureBaseline();
  }

  // Der Editor ersetzt den Draft bei Laden, Verwerfen, JSON-Übernahme und Neuanlage;
  // die Spiegel gehören zum Inhalt und müssen jedes Mal mitziehen.
  let mirrored: Item | null = null;
  $effect(() => { if (ed.draft !== mirrored) syncMirrors(ed.draft); });

  // Die Karte zeigt den gespeicherten Stand; ein ungespeicherter Neuanlage-Draft hat keinen.
  const saved = $derived.by(() => {
    if (ed.isNew) return { item: ed.draft, parseError: null as string | null };
    if (!ed.lastSavedContent) return { item: null as Item | null, parseError: null };
    try {
      return { item: normalizeItem(JSON.parse(ed.lastSavedContent)), parseError: null };
    } catch (e) {
      return { item: null, parseError: e instanceof Error ? e.message : String(e) };
    }
  });
  const item = $derived(saved.item);
  const color = $derived(rarityColor(item?.rarity));

  /** Übernimmt einen Open5e-Import in den Draft (deutsche Beschreibung bleibt leer). */
  function applyImport(imported: Item) {
    if (!ed.draft) return;
    Object.assign(ed.draft, imported);
    draftDescText   = imported.desc.join('\n\n');
    draftDescDeText = '';
    draftPropsText  = (imported.properties ?? []).map((p) => PROPERTY_LABELS[p.index] ?? p.name).join(', ');
    draftRarityName = imported.rarity?.name ?? '';
  }

  /** Baut den Übersetzungslauf; null, wenn es nichts zu übersetzen gibt. */
  function buildTranslationRun() {
    if (!ed.draft) return null;
    const toTranslate: Record<string, unknown> = {};
    if (ed.draft.name) toTranslate.name = ed.draft.name;
    const desc = draftDescText.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
    if (desc.length) toTranslate.desc = desc;
    if (Object.keys(toTranslate).length === 0) return null;
    return translateItem(toTranslate);
  }

  /** Übernimmt die Übersetzung; leere Felder bedeuten „nicht übersetzt" und bleiben unangetastet. */
  function applyTranslation(t: ItemTranslation) {
    if (!ed.draft) return;
    if (t.name_de) ed.draft.name_de = convertDistances(t.name_de);
    if (t.desc_de.length) {
      const de = t.desc_de.map(convertDistances);
      ed.draft.desc_de = de;
      draftDescDeText = de.join('\n\n');
    }
  }

  let showAiModal = $state(false);
  let showTranslateModal = $state(false);

  /** Übernimmt das vom KI-Dialog überarbeitete Item in den Draft (überschreibt bestehende Werte). */
  function applyAiResult(result: Item) {
    if (!ed.draft) return;
    Object.assign(ed.draft, result);
    draftDescText   = (result.desc ?? []).join('\n\n');
    draftDescDeText = (result.desc_de ?? []).join('\n\n');
    draftPropsText  = (result.properties ?? []).map((p) => PROPERTY_LABELS[p.index] ?? p.name).join(', ');
    draftRarityName = result.rarity?.name ?? '';
  }

  /** Druckt den aktuellen Gegenstand als PDF (eine Karte, nur deutsche Beschreibung). */
  function printItem() {
    if (!item) return;
    const html = prepareItemPrint(item, document);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
      const prev = document.title;
      document.title = item!.name_de ?? item!.name;
      iframe.contentWindow!.focus();
      iframe.contentWindow!.print();
      document.title = prev;
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 0);
  }
</script>

<EditorPanel
  bind:tab={ed.tab}
  dirty={ed.dirty}
  saveError={ed.saveError}
  onsave={async () => { await ed.save(); if (!ed.dirty) ed.tab = 'karte'; }}
  ondiscard={() => { ed.discard(); ed.tab = 'karte'; }}
  onsavejson={async (json) => {
    if (ed.isNew) { ed.draft = normalizeItem(JSON.parse(json)); syncMirrors(ed.draft); await ed.saveAs(); return; }
    await ed.saveJson(json);
    syncMirrors(ed.draft);
  }}
  getJson={() => ed.draft ? merged(ed.draft, 2) : ed.lastSavedContent}
  style="--ep-accent: {color}"
>

{#snippet tabactions()}
  <button class="pdf-tab-btn" onclick={printItem} disabled={!item}>PDF</button>
{/snippet}

{#snippet karte()}
  {#if item}
    {@const stype = structuralType(item)}
    {@const cat = categoryKeyOf(item)}
    <!-- ── Anzeigemodus (Kartenstil, getönt nach Seltenheit) ── -->
    <div class="cards-wrap">
      <div class="item-card-view" style="--c: {color}">
        <div class="head">
          <div class="name">{item.name_de ?? item.name}</div>
          {#if item.name_de}<div class="name-en">{item.name}</div>{/if}
          <div class="meta">
            {#if item.rarity}{formatRarity(item.rarity)} · {/if}{CATEGORY_LABELS[cat] ?? item.equipment_category?.name ?? ''}
          </div>
          {#if stype === 'weapon' && (item.weapon_category || item.weapon_range)}
            <div class="subtype">
              {#if item.weapon_category}{WEAPON_CATEGORY_LABELS[item.weapon_category] ?? item.weapon_category}{/if}{#if item.weapon_category && item.weapon_range} · {/if}{#if item.weapon_range}{WEAPON_RANGE_LABELS[item.weapon_range] ?? item.weapon_range}{/if}
            </div>
          {:else if stype === 'armor' && item.armor_category}
            <div class="subtype">{ARMOR_CATEGORY_LABELS[item.armor_category] ?? item.armor_category}</div>
          {/if}
          {#if item.attunement}
            <div class="attune">Einstimmung erforderlich{item.attunement_by ? ` (${item.attunement_by})` : ''}</div>
          {/if}
        </div>

        <div class="orndiv"><div class="ol"></div><span class="og">◆</span><div class="ol"></div></div>

        <!-- Spielwerte je nach Typ -->
        {#if stype === 'weapon'}
          <div class="props">
            {#if item.damage}
              <div class="prop"><span class="plabel">Schaden</span>
                <span>{formatDamageDice(item.damage.damage_dice)} {DAMAGE_TYPE_LABELS[item.damage.damage_type.index] ?? item.damage.damage_type.name}{#if item.two_handed_damage} · {formatDamageDice(item.two_handed_damage.damage_dice)} (zweih.){/if}</span>
              </div>
            {/if}
            {#if item.range}
              <div class="prop"><span class="plabel">Reichweite</span><span>{ftToM(item.range.normal)}{item.range.long ? ` / ${ftToM(item.range.long)}` : ''}</span></div>
            {/if}
            {#if item.throw_range}
              <div class="prop"><span class="plabel">Wurfweite</span><span>{ftToM(item.throw_range.normal)} / {ftToM(item.throw_range.long)}</span></div>
            {/if}
            {#if item.magic_bonus}
              <div class="prop"><span class="plabel">Bonus</span><span>+{item.magic_bonus} auf Angriff &amp; Schaden</span></div>
            {/if}
            {#if item.properties?.length}
              <div class="prop"><span class="plabel">Eigensch.</span>
                <span class="pills">{#each item.properties as prop}<span class="pill">{PROPERTY_LABELS[prop.index] ?? prop.name}</span>{/each}</span>
              </div>
            {/if}
            <!-- Meisterschaft: bei Waffen IMMER eine Zeile — ohne Eintrag ein Hinweis
                 statt stiller Leere, damit die Pflege-Lücke sichtbar bleibt. -->
            <div class="prop"><span class="plabel">Meisterschaft</span>
              {#if item.mastery}
                <span class="pills"><span class="pill mastery-pill" title={MASTERY_INFO[item.mastery].descDe}>{masteryLabel(item.mastery)}</span></span>
              {:else}
                <span class="mastery-missing">— nicht gepflegt</span>
              {/if}
            </div>
          </div>
          <div class="orndiv"><div class="ol"></div><span class="og">◆</span><div class="ol"></div></div>

        {:else if stype === 'armor' && (item.armor_class || item.str_minimum || item.stealth_disadvantage)}
          <div class="props">
            {#if item.armor_class}
              <div class="prop"><span class="plabel">RK</span><span>{item.armor_class.base}{#if item.armor_class.dex_bonus} + GES-Mod{item.armor_class.max_bonus != null ? ` (max. ${item.armor_class.max_bonus})` : ''}{/if}</span></div>
            {/if}
            {#if item.str_minimum}
              <div class="prop"><span class="plabel">Stärke</span><span>mind. {item.str_minimum}</span></div>
            {/if}
            {#if item.stealth_disadvantage}
              <div class="prop"><span class="plabel">Heimlichkeit</span><span class="disadv">Nachteil</span></div>
            {/if}
          </div>
          <div class="orndiv"><div class="ol"></div><span class="og">◆</span><div class="ol"></div></div>
        {/if}

        <!-- Beschreibung -->
        {#if item.desc_de?.length}
          <div class="desc"><Markdown source={item.desc_de} /></div>
          {#if item.desc?.length}
            <details class="desc-orig">
              <summary>Original (Englisch)</summary>
              <div class="desc-orig-body"><Markdown source={item.desc} /></div>
            </details>
          {/if}
        {:else if item.desc?.length}
          <div class="desc"><Markdown source={item.desc} /></div>
        {:else}
          <div class="desc muted">—</div>
        {/if}

        <div class="foot">
          <span class="src">{sourceLabel(item.source)}</span>
          <span class="foot-right">
            {#if item.cost}{formatCost(item.cost)}{/if}{#if item.cost && item.weight != null} · {/if}{#if item.weight != null}{item.weight} Pfd.{/if}
          </span>
        </div>
      </div>
    </div>
  {:else if saved.parseError}
    <div class="error">
      <div class="error-title">Ungültiges JSON — Gegenstand kann nicht angezeigt werden</div>
      <pre class="error-detail">{saved.parseError}</pre>
    </div>
  {:else}
    <div class="error">Gegenstand konnte nicht geladen werden.</div>
  {/if}
{/snippet}

{#snippet bearbeiten()}
  {#if ed.draft}
    <!-- ── Bearbeitungsmodus ── -->
    <div class="item-card edit-mode" style="--cat-color: {rarityColor(draftRarityName)}">
      {#if ed.isNew}
        <div class="new-banner">Neuer Gegenstand — noch nicht gespeichert.</div>
      {/if}
      <div class="card-header">
        <div class="edit-header-top">
          <input class="edit-name" bind:value={ed.draft.name_de} placeholder="Name (Deutsch)" />
        </div>
        <input class="edit-name-original" bind:value={ed.draft.name} placeholder="Original (Englisch)" />
        <div class="edit-header-meta">
          <select class="edit-select"
            value={categoryKeyOf(ed.draft)}
            onchange={(e) => setDraftCategory((e.target as HTMLSelectElement).value)}>
            {#each Object.entries(CATEGORY_LABELS) as [key, label]}
              <option value={key}>{label}</option>
            {/each}
          </select>
          <select class="edit-select" bind:value={ed.draft.source}>
            {#each SOURCE_KEYS as key}
              <option value={key}>{SOURCE_LABELS[key]}</option>
            {/each}
          </select>
        </div>
      </div>

      <!-- Typ-spezifische Felder -->
      <div class="card-props">
        <!-- Magie-Facette (additiv, unabhängig vom Strukturtyp): auch eine magische Waffe zeigt das -->
        {#if isMagicItem(ed.draft)}
          <MagicFacetFields bind:draft={ed.draft} bind:rarityName={draftRarityName} />
        {/if}

        <!-- Statwerte-Block nach Strukturtyp (= Kategorie): eine magische Waffe bekommt hier ihre Waffenfelder -->
        {#if structuralType(ed.draft) === 'weapon'}
          <WeaponFields bind:draft={ed.draft} bind:propsText={draftPropsText} />
        {:else if structuralType(ed.draft) === 'armor'}
          <ArmorFields bind:draft={ed.draft} />
        {/if}

        <CostWeightFields bind:draft={ed.draft} />
      </div>

      <div class="card-divider"></div>

      <!-- Beschreibung (Deutsch) — primär -->
      <div class="edit-section">
        <span class="edit-section-label">Beschreibung (Deutsch)</span>
        <textarea class="edit-textarea" bind:value={draftDescDeText} rows={6}
          placeholder="Deutsche Beschreibung…"></textarea>
      </div>

      <div class="card-divider"></div>

      <!-- Beschreibung (Original) — sekundär, einklappbar -->
      <details class="edit-section edit-section-collapsible">
        <summary class="edit-section-label">Beschreibung (Original / Englisch)</summary>
        <textarea class="edit-textarea edit-textarea-secondary" bind:value={draftDescText} rows={5}
          style="margin-top: 0.4rem;"></textarea>
      </details>

      <div class="card-divider"></div>

      <!-- KI-Werkzeuge -->
      <div class="edit-section ai-section">
        <span class="ai-label">KI-Werkzeuge</span>
        <div class="ai-tools-row">
          <button class="ai-btn" onclick={() => (showTranslateModal = true)}>🌐 Übersetzen…</button>
          <button class="ai-btn" onclick={() => (showAiModal = true)}>✨ KI überarbeiten…</button>
        </div>
      </div>

      <div class="card-divider"></div>

      {#key $activeFile?.path}
        <Open5eImportPanel onimport={applyImport} />
      {/key}
    </div>

  {:else}
    <div class="error">Kein Gegenstand geladen.</div>
  {/if}
{/snippet}

</EditorPanel>

{#if showAiModal && ed.draft}
  <AiEditModal
    entityName={ed.draft.name_de || ed.draft.name || 'Gegenstand'}
    buildAction={() => editItemAction($state.snapshot(ed.draft) as Item)}
    onresult={applyAiResult}
    onclose={() => (showAiModal = false)}
  />
{/if}

{#if showTranslateModal && ed.draft}
  <TranslateModal
    entityName={ed.draft.name_de || ed.draft.name || 'Gegenstand'}
    build={buildTranslationRun}
    onresult={applyTranslation}
    onclose={() => (showTranslateModal = false)}
  />
{/if}

<style>

  /* ── Anzeige-Karte (Druckstil, getönt nach Seltenheit per --c) ── */
  .cards-wrap { display: flex; flex-direction: column; align-items: center; width: 100%; }

  .item-card-view {
    width: 100%;
    max-width: 420px;
    background: var(--bg);
    border: 1.5px solid var(--c);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 3px 16px rgba(0,0,0,0.23);
    display: flex;
    flex-direction: column;
    color: var(--ink);
    font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
    position: relative;
    height: fit-content;
  }
  .item-card-view::after {
    content: '';
    position: absolute;
    inset: 3px;
    border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
    border-radius: 5px;
    pointer-events: none;
  }

  .item-card-view .head {
    padding: 0.9rem 1.2rem 0.65rem;
    text-align: center;
    background: linear-gradient(to bottom,
      color-mix(in srgb, var(--c) 50%, var(--bg)) 0%,
      color-mix(in srgb, var(--c) 9%, var(--bg)) 100%);
  }
  .item-card-view .name {
    font-size: 1.15rem;
    font-weight: 700;
    font-variant: small-caps;
    color: var(--ink);
    line-height: 1.2;
    letter-spacing: 0.02em;
  }
  .item-card-view .name-en {
    font-size: 0.78rem;
    font-style: italic;
    color: var(--ink-soft);
    margin-top: 0.1rem;
  }
  .item-card-view .meta {
    font-size: 0.78rem;
    color: color-mix(in srgb, var(--c) 75%, var(--ink));
    margin-top: 0.25rem;
    font-style: italic;
  }
  .item-card-view .subtype {
    font-size: 0.72rem;
    color: var(--ink-muted);
    margin-top: 0.1rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .item-card-view .attune {
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--c);
    margin-top: 0.3rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .item-card-view .orndiv {
    display: flex; align-items: center; gap: 4px; margin: 0.5rem 10px 0; flex-shrink: 0;
  }
  .item-card-view .ol {
    flex: 1; height: 1px;
    background: linear-gradient(to right, transparent, var(--c) 30%, var(--c) 70%, transparent);
  }
  .item-card-view .og { font-size: 0.6rem; color: var(--c); line-height: 1; }

  .item-card-view .props {
    padding: 0.55rem 1.2rem 0.2rem;
    display: flex; flex-direction: column; gap: 0.3rem;
    font-size: 0.84rem; line-height: 1.4;
  }
  .item-card-view .prop {
    display: grid; grid-template-columns: 6rem 1fr; gap: 0.5rem; align-items: baseline;
  }
  .item-card-view .plabel {
    color: var(--ink-muted); font-size: 0.72rem; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .item-card-view .pills { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .item-card-view .pill {
    background: color-mix(in srgb, var(--c) 12%, var(--bg));
    border: 1px solid color-mix(in srgb, var(--c) 35%, transparent);
    border-radius: 99px; font-size: 0.7rem; padding: 0.05rem 0.5rem; color: var(--ink-soft);
  }
  .item-card-view .disadv { color: var(--danger); }
  /* Meisterschaft hebt sich von den Eigenschaften-Pillen ab (Regeltext im title). */
  .item-card-view .mastery-pill {
    border-color: color-mix(in srgb, var(--c) 60%, transparent);
    color: var(--ink); font-weight: 600; cursor: help;
  }
  .item-card-view .mastery-missing { color: var(--border); font-size: 0.78rem; font-style: italic; }

  .item-card-view .desc {
    padding: 0.55rem 1.2rem;
    font-size: 0.84rem; line-height: 1.6; color: var(--ink);
  }
  .item-card-view .desc.muted { color: var(--border); }
  .item-card-view .desc-orig { padding: 0 1.2rem 0.5rem; }
  .item-card-view .desc-orig summary {
    font-size: 0.72rem; color: var(--ink-muted); cursor: pointer; user-select: none;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .item-card-view .desc-orig-body {
    margin-top: 0.4rem; font-size: 0.8rem; color: var(--ink-muted); line-height: 1.55;
    font-style: italic;
  }

  .item-card-view .foot {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.45rem 1.2rem; margin-top: auto;
    border-top: 1px solid color-mix(in srgb, var(--c) 40%, transparent);
    background: color-mix(in srgb, var(--c) 6%, var(--bg));
    font-size: 0.72rem; color: var(--ink-muted); font-style: italic;
  }
  .item-card-view .src { text-transform: uppercase; letter-spacing: 0.05em; }

  .pdf-tab-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0.15rem 0.55rem;
    border-radius: 4px;
    font-family: inherit;
  }
  .pdf-tab-btn:hover:not(:disabled) { color: var(--ink); border-color: var(--ink-muted); }
  .pdf-tab-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .item-card {
    width: 100%;
    max-width: 580px;
    background: var(--bg-panel);
    border-radius: 10px;
    border: 1px solid var(--surface);
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0,0,0,0.33);
    height: fit-content;
  }

  /* Header */
  .card-header {
    background: color-mix(in srgb, var(--cat-color) 18%, var(--bg-panel));
    border-bottom: 3px solid var(--cat-color);
    padding: 1.2rem 1.4rem 1rem;
  }

  /* Props (Bearbeiten-Modus) */
  .card-props { padding: 0.9rem 1.4rem; display: flex; flex-direction: column; gap: 0.45rem; }

  /*
   * Feldraster und Feld-Grundformen gelten für die Unterformulare mit — sie sind
   * Teile DIESER Karte, keine eigenständigen Bausteine. Eine Kopie je Unterformular
   * wäre dieselbe Regel fünfmal.
   */
  .item-card :global(.prop-row) {
    display: grid;
    grid-template-columns: 7.5rem 1fr;
    gap: 0.5rem;
    font-size: 0.88rem;
    line-height: 1.4;
    align-items: center;
  }

  .item-card :global(.prop-label) {
    color: var(--ink-muted);
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .item-card :global(.edit-select) {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink); font-size: 0.82rem; padding: 0.2rem 0.4rem;
    outline: none; font-family: inherit;
  }
  .item-card :global(.edit-select:focus) { border-color: var(--cat-color); }

  .item-card :global(.edit-input) {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink); font-size: 0.85rem; padding: 0.2rem 0.5rem;
    outline: none; font-family: inherit; width: 100%;
  }
  .item-card :global(.edit-input:focus) { border-color: var(--cat-color); }

  .item-card :global(.edit-check) {
    display: flex; align-items: center; gap: 0.4rem;
    font-size: 0.85rem; color: var(--ink-soft); cursor: pointer;
  }

  .item-card :global(.edit-section) {
    padding: 0.7rem 1.4rem; display: flex; flex-direction: column; gap: 0.4rem;
  }

  .card-divider { height: 1px; background: var(--surface); margin: 0 1.4rem; }

  /* Edit mode */
  .edit-header-top {
    display: flex; align-items: center; justify-content: space-between;
    gap: 0.5rem; margin-bottom: 0.6rem;
  }

  .edit-name {
    font-size: 1.3rem; font-weight: 700;
    background: var(--surface); border: 1px solid var(--border); border-radius: 5px;
    color: var(--ink); padding: 0.3rem 0.6rem; flex: 1; min-width: 0;
    font-family: inherit; outline: none;
  }
  .edit-name:focus { border-color: var(--cat-color); }

  .edit-name-original {
    font-size: 0.85rem;
    background: transparent; border: none; border-bottom: 1px solid var(--surface);
    color: var(--ink-muted); padding: 0.2rem 0.6rem; width: 100%;
    font-family: inherit; outline: none; font-style: italic;
    margin-bottom: 0.4rem;
  }
  .edit-name-original:focus { border-bottom-color: var(--border); color: var(--ink-soft); }

  .edit-header-meta { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }

  .edit-section-collapsible { cursor: default; }
  .edit-section-collapsible summary { cursor: pointer; user-select: none; list-style: none; }
  .edit-section-collapsible summary::before { content: '› '; color: var(--border); }
  .edit-section-collapsible[open] summary::before { content: '▾ '; }

  .edit-section-label {
    font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--ink-muted);
  }

  .edit-textarea {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink); font-size: 0.85rem; padding: 0.4rem 0.6rem;
    resize: vertical; outline: none; font-family: inherit; line-height: 1.6; width: 100%;
  }
  .edit-textarea:focus { border-color: var(--cat-color); }
  .edit-textarea-secondary { color: var(--ink-muted); font-style: italic; }

  .new-banner {
    font-size: 0.78rem; color: var(--gold, #c89b3c);
    background: color-mix(in srgb, var(--gold, #c89b3c) 12%, var(--bg-panel));
    border-radius: 4px; padding: 0.3rem 0.5rem; margin-bottom: 0.5rem;
  }

  /* KI-Ausfüllen */
  .ai-section {
    background: color-mix(in srgb, var(--arcane) 6%, var(--bg-panel));
    border-top: 1px solid var(--surface);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .ai-tools-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .ai-label {
    font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--ink-muted);
  }
  .ai-btn {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink-soft); font-size: 0.82rem; padding: 0.2rem 0.7rem; cursor: pointer;
    font-family: inherit; white-space: nowrap;
  }
  .ai-btn:hover:not(:disabled) { color: var(--arcane); border-color: var(--arcane); }
  .ai-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .error { color: var(--danger); padding: 2rem; font-size: 0.9rem; }
  .error-title { font-weight: 600; margin-bottom: 0.6rem; }
  .error-detail {
    font-family: monospace; font-size: 0.8rem; color: var(--copper);
    background: var(--bg-panel); border: 1px solid var(--surface); border-radius: 4px;
    padding: 0.6rem 0.8rem; white-space: pre-wrap; word-break: break-all; margin: 0;
  }
</style>
