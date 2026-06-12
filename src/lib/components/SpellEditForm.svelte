<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import type { Spell } from '../types';
  import { SPELL_SCHOOLS, SPELL_CLASS_KEYS, SPELL_CLASS_LABELS } from '../types';
  import { TRANSLATION_SYSTEM_PROMPT } from '../prompts';
  import DndApiSearch from './DndApiSearch.svelte';
  import LlmTranslate from './LlmTranslate.svelte';

  let {
    spell = $bindable<Spell>(),
    onchange = () => void 0,
  }: {
    spell: Spell;
    onchange?: () => void;
  } = $props();

  const DND_API = 'https://www.dnd5eapi.co/api/2014';

  const LEVEL_OPTIONS = [
    { value: 0, label: 'Zaubertrick' },
    ...Array.from({ length: 9 }, (_, i) => ({ value: i + 1, label: `${i + 1}. Grad` })),
  ];

  const DC_TYPES = [
    { index: 'str', name: 'STR' }, { index: 'dex', name: 'DEX' },
    { index: 'con', name: 'CON' }, { index: 'int', name: 'INT' },
    { index: 'wis', name: 'WIS' }, { index: 'cha', name: 'CHA' },
  ];

  const AOE_TYPES = ['sphere', 'cone', 'cube', 'line', 'cylinder'];
  const AOE_LABELS: Record<string, string> = {
    sphere: 'Sphäre', cone: 'Kegel', cube: 'Würfel', line: 'Linie', cylinder: 'Zylinder',
  };

  let showOriginal = $state(false);

  // desc_de + higher_level_de als zusammengefasster Text
  let descDeText = $derived((spell.desc_de ?? []).join('\n\n'));
  let higherLevelDeText = $derived((spell.higher_level_de ?? []).join('\n\n'));

  function setDescDe(text: string) {
    spell.desc_de = text ? text.split(/\n\n+/) : [];
    onchange();
  }

  function setHigherLevelDe(text: string) {
    spell.higher_level_de = text ? [text] : [];
    onchange();
  }

  function mark() { onchange(); }

  // ── DnD-API-Import ────────────────────────────────────────────────────────────

  interface SpellApiResult { index: string; name: string; url: string; }

  async function apiGet(url: string): Promise<unknown> {
    const text = await invoke<string>('http_request', {
      req: { url, method: 'GET', headers: {}, body: '' },
    });
    return JSON.parse(text);
  }

  async function searchSpells(q: string): Promise<SpellApiResult[]> {
    const raw = await apiGet(`${DND_API}/spells?name=${encodeURIComponent(q)}`);
    return ((raw as Record<string, unknown>).results as SpellApiResult[] ?? []).slice(0, 15);
  }

  function ftToM(val: string | number): string {
    const n = typeof val === 'string' ? parseInt(val) : val;
    const m = Math.round(n * 3) / 10;
    return `${m} m`.replace('.', ',');
  }

  function convertRange(r: string): string {
    return r
      .replace(/(\d+)-foot[-\s]/gi, (_, n) => `${ftToM(parseInt(n))}-`)
      .replace(/(\d+)\s*feet?/gi, (_, n) => ftToM(parseInt(n)))
      .replace(/\bTouch\b/gi, 'Berührung').replace(/\bSelf\b/gi, 'Selbst')
      .replace(/\bSight\b/gi, 'Sichtlinie').replace(/\bUnlimited\b/gi, 'Unbegrenzt')
      .replace(/\bSpecial\b/gi, 'Besonders').replace(/\bsphere\b/gi, 'Sphäre')
      .replace(/\bcone\b/gi, 'Kegel').replace(/\bcube\b/gi, 'Würfel')
      .replace(/\bline\b/gi, 'Linie').replace(/\bcylinder\b/gi, 'Zylinder')
      .replace(/\bradius\b/gi, 'Radius');
  }

  function convertDuration(d: string): string {
    return d
      .replace(/\bConcentration,\s*up to\s*/gi, 'Konzentration, bis zu ')
      .replace(/(\d+)\s*minutes?/gi, (_, n) => `${n} Minute${n === '1' ? '' : 'n'}`)
      .replace(/(\d+)\s*hours?/gi,   (_, n) => `${n} Stunde${n === '1' ? '' : 'n'}`)
      .replace(/(\d+)\s*days?/gi,    (_, n) => `${n} Tag${n === '1' ? '' : 'e'}`)
      .replace(/(\d+)\s*rounds?/gi,  (_, n) => `${n} Runde${n === '1' ? '' : 'n'}`)
      .replace(/\bInstantaneous\b/gi, 'Unmittelbar').replace(/\bUntil dispelled\b/gi, 'Bis aufgelöst')
      .replace(/\bPermanent\b/gi, 'Dauerhaft').replace(/\bSpecial\b/gi, 'Besonders');
  }

  function convertCastingTime(ct: string): string {
    return ct
      .replace(/\b1 action\b/gi, '1 Aktion').replace(/\b1 bonus action\b/gi, '1 Bonusaktion')
      .replace(/\b1 reaction\b/gi, '1 Reaktion')
      .replace(/(\d+)\s*minutes?/gi, (_, n) => `${n} Minute${n === '1' ? '' : 'n'}`)
      .replace(/(\d+)\s*hours?/gi,   (_, n) => `${n} Stunde${n === '1' ? '' : 'n'}`)
      .replace(/\bwhich you take when\b/gi, 'die du nimmst, wenn');
  }

  type SpellApiData = {
    index: string; name: string; level: number;
    school: { index: string };
    casting_time: string; range: string; duration: string; concentration: boolean; ritual: boolean;
    components: string[]; material?: string;
    classes: Array<{ index: string }>;
    desc: string[]; higher_level?: string[];
    damage?: {
      damage_type: { index: string; name: string };
      damage_at_slot_level?: Record<string, string>;
      damage_at_character_level?: Record<string, string>;
    };
    dc?: { dc_type: { index: string; name: string }; dc_success: string };
    area_of_effect?: { type: string; size: number };
  };

  async function loadFromApi(result: SpellApiResult) {
    const data = await apiGet(`${DND_API}/spells/${result.index}`) as SpellApiData;
    spell.index        = data.index;
    spell.name         = data.name;
    spell.level        = data.level;
    spell.school       = (data.school.index in SPELL_SCHOOLS ? data.school.index : 'evocation') as keyof typeof SPELL_SCHOOLS;
    spell.casting_time = convertCastingTime(data.casting_time);
    spell.range        = convertRange(data.range);
    spell.duration     = convertDuration(data.duration);
    spell.concentration = data.concentration;
    spell.ritual       = data.ritual;
    spell.components   = {
      verbal:           data.components.includes('V'),
      somatic:          data.components.includes('S'),
      material:         data.components.includes('M'),
      materials_needed: data.material ?? null,
    };
    spell.classes      = data.classes.map(c => c.index);
    spell.desc         = data.desc;
    spell.higher_level = data.higher_level?.length ? data.higher_level : null;
    spell.damage       = data.damage ? {
      damage_type: { index: data.damage.damage_type.index, name: data.damage.damage_type.name },
      damage_at_slot_level:      data.damage.damage_at_slot_level,
      damage_at_character_level: data.damage.damage_at_character_level,
    } : undefined;
    spell.dc           = data.dc ? {
      dc_type:    { index: data.dc.dc_type.index, name: data.dc.dc_type.name },
      dc_success: data.dc.dc_success,
    } : undefined;
    spell.area_of_effect = data.area_of_effect;
    spell.source       = 'SRD';
    spell.desc_de         = [];
    spell.higher_level_de = [];
    onchange();
  }

  // ── LLM-Übersetzung ───────────────────────────────────────────────────────────

  function buildTranslationPrompt(): string | null {
    const payload: Record<string, unknown> = {};
    if (spell.desc?.length)         payload.desc = spell.desc;
    if (spell.higher_level?.length) payload.higher_level = spell.higher_level;
    if (spell.components.material && spell.components.materials_needed)
      payload.materials_needed = spell.components.materials_needed;
    // Wenn englischer Inhalt vorhanden: Ausführungsfelder mitschicken
    // (Regex konvertiert nicht alle Fälle korrekt)
    if (spell.desc?.length) {
      payload.casting_time = spell.casting_time;
      payload.range        = spell.range;
      payload.duration     = spell.duration;
    }
    if (!Object.keys(payload).length) return null;
    return JSON.stringify(payload);
  }

  function applyTranslation(raw: string) {
    try {
      const result = JSON.parse(raw);
      if (Array.isArray(result.desc_de))             spell.desc_de = result.desc_de;
      if (Array.isArray(result.higher_level_de))     spell.higher_level_de = result.higher_level_de;
      if (typeof result.materials_needed === 'string')
        spell.components.materials_needed = result.materials_needed;
      if (typeof result.casting_time === 'string')   spell.casting_time = result.casting_time;
      if (typeof result.range        === 'string')   spell.range        = result.range;
      if (typeof result.duration     === 'string')   spell.duration     = result.duration;
      onchange();
    } catch { /* ignore */ }
  }
