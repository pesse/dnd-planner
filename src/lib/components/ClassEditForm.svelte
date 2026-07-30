<script lang="ts">
  import { onMount } from 'svelte';
  import type { ClassProgression, ClassFeature } from '$lib/types';
  import { featureChoiceGrantSchema, type FeatureChoiceGrant } from '$lib/schemas/shared';
  import { getClasses, classDisplayName, type ClassInfo } from '$lib/classLibrary';
  import ProficiencyGrantEditForm from './ProficiencyGrantEditForm.svelte';
  import SkillGrantEditForm from './SkillGrantEditForm.svelte';
  import ChoiceOptionEditForm from './ChoiceOptionEditForm.svelte';

  let {
    klass = $bindable<ClassProgression>(),
    onchange = () => void 0,
  }: {
    klass: ClassProgression;
    onchange?: () => void;
  } = $props();

  const CASTER_TYPES = ['NONE', 'FULL', 'HALF', 'THIRD', 'PACT'];

  // Basisklassen für die „Subklasse von"-Auswahl (ohne sich selbst, nur mit v2-Key).
  let baseClasses = $state<ClassInfo[]>([]);
  onMount(async () => {
    const all = await getClasses();
    baseClasses = all.filter((c) => !c.subclassOf && c.key && c.key !== klass.key);
  });

  function setParent(value: string) {
    klass.subclassOf = value || undefined;
    onchange();
  }

  function mark() { onchange(); }

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

  // Die deklarierbaren Wahl-Formen. `optionList` ist die Form, in der die Redaktion der
  // Bibliothek stattfindet (Zweigwahl mit Konsequenz je Option); `expertise` deklariert nur
  // eine Anzahl. Was hier NICHT steht (`spellAccess`), bleibt Hand-JSON und läuft über 'other'.
  const CHOICE_LABELS: Record<string, string> = {
    weaponMastery: 'Waffenmeisterschaft',
    fightingStyle: 'Kampfstil',
    spellcasting: 'Zauberwirken',
    optionList: 'Optionsliste (Zweigwahl)',
    expertise: 'Expertise',
  };

  // Flach-Wert für das Dropdown; 'other' = hand-editiertes grantsChoice, das keinem
  // der Werte entspricht → nur lesbar anzeigen, nie überschreiben (Roh-JSON bleibt autoritativ).
  function choiceKindOf(f: ClassFeature): string {
    const g = f.grantsChoice;
    if (!g) return 'none';
    if (g.kind === 'weaponMastery') return 'weaponMastery';
    if (g.kind === 'spellcasting') return 'spellcasting';
    if (g.kind === 'optionList') return 'optionList';
    if (g.kind === 'expertise') return 'expertise';
    if (g.kind === 'featCategory' && g.featCategory === 'Fighting Style') return 'fightingStyle';
    return 'other';
  }

  // Die Listenfelder der Zugangs-Wahl (`spellLists` & Co.) füllt das Schema — hand-gesetzte
  // Literale fehlen sonst bei jedem neuen Feld.
  const newGrant = (g: Partial<FeatureChoiceGrant>): FeatureChoiceGrant => featureChoiceGrantSchema.parse(g);

  function setChoiceKind(f: ClassFeature, value: string) {
    const prev = f.grantsChoice;
    let next: FeatureChoiceGrant | undefined;
    if (value === 'weaponMastery') next = newGrant({ kind: 'weaponMastery', count: 1 });
    else if (value === 'spellcasting') next = newGrant({ kind: 'spellcasting', count: 1 });
    else if (value === 'fightingStyle')
      next = newGrant({ kind: 'featCategory', featCategory: 'Fighting Style', count: prev?.count ?? 1 });
    // Beim Wechsel die schon redigierten Optionen bzw. die Anzahl mitnehmen — ein Fehlgriff
    // im Dropdown soll keine Redaktionsarbeit löschen.
    else if (value === 'optionList') next = newGrant({ kind: 'optionList', options: prev?.options ?? [] });
    else if (value === 'expertise') next = newGrant({ kind: 'expertise', count: prev?.count ?? 1 });
    if (next) f.grantsChoice = next;
    onchange();
  }

  // Checkbox „Gewährt Wahl": an → Default weaponMastery; aus → Feld entfernen.
  function toggleChoice(f: ClassFeature, on: boolean) {
    f.grantsChoice = on ? newGrant({ kind: 'weaponMastery', count: 1 }) : undefined;
    onchange();
  }
