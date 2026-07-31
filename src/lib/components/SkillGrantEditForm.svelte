<script lang="ts">
  /**
   * Editor für einen `skillGrant` — die 18 Fertigkeiten als Raster mit zwei
   * Häkchen je Zeile: „fest gewährt" und „in der Auswahlliste". Genau die Form,
   * die auch der Charakterbogen benutzt (Übung | Expertise), damit das Muster
   * wiedererkennbar bleibt.
   *
   * Die Werte sind ENGLISCH (`SkillName`), die Beschriftung deutsch — die
   * Übersetzung kommt aus derselben `SKILL_DEFS`-Tabelle wie der Bogen-Schlüssel.
   */
  import { SKILL_DEFS } from '$lib/domain/skills';
  import type { SkillGrant } from '$lib/schemas/grants';
  import type { SkillName } from '$lib/schemas/vocabulary';

  let {
    grant = $bindable<SkillGrant>(),
    onchange = () => void 0,
  }: {
    grant: SkillGrant;
    onchange?: () => void;
  } = $props();

  function toggle(list: 'fixed' | 'from', skill: SkillName, checked: boolean) {
    grant[list] = checked ? [...grant[list], skill] : grant[list].filter((s) => s !== skill);
    onchange();
  }

  function setChoose(value: string) {
    grant.choose = Math.max(0, Math.min(18, parseInt(value, 10) || 0));
    onchange();
  }
</script>

<div class="choose-row">
  <label class="lbl-inline">Zur Wahl
    <input class="ef num" type="number" min="0" max="18" value={grant.choose} oninput={(e) => setChoose((e.target as HTMLInputElement).value)} />
  </label>
  <span class="hint">
    {#if grant.choose > 0}
      {grant.from.length ? `${grant.choose} aus ${grant.from.length} markierten` : `${grant.choose} aus ALLEN Fertigkeiten`}
    {:else}
      nur feste Fertigkeiten
    {/if}
  </span>
</div>

<div class="skill-grid">
  <div class="skill-head"><span class="col">fest</span><span class="col">Wahl</span><span></span></div>
  {#each SKILL_DEFS as def}
    <div class="skill-row">
      <input
        type="checkbox"
        title="Ohne Wahl gewährt"
        checked={grant.fixed.includes(def.en)}
        onchange={(e) => toggle('fixed', def.en, (e.target as HTMLInputElement).checked)}
      />
      <input
        type="checkbox"
        title="Teil der Auswahlliste"
        checked={grant.from.includes(def.en)}
        onchange={(e) => toggle('from', def.en, (e.target as HTMLInputElement).checked)}
      />
      <span class="skill-name" class:fixed={grant.fixed.includes(def.en)}>{def.label}</span>
    </div>
  {/each}
</div>

<style>
  .num { width: 56px; text-align: center; }

  .choose-row { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.3rem; }
  .hint { font-size: 0.75rem; color: var(--ink-muted); font-style: italic; }

  .skill-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.1rem 0.8rem; }
  .skill-head {
    grid-column: 1 / -1; display: grid; grid-template-columns: 1.1rem 1.1rem 1fr;
    font-size: 0.68rem; color: var(--ink-muted); text-transform: uppercase; letter-spacing: 0.04em;
  }
  .skill-head .col { text-align: center; }
  .skill-row {
    display: grid; grid-template-columns: 1.1rem 1.1rem 1fr; align-items: center; gap: 0.2rem;
    font-size: 0.8rem; color: var(--ink-soft);
  }
  .skill-row input { margin: 0; }
  .skill-name.fixed { color: var(--ink); font-weight: 600; }
</style>
