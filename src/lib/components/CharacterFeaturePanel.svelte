<script lang="ts">
  /**
   * Die Merkmals-Seitenleiste: Klassen-, Volks- und Hintergrundmerkmale, Talent-Links und
   * deklarierte Wahlen. Besitzt `character.features` — jede Bedienung schreibt die ganze
   * Liste über das Ledger zurück, und genau das ist das Dirty-Signal der Save-Bar.
   */
  import { untrack, type Snippet } from 'svelte';
  import type { Character } from '$lib/schemas/characterSchema';
  import type { Change } from '$lib/schemas/levelUp';
  import type { ApplyContext } from '../services/applyChanges';
  import { collectChoiceSlots, type ChoiceSlot } from '../services/characterChoices';
  import {
    choiceDisplay, keysOf, resolveBackground, resolveClassFeatures, resolveSpeciesTraits,
    type ResolvedFeatureGroup,
  } from '../services/characterFeatures';
  import { createFeatureLedger, featLinkRows } from '../services/featureLedger';
  import type { CoverageBadge } from '../services/declarationCoverage';
  import { createCollapsibleSections } from '../utils/collapsibleSections.svelte';
  import DeclarationBadge from './DeclarationBadge.svelte';
  import Markdown from './Markdown.svelte';
  import ChoiceSection from './featurePanel/ChoiceSection.svelte';
  import FeatSection from './featurePanel/FeatSection.svelte';
  import LooseChoice from './featurePanel/LooseChoice.svelte';
  import { createChoiceState } from './featurePanel/choiceState.svelte';
  import './featurePanel/featurePanel.css';

  let { character, saved = null, applyContext, onApplyChanges, badge = $bindable(null), openCount = $bindable(0) }: {
    /** Der `ed.draft`-Proxy — wird IN PLACE mutiert (immutabel je Feld, siehe `featureLedger`). */
    character: Character;
    /** Baseline des Diff-Highlightings. */
    saved?: Character | null;
    /** Derselbe Kontext, mit dem `onApplyChanges` anwendet — sonst lügt die Vorschau. */
    applyContext: ApplyContext;
    /**
     * „Übernehmen" einer Wahl läuft über den Eltern-Editor, weil das Anwenden den DRAFT
     * per neuer Referenz ersetzt — die Leiste kann sich nicht selbst neu aufsetzen.
     */
    onApplyChanges?: (changes: Change[]) => void;
    /** Geht an die Lasche hinaus, damit der Stand auch ZUGEKLAPPT sichtbar bleibt. */
    badge?: CoverageBadge | null;
    openCount?: number;
  } = $props();

  const ledger = createFeatureLedger(() => character);
  const featRows = $derived(featLinkRows(character.features));

  // Abhängigkeit sind allein die LINKS, als Wertschlüssel: läse der Effekt
  // `character.features` direkt, löste jede beantwortete Wahl eine neue Auflösung aus.
  const linkKey = $derived(
    JSON.stringify([
      (character.classes ?? []).map((c) => [c.sourceKey, c.name, c.subclassKey, c.subclassName, c.level]),
      [character.species?.sourceKey, character.species?.subspeciesKey, character.species?.name],
      [character.backgroundRef?.sourceKey, character.backgroundRef?.name],
      featRows.map(({ e }) => [e.sourceKey, e.name, e.gainedAt]),
    ]),
  );

  let classGroups = $state<ResolvedFeatureGroup[]>([]);
  let speciesGroups = $state<ResolvedFeatureGroup[]>([]);
  let backgroundGroups = $state<ResolvedFeatureGroup[]>([]);
  let choiceSlots = $state<ChoiceSlot[]>([]);
  $effect(() => {
    void linkKey;
    const c = untrack(() => $state.snapshot(character)) as Character;
    let cancelled = false;
    void (async () => {
      const [cls, spec, bg, slots] = await Promise.all([
        resolveClassFeatures(c.classes ?? []),
        resolveSpeciesTraits(c.species),
        resolveBackground(c.backgroundRef),
        collectChoiceSlots(c),
      ]);
      if (cancelled) return;
      classGroups = cls;
      speciesGroups = spec ?? [];
      backgroundGroups = bg ? [bg] : [];
      choiceSlots = slots;
    })();
    return () => { cancelled = true; };
  });

  const knownKeys = $derived([
    ...keysOf([...classGroups, ...speciesGroups, ...backgroundGroups]),
    ...featRows.map(({ e }) => e.sourceKey).filter(Boolean),
  ]);

  const choices = createChoiceState({
    character: () => character,
    saved: () => saved,
    slots: () => choiceSlots,
    knownKeys: () => knownKeys,
    ctx: () => applyContext,
  });
  $effect(() => {
    badge = choices.badge;
    openCount = choices.openCount;
  });

  const sections = createCollapsibleSections('char-features-blocks');
</script>

