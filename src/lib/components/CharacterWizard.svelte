<script lang="ts">
  import { untrack } from 'svelte';
  import { CharacterWizard } from '../services/wizard/characterWizard.svelte';
  import { buildWizardCharacter } from '../services/wizard/assembleCharacter';
  import { isComplete as pointBuyComplete, primaryAbilityKeys } from '../services/wizard/pointBuy';
  import { allowedKeys, isValidAllocation, type AsiAllocation } from '../services/wizard/backgroundAsi';
  import type { AbilityKey } from '../services/wizard/pointBuy';
  import { createSpellStepValues } from '../services/wizard/spellStep.svelte';
  import { createWizardPreview } from '../services/wizard/wizardPreview.svelte';
  import { getBackgroundByKey } from '../backgroundsLibrary';
  import { loadOriginCatalog, type OriginCatalog, type OriginKind } from '../services/wizard/originCatalog';
  import { preloadSpeciesArt } from '../services/wizard/originArt';
  import { STANDARD_LANGUAGE_PICKS } from '../services/wizard/personal';
  import type { MasteryOffer } from '../services/weaponMastery';
  import type { FightingStyleOffer } from '../services/fightingStyle';
  import { traitFeatQuota, type TraitFeatOffer } from '../services/traitFeat';
  import type { OptionPoolOffer } from '../services/declaration/optionPool';
  import { wizardFightingStyleOffer, wizardMasteryOffer, wizardOptionPools, wizardTraitFeatOffers } from '../services/wizard/wizardOffers';
  import { createFormCasting } from '../services/characterFormCasting.svelte';
  import { wizardCastingInput } from '../services/wizard/castingDraft';
  import { getSpellLibrary } from '../spellLibrary';
  import { fillRandom } from '../services/wizard/randomFill';
  import type { Character } from '../schemas/characterSchema';
  import WeaponMasteryPicker from './WeaponMasteryPicker.svelte';
  import FeatPicker from './FeatPicker.svelte';
  import OptionPoolPicker from './OptionPoolPicker.svelte';
  import FullscreenWizard, { CHOICE_LIST_WIDTH } from './ui/FullscreenWizard.svelte';
  import OriginStep from './wizard/OriginStep.svelte';
  import OriginDetail from './wizard/OriginDetail.svelte';
  import TraitFeatStep from './wizard/TraitFeatStep.svelte';
  import TraitFeatDetail from './wizard/TraitFeatDetail.svelte';
  import LanguageStep from './wizard/LanguageStep.svelte';
  import AbilitiesStep from './wizard/AbilitiesStep.svelte';
  import PersonalStep from './wizard/PersonalStep.svelte';
  import CharacterPreview from './wizard/CharacterPreview.svelte';
  import WizardFacts from './wizard/WizardFacts.svelte';
  import GlossaryTerm from './GlossaryTerm.svelte';
  import BackgroundAsiStep from './wizard/BackgroundAsiStep.svelte';
  import SkillPickStep from './wizard/SkillPickStep.svelte';
  import FeatureChoiceStep from './wizard/FeatureChoiceStep.svelte';
  import SpellStep from './wizard/SpellStep.svelte';
  import EquipmentChoiceStep from './wizard/EquipmentChoiceStep.svelte';
  import ReviewStep from './wizard/ReviewStep.svelte';
  import WizardLoading from './wizard/WizardLoading.svelte';
  import './wizard/wizard.css';

  let { onComplete, onCancel, random = false }: {
    onComplete: (character: Character) => void;
    onCancel: () => void;
    /** Gleich nach dem Laden alles würfeln und im Überblick landen. */
    random?: boolean;
  } = $props();

  const w = new CharacterWizard();
  const preview = createWizardPreview(w);

  // Schritte über eine ID, nicht über einen festen Index: optionale Schritte fallen weg
  // und verschöben sonst alle nachfolgenden Index-Prüfungen.
  type StepId =
    | OriginKind | 'languages' | 'abilities' | 'background-asi' | 'trait-feat' | 'proficiencies' | 'mastery'
    | 'fighting-style' | 'option-pool' | 'features' | 'spells' | 'equipment' | 'personal' | 'review';
  const ALL_STEPS: { id: StepId; label: string }[] = [
    { id: 'species', label: 'Volk' },
    { id: 'background', label: 'Hintergrund' },
    { id: 'class', label: 'Klasse' },
    { id: 'languages', label: 'Sprachen' },
    { id: 'abilities', label: 'Attribute' },
    { id: 'background-asi', label: 'Attributsbonus' },
    { id: 'trait-feat', label: 'Volks-Talent' },
    { id: 'proficiencies', label: 'Übungen' },
    { id: 'mastery', label: 'Waffenbeherrschung' },
    { id: 'option-pool', label: 'Merkmals-Optionen' },
    { id: 'features', label: 'Merkmale' },
    // Nach den Merkmalen: eine Talentwahl mit `when` hängt an deren Antwort.
    { id: 'fighting-style', label: 'Kampfstil' },
    { id: 'spells', label: 'Zauber' },
    { id: 'equipment', label: 'Ausrüstung' },
    { id: 'personal', label: 'Persönliches' },
    { id: 'review', label: 'Überblick' },
  ];
  const steps = $derived(
    ALL_STEPS.filter(
      (s) =>
        // Den Schritt, auf dem der Nutzer STEHT, nie herausfiltern — die Bedingungen
        // kippen nachträglich (die Angebote laden asynchron).
        s.id === currentStep ||
        ((s.id !== 'mastery' || masteryAvailable) &&
          (s.id !== 'fighting-style' || fightingStyleAvailable) &&
          (s.id !== 'trait-feat' || traitFeatOffers.length > 0) &&
          (s.id !== 'option-pool' || pools.length > 0) &&
          (s.id !== 'spells' || spellsAvailable)),
    ),
  );
  let currentStep = $state<StepId>('species');
  const stepIndex = $derived(Math.max(0, steps.findIndex((s) => s.id === currentStep)));

  const ORIGIN_STEPS: StepId[] = ['species', 'background', 'class'];
  const isOrigin = $derived(ORIGIN_STEPS.includes(currentStep));

  let catalog = $state<OriginCatalog | null>(null);
  let asiAllowed = $state<AbilityKey[]>([]);
  let creating = $state(false);
  let createError = $state('');

  let ready = $state(false);
  let artProgress = $state(0);
  // Eine langsame Platte darf den Wizard nicht festhalten: Fehlendes zieht der Schritt selbst nach.
  const PRELOAD_LIMIT_MS = 6000;
  // Aus dem Cache wäre die Ladeansicht sonst nur ein Flackern.
  const PRELOAD_MIN_MS = 700;
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  void Promise.all([
    Promise.race([
      loadOriginCatalog().then((c) => {
        catalog = c;
        return preloadSpeciesArt(c.species.map((s) => s.key), (share) => (artProgress = share));
      }),
      wait(PRELOAD_LIMIT_MS),
    ]),
    wait(PRELOAD_MIN_MS),
  ]).finally(() => {
    ready = true;
    if (random) void randomize();
  });
  void getSpellLibrary().then((s) => (w.spellLib = s));

  const selectedClass = $derived(catalog?.classes.find((c) => c.key === w.klass.sourceKey) ?? null);
  const primaryAbilities = $derived(primaryAbilityKeys(selectedClass));

  // Jede Änderung der Grundwahl lädt nach; die Wahlen dahinter bleiben stehen.
  $effect(() => {
    void w.originSig;
    if (w.basicsComplete) untrack(() => w.kickoff());
  });

  $effect(() => {
    const key = w.background.sourceKey;
    let cancelled = false;
    void getBackgroundByKey(key).then((bg) => { if (!cancelled) asiAllowed = allowedKeys(bg?.abilityScores ?? []); });
    return () => { cancelled = true; };
  });
  const asiValid = $derived(!!w.background.sourceKey && (asiAllowed.length === 0 || isValidAllocation(w.asi, asiAllowed)));

  const toolChoicesDone = $derived(w.pendingToolChoices() === 0);

  // Kontingent und wählbare Waffen kommen aus der Bibliothek.
  let mastery = $state<MasteryOffer | null>(null);
  $effect(() => {
    if (!w.klass.sourceKey) { mastery = null; return; }
    let cancelled = false;
    void wizardMasteryOffer(w)
      .then((o) => { if (!cancelled) mastery = o; })
      .catch(() => { if (!cancelled) mastery = null; });
    return () => { cancelled = true; };
  });
  const masteryAvailable = $derived((mastery?.allowance ?? 0) > 0);

  // Gespeichert werden Talent-Keys; die Assembly macht daraus Talent-Links in `features[]`.
  let fightingStyle = $state<FightingStyleOffer | null>(null);
  $effect(() => {
    if (!w.klass.sourceKey) { fightingStyle = null; return; }
    let cancelled = false;
    void wizardFightingStyleOffer(w)
      .then((o) => {
        if (cancelled) return;
        fightingStyle = o;
        // Ein Zweigwechsel kann das Kontingent senken; ein überzähliger Link würde sonst montiert.
        if (w.fightingStyles.length > o.allowance) w.fightingStyles = w.fightingStyles.slice(0, o.allowance);
      })
      .catch(() => { if (!cancelled) fightingStyle = null; });
    return () => { cancelled = true; };
  });
  const fightingStyleAvailable = $derived((fightingStyle?.allowance ?? 0) > 0);

  let traitFeatOffers = $state<TraitFeatOffer[]>([]);
  $effect(() => {
    let cancelled = false;
    void wizardTraitFeatOffers(w)
      .then((o) => { if (!cancelled) traitFeatOffers = o; })
      .catch(() => { if (!cancelled) traitFeatOffers = []; });
    return () => { cancelled = true; };
  });
  const traitFeatsDone = $derived(
    traitFeatOffers.every((o) => (w.traitFeats[o.featureKey]?.length ?? 0) >= traitFeatQuota(o)),
  );
  let focusedTraitFeat = $state('');

  // Auf Stufe 1 leer, solange kein Merkmal einen Pool auf dieser Stufe vergibt (Metamagie
  // beginnt auf Zaubererstufe 2) — der Schritt fällt dann weg.
  let pools = $state<OptionPoolOffer[]>([]);
  $effect(() => {
    if (!w.klass.sourceKey) { pools = []; return; }
    let cancelled = false;
    void wizardOptionPools(w)
      .then((o) => { if (!cancelled) pools = o; })
      .catch(() => { if (!cancelled) pools = []; });
    return () => { cancelled = true; };
  });

  // Die Zauberquellen des ENTSTEHENDEN Charakters, dieselbe Auflösung wie im Editor. Der
  // Schritt erscheint auch ohne Zauberwirker-Klasse, wenn ein Merkmal eine Wahl erzwingt.
  const spellCasting = createFormCasting(() => wizardCastingInput(w));
  const spellValues = createSpellStepValues(w, spellCasting, () => w.spellLib);
  // Der Fehlschlag gehört mit in die Bedingung: sonst hätte er dieselbe Wirkung wie „wirkt
  // keine Zauber" und der Schritt verschwände, statt den Grund zu nennen.
  const spellsAvailable = $derived(
    spellValues.rows.length > 0 || spellValues.loose.length > 0 || !!spellValues.error,
  );

  /** Schritte, die erst mit Volk, Hintergrund und Klasse etwas anzubieten haben. */
  const NEEDS_ORIGIN: StepId[] = ['proficiencies', 'mastery', 'fighting-style', 'option-pool', 'features', 'spells', 'equipment'];
  function blockedHint(id: StepId): string {
    if (NEEDS_ORIGIN.includes(id) && !w.basicsComplete)
      return 'Wähle zuerst Volk, Hintergrund und Klasse — erst dann steht fest, was dieser Schritt anbietet.';
    if (id === 'background-asi' && !w.background.sourceKey) return 'Wähle zuerst einen Hintergrund — er legt fest, welche Attribute steigen dürfen.';
    return '';
  }

  function stepDone(id: StepId): boolean {
    if (blockedHint(id)) return false;
    switch (id) {
      case 'class': return !!w.klass.sourceKey;
      case 'background': return !!w.background.sourceKey;
      case 'species': return !!w.species.sourceKey && !!w.presentation;
      case 'languages': return w.languages.length === STANDARD_LANGUAGE_PICKS;
      // Der Standardsatz kostet genau die 27 Punkte — dieselbe Prüfung trägt beide Methoden.
      case 'abilities': return pointBuyComplete(w.scores);
      case 'background-asi': return asiValid;
      case 'trait-feat': return traitFeatsDone;
      case 'proficiencies': return w.skillPicksDone;
      case 'features': return w.plainChoicesDone;
      case 'spells': return spellValues.done;
      case 'equipment': return toolChoicesDone;
      default: return true;
    }
  }
  const status = $derived(steps.map((s) => (s.id === 'review' || stepDone(s.id) ? 'done' : 'open') as 'done' | 'open'));
  const openSteps = $derived(steps.filter((s, i) => status[i] === 'open'));

  const go = (id: StepId) => (currentStep = id);
  function next() {
    const nextStep = steps[stepIndex + 1];
    if (nextStep) go(nextStep.id);
  }
  function back() {
    const prev = steps[stepIndex - 1];
    if (prev) go(prev.id);
  }

  let filling = $state(false);
  let fillError = $state('');
  async function randomize() {
    if (!catalog || filling) return;
    filling = true;
    fillError = '';
    try {
      await fillRandom(w, catalog);
      go('review');
    } catch (e) {
      fillError = `Zufallsfüllung abgebrochen: ${e instanceof Error ? e.message : e}`;
    } finally {
      filling = false;
    }
  }

  async function create() {
    creating = true;
    createError = '';
    try {
      const character = await buildWizardCharacter(w);
      onComplete(character);
    } catch (e) {
      createError = e instanceof Error ? e.message : String(e);
      creating = false;
    }
  }
