<script lang="ts">
  import { activeFile, setFileContent, newItemDraft, invalidateVault } from '$lib/stores/campaign';
  import { invoke } from '@tauri-apps/api/core';
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import { pushError } from '$lib/stores/errors';
  import type { Item } from '$lib/types';
  import {
    CATEGORY_COLORS,
    CATEGORY_LABELS,
    CATEGORY_TO_DIR,
    RARITY_LABELS,
    DAMAGE_TYPE_LABELS,
    PROPERTY_LABELS,
    PROPERTY_INDEX_BY_LABEL,
    COST_UNIT_LABELS,
    WEAPON_CATEGORY_LABELS,
    WEAPON_RANGE_LABELS,
    ARMOR_CATEGORY_LABELS,
    ITEM_TYPE_LABELS,
    API_CATEGORY_MAP,
    ITEMS_PATH,
    invalidateItemCache,
    formatCost,
    formatRarity,
    formatDamageDice,
    ftToM,
    ftToMVal,
    mToFt,
  } from '$lib/itemLibrary';
  import { TRANSLATION_SYSTEM_PROMPT } from '$lib/prompts';
  import { normalizeItem } from '$lib/utils/schemaValidation';
  import DndApiSearch from './DndApiSearch.svelte';
  import LlmTranslate from './LlmTranslate.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import { DND_API, apiGet, getResource } from '$lib/services/dndApi';
  import ItemEditModal from './ItemEditModal.svelte';

  // ── Konstanten ───────────────────────────────────────────────────────────────

  const RARITY_OPTIONS = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'];
  const COST_UNITS = ['gp', 'sp', 'cp', 'ep', 'pp'];
  const ARMOR_CATEGORIES = ['Light', 'Medium', 'Heavy', 'Shield'];

  /** Aktueller Kategorie-Schlüssel (= Ordnername). */
  function categoryKeyOf(item: Item): string {
    const idx = item.equipment_category?.index;
    if (idx) return API_CATEGORY_MAP[idx] ?? 'other';
    if (item.item_type === 'weapon') return 'weapon';
    if (item.item_type === 'armor')  return 'armor';
    if (item.item_type === 'magic')  return 'wondrous-items';
    return 'other';
  }

  /** Kategorie → item_type (steuert die Formularfelder). */
  function categoryToItemType(catKey: string): 'weapon' | 'armor' | 'magic' | 'gear' {
    if (catKey === 'weapon' || catKey === 'ammunition') return 'weapon';
    if (catKey === 'armor') return 'armor';
    if (['ring', 'rod', 'staff', 'wand', 'scroll', 'potion', 'wondrous-items'].includes(catKey)) return 'magic';
    return 'gear';
  }

  /** Kategorie-Schlüssel → DnD-API-konformer Anzeigename (z.B. "wondrous-items" → "Wondrous Items"). */
  function categoryApiName(catKey: string): string {
    return catKey.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  function setDraftCategory(catKey: string) {
    if (!draft) return;
    draft.equipment_category = { index: catKey, name: categoryApiName(catKey) };
    draft.item_type = categoryToItemType(catKey);
  }

  // Farbe aus equipment_category oder item_type ableiten
  function categoryColor(item: Item): string {
    return CATEGORY_COLORS[categoryKeyOf(item)] ?? 'var(--arcane)';
  }

  // ── State ────────────────────────────────────────────────────────────────────

  let rawJson = $state('');

  // Noch nicht gespeicherter Entwurf (KI- oder manuelle Anlage). Ist er gesetzt,
  // startet die Card direkt im Bearbeiten-Modus; gespeichert wird erst per "Speichern".
  let newDraft = $state<{ item: Item; dir: string } | null>(null);

  function slugify(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-äöüß]/g, '');
  }

  onMount(() => {
    async function load(path: string) {
      try {
        const content = await invoke<string>('read_file_content', { path });
        rawJson = content;
        setFileContent(content);
      } catch (e) {
        pushError(`Gegenstand konnte nicht geladen werden: ${e instanceof Error ? e.message : e}`);
        rawJson = '{}';
      }
    }

    const initial = get(activeFile);
    if (initial?.type === 'item' && initial.path) load(initial.path);

    const unsubFile = activeFile.subscribe((file) => {
      if (file?.type === 'item' && file.path) load(file.path);
    });

    // Entwurf: rohes JSON setzen und direkt in den Bearbeiten-Modus wechseln.
    const unsubDraft = newItemDraft.subscribe((d) => {
      newDraft = d;
      if (d) {
        rawJson = JSON.stringify(d.item, null, 2);
        setFileContent(rawJson);
        editing = false;       // erzwingt frisches startEdit über den $effect
        draft = null;
        tab = 'bearbeiten';
      }
    });

    return () => { unsubFile(); unsubDraft(); };
  });

  let parsed = $derived.by(() => {
    if (!rawJson) return { item: null as Item | null, parseError: null as string | null };
    try {
      return { item: normalizeItem(JSON.parse(rawJson)), parseError: null };
    } catch (e) {
      return { item: null, parseError: e instanceof Error ? e.message : String(e) };
    }
  });
  let item = $derived(parsed.item);
  let parseError = $derived(parsed.parseError);
  let color = $derived(item ? categoryColor(item) : 'var(--arcane)');

  // ── Bearbeiten ───────────────────────────────────────────────────────────────

  type Tab = 'karte' | 'bearbeiten' | 'json';
  let tab     = $state<Tab>('karte');
  let editing = $state(false);
  let draft   = $state<Item | null>(null);
  let dirty   = $derived(editing && draft !== null);

  // Beim Wechsel auf Bearbeiten-Tab Draft initialisieren
  $effect(() => {
    if (tab === 'bearbeiten' && !editing && item) startEdit();
  });
  let draftDescText  = $state('');
  let draftDescDeText = $state('');
  let draftPropsText = $state('');
  let draftRarityName = $state('');

  function startEdit() {
    if (!item) return;
    draft = JSON.parse(JSON.stringify(item));
    draftDescText   = (item.desc    ?? []).join('\n\n');
    draftDescDeText = (item.desc_de ?? []).join('\n\n');
    draftPropsText  = (item.properties ?? []).map(p => PROPERTY_LABELS[p.index] ?? p.name).join(', ');
    draftRarityName = item.rarity?.name ?? '';
    editing = true;
  }

  // Speichern-unter-State für noch nicht gespeicherte Entwürfe.
  let showSaveAs = $state(false);
  let newFilename = $state('');

  function discard() {
    if (newDraft) {
      // Ungespeicherten Entwurf verwerfen → Card schließen.
      newItemDraft.set(null);
      activeFile.set(null);
    }
    editing = false;
    draft = null;
    apiRawResponse = null;
    importError = '';
    showSaveAs = false;
    tab = 'karte';
  }

  /** Schreibt JSON; verschiebt die Datei in den Kategorie-Ordner, falls sich die Kategorie geändert hat. */
  async function persistItem(json: string, newCatKey: string): Promise<boolean> {
    const file = $activeFile;
    if (!file?.path) return false;

    const oldPath = file.path;
    const filename = oldPath.split('/').pop() ?? '';
    const oldDir = oldPath.split('/').at(-2) ?? '';
    const newDir = CATEGORY_TO_DIR[newCatKey] ?? oldDir;
    const moveNeeded = !!newDir && newDir !== oldDir;
    const newPath = moveNeeded ? `${ITEMS_PATH}/${newDir}/${filename}` : oldPath;

    try {
      if (moveNeeded) {
        await invoke('rename_file', { oldPath, newPath });
      }
      await invoke('write_file_content', { path: newPath, content: json });

      if (oldDir) invalidateItemCache(oldDir);
      if (moveNeeded) {
        invalidateItemCache(newDir);
        activeFile.set({ ...file, path: newPath });
      }
      rawJson = json;
      setFileContent(json);
      return true;
    } catch (e) {
      pushError(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  }

  /** Überträgt die Text-Spiegel (Beschreibung, Eigenschaften, Seltenheit) in den Draft. */
  function applyDraftFields() {
    if (!draft) return;
    draft.desc    = draftDescText.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
    draft.desc_de = draftDescDeText ? draftDescDeText.split(/\n\n+/).map(s => s.trim()).filter(Boolean) : undefined;
    draft.rarity  = draftRarityName ? { name: draftRarityName } : undefined;
    if (draftPropsText.trim()) {
      draft.properties = draftPropsText.split(',').map(s => s.trim()).filter(Boolean)
        .map(label => {
          const index = PROPERTY_INDEX_BY_LABEL[label.toLowerCase()] ?? label.toLowerCase().replace(/\s+/g, '-');
          const name  = PROPERTY_LABELS[index] ?? label;  // englischer Name für JSON
          return { index, name };
        });
    } else {
      draft.properties = undefined;
    }
  }

  async function save() {
    if (!draft) return;
    applyDraftFields();
    if (newDraft) {
      // Neuer Entwurf: Dateiname abfragen (vorausgefüllt), noch nicht schreiben.
      newFilename = slugify(draft.name_de || draft.name || 'gegenstand');
      showSaveAs = true;
      return;
    }
    if (!$activeFile) return;
    const json = JSON.stringify($state.snapshot(draft), null, 2);
    if (await persistItem(json, categoryKeyOf(draft))) {
      editing = false;
      draft = null;
      apiRawResponse = null;
      importError = '';
      tab = 'karte';
    }
  }

  /** Legt die Datei für einen neuen Entwurf unter dem gewählten Namen an. */
  async function confirmSaveAs() {
    if (!draft || !newDraft) return;
    const name = slugify(newFilename || draft.name_de || draft.name || 'gegenstand');
    if (!name) return;
    const dir = categoryKeyOf(draft);   // folgt der (ggf. geänderten) Kategorie im Editor
    const filename = `${name}.json`;
    const path = `${ITEMS_PATH}/${dir}/${filename}`;
    const json = JSON.stringify($state.snapshot(draft), null, 2);
    try {
      await invoke('write_file_content', { path, content: json });
    } catch (e) {
      pushError(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
      return;
    }
    invalidateItemCache(dir);
    invalidateVault();
    newItemDraft.set(null);   // löscht den Entwurf → Subscription setzt newDraft = null
    showSaveAs = false;
    editing = false;
    draft = null;
    apiRawResponse = null;
    importError = '';
    rawJson = json;
    setFileContent(json);
    tab = 'karte';
    activeFile.set({ name: filename, path, type: 'item' });  // ab jetzt echte Datei
  }

  async function saveJson(json: string) {
    if (newDraft) {
      // JSON-Tab bei neuem Entwurf: als Draft übernehmen, dann Dateiname abfragen.
      const parsedItem = JSON.parse(json) as Item;
      draft = parsedItem;
      draftDescText   = (parsedItem.desc    ?? []).join('\n\n');
      draftDescDeText = (parsedItem.desc_de ?? []).join('\n\n');
      draftPropsText  = (parsedItem.properties ?? []).map(p => PROPERTY_LABELS[p.index] ?? p.name).join(', ');
      draftRarityName = parsedItem.rarity?.name ?? '';
      newFilename = slugify(parsedItem.name_de || parsedItem.name || 'gegenstand');
      showSaveAs = true;
      tab = 'bearbeiten';
      return;
    }
    let catKey = '';
    try {
      catKey = categoryKeyOf(JSON.parse(json) as Item);
    } catch { /* leave folder unchanged */ }
    if (await persistItem(json, catKey)) {
      editing = false;
      draft = null;
    }
  }

  // ── DnD-API-Import ───────────────────────────────────────────────────────────

  interface ApiResult {
    index: string;
    name: string;
    url: string;
    source: 'magic' | 'equipment';
  }

  let apiRawResponse = $state<string | null>(null);
  let showApiRaw = $state(false);
  let importError = $state('');

  async function searchItems(q: string): Promise<(ApiResult & { tag: string })[]> {
    const [magicRaw, equipRaw] = await Promise.all([
      apiGet(`${DND_API}/magic-items?name=${encodeURIComponent(q)}`),
      apiGet(`${DND_API}/equipment?name=${encodeURIComponent(q)}`),
    ]);
    const magic = ((magicRaw as Record<string, unknown>).results as ApiResult[] ?? [])
      .map((r) => ({ ...r, source: 'magic' as const, tag: 'magisch' }));
    const equip = ((equipRaw as Record<string, unknown>).results as ApiResult[] ?? [])
      .map((r) => ({ ...r, source: 'equipment' as const, tag: 'ausrüstung' }));
    return [...magic, ...equip].slice(0, 15);
  }

  async function importFromApi(result: ApiResult) {
    if (!draft) return;
    try {
      const data = await getResource(result.url);
      apiRawResponse = JSON.stringify(data, null, 2);
      showApiRaw = false;

      let descArr = (data.desc as string[]) ?? [];
      let attunement = false;
      let attunement_by: string | null = null;

      if (result.source === 'magic') {
        const firstLine = descArr[0] ?? '';
        if (firstLine.toLowerCase().includes('requires attunement')) {
          attunement = true;
          const match = firstLine.match(/requires attunement(?: by ([^)]+))?/i);
          attunement_by = match?.[1]?.trim() ?? null;
          descArr = descArr.length > 1 ? descArr.slice(1) : descArr;
        }
      }

      // item_type aus API-Quelle + Felder ableiten
      let item_type: Item['item_type'];
      if (result.source === 'magic') {
        item_type = 'magic';
      } else if (data.weapon_category) {
        item_type = 'weapon';
      } else if (data.armor_category || data.armor_class) {
        item_type = 'armor';
      } else {
        item_type = 'gear';
      }

      Object.assign(draft, {
        index:                data.index,
        name:                 data.name,
        name_de:              undefined,
        item_type,
        equipment_category:   data.equipment_category,
        rarity:               data.rarity,
        attunement,
        attunement_by,
        variant:              data.variant,
        variants:             data.variants,
        weapon_category:      data.weapon_category,
        weapon_range:         data.weapon_range,
        damage:               data.damage,
        two_handed_damage:    data.two_handed_damage,
        range:                data.range,
        throw_range:          data.throw_range,
        properties:           data.properties,
        armor_category:       data.armor_category,
        armor_class:          data.armor_class,
        str_minimum:          data.str_minimum,
        stealth_disadvantage: data.stealth_disadvantage,
        desc:                 descArr,
        desc_de:              undefined,
        cost:                 data.cost,
        weight:               data.weight,
        source:               'SRD',
        url:                  data.url,
      });

      draftDescText   = descArr.join('\n\n');
      draftDescDeText = '';
      draftPropsText  = ((data.properties as Array<{index: string; name: string}> | undefined) ?? [])
        .map(p => PROPERTY_LABELS[p.index] ?? p.name).join(', ');
      draftRarityName = (data.rarity as {name: string} | undefined)?.name ?? '';

      importError = '';
    } catch (e) {
      importError = `Import fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // ── LLM-Übersetzung ──────────────────────────────────────────────────────────

  function buildTranslationPrompt(): string | null {
    if (!draft) return null;
    const toTranslate: Record<string, unknown> = {};
    if (draft.name) toTranslate.name = draft.name;
    const desc = draftDescText.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
    if (desc.length) toTranslate.desc = desc;
    if (Object.keys(toTranslate).length === 0) return null;
    return `Translate these D&D item fields:\n\n${JSON.stringify(toTranslate, null, 2)}`;
  }

  function applyTranslation(raw: string) {
    if (!draft) return;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Keine gültige JSON-Antwort vom LLM');
    const translated = JSON.parse(match[0]) as Record<string, unknown>;
    if (translated.name_de) draft.name_de = translated.name_de as string;
    if (Array.isArray(translated.desc_de)) {
      draft.desc_de = translated.desc_de as string[];
      draftDescDeText = (translated.desc_de as string[]).join('\n\n');
    }
  }

  // ── KI-Überarbeitung (Dialog) ────────────────────────────────────────────────

  let showAiModal = $state(false);

  /** Übernimmt das vom KI-Dialog überarbeitete Item in den Draft (überschreibt bestehende Werte). */
  function applyAiResult(result: Item) {
    if (!draft) return;
    Object.assign(draft, result);
    draftDescText   = (result.desc ?? []).join('\n\n');
    draftDescDeText = (result.desc_de ?? []).join('\n\n');
    draftPropsText  = (result.properties ?? []).map((p) => PROPERTY_LABELS[p.index] ?? p.name).join(', ');
    draftRarityName = result.rarity?.name ?? '';
  }
</script>

<EditorPanel
  bind:tab
  {dirty}
  onsave={save}
  ondiscard={discard}
  onsavejson={saveJson}
  getJson={() => draft ? JSON.stringify($state.snapshot(draft), null, 2) : rawJson}
  style="--ep-accent: {color}"
>

{#snippet karte()}
  {#if item}
    <!-- ── Anzeigemodus ── -->
    <div class="item-card" style="--cat-color: {color}">
      <div class="card-header">
        <div class="header-top">
          <div class="header-name">{item.name_de ?? item.name}</div>
        </div>
        {#if item.name_de}
          <div class="header-original">{item.name}</div>
        {/if}
        <div class="header-sub">
          <!-- Magisch: Seltenheit -->
          {#if item.rarity}
            <span class="header-rarity">{formatRarity(item.rarity)}</span>
          {/if}
          <!-- Waffe: Kategorie + Reichweite -->
          {#if item.item_type === 'weapon' && (item.weapon_category || item.weapon_range)}
            <span class="header-weapon">
              {#if item.weapon_category}{WEAPON_CATEGORY_LABELS[item.weapon_category] ?? item.weapon_category}{/if}
              {#if item.weapon_category && item.weapon_range} · {/if}
              {#if item.weapon_range}{WEAPON_RANGE_LABELS[item.weapon_range] ?? item.weapon_range}{/if}
            </span>
          {/if}
          <!-- Rüstung: Kategorie -->
          {#if item.item_type === 'armor' && item.armor_category}
            <span class="header-armor">{ARMOR_CATEGORY_LABELS[item.armor_category] ?? item.armor_category}</span>
          {/if}
          <!-- Übergeordnete Kategorie -->
          {#if item.equipment_category}
            <span class="header-cat">
              {CATEGORY_LABELS[API_CATEGORY_MAP[item.equipment_category.index] ?? ''] ?? item.equipment_category.name}
            </span>
          {/if}
          <!-- Einstimmung -->
          {#if item.attunement}
            <span class="attunement-badge">Einstimmung{item.attunement_by ? ` (${item.attunement_by})` : ''}</span>
          {/if}
        </div>
      </div>

      <!-- Eigenschaften je nach Typ -->
      {#if item.item_type === 'weapon'}
        {#if item.damage || item.range || item.properties?.length || item.cost || item.weight != null}
          <div class="card-props">
            {#if item.damage}
              <div class="prop-row">
                <span class="prop-label">Schaden</span>
                <span class="prop-value damage-value">
                  <span>{formatDamageDice(item.damage.damage_dice)} {DAMAGE_TYPE_LABELS[item.damage.damage_type.index] ?? item.damage.damage_type.name}</span>
                  {#if item.two_handed_damage}
                    <span class="prop-secondary">{formatDamageDice(item.two_handed_damage.damage_dice)} (zweihändig)</span>
                  {/if}
                </span>
              </div>
            {/if}
            {#if item.range}
              <div class="prop-row">
                <span class="prop-label">Reichweite</span>
                <span class="prop-value">{ftToM(item.range.normal)}{item.range.long ? ` / ${ftToM(item.range.long)}` : ''}</span>
              </div>
            {/if}
            {#if item.throw_range}
              <div class="prop-row">
                <span class="prop-label">Wurfweite</span>
                <span class="prop-value">{ftToM(item.throw_range.normal)} / {ftToM(item.throw_range.long)}</span>
              </div>
            {/if}
            {#if item.properties?.length}
              <div class="prop-row">
                <span class="prop-label">Eigenschaften</span>
                <span class="prop-value prop-pills">
                  {#each item.properties as prop}
                    <span class="prop-pill">{PROPERTY_LABELS[prop.index] ?? prop.name}</span>
                  {/each}
                </span>
              </div>
            {/if}
            {#if item.magic_bonus}
              <div class="prop-row">
                <span class="prop-label">Magischer Bonus</span>
                <span class="prop-value">+{item.magic_bonus} auf Angriff &amp; Schaden</span>
              </div>
            {/if}
            {#if item.cost}
              <div class="prop-row"><span class="prop-label">Kosten</span><span class="prop-value">{formatCost(item.cost)}</span></div>
            {/if}
            {#if item.weight != null}
              <div class="prop-row"><span class="prop-label">Gewicht</span><span class="prop-value">{item.weight} Pfd.</span></div>
            {/if}
          </div>
          <div class="card-divider"></div>
        {/if}

      {:else if item.item_type === 'armor'}
        {#if item.armor_class || item.str_minimum || item.stealth_disadvantage != null || item.cost || item.weight != null}
          <div class="card-props">
            {#if item.armor_class}
              <div class="prop-row">
                <span class="prop-label">RK</span>
                <span class="prop-value">
                  {item.armor_class.base}
                  {#if item.armor_class.dex_bonus}
                    + GES-Mod{item.armor_class.max_bonus != null ? ` (max. ${item.armor_class.max_bonus})` : ''}
                  {/if}
                </span>
              </div>
            {/if}
            {#if item.str_minimum}
              <div class="prop-row">
                <span class="prop-label">Stärke</span>
                <span class="prop-value">mind. {item.str_minimum}</span>
              </div>
            {/if}
            {#if item.stealth_disadvantage}
              <div class="prop-row">
                <span class="prop-label">Heimlichkeit</span>
                <span class="prop-value prop-disadvantage">Nachteil</span>
              </div>
            {/if}
            {#if item.cost}
              <div class="prop-row"><span class="prop-label">Kosten</span><span class="prop-value">{formatCost(item.cost)}</span></div>
            {/if}
            {#if item.weight != null}
              <div class="prop-row"><span class="prop-label">Gewicht</span><span class="prop-value">{item.weight} Pfd.</span></div>
            {/if}
          </div>
          <div class="card-divider"></div>
        {/if}

      {:else}
        <!-- magic / gear -->
        {#if item.cost || item.weight != null}
          <div class="card-props">
            {#if item.cost}
              <div class="prop-row"><span class="prop-label">Kosten</span><span class="prop-value">{formatCost(item.cost)}</span></div>
            {/if}
            {#if item.weight != null}
              <div class="prop-row"><span class="prop-label">Gewicht</span><span class="prop-value">{item.weight} Pfd.</span></div>
            {/if}
          </div>
          <div class="card-divider"></div>
        {/if}
      {/if}

      <!-- Beschreibung -->
      {#if item.desc_de?.length}
        <div class="card-description">{item.desc_de.join('\n\n')}</div>
        {#if item.desc?.length}
          <details class="desc-original">
            <summary>Original (Englisch)</summary>
            <div class="desc-original-body">{item.desc.join('\n\n')}</div>
          </details>
        {/if}
      {:else if item.desc?.length}
        <div class="card-description">{item.desc.join('\n\n')}</div>
      {:else}
        <div class="card-description muted">—</div>
      {/if}

      <div class="card-divider"></div>
      <div class="card-footer">
        <span class="footer-source">{item.source}</span>
        {#if item.item_type}
          <span class="footer-type">{ITEM_TYPE_LABELS[item.item_type] ?? item.item_type}</span>
        {/if}
        {#if item.desc_de?.length}
          <span class="footer-translated">DE</span>
        {/if}
      </div>
    </div>
  {:else if parseError}
    <div class="error">
      <div class="error-title">Ungültiges JSON — Gegenstand kann nicht angezeigt werden</div>
      <pre class="error-detail">{parseError}</pre>
    </div>
  {:else}
    <div class="error">Gegenstand konnte nicht geladen werden.</div>
  {/if}
{/snippet}

{#snippet bearbeiten()}
  {#if draft}
    <!-- ── Bearbeitungsmodus ── -->
    <div class="item-card edit-mode" style="--cat-color: {categoryColor(draft)}">
      {#if newDraft}
        <div class="new-banner">Neuer Gegenstand — noch nicht gespeichert.</div>
      {/if}
      {#if showSaveAs}
        <div class="saveas">
          <span class="saveas-label">Speichern als</span>
          <div class="saveas-row">
            <span class="saveas-dir">{CATEGORY_LABELS[categoryKeyOf(draft)] ?? categoryKeyOf(draft)}/</span>
            <input class="edit-input saveas-name" bind:value={newFilename}
              onkeydown={(e) => { if (e.key === 'Enter') confirmSaveAs(); }} />
            <span class="saveas-ext">.json</span>
            <button class="saveas-confirm" onclick={confirmSaveAs} disabled={!newFilename.trim()}>Speichern</button>
            <button class="saveas-cancel" onclick={() => (showSaveAs = false)} title="Abbrechen">×</button>
          </div>
        </div>
      {/if}
      <div class="card-header">
        <div class="edit-header-top">
          <input class="edit-name" bind:value={draft.name_de} placeholder="Name (Deutsch)" />
        </div>
        <input class="edit-name-original" bind:value={draft.name} placeholder="Original (Englisch)" />
        <div class="edit-header-meta">
          <select class="edit-select"
            value={categoryKeyOf(draft)}
            onchange={(e) => setDraftCategory((e.target as HTMLSelectElement).value)}>
            {#each Object.entries(CATEGORY_LABELS) as [key, label]}
              <option value={key}>{label}</option>
            {/each}
          </select>
          <select class="edit-select" bind:value={draft.source}>
            <option value="SRD">SRD</option>
            <option value="Homebrew">Homebrew</option>
            <option value="eigen">Eigen</option>
          </select>
        </div>
      </div>

      <!-- Typ-spezifische Felder -->
      <div class="card-props">

        {#if draft.item_type === 'magic'}
          <!-- Seltenheit + Einstimmung -->
          <div class="prop-row">
            <span class="prop-label">Seltenheit</span>
            <select class="edit-select" bind:value={draftRarityName}>
              <option value="">— keine —</option>
              {#each RARITY_OPTIONS as r}
                <option value={r}>{RARITY_LABELS[r] ?? r}</option>
              {/each}
            </select>
          </div>
          <div class="prop-row">
            <span class="prop-label">Einstimmung</span>
            <label class="edit-check">
              <input type="checkbox" bind:checked={draft.attunement} />
              Erforderlich
            </label>
          </div>
          {#if draft.attunement}
            <div class="prop-row">
              <span class="prop-label">Voraussetzung</span>
              <input class="edit-input" bind:value={draft.attunement_by} placeholder="z.B. by a wizard" />
            </div>
          {/if}

        {:else if draft.item_type === 'weapon'}
          <!-- Waffe: Kategorie, Reichweite, Schaden, Eigenschaften -->
          <div class="prop-row">
            <span class="prop-label">Kategorie</span>
            <div class="inline-row">
              <select class="edit-select" bind:value={draft.weapon_category}>
                <option value="">—</option>
                <option value="Simple">Einfache Waffe</option>
                <option value="Martial">Kriegswaffe</option>
              </select>
              <select class="edit-select" bind:value={draft.weapon_range}>
                <option value="">—</option>
                <option value="Melee">Nahkampf</option>
                <option value="Ranged">Fernkampf</option>
              </select>
            </div>
          </div>
          <div class="prop-row">
            <span class="prop-label">Schaden</span>
            <div class="damage-inputs">
              <input class="edit-input"
                value={draft.damage?.damage_dice ?? ''}
                oninput={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  draft!.damage = v ? { damage_dice: v, damage_type: draft!.damage?.damage_type ?? { index: '', name: '' } } : undefined;
                }}
                placeholder="z.B. 1d8" />
              <select class="edit-select damage-type-select"
                value={draft.damage?.damage_type.index ?? ''}
                onchange={(e) => {
                  const idx = (e.target as HTMLSelectElement).value;
                  if (draft!.damage) draft!.damage.damage_type = { index: idx, name: idx.charAt(0).toUpperCase() + idx.slice(1) };
                }}>
                <option value="">— Typ —</option>
                {#each Object.entries(DAMAGE_TYPE_LABELS) as [idx, label]}
                  <option value={idx}>{label}</option>
                {/each}
              </select>
            </div>
          </div>
          <div class="prop-row">
            <span class="prop-label">Reichweite</span>
            <div class="inline-row">
              <div class="ft-input-wrap">
                <input class="edit-input ft-m-input" type="number" min="0" step="0.5"
                  value={draft.range?.normal != null ? ftToMVal(draft.range.normal) : ''}
                  oninput={(e) => {
                    const m = parseFloat((e.target as HTMLInputElement).value);
                    draft!.range = m ? { normal: mToFt(m), long: draft!.range?.long } : undefined;
                  }}
                  placeholder="m" />
                <span class="ft-unit">m</span>
              </div>
              <div class="ft-input-wrap">
                <input class="edit-input ft-m-input" type="number" min="0" step="0.5"
                  value={draft.range?.long != null ? ftToMVal(draft.range.long) : ''}
                  oninput={(e) => {
                    const m = parseFloat((e.target as HTMLInputElement).value);
                    if (m && draft!.range) draft!.range = { ...draft!.range, long: mToFt(m) };
                    else if (draft!.range) draft!.range = { normal: draft!.range.normal };
                  }}
                  placeholder="m" />
                <span class="ft-unit">m</span>
                <span class="ft-sublabel" title="Maximale Reichweite mit Nachteil auf den Angriffswurf">Nachteil</span>
              </div>
            </div>
          </div>
          <div class="prop-row">
            <span class="prop-label">Wurfweite</span>
            <div class="inline-row">
              <div class="ft-input-wrap">
                <input class="edit-input ft-m-input" type="number" min="0" step="0.5"
                  value={draft.throw_range?.normal != null ? ftToMVal(draft.throw_range.normal) : ''}
                  oninput={(e) => {
                    const m = parseFloat((e.target as HTMLInputElement).value);
                    draft!.throw_range = m ? { normal: mToFt(m), long: draft!.throw_range?.long ?? 0 } : undefined;
                  }}
                  placeholder="m" />
                <span class="ft-unit">m</span>
              </div>
              <div class="ft-input-wrap">
                <input class="edit-input ft-m-input" type="number" min="0" step="0.5"
                  value={draft.throw_range?.long != null ? ftToMVal(draft.throw_range.long) : ''}
                  oninput={(e) => {
                    const m = parseFloat((e.target as HTMLInputElement).value);
                    if (draft!.throw_range) draft!.throw_range = { ...draft!.throw_range, long: mToFt(m) || 0 };
                  }}
                  placeholder="m" />
                <span class="ft-unit">m</span>
                <span class="ft-sublabel" title="Maximale Wurfweite mit Nachteil auf den Angriffswurf">Nachteil</span>
              </div>
            </div>
          </div>
          <div class="prop-row">
            <span class="prop-label">Eigenschaften</span>
            <input class="edit-input" bind:value={draftPropsText} placeholder="kommagetrennt, z.B. Finesse, Light" />
          </div>
          <div class="prop-row">
            <span class="prop-label" title="Magischer Bonus auf Angriffs- und Schadenswürfe">Magischer Bonus</span>
            <input class="edit-input" type="number" min="0" step="1"
              value={draft.magic_bonus ?? ''}
              oninput={(e) => {
                const v = (e.target as HTMLInputElement).value;
                draft!.magic_bonus = v ? parseInt(v) : undefined;
              }}
              placeholder="z.B. 1 (leer = keiner)" />
          </div>

        {:else if draft.item_type === 'armor'}
          <!-- Rüstung: Kategorie, RK, Stärke, Heimlichkeit -->
          <div class="prop-row">
            <span class="prop-label">Kategorie</span>
            <select class="edit-select" bind:value={draft.armor_category}>
              <option value="">—</option>
              {#each ARMOR_CATEGORIES as c}
                <option value={c}>{ARMOR_CATEGORY_LABELS[c]}</option>
              {/each}
            </select>
          </div>
          <div class="prop-row">
            <span class="prop-label">RK Basis</span>
            <input class="edit-input" type="number" min="0"
              value={draft.armor_class?.base ?? ''}
              oninput={(e) => {
                const v = (e.target as HTMLInputElement).value;
                draft!.armor_class = v ? {
                  base: parseInt(v),
                  dex_bonus: draft!.armor_class?.dex_bonus ?? false,
                  max_bonus: draft!.armor_class?.max_bonus ?? null,
                } : undefined;
              }}
              placeholder="z.B. 16" />
          </div>
          {#if draft.armor_class}
            <div class="prop-row">
              <span class="prop-label">GES-Bonus</span>
              <label class="edit-check">
                <input type="checkbox" bind:checked={draft.armor_class.dex_bonus} />
                erlaubt
                {#if draft.armor_class.dex_bonus}
                  <input class="edit-input max-bonus-input" type="number" min="0"
                    value={draft.armor_class.max_bonus ?? ''}
                    oninput={(e) => {
                      const v = (e.target as HTMLInputElement).value;
                      draft!.armor_class!.max_bonus = v ? parseInt(v) : null;
                    }}
                    placeholder="max." />
                {/if}
              </label>
            </div>
          {/if}
          <div class="prop-row">
            <span class="prop-label">Stärke mind.</span>
            <input class="edit-input" type="number" min="0"
              value={draft.str_minimum ?? ''}
              oninput={(e) => {
                const v = (e.target as HTMLInputElement).value;
                draft!.str_minimum = v ? parseInt(v) : undefined;
              }}
              placeholder="—" />
          </div>
          <div class="prop-row">
            <span class="prop-label">Heimlichkeit</span>
            <label class="edit-check">
              <input type="checkbox" bind:checked={draft.stealth_disadvantage} />
              Nachteil
            </label>
          </div>
        {/if}

        <!-- Gemeinsame Felder: Kosten + Gewicht -->
        <div class="prop-row">
          <span class="prop-label">Kosten</span>
          <div class="cost-inputs">
            <input class="edit-input cost-qty" type="number" min="0"
              value={draft.cost?.quantity ?? ''}
              oninput={(e) => {
                const v = (e.target as HTMLInputElement).value;
                draft!.cost = v ? { quantity: parseFloat(v), unit: draft!.cost?.unit ?? 'gp' } : undefined;
              }}
              placeholder="0" />
            <select class="edit-select"
              value={draft.cost?.unit ?? 'gp'}
              onchange={(e) => { if (draft!.cost) draft!.cost.unit = (e.target as HTMLSelectElement).value; }}>
              {#each COST_UNITS as u}<option value={u}>{COST_UNIT_LABELS[u] ?? u}</option>{/each}
            </select>
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Gewicht</span>
          <input class="edit-input" type="number" min="0" step="0.5"
            value={draft.weight ?? ''}
            oninput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              draft!.weight = v ? parseFloat(v) : undefined;
            }}
            placeholder="lbs" />
        </div>
      </div>

      <div class="card-divider"></div>

      <!-- Beschreibung (Deutsch) — primär -->
      <div class="edit-section">
        <span class="edit-section-label">Beschreibung (Deutsch)</span>
        <textarea class="edit-textarea" bind:value={draftDescDeText} rows={6}
          placeholder="Deutsche Beschreibung…"></textarea>
      </div>

      <div class="card-divider"></div>

      <!-- LLM-Übersetzung -->
      <div class="edit-section translate-section">
        <LlmTranslate
          systemPrompt={TRANSLATION_SYSTEM_PROMPT}
          buildPrompt={buildTranslationPrompt}
          onresult={applyTranslation}
        />
      </div>

      <div class="card-divider"></div>

      <!-- Beschreibung (Original) — sekundär, einklappbar -->
      <details class="edit-section edit-section-collapsible">
        <summary class="edit-section-label">Beschreibung (Original / Englisch)</summary>
        <textarea class="edit-textarea edit-textarea-secondary" bind:value={draftDescText} rows={5}
          style="margin-top: 0.4rem;"></textarea>
      </details>

      <div class="card-divider"></div>

      <!-- KI-Überarbeitung -->
      <div class="edit-section ai-section">
        <div class="ai-row">
          <span class="ai-label">Per KI überarbeiten</span>
          <button class="ai-btn" onclick={() => (showAiModal = true)}>KI überarbeiten…</button>
        </div>
      </div>

      <div class="card-divider"></div>

      <!-- DnD-API-Import -->
      <div class="edit-section api-section">
        <DndApiSearch
          placeholder="Name suchen…"
          onsearch={searchItems}
          onselect={importFromApi}
        />
        {#if importError}<span class="translate-error">{importError}</span>{/if}
        {#if apiRawResponse}
          <button class="api-raw-toggle" onclick={() => { showApiRaw = !showApiRaw; }}>
            API-Antwort {showApiRaw ? '▲' : '▼'}
          </button>
          {#if showApiRaw}
            <pre class="api-raw-pre">{apiRawResponse}</pre>
          {/if}
        {/if}
      </div>
    </div>

  {:else}
    <div class="error">Kein Gegenstand geladen.</div>
  {/if}
{/snippet}

</EditorPanel>

{#if showAiModal && draft}
  <ItemEditModal
    item={$state.snapshot(draft)}
    onresult={applyAiResult}
    onclose={() => (showAiModal = false)}
  />
{/if}

<style>

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

  .header-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 0.2rem;
  }

  .header-name {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: 0.01em;
    line-height: 1.2;
  }

  .header-original {
    font-size: 0.8rem;
    color: var(--ink-muted);
    font-style: italic;
    margin-bottom: 0.3rem;
  }

  .header-actions { display: flex; gap: 0.4rem; margin-top: 0.15rem; flex-shrink: 0; }

  .edit-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.78rem;
    padding: 0.25rem 0.65rem;
    border-radius: 5px;
    white-space: nowrap;
  }
  .edit-btn:hover { color: var(--arcane); border-color: var(--arcane); }

  .header-sub { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-top: 0.4rem; }

  .header-rarity { font-size: 0.85rem; color: var(--cat-color); font-weight: 600; }
  .header-weapon { font-size: 0.82rem; color: var(--danger); font-weight: 600; }
  .header-armor  { font-size: 0.82rem; color: var(--red); font-weight: 600; }
  .header-cat    { font-size: 0.82rem; color: var(--ink-muted); }

  .attunement-badge {
    font-size: 0.72rem;
    color: var(--bg);
    background: var(--cat-color);
    border-radius: 3px;
    padding: 0.1rem 0.5rem;
    font-weight: 700;
  }

  /* Props */
  .card-props { padding: 0.9rem 1.4rem; display: flex; flex-direction: column; gap: 0.45rem; }

  .prop-row {
    display: grid;
    grid-template-columns: 7.5rem 1fr;
    gap: 0.5rem;
    font-size: 0.88rem;
    line-height: 1.4;
    align-items: center;
  }

  .prop-label {
    color: var(--ink-muted);
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .prop-value { color: var(--ink); }
  .prop-secondary { color: var(--ink-muted); font-size: 0.82rem; }
  .prop-disadvantage { color: var(--danger); font-size: 0.82rem; }
  .damage-value { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
  .prop-pills { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .prop-pill {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 99px;
    font-size: 0.72rem;
    color: var(--ink-soft);
    padding: 0.1rem 0.5rem;
  }

  .card-divider { height: 1px; background: var(--surface); margin: 0 1.4rem; }

  .card-description {
    padding: 0.9rem 1.4rem;
    font-size: 0.88rem;
    color: var(--ink);
    line-height: 1.65;
    white-space: pre-wrap;
  }
  .card-description.muted { color: var(--border); }

  .desc-original { padding: 0 1.4rem 0.7rem; }
  .desc-original summary {
    font-size: 0.75rem;
    color: var(--border);
    cursor: pointer;
    user-select: none;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.2rem 0;
  }
  .desc-original summary:hover { color: var(--ink-muted); }
  .desc-original-body {
    margin-top: 0.5rem;
    font-size: 0.83rem;
    color: var(--ink-muted);
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .card-footer {
    padding: 0.7rem 1.4rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    background: color-mix(in srgb, var(--cat-color) 6%, var(--bg-panel));
  }

  .footer-source { font-size: 0.72rem; color: var(--border); text-transform: uppercase; letter-spacing: 0.05em; }
  .footer-type   { font-size: 0.72rem; color: var(--ink-muted); flex: 1; }
  .footer-translated {
    font-size: 0.68rem;
    color: var(--green);
    border: 1px solid var(--green);
    border-radius: 3px;
    padding: 0.05rem 0.4rem;
    letter-spacing: 0.05em;
  }

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

  .edit-actions { display: flex; gap: 0.4rem; flex-shrink: 0; }

  .save-btn {
    background: var(--green); border: none; border-radius: 4px;
    color: var(--bg); font-size: 0.8rem; font-weight: 700;
    padding: 0.3rem 0.7rem; cursor: pointer;
  }
  .save-btn:hover { background: var(--green); }

  .discard-btn {
    background: var(--surface); border: none; border-radius: 4px;
    color: var(--ink-muted); font-size: 0.8rem; padding: 0.3rem 0.7rem; cursor: pointer;
  }
  .discard-btn:hover { color: var(--danger); }

  .edit-header-meta { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }

  .edit-select {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink); font-size: 0.82rem; padding: 0.2rem 0.4rem;
    outline: none; font-family: inherit;
  }
  .edit-select:focus { border-color: var(--cat-color); }

  .edit-input {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink); font-size: 0.85rem; padding: 0.2rem 0.5rem;
    outline: none; font-family: inherit; width: 100%;
  }
  .edit-input:focus { border-color: var(--cat-color); }

  .edit-check { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: var(--ink-soft); cursor: pointer; }

  .inline-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }

  .ft-input-wrap { display: flex; align-items: center; gap: 0.3rem; }
  .ft-m-input { width: 4.5rem; }
  .ft-unit { font-size: 0.78rem; color: var(--ink-muted); }
  .ft-sublabel {
    font-size: 0.68rem;
    color: var(--border);
    cursor: help;
    border-bottom: 1px dotted var(--border);
  }
  .cost-inputs { display: flex; gap: 0.3rem; align-items: center; }
  .cost-qty { width: 5rem; flex-shrink: 0; }
  .max-bonus-input { width: 4rem; flex-shrink: 0; }
  .damage-inputs { display: flex; flex-direction: row; gap: 0.4rem; flex: 1; }
  .damage-inputs .edit-input { flex: 1; min-width: 0; }
  .damage-type-select { flex: 1; min-width: 0; }

  .edit-section { padding: 0.7rem 1.4rem; display: flex; flex-direction: column; gap: 0.4rem; }
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

  .translate-section {
    background: color-mix(in srgb, var(--red) 5%, var(--bg-panel));
    border-top: 1px solid var(--surface);
  }

  /* Neuer Entwurf / Speichern-unter */
  .new-banner {
    font-size: 0.78rem; color: var(--gold, #c89b3c);
    background: color-mix(in srgb, var(--gold, #c89b3c) 12%, var(--bg-panel));
    border-radius: 4px; padding: 0.3rem 0.5rem; margin-bottom: 0.5rem;
  }
  .saveas {
    display: flex; flex-direction: column; gap: 0.3rem;
    background: color-mix(in srgb, var(--arcane) 8%, var(--bg-panel));
    border: 1px solid var(--border); border-radius: 4px;
    padding: 0.5rem; margin-bottom: 0.6rem;
  }
  .saveas-label {
    font-size: 0.72rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--ink-muted);
  }
  .saveas-row { display: flex; align-items: center; gap: 0.3rem; }
  .saveas-dir { font-size: 0.8rem; color: var(--ink-muted); white-space: nowrap; }
  .saveas-name { flex: 1; min-width: 0; }
  .saveas-ext { font-size: 0.8rem; color: var(--ink-muted); }
  .saveas-confirm {
    background: var(--arcane); border: none; border-radius: 4px; color: #fff;
    font-size: 0.8rem; padding: 0.25rem 0.7rem; cursor: pointer; white-space: nowrap; font-family: inherit;
  }
  .saveas-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
  .saveas-cancel {
    background: none; border: none; color: var(--ink-muted); font-size: 1.1rem; cursor: pointer; line-height: 1;
  }
  .saveas-cancel:hover { color: var(--ink); }

  /* KI-Ausfüllen */
  .ai-section {
    background: color-mix(in srgb, var(--arcane) 6%, var(--bg-panel));
    border-top: 1px solid var(--surface);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .ai-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
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

  /* API-Import */
  .api-section {
    background: color-mix(in srgb, var(--cat-color) 5%, var(--bg-panel));
    border-top: 1px solid var(--surface);
  }

  .api-raw-toggle {
    background: none; border: none; color: var(--border); font-size: 0.72rem;
    cursor: pointer; padding: 0.2rem 0; font-family: inherit; text-align: left;
  }
  .api-raw-toggle:hover { color: var(--ink-muted); }

  .api-raw-pre {
    background: var(--bg-deep); border: 1px solid var(--surface); border-radius: 4px;
    color: var(--ink-muted); font-size: 0.72rem; line-height: 1.5;
    padding: 0.6rem 0.8rem; overflow-x: auto; white-space: pre;
    margin: 0; max-height: 300px; overflow-y: auto;
  }

  .error { color: var(--danger); padding: 2rem; font-size: 0.9rem; }
  .error-title { font-weight: 600; margin-bottom: 0.6rem; }
  .error-detail {
    font-family: monospace; font-size: 0.8rem; color: var(--copper);
    background: var(--bg-panel); border: 1px solid var(--surface); border-radius: 4px;
    padding: 0.6rem 0.8rem; white-space: pre-wrap; word-break: break-all; margin: 0;
  }
</style>
