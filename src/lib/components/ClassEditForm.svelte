<script lang="ts">
  import type { ClassProgression, ClassFeature } from '$lib/types';
  import { ABILITY_KEYS } from '$lib/schemas/classProgression';

  let {
    klass = $bindable<ClassProgression>(),
    onchange = () => void 0,
  }: {
    klass: ClassProgression;
    onchange?: () => void;
  } = $props();

  const CASTER_TYPES = ['NONE', 'FULL', 'HALF', 'THIRD', 'PACT'];
  const ABILITY_LABELS: Record<string, string> = {
    str: 'STÄ', ges: 'GES', kon: 'KON', int: 'INT', wei: 'WEI', cha: 'CHA',
  };

  function mark() { onchange(); }

  function toggleSave(key: (typeof ABILITY_KEYS)[number], checked: boolean) {
    klass.savingThrows = checked
      ? [...klass.savingThrows, key]
      : klass.savingThrows.filter((k) => k !== key);
    onchange();
  }

  function addFeature() {
    const feat: ClassFeature = { key: '', name: '', gainedAt: [], desc: '' };
    klass.features = [...klass.features, feat];
    onchange();
  }

  function removeFeature(i: number) {
    klass.features = klass.features.filter((_, idx) => idx !== i);
    onchange();
  }

  function setGainedAt(f: ClassFeature, text: string) {
    f.gainedAt = text.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
    onchange();
  }
</script>

<!-- Grunddaten -->
<div class="sb-header">
  <input class="ef sb-name" bind:value={klass.nameDe} oninput={mark} placeholder="Deutscher Name" />
  <input class="ef sb-name-en" bind:value={klass.name} oninput={mark} placeholder="Name (EN)" />
  <div class="meta-row">
    <label class="lbl-inline">Zaubertyp
      <select class="ef meta-sel" bind:value={klass.casterType} onchange={mark}>
        {#each CASTER_TYPES as ct}<option value={ct}>{ct}</option>{/each}
      </select>
    </label>
    <label class="lbl-inline">Trefferwürfel W
      <input class="ef num" type="number" bind:value={klass.hitDie} oninput={mark} />
    </label>
  </div>
</div>

<div class="divider"></div>

<!-- Rettungswürfe -->
<div class="section">
  <div class="section-title">Rettungswürfe</div>
  <div class="save-grid">
    {#each ABILITY_KEYS as key}
      <label class="chk">
        <input
          type="checkbox"
          checked={klass.savingThrows.includes(key)}
          onchange={(e) => toggleSave(key, (e.target as HTMLInputElement).checked)}
        />
        {ABILITY_LABELS[key]}
      </label>
    {/each}
  </div>
</div>

<div class="divider"></div>

<!-- Merkmale -->
<div class="section">
  <div class="section-title">Merkmale</div>
  {#each klass.features as feature, i}
    <div class="feat-row">
      <div class="feat-line">
        <input class="ef feat-name" bind:value={feature.nameDe} oninput={mark} placeholder="Merkmal (DE)" />
        <input class="ef feat-name-en" bind:value={feature.name} oninput={mark} placeholder="Name (EN)" />
        <input
          class="ef feat-levels"
          value={feature.gainedAt.join(', ')}
          oninput={(e) => setGainedAt(feature, (e.target as HTMLInputElement).value)}
          placeholder="Stufen"
          title="Stufen, z.B. 1, 4, 8"
        />
        <button class="feat-del" onclick={() => removeFeature(i)} title="Merkmal entfernen">×</button>
      </div>
      <textarea class="ef feat-desc" rows={3} bind:value={feature.descDe} oninput={mark} placeholder="Beschreibung (DE)"></textarea>
      {#if feature.desc}
        <details class="orig-details">
          <summary>Original (EN)</summary>
          <div class="orig-text">{feature.desc}</div>
        </details>
      {/if}
    </div>
  {/each}
  <button class="add-feat" onclick={addFeature}>+ Merkmal</button>
</div>

<style>
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
  .ef:hover { border-color: var(--border); }
  .ef:focus { border-color: var(--mef-accent, var(--arcane)); }

  .sb-header { margin-bottom: 0.4rem; display: flex; flex-direction: column; gap: 0.15rem; }
  .sb-name {
    font-size: 1.3rem; font-weight: 700; color: var(--mef-accent, var(--arcane));
    font-variant: small-caps; width: 100%;
  }
  .sb-name-en { font-size: 0.85rem; color: var(--ink-soft); font-style: italic; width: 100%; }

  .meta-row { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 0.3rem; }
  .lbl-inline {
    display: inline-flex; align-items: center; gap: 0.3rem;
    font-size: 0.8rem; color: var(--ink-soft);
  }
  .meta-sel { cursor: pointer; }
  .num { width: 56px; text-align: center; }

  .divider {
    height: 2px;
    background: linear-gradient(to right, var(--bg-raised), var(--mef-accent, var(--arcane)) 55%);
    margin: 0.6rem 0; border-radius: 1px;
  }

  .section { display: flex; flex-direction: column; gap: 0.35rem; }
  .section-title {
    font-size: 1rem; font-weight: 700; color: var(--mef-accent, var(--arcane));
    margin: 0 0 0.3rem; font-variant: small-caps;
    border-bottom: 1px solid var(--mef-accent, var(--arcane)); padding-bottom: 0.15rem;
  }

  .save-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.3rem; }
  .chk {
    display: inline-flex; align-items: center; gap: 0.2rem;
    font-size: 0.8rem; color: var(--ink-soft); cursor: pointer;
  }

  .feat-row {
    display: flex; flex-direction: column; gap: 0.25rem;
    padding: 0.4rem 0; border-bottom: 1px solid var(--surface);
  }
  .feat-line { display: flex; gap: 0.3rem; align-items: center; }
  .feat-name { flex: 2; font-weight: 600; }
  .feat-name-en { flex: 2; font-style: italic; color: var(--ink-soft); font-size: 0.8rem; }
  .feat-levels { width: 80px; text-align: center; font-size: 0.8rem; }
  .feat-del {
    background: none; border: none; color: var(--ink-muted); font-size: 1.1rem;
    cursor: pointer; line-height: 1; flex-shrink: 0; padding: 0 0.2rem;
  }
  .feat-del:hover { color: var(--danger); }
  .feat-desc { width: 100%; resize: vertical; line-height: 1.5; font-size: 0.85rem; }

  .orig-details { font-size: 0.78rem; }
  .orig-details summary { color: var(--border); cursor: pointer; }
  .orig-details summary:hover { color: var(--mef-accent, var(--arcane)); }
  .orig-text {
    background: var(--bg-deep); border: 1px solid var(--surface); border-radius: 4px;
    color: var(--ink-muted); font-size: 0.8rem; line-height: 1.6;
    padding: 0.4rem 0.6rem; white-space: pre-wrap; font-style: italic; margin-top: 0.2rem;
  }

  .add-feat {
    align-self: flex-start; background: var(--surface); border: 1px solid var(--border);
    border-radius: 4px; color: var(--ink-soft); cursor: pointer;
    font-family: inherit; font-size: 0.8rem; padding: 0.25rem 0.6rem; margin-top: 0.3rem;
  }
  .add-feat:hover { border-color: var(--mef-accent, var(--arcane)); color: var(--mef-accent, var(--arcane)); }
</style>
