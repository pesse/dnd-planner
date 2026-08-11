<script module lang="ts">
  import { CLASS_TABLE_CHOICE_KINDS, FEATURE_CHOICE_KINDS, featureChoiceGrantSchema, type FeatureChoiceGrant, type FeatureChoiceKind } from '$lib/schemas/featureChoice';

  export type DeclarationCarrier = 'class' | 'feature';

  /** `fightingStyle` ist in Wahrheit `featCategory: 'Fighting Style'`. */
  const KIND_UI: Record<FeatureChoiceKind, { value: string; de: string }> = {
    weaponMastery: { value: 'weaponMastery', de: 'Waffenbeherrschung' },
    featCategory: { value: 'fightingStyle', de: 'Kampfstil' },
    spellcasting: { value: 'spellcasting', de: 'Zauberwirken' },
    spellAccess: { value: 'spellAccess', de: 'Zauber-Zugang' },
    optionList: { value: 'optionList', de: 'Optionsliste (Zweigwahl)' },
    optionPool: { value: 'optionPool', de: 'Options-Pool (Editor-Wahl)' },
    expertise: { value: 'expertise', de: 'Expertise' },
    skillProficiency: { value: 'skillProficiency', de: 'Fertigkeitsübung' },
    languages: { value: 'languages', de: 'Sprachen' },
    characterProperty: { value: 'characterProperty', de: 'Grundeigenschaft' },
  };

  /**
   * Aus der SENKE des `kind` abgeleitet, nicht je Artefakt gepflegt: nur was die Klassen-
   * Stufentabelle braucht, kann ein Trait/Talent nicht auflösen. Eine Hand-Liste je Träger
   * brachte prompt die Asymmetrie zurück, die die eine Deklaration gerade löscht.
   */
  export function kindOptions(carrier: DeclarationCarrier): { value: string; de: string }[] {
    return FEATURE_CHOICE_KINDS.filter(
      (k) => carrier === 'class' || !CLASS_TABLE_CHOICE_KINDS.includes(k),
    ).map((k) => KIND_UI[k]);
  }

  export const DEFAULT_CHOICE_KIND = 'optionList';

  // Die Listenfelder (`spellLists` & Co.) füllt das Schema — hand-gesetzte Literale fehlten
  // sonst bei jedem neuen Feld.
  export const newChoice = (g: Partial<FeatureChoiceGrant>): FeatureChoiceGrant => featureChoiceGrantSchema.parse(g);
</script>

<script lang="ts">
  /** EINE Wahl eines Merkmals; die Liste darüber führt `DeclarationEditForm`. */
  import CharacterPropertyEditForm from './CharacterPropertyEditForm.svelte';
  import ChoiceOptionEditForm from './ChoiceOptionEditForm.svelte';
  import SpellAccessEditForm from './SpellAccessEditForm.svelte';

  let {
    grant = $bindable<FeatureChoiceGrant>(),
    carrier = 'feature',
    scope = 'full',
    onchange = () => void 0,
    onremove,
  }: {
    grant: FeatureChoiceGrant;
    carrier?: DeclarationCarrier;
    scope?: 'full' | 'skills';
    onchange?: () => void;
    onremove: () => void;
  } = $props();

  const mark = () => onchange();

  let kinds = $derived(kindOptions(carrier));

  /** 'other' = hand-editiert, das Roh-JSON bleibt autoritativ. */
  let kind = $derived.by(() => {
    if (grant.kind === 'featCategory' && grant.featCategory !== 'Fighting Style') return 'other';
    const value = KIND_UI[grant.kind].value;
    return kinds.some((k) => k.value === value) ? value : 'other';
  });

  function setKind(value: string) {
    const prev = grant;
    // Beim Wechsel Optionen bzw. Anzahl mitnehmen: ein Fehlgriff im Dropdown soll keine
    // Redaktionsarbeit löschen.
    if (value === 'fightingStyle')
      grant = newChoice({ kind: 'featCategory', featCategory: 'Fighting Style', count: prev.count });
    else if (value === 'optionList') grant = newChoice({ kind: 'optionList', options: prev.options });
    else if (value === 'optionPool')
      grant = newChoice({ kind: 'optionPool', options: prev.options, count: prev.count, column: prev.column });
    else if (value === 'characterProperty')
      grant = newChoice({
        kind: 'characterProperty',
        property: prev.property ?? 'size',
        propertyValues: prev.propertyValues,
      });
    else if (value === 'spellAccess')
      grant = newChoice({
        kind: 'spellAccess',
        spellLists: prev.spellLists,
        spellAbilities: prev.spellAbilities,
        spellPicks: prev.spellPicks,
      });
    else if (value !== 'other') grant = newChoice({ kind: value as FeatureChoiceKind, count: prev.count });
    onchange();
  }
