<script lang="ts">
  import './wizard.css';
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import type { Job } from '../../services/wizard/job.svelte';
  import type { ClassCastingOffer } from '../../services/spellcasting/classOffer';
  import { CANTRIP_GROUP, SPELL_GROUP, type SpellStepValues } from '../../services/wizard/spellStep.svelte';
  import { knownSpells } from '../../services/spellcasting/known';
  import type { SpellInfo } from '../../spellLibrary';
  import SpellPickField from '../SpellPickField.svelte';

  let { w, offer, library, v, statusText }: {
    w: CharacterWizard;
    offer: ClassCastingOffer | null;
    library: SpellInfo[];
    v: SpellStepValues;
    statusText: (job: Job<unknown>) => string;
  } = $props();

  const knownExcept = (id: string) => knownSpells(v.knownGroups, [id]);

  /** Lese-/Schreib-Paar für `bind:picks` einer Merkmals-Zauber-Wahl. */
  const featurePickBinding = (id: string) =>
    [
      () => w.featureSpellPicks[id] ?? [],
      (val: string[]) => (w.featureSpellPicks = { ...w.featureSpellPicks, [id]: val }),
    ] as const;
</script>

{#if offer?.isCaster}
  {#if v.cantripMax > 0}
    <div class="field">
      <span>
        Zaubertricks ({offer.klasseName})
        <span class="info" title="Zaubertricks kosten keinen Zauberplatz und sind unbegrenzt wirkbar.">ⓘ</span>
      </span>
      <SpellPickField
        title="Zaubertricks"
        {library}
        spellLevels={[0]}
        spellClass={offer.spellClass}
        max={v.cantripMax}
        fixed={v.fixedCantrips}
        known={knownExcept(CANTRIP_GROUP)}
        bind:picks={() => v.cantripPicks, (val) => (w.pickedCantrips = val)}
      />
    </div>
  {/if}

  <div class="field">
    <span>
      {#if v.isSpellbook}
        Zauberbuch — {v.spellMax} Zauber deiner Wahl
        <span class="info" title="Das Zauberbuch ist dein dauerhafter Bestand. Aus ihm bereitest du nach jeder Langen Rast {v.preparedMax} Zauber vor — schalte sie im Auswahl-Dialog mit ● / ○ um.">ⓘ</span>
      {:else if v.isOpenList}
        Erste Vorbereitung — {v.spellMax} Zauber
        <span class="info" title="Du kennst die ganze {offer.klasseName}-Zauberliste; nach jeder Langen Rast darfst du deine Vorbereitung völlig neu zusammenstellen. Das hier ist nur der Startzustand.">ⓘ</span>
      {:else}
        {v.spellMax} Zauber deiner Wahl
        <span class="info" title="Diese Liste ist dauerhaft — beim Stufenaufstieg bzw. nach einer Langen Rast darfst du jeweils einen Zauber austauschen.">ⓘ</span>
      {/if}
    </span>
    {#if v.spellLevels.length === 0}
      <p class="hint">Auf Stufe 1 stehen noch keine Zauberplätze zur Verfügung.</p>
    {:else}
      <SpellPickField
        title={v.isSpellbook
          ? 'Zauberbuch'
          : v.isOpenList
            ? 'Erste Vorbereitung'
            : 'Zauber deiner Wahl'}
        {library}
        spellLevels={v.spellLevels}
        spellClass={offer.spellClass}
        max={v.spellMax}
        fixed={v.grantedSpells.prepared}
        known={knownExcept(SPELL_GROUP)}
        bind:picks={() => v.knownPicks, (val) => (w.pickedKnown = val)}
        bind:prepared={
          () => (v.isSpellbook ? w.pickedPrepared : undefined),
          (val) => (w.pickedPrepared = val ?? [])
        }
        preparedMax={v.preparedMax}
      />
    {/if}
  </div>

  {#if w.effects.status === 'running'}
    <p class="hint">
      Die KI leitet noch die Merkmals-Effekte ab ({statusText(w.effects)}) — kommt dabei
      ein zusätzlicher Zaubertrick heraus (z.B. „Urtümlicher Orden: Thaumaturg"), wächst
      das Kontingent oben nach. Getroffene Wahlen bleiben erhalten.
    </p>
  {:else if v.extras.cantrips > 0 || v.extras.prepared > 0}
    <p class="hint">
      Aus Merkmalen: {[
        v.extras.cantrips > 0 ? `+${v.extras.cantrips} Zaubertrick(s)` : '',
        v.extras.prepared > 0 ? `+${v.extras.prepared} Zauber` : '',
      ].filter(Boolean).join(', ')} — bereits im Kontingent oben enthalten.
    </p>
  {/if}
{/if}

{#each w.spellPickChoices as choice (choice.id)}
  {@const bind = featurePickBinding(choice.id)}
  <div class="field">
    <span>
      {choice.featureDe || choice.feature}: {choice.questionDe || choice.question}
      {#if choice.helpDe || choice.help}<span class="info" title={choice.helpDe || choice.help}>ⓘ</span>{/if}
    </span>
    <SpellPickField
      title={choice.feature}
      {library}
      spellLevels={choice.spellLevels}
      spellClass={choice.spellClass}
      max={choice.max}
      known={knownExcept(choice.id)}
      bind:picks={bind[0], bind[1]}
    />
  </div>
{/each}

{#if !offer?.isCaster && w.spellPickChoices.length}
  <p class="hint">
    Deine Klasse wirkt keine Zauber — diese Zauber kommen allein aus dem Merkmal und
    werden ohne Zauberplätze gewirkt.
  </p>
{/if}