</script>

<!-- Grunddaten -->
<div class="sb-header">
  <input class="ef sb-name" bind:value={spell.name} oninput={mark} placeholder="Name" />
  <div class="meta-row">
    <select class="ef meta-sel" bind:value={spell.level} onchange={mark}>
      {#each LEVEL_OPTIONS as opt}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>
    <span class="sep">·</span>
    <select class="ef meta-sel" bind:value={spell.school} onchange={mark}>
      {#each Object.entries(SPELL_SCHOOLS) as [key, label]}
        <option value={key}>{label}</option>
      {/each}
    </select>
    <span class="sep">·</span>
    <label class="ef meta-sel chk-inline">
      <input type="checkbox" bind:checked={spell.ritual} onchange={mark} /> Ritual
    </label>
    <label class="ef meta-sel chk-inline">
      <input type="checkbox" bind:checked={spell.concentration} onchange={mark} /> Konzentration
    </label>
  </div>
</div>

<div class="divider"></div>

<!-- Ausführung -->
<div class="section">
  <div class="prop">
    <span class="lbl">Zauberdauer</span>
    <input class="ef wide" bind:value={spell.casting_time} oninput={mark} />
  </div>
  <div class="prop">
    <span class="lbl">Reichweite</span>
    <input class="ef wide" bind:value={spell.range} oninput={mark} />
  </div>
  <div class="prop">
    <span class="lbl">Dauer</span>
    <input class="ef wide" bind:value={spell.duration} oninput={mark} />
  </div>
  <div class="prop">
    <span class="lbl">Komponenten</span>
    <label class="chk"><input type="checkbox" bind:checked={spell.components.verbal}   onchange={mark} /> V</label>
    <label class="chk"><input type="checkbox" bind:checked={spell.components.somatic}  onchange={mark} /> G</label>
    <label class="chk"><input type="checkbox" bind:checked={spell.components.material} onchange={mark} /> M</label>
    {#if spell.components.material}
      <input class="ef wide" bind:value={spell.components.materials_needed} oninput={mark}
        placeholder="z.B. ein Rubin im Wert von 50 GM" />
    {/if}
  </div>
</div>

<div class="divider"></div>

<!-- Klassen -->
<div class="section">
  <div class="section-title">Klassen</div>
  <div class="class-grid">
    {#each SPELL_CLASS_KEYS as key}
      <label class="chk">
        <input
          type="checkbox"
          checked={spell.classes.includes(key)}
          onchange={(e) => {
            if ((e.target as HTMLInputElement).checked) {
              spell.classes = [...spell.classes, key];
            } else {
              spell.classes = spell.classes.filter(c => c !== key);
            }
            onchange();
          }}
        />
        {SPELL_CLASS_LABELS[key]}
      </label>
    {/each}
  </div>
</div>

<div class="divider"></div>

<!-- Beschreibung (DE) -->
<div class="section">
  <div class="section-title">Beschreibung (Deutsch)</div>
  <textarea class="ef ability-desc" rows={8}
    value={descDeText}
    oninput={(e) => setDescDe((e.target as HTMLTextAreaElement).value)}
  ></textarea>
  {#if spell.desc?.length}
    <button class="toggle-orig" onclick={() => { showOriginal = !showOriginal; }}>
      Original (EN) {showOriginal ? '▲' : '▼'}
    </button>
    {#if showOriginal}
      <div class="orig-text">{spell.desc.join('\n\n')}</div>
    {/if}
  {/if}
</div>

<div class="divider"></div>

<!-- Auf höheren Graden -->
<div class="section">
  <div class="section-title">Auf höheren Graden (Deutsch)</div>
  <textarea class="ef ability-desc" rows={3}
    value={higherLevelDeText}
    placeholder="Optional…"
    oninput={(e) => setHigherLevelDe((e.target as HTMLTextAreaElement).value)}
  ></textarea>
</div>

<!-- Optionale Strukturfelder -->
{#if spell.damage}
  <div class="divider"></div>
  <div class="section">
    <div class="section-title">Schaden</div>
    <div class="prop">
      <span class="lbl">Schadenstyp</span>
      <input class="ef wide" value={spell.damage.damage_type.name}
        oninput={(e) => { spell.damage!.damage_type.name = (e.target as HTMLInputElement).value; onchange(); }} />
    </div>
  </div>
{/if}

{#if spell.dc}
  <div class="divider"></div>
  <div class="section">
    <div class="section-title">Rettungswurf</div>
    <div class="prop">
      <span class="lbl">Attribut</span>
      <select class="ef" value={spell.dc.dc_type.index}
        onchange={(e) => {
          const idx = (e.target as HTMLSelectElement).value;
          const found = DC_TYPES.find(d => d.index === idx);
          if (found) { spell.dc!.dc_type = found; onchange(); }
        }}>
        {#each DC_TYPES as d}<option value={d.index}>{d.name}</option>{/each}
      </select>
      <span class="lbl-sm">Erfolg</span>
      <select class="ef" bind:value={spell.dc.dc_success} onchange={mark}>
        <option value="half">Halber Schaden</option>
        <option value="none">Kein Effekt</option>
        <option value="other">Anderes</option>
      </select>
    </div>
  </div>
{/if}

{#if spell.area_of_effect}
  <div class="divider"></div>
  <div class="section">
    <div class="section-title">Wirkungsbereich</div>
    <div class="prop">
      <span class="lbl">Form</span>
      <select class="ef" bind:value={spell.area_of_effect.type} onchange={mark}>
        {#each AOE_TYPES as t}<option value={t}>{AOE_LABELS[t] ?? t}</option>{/each}
      </select>
      <span class="lbl-sm">Größe (ft)</span>
      <input class="ef num" type="number" bind:value={spell.area_of_effect.size} oninput={mark} />
    </div>
  </div>
{/if}

<div class="divider"></div>

<!-- LLM-Übersetzung -->
<div class="section">
  <LlmTranslate
    systemPrompt={TRANSLATION_SYSTEM_PROMPT}
    buildPrompt={buildTranslationPrompt}
    onresult={applyTranslation}
  />
</div>

<!-- DnD-API -->
<div class="section">
  <DndApiSearch
    placeholder="Englischer Zaubername…"
    onsearch={searchSpells}
    onselect={loadFromApi}
  />
</div>

<style>
  /* ── Basis-Input ── */
  .ef {
    background: var(--bg-panel);
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--ink);
    font-family: inherit;
    font-size: 0.88rem;
    padding: 0.15rem 0.3rem;
    outline: none;
  }
  .ef:hover { border-color: var(--border); background: var(--bg-panel); }
  .ef:focus { border-color: var(--mef-accent, var(--arcane)); background: var(--bg-panel); }

  /* ── Header ── */
  .sb-header { margin-bottom: 0.4rem; }

  .sb-name {
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--mef-accent, var(--arcane));
    font-variant: small-caps;
    width: 100%;
    margin-bottom: 0.1rem;
  }

  .meta-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.15rem;
    font-style: italic;
    color: var(--ink-soft);
    font-size: 0.85rem;
  }

  .meta-sel {
    font-style: italic;
    color: var(--ink-soft);
    font-size: 0.85rem;
    background: var(--bg-panel);
    cursor: pointer;
    padding: 0.1rem 0.2rem;
    border: 1px solid transparent;
    border-radius: 3px;
  }
  .meta-sel:hover { border-color: var(--border); }
  .meta-sel:focus { border-color: var(--mef-accent, var(--arcane)); outline: none; }

  .chk-inline {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    cursor: pointer;
    font-style: normal;
    font-size: 0.82rem;
  }

  .sep { color: var(--ink-soft); padding: 0 0.1rem; }

  /* ── Divider ── */
  .divider {
    height: 2px;
    background: linear-gradient(to right, var(--bg-raised), var(--mef-accent, var(--arcane)) 55%);
    margin: 0.6rem 0;
    border-radius: 1px;
  }

  /* ── Section ── */
  .section { display: flex; flex-direction: column; gap: 0.15rem; }

  .section-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--mef-accent, var(--arcane));
    margin: 0 0 0.3rem;
    font-variant: small-caps;
    border-bottom: 1px solid var(--mef-accent, var(--arcane));
    padding-bottom: 0.15rem;
  }

  .prop {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.2rem;
    line-height: 1.8;
  }

  .lbl    { font-weight: 700; color: var(--mef-accent, var(--arcane)); white-space: nowrap; }
  .lbl-sm { font-weight: 700; color: var(--mef-accent, var(--arcane)); font-size: 0.78rem; white-space: nowrap; opacity: 0.7; }

  .wide { flex: 1; min-width: 120px; }
  .num  { width: 52px; text-align: center; }

  /* ── Checkboxen ── */
  .chk {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.82rem;
    color: var(--ink-soft);
    cursor: pointer;
    white-space: nowrap;
  }

  /* ── Klassenraster ── */
  .class-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4rem;
  }

  /* ── Textareas ── */
  .ability-desc {
    width: 100%;
    resize: vertical;
    line-height: 1.5;
    font-size: 0.85rem;
    color: var(--ink);
    min-height: 2.5rem;
  }

  /* ── Original-Anzeige ── */
  .toggle-orig {
    background: none; border: none; color: var(--border);
    font-size: 0.75rem; cursor: pointer; padding: 0;
    font-family: inherit; align-self: flex-start;
  }
  .toggle-orig:hover { color: var(--mef-accent, var(--arcane)); }

  .orig-text {
    background: var(--bg-deep);
    border: 1px solid var(--surface);
    border-radius: 4px;
    color: var(--ink-muted);
    font-size: 0.8rem;
    line-height: 1.6;
    padding: 0.5rem 0.7rem;
    white-space: pre-wrap;
    font-style: italic;
  }
</style>