</script>

<div class="choice">
  <div class="row">
    <select class="ef sel" value={kind} onchange={(e) => setKind((e.target as HTMLSelectElement).value)}>
      {#each kinds as k}
        <option value={k.value}>{k.de}</option>
      {/each}
      {#if kind === 'other'}
        <option value="other" disabled selected>
          Aus JSON: {grant.kind}{grant.featCategory ? ` / ${grant.featCategory}` : ''}
        </option>
      {/if}
    </select>
    {#if kind === 'fightingStyle'}
      <span class="lbl">Anzahl
        <input class="ef num" type="number" min="1" bind:value={grant.count} oninput={mark} />
      </span>
    {/if}
    {#if kind === 'expertise'}
      <span class="lbl">Fertigkeiten
        <input class="ef num" type="number" min="1" bind:value={grant.count} oninput={mark} />
      </span>
      <span class="note">Optionen zur Laufzeit: die geübten Fertigkeiten des Charakters</span>
    {/if}
    {#if kind === 'skillProficiency'}
      <span class="lbl">Fertigkeiten
        <input class="ef num" type="number" min="1" bind:value={grant.count} oninput={mark} />
      </span>
      <span class="note">Optionen zur Laufzeit: die noch NICHT geübten Fertigkeiten</span>
    {/if}
    {#if kind === 'optionPool'}
      <span class="lbl">Je Vergabe-Stufe
        <input class="ef num" type="number" min="1" bind:value={grant.count} oninput={mark} />
      </span>
      <span class="lbl">Tabellenspalte
        <input class="ef" type="text" placeholder="leer = kumulativ" bind:value={grant.column} oninput={mark} />
      </span>
      <span class="note">Gewählt wird im Charakter-Editor, nicht im Fragebogen</span>
    {/if}
    {#if kind === 'languages'}
      <span class="lbl">Sprachen
        <input class="ef num" type="number" min="1" bind:value={grant.count} oninput={mark} />
      </span>
      <span class="note">Freitext — Sprachen haben kein Vokabular</span>
    {/if}
    <button type="button" class="rm" onclick={onremove} title="Diese Wahl entfernen">×</button>
  </div>

  {#if kind === 'optionList' || kind === 'optionPool'}
    <ChoiceOptionEditForm bind:options={grant.options} {scope} {onchange} />
  {/if}

  {#if kind === 'spellAccess'}
    <SpellAccessEditForm bind:grant {onchange} />
  {/if}

  {#if kind === 'characterProperty'}
    <CharacterPropertyEditForm bind:grant {onchange} />
  {/if}
</div>

<style>
  .choice { display: flex; flex-direction: column; gap: 0.35rem; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; }
  .lbl {
    display: inline-flex; align-items: center; gap: 0.3rem;
    font-size: 0.8rem; color: var(--ink-soft);
  }
  .note { font-size: 0.75rem; color: var(--ink-soft); font-style: italic; }
  .sel { font-size: 0.8rem; }
  .num { width: 56px; text-align: center; }
  .rm {
    margin-left: auto; border: none; background: none; cursor: pointer;
    font-size: 1rem; line-height: 1; color: var(--ink-soft);
  }
  .rm:hover { color: var(--danger); }
</style>