<!-- Was der Link liefert, ist read-only — bis auf die deklarierten Wahlen. -->
{#snippet featureGroups(groups: ResolvedFeatureGroup[], emptyHint: string)}
  {#if !groups.length}
    <p class="fp-empty">{emptyHint}</p>
  {:else}
    {#each groups as g}
      <div class="fp-group">
        <span class="fp-title">{g.title}</span>
        {#if g.unresolved}
          <span class="fp-unresolved">— nicht in der Bibliothek verlinkt</span>
        {:else if g.features.length}
          <ul class="fp-list">
            {#each g.features as f}
              {@const slots = choices.slotsOf(f.key ?? '')}
              <li>
                <div class="fp-head">
                  <span class="fp-name">{f.name}</span>
                  {#if f.gainedAt}<span class="fp-lvl">Stufe {f.gainedAt}</span>{/if}
                  <!-- Mit Platz zeigt der Picker die Wahl; ein Chip daneben wäre die Dublette. -->
                  {#if !slots.length}<LooseChoice rows={choices.looseOf(f.key ?? '')} {ledger} />{/if}
                </div>
                {#if f.desc}<div class="fp-desc"><Markdown source={f.desc} /></div>{/if}
                <ChoiceSection {slots} {choices} {ledger} onapply={(c) => onApplyChanges?.(c)} />
              </li>
            {/each}
          </ul>
        {:else}
          <span class="fp-unresolved">— keine</span>
        {/if}
      </div>
    {/each}
  {/if}
{/snippet}

{#snippet block(title: string, id: string, openChoices: number, body: Snippet)}
  <details class="ref-block" open={sections.isOpen(id)}
    ontoggle={(e) => sections.setCollapsed(id, !e.currentTarget.open)}>
    <summary>
      <span class="rb-title">{title}</span>
      {#if openChoices}
        <span class="rb-open" title="{openChoices} unbeantwortete Wahl in diesem Abschnitt">{openChoices} offen</span>
      {/if}
    </summary>
    <div class="rb-body">{@render body()}</div>
  </details>
{/snippet}

{#snippet classBody()}{@render featureGroups(classGroups, 'Keine verlinkte Klasse — im Bearbeiten-Tab eine Klasse aus der Bibliothek wählen.')}{/snippet}
{#snippet speciesBody()}{@render featureGroups(speciesGroups, 'Kein verlinktes Volk — im Bearbeiten-Tab ein Volk aus der Bibliothek wählen.')}{/snippet}
{#snippet backgroundBody()}{@render featureGroups(backgroundGroups, 'Kein verlinkter Hintergrund — im Bearbeiten-Tab einen Hintergrund aus der Bibliothek wählen.')}{/snippet}
{#snippet featsBody()}
  <FeatSection rows={featRows} {ledger} {choices} {saved} onapply={(c) => onApplyChanges?.(c)} />
{/snippet}

<div class="fpanel">
  <div class="fpanel-head">
    <span class="fpanel-title">Merkmale</span>
    {#if badge}<DeclarationBadge {badge} />{/if}
  </div>

  <div class="fpanel-body">
    <p class="fp-hint">
      Klassen-, Volks- &amp; Hintergrundmerkmale kommen aus der Bibliothek (read-only). Änderungen
      hier landen im Entwurf — gespeichert wird über die Speichern-Leiste.
    </p>

    {@render block('Klassenmerkmale', 'class', choices.openIn(keysOf(classGroups)), classBody)}
    {@render block('Volksmerkmale', 'species', choices.openIn(keysOf(speciesGroups)), speciesBody)}
    {@render block('Hintergrund', 'background', choices.openIn(keysOf(backgroundGroups)), backgroundBody)}
    {@render block('Talente', 'feats', choices.openIn(featRows.map(({ e }) => e.sourceKey)), featsBody)}

    {#if choices.orphans.length}
      <!-- Bewusst kein <details>: ein Fehlerzustand sollte nicht wegklappbar sein. -->
      <div class="ref-block">
        <h4>Entscheidungen ohne zugeordnetes Merkmal</h4>
        <div class="rb-body">
          <p class="fp-empty">Verlinkung prüfen — das Merkmal steckt in keiner Klasse, keinem Volk und keinem Hintergrund dieses Charakters.</p>
          <ul class="fp-list">
            {#each choices.orphans as { e, i } (i)}
              <li class="feat-row">
                <div class="fp-head">
                  <span class="fp-name ref-unlinked" title="Kein Merkmal dieses Keys am Charakter">⚠ {e.name.trim() || e.sourceKey || '(ohne Merkmal)'}</span>
                  <span class="fp-choice">Entscheidung: {choiceDisplay(e)}</span>
                  <span class="feat-row-actions">
                    <button class="remove-btn" title="Eintrag löschen" onclick={() => ledger.remove(i)}>✕</button>
                  </span>
                </div>
              </li>
            {/each}
          </ul>
        </div>
      </div>
    {/if}
  </div>
</div>
