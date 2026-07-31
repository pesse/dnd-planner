<script module lang="ts">
  import {
    CLASS_TABLE_CHOICE_KINDS,
    FEATURE_CHOICE_KINDS,
    type FeatureChoiceGrant,
    type FeatureChoiceKind,
    type FeatureGrant,
    type SpellGrant,
  } from '$lib/schemas/shared';

  /** Was ein Merkmal deklarieren kann — Klassenmerkmal, Trait und Talent erfüllen es. */
  export interface DeclarationTarget {
    grants?: FeatureGrant;
    grantsChoice?: FeatureChoiceGrant;
    grantsSpells?: SpellGrant;
  }

  /** Klassenmerkmal oder Trait/Talent — der einzige Prop-Unterschied der drei Karteneditoren. */
  export type DeclarationCarrier = 'class' | 'feature';

  /**
   * Flacher Dropdown-Wert je `kind`: `fightingStyle` ist in Wahrheit
   * `featCategory: 'Fighting Style'`, die einzige Kategorie, die ein Merkmal gewährt.
   */
  const KIND_UI: Record<FeatureChoiceKind, { value: string; de: string }> = {
    weaponMastery: { value: 'weaponMastery', de: 'Waffenbeherrschung' },
    featCategory: { value: 'fightingStyle', de: 'Kampfstil' },
    spellcasting: { value: 'spellcasting', de: 'Zauberwirken' },
    spellAccess: { value: 'spellAccess', de: 'Zauber-Zugang' },
    optionList: { value: 'optionList', de: 'Optionsliste (Zweigwahl)' },
    expertise: { value: 'expertise', de: 'Expertise' },
  };

  /**
   * Abgeleitet aus der SENKE des `kind`, nicht je Artefakt gepflegt: was die Klassen-
   * Stufentabelle braucht, kann ein Trait/Talent nicht auflösen — alles andere gilt überall.
   * Eine Hand-Liste je Träger hatte genau die Asymmetrie zurückgebracht, die die eine
   * Deklaration löscht (und `spellAccess` ganz verloren, obwohl nur Talente es tragen).
   */
  export function kindOptions(carrier: DeclarationCarrier): { value: string; de: string }[] {
    return FEATURE_CHOICE_KINDS.filter(
      (k) => carrier === 'class' || !CLASS_TABLE_CHOICE_KINDS.includes(k),
    ).map((k) => KIND_UI[k]);
  }
</script>

<script lang="ts">
  /**
   * Editor der DREI Deklarationen eines Merkmals (`featureDeclarationFields`, schemas/shared.ts).
   *
   * Ein Panel für Klassenmerkmal, Speziesmerkmal und Talent: `kinds` ist das einzige, was die
   * drei Karteneditoren unterschiedlich übergeben. Vorher lag dieselbe Logik dreimal.
   *
   * Jede Checkbox schaltet zwischen FEHLENDEM Feld („nie angesehen", läuft weiter über die
   * KI-Kette) und einem geparsten Default („geprüft"). Diese Unterscheidung ist der Grund,
   * weshalb die Felder optional ohne Default sind — sie darf die UI nicht einebnen.
   */
  import { featureChoiceGrantSchema, featureGrantSchema, spellGrantSchema } from '$lib/schemas/shared';
  import ChoiceOptionEditForm from './ChoiceOptionEditForm.svelte';
  import FeatureGrantEditForm from './FeatureGrantEditForm.svelte';
  import SpellAccessEditForm from './SpellAccessEditForm.svelte';

  let {
    feature = $bindable<DeclarationTarget>(),
    carrier = 'feature',
    scope = 'full',
    onchange = () => void 0,
  }: {
    feature: DeclarationTarget;
    carrier?: DeclarationCarrier;
    /** 'skills' reicht bis in die Übungen durch (Trait/Talent gewähren i.d.R. nur diese). */
    scope?: 'full' | 'skills';
    onchange?: () => void;
  } = $props();

  const mark = () => onchange();

  let kinds = $derived(kindOptions(carrier));

  /** Der Default beim Einschalten — die generische Form, an jedem Träger gültig. */
  const DEFAULT_KIND = 'optionList';

  /** Flach-Wert fürs Dropdown; 'other' = hand-editiert, Roh-JSON bleibt autoritativ. */
  function kindOf(f: DeclarationTarget): string {
    const g = f.grantsChoice;
    if (!g) return 'none';
    if (g.kind === 'featCategory' && g.featCategory !== 'Fighting Style') return 'other';
    const value = KIND_UI[g.kind].value;
    return kinds.some((k) => k.value === value) ? value : 'other';
  }

  // Die Listenfelder (`spellLists` & Co.) füllt das Schema — hand-gesetzte Literale fehlten
  // sonst bei jedem neuen Feld.
  const newChoice = (g: Partial<FeatureChoiceGrant>): FeatureChoiceGrant => featureChoiceGrantSchema.parse(g);

  function setKind(value: string) {
    const prev = feature.grantsChoice;
    // Beim Wechsel Optionen bzw. Anzahl mitnehmen: ein Fehlgriff im Dropdown soll keine
    // Redaktionsarbeit löschen.
    if (value === 'fightingStyle')
      feature.grantsChoice = newChoice({ kind: 'featCategory', featCategory: 'Fighting Style', count: prev?.count ?? 1 });
    else if (value === 'optionList') feature.grantsChoice = newChoice({ kind: 'optionList', options: prev?.options ?? [] });
    else if (value === 'spellAccess')
      feature.grantsChoice = newChoice({
        kind: 'spellAccess',
        spellLists: prev?.spellLists ?? [],
        spellAbilities: prev?.spellAbilities ?? [],
        spellPicks: prev?.spellPicks ?? [],
      });
    else if (value !== 'other' && value !== 'none')
      feature.grantsChoice = newChoice({ kind: value as FeatureChoiceKind, count: prev?.count ?? 1 });
    onchange();
  }

  const toggleChoice = (on: boolean) => {
    feature.grantsChoice = on ? newChoice({ kind: DEFAULT_KIND, options: [] }) : undefined;
    onchange();
  };
  const toggleGrants = (on: boolean) => {
    feature.grants = on ? featureGrantSchema.parse({}) : undefined;
    onchange();
  };
  const toggleSpells = (on: boolean) => {
    feature.grantsSpells = on ? spellGrantSchema.parse({ kind: 'levelTable' }) : undefined;
    onchange();
  };
