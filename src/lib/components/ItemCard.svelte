<script lang="ts">
  import { activeFile, setFileContent, newItemDraft, invalidateVault } from '$lib/stores/campaign';
  import { invoke } from '@tauri-apps/api/core';
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import { pushError } from '$lib/stores/errors';
  import type { Item } from '$lib/types';
  import {
    CATEGORY_LABELS,
    CATEGORY_TO_DIR,
    RARITY_LABELS,
    DAMAGE_TYPE_LABELS,
    PROPERTY_LABELS,
    PROPERTY_INDEX_BY_LABEL,
    MASTERY_INFO,
    masteryLabel,
    COST_UNIT_LABELS,
    WEAPON_CATEGORY_LABELS,
    WEAPON_RANGE_LABELS,
    ARMOR_CATEGORY_LABELS,
    ITEMS_PATH,
    dirOf,
    structuralType,
    isMagicItem,
    rarityColor,
    invalidateItemCache,
    formatCost,
    formatRarity,
    formatDamageDice,
    ftToM,
    ftToMVal,
    mToFt,
  } from '$lib/itemLibrary';
  import { translateItem } from '$lib/services/aiActions/translateAction';
  import type { ItemTranslation } from '$lib/schemas/translation';
  import { convertDistances } from '$lib/utils/distanceText';
  import { normalizeItem } from '$lib/utils/schemaValidation';
  import { SOURCE_KEYS, SOURCE_LABELS, sourceLabel, WEAPON_MASTERIES } from '$lib/schemas/shared';
  import { prepareItemPrint } from '$lib/utils/printItem';
  import { preferredCardTab } from '$lib/stores/uiPrefs';
  import DndApiSearch from './DndApiSearch.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import { getOpen5eItem, searchOpen5eItems, mapOpen5eItem, type Open5eItemSearchResult } from '$lib/services/open5eApi';
  import AiEditModal from './AiEditModal.svelte';
  import { editItemAction } from '$lib/services/aiActions/itemAction';
  import TranslateModal from './TranslateModal.svelte';
  import { registerEditorGuard } from '$lib/stores/navigationGuard';

  // ── Konstanten ───────────────────────────────────────────────────────────────

  const RARITY_OPTIONS = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'];
  const COST_UNITS = ['gp', 'sp', 'cp', 'ep', 'pp'];
  const ARMOR_CATEGORIES = ['Light', 'Medium', 'Heavy', 'Shield'];

  /** Aktueller Kategorie-Schlüssel (= Ordnername). Quelle: equipment_category (via dirOf). */
  const categoryKeyOf = dirOf;

  /** Kategorie-Schlüssel → DnD-API-konformer Anzeigename (z.B. "wondrous-items" → "Wondrous Items"). */
  function categoryApiName(catKey: string): string {
    return catKey.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  function setDraftCategory(catKey: string) {
    if (!draft) return;
    draft.equipment_category = { index: catKey, name: categoryApiName(catKey) };
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
        // Editier-State zurücksetzen, damit das neue Item frisch initialisiert.
        editing = false;
        draft = null;
        apiRawResponse = null;
        importError = '';
        showSaveAs = false;
        // Im übergreifend zuletzt gewählten Modus öffnen (Karte/Bearbeiten).
        tab = get(preferredCardTab);
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

    const unguard = registerEditorGuard({
      isDirty: () => dirty,
      save: async () => {
        const keepTab = tab;
        await save();
        // Neuer Entwurf: save() öffnet erst „Speichern unter" (Dateiname nötig) →
        // Navigation abbrechen, bis der Nutzer den Namen bestätigt hat.
        if (newDraft) throw new Error('Dateiname erforderlich');
        tab = keepTab;   // Bearbeiten-Modus über die Navigation hinweg erhalten
      },
      discard: () => {
        const keepTab = tab;
        discard();
        tab = keepTab;
      },
    });

    return () => { unsubFile(); unsubDraft(); unguard(); };
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
  let color = $derived(rarityColor(item?.rarity));

  // ── Bearbeiten ───────────────────────────────────────────────────────────────

  type Tab = 'karte' | 'bearbeiten' | 'json';
  let tab     = $state<Tab>('karte');
  let editing = $state(false);
  let draft   = $state<Item | null>(null);
  // Beim Editier-Start erfasster Stand (Draft inkl. Text-Spiegel, durch mergeDraftFields
  // serialisiert). Vergleichsbasis für „wirklich geändert?".
  let editBaseline = $state('');

  // Wirklich geändert? (nicht bloß „im Bearbeiten-Modus"). Beide Seiten laufen durch
  // denselben (verlustbehafteten) mergeDraftFields-Roundtrip, daher kein Falsch-Positiv
  // aus der Rekonstruktion. Ungespeicherte Neuanlagen gelten immer als dirty.
  let dirty   = $derived.by(() => {
    if (newDraft) return true;
    if (!editing || !draft) return false;
    return JSON.stringify(mergeDraftFields($state.snapshot(draft) as Item)) !== editBaseline;
  });

  // Beim Wechsel auf Bearbeiten-Tab Draft initialisieren
  $effect(() => {
    if (tab === 'bearbeiten' && !editing && item) startEdit();
  });

  // Tab-Wechsel übergreifend merken (json bewusst ausgenommen).
  $effect(() => {
    if (tab === 'karte' || tab === 'bearbeiten') preferredCardTab.set(tab);
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
    // Baseline nach Setzen aller Spiegel erfassen (gleicher Roundtrip wie der Dirty-Check).
    editBaseline = JSON.stringify(mergeDraftFields($state.snapshot(draft) as Item));
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

  /** Überträgt die Text-Spiegel (Beschreibung, Eigenschaften, Seltenheit) in den Draft. */
  function applyDraftFields() {
    if (!draft) return;
    const merged = mergeDraftFields($state.snapshot(draft) as Item);
    draft.desc       = merged.desc;
    draft.desc_de    = merged.desc_de;
    draft.rarity     = merged.rarity;
    draft.properties = merged.properties;
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

  // ── Open5e-v2-Import (Ausrüstung + Magie) ─────────────────────────────────────

  let apiRawResponse = $state<string | null>(null);
  let showApiRaw = $state(false);
  let importError = $state('');

  const searchItems = searchOpen5eItems;

  async function importFromApi(result: Open5eItemSearchResult) {
    if (!draft) return;
    try {
      const data = await getOpen5eItem(result.url);
      apiRawResponse = JSON.stringify(data, null, 2);
      showApiRaw = false;

      const item = mapOpen5eItem(data);
      Object.assign(draft, item);

      draftDescText   = item.desc.join('\n\n');
      draftDescDeText = '';
      draftPropsText  = (item.properties ?? []).map((p) => PROPERTY_LABELS[p.index] ?? p.name).join(', ');
      draftRarityName = item.rarity?.name ?? '';

      importError = '';
    } catch (e) {
      importError = `Import fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // ── LLM-Übersetzung ──────────────────────────────────────────────────────────

  /** Baut den Übersetzungslauf; null, wenn es nichts zu übersetzen gibt. */
  function buildTranslationRun() {
    if (!draft) return null;
    const toTranslate: Record<string, unknown> = {};
    if (draft.name) toTranslate.name = draft.name;
    const desc = draftDescText.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
    if (desc.length) toTranslate.desc = desc;
    if (Object.keys(toTranslate).length === 0) return null;
    return translateItem(toTranslate);
  }

  /** Übernimmt die Übersetzung; leere Felder bedeuten „nicht übersetzt" und bleiben unangetastet. */
  function applyTranslation(t: ItemTranslation) {
    if (!draft) return;
    if (t.name_de) draft.name_de = convertDistances(t.name_de);
    if (t.desc_de.length) {
      const de = t.desc_de.map(convertDistances);
      draft.desc_de = de;
      draftDescDeText = de.join('\n\n');
    }
  }

  // ── KI-Werkzeuge (Dialoge) ───────────────────────────────────────────────────

  let showAiModal = $state(false);
  let showTranslateModal = $state(false);

  /** Übernimmt das vom KI-Dialog überarbeitete Item in den Draft (überschreibt bestehende Werte). */
  function applyAiResult(result: Item) {
    if (!draft) return;
    Object.assign(draft, result);
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
  bind:tab
  {dirty}
  onsave={save}
  ondiscard={discard}
  onsavejson={saveJson}
  getJson={() => draft ? JSON.stringify($state.snapshot(draft), null, 2) : rawJson}
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
          <div class="desc">{item.desc_de.join('\n\n')}</div>
          {#if item.desc?.length}
            <details class="desc-orig">
              <summary>Original (Englisch)</summary>
              <div class="desc-orig-body">{item.desc.join('\n\n')}</div>
            </details>
          {/if}
        {:else if item.desc?.length}
          <div class="desc">{item.desc.join('\n\n')}</div>
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
    <div class="item-card edit-mode" style="--cat-color: {rarityColor(draftRarityName)}">
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
            {#each SOURCE_KEYS as key}
              <option value={key}>{SOURCE_LABELS[key]}</option>
            {/each}
          </select>
        </div>
      </div>

      <!-- Typ-spezifische Felder -->
      <div class="card-props">

        <!-- Magie-Facette (additiv, unabhängig vom Strukturtyp): auch eine magische Waffe zeigt das -->
        {#if isMagicItem(draft)}
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
        {/if}

        <!-- Statwerte-Block nach Strukturtyp (= Kategorie): eine magische Waffe bekommt hier ihre Waffenfelder -->
        {#if structuralType(draft) === 'weapon'}
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
            <span class="prop-label" title="Meisterschaftseigenschaft der Waffenart (5e 2024)">Meisterschaft</span>
            <select class="edit-select"
              value={draft.mastery ?? ''}
              onchange={(e) => {
                const v = (e.currentTarget as HTMLSelectElement).value;
                draft!.mastery = v ? (v as typeof WEAPON_MASTERIES[number]) : undefined;
              }}>
              <option value="">—</option>
              {#each WEAPON_MASTERIES as m}
                <option value={m}>{MASTERY_INFO[m].nameDe}</option>
              {/each}
            </select>
          </div>
          {#if draft.mastery}
            <p class="mastery-rule">{MASTERY_INFO[draft.mastery].descDe}</p>
          {/if}
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

        {:else if structuralType(draft) === 'armor'}
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

      <!-- Open5e-v2-Import (Ausrüstung + Magie) -->
      <div class="edit-section api-section">
        <DndApiSearch
          label="Aus Open5e laden"
          placeholder="Name suchen (englisch)…"
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
  <AiEditModal
    entityName={draft.name_de || draft.name || 'Gegenstand'}
    buildAction={() => editItemAction($state.snapshot(draft) as Item)}
    onresult={applyAiResult}
    onclose={() => (showAiModal = false)}
  />
{/if}

{#if showTranslateModal && draft}
  <TranslateModal
    entityName={draft.name_de || draft.name || 'Gegenstand'}
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
    font-size: 0.84rem; line-height: 1.6; color: var(--ink); white-space: pre-wrap;
  }
  .item-card-view .desc.muted { color: var(--border); }
  .item-card-view .desc-orig { padding: 0 1.2rem 0.5rem; }
  .item-card-view .desc-orig summary {
    font-size: 0.72rem; color: var(--ink-muted); cursor: pointer; user-select: none;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .item-card-view .desc-orig-body {
    margin-top: 0.4rem; font-size: 0.8rem; color: var(--ink-muted); line-height: 1.55;
    font-style: italic; white-space: pre-wrap;
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

  /* Regeltext der gewählten Meisterschaft — im Editor direkt unter dem Select,
     linksbündig zur Wertespalte der .prop-row (7.5rem Label + 0.5rem gap). */
  .mastery-rule {
    margin: -0.2rem 0 0.1rem 8rem;
    font-size: 0.78rem; line-height: 1.5; font-style: italic; color: var(--ink-muted);
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
