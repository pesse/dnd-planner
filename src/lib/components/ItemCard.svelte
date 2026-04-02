<script lang="ts">
  import { activeFile, setFileContent } from '$lib/stores/campaign';
  import { llmConfig, loadApiKeyForProvider } from '$lib/stores/llm';
  import { invoke } from '@tauri-apps/api/core';
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import { pushError } from '$lib/stores/errors';
  import type { Item } from '$lib/types';
  import {
    CATEGORY_COLORS,
    CATEGORY_LABELS,
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
  import {
    ollamaGenerate,
    anthropicGenerate,
    groqGenerate,
    xaiGenerate,
  } from '$lib/services/llmService';
  import { TRANSLATION_SYSTEM_PROMPT } from '$lib/prompts';

  // ── Konstanten ───────────────────────────────────────────────────────────────

  const RARITY_OPTIONS = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'];
  const COST_UNITS = ['gp', 'sp', 'cp', 'ep', 'pp'];
  const ARMOR_CATEGORIES = ['Light', 'Medium', 'Heavy', 'Shield'];
  const ITEM_TYPES = ['weapon', 'armor', 'magic', 'gear'] as const;

  // Farbe aus equipment_category oder item_type ableiten
  function categoryColor(item: Item): string {
    if (item.equipment_category) {
      const cat = API_CATEGORY_MAP[item.equipment_category.index] ?? 'sonstiges';
      return CATEGORY_COLORS[cat] ?? '#cba6f7';
    }
    if (item.item_type === 'weapon') return CATEGORY_COLORS['waffe'];
    if (item.item_type === 'armor')  return CATEGORY_COLORS['rüstung'];
    if (item.item_type === 'magic')  return CATEGORY_COLORS['wundersam'];
    return CATEGORY_COLORS['sonstiges'];
  }

  // ── State ────────────────────────────────────────────────────────────────────

  let rawJson = $state('');

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

    const unsub = activeFile.subscribe((file) => {
      if (file?.type === 'item' && file.path) load(file.path);
    });
    return unsub;
  });

  /** Migriert alte Formate und leitet item_type aus Feldern ab. */
  function normalizeItem(raw: Record<string, unknown>): Item {
    // Altes Format: rarity als String
    if (typeof raw.rarity === 'string') raw.rarity = { name: raw.rarity };
    // Altes Format: description statt desc
    if (!raw.desc && typeof raw.description === 'string') {
      raw.desc = raw.description ? [raw.description as string] : [];
      delete raw.description;
    }
    // Altes Format: category statt equipment_category
    if (!raw.equipment_category && typeof raw.category === 'string') {
      const cat = raw.category as string;
      raw.equipment_category = { index: cat, name: cat };
      delete raw.category;
    }
    // Altes Format: attunement_requirements statt attunement_by
    if ('attunement_requirements' in raw && !('attunement_by' in raw)) {
      raw.attunement_by = raw.attunement_requirements ?? null;
      delete raw.attunement_requirements;
    }
    if (!Array.isArray(raw.desc)) raw.desc = [];

    // item_type aus Feldern ableiten wenn nicht gesetzt
    if (!raw.item_type) {
      const cat = (raw.equipment_category as { index?: string } | undefined)?.index ?? '';
      if (raw.weapon_category || raw.damage || ['weapon','martial-melee','martial-ranged','simple-melee','simple-ranged','ammunition'].includes(cat)) {
        raw.item_type = 'weapon';
      } else if (raw.armor_category || raw.armor_class || ['armor','light-armor','medium-armor','heavy-armor','shields'].includes(cat)) {
        raw.item_type = 'armor';
      } else if (raw.rarity || ['ring','wundersam','trank','stab','schriftrolle','wondrous-items','potion','rod','staff','wand','scroll'].includes(cat)) {
        raw.item_type = 'magic';
      } else {
        raw.item_type = 'gear';
      }
    }

    return raw as unknown as Item;
  }

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
  let color = $derived(item ? categoryColor(item) : '#cba6f7');

  // ── Bearbeiten ───────────────────────────────────────────────────────────────

  let editing = $state(false);
  let draft = $state<Item | null>(null);
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

  function discard() {
    editing = false;
    draft = null;
    apiSearch = '';
    apiResults = [];
    apiRawResponse = null;
  }

  async function save() {
    if (!draft || !$activeFile) return;
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
    const json = JSON.stringify($state.snapshot(draft), null, 2);
    try {
      await invoke('write_file_content', { path: $activeFile.path, content: json });
      const dir = $activeFile.path.split('/').at(-2) ?? '';
      if (dir) invalidateItemCache(dir);
      rawJson = json;
      setFileContent(json);
      editing = false;
      draft = null;
      apiSearch = '';
      apiResults = [];
      apiRawResponse = null;
    } catch (e) {
      pushError(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ── DnD-API-Import ───────────────────────────────────────────────────────────

  const DND_API = 'https://www.dnd5eapi.co/api/2014';

  interface ApiResult {
    index: string;
    name: string;
    url: string;
    source: 'magic' | 'equipment';
  }

  let apiSearch = $state('');
  let apiResults = $state<ApiResult[]>([]);
  let apiSearching = $state(false);
  let apiError = $state('');
  let apiRawResponse = $state<string | null>(null);
  let showApiRaw = $state(false);

  async function apiGet(url: string): Promise<unknown> {
    const text = await invoke<string>('http_request', {
      req: { url, method: 'GET', headers: {}, body: '' },
    });
    return JSON.parse(text);
  }

  async function searchApi() {
    const q = apiSearch.trim();
    if (!q) return;
    apiSearching = true;
    apiError = '';
    apiResults = [];
    try {
      const [magicRaw, equipRaw] = await Promise.all([
        apiGet(`${DND_API}/magic-items?name=${encodeURIComponent(q)}`),
        apiGet(`${DND_API}/equipment?name=${encodeURIComponent(q)}`),
      ]);
      const magic = ((magicRaw as Record<string, unknown>).results as ApiResult[] ?? [])
        .map((r) => ({ ...r, source: 'magic' as const }));
      const equip = ((equipRaw as Record<string, unknown>).results as ApiResult[] ?? [])
        .map((r) => ({ ...r, source: 'equipment' as const }));
      apiResults = [...magic, ...equip].slice(0, 15);
    } catch (e) {
      apiError = `API-Fehler: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      apiSearching = false;
    }
  }

  function apiSearchKey(e: KeyboardEvent) {
    if (e.key === 'Enter') searchApi();
  }

  async function importFromApi(result: ApiResult) {
    if (!draft) return;
    try {
      const data = await apiGet(`https://www.dnd5eapi.co${result.url}`) as Record<string, unknown>;
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

      apiSearch  = '';
      apiResults = [];
    } catch (e) {
      apiError = `Import fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // ── LLM-Übersetzung ──────────────────────────────────────────────────────────

  const PROVIDERS = [
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'groq',      label: 'Groq' },
    { value: 'ollama',    label: 'Ollama' },
    { value: 'xai',       label: 'xAI' },
  ] as const;

  const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
    anthropic: 'claude-sonnet-4-6',
    groq:      'llama-3.3-70b-versatile',
    xai:       'grok-3-mini',
    ollama:    'llama3.2',
  };

  let translateProvider = $state(get(llmConfig).provider);
  const DEFAULT_SYSTEM_PROMPT = TRANSLATION_SYSTEM_PROMPT;
  let translateSystemPrompt = $state(DEFAULT_SYSTEM_PROMPT);
  let showSystemPrompt = $state(false);
  let translating = $state(false);
  let translateError = $state('');

  async function translateFields() {
    if (!draft) return;
    translating = true;
    translateError = '';

    const globalCfg = get(llmConfig);
    const apiKey = await loadApiKeyForProvider(translateProvider);
    const cfg = {
      provider: translateProvider as typeof globalCfg.provider,
      model:    translateProvider === globalCfg.provider
                  ? globalCfg.model
                  : (PROVIDER_DEFAULT_MODELS[translateProvider] ?? ''),
      apiKey:   apiKey ?? undefined,
      baseUrl:  globalCfg.baseUrl,
    };

    const toTranslate: Record<string, unknown> = {};
    if (draft.name) toTranslate.name = draft.name;
    const desc = draftDescText.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
    if (desc.length) toTranslate.desc = desc;
    if (Object.keys(toTranslate).length === 0) { translating = false; return; }

    const prompt = `Translate these D&D item fields:\n\n${JSON.stringify(toTranslate, null, 2)}`;

    try {
      let raw: string;
      if (cfg.provider === 'anthropic')     raw = await anthropicGenerate(cfg, prompt, translateSystemPrompt);
      else if (cfg.provider === 'groq')     raw = await groqGenerate(cfg, prompt, translateSystemPrompt);
      else if (cfg.provider === 'xai')      raw = await xaiGenerate(cfg, prompt, translateSystemPrompt);
      else                                  raw = await ollamaGenerate(cfg, prompt, translateSystemPrompt);

      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Keine gültige JSON-Antwort vom LLM');
      const translated = JSON.parse(match[0]) as Record<string, unknown>;
      if (translated.name_de) draft.name_de = translated.name_de as string;
      if (Array.isArray(translated.desc_de)) {
        draft.desc_de = translated.desc_de as string[];
        draftDescDeText = (translated.desc_de as string[]).join('\n\n');
      }
    } catch (e) {
      translateError = e instanceof Error ? e.message : String(e);
    } finally {
      translating = false;
    }
  }
</script>

<div class="item-area">
  {#if item && !editing}
    <!-- ── Anzeigemodus ── -->
    <div class="item-card" style="--cat-color: {color}">
      <div class="card-header">
        <div class="header-top">
          <div class="header-name">{item.name_de ?? item.name}</div>
          <div class="header-actions">
            <button class="edit-btn" onclick={startEdit}>✏ Bearbeiten</button>
          </div>
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

  {:else if draft}
    <!-- ── Bearbeitungsmodus ── -->
    <div class="item-card edit-mode" style="--cat-color: {categoryColor(draft)}">
      <div class="card-header">
        <div class="edit-header-top">
          <input class="edit-name" bind:value={draft.name_de} placeholder="Name (Deutsch)" />
          <div class="edit-actions">
            <button class="save-btn" onclick={save}>Speichern</button>
            <button class="discard-btn" onclick={discard}>Verwerfen</button>
          </div>
        </div>
        <input class="edit-name-original" bind:value={draft.name} placeholder="Original (Englisch)" />
        <div class="edit-header-meta">
          <select class="edit-select" bind:value={draft.item_type}>
            {#each ITEM_TYPES as t}
              <option value={t}>{ITEM_TYPE_LABELS[t]}</option>
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
        <div class="translate-label-row">
          <span class="edit-section-label">Aus Original übersetzen</span>
          <button class="system-prompt-toggle" onclick={() => { showSystemPrompt = !showSystemPrompt; }}>
            System-Prompt {showSystemPrompt ? '▲' : '▼'}
          </button>
        </div>
        {#if showSystemPrompt}
          <textarea class="edit-textarea system-prompt-textarea" bind:value={translateSystemPrompt} rows={4}></textarea>
          <button class="reset-prompt-btn" onclick={() => { translateSystemPrompt = DEFAULT_SYSTEM_PROMPT; }}>Zurücksetzen</button>
        {/if}
        <div class="translate-row">
          <div class="provider-pills">
            {#each PROVIDERS as p}
              <button class="provider-pill" class:active={translateProvider === p.value}
                onclick={() => { translateProvider = p.value; }}>{p.label}</button>
            {/each}
          </div>
          <button class="translate-btn" onclick={translateFields} disabled={translating}>
            {translating ? 'Übersetze…' : '🌐 Übersetzen'}
          </button>
        </div>
        {#if translateError}<span class="translate-error">{translateError}</span>{/if}
      </div>

      <div class="card-divider"></div>

      <!-- Beschreibung (Original) — sekundär, einklappbar -->
      <details class="edit-section edit-section-collapsible">
        <summary class="edit-section-label">Beschreibung (Original / Englisch)</summary>
        <textarea class="edit-textarea edit-textarea-secondary" bind:value={draftDescText} rows={5}
          style="margin-top: 0.4rem;"></textarea>
      </details>

      <div class="card-divider"></div>

      <!-- DnD-API-Import -->
      <div class="edit-section api-section">
        <span class="edit-section-label">Aus DnD-API laden</span>
        <div class="api-search-row">
          <input class="edit-input api-input" bind:value={apiSearch}
            placeholder="Name suchen…" onkeydown={apiSearchKey} />
          <button class="api-search-btn" onclick={searchApi} disabled={apiSearching}>
            {apiSearching ? '…' : 'Suchen'}
          </button>
        </div>
        {#if apiError}<span class="translate-error">{apiError}</span>{/if}
        {#if apiResults.length}
          <div class="api-results">
            {#each apiResults as result}
              <button class="api-result-item" onclick={() => importFromApi(result)}
                title={result.source === 'magic' ? 'Magischer Gegenstand' : 'Ausrüstung'}>
                <span class="api-result-name">{result.name}</span>
                <span class="api-result-tag">{result.source === 'magic' ? 'magisch' : 'ausrüstung'}</span>
              </button>
            {/each}
          </div>
        {/if}
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

  {:else if parseError}
    <div class="error">
      <div class="error-title">Ungültiges JSON — Gegenstand kann nicht angezeigt werden</div>
      <pre class="error-detail">{parseError}</pre>
    </div>
  {:else}
    <div class="error">Gegenstand konnte nicht geladen werden.</div>
  {/if}
</div>

<style>
  .item-area {
    flex: 1;
    overflow-y: auto;
    display: flex;
    justify-content: center;
    padding: 2rem 1rem;
    background: #1e1e2e;
  }

  .item-card {
    width: 100%;
    max-width: 580px;
    background: #181825;
    border-radius: 10px;
    border: 1px solid #313244;
    overflow: hidden;
    box-shadow: 0 4px 24px #00000055;
    height: fit-content;
  }

  /* Header */
  .card-header {
    background: color-mix(in srgb, var(--cat-color) 18%, #181825);
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
    color: #cdd6f4;
    letter-spacing: 0.01em;
    line-height: 1.2;
  }

  .header-original {
    font-size: 0.8rem;
    color: #6c7086;
    font-style: italic;
    margin-bottom: 0.3rem;
  }

  .header-actions { display: flex; gap: 0.4rem; margin-top: 0.15rem; flex-shrink: 0; }

  .edit-btn {
    background: #313244;
    border: 1px solid #45475a;
    color: #a6adc8;
    cursor: pointer;
    font-size: 0.78rem;
    padding: 0.25rem 0.65rem;
    border-radius: 5px;
    white-space: nowrap;
  }
  .edit-btn:hover { color: #cba6f7; border-color: #cba6f7; }

  .header-sub { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-top: 0.4rem; }

  .header-rarity { font-size: 0.85rem; color: var(--cat-color); font-weight: 600; }
  .header-weapon { font-size: 0.82rem; color: #f38ba8; font-weight: 600; }
  .header-armor  { font-size: 0.82rem; color: #89b4fa; font-weight: 600; }
  .header-cat    { font-size: 0.82rem; color: #6c7086; }

  .attunement-badge {
    font-size: 0.72rem;
    color: #1e1e2e;
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
    color: #6c7086;
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .prop-value { color: #cdd6f4; }
  .prop-secondary { color: #6c7086; font-size: 0.82rem; }
  .prop-disadvantage { color: #f38ba8; font-size: 0.82rem; }
  .damage-value { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
  .prop-pills { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .prop-pill {
    background: #313244;
    border: 1px solid #45475a;
    border-radius: 99px;
    font-size: 0.72rem;
    color: #a6adc8;
    padding: 0.1rem 0.5rem;
  }

  .card-divider { height: 1px; background: #313244; margin: 0 1.4rem; }

  .card-description {
    padding: 0.9rem 1.4rem;
    font-size: 0.88rem;
    color: #cdd6f4;
    line-height: 1.65;
    white-space: pre-wrap;
  }
  .card-description.muted { color: #45475a; }

  .desc-original { padding: 0 1.4rem 0.7rem; }
  .desc-original summary {
    font-size: 0.75rem;
    color: #45475a;
    cursor: pointer;
    user-select: none;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.2rem 0;
  }
  .desc-original summary:hover { color: #6c7086; }
  .desc-original-body {
    margin-top: 0.5rem;
    font-size: 0.83rem;
    color: #6c7086;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .card-footer {
    padding: 0.7rem 1.4rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    background: color-mix(in srgb, var(--cat-color) 6%, #181825);
  }

  .footer-source { font-size: 0.72rem; color: #45475a; text-transform: uppercase; letter-spacing: 0.05em; }
  .footer-type   { font-size: 0.72rem; color: #585b70; flex: 1; }
  .footer-translated {
    font-size: 0.68rem;
    color: #a6e3a1;
    border: 1px solid #a6e3a1;
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
    background: #313244; border: 1px solid #45475a; border-radius: 5px;
    color: #cdd6f4; padding: 0.3rem 0.6rem; flex: 1; min-width: 0;
    font-family: inherit; outline: none;
  }
  .edit-name:focus { border-color: var(--cat-color); }

  .edit-name-original {
    font-size: 0.85rem;
    background: transparent; border: none; border-bottom: 1px solid #313244;
    color: #6c7086; padding: 0.2rem 0.6rem; width: 100%;
    font-family: inherit; outline: none; font-style: italic;
    margin-bottom: 0.4rem;
  }
  .edit-name-original:focus { border-bottom-color: #45475a; color: #a6adc8; }

  .edit-actions { display: flex; gap: 0.4rem; flex-shrink: 0; }

  .save-btn {
    background: #a6e3a1; border: none; border-radius: 4px;
    color: #1e1e2e; font-size: 0.8rem; font-weight: 700;
    padding: 0.3rem 0.7rem; cursor: pointer;
  }
  .save-btn:hover { background: #94d3a2; }

  .discard-btn {
    background: #313244; border: none; border-radius: 4px;
    color: #6c7086; font-size: 0.8rem; padding: 0.3rem 0.7rem; cursor: pointer;
  }
  .discard-btn:hover { color: #f38ba8; }

  .edit-header-meta { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }

  .edit-select {
    background: #313244; border: 1px solid #45475a; border-radius: 4px;
    color: #cdd6f4; font-size: 0.82rem; padding: 0.2rem 0.4rem;
    outline: none; font-family: inherit;
  }
  .edit-select:focus { border-color: var(--cat-color); }

  .edit-input {
    background: #313244; border: 1px solid #45475a; border-radius: 4px;
    color: #cdd6f4; font-size: 0.85rem; padding: 0.2rem 0.5rem;
    outline: none; font-family: inherit; width: 100%;
  }
  .edit-input:focus { border-color: var(--cat-color); }

  .edit-check { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: #a6adc8; cursor: pointer; }

  .inline-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }

  .ft-input-wrap { display: flex; align-items: center; gap: 0.3rem; }
  .ft-m-input { width: 4.5rem; }
  .ft-unit { font-size: 0.78rem; color: #6c7086; }
  .ft-sublabel {
    font-size: 0.68rem;
    color: #45475a;
    cursor: help;
    border-bottom: 1px dotted #45475a;
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
  .edit-section-collapsible summary::before { content: '› '; color: #45475a; }
  .edit-section-collapsible[open] summary::before { content: '▾ '; }

  .edit-section-label {
    font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: #6c7086;
  }

  .edit-textarea {
    background: #313244; border: 1px solid #45475a; border-radius: 4px;
    color: #cdd6f4; font-size: 0.85rem; padding: 0.4rem 0.6rem;
    resize: vertical; outline: none; font-family: inherit; line-height: 1.6; width: 100%;
  }
  .edit-textarea:focus { border-color: var(--cat-color); }
  .edit-textarea-secondary { color: #6c7086; font-style: italic; }

  .translate-label-row { display: flex; align-items: center; justify-content: space-between; }

  .translate-section {
    background: color-mix(in srgb, #89b4fa 5%, #181825);
    border-top: 1px solid #313244;
  }

  .system-prompt-toggle {
    background: none; border: none; color: #45475a; font-size: 0.72rem;
    cursor: pointer; padding: 0; font-family: inherit;
  }
  .system-prompt-toggle:hover { color: #89b4fa; }

  .system-prompt-textarea { font-size: 0.78rem; line-height: 1.5; color: #a6adc8; }

  .reset-prompt-btn {
    background: none; border: none; color: #45475a; font-size: 0.72rem;
    cursor: pointer; padding: 0; font-family: inherit; align-self: flex-start;
  }
  .reset-prompt-btn:hover { color: #f38ba8; }

  .translate-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .provider-pills { display: flex; gap: 0.25rem; flex-wrap: wrap; flex: 1; }

  .provider-pill {
    background: #313244; border: 1px solid #45475a; border-radius: 99px;
    color: #6c7086; font-size: 0.75rem; padding: 0.2rem 0.6rem;
    cursor: pointer; white-space: nowrap; font-family: inherit;
  }
  .provider-pill:hover { color: #cdd6f4; border-color: #585b70; }
  .provider-pill.active { background: #45475a; color: #cdd6f4; border-color: #89b4fa; }

  .translate-btn {
    background: #313244; border: 1px solid #45475a; border-radius: 4px;
    color: #a6adc8; font-size: 0.8rem; padding: 0.2rem 0.65rem;
    cursor: pointer; white-space: nowrap; flex-shrink: 0;
  }
  .translate-btn:hover:not(:disabled) { color: #89b4fa; border-color: #89b4fa; }
  .translate-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .translate-error { font-size: 0.78rem; color: #f38ba8; }

  /* API-Import */
  .api-section {
    background: color-mix(in srgb, var(--cat-color) 5%, #181825);
    border-top: 1px solid #313244;
  }

  .api-search-row { display: flex; gap: 0.4rem; }
  .api-input { flex: 1; }

  .api-search-btn {
    background: #313244; border: 1px solid #45475a; border-radius: 4px;
    color: #a6adc8; font-size: 0.82rem; padding: 0.2rem 0.7rem;
    cursor: pointer; white-space: nowrap; flex-shrink: 0;
  }
  .api-search-btn:hover:not(:disabled) { color: var(--cat-color); border-color: var(--cat-color); }
  .api-search-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .api-results {
    display: flex; flex-direction: column; gap: 0.2rem;
    max-height: 200px; overflow-y: auto; margin-top: 0.2rem;
  }

  .api-result-item {
    display: flex; justify-content: space-between; align-items: center;
    background: #313244; border: 1px solid #45475a; border-radius: 4px;
    color: #cdd6f4; font-size: 0.82rem; padding: 0.3rem 0.6rem;
    cursor: pointer; text-align: left;
  }
  .api-result-item:hover { border-color: var(--cat-color); color: var(--cat-color); }

  .api-result-name { font-weight: 500; }
  .api-result-tag { font-size: 0.7rem; color: #6c7086; text-transform: uppercase; letter-spacing: 0.04em; flex-shrink: 0; }

  .api-raw-toggle {
    background: none; border: none; color: #45475a; font-size: 0.72rem;
    cursor: pointer; padding: 0.2rem 0; font-family: inherit; text-align: left;
  }
  .api-raw-toggle:hover { color: #6c7086; }

  .api-raw-pre {
    background: #11111b; border: 1px solid #313244; border-radius: 4px;
    color: #6c7086; font-size: 0.72rem; line-height: 1.5;
    padding: 0.6rem 0.8rem; overflow-x: auto; white-space: pre;
    margin: 0; max-height: 300px; overflow-y: auto;
  }

  .error { color: #f38ba8; padding: 2rem; font-size: 0.9rem; }
  .error-title { font-weight: 600; margin-bottom: 0.6rem; }
  .error-detail {
    font-family: monospace; font-size: 0.8rem; color: #fab387;
    background: #181825; border: 1px solid #313244; border-radius: 4px;
    padding: 0.6rem 0.8rem; white-space: pre-wrap; word-break: break-all; margin: 0;
  }
</style>
