<script lang="ts">
  import { CharacterWizard } from '../services/wizard/characterWizard.svelte';
  import { buildWizardCharacter } from '../services/wizard/assembleCharacter';
  import { isComplete as pointBuyComplete } from '../services/wizard/pointBuy';
  import { allowedKeys, isValidAllocation, type AsiAllocation } from '../services/wizard/backgroundAsi';
  import type { AbilityKey } from '../services/wizard/pointBuy';
  import { createSpellStepValues } from '../services/wizard/spellStep.svelte';
  import { createWizardPreview } from '../services/wizard/wizardPreview.svelte';
  import { getBackgroundByKey } from '../backgroundsLibrary';
  import { abilityKeyOf } from '../schemas/abilities';
  import { loadOriginCatalog, type OriginCatalog, type OriginKind } from '../services/wizard/originCatalog';
  import { preloadSpeciesArt } from '../services/wizard/originArt';
  import { STANDARD_LANGUAGE_PICKS } from '../services/wizard/personal';
  import { collectGrants, type CollectedGrants } from '../services/proficiencyGrants';
  import { masteryOffer, type MasteryOffer } from '../services/weaponMastery';
  import { fightingStyleOffer, type FightingStyleOffer } from '../services/fightingStyle';
  import { loadTraitFeatOffers, type TraitFeatOffer } from '../services/traitFeat';
  import { FEAT_CATEGORY_DE } from '../featsLibrary';
  import { optionPoolOffers, type OptionPoolOffer } from '../services/declaration/optionPool';
  import { createFormCasting } from '../services/characterFormCasting.svelte';
  import { featureLedger, wizardCastingInput, wizardGrantInput } from '../services/wizard/castingDraft';
  import { getSpellLibrary, spellInfoByKey, type SpellInfo } from '../spellLibrary';
  import type { Character } from '../schemas/characterSchema';
  import WeaponMasteryPicker from './WeaponMasteryPicker.svelte';
  import FeatPicker from './FeatPicker.svelte';
  import OptionPoolPicker from './OptionPoolPicker.svelte';
  import FullscreenWizard, { CHOICE_LIST_WIDTH } from './ui/FullscreenWizard.svelte';
  import OriginStep from './wizard/OriginStep.svelte';
  import OriginDetail from './wizard/OriginDetail.svelte';
  import LanguageStep from './wizard/LanguageStep.svelte';
  import AbilitiesStep from './wizard/AbilitiesStep.svelte';
  import PersonalStep from './wizard/PersonalStep.svelte';
  import CharacterPreview from './wizard/CharacterPreview.svelte';
  import GlossaryTerm from './GlossaryTerm.svelte';
  import BackgroundAsiStep from './wizard/BackgroundAsiStep.svelte';
  import SkillPickStep from './wizard/SkillPickStep.svelte';
  import FeatureChoiceStep from './wizard/FeatureChoiceStep.svelte';
  import SpellStep from './wizard/SpellStep.svelte';
  import EquipmentChoiceStep from './wizard/EquipmentChoiceStep.svelte';
  import ReviewStep from './wizard/ReviewStep.svelte';
  import WizardLoading from './wizard/WizardLoading.svelte';
  import './wizard/wizard.css';

  let { onComplete, onCancel }: { onComplete: (character: Character) => void; onCancel: () => void } = $props();

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
  let spellLib = $state<SpellInfo[]>([]);

  let grants = $state<CollectedGrants | null>(null);
  let skillPicks = $state<string[][]>([]); // je offener Wahl eine Auswahl (englische Namen)
  let asiAllowed = $state<AbilityKey[]>([]);
  let choiceAnswers = $state<Record<string, string[]>>({});
  let creating = $state(false);
  let createError = $state('');

  let lastOriginSig = '';

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
  ]).finally(() => (ready = true));
  void getSpellLibrary().then((s) => (spellLib = s));

  const selectedClass = $derived(catalog?.classes.find((c) => c.key === w.klass.sourceKey) ?? null);
  const primaryAbilities = $derived(
    (selectedClass?.overview?.primaryAbilities ?? []).map((a) => abilityKeyOf(a)).filter((k): k is AbilityKey => !!k),
  );

  function originSig(): string {
    return `${w.species.sourceKey}|${w.klass.sourceKey}|${w.background.sourceKey}`;
  }

  /** Nach dem letzten Herkunfts-Schritt: beim ersten Mal laden, nach einer Änderung neu aufsetzen. */
  function syncOrigin() {
    const sig = originSig();
    if (sig === lastOriginSig) return;
    if (!lastOriginSig) w.kickoff();
    else { w.restart(); grants = null; choiceAnswers = {}; }
    lastOriginSig = sig;
    void loadAsi();
  }

  async function loadGrants() {
    grants = await collectGrants(wizardGrantInput(w));
    skillPicks = grants.choices.map(() => []);
    // Mit `chosenSkills` zusammen die Optionsliste der Expertise-Wahl im Merkmals-Schritt.
    w.grantedSkills = grants.skills.map((g) => g.value);
    syncChosenSkills();
  }
  function syncChosenSkills() {
    w.chosenSkills = [...new Set(skillPicks.flat())];
  }
  const openChoicesDone = $derived(
    !grants || grants.choices.every((ch, i) => (skillPicks[i]?.length ?? 0) === ch.choose),
  );

  async function loadAsi() {
    const bg = await getBackgroundByKey(w.background.sourceKey);
    asiAllowed = allowedKeys(bg?.abilityScores ?? []);
    w.asi = {};
  }
  const asiValid = $derived(asiAllowed.length === 0 || isValidAllocation(w.asi, asiAllowed));

  const toolChoicesDone = $derived(w.pendingToolChoices() === 0);

  // Kontingent und wählbare Waffen kommen aus der Bibliothek.
  let mastery = $state<MasteryOffer | null>(null);
  const weaponProfs = $derived({
    simple: grants?.weapons.some((g) => g.value === 'Simple') ?? false,
    martial: grants?.weapons.some((g) => g.value === 'Martial') ?? false,
  });
  $effect(() => {
    const key = w.klass.sourceKey;
    const profs = weaponProfs;
    if (!key) { mastery = null; return; }
    let cancelled = false;
    void masteryOffer({
      classes: [{ sourceKey: key, name: w.klass.name, level: 1 }],
      proficiencies: { simpleWeapons: profs.simple, martialWeapons: profs.martial },
    })
      .then((o) => { if (!cancelled) mastery = o; })
      .catch(() => { if (!cancelled) mastery = null; });
    return () => { cancelled = true; };
  });
  const masteryAvailable = $derived((mastery?.allowance ?? 0) > 0);

  // Gespeichert werden Talent-Keys; die Assembly macht daraus Talent-Links in `features[]`.
  let fightingStyle = $state<FightingStyleOffer | null>(null);
  $effect(() => {
    const key = w.klass.sourceKey;
    if (!key) { fightingStyle = null; return; }
    const features = featureLedger(w);
    const optionPicks = $state.snapshot(w.optionPicks);
    let cancelled = false;
    void fightingStyleOffer({
      classes: [{ sourceKey: key, subclassKey: w.klass.subclassKey, name: w.klass.name, level: 1 }],
      features,
      optionPicks,
    })
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
    const speciesKey = w.species.sourceKey;
    const backgroundKey = w.background.sourceKey;
    let cancelled = false;
    void loadTraitFeatOffers(speciesKey, backgroundKey)
      .then((o) => { if (!cancelled) traitFeatOffers = o; })
      .catch(() => { if (!cancelled) traitFeatOffers = []; });
    return () => { cancelled = true; };
  });
  const traitFeatsDone = $derived(
    traitFeatOffers.every(
      (o) => (w.traitFeats[o.featureKey]?.length ?? 0) >= Math.min(o.allowance, o.options.length),
    ),
  );

  // Auf Stufe 1 leer, solange kein Merkmal einen Pool auf dieser Stufe vergibt (Metamagie
  // beginnt auf Zaubererstufe 2) — der Schritt fällt dann weg.
  let pools = $state<OptionPoolOffer[]>([]);
  $effect(() => {
    const key = w.klass.sourceKey;
    if (!key) { pools = []; return; }
    let cancelled = false;
    void optionPoolOffers({ classes: [{ sourceKey: key, subclassKey: w.klass.subclassKey, name: w.klass.name, level: 1 }] })
      .then((o) => { if (!cancelled) pools = o; })
      .catch(() => { if (!cancelled) pools = []; });
    return () => { cancelled = true; };
  });

  // Die Zauberquellen des ENTSTEHENDEN Charakters, dieselbe Auflösung wie im Editor. Der
  // Schritt erscheint auch ohne Zauberwirker-Klasse, wenn ein Merkmal eine Wahl erzwingt.
  const spellCasting = createFormCasting(() => wizardCastingInput(w));
  const spellValues = createSpellStepValues(w, spellCasting, () => spellLib);
  // Der Fehlschlag gehört mit in die Bedingung: sonst hätte er dieselbe Wirkung wie „wirkt
  // keine Zauber" und der Schritt verschwände, statt den Grund zu nennen.
  const spellsAvailable = $derived(
    spellValues.rows.length > 0 || spellValues.loose.length > 0 || !!spellValues.error,
  );

  // Pflicht: ohne die Antwort bliebe die Zauberliste offen und der Zauber-Schritt hätte
  // nichts anzubieten.
  const declaredChoicesDone = $derived(
    w.declaredChoices
      .filter((c) => c.type !== 'spell-pick')
      .every((c) => (choiceAnswers[c.id] ?? []).some((v) => v.trim())),
  );

  /** Baut alles neu und läuft deshalb gefahrlos zweimal — nach Merkmals- und Zauberschritt. */
  function commitFeatureChoices() {
    w.declaredAnswers = w.declaredChoices
      .map((ch) => ({
        id: ch.id,
        // Eine Zauber-Wahl MIT Quota beantwortet der Zauber-Block; ihre Zauber hier noch
        // einmal als Antworttext wären die zweite Wahrheit.
        choice:
          ch.type === 'spell-pick'
            ? (ch.sourceId && ch.quotaId
                ? []
                : (w.featureSpellPicks[ch.id] ?? []).map((v) => spellInfoByKey(spellLib, v)?.name ?? v)
              ).join(', ')
            : (choiceAnswers[ch.id] ?? []).join(', '),
      }))
      .filter((rc) => rc.choice.trim());
  }

  const canProceed = $derived.by(() => {
    switch (currentStep) {
      case 'class': return !!w.klass.sourceKey;
      case 'background': return !!w.background.sourceKey;
      case 'species': return !!w.species.sourceKey && !!w.presentation;
      case 'languages': return w.languages.length === STANDARD_LANGUAGE_PICKS;
      // Der Standardsatz kostet genau die 27 Punkte — dieselbe Prüfung trägt beide Methoden.
      case 'abilities': return pointBuyComplete(w.scores);
      case 'background-asi': return asiValid;
      case 'trait-feat': return traitFeatsDone;
      case 'proficiencies': return openChoicesDone;
      case 'features': return declaredChoicesDone;
      case 'spells': return spellValues.done;
      case 'equipment': return toolChoicesDone;
      default: return true;
    }
  });

  function next() {
    if (!canProceed) return;
    const nextStep = steps[stepIndex + 1];
    if (isOrigin && (!nextStep || !ORIGIN_STEPS.includes(nextStep.id))) syncOrigin();
    if (currentStep === 'features' || currentStep === 'spells') commitFeatureChoices();
    if (!nextStep) return;
    if (nextStep.id === 'proficiencies' && !grants) loadGrants();
    currentStep = nextStep.id;
  }
  function back() {
    const prev = steps[stepIndex - 1];
    if (prev) currentStep = prev.id;
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

{#snippet characterPreview()}
  <CharacterPreview
    character={preview.character}
    emptyText="Noch unvollständig — wähle zuerst ein Volk."
    note={preview.pending ? `Zwischenstand — noch offen: ${preview.pending}.` : ''}
  />
{/snippet}

{#snippet nameField()}
  <input class="name-input" type="text" bind:value={w.name} placeholder="Name deines Charakters" aria-label="Charaktername" />
{/snippet}

{#snippet footer()}
  <button class="secondary" onclick={onCancel}>Abbrechen</button>
  <div class="spacer"></div>
  {#if stepIndex > 0}<button class="secondary" onclick={back} disabled={creating}>Zurück</button>{/if}
  {#if stepIndex < steps.length - 1}
    <button class="primary" onclick={next} disabled={!canProceed}>Weiter</button>
  {:else}
    {#if !w.name.trim()}<span class="hint">Trag oben noch einen Namen ein.</span>{/if}
    <button class="primary" onclick={create} disabled={creating || !w.name.trim()}>{creating ? 'Erstelle …' : 'Charakter erstellen'}</button>
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
  onstep={(i) => (currentStep = steps[i].id)}
  onclose={onCancel}
  headerExtra={nameField}
  mainWidth={CHOICE_LIST_WIDTH}
  detail={isOrigin ? originDetail : undefined}
  preview={characterPreview}
  {footer}
>
  {#if isOrigin}
    <OriginStep kind={currentStep as OriginKind} {w} {catalog} />

  {:else if currentStep === 'languages'}
    <LanguageStep {w} />

  {:else if currentStep === 'abilities'}
    <AbilitiesStep {w} klass={selectedClass} />

  {:else if currentStep === 'background-asi'}
    <BackgroundAsiStep allowed={asiAllowed} primary={primaryAbilities} scores={w.scores} bind:asi={w.asi as AsiAllocation} />

  {:else if currentStep === 'proficiencies'}
    <SkillPickStep {grants} bind:picks={skillPicks} onchange={syncChosenSkills} />

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
    <p class="hint">Ein Volksmerkmal gewährt dir ein <GlossaryTerm term="Talent" />. Mit ★ markierte Talente empfiehlt das Regelwerk.</p>
    {#each traitFeatOffers as offer (offer.featureKey)}
      {@const picked = w.traitFeats[offer.featureKey] ?? []}
      <FeatPicker
        {offer}
        heading="{offer.label} — Talent der Kategorie „{FEAT_CATEGORY_DE[offer.featCategory]}“"
        missingHint="Talente brauchen die Kategorie „{FEAT_CATEGORY_DE[offer.featCategory]}“ (vault/feats)."
        selected={picked}
        recommended={offer.recommended}
        onToggle={(key) => {
          w.setTraitFeats(offer.featureKey, picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key]);
          // Das Talent kann Übungen wählen lassen (Begabt) — der Übungsschritt lädt neu.
          grants = null;
        }}
      />
    {/each}

  {:else if currentStep === 'option-pool'}
    <p class="hint">Wähle die Optionen deiner Merkmale — die Liste stammt aus der Klassen-Deklaration.</p>
    {#each pools as pool (pool.featureKey)}
      <OptionPoolPicker offer={pool} bind:picks={w.optionPicks} />
    {/each}

  {:else if currentStep === 'features'}
    <FeatureChoiceStep {w} bind:answers={choiceAnswers} />

  {:else if currentStep === 'spells'}
    <SpellStep {w} library={spellLib} v={spellValues} />

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
  .name-input { width: min(22rem, 100%); font-size: 1rem; }
</style>