</script>

<div class="decl">
  <div class="row">
    <label class="lbl" class:off={!feature.grantsChoice}>
      <input type="checkbox" checked={!!feature.grantsChoice} onchange={(e) => toggleChoice((e.target as HTMLInputElement).checked)} />
      Gewährt Wahl
    </label>
    <select
      class="ef sel"
      disabled={!feature.grantsChoice}
      value={feature.grantsChoice ? kindOf(feature) : DEFAULT_KIND}
      onchange={(e) => setKind((e.target as HTMLSelectElement).value)}
    >
      {#each kinds as kind}
        <option value={kind.value}>{kind.de}</option>
      {/each}
      {#if kindOf(feature) === 'other'}
        <option value="other" disabled selected>
          Aus JSON: {feature.grantsChoice?.kind}{feature.grantsChoice?.featCategory ? ` / ${feature.grantsChoice.featCategory}` : ''}
        </option>
      {/if}
    </select>
    {#if feature.grantsChoice && kindOf(feature) === 'fightingStyle'}
      <span class="lbl">Anzahl
        <input class="ef num" type="number" min="1" bind:value={feature.grantsChoice.count} oninput={mark} />
      </span>
    {/if}
    {#if feature.grantsChoice && kindOf(feature) === 'expertise'}
      <span class="lbl">Fertigkeiten
        <input class="ef num" type="number" min="1" bind:value={feature.grantsChoice.count} oninput={mark} />
      </span>
      <span class="note">Optionen zur Laufzeit: die geübten Fertigkeiten des Charakters</span>
    {/if}
  </div>

  {#if feature.grantsChoice && kindOf(feature) === 'optionList'}
    <ChoiceOptionEditForm bind:options={feature.grantsChoice.options} {scope} {onchange} />
  {/if}

  {#if feature.grantsChoice && kindOf(feature) === 'spellAccess'}
    <SpellAccessEditForm bind:grant={feature.grantsChoice} {onchange} />
  {/if}

  <div class="row">
    <label class="lbl" class:off={!feature.grants}>
      <input type="checkbox" checked={!!feature.grants} onchange={(e) => toggleGrants((e.target as HTMLInputElement).checked)} />
      Gewährt Mechanik
    </label>
    <label class="lbl" class:off={!feature.grantsSpells}>
      <input type="checkbox" checked={!!feature.grantsSpells} onchange={(e) => toggleSpells((e.target as HTMLInputElement).checked)} />
      Gewährt Zauberliste
    </label>
    {#if feature.grantsSpells}
      <span class="note">Die Zaubernamen stehen als Stufentabelle im Regeltext</span>
    {/if}
  </div>

  {#if feature.grants}
    <FeatureGrantEditForm bind:grant={feature.grants} {scope} {onchange} />
  {/if}
</div>

<style>
  .decl { display: flex; flex-direction: column; gap: 0.35rem; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; }
  .lbl {
    display: inline-flex; align-items: center; gap: 0.3rem;
    font-size: 0.8rem; color: var(--ink-soft);
  }
  .lbl.off { opacity: 0.6; }
  .note { font-size: 0.75rem; color: var(--ink-soft); font-style: italic; }
  .ef {
    background: var(--bg-panel); border: 1px solid transparent; border-radius: 3px;
    color: var(--ink); font-family: inherit; font-size: 0.88rem; padding: 0.15rem 0.3rem; outline: none;
  }
  .ef:hover { border-color: var(--border); }
  .ef:focus { border-color: var(--mef-accent, var(--arcane)); }
  .ef:disabled { opacity: 0.5; }
  .sel { font-size: 0.8rem; }
  .num { width: 56px; text-align: center; }
</style>