</script>

<!-- Grunddaten -->
<div class="sb-header">
  <input class="ef sb-name" bind:value={klass.nameDe} oninput={mark} placeholder="Deutscher Name" />
  <input class="ef sb-name-en" bind:value={klass.name} oninput={mark} placeholder="Name (EN)" />
  <div class="meta-row">
    <label class="lbl-inline">Schlüssel
      <input class="ef key-input" bind:value={klass.key} oninput={mark} placeholder="z.B. srd-2024_wizard" />
    </label>
    <label class="lbl-inline">Zaubertyp
      <select class="ef meta-sel" bind:value={klass.casterType} onchange={mark}>
        {#each CASTER_TYPES as ct}<option value={ct}>{ct}</option>{/each}
      </select>
    </label>
    <label class="lbl-inline">Trefferwürfel W
      <input class="ef num" type="number" bind:value={klass.hitDie} oninput={mark} />
    </label>
    <label class="lbl-inline">Subklasse von
      <select
        class="ef meta-sel"
        value={klass.subclassOf ?? ''}
        onchange={(e) => setParent((e.target as HTMLSelectElement).value)}
      >
        <option value="">— (eigenständige Klasse)</option>
        {#each baseClasses as b}
          <option value={b.key}>{classDisplayName(b)}</option>
        {/each}
        {#if klass.subclassOf && !baseClasses.some((b) => b.key === klass.subclassOf)}
          <option value={klass.subclassOf}>{klass.subclassOf}</option>
        {/if}
      </select>
    </label>
  </div>
</div>

<div class="divider"></div>

<!-- Kerntabelle: Übungen (englische Werte, deutsche Beschriftung) -->
<div class="section">
  <div class="section-title">Kerntabelle</div>
  <ProficiencyGrantEditForm bind:grant={klass.proficiencyGrant} {onchange} />

  <!-- Englisch ist der Prompt-Input des Wizards, Deutsch nur Anzeige (darf leer bleiben). -->
  <label class="lbl-block">Anfangsausrüstung (Prosa, englisch)
    <textarea class="ef equip" rows={2} bind:value={klass.startingEquipment} oninput={mark}
      placeholder="Choose A or B: (A) …; or (B) 75 GP"></textarea>
  </label>

  <label class="lbl-block">Anfangsausrüstung (Prosa, deutsch)
    <textarea class="ef equip" rows={2} bind:value={klass.startingEquipmentDe} oninput={mark}
      placeholder="Wähle A oder B aus: (A) … oder (B) 75 GM"></textarea>
  </label>
</div>

<div class="divider"></div>

<!-- Mehrklassen-Zeile: steht nicht in Open5e, wird hier gepflegt -->
<div class="section">
  <div class="section-title">Bei Klassenkombination</div>
  <p class="section-hint">
    Fertigkeiten, die diese Klasse gewährt, wenn sie als ZWEITE Klasse dazukommt.
    Im SRD 5.2 nur Barde, Schurke und Waldläufer — alle übrigen gewähren keine.
  </p>
  <SkillGrantEditForm bind:grant={klass.skillGrantMulticlass} {onchange} />
</div>

<div class="divider"></div>

<!-- Merkmale -->
<div class="section">
  <div class="section-title">Merkmale</div>
  <p class="section-hint">
    „Gewährt Wahl" deklariert die Wahl eines Merkmals — der Aufstieg führt sie dann aus
    Bibliothek bzw. Deklaration statt aus der KI-Deutung der Beschreibung. Ohne Deklaration
    bleibt das Merkmal in der KI-Kette; das ist der Fallback, kein Fehler.
  </p>
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
      <div class="feat-choice">
        <label class="lbl-inline choice-toggle" class:off={!feature.grantsChoice}>
          <input
            type="checkbox"
            checked={!!feature.grantsChoice}
            onchange={(e) => toggleChoice(feature, (e.target as HTMLInputElement).checked)}
          />
          Gewährt Wahl
        </label>
        <select
          class="ef meta-sel"
          disabled={!feature.grantsChoice}
          value={feature.grantsChoice ? choiceKindOf(feature) : 'weaponMastery'}
          onchange={(e) => setChoiceKind(feature, (e.target as HTMLSelectElement).value)}
        >
          {#each Object.entries(CHOICE_LABELS) as [val, label]}
            <option value={val}>{label}</option>
          {/each}
          {#if choiceKindOf(feature) === 'other'}
            <option value="other" disabled selected>
              Aus JSON: {feature.grantsChoice?.kind}{feature.grantsChoice?.featCategory
                ? ` / ${feature.grantsChoice.featCategory}`
                : ''}
            </option>
          {/if}
        </select>
        {#if feature.grantsChoice && choiceKindOf(feature) === 'fightingStyle'}
          <span class="feat-choice-count">Anzahl
            <input class="ef num" type="number" min="1" bind:value={feature.grantsChoice.count} oninput={mark} />
          </span>
        {/if}
        {#if feature.grantsChoice && choiceKindOf(feature) === 'expertise'}
          <span class="feat-choice-count">Fertigkeiten
            <input class="ef num" type="number" min="1" bind:value={feature.grantsChoice.count} oninput={mark} />
          </span>
          <!-- Die Optionen sind zur Laufzeit die geübten Fertigkeiten DIESES Charakters,
               deshalb gibt es hier nichts zu wählen. -->
          <span class="choice-note">Optionen zur Laufzeit: die geübten Fertigkeiten des Charakters</span>
        {/if}
      </div>
      {#if feature.grantsChoice && choiceKindOf(feature) === 'optionList'}
        <div class="feat-options">
          <ChoiceOptionEditForm bind:options={feature.grantsChoice.options} {onchange} />
        </div>
      {/if}
      <textarea class="ef feat-desc" rows={3} bind:value={feature.descDe} oninput={mark} placeholder="Beschreibung (DE)"></textarea>
      <details class="orig-details">
        <summary>Original (EN)</summary>
        <textarea class="ef orig-text" rows={3} bind:value={feature.desc} oninput={mark} placeholder="Beschreibung (EN)"></textarea>
      </details>
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
  .key-input { font-family: ui-monospace, monospace; font-size: 0.78rem; color: var(--ink-muted); min-width: 160px; }

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

  .section-hint { font-size: 0.75rem; color: var(--ink-muted); font-style: italic; margin: 0 0 0.2rem; }
  .lbl-block {
    display: flex; flex-direction: column; gap: 0.15rem;
    font-size: 0.8rem; color: var(--ink-soft); margin-top: 0.5rem;
  }
  .equip { width: 100%; resize: vertical; line-height: 1.5; font-size: 0.85rem; }

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

  .feat-choice { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; font-size: 0.78rem; }
  .choice-toggle { cursor: pointer; }
  .choice-toggle input { cursor: pointer; }
  .choice-toggle.off { color: var(--ink-muted); opacity: 0.6; }
  .feat-choice select:disabled { opacity: 0.45; cursor: not-allowed; }
  .feat-choice-count { display: inline-flex; align-items: center; gap: 0.3rem; }
  .feat-choice .num { width: 48px; }
  .choice-note { font-size: 0.72rem; color: var(--ink-muted); font-style: italic; }
  .feat-options { border-left: 2px solid var(--surface); padding-left: 0.5rem; margin: 0.1rem 0 0.2rem; }

  .orig-details { font-size: 0.78rem; }
  .orig-details summary { color: var(--border); cursor: pointer; }
  .orig-details summary:hover { color: var(--mef-accent, var(--arcane)); }
  .orig-text {
    background: var(--bg-deep); border: 1px solid var(--surface); border-radius: 4px;
    color: var(--ink-muted); font-size: 0.8rem; line-height: 1.6;
    padding: 0.4rem 0.6rem; white-space: pre-wrap; font-style: italic; margin-top: 0.2rem;
    width: 100%; resize: vertical; font-family: inherit;
  }

  .add-feat {
    align-self: flex-start; background: var(--surface); border: 1px solid var(--border);
    border-radius: 4px; color: var(--ink-soft); cursor: pointer;
    font-family: inherit; font-size: 0.8rem; padding: 0.25rem 0.6rem; margin-top: 0.3rem;
  }
  .add-feat:hover { border-color: var(--mef-accent, var(--arcane)); color: var(--mef-accent, var(--arcane)); }
</style>
