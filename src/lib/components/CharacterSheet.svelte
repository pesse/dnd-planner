<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { PDFDocument } from 'pdf-lib';
  import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
  import { parseCharacterData, emptySpells, SKILL_DEFS, type CharacterData, type CharacterJSON } from '../pdf/characterFields';
  import { exportCharacterToPdf } from '../pdf/characterExport';
  import CharacterEditForm from './CharacterEditForm.svelte';
  import { activeFile, fileContent } from '../stores/campaign';
  import { marked } from 'marked';
  import { getSpellLibrary, loadSpellByPath, SCHOOL_COLORS, type SpellInfo } from '../spellLibrary';
  import {
    getItemsByDir, displayName, CATEGORY_COLORS, DIR_TO_CATEGORY,
    formatCost, formatRarity, formatDamageDice, ftToM,
    DAMAGE_TYPE_LABELS, PROPERTY_LABELS, WEAPON_CATEGORY_LABELS, WEAPON_RANGE_LABELS, ARMOR_CATEGORY_LABELS,
    type ItemInfo,
  } from '../itemLibrary';
  import { prepareMultiSpellPrint } from '../utils/printSpell';
  import type { Spell, Item } from '../types';

  interface Props {
    dirPath: string;   // z.B. "./vault/characters/carric_galanodel"
  }

  let { dirPath }: Props = $props();

  let pdfName = $state('');
  let character = $state<CharacterData | null>(null);
  let gmNotes = $state('');
  let gmNotesEditing = $state(false);
  let loading = $state(true);
  let error = $state('');
  let activeTab = $state<'sheet' | 'edit' | 'notes'>('sheet');
  let jsonSource = $state(false);  // true = aus character.json geladen
  let saving = $state(false);
  let importingPdf = $state(false);
  let dumpingFields = $state(false);
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

  // ─── Zauberkarten: Expand/Collapse + Daten-Cache ────────
  let expandedSpells = $state(new Set<string>());
  let spellDataCache = $state(new Map<string, Spell | null>());
  let loadingSpells = $state(new Set<string>());

  async function toggleSpellCard(name: string) {
    if (expandedSpells.has(name)) {
      expandedSpells.delete(name);
      expandedSpells = new Set(expandedSpells);
      return;
    }
    expandedSpells.add(name);
    expandedSpells = new Set(expandedSpells);
    if (!spellDataCache.has(name) && !loadingSpells.has(name)) {
      const info = spellInfoMap.get(name);
      if (info?.path) {
        loadingSpells.add(name);
        loadingSpells = new Set(loadingSpells);
        const data = await loadSpellByPath(info.path);
        spellDataCache.set(name, data);
        spellDataCache = new Map(spellDataCache);
        loadingSpells.delete(name);
        loadingSpells = new Set(loadingSpells);
      }
    }
  }

  const SCHOOL_LABELS: Record<string, string> = {
    abjuration: 'Bannmagie', conjuration: 'Beschwörung', divination: 'Erkenntnismagie',
    enchantment: 'Verzauberung', evocation: 'Hervorrufung', illusion: 'Illusionsmagie',
    necromancy: 'Nekromantie', transmutation: 'Verwandlung',
  };

  function componentStr(s: Spell): string {
    const parts: string[] = [];
    if (s.components.verbal)   parts.push('V');
    if (s.components.somatic)  parts.push('G');
    if (s.components.material) parts.push('M');
    return parts.join(', ') || '—';
  }

  let printingSpells = $state(false);

  async function printSpellList() {
    if (!character?.spells) return;
    printingSpells = true;

    try {
      // Alle Zaubernamen sammeln: Zaubertricks + Stufe 1-9
      const names: string[] = [
        ...(character.spells.cantrips ?? []),
        ...(['1','2','3','4','5','6','7','8','9'].flatMap(
          lvl => (character.spells.byLevel[lvl] ?? []).map(s => s.name)
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
      const charName = character.name || 'Charakter';
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
  const jsonPath = $derived(`${dirPath}/character.json`);

  $effect(() => {
    if (dirPath) {
      loading = true;
      error = '';
      character = null;
      pdfName = '';
      jsonSource = false;
      loadCharacter();
    }
  });

  async function loadCharacter() {
    try {
      // 1. Versuche character.json zu laden (primäres Format)
      try {
        const jsonStr = await invoke<string>('read_file_content', { path: jsonPath });
        const data = JSON.parse(jsonStr) as CharacterJSON;
        // Sicherstellen dass spells vorhanden ist (Rückwärtskompatibilität)
        if (!data.spells) data.spells = emptySpells();
        character = data;
        jsonSource = true;
      } catch {
        // 2. Fallback: PDF parsen
        jsonSource = false;
        const foundPdf = await invoke<string | null>('find_pdf_in_dir', { path: dirPath });
        if (!foundPdf) {
          error = 'Keine PDF-Datei und kein character.json im Verzeichnis gefunden.';
          loading = false;
          return;
        }
        pdfName = foundPdf;
        const base64 = await invoke<string>('read_file_base64', { path: `${dirPath}/${pdfName}` });
        const bytes = base64ToBytes(base64);
        const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const form = pdf.getForm();

        const fields: Record<string, string> = {};
        for (const field of form.getFields()) {
          const name = field.getName();
          try {
            fields[name] = form.getTextField(name).getText() ?? '';
          } catch {
            try {
              fields[name] = form.getCheckBox(name).isChecked() ? 'On' : 'Off';
            } catch {
              fields[name] = '';
            }
          }
        }
        character = parseCharacterData(fields);
      }

      // GM-Notizen laden
      try {
        gmNotes = await invoke<string>('read_file_content', { path: gmNotesPath });
      } catch {
        let tmpl = '';
        try {
          tmpl = await invoke<string>('read_file_content', { path: './vault/templates/character.md' });
        } catch { /* kein Template */ }
        gmNotes = `# GM-Notizen: ${character!.name}\n\n` + (tmpl || `## Hintergrund\n\n## Geheimnisse & Hooks\n\n## Verbindungen\n\n## Entwicklung\n\n## DM-Notizen\n`);
        await invoke('write_file_content', { path: gmNotesPath, content: gmNotes });
      }

      fileContent.set(gmNotes);
    } catch (e) {
      error = `Fehler beim Laden: ${e}`;
    } finally {
      loading = false;
    }
  }

  async function saveAsJson() {
    if (!character) return;
    saving = true;
    try {
      const json: CharacterJSON = {
        _version: 1,
        _importedFrom: pdfName || undefined,
        _importedAt: new Date().toISOString(),
        ...character,
      };
      await invoke('write_file_content', { path: jsonPath, content: JSON.stringify(json, null, 2) });
      jsonSource = true;
    } catch (e) {
      error = `Speichern fehlgeschlagen: ${e}`;
    } finally {
      saving = false;
    }
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
      imported.spells = character.spells ?? emptySpells();

      const pdfFilename = (selected as string).split(/[/\\]/).pop() ?? '';
      const json: CharacterJSON = {
        _version: 1,
        _importedFrom: pdfFilename,
        _importedAt: new Date().toISOString(),
        ...imported,
      };
      await invoke('write_file_content', { path: jsonPath, content: JSON.stringify(json, null, 2) });
      character = imported;
      pdfName = pdfFilename;
      jsonSource = true;
    } catch (e) {
      error = `PDF-Import fehlgeschlagen: ${e}`;
    } finally {
      importingPdf = false;
    }
  }

  async function handleEditSave(updated: CharacterData) {
    character = updated;
    await saveAsJson();
    activeTab = 'sheet';
  }

  async function dumpPdfFields() {
    dumpingFields = true;
    error = '';
    try {
      const foundPdf = await invoke<string | null>('find_pdf_in_dir', { path: dirPath });
      if (!foundPdf) { error = 'Keine PDF im Verzeichnis gefunden.'; return; }
      const base64 = await invoke<string>('read_file_base64', { path: `${dirPath}/${foundPdf}` });
      const bytes = base64ToBytes(base64);
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const form = pdf.getForm();

      const dump: Record<string, { type: string; value: string }> = {};
      for (const field of form.getFields()) {
        const n = field.getName();
        let type = 'other'; let value = '';
        try { value = form.getTextField(n).getText() ?? ''; type = 'text'; }
        catch { try { value = form.getCheckBox(n).isChecked() ? 'On' : 'Off'; type = 'checkbox'; } catch {} }
        dump[n] = { type, value };
      }
      await invoke('write_file_content', {
        path: `${dirPath}/pdf-fields-dump.json`,
        content: JSON.stringify(dump, null, 2),
      });
    } catch (e) {
      error = `Felder-Dump fehlgeschlagen: ${e}`;
    } finally {
      dumpingFields = false;
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

      const pdfBytes = await exportCharacterToPdf(json, templateBytes, { portrait });
      const b64 = bytesToBase64(pdfBytes);
      const safeName = character.name.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_') || 'charakter';
      const outPath = `${dirPath}/${safeName}-export.pdf`;
      await invoke('write_file_base64', { path: outPath, data: b64 });
    } catch (e) {
      error = `PDF-Export fehlgeschlagen: ${e}`;
    } finally {
      exportingPdf = false;
    }
  }

  async function saveGmNotes() {
    await invoke('write_file_content', { path: gmNotesPath, content: gmNotes });
    fileContent.set(gmNotes);
    gmNotesEditing = false;
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
  {#if loading}
    <div class="loading">Lade Charakterbogen…</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if character}
    <!-- Header -->
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
        {#if !jsonSource}
          <button class="btn-import" onclick={saveAsJson} disabled={saving}>
            {saving ? '…' : 'Als JSON speichern'}
          </button>
        {:else}
          <span class="json-badge">JSON</span>
        {/if}
        <button class="btn-pdf-import" onclick={importPdfIntoExisting} disabled={importingPdf} title="Werte aus PDF überschreiben (Zauber bleiben erhalten)">
          {importingPdf ? '…' : 'PDF importieren'}
        </button>
        <button class="btn-dump" onclick={dumpPdfFields} disabled={dumpingFields} title="Alle PDF-Feldnamen in pdf-fields-dump.json schreiben">
          {dumpingFields ? '…' : 'Felder analysieren'}
        </button>
        <button class="btn-export-pdf" onclick={exportToPdf} disabled={exportingPdf} title="Charakter als ausgefülltes Taendler-PDF exportieren">
          {exportingPdf ? '…' : 'Als PDF exportieren'}
        </button>
      </div>
      <div class="tabs">
        <button class:active={activeTab === 'sheet'} onclick={() => (activeTab = 'sheet')}>Bogen</button>
        <button class:active={activeTab === 'edit'} onclick={() => (activeTab = 'edit')}>Bearbeiten</button>
        <button class:active={activeTab === 'notes'} onclick={() => (activeTab = 'notes')}>GM-Notizen</button>
      </div>
    </div>

    {#if activeTab === 'sheet'}
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
                        <span class="inv-dot" style="background:{CATEGORY_COLORS[libItem.category] ?? '#585b70'}"></span>
                      {/if}
                      {libItem ? displayName(libItem) : item.name}
                      {#if fullItem?.item_type === 'weapon' && fullItem.damage}
                        <span class="inv-weapon-info">{inlineWeaponInfo(fullItem)}</span>
                      {:else if fullItem?.item_type === 'armor' && fullItem.armor_class}
                        <span class="inv-weapon-info">RK {fullItem.armor_class.base}{fullItem.armor_class.dex_bonus ? '+GES' : ''}</span>
                      {:else if fullItem?.rarity}
                        <span class="inv-weapon-info">{formatRarity(fullItem.rarity)}</span>
                      {/if}
                    </td>
                    <td class="num">{item.count || '—'}</td>
                    <td class="num">{item.weight ? item.weight + ' kg' : '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
            {#if character.totalWeight}
              <div class="weight-total">Gesamtlast: <strong>{character.totalWeight} kg</strong></div>
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
                  {@const expanded = expandedSpells.has(name)}
                  {@const data = spellDataCache.get(name) ?? null}
                  <div class="scard" class:expanded style="--sc:{color || '#585b70'}"
                    role="button" tabindex="0"
                    onclick={() => toggleSpellCard(name)}
                    onkeydown={(e) => e.key === 'Enter' && toggleSpellCard(name)}>
                    <div class="scard-head">
                      <span class="scard-name">{name}</span>
                      <span class="scard-badges">
                        {#if info?.school}<span class="scard-school">{SCHOOL_LABELS[info.school] ?? info.school}</span>{/if}
                      </span>
                      <span class="scard-chevron">{expanded ? '▲' : '▼'}</span>
                    </div>
                    {#if expanded}
                      <div class="scard-body" onclick={(e) => e.stopPropagation()}>
                        {#if loadingSpells.has(name)}
                          <span class="scard-loading">Lädt…</span>
                        {:else if data}
                          <div class="scard-props">
                            <span class="sp-label">Zauberdauer</span><span class="sp-val">{data.casting_time}</span>
                            <span class="sp-label">Reichweite</span><span class="sp-val">{data.range}</span>
                            <span class="sp-label">Komponenten</span><span class="sp-val">{componentStr(data)}{data.components.materials_needed ? ` (${data.components.materials_needed})` : ''}</span>
                            <span class="sp-label">Dauer</span><span class="sp-val">{data.duration}</span>
                          </div>
                          <div class="scard-divider"></div>
                          <div class="scard-desc">{data.description}</div>
                          {#if data.higher_levels}
                            <div class="scard-divider"></div>
                            <div class="scard-higher"><span class="higher-lbl">Auf höheren Graden.</span>{data.higher_levels}</div>
                          {/if}
                        {:else}
                          <span class="scard-loading">Nicht in Bibliothek</span>
                        {/if}
                      </div>
                    {/if}
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
                    {@const expanded = expandedSpells.has(spell.name)}
                    {@const data = spellDataCache.get(spell.name) ?? null}
                    <div class="scard" class:expanded class:prepared={spell.prepared}
                      style="--sc:{color || '#585b70'}"
                      role="button" tabindex="0"
                      onclick={() => toggleSpellCard(spell.name)}
                      onkeydown={(e) => e.key === 'Enter' && toggleSpellCard(spell.name)}>
                      <div class="scard-head">
                        <span class="scard-prep">{spell.prepared ? '●' : '○'}</span>
                        <span class="scard-name">{spell.name}</span>
                        <span class="scard-badges">
                          {#if info?.school}<span class="scard-school">{SCHOOL_LABELS[info.school] ?? info.school}</span>{/if}
                        </span>
                        <span class="scard-chevron">{expanded ? '▲' : '▼'}</span>
                      </div>
                      {#if expanded}
                        <div class="scard-body" onclick={(e) => e.stopPropagation()}>
                          {#if loadingSpells.has(spell.name)}
                            <span class="scard-loading">Lädt…</span>
                          {:else if data}
                            <div class="scard-props">
                              <span class="sp-label">Zauberdauer</span><span class="sp-val">{data.casting_time}</span>
                              <span class="sp-label">Reichweite</span><span class="sp-val">{data.range}</span>
                              <span class="sp-label">Komponenten</span><span class="sp-val">{componentStr(data)}{data.components.materials_needed ? ` (${data.components.materials_needed})` : ''}</span>
                              <span class="sp-label">Dauer</span><span class="sp-val">{data.duration}</span>
                            </div>
                            <div class="scard-divider"></div>
                            <div class="scard-desc">{data.description}</div>
                            {#if data.higher_levels}
                              <div class="scard-divider"></div>
                              <div class="scard-higher"><span class="higher-lbl">Auf höheren Graden.</span>{data.higher_levels}</div>
                            {/if}
                          {:else}
                            <span class="scard-loading">Nicht in Bibliothek</span>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      </div>

    {:else if activeTab === 'edit'}
      <!-- ─── Bearbeiten-Tab ──────────────────────────────────── -->
      <div class="edit-wrapper">
        <CharacterEditForm
          character={character}
          dirPath={dirPath}
          onSave={handleEditSave}
          onCancel={() => (activeTab = 'sheet')}
        />
      </div>

    {:else}
      <!-- GM-Notizen Tab -->
      <div class="notes-area">
        {#if gmNotesEditing}
          <div class="notes-toolbar">
            <button class="btn-save" onclick={saveGmNotes}>Speichern</button>
            <button class="btn-cancel" onclick={() => gmNotesEditing = false}>Abbrechen</button>
          </div>
          <textarea class="notes-editor" bind:value={gmNotes}></textarea>
        {:else}
          <div class="notes-toolbar">
            <button class="btn-edit" onclick={() => gmNotesEditing = true}>Bearbeiten</button>
          </div>
          <div class="notes-preview">
            {@html marked(gmNotes)}
          </div>
        {/if}
      </div>
    {/if}
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
      {#if tooltipItem.item_type === 'weapon'}
        {WEAPON_CATEGORY_LABELS[tooltipItem.weapon_category ?? ''] ?? tooltipItem.weapon_category}
        · {WEAPON_RANGE_LABELS[tooltipItem.weapon_range ?? ''] ?? tooltipItem.weapon_range}
      {:else if tooltipItem.item_type === 'armor'}
        {ARMOR_CATEGORY_LABELS[tooltipItem.armor_category ?? ''] ?? tooltipItem.armor_category}
      {:else if tooltipItem.rarity}
        {formatRarity(tooltipItem.rarity)}
        {#if tooltipItem.attunement_by}· für {tooltipItem.attunement_by}{/if}
      {/if}
    </div>

    {#if tooltipItem.item_type === 'weapon' && tooltipItem.damage}
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
    {:else if tooltipItem.item_type === 'armor' && tooltipItem.armor_class}
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

<style>
  .sheet {
    flex: 1;
    overflow-y: auto;
    background: #1e1e2e;
    color: #cdd6f4;
    font-size: 0.9rem;
  }

  .loading, .error {
    padding: 2rem;
    color: #6c7086;
    text-align: center;
  }
  .error { color: #f38ba8; }

  .header {
    padding: 1rem 1.5rem 0;
    border-bottom: 1px solid #313244;
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
    border: 1px solid #45475a;
    background: #1e1e2e;
  }

  .name-block h1 {
    margin: 0;
    font-size: 1.4rem;
    color: #cba6f7;
  }

  .sub { color: #6c7086; font-size: 0.85rem; }

  .header-meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.8rem;
    color: #a6adc8;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-import {
    background: #f9e2af;
    color: #1e1e2e;
    border: none;
    border-radius: 4px;
    padding: 0.3rem 0.75rem;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-import:disabled { opacity: 0.6; cursor: default; }

  .btn-pdf-import {
    background: #313244;
    color: #cdd6f4;
    border: 1px solid #45475a;
    border-radius: 4px;
    padding: 0.3rem 0.75rem;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .btn-pdf-import:hover { border-color: #cba6f7; color: #cba6f7; }
  .btn-pdf-import:disabled { opacity: 0.6; cursor: default; }

  .btn-dump {
    background: #313244;
    color: #a6adc8;
    border: 1px solid #45475a;
    border-radius: 4px;
    padding: 0.3rem 0.75rem;
    font-size: 0.75rem;
    cursor: pointer;
  }
  .btn-dump:hover { border-color: #f9e2af; color: #f9e2af; }
  .btn-dump:disabled { opacity: 0.6; cursor: default; }

  .btn-export-pdf {
    background: #313244;
    color: #cdd6f4;
    border: 1px solid #45475a;
    border-radius: 4px;
    padding: 0.3rem 0.75rem;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .btn-export-pdf:hover { border-color: #a6e3a1; color: #a6e3a1; }
  .btn-export-pdf:disabled { opacity: 0.6; cursor: default; }

  .edit-wrapper {
    min-height: 0;
  }

  .json-badge {
    background: #a6e3a1;
    color: #1e1e2e;
    border-radius: 4px;
    padding: 0.15rem 0.4rem;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
  }

  .tabs {
    margin-left: auto;
    display: flex;
    gap: 0.25rem;
    padding-bottom: 0;
  }

  .tabs button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: #6c7086;
    cursor: pointer;
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
  }
  .tabs button.active {
    color: #cba6f7;
    border-bottom-color: #cba6f7;
  }

  .content {
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
    background: #313244;
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    text-align: center;
    min-width: 52px;
  }

  .attr-label { font-size: 0.7rem; color: #6c7086; text-transform: uppercase; }
  .attr-mod { font-size: 1.2rem; font-weight: 700; color: #cba6f7; }
  .attr-score { font-size: 0.75rem; color: #a6adc8; }

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
    color: #6c7086;
    border-bottom: 1px solid #313244;
    padding-bottom: 0.2rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .slot-badge {
    font-size: 0.7rem;
    background: #313244;
    color: #89b4fa;
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
  .sl { color: #6c7086; font-size: 0.8rem; }
  .sv { font-weight: 600; color: #cdd6f4; }

  .attack-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  .attack-table th {
    text-align: left;
    color: #6c7086;
    font-weight: 400;
    padding: 0.15rem 0.3rem;
    border-bottom: 1px solid #313244;
  }
  .attack-table td { padding: 0.15rem 0.3rem; color: #cdd6f4; }

  .save-list { display: flex; flex-direction: column; gap: 0.15rem; margin-bottom: 0.75rem; }
  .save-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; }
  .save-row.proficient .save-val { color: #a6e3a1; }
  .save-label { flex: 1; color: #a6adc8; }
  .save-val { font-weight: 600; }

  .skill-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.1rem 0.5rem;
  }
  .skill-row { display: flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; }
  .skill-row.proficient .skill-val { color: #a6e3a1; }
  .skill-row.expertise .skill-val { color: #89dceb; }
  .skill-name { color: #a6adc8; }
  .skill-val { font-weight: 600; }

  .prof-dot { font-size: 0.65rem; color: #6c7086; width: 0.8rem; }
  .proficient .prof-dot, .expertise .prof-dot { color: #a6e3a1; }

  .tag-list { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem; }
  .prof-extra { font-size: 0.8rem; color: #a6adc8; margin: 0.2rem 0 0.4rem; }
  .tag {
    background: #313244;
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    font-size: 0.75rem;
    color: #cdd6f4;
  }

  .preformatted { white-space: pre-wrap; font-size: 0.82rem; color: #a6adc8; }

  /* ─── Zauber (Anzeige im Bogen) ──────────────────────── */
  .spell-level-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6c7086;
    border-bottom: 1px solid #313244;
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

  .prep-dot { font-size: 0.62rem; color: #45475a; width: 0.8rem; }
  .spell-row.prepared .prep-dot { color: #a6e3a1; }

  .section-head-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0;
  }
  .section-head-row h3 { margin-bottom: 0; }

  .btn-spell-pdf {
    background: #313244;
    border: 1px solid #45475a;
    color: #a6adc8;
    border-radius: 5px;
    padding: 0.2rem 0.6rem;
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-spell-pdf:hover:not(:disabled) { color: #89b4fa; border-color: #89b4fa; }
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
    background: #1e1e2e;
    border-radius: 0 5px 5px 0;
    cursor: pointer;
    user-select: none;
    transition: background 0.1s;
  }
  .scard:hover { background: #252535; }
  .scard.expanded { background: #181825; }

  .scard-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.5rem 0.3rem 0.6rem;
    font-size: 0.83rem;
  }

  .scard-prep { font-size: 0.6rem; color: #45475a; flex-shrink: 0; }
  .scard.prepared .scard-prep { color: #a6e3a1; }

  .scard-name { flex: 1; color: var(--sc); font-weight: 500; }

  .scard-badges { display: flex; gap: 0.3rem; align-items: center; }
  .scard-school {
    font-size: 0.68rem;
    color: #45475a;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .scard-chevron { font-size: 0.55rem; color: #45475a; flex-shrink: 0; }

  .scard-body {
    padding: 0 0.6rem 0.6rem 0.6rem;
    cursor: default;
  }

  .scard-props {
    display: grid;
    grid-template-columns: 7rem 1fr;
    gap: 0.2rem 0.4rem;
    font-size: 0.8rem;
    padding-bottom: 0.5rem;
  }

  .sp-label {
    color: #6c7086;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    align-self: start;
    padding-top: 0.05rem;
  }
  .sp-val { color: #cdd6f4; line-height: 1.4; }

  .scard-divider { height: 1px; background: #313244; margin: 0.4rem 0; }

  .scard-desc {
    font-size: 0.82rem;
    color: #cdd6f4;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .scard-higher {
    font-size: 0.8rem;
    color: #a6adc8;
    line-height: 1.55;
    white-space: pre-wrap;
  }
  .higher-lbl { color: var(--sc); font-weight: 700; margin-right: 0.3rem; }

  .scard-loading { font-size: 0.78rem; color: #45475a; font-style: italic; }

  /* GM-Notizen */
  .notes-area {
    display: flex;
    flex-direction: column;
    height: calc(100% - 80px);
  }
  .notes-toolbar {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem 1.5rem;
    border-bottom: 1px solid #313244;
  }
  .btn-edit, .btn-save, .btn-cancel {
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-size: 0.82rem;
  }
  .btn-edit { background: #313244; color: #cdd6f4; }
  .btn-save { background: #a6e3a1; color: #1e1e2e; font-weight: 600; }
  .btn-save:disabled { opacity: 0.6; cursor: default; }
  .btn-cancel { background: none; color: #6c7086; }

  .notes-editor {
    flex: 1;
    background: #181825;
    color: #cdd6f4;
    border: none;
    padding: 1.5rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.9rem;
    resize: none;
    outline: none;
  }
  .notes-preview {
    flex: 1;
    padding: 1.5rem;
    overflow-y: auto;
    line-height: 1.8;
  }
  .notes-preview :global(h1) { color: #cba6f7; }
  .notes-preview :global(h2) { color: #89b4fa; }
  .notes-preview :global(h3) { color: #94e2d5; }
  .notes-preview :global(strong) { color: #f38ba8; }

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
    background: #181825;
    border: 1px solid #45475a;
    border-radius: 6px;
    padding: 0.45rem 0.7rem;
    font-size: 0.75rem;
    font-weight: 400;
    white-space: nowrap;
    color: #a6adc8;
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
    border-top-color: #45475a;
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
  .tip :global(.tip-lbl) { color: #6c7086; }
  .tip :global(.tip-val) {
    font-weight: 600;
    color: #cba6f7;
    text-align: right;
  }
  .tip :global(.tip-div) {
    display: block;
    border-top: 1px solid #45475a;
    margin: 0.1rem 0;
  }
  .tip :global(.tip-total .tip-val) {
    color: #cdd6f4;
    font-size: 0.85rem;
  }
  .tip :global(.tip-step) {
    display: block;
    color: #585b70;
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
    background: #313244;
    border-radius: 6px;
    padding: 0.3rem 0.6rem;
    text-align: center;
    min-width: 46px;
  }
  .coin.empty { opacity: 0.4; }
  .coin-val { display: block; font-weight: 700; font-size: 0.95rem; color: #f9e2af; }
  .coin-lbl { display: block; font-size: 0.65rem; color: #6c7086; text-transform: uppercase; }

  .inv-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
    margin-bottom: 0.4rem;
  }
  .inv-table th {
    text-align: left;
    color: #6c7086;
    font-weight: 400;
    padding: 0.15rem 0.4rem 0.15rem 0;
    border-bottom: 1px solid #313244;
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
  .inv-linked:hover td { background: #1e1e2e; filter: brightness(1.15); }

  .inv-weapon-info {
    margin-left: 0.4rem;
    font-size: 0.74rem;
    color: #6c7086;
    font-style: italic;
  }

  /* ── Item-Tooltip ──────────────────────────────────────── */
  .item-tooltip {
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    background: #181825;
    border: 1px solid #45475a;
    border-radius: 6px;
    padding: 0.7rem 0.9rem;
    min-width: 200px;
    max-width: 320px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    font-size: 0.8rem;
    color: #cdd6f4;
  }
  .tt-name {
    font-weight: 600;
    font-size: 0.88rem;
    color: #cdd6f4;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-bottom: 0.2rem;
  }
  .tt-name-en {
    font-size: 0.72rem;
    color: #6c7086;
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
  .tt-attune { background: #cba6f720; color: #cba6f7; border: 1px solid #cba6f740; }
  .tt-meta {
    font-size: 0.74rem;
    color: #89b4fa;
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
    color: #6c7086;
    flex-shrink: 0;
    min-width: 70px;
    font-size: 0.72rem;
  }
  .tt-footer { margin-top: 0.35rem; color: #6c7086; flex-wrap: wrap; }
  .tt-sep { color: #45475a; }
  .tt-note { font-size: 0.74rem; color: #f38ba8; margin-bottom: 0.1rem; }
  .tt-divider { border-top: 1px solid #313244; margin: 0.45rem 0; }
  .tt-desc {
    margin: 0 0 0.3rem;
    font-size: 0.77rem;
    color: #a6adc8;
    line-height: 1.45;
  }

  .inv-table td {
    padding: 0.2rem 0.4rem 0.2rem 0;
    color: #cdd6f4;
    border-bottom: 1px solid #1e1e2e;
  }
  .inv-table td.num { color: #a6adc8; text-align: right; padding-right: 0.75rem; }

  .weight-total {
    font-size: 0.78rem;
    color: #6c7086;
    text-align: right;
    margin-top: 0.2rem;
  }
  .weight-total strong { color: #a6adc8; }

  .empty-hint {
    font-size: 0.8rem;
    color: #45475a;
    font-style: italic;
  }
</style>
