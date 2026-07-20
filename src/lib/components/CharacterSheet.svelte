<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { PDFDocument } from 'pdf-lib';
  import { open as openFileDialog, save as saveFileDialog } from '@tauri-apps/plugin-dialog';
  import { parseCharacterData, emptySpells, SKILL_DEFS, type CharacterData, type CharacterJSON } from '../pdf/characterFields';
  import { exportCharacterToPdf } from '../pdf/characterExport';
  import { createCardEditor } from '../editor/cardEditor.svelte';
  import { parseCharacter } from '../utils/schemaValidation';
  import type { Character } from '../schemas/character';
  import EditorPanel from './EditorPanel.svelte';
  import CharacterEditForm from './CharacterEditForm.svelte';
  import RichTextEditor from './RichTextEditor.svelte';
  import SpellTooltip from './SpellTooltip.svelte';
  import { activeFile, invalidateVault } from '../stores/campaign';
  import { getSpellLibrary, loadSpellByPath, SCHOOL_COLORS, type SpellInfo } from '../spellLibrary';
  import {
    getItemsByDir, displayName, CATEGORY_COLORS, DIR_TO_CATEGORY,
    formatCost, formatRarity, formatDamageDice, ftToM, structuralType,
    DAMAGE_TYPE_LABELS, PROPERTY_LABELS, WEAPON_CATEGORY_LABELS, WEAPON_RANGE_LABELS, ARMOR_CATEGORY_LABELS,
    type ItemInfo,
  } from '../itemLibrary';
  import { prepareMultiSpellPrint } from '../utils/printSpell';
  import { lineWeightKg, totalWeightKg, formatKg } from '../utils/inventoryWeight';
  import type { Spell, Item } from '../types';

  interface Props {
    dirPath: string;   // z.B. "./vault/characters/carric_galanodel"
  }

  let { dirPath }: Props = $props();

  // Karten-Editor-Fundament: besitzt Laden (character.json via activeFile), Dirty-
  // Tracking, Speichern (kein Sprung zur Bogen-Ansicht), JSON-Tab, Navigations-Guard.
  const ed = createCardEditor<Character>({
    type: 'character',
    label: 'Charakter',
    parse: (content) => {
      const r = parseCharacter(JSON.parse(content));
      return r.ok ? r.data : null;
    },
    onSaved: () => invalidateVault(),
  });
  // Read-only-Sicht auf den Draft für die Bogen-Anzeige.
  // (Der Bearbeiten-Tab bindet ed.draft direkt und mutiert ihn in place.)
  const character = $derived(ed.draft);
  // Quelle der PDF-Import-Metadaten (nicht editierbar).
  const pdfName = $derived(character?._importedFrom ?? '');

  let gmNotes = $state('');
  let gmNotesSaving = $state<'saved' | 'saving' | 'unsaved'>('saved');
  let freitext = $state('');
  let freitextSaving = $state<'saved' | 'saving' | 'unsaved'>('saved');
  let error = $state('');
  let importingPdf = $state(false);
  let exportingPdf = $state(false);
  let portraitUrl = $state('');
  let spellLibrary = $state<SpellInfo[]>([]);
  let itemLoadedByDir = $state<Record<string, ItemInfo[]>>({});

  $effect(() => {
    const file = character?.portraitFile;
    if (!file) { portraitUrl = ''; return; }
    invoke<string>('read_file_base64', { path: `${dirPath}/${file}` })
      .then(b64 => {
        const mime = file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        portraitUrl = `data:${mime};base64,${b64}`;
      })
      .catch(() => { portraitUrl = ''; });
  });

  $effect(() => { getSpellLibrary().then(lib => { spellLibrary = lib; }); });

  $effect(() => {
    Promise.all(
      Object.keys(DIR_TO_CATEGORY).map(dir =>
        getItemsByDir(dir).then(items => ({ dir, items }))
      )
    ).then(results => {
      const map: Record<string, ItemInfo[]> = {};
      for (const { dir, items } of results) map[dir] = items;
      itemLoadedByDir = map;
    });
  });

  const itemByName = $derived(
    Object.values(itemLoadedByDir).flat().reduce<Record<string, ItemInfo>>((acc, item) => {
      acc[displayName(item).toLowerCase()] = item;
      if (item.name_de) acc[item.name.toLowerCase()] = item;
      return acc;
    }, {})
  );

  // ─── Item-Volldata-Cache + Tooltip ──────────────────────
  let itemDataRecord = $state<Record<string, Item | null>>({});
  let tooltipItem = $state<Item | null>(null);
  let tooltipX = $state(0);
  let tooltipY = $state(0);

  $effect(() => {
    if (!character) return;
    for (const invItem of character.inventory) {
      const libItem = itemByName[invItem.name.toLowerCase()];
      if (libItem && !(libItem.path in itemDataRecord)) {
        itemDataRecord[libItem.path] = null;
        invoke<string>('read_file_content', { path: libItem.path })
          .then(content => { itemDataRecord[libItem.path] = JSON.parse(content) as Item; })
          .catch(() => {});
      }
    }
  });

  function showItemTooltip(e: MouseEvent, libItem: ItemInfo) {
    const data = itemDataRecord[libItem.path];
    if (!data) return;
    tooltipItem = data;
    updateTooltipPos(e);
  }
  function updateTooltipPos(e: MouseEvent) {
    tooltipX = e.clientX + 14;
    tooltipY = e.clientY + 14;
  }
  function hideItemTooltip() { tooltipItem = null; }

  function openItemPage(libItem: ItemInfo) {
    const name = libItem.path.split('/').pop()?.replace('.json', '') ?? libItem.name;
    activeFile.set({ name, path: libItem.path, type: 'item' });
  }

  function openSpellPage(spellName: string) {
    const info = spellInfoMap.get(spellName);
    if (!info?.path) return;
    const name = info.path.split('/').pop()?.replace('.json', '') ?? spellName;
    activeFile.set({ name, path: info.path, type: 'spell' });
  }

  function inlineWeaponInfo(item: Item): string {
    if (!item.damage) return '';
    const dice = formatDamageDice(item.damage.damage_dice);
    const typeKey = item.damage.damage_type.index;
    const typeLabel = (DAMAGE_TYPE_LABELS[typeKey] ?? item.damage.damage_type.name).replace('schaden', '');
    let s = `${dice} ${typeLabel}`;
    if (item.two_handed_damage) {
      const d2 = formatDamageDice(item.two_handed_damage.damage_dice);
      s += ` / ${d2}`;
    }
    return s;
  }

  function tooltipProperties(item: Item): string {
    return (item.properties ?? [])
      .map(p => PROPERTY_LABELS[p.index] ?? p.name)
      .join(', ');
  }

  const spellInfoMap = $derived(new Map(spellLibrary.map(s => [s.name, s])));
  const spellSchoolMap = $derived(new Map(spellLibrary.map(s => [s.name, s.school])));
  function spellColor(name: string): string {
    const school = spellSchoolMap.get(name);
    return school ? (SCHOOL_COLORS[school] ?? '') : '';
  }

  // ─── Zauber-Daten-Cache + Hover-Tooltip (analog Item-Tooltip) ────────
  let spellDataCache = $state(new Map<string, Spell | null>());
  let spellTooltip = $state<Spell | null>(null);

  // Alle Zauber des Charakters vorab laden, damit beim Hover sofort ein
  // Tooltip erscheint (kein Toggle, kein Ladezustand).
  $effect(() => {
    const spells = character?.spells;
    if (!spells) return;
    const names = [
      ...(spells.cantrips ?? []),
      ...['1','2','3','4','5','6','7','8','9'].flatMap(
        lvl => (spells.byLevel[lvl] ?? []).map(s => s.name)
      ),
    ];
    for (const name of names) {
      if (spellDataCache.has(name)) continue;
      const info = spellInfoMap.get(name);
      if (!info?.path) continue;
      spellDataCache.set(name, null);  // als „in Arbeit" markieren
      spellDataCache = new Map(spellDataCache);
      loadSpellByPath(info.path).then(data => {
        spellDataCache.set(name, data);
        spellDataCache = new Map(spellDataCache);
      });
    }
  });

  function showSpellTooltip(e: MouseEvent, name: string) {
    const data = spellDataCache.get(name);
    if (!data) return;
    spellTooltip = data;
    updateTooltipPos(e);
  }
  function hideSpellTooltip() { spellTooltip = null; }

  const SCHOOL_LABELS: Record<string, string> = {
    abjuration: 'Bannmagie', conjuration: 'Beschwörung', divination: 'Erkenntnismagie',
    enchantment: 'Verzauberung', evocation: 'Hervorrufung', illusion: 'Illusionsmagie',
    necromancy: 'Nekromantie', transmutation: 'Verwandlung',
  };

  let printingSpells = $state(false);

  async function printSpellList() {
    const char = character;
    const spells = char?.spells;
    if (!spells) return;
    printingSpells = true;

    try {
      // Alle Zaubernamen sammeln: Zaubertricks + Stufe 1-9
      const names: string[] = [
        ...(spells.cantrips ?? []),
        ...(['1','2','3','4','5','6','7','8','9'].flatMap(
          lvl => (spells.byLevel[lvl] ?? []).map(s => s.name)
        )),
      ];

      // Für jeden Namen: Pfad aus Index, dann Daten laden (Cache nutzen)
      const spellObjects: Spell[] = [];
      for (const name of names) {
        let data = spellDataCache.get(name) ?? null;
        if (!data) {
          const info = spellInfoMap.get(name);
          if (info?.path) {
            data = await loadSpellByPath(info.path);
            spellDataCache.set(name, data);
            spellDataCache = new Map(spellDataCache);
          }
        }
        if (data) spellObjects.push(data);
      }

      if (!spellObjects.length) return;

      const html = prepareMultiSpellPrint(spellObjects, document);
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument!;
      doc.open(); doc.write(html); doc.close();
      const charName = char.name || 'Charakter';
      setTimeout(() => {
        const prev = document.title;
        document.title = `${charName} – Zauberkarten`;
        iframe.contentWindow!.focus();
        iframe.contentWindow!.print();
        document.title = prev;
        setTimeout(() => document.body.removeChild(iframe), 2000);
      }, 0);
    } finally {
      printingSpells = false;
    }
  }

  const gmNotesPath = $derived(`${dirPath}/gm-notes.md`);
  const detailsPath = $derived(`${dirPath}/details.md`);
  const legacyDetailsPath = $derived(`${dirPath}/freitext.md`);  // Migration: altes Format
  const jsonPath = $derived(`${dirPath}/character.json`);

  // GM-Notizen & Details laden, wenn der Charakter (dirPath) wechselt.
  // character.json selbst lädt der Karten-Editor (ed) über activeFile.
  $effect(() => {
    const dir = dirPath;
    if (!dir) return;
    if (freitextTimer) { clearTimeout(freitextTimer); freitextTimer = null; }
    if (gmNotesTimer) { clearTimeout(gmNotesTimer); gmNotesTimer = null; }
    error = '';
    loadSideFiles();
  });

  async function loadSideFiles() {
    // GM-Notizen laden (oder aus Template anlegen).
    try {
      gmNotes = await invoke<string>('read_file_content', { path: gmNotesPath });
    } catch {
      let tmpl = '';
      try {
        tmpl = await invoke<string>('read_file_content', { path: './vault/templates/character.md' });
      } catch { /* kein Template */ }
      gmNotes = `# GM-Notizen: ${character?.name ?? ''}\n\n` + (tmpl || `## Hintergrund\n\n## Geheimnisse & Hooks\n\n## Verbindungen\n\n## Entwicklung\n\n## DM-Notizen\n`);
      await invoke('write_file_content', { path: gmNotesPath, content: gmNotes });
    }

    // Details laden (optional — leer, wenn noch nicht vorhanden).
    // Migration: alte freitext.md weiterlesen, solange noch keine details.md existiert.
    try {
      freitext = await invoke<string>('read_file_content', { path: detailsPath });
    } catch {
      try {
        freitext = await invoke<string>('read_file_content', { path: legacyDetailsPath });
      } catch {
        freitext = '';
      }
    }
    freitextSaving = 'saved';
    gmNotesSaving = 'saved';
  }

  async function importPdfIntoExisting() {
    if (!character) return;
    const defaultPath = await invoke<string>('get_absolute_path', { path: dirPath }).catch(() => undefined);
    const selected = await openFileDialog({
      multiple: false,
      defaultPath,
      filters: [{ name: 'PDF Charakterbogen', extensions: ['pdf'] }],
    });
    if (!selected) return;

    importingPdf = true;
    error = '';
    try {
      const path = selected as string;
      const base64 = await invoke<string>('read_file_base64', { path });
      const bytes = base64ToBytes(base64);
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const form = pdf.getForm();

      const fields: Record<string, string> = {};
      for (const field of form.getFields()) {
        const n = field.getName();
        try { fields[n] = form.getTextField(n).getText() ?? ''; }
        catch { try { fields[n] = form.getCheckBox(n).isChecked() ? 'On' : 'Off'; } catch { fields[n] = ''; } }
      }

      const imported = parseCharacterData(fields);
      // Zauber aus dem aktuellen Charakter behalten (manuell gepflegt)
      imported.spells = character?.spells ?? emptySpells();

      const pdfFilename = (selected as string).split(/[/\\]/).pop() ?? '';
      const json: CharacterJSON = {
        ...imported,
        _version: 1,
        _importedFrom: pdfFilename,
        _importedAt: new Date().toISOString(),
      };
      const content = JSON.stringify(json, null, 2);
      await invoke('write_file_content', { path: jsonPath, content });
      // In den Editor übernehmen (Draft + Baseline → nicht „dirty").
      ed.applyContent(content);
    } catch (e) {
      error = `PDF-Import fehlgeschlagen: ${e}`;
    } finally {
      importingPdf = false;
    }
  }

  async function exportToPdf() {
    if (!character) return;
    exportingPdf = true;
    error = '';
    try {
      const templateB64 = await invoke<string>('read_file_base64', { path: './vault/templates/ataendler_v2.8.2.pdf' });
      const templateBytes = base64ToBytes(templateB64);
      const json = {
        _version: 1 as const,
        _importedFrom: pdfName || undefined,
        _importedAt: new Date().toISOString(),
        ...character,
      };

      // Portrait laden, falls vorhanden
      let portrait: { bytes: Uint8Array; format: 'png' | 'jpg' } | undefined;
      if (character.portraitFile) {
        try {
          const portraitB64 = await invoke<string>('read_file_base64', {
            path: `${dirPath}/${character.portraitFile}`,
          });
          portrait = {
            bytes: base64ToBytes(portraitB64),
            format: character.portraitFile.toLowerCase().endsWith('.png') ? 'png' : 'jpg',
          };
        } catch { /* Portrait nicht ladbar → ohne weitermachen */ }
      }

      const pdfBytes = await exportCharacterToPdf(json, templateBytes, { portrait, freitext });
      const b64 = bytesToBase64(pdfBytes);
      const safeName = character.name.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_') || 'charakter';
      // Ziel per Datei-Speichern-Dialog wählen.
      const target = await saveFileDialog({
        defaultPath: `${safeName}-export.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (!target) return;
      await invoke('write_file_base64', { path: target, data: b64 });
    } catch (e) {
      error = `PDF-Export fehlgeschlagen: ${e}`;
    } finally {
      exportingPdf = false;
    }
  }

  // ─── GM-Notizen (auto-save mit Debounce, wie Details) ─────────────────────
  let gmNotesTimer: ReturnType<typeof setTimeout> | null = null;

  async function writeGmNotes(path: string, content: string) {
    try {
      gmNotesSaving = 'saving';
      await invoke('write_file_content', { path, content });
      gmNotesSaving = 'saved';
    } catch {
      gmNotesSaving = 'unsaved';
    }
  }

  function onGmNotesChange(md: string) {
    gmNotes = md;
    gmNotesSaving = 'unsaved';
    const path = gmNotesPath;
    if (gmNotesTimer) clearTimeout(gmNotesTimer);
    gmNotesTimer = setTimeout(() => writeGmNotes(path, md), 800);
  }

  // ─── Freitext (auto-save mit Debounce, wie der Kampagnen-Editor) ──────────
  let freitextTimer: ReturnType<typeof setTimeout> | null = null;

  // Pfad beim Planen festhalten, damit ein noch laufender Timer nach einem
  // Charakterwechsel nicht den falschen Charakter überschreibt.
  async function writeFreitext(path: string, content: string) {
    try {
      freitextSaving = 'saving';
      await invoke('write_file_content', { path, content });
      freitextSaving = 'saved';
    } catch {
      freitextSaving = 'unsaved';
    }
  }

  function onFreitextChange(md: string) {
    freitext = md;
    freitextSaving = 'unsaved';
    const path = detailsPath;
    if (freitextTimer) clearTimeout(freitextTimer);
    freitextTimer = setTimeout(() => writeFreitext(path, md), 800);
  }

  function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function bytesToBase64(bytes: Uint8Array): string {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  function sign(n: number): string {
    return n >= 0 ? `+${n}` : `${n}`;
  }

  const ATTR_LABEL: Record<string, string> = { str: 'STR', ges: 'GES', kon: 'KON', int: 'INT', wei: 'WEI', cha: 'CHA' };
  const skillAttrMap = new Map(SKILL_DEFS.map(s => [s.key, s.attr]));
  const skillLabelMap = new Map(SKILL_DEFS.map(s => [s.key, s.label]));

  function row(label: string, val: string | number): string {
    const v = typeof val === 'number' ? sign(val) : val;
    return `<span class="tip-row"><span class="tip-lbl">${label}</span><span class="tip-val">${v}</span></span>`;
  }
  function divider(): string { return `<span class="tip-div"></span>`; }
  function total(val: string | number): string {
    const v = typeof val === 'number' ? sign(val) : val;
    return `<span class="tip-row tip-total"><span class="tip-lbl"></span><span class="tip-val">${v}</span></span>`;
  }
  function step(label: string): string { return `<span class="tip-step">${label}</span>`; }

  function attrModTip(attr: string, score: number): string {
    const m = Math.floor((score - 10) / 2);
    return row(attr, String(score)) + step('− 10') + step('÷ 2') + divider() + total(m);
  }

  function saveTip(modKey: string, attrLabel: string, proficient: boolean): string {
    if (!character) return '';
    const attrMod = (character as any)[modKey] as number;
    const pb = character.proficiencyBonus;
    if (proficient) return row(`${attrLabel}-Mod`, attrMod) + row('Übungsbonus', pb) + divider() + total(attrMod + pb);
    return row(`${attrLabel}-Mod`, attrMod) + divider() + total(attrMod);
  }

  function skillTip(name: string, skill: { value: number; prof: boolean; exp: boolean }): string {
    if (!character) return '';
    const attr = skillAttrMap.get(name);
    if (!attr) return '';
    const attrLabel = ATTR_LABEL[attr] ?? attr.toUpperCase();
    const attrMod = (character as any)[`${attr}Mod`] as number;
    const pb = character.proficiencyBonus;
    if (skill.exp) return row(`${attrLabel}-Mod`, attrMod) + row('2× Übungsbonus', pb * 2) + divider() + total(skill.value);
    if (skill.prof) return row(`${attrLabel}-Mod`, attrMod) + row('Übungsbonus', pb) + divider() + total(skill.value);
    if (character.alleskoenner) return row(`${attrLabel}-Mod`, attrMod) + row('½ Übungsbonus', Math.floor(pb / 2)) + divider() + total(skill.value);
    return row(`${attrLabel}-Mod`, attrMod) + divider() + total(attrMod);
  }

  function attackBonusTip(bonus: string): string {
    return row('Angriffswurf', '1W20 + ' + bonus) + row('gegen', 'RK des Ziels');
  }
  function attackDamageTip(damage: string, type: string): string {
    return row('Schaden', damage) + (type ? row('Typ', type) : '');
  }

  const ATTRS = [
    { key: 'str', label: 'STR', mod: 'strMod' },
    { key: 'ges', label: 'GES', mod: 'gesMod' },
    { key: 'kon', label: 'KON', mod: 'konMod' },
    { key: 'int', label: 'INT', mod: 'intMod' },
    { key: 'wei', label: 'WEI', mod: 'weiMod' },
    { key: 'cha', label: 'CHA', mod: 'chaMod' },
  ] as const;

  const SAVES = [
    { label: 'STR', modKey: 'strMod', profKey: 'strSaveProf' },
    { label: 'GES', modKey: 'gesMod', profKey: 'gesSaveProf' },
    { label: 'KON', modKey: 'konMod', profKey: 'konSaveProf' },
    { label: 'INT', modKey: 'intMod', profKey: 'intSaveProf' },
    { label: 'WEI', modKey: 'weiMod', profKey: 'weiSaveProf' },
    { label: 'CHA', modKey: 'chaMod', profKey: 'chaSaveProf' },
  ] as const;

  const LEVEL_LABEL: Record<string, string> = {
    '1': 'Stufe 1', '2': 'Stufe 2', '3': 'Stufe 3', '4': 'Stufe 4', '5': 'Stufe 5',
    '6': 'Stufe 6', '7': 'Stufe 7', '8': 'Stufe 8', '9': 'Stufe 9',
  };
</script>

<div class="sheet">
  {#if error}
    <div class="error">{error}</div>
  {:else if character}
    <!-- Header (bleibt über allen Tabs sichtbar) -->
    <div class="header">
      {#if portraitUrl}
        <img class="portrait-thumb" src={portraitUrl} alt="Portrait von {character.name}" />
      {/if}
      <div class="name-block">
        <h1>{character.name}</h1>
        <span class="sub">{character.classLevel} · {character.race}</span>
      </div>
      <div class="header-meta">
        <span>Spieler: <strong>{character.playerName}</strong></span>
        <span>Hintergrund: <strong>{character.background}</strong></span>
        <span>EP: <strong>{character.xp}</strong></span>
      </div>
      <div class="header-actions">
        {#snippet pdfIcon()}
          <svg viewBox="0 0 24 24" width="16" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/>
            <text x="11.5" y="18.5" font-size="6.5" font-weight="700" fill="currentColor" stroke="none" text-anchor="middle" font-family="sans-serif">PDF</text>
          </svg>
        {/snippet}
        <button class="icon-btn import" class:busy={importingPdf} onclick={importPdfIntoExisting} disabled={importingPdf}
                aria-label="PDF importieren" title="PDF importieren, aktuelle Werte überschreiben">
          <span class="arrow">&rarr;</span>{@render pdfIcon()}
        </button>
        <button class="icon-btn export" class:busy={exportingPdf} onclick={exportToPdf} disabled={exportingPdf}
                aria-label="Als PDF exportieren" title="Ausgefülltes ATaendler-PDF exportieren">
          {@render pdfIcon()}<span class="arrow">&rarr;</span>
        </button>
      </div>
    </div>

    <EditorPanel
      bind:tab={ed.tab}
      dirty={ed.dirty}
      saveError={ed.saveError}
      onsave={() => ed.save()}
      ondiscard={() => ed.discard()}
      onsavejson={(json) => ed.saveJson(json)}
      getJson={() => ed.draft ? JSON.stringify(ed.draft, null, 2) : ed.lastSavedContent}
      extraTabs={[{ id: 'details', label: 'Details' }, { id: 'notes', label: 'GM-Notizen' }]}
      style="--ep-accent: var(--arcane)"
    >
      {#snippet karte()}
      <div class="content">
        <!-- Attribute -->
        <div class="section attributes">
          {#each ATTRS as attr}
            <div class="attr-box">
              <div class="attr-label">{attr.label}</div>
              <div class="has-tip attr-mod">
                {sign((character as any)[attr.mod])}
                <span class="tip">{@html attrModTip(attr.label, (character as any)[attr.key])}</span>
              </div>
              <div class="attr-score">{(character as any)[attr.key]}</div>
            </div>
          {/each}
        </div>

        <div class="two-col">
          <!-- Kampfwerte -->
          <div class="section">
            <h3>Kampf</h3>
            <div class="stats-grid">
              <div class="stat"><span class="sl">RK</span><span class="sv">{character.ac}</span></div>
              <div class="stat"><span class="sl">Initiative</span><span class="sv">{character.initiative}</span></div>
              <div class="stat"><span class="sl">Bewegung</span><span class="sv">{character.speed}m</span></div>
              <div class="stat"><span class="sl">TP max</span><span class="sv">{character.hpMax}</span></div>
              <div class="stat"><span class="sl">TP aktuell</span><span class="sv">{character.hpCurrent || '—'}</span></div>
              <div class="stat"><span class="sl">Temp. TP</span><span class="sv">{character.hpTemp || '—'}</span></div>
              <div class="stat"><span class="sl">Trefferwürfel</span><span class="sv">{character.hitDice}</span></div>
              <div class="stat"><span class="sl">Übungsbonus</span><span class="sv">{sign(character.proficiencyBonus)}</span></div>
              <div class="stat"><span class="sl">Passiv Wahr.</span><span class="sv">{character.passivePerception}</span></div>
            </div>

            {#if character.attacks.length}
              <h3>Angriffe</h3>
              <table class="attack-table">
                <thead><tr><th>Waffe</th><th>Bonus</th><th>Schaden</th><th>RW</th></tr></thead>
                <tbody>
                  {#each character.attacks as atk}
                    <tr>
                      <td>{atk.name}</td>
                      <td class="has-tip">
                        {atk.bonus}
                        <span class="tip tip-left">{@html attackBonusTip(atk.bonus)}</span>
                      </td>
                      <td class="has-tip">
                        {atk.damage} {atk.type}
                        <span class="tip tip-left">{@html attackDamageTip(atk.damage, atk.type)}</span>
                      </td>
                      <td>{atk.range || '—'}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </div>

          <!-- Rettungswürfe -->
          <div class="section">
            <h3>Rettungswürfe</h3>
            <div class="save-list">
              {#each SAVES as save}
                {@const proficient = (character as any)[save.profKey]}
                {@const value = (character as any)[save.modKey] + (proficient ? character.proficiencyBonus : 0)}
                <div class="save-row has-tip" class:proficient>
                  <span class="prof-dot">{proficient ? '●' : '○'}</span>
                  <span class="save-label">{save.label}</span>
                  <span class="save-val">{sign(value)}</span>
                  <span class="tip tip-left">{@html saveTip(save.modKey, save.label, proficient)}</span>
                </div>
              {/each}
            </div>

            <h3>Sprachen</h3>
            <div class="tag-list">
              {#each character.languages as lang}<span class="tag">{lang}</span>{/each}
            </div>

            {#if character.tools.length}
              <h3>Werkzeuge</h3>
              <div class="tag-list">
                {#each character.tools as tool}<span class="tag">{tool}</span>{/each}
              </div>
            {/if}

            {#if character.proficiencies}
              {@const pf = character.proficiencies}
              {@const anyProf = pf.simpleWeapons || pf.martialWeapons || pf.lightArmor || pf.mediumArmor || pf.heavyArmor || pf.shields || (pf.otherWeapons && pf.otherWeapons.trim())}
              {#if anyProf}
                <h3>Profizienzen</h3>
                <div class="tag-list">
                  {#if pf.simpleWeapons}<span class="tag">Einfache Waffen</span>{/if}
                  {#if pf.martialWeapons}<span class="tag">Kriegswaffen</span>{/if}
                  {#if pf.lightArmor}<span class="tag">Leichte Rüstung</span>{/if}
                  {#if pf.mediumArmor}<span class="tag">Mittlere Rüstung</span>{/if}
                  {#if pf.heavyArmor}<span class="tag">Schwere Rüstung</span>{/if}
                  {#if pf.shields}<span class="tag">Schilde</span>{/if}
                </div>
                {#if pf.otherWeapons && pf.otherWeapons.trim()}
                  <p class="prof-extra"><strong>Weitere Waffen:</strong> {pf.otherWeapons}</p>
                {/if}
              {/if}
            {/if}
          </div>
        </div>

        <!-- Fertigkeiten -->
        <div class="section">
          <h3>Fertigkeiten {character.alleskoenner ? '<small>(Alleskönner)</small>' : ''}</h3>
          <div class="skill-grid">
            {#each Object.entries(character.skills) as [name, skill]}
              <div class="skill-row has-tip" class:proficient={skill.prof} class:expertise={skill.exp}>
                <span class="prof-dot">{skill.exp ? '★' : skill.prof ? '●' : '○'}</span>
                <span class="skill-name">{skillLabelMap.get(name) ?? name}</span>
                <span class="skill-val">{sign(skill.value)}</span>
                <span class="tip">{@html skillTip(name, skill)}</span>
              </div>
            {/each}
          </div>
        </div>

        <!-- Persönlichkeit & Klassenmerkmale -->
        <div class="two-col">
          <div class="section">
            <h3>Persönlichkeit</h3>
            {#if character.traits}<p><strong>Merkmale:</strong> {character.traits}</p>{/if}
            {#if character.ideals}<p><strong>Ideale:</strong> {character.ideals}</p>{/if}
            {#if character.bonds}<p><strong>Bindungen:</strong> {character.bonds}</p>{/if}
            {#if character.flaws}<p><strong>Makel:</strong> {character.flaws}</p>{/if}
          </div>
          <div class="section">
            <h3>Klassenmerkmale</h3>
            <p class="preformatted">{character.classFeatures}</p>
          </div>
        </div>

        <!-- Persönliches -->
        {#if character.personal}
          {@const p = character.personal}
          {@const hasAnyPersonal = p.alter || p.geschlecht || p.sizeCat || p.koerpergroesse || p.gewicht || p.gesinnung || p.glaube || p.lebensstil || p.taeglicheKosten || p.augenfarbe || p.haarfarbe || p.hautfarbe || p.aussehen || p.rassenmerkmale}
          {#if hasAnyPersonal}
            <div class="two-col">
              <div class="section">
                <h3>Persönliches</h3>
                <div class="personal-stats">
                  {#if p.alter}<div class="stat"><span class="sl">Alter</span><span class="sv">{p.alter}</span></div>{/if}
                  {#if p.geschlecht}<div class="stat"><span class="sl">Geschlecht</span><span class="sv">{p.geschlecht}</span></div>{/if}
                  {#if p.gesinnung}<div class="stat"><span class="sl">Gesinnung</span><span class="sv">{p.gesinnung}</span></div>{/if}
                  {#if p.glaube}<div class="stat"><span class="sl">Glaube</span><span class="sv">{p.glaube}</span></div>{/if}
                  {#if p.sizeCat}<div class="stat"><span class="sl">Größe</span><span class="sv">{p.sizeCat}</span></div>{/if}
                  {#if p.koerpergroesse}<div class="stat"><span class="sl">Körpergröße</span><span class="sv">{p.koerpergroesse}</span></div>{/if}
                  {#if p.gewicht}<div class="stat"><span class="sl">Gewicht</span><span class="sv">{p.gewicht}</span></div>{/if}
                  {#if p.augenfarbe}<div class="stat"><span class="sl">Augen</span><span class="sv">{p.augenfarbe}</span></div>{/if}
                  {#if p.haarfarbe}<div class="stat"><span class="sl">Haar</span><span class="sv">{p.haarfarbe}</span></div>{/if}
                  {#if p.hautfarbe}<div class="stat"><span class="sl">Haut</span><span class="sv">{p.hautfarbe}</span></div>{/if}
                  {#if p.lebensstil}<div class="stat"><span class="sl">Lebensstil</span><span class="sv">{p.lebensstil}</span></div>{/if}
                  {#if p.taeglicheKosten}<div class="stat"><span class="sl">Tägl. Kosten</span><span class="sv">{p.taeglicheKosten}</span></div>{/if}
                </div>
                {#if p.aussehen}<p class="preformatted"><strong>Aussehen:</strong> {p.aussehen}</p>{/if}
              </div>
              {#if p.rassenmerkmale}
                <div class="section">
                  <h3>Volksmerkmale</h3>
                  <p class="preformatted">{p.rassenmerkmale}</p>
                </div>
              {/if}
            </div>
          {/if}
        {/if}

        <!-- Inventar -->
        <div class="section">
          <h3>Inventar</h3>
          <div class="currency-row">
            {#each [['KM','Kupfer'],['SM','Silber'],['EM','Elektrum'],['GM','Gold'],['PM','Platin']] as [key, label]}
              {@const val = (character.currency as any)[key.toLowerCase()]}
              <div class="coin" class:empty={!val}>
                <span class="coin-val">{val || '—'}</span>
                <span class="coin-lbl">{key}</span>
              </div>
            {/each}
          </div>

          {#if character.inventory.length}
            <table class="inv-table">
              <thead><tr><th>Gegenstand</th><th>Anz.</th><th>Gew.</th></tr></thead>
              <tbody>
                {#each character.inventory as item}
                  {@const libItem = itemByName[item.name.toLowerCase()]}
                  {@const fullItem = libItem ? itemDataRecord[libItem.path] : null}
                  <tr
                    class:inv-linked={!!libItem}
                    onclick={() => libItem && openItemPage(libItem)}
                    onmouseenter={(e) => libItem && showItemTooltip(e, libItem)}
                    onmousemove={(e) => tooltipItem && updateTooltipPos(e)}
                    onmouseleave={hideItemTooltip}
                  >
                    <td>
                      {#if libItem}
                        <span class="inv-dot" style="background:{CATEGORY_COLORS[libItem.category] ?? 'var(--border-strong)'}"></span>
                      {/if}
                      {libItem ? displayName(libItem) : item.name}
                      {#if fullItem && structuralType(fullItem) === 'weapon' && fullItem.damage}
                        <span class="inv-weapon-info">{inlineWeaponInfo(fullItem)}</span>
                      {:else if fullItem && structuralType(fullItem) === 'armor' && fullItem.armor_class}
                        <span class="inv-weapon-info">RK {fullItem.armor_class.base}{fullItem.armor_class.dex_bonus ? '+GES' : ''}</span>
                      {:else if fullItem?.rarity}
                        <span class="inv-weapon-info">{formatRarity(fullItem.rarity)}</span>
                      {/if}
                    </td>
                    <td class="num">{item.count || '—'}</td>
                    <td class="num">{lineWeightKg(item) > 0 ? formatKg(lineWeightKg(item)) + ' kg' : '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
            {#if totalWeightKg(character.inventory) > 0}
              <div class="weight-total">Gesamtlast: <strong>{formatKg(totalWeightKg(character.inventory))} kg</strong></div>
            {/if}
          {:else}
            <span class="empty-hint">Kein Inventar eingetragen</span>
          {/if}

          {#if character.inventoryNotes}
            <p class="preformatted" style="margin-top: 0.5rem">{character.inventoryNotes}</p>
          {/if}
        </div>

        <!-- Zauber -->
        {#if character.spells?.cantrips.length || Object.keys(character.spells?.byLevel ?? {}).length || character.spells?.spellcastingClass}
          <div class="section">
            <div class="section-head-row">
              <h3>Zauberwirken</h3>
              <button class="btn-spell-pdf" onclick={printSpellList} disabled={printingSpells}
                title="Alle Zauber als druckbare Karten (A6, 9/Seite)">
                {printingSpells ? '…' : '🖨 PDF'}
              </button>
            </div>
            {#if character.spells.spellcastingClass || character.spells.saveDC}
              <div class="stats-grid" style="margin-bottom:0.6rem">
                {#if character.spells.spellcastingClass}<div class="stat"><span class="sl">Klasse</span><span class="sv">{character.spells.spellcastingClass}</span></div>{/if}
                {#if character.spells.spellcastingAbility}<div class="stat"><span class="sl">Fähigkeit</span><span class="sv">{character.spells.spellcastingAbility}</span></div>{/if}
                {#if character.spells.saveDC}<div class="stat"><span class="sl">Zauber-SG</span><span class="sv">{character.spells.saveDC}</span></div>{/if}
                {#if character.spells.attackBonus}<div class="stat"><span class="sl">Angriffsbonus</span><span class="sv">{sign(character.spells.attackBonus)}</span></div>{/if}
              </div>
            {/if}

            {#if character.spells.cantrips.length}
              <div class="spell-level-header"><span>Zaubertricks</span></div>
              <div class="spell-cards">
                {#each character.spells.cantrips as name}
                  {@const info = spellInfoMap.get(name)}
                  {@const color = spellColor(name)}
                  <div class="scard" class:scard-linked={!!info?.path}
                    style="--sc:{color || 'var(--border-strong)'}"
                    role="button" tabindex="0"
                    onclick={() => openSpellPage(name)}
                    onkeydown={(e) => e.key === 'Enter' && openSpellPage(name)}
                    onmouseenter={(e) => showSpellTooltip(e, name)}
                    onmousemove={(e) => spellTooltip && updateTooltipPos(e)}
                    onmouseleave={hideSpellTooltip}>
                    <div class="scard-head">
                      <span class="scard-name">{name}</span>
                      <span class="scard-badges">
                        {#if info?.school}<span class="scard-school">{SCHOOL_LABELS[info.school] ?? info.school}</span>{/if}
                      </span>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            {#each ['1','2','3','4','5','6','7','8','9'] as lvl}
              {@const slots = character.spells.slots[Number(lvl) - 1]}
              {@const lvlSpells = character.spells.byLevel[lvl] ?? []}
              {#if lvlSpells.length || (slots?.total ?? 0) > 0}
                <div class="spell-level-header">
                  <span>{LEVEL_LABEL[lvl]}</span>
                  {#if slots?.total}
                    <span class="slot-badge">{slots.total} Slots</span>
                  {/if}
                </div>
                <div class="spell-cards">
                  {#each lvlSpells as spell}
                    {@const info = spellInfoMap.get(spell.name)}
                    {@const color = spellColor(spell.name)}
                    <div class="scard" class:prepared={spell.prepared} class:scard-linked={!!info?.path}
                      style="--sc:{color || 'var(--border-strong)'}"
                      role="button" tabindex="0"
                      onclick={() => openSpellPage(spell.name)}
                      onkeydown={(e) => e.key === 'Enter' && openSpellPage(spell.name)}
                      onmouseenter={(e) => showSpellTooltip(e, spell.name)}
                      onmousemove={(e) => spellTooltip && updateTooltipPos(e)}
                      onmouseleave={hideSpellTooltip}>
                      <div class="scard-head">
                        <span class="scard-prep">{spell.prepared ? '●' : '○'}</span>
                        <span class="scard-name">{spell.name}</span>
                        <span class="scard-badges">
                          {#if info?.school}<span class="scard-school">{SCHOOL_LABELS[info.school] ?? info.school}</span>{/if}
                        </span>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
      {/snippet}

      {#snippet bearbeiten()}
        <!-- ─── Bearbeiten-Tab ──────────────────────────────────── -->
        <!-- Bei Last-/Verwerfen-Wechsel des Drafts neu aufsetzen, damit das Formular
             frisch aus dem Draft initialisiert (es mutiert ed.draft in place). -->
        {#key ed.draft}
          <div class="edit-wrapper" style="width:100%">
            <CharacterEditForm character={ed.draft!} {dirPath} />
          </div>
        {/key}
      {/snippet}

      {#snippet extra(id)}
      {#if id === 'notes'}
      <!-- GM-Notizen Tab -->
      <div class="freetext-area">
        <div class="freetext-hint">
          <span>Nur für den Spielleiter — wird nicht ans PDF angehängt.</span>
          <span class="freetext-status" class:unsaved={gmNotesSaving === 'unsaved'} class:saving={gmNotesSaving === 'saving'}>
            {gmNotesSaving === 'saving' ? 'Speichert…' : gmNotesSaving === 'unsaved' ? '● ungespeichert' : 'Gespeichert'}
          </span>
        </div>
        <RichTextEditor value={gmNotes} onChange={onGmNotesChange} placeholder="Hintergrund, Geheimnisse, Hooks, Verbindungen, DM-Notizen …" />
      </div>

    {:else}
      <!-- Details Tab (Freitext) — wird beim PDF-Export als weitere Seite(n) angehängt -->
      <div class="freetext-area">
        <div class="freetext-hint">
          <span>Wird beim PDF-Export als zusätzliche Seite(n) angehängt.</span>
          <span class="freetext-status" class:unsaved={freitextSaving === 'unsaved'} class:saving={freitextSaving === 'saving'}>
            {freitextSaving === 'saving' ? 'Speichert…' : freitextSaving === 'unsaved' ? '● ungespeichert' : 'Gespeichert'}
          </span>
        </div>
        <RichTextEditor value={freitext} onChange={onFreitextChange} placeholder="Hintergrundgeschichte, Tagebuch, Notizen … – wird ans PDF angehängt." />
      </div>
      {/if}
      {/snippet}
    </EditorPanel>
  {:else}
    <div class="loading">Lade Charakterbogen…</div>
  {/if}
</div>

{#if tooltipItem}
  <div class="item-tooltip" style="left:{tooltipX}px;top:{tooltipY}px">
    <div class="tt-name">
      {tooltipItem.name_de ?? tooltipItem.name}
      {#if tooltipItem.name_de}
        <span class="tt-name-en">{tooltipItem.name}</span>
      {/if}
      {#if tooltipItem.attunement}
        <span class="tt-badge tt-attune">Einstellung</span>
      {/if}
    </div>

    <div class="tt-meta">
      {#if structuralType(tooltipItem) === 'weapon'}
        {WEAPON_CATEGORY_LABELS[tooltipItem.weapon_category ?? ''] ?? tooltipItem.weapon_category}
        · {WEAPON_RANGE_LABELS[tooltipItem.weapon_range ?? ''] ?? tooltipItem.weapon_range}
      {:else if structuralType(tooltipItem) === 'armor'}
        {ARMOR_CATEGORY_LABELS[tooltipItem.armor_category ?? ''] ?? tooltipItem.armor_category}
      {:else if tooltipItem.rarity}
        {formatRarity(tooltipItem.rarity)}
        {#if tooltipItem.attunement_by}· für {tooltipItem.attunement_by}{/if}
      {/if}
    </div>

    {#if structuralType(tooltipItem) === 'weapon' && tooltipItem.damage}
      <div class="tt-section">
        <span class="tt-label">Schaden</span>
        <span>{formatDamageDice(tooltipItem.damage.damage_dice)}
          {DAMAGE_TYPE_LABELS[tooltipItem.damage.damage_type.index] ?? tooltipItem.damage.damage_type.name}
          {#if tooltipItem.two_handed_damage}
            · Zweihändig: {formatDamageDice(tooltipItem.two_handed_damage.damage_dice)}
          {/if}
        </span>
      </div>
      {#if tooltipItem.range}
        <div class="tt-section">
          <span class="tt-label">Reichweite</span>
          <span>{ftToM(tooltipItem.range.normal)}{tooltipItem.range.long ? ` / ${ftToM(tooltipItem.range.long)}` : ''}</span>
        </div>
      {/if}
      {#if tooltipItem.throw_range}
        <div class="tt-section">
          <span class="tt-label">Wurfweite</span>
          <span>{ftToM(tooltipItem.throw_range.normal)} / {ftToM(tooltipItem.throw_range.long)}</span>
        </div>
      {/if}
      {#if tooltipProperties(tooltipItem)}
        <div class="tt-section">
          <span class="tt-label">Eigenschaften</span>
          <span>{tooltipProperties(tooltipItem)}</span>
        </div>
      {/if}
    {:else if structuralType(tooltipItem) === 'armor' && tooltipItem.armor_class}
      <div class="tt-section">
        <span class="tt-label">Rüstungsklasse</span>
        <span>{tooltipItem.armor_class.base}{tooltipItem.armor_class.dex_bonus ? ' + GES-Mod' : ''}{tooltipItem.armor_class.max_bonus != null ? ` (max. ${tooltipItem.armor_class.max_bonus})` : ''}</span>
      </div>
      {#if tooltipItem.str_minimum}
        <div class="tt-section">
          <span class="tt-label">Mindest-STR</span>
          <span>{tooltipItem.str_minimum}</span>
        </div>
      {/if}
      {#if tooltipItem.stealth_disadvantage}
        <div class="tt-note">Nachteil auf Heimlichkeit</div>
      {/if}
    {/if}

    {#if tooltipItem.cost || tooltipItem.weight}
      <div class="tt-section tt-footer">
        {#if tooltipItem.cost}<span>{formatCost(tooltipItem.cost)}</span>{/if}
        {#if tooltipItem.cost && tooltipItem.weight}<span class="tt-sep">·</span>{/if}
        {#if tooltipItem.weight}<span>{tooltipItem.weight} lb</span>{/if}
      </div>
    {/if}

    {#if tooltipItem.desc_de?.length}
      <div class="tt-divider"></div>
      {#each tooltipItem.desc_de as para}
        <p class="tt-desc">{para}</p>
      {/each}
    {:else if tooltipItem.desc?.length}
      <div class="tt-divider"></div>
      {#each tooltipItem.desc as para}
        <p class="tt-desc">{para}</p>
      {/each}
    {/if}
  </div>
{/if}

<SpellTooltip spell={spellTooltip} x={tooltipX} y={tooltipY} />

<style>
  .sheet {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    color: var(--ink);
    font-size: 0.9rem;
  }

  .loading, .error {
    padding: 2rem;
    color: var(--ink-muted);
    text-align: center;
  }
  .error { color: var(--danger); }

  .header {
    padding: 1rem 1.5rem 0;
    border-bottom: 1px solid var(--surface);
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 1rem;
  }

  .portrait-thumb {
    width: 64px;
    height: 80px;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--bg);
  }

  .name-block h1 {
    margin: 0;
    font-size: 1.4rem;
    color: var(--arcane);
  }

  .sub { color: var(--ink-muted); font-size: 0.85rem; }

  .header-meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.8rem;
    color: var(--ink-soft);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.3rem;
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    font-size: 0.9rem;
    font-family: inherit;
    white-space: nowrap;
    cursor: pointer;
  }
  .icon-btn .arrow { font-size: 0.95rem; line-height: 1; }
  .icon-btn:disabled { opacity: 0.6; cursor: default; }
  .icon-btn.import:hover { border-color: var(--arcane); color: var(--arcane); }
  .icon-btn.export:hover { border-color: var(--green); color: var(--green); }
  .icon-btn.busy { animation: icon-pulse 1s ease-in-out infinite; }

  @keyframes icon-pulse {
    0%, 100% { opacity: 0.4; }
    50%      { opacity: 1; }
  }

  .edit-wrapper {
    min-height: 0;
  }

  .content {
    width: 100%;
    box-sizing: border-box;
    padding: 1rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .attributes {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .attr-box {
    background: var(--surface);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    text-align: center;
    min-width: 52px;
  }

  .attr-label { font-size: 0.7rem; color: var(--ink-muted); text-transform: uppercase; }
  .attr-mod { font-size: 1.2rem; font-weight: 700; color: var(--arcane); }
  .attr-score { font-size: 0.75rem; color: var(--ink-soft); }

  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .section h3 {
    margin: 0 0 0.4rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
    border-bottom: 1px solid var(--surface);
    padding-bottom: 0.2rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .slot-badge {
    font-size: 0.7rem;
    background: var(--surface);
    color: var(--red);
    border-radius: 4px;
    padding: 0.05rem 0.4rem;
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.2rem 0.5rem;
    margin-bottom: 0.75rem;
  }

  .personal-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.2rem 0.5rem;
    margin-bottom: 0.75rem;
  }

  .stat { display: flex; justify-content: space-between; }
  .sl { color: var(--ink-muted); font-size: 0.8rem; }
  .sv { font-weight: 600; color: var(--ink); }

  .attack-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  .attack-table th {
    text-align: left;
    color: var(--ink-muted);
    font-weight: 400;
    padding: 0.15rem 0.3rem;
    border-bottom: 1px solid var(--surface);
  }
  .attack-table td { padding: 0.15rem 0.3rem; color: var(--ink); }

  .save-list { display: flex; flex-direction: column; gap: 0.15rem; margin-bottom: 0.75rem; }
  .save-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; }
  .save-row.proficient .save-val { color: var(--green); }
  .save-label { flex: 1; color: var(--ink-soft); }
  .save-val { font-weight: 600; }

  .skill-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.1rem 0.5rem;
  }
  .skill-row { display: flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; }
  .skill-row.proficient .skill-val { color: var(--green); }
  .skill-row.expertise .skill-val { color: var(--steel); }
  .skill-name { color: var(--ink-soft); }
  .skill-val { font-weight: 600; }

  .prof-dot { font-size: 0.65rem; color: var(--ink-muted); width: 0.8rem; }
  .proficient .prof-dot, .expertise .prof-dot { color: var(--green); }

  .tag-list { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem; }
  .prof-extra { font-size: 0.8rem; color: var(--ink-soft); margin: 0.2rem 0 0.4rem; }
  .tag {
    background: var(--surface);
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    font-size: 0.75rem;
    color: var(--ink);
  }

  .preformatted { white-space: pre-wrap; font-size: 0.82rem; color: var(--ink-soft); }

  /* ─── Zauber (Anzeige im Bogen) ──────────────────────── */
  .spell-level-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
    border-bottom: 1px solid var(--surface);
    padding-bottom: 0.2rem;
    margin: 0.5rem 0 0.25rem;
  }

  .spell-list {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    margin-bottom: 0.2rem;
  }

  .spell-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.82rem;
  }

  .spell-name { flex: 1; }

  .prep-dot { font-size: 0.62rem; color: var(--border); width: 0.8rem; }
  .spell-row.prepared .prep-dot { color: var(--green); }

  .section-head-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0;
  }
  .section-head-row h3 { margin-bottom: 0; }

  .btn-spell-pdf {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--ink-soft);
    border-radius: 5px;
    padding: 0.2rem 0.6rem;
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-spell-pdf:hover:not(:disabled) { color: var(--red); border-color: var(--red); }
  .btn-spell-pdf:disabled { opacity: 0.5; cursor: default; }

  /* ── Zauberkarten ─────────────────────────────────────── */
  .spell-cards {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.3rem;
  }

  .scard {
    border-left: 3px solid var(--sc);
    background: var(--bg);
    border-radius: 0 5px 5px 0;
    cursor: help;
    user-select: none;
    transition: background 0.1s;
  }
  .scard.scard-linked { cursor: pointer; }
  .scard:hover { background: var(--bg-raised); }

  .scard-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.5rem 0.3rem 0.6rem;
    font-size: 0.83rem;
  }

  .scard-prep { font-size: 0.6rem; color: var(--border); flex-shrink: 0; }
  .scard.prepared .scard-prep { color: var(--green); }

  .scard-name { flex: 1; color: var(--sc); font-weight: 500; }

  .scard-badges { display: flex; gap: 0.3rem; align-items: center; }
  .scard-school {
    font-size: 0.68rem;
    color: var(--border);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* Freitext */
  .freetext-area {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: calc(100% - 80px);
  }
  .freetext-hint {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.4rem 1.5rem;
    border-bottom: 1px solid var(--surface);
    font-size: 0.75rem;
    color: var(--ink-muted);
  }
  .freetext-status { color: var(--ink-muted); white-space: nowrap; }
  .freetext-status.unsaved { color: var(--danger); }
  .freetext-status.saving  { color: var(--ink-soft); }

  /* ── Tooltips ─────────────────────────────── */
  .has-tip {
    position: relative;
    cursor: help;
  }

  .tip {
    display: none;
    flex-direction: column;
    gap: 0.18rem;
    position: absolute;
    bottom: calc(100% + 7px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.45rem 0.7rem;
    font-size: 0.75rem;
    font-weight: 400;
    white-space: nowrap;
    color: var(--ink-soft);
    z-index: 50;
    pointer-events: none;
    box-shadow: 0 4px 14px rgba(0,0,0,0.5);
  }

  .tip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: var(--border);
  }

  .tip.tip-left {
    left: 0;
    transform: none;
  }
  .tip.tip-left::after {
    left: 1rem;
    transform: none;
  }

  .has-tip:hover > .tip {
    display: flex;
  }

  .tip :global(.tip-row) {
    display: flex;
    justify-content: space-between;
    gap: 1.5rem;
  }
  .tip :global(.tip-lbl) { color: var(--ink-muted); }
  .tip :global(.tip-val) {
    font-weight: 600;
    color: var(--arcane);
    text-align: right;
  }
  .tip :global(.tip-div) {
    display: block;
    border-top: 1px solid var(--border);
    margin: 0.1rem 0;
  }
  .tip :global(.tip-total .tip-val) {
    color: var(--ink);
    font-size: 0.85rem;
  }
  .tip :global(.tip-step) {
    display: block;
    color: var(--ink-muted);
    font-size: 0.72rem;
    padding-left: 0.15rem;
  }

  /* ── Inventar ─────────────────────────────── */
  .currency-row {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }

  .coin {
    background: var(--surface);
    border-radius: 6px;
    padding: 0.3rem 0.6rem;
    text-align: center;
    min-width: 46px;
  }
  .coin.empty { opacity: 0.4; }
  .coin-val { display: block; font-weight: 700; font-size: 0.95rem; color: var(--gold); }
  .coin-lbl { display: block; font-size: 0.65rem; color: var(--ink-muted); text-transform: uppercase; }

  .inv-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
    margin-bottom: 0.4rem;
  }
  .inv-table th {
    text-align: left;
    color: var(--ink-muted);
    font-weight: 400;
    padding: 0.15rem 0.4rem 0.15rem 0;
    border-bottom: 1px solid var(--surface);
  }
  .inv-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-right: 0.3rem;
    vertical-align: middle;
    flex-shrink: 0;
  }

  .inv-linked { cursor: pointer; }
  .inv-linked:hover td { background: var(--bg); filter: brightness(1.15); }

  .inv-weapon-info {
    margin-left: 0.4rem;
    font-size: 0.74rem;
    color: var(--ink-muted);
    font-style: italic;
  }

  /* ── Item-Tooltip ──────────────────────────────────────── */
  .item-tooltip {
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.7rem 0.9rem;
    min-width: 200px;
    max-width: 320px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    font-size: 0.8rem;
    color: var(--ink);
  }
  .tt-name {
    font-weight: 600;
    font-size: 0.88rem;
    color: var(--ink);
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-bottom: 0.2rem;
  }
  .tt-name-en {
    font-size: 0.72rem;
    color: var(--ink-muted);
    font-weight: 400;
    font-style: italic;
  }
  .tt-badge {
    font-size: 0.68rem;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    font-weight: 500;
    line-height: 1.4;
  }
  .tt-attune { background: color-mix(in srgb, var(--arcane) 13%, transparent); color: var(--arcane); border: 1px solid color-mix(in srgb, var(--arcane) 25%, transparent); }
  .tt-meta {
    font-size: 0.74rem;
    color: var(--red);
    margin-bottom: 0.45rem;
  }
  .tt-section {
    display: flex;
    gap: 0.5rem;
    font-size: 0.78rem;
    margin-bottom: 0.15rem;
    align-items: baseline;
  }
  .tt-label {
    color: var(--ink-muted);
    flex-shrink: 0;
    min-width: 70px;
    font-size: 0.72rem;
  }
  .tt-footer { margin-top: 0.35rem; color: var(--ink-muted); flex-wrap: wrap; }
  .tt-sep { color: var(--border); }
  .tt-note { font-size: 0.74rem; color: var(--danger); margin-bottom: 0.1rem; }
  .tt-divider { border-top: 1px solid var(--surface); margin: 0.45rem 0; }
  .tt-desc {
    margin: 0 0 0.3rem;
    font-size: 0.77rem;
    color: var(--ink-soft);
    line-height: 1.45;
  }

  .inv-table td {
    padding: 0.2rem 0.4rem 0.2rem 0;
    color: var(--ink);
    border-bottom: 1px solid var(--bg);
  }
  .inv-table td.num { color: var(--ink-soft); text-align: right; padding-right: 0.75rem; }

  .weight-total {
    font-size: 0.78rem;
    color: var(--ink-muted);
    text-align: right;
    margin-top: 0.2rem;
  }
  .weight-total strong { color: var(--ink-soft); }

  .empty-hint {
    font-size: 0.8rem;
    color: var(--border);
    font-style: italic;
  }
</style>
