<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { PDFDocument } from 'pdf-lib';
  import { parseCharacterData, SKILL_DEFS, type CharacterData } from '../pdf/characterFields';
  import { fileContent } from '../stores/campaign';
  import { marked } from 'marked';

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
  let activeTab = $state<'sheet' | 'notes'>('sheet');

  const gmNotesPath = $derived(`${dirPath}/gm-notes.md`);

  $effect(() => {
    if (dirPath) {
      loading = true;
      error = '';
      character = null;
      pdfName = '';
      loadCharacter();
    }
  });

  async function loadCharacter() {
    try {
      // PDF-Datei im Verzeichnis suchen
      const foundPdf = await invoke<string | null>('find_pdf_in_dir', { path: dirPath });
      if (!foundPdf) {
        error = 'Keine PDF-Datei im Verzeichnis gefunden.';
        loading = false;
        return;
      }
      pdfName = foundPdf;

      // PDF als Base64 laden
      const base64 = await invoke<string>('read_file_base64', {
        path: `${dirPath}/${pdfName}`,
      });
      const bytes = base64ToBytes(base64);
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const form = pdf.getForm();

      // Alle Felder als Record auslesen
      const fields: Record<string, string> = {};
      for (const field of form.getFields()) {
        const name = field.getName();
        try {
          const tf = form.getTextField(name);
          fields[name] = tf.getText() ?? '';
        } catch {
          try {
            const cb = form.getCheckBox(name);
            fields[name] = cb.isChecked() ? 'On' : 'Off';
          } catch {
            fields[name] = '';
          }
        }
      }

      character = parseCharacterData(fields);

      // GM-Notizen laden — bei fehlender Datei Template anlegen
      try {
        gmNotes = await invoke<string>('read_file_content', { path: gmNotesPath });
      } catch {
        let tmpl = '';
        try {
          tmpl = await invoke<string>('read_file_content', { path: './vault/templates/character.md' });
        } catch { /* kein Template vorhanden */ }
        gmNotes = `# GM-Notizen: ${character.name}\n\n` + (tmpl || `## Hintergrund\n\n## Geheimnisse & Hooks\n\n## Verbindungen\n\n## Entwicklung\n\n## DM-Notizen\n`);
        await invoke('write_file_content', { path: gmNotesPath, content: gmNotes });
      }

      fileContent.set(gmNotes);
    } catch (e) {
      error = `Fehler beim Laden: ${e}`;
    } finally {
      loading = false;
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

  function sign(n: number): string {
    return n >= 0 ? `+${n}` : `${n}`;
  }

  const ATTR_LABEL: Record<string, string> = { str: 'STR', ges: 'GES', kon: 'KON', int: 'INT', wei: 'WEI', cha: 'CHA' };
  const skillAttrMap = new Map(SKILL_DEFS.map(s => [s.key, s.attr]));

  function row(label: string, val: string | number): string {
    const v = typeof val === 'number' ? sign(val) : val;
    return `<span class="tip-row"><span class="tip-lbl">${label}</span><span class="tip-val">${v}</span></span>`;
  }
  function divider(): string {
    return `<span class="tip-div"></span>`;
  }
  function total(val: string | number): string {
    const v = typeof val === 'number' ? sign(val) : val;
    return `<span class="tip-row tip-total"><span class="tip-lbl"></span><span class="tip-val">${v}</span></span>`;
  }

  function step(label: string): string {
    return `<span class="tip-step">${label}</span>`;
  }

  function attrModTip(attr: string, score: number): string {
    const m = Math.floor((score - 10) / 2);
    return row(attr, String(score)) + step('− 10') + step('÷ 2') + divider() + total(m);
  }

  function saveTip(modKey: string, attrLabel: string, proficient: boolean): string {
    if (!character) return '';
    const attrMod = (character as any)[modKey] as number;
    const pb = character.proficiencyBonus;
    if (proficient) {
      return row(`${attrLabel}-Mod`, attrMod) + row('Übungsbonus', pb) + divider() + total(attrMod + pb);
    }
    return row(`${attrLabel}-Mod`, attrMod) + divider() + total(attrMod);
  }

  function skillTip(name: string, skill: { value: number; prof: boolean; exp: boolean }): string {
    if (!character) return '';
    const attr = skillAttrMap.get(name);
    if (!attr) return '';
    const attrLabel = ATTR_LABEL[attr] ?? attr.toUpperCase();
    const attrMod = (character as any)[`${attr}Mod`] as number;
    const pb = character.proficiencyBonus;
    if (skill.exp) {
      return row(`${attrLabel}-Mod`, attrMod) + row('2× Übungsbonus', pb * 2) + divider() + total(skill.value);
    } else if (skill.prof) {
      return row(`${attrLabel}-Mod`, attrMod) + row('Übungsbonus', pb) + divider() + total(skill.value);
    } else if (character.alleskoenner) {
      return row(`${attrLabel}-Mod`, attrMod) + row('½ Übungsbonus', Math.floor(pb / 2)) + divider() + total(skill.value);
    }
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
      <div class="tabs">
        <button class:active={activeTab === 'sheet'} onclick={() => (activeTab = 'sheet')}>Charakterbogen</button>
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

          <!-- Währung -->
          <div class="currency-row">
            {#each [['KM','Kupfer'],['SM','Silber'],['EM','Elektrum'],['GM','Gold'],['PM','Platin']] as [key, label]}
              {@const val = (character.currency as any)[key.toLowerCase()]}
              <div class="coin" class:empty={!val}>
                <span class="coin-val">{val || '—'}</span>
                <span class="coin-lbl">{key}</span>
              </div>
            {/each}
          </div>

          <!-- Gegenstände -->
          {#if character.inventory.length}
            <table class="inv-table">
              <thead>
                <tr>
                  <th>Gegenstand</th>
                  <th>Anz.</th>
                  <th>Gew.</th>
                </tr>
              </thead>
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

  /* rows inside tooltip */
  .tip :global(.tip-row) {
    display: flex;
    justify-content: space-between;
    gap: 1.5rem;
  }
  .tip :global(.tip-lbl) {
    color: #6c7086;
  }
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
