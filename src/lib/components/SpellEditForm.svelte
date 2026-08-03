<script lang="ts">
  import type { Spell } from '../types';
  import { SPELL_SCHOOLS, SPELL_CLASS_KEYS, SPELL_CLASS_LABELS } from '../types';
  import FormSection from './ui/FormSection.svelte';

  let {
    spell = $bindable<Spell>(),
    onchange = () => void 0,
  }: {
    spell: Spell;
    onchange?: () => void;
  } = $props();

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

<!-- Ausführung -->
<FormSection gap="0.15rem">
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
</FormSection>

<!-- Klassen -->
<FormSection title="Klassen" gap="0.15rem">
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
</FormSection>

<!-- Beschreibung (DE) -->
<FormSection title="Beschreibung (Deutsch)" gap="0.15rem">
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
</FormSection>

<!-- Auf höheren Graden -->
<FormSection title="Auf höheren Graden (Deutsch)" gap="0.15rem">
  <textarea class="ef ability-desc" rows={3}
    value={higherLevelDeText}
    placeholder="Optional…"
    oninput={(e) => setHigherLevelDe((e.target as HTMLTextAreaElement).value)}
  ></textarea>
</FormSection>

<!-- Optionale Strukturfelder -->
{#if spell.damage}
  <FormSection title="Schaden" gap="0.15rem">
    <div class="prop">
      <span class="lbl">Schadenstyp</span>
      <input class="ef wide" value={spell.damage.damage_type.name}
        oninput={(e) => { spell.damage!.damage_type.name = (e.target as HTMLInputElement).value; onchange(); }} />
    </div>
  </FormSection>
{/if}

{#if spell.dc}
  <FormSection title="Rettungswurf" gap="0.15rem">
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
  </FormSection>
{/if}

{#if spell.area_of_effect}
  <FormSection title="Wirkungsbereich" gap="0.15rem">
    <div class="prop">
      <span class="lbl">Form</span>
      <select class="ef" bind:value={spell.area_of_effect.type} onchange={mark}>
        {#each AOE_TYPES as t}<option value={t}>{AOE_LABELS[t] ?? t}</option>{/each}
      </select>
      <span class="lbl-sm">Größe (ft)</span>
      <input class="ef num" type="number" bind:value={spell.area_of_effect.size} oninput={mark} />
    </div>
  </FormSection>
{/if}

<style>
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

  .chk {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.82rem;
    color: var(--ink-soft);
    cursor: pointer;
    white-space: nowrap;
  }

  .class-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4rem;
  }

  .ability-desc {
    width: 100%;
    resize: vertical;
    line-height: 1.5;
    font-size: 0.85rem;
    color: var(--ink);
    min-height: 2.5rem;
  }

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
