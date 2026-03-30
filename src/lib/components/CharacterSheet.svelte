<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { PDFDocument } from 'pdf-lib';
  import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
  import { parseCharacterData, emptySpells, SKILL_DEFS, type CharacterData, type CharacterJSON } from '../pdf/characterFields';
  import { exportCharacterToPdf } from '../pdf/characterExport';
  import CharacterEditForm from './CharacterEditForm.svelte';
  import { fileContent } from '../stores/campaign';
  import { marked } from 'marked';
  import { getSpellLibrary, SCHOOL_COLORS, type SpellInfo } from '../spellLibrary';

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
  let spellLibrary = $state<SpellInfo[]>([]);

  $effect(() => { getSpellLibrary().then(lib => { spellLibrary = lib; }); });

  const spellSchoolMap = $derived(new Map(spellLibrary.map(s => [s.name, s.school])));
  function spellColor(name: string): string {
    const school = spellSchoolMap.get(name);
    return school ? (SCHOOL_COLORS[school] ?? '') : '';
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
      const pdfBytes = await exportCharacterToPdf(json, templateBytes);
      // Base64-Encode und als Datei speichern
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
          </div>
        </div>

        <!-- Fertigkeiten -->
        <div class="section">
          <h3>Fertigkeiten {character.alleskoenner ? '<small>(Alleskönner)</small>' : ''}</h3>
          <div class="skill-grid">
            {#each Object.entries(character.skills) as [name, skill]}
              <div class="skill-row has-tip" class:proficient={skill.prof} class:expertise={skill.exp}>
                <span class="prof-dot">{skill.exp ? '★' : skill.prof ? '●' : '○'}</span>
                <span class="skill-name">{name}</span>
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
                  <tr>
                    <td>{item.name}</td>
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
            <h3>Zauberwirken</h3>
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
              <div class="spell-list">
                {#each character.spells.cantrips as cantrip}
                  <div class="spell-row cantrip"><span class="spell-name" style="color:{spellColor(cantrip) || 'inherit'}">{cantrip}</span></div>
                {/each}
              </div>
            {/if}

            {#each ['1','2','3','4','5','6','7','8','9'] as lvl}
              {@const slots = character.spells.slots[Number(lvl) - 1]}
              {@const spells = character.spells.byLevel[lvl] ?? []}
              {#if spells.length || (slots?.total ?? 0) > 0}
                <div class="spell-level-header">
                  <span>{LEVEL_LABEL[lvl]}</span>
                  {#if slots?.total}
                    <span class="slot-badge">{slots.total} Slots</span>
                  {/if}
                </div>
                <div class="spell-list">
                  {#each spells as spell}
                    <div class="spell-row" class:prepared={spell.prepared}>
                      <span class="prep-dot">{spell.prepared ? '●' : '○'}</span>
                      <span class="spell-name" style="color:{spellColor(spell.name) || 'inherit'}">{spell.name}</span>
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
    color: #6c7086;
    border: 1px solid #45475a;
    border-radius: 4px;
    padding: 0.3rem 0.75rem;
    font-size: 0.8rem;
    cursor: not-allowed;
    opacity: 0.7;
  }
  .btn-export-pdf:disabled { cursor: not-allowed; }

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
  .skill-name { flex: 1; color: #a6adc8; }
  .skill-val { font-weight: 600; min-width: 2rem; text-align: right; }

  .prof-dot { font-size: 0.65rem; color: #6c7086; width: 0.8rem; }
  .proficient .prof-dot, .expertise .prof-dot { color: #a6e3a1; }

  .tag-list { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem; }
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