</script>

{#snippet originDetail()}
  <OriginDetail kind={currentStep as OriginKind} {w} {catalog} />
{/snippet}

{#snippet traitFeatDetail()}
  <TraitFeatDetail offers={traitFeatOffers} focused={focusedTraitFeat} />
{/snippet}

{#snippet characterPreview()}
  <CharacterPreview
    character={preview.character}
    emptyText="Noch unvollständig — wähle zuerst ein Volk."
    note={preview.pending ? `Zwischenstand — noch offen: ${preview.pending}.` : ''}
  >
    <WizardFacts character={preview.character} />
  </CharacterPreview>
{/snippet}

{#snippet nameField()}
  <input class="name-input" type="text" bind:value={w.name} placeholder="Name deines Charakters" aria-label="Charaktername" />
{/snippet}

{#snippet footer()}
  <button class="secondary" onclick={onCancel}>Abbrechen</button>
  <button class="secondary" onclick={randomize} disabled={filling || !catalog || creating}
    title="Würfelt alles, was noch offen ist — getroffene Wahlen bleiben stehen.">{filling ? 'Würfle …' : '🎲 Rest zufällig'}</button>
  {#if fillError}<span class="warn">{fillError}</span>{/if}
  <div class="spacer"></div>
  {#if stepIndex > 0}<button class="secondary" onclick={back} disabled={creating}>Zurück</button>{/if}
  {#if stepIndex < steps.length - 1}
    <button class="primary" onclick={next}>Weiter</button>
  {:else}
    {#if openSteps.length}
      <span class="hint">Noch offen:
        {#each openSteps as s, i (s.id)}{i ? ', ' : ''}<button class="link" onclick={() => go(s.id)}>{s.label}</button>{/each}
      </span>
    {:else if !w.name.trim()}<span class="hint">Trag oben noch einen Namen ein.</span>{/if}
    <button class="primary" onclick={create} disabled={creating || !w.name.trim() || openSteps.length > 0}>{creating ? 'Erstelle …' : 'Charakter erstellen'}</button>
  {/if}
{/snippet}

{#if !ready}
  <WizardLoading progress={artProgress} />
{:else}
<FullscreenWizard
  title="Neuer Charakter"
  label="Charakter erstellen"
  scope="wizard"
  {steps}
  current={stepIndex}
  {status}
  onstep={(i) => go(steps[i].id)}
  onclose={onCancel}
  headerExtra={nameField}
  mainWidth={CHOICE_LIST_WIDTH}
  detail={isOrigin ? originDetail : currentStep === 'trait-feat' ? traitFeatDetail : undefined}
  preview={characterPreview}
  {footer}
>
  {#if blockedHint(currentStep)}
    <p class="hint">{blockedHint(currentStep)}</p>

  {:else if isOrigin}
    <OriginStep kind={currentStep as OriginKind} {w} {catalog} />

  {:else if currentStep === 'languages'}
    <LanguageStep {w} />

  {:else if currentStep === 'abilities'}
    <AbilitiesStep {w} klass={selectedClass} />

  {:else if currentStep === 'background-asi'}
    <BackgroundAsiStep allowed={asiAllowed} primary={primaryAbilities} scores={w.scores} bind:asi={w.asi as AsiAllocation} />

  {:else if currentStep === 'proficiencies'}
    <SkillPickStep grants={w.grants} bind:picks={w.skillPicks} />

  {:else if currentStep === 'mastery'}
    {#if !mastery}
      <p class="hint">Lade Waffenbeherrschung …</p>
    {:else}
      <p class="hint">Wähle die Waffenarten, deren Meisterschaftseigenschaft du nutzen darfst (<GlossaryTerm term="Waffenbeherrschung" />).</p>
      <WeaponMasteryPicker offer={mastery} bind:masteries={w.masteries} />
    {/if}

  {:else if currentStep === 'fighting-style'}
    {#if !fightingStyle}
      <p class="hint">Lade Kampfstile …</p>
    {:else}
      <p class="hint">Wähle deinen Kampfstil — die Optionen stammen aus der Talent-Bibliothek.</p>
      <FeatPicker
        offer={fightingStyle}
        heading="Kampfstil — {fightingStyle.className}: {fightingStyle.allowance} {fightingStyle.allowance === 1 ? 'Stil' : 'Stile'}"
        missingHint="Kampfstil-Talente brauchen die Kategorie „Kampfstil“ (vault/feats)."

        selected={w.fightingStyles}
        onToggle={(key) => {
          w.fightingStyles = w.fightingStyles.includes(key)
            ? w.fightingStyles.filter((k) => k !== key)
            : [...w.fightingStyles, key];
        }}
      />
    {/if}

  {:else if currentStep === 'trait-feat'}
    <TraitFeatStep {w} offers={traitFeatOffers} bind:focused={focusedTraitFeat} />

  {:else if currentStep === 'option-pool'}
    <p class="hint">Wähle die Optionen deiner Merkmale — die Liste stammt aus der Klassen-Deklaration.</p>
    {#each pools as pool (pool.featureKey)}
      <OptionPoolPicker offer={pool} bind:picks={w.optionPicks} />
    {/each}

  {:else if currentStep === 'features'}
    <FeatureChoiceStep {w} bind:answers={w.choiceAnswers} />

  {:else if currentStep === 'spells'}
    <SpellStep {w} library={w.spellLib} v={spellValues} />

  {:else if currentStep === 'equipment'}
    <EquipmentChoiceStep {w} done={toolChoicesDone} />

  {:else if currentStep === 'personal'}
    <PersonalStep {w} />

  {:else if currentStep === 'review'}
    <ReviewStep {w} {createError} />
  {/if}
</FullscreenWizard>
{/if}


<style>
  .spacer { flex: 1; }
  .link { background: none; border: none; padding: 0; font: inherit; color: inherit; text-decoration: underline dotted; cursor: pointer; }
  .name-input { width: min(22rem, 100%); font-size: 1rem; }
</style>
