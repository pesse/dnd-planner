<script lang="ts">
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import { llmConfig } from '../stores/llm';
  import { CharacterWizard, type Job } from '../services/wizard/characterWizard.svelte';
  import { buildWizardCharacter } from '../services/wizard/assembleCharacter';
  import {
    ABILITY_KEYS,
    STANDARD_ARRAY,
    POINT_BUY_BUDGET,
    remainingPoints,
    canAdjust,
    adjust,
    isComplete as pointBuyComplete,
    pointBuyStart,
    type AbilityKey,
  } from '../services/wizard/pointBuy';
  import { allowedKeys, isValidAllocation, allocatedTotal, BACKGROUND_ASI_TOTAL } from '../services/wizard/backgroundAsi';
  import { getClassTree, classDisplayName, type ClassNode } from '../classLibrary';
  import { getSpeciesList, speciesDisplayName, type SpeciesInfo } from '../speciesLibrary';
  import { getBackgroundsList, getBackgroundByKey, backgroundDisplayName, type BackgroundInfo } from '../backgroundsLibrary';
  import {
    collectGrants,
    skillLabelDe,
    abilityLabelDe,
    WEAPON_LABEL_DE,
    ARMOR_LABEL_DE,
    type CollectedGrants,
  } from '../services/proficiencyGrants';
  import { SKILL_NAMES, type SkillName } from '../schemas/shared';
  import { buildCharacterProtocol } from '../services/characterProtocol';
  import { masteryOffer, type MasteryOffer } from '../services/weaponMastery';
  import type { Character } from '../schemas/character';
  import TooltipSelect, { type TooltipOption } from './TooltipSelect.svelte';
  import WeaponMasteryPicker from './WeaponMasteryPicker.svelte';

  let { onComplete, onCancel }: { onComplete: (character: Character) => void; onCancel: () => void } = $props();

  const ABILITY_LABEL: Record<AbilityKey, string> = {
    str: 'Stärke', ges: 'Geschicklichkeit', kon: 'Konstitution',
    int: 'Intelligenz', wei: 'Weisheit', cha: 'Charisma',
  };

  const w = new CharacterWizard(() => get(llmConfig));

  // Schritte über eine ID adressieren, nicht über einen festen Index: der
  // Waffenmeisterschafts-Schritt fällt weg, wenn die Klasse das Merkmal nicht gewährt,
  // und würde sonst alle nachfolgenden Index-Prüfungen verschieben.
  type StepId = 'basics' | 'abilities' | 'background' | 'proficiencies' | 'mastery' | 'features' | 'equipment' | 'review';
  const ALL_STEPS: { id: StepId; label: string }[] = [
    { id: 'basics', label: 'Grundwahl' },
    { id: 'abilities', label: 'Attribute' },
    { id: 'background', label: 'Hintergrund-Bonus' },
    { id: 'proficiencies', label: 'Übungen' },
    { id: 'mastery', label: 'Waffenmeisterschaft' },
    { id: 'features', label: 'Merkmale' },
    { id: 'equipment', label: 'Ausrüstung' },
    { id: 'review', label: 'Überblick' },
  ];
  let stepIndex = $state(0);
  const steps = $derived(ALL_STEPS.filter((s) => s.id !== 'mastery' || masteryAvailable));
  const currentStep = $derived(steps[stepIndex]?.id ?? 'basics');

  // ── Bibliotheks-Listen ──
  let classTree = $state<ClassNode[]>([]);
  let speciesList = $state<SpeciesInfo[]>([]);
  let backgroundList = $state<BackgroundInfo[]>([]);

  // ── Schritt-lokaler Zustand ──
  let grants = $state<CollectedGrants | null>(null);
  let skillPicks = $state<string[][]>([]); // je offener Wahl eine Auswahl (englische Namen)
  let asiAllowed = $state<AbilityKey[]>([]);
  let choiceAnswers = $state<Record<string, string[]>>({});
  let creating = $state(false);
  let createError = $state('');

  // Grundwahl-Signatur, um den KI-Neustart bei Änderung zu erkennen.
  let kickedOff = false;
  let lastBasicsSig = '';

  // ── KI-Aktivitätsanzeige: sichtbar machen, dass/woran die KI gerade arbeitet ──
  const aiJobs = $derived([
    { label: 'Merkmale analysieren', job: w.analysis },
    { label: 'Merkmals-Effekte ableiten', job: w.effects },
    { label: 'Klassenmerkmale-Text', job: w.classText },
    { label: 'Volksmerkmale-Text', job: w.speciesText },
    { label: 'Startausrüstung aufbereiten', job: w.equipment },
    { label: 'Trefferpunkte-Effekte', job: w.hpEffects },
  ]);
  const runningJobs = $derived(aiJobs.filter((j) => j.job.status === 'running'));
  const aiBusy = $derived(runningJobs.length > 0);

  let nowMs = $state(0);
  let busyStartMs = $state(0);
  $effect(() => {
    if (aiBusy && !busyStartMs) busyStartMs = performance.now();
    else if (!aiBusy) busyStartMs = 0;
  });
  const elapsedSec = $derived(aiBusy && busyStartMs ? Math.floor((nowMs - busyStartMs) / 1000) : 0);
  const stalled = $derived(aiBusy && w.lastActivityMs > 0 && nowMs - w.lastActivityMs > 50_000);

  onMount(() => {
    getClassTree().then((t) => (classTree = t));
    getSpeciesList().then((s) => (speciesList = s));
    getBackgroundsList().then((b) => (backgroundList = b));
    const clock = setInterval(() => (nowMs = performance.now()), 500);
    return () => { clearInterval(clock); w.dispose(); };
  });

  // Nur Grundklassen — die Unterklasse fällt auf Stufe 1 nicht an (wird erst ab Stufe 3
  // gewählt und lässt sich sonst deterministisch aus der Progression ableiten).
  const baseClasses = $derived(classTree.filter((n) => !n.subclassOf));

  function selectClass(key: string) {
    const node = baseClasses.find((n) => n.key === key);
    w.klass = { sourceKey: key, name: node ? classDisplayName(node) : '' };
  }
  function selectSpecies(key: string) {
    const info = speciesList.find((s) => s.key === key);
    w.species = { sourceKey: key, name: info ? speciesDisplayName(info) : '' };
  }
  function selectBackground(key: string) {
    const info = backgroundList.find((b) => b.key === key);
    w.background = { sourceKey: key, name: info ? backgroundDisplayName(info) : '' };
  }

  function basicsSig(): string {
    return `${w.species.sourceKey}|${w.klass.sourceKey}|${w.background.sourceKey}`;
  }

  // ── Point-Buy ──
  function bump(key: AbilityKey, delta: number) {
    if (canAdjust(w.scores, key, delta)) w.scores = adjust(w.scores, key, delta);
  }
  function useStandardArray() {
    const s = { ...pointBuyStart() };
    ABILITY_KEYS.forEach((k, i) => (s[k] = STANDARD_ARRAY[i]));
    w.scores = s;
  }

  // ── Übungen ──
  async function loadGrants() {
    grants = await collectGrants({
      classes: [{ sourceKey: w.klass.sourceKey, name: w.klass.name, subclassKey: w.klass.subclassKey }],
      species: { sourceKey: w.species.sourceKey },
      backgroundRef: { sourceKey: w.background.sourceKey },
    });
    skillPicks = grants.choices.map(() => []);
    syncChosenSkills();
  }
  function allowedSkillsFor(from: SkillName[]): readonly SkillName[] {
    return from.length ? from : SKILL_NAMES;
  }
  function toggleSkillPick(choiceIdx: number, skill: string, max: number) {
    const cur = skillPicks[choiceIdx] ?? [];
    let next: string[];
    if (cur.includes(skill)) next = cur.filter((s) => s !== skill);
    else if (cur.length >= max) return;
    else next = [...cur, skill];
    skillPicks = skillPicks.map((p, i) => (i === choiceIdx ? next : p));
    syncChosenSkills();
  }
  function syncChosenSkills() {
    w.chosenSkills = [...new Set(skillPicks.flat())];
  }
  const openChoicesDone = $derived(
    !grants || grants.choices.every((ch, i) => (skillPicks[i]?.length ?? 0) === ch.choose),
  );

  // ── Hintergrund-ASI ──
  async function loadAsi() {
    const bg = await getBackgroundByKey(w.background.sourceKey);
    asiAllowed = allowedKeys(bg?.abilityScores ?? []);
    w.asi = {};
  }
  function setAsi(key: AbilityKey, value: number) {
    w.asi = { ...w.asi, [key]: value };
  }
  const asiValid = $derived(asiAllowed.length === 0 || isValidAllocation(w.asi, asiAllowed));

  // ── Ausrüstung (wählbare Optionen aus dem Hintergrund-Job) ──
  const equipGroups = $derived(w.equipment.result?.groups ?? []);
  function selectEquipmentOption(groupIdx: number, optionIdx: number) {
    const next = [...w.equipmentSelection];
    next[groupIdx] = optionIdx;
    w.equipmentSelection = next;
  }
  function equipSelected(groupIdx: number): number {
    return w.equipmentSelection[groupIdx] ?? 0;
  }

  // ── Waffenmeisterschaft (5e 2024, optionaler Schritt) ──
  // Reine Wiederverwendung des Editor-Musters: `masteryOffer` liefert Kontingent +
  // wählbare Waffen aus der Bibliothek (nie aus der KI). Der Schritt erscheint nur, wenn
  // die Startklasse das Merkmal gewährt (allowance > 0). Die Waffenauswahl hängt an den
  // Waffen-Übungen des Charakters — die kommen hier aus den geladenen Grants.
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

  // ── Merkmalswahlen → resolvedChoices ──
  function answerFor(id: string): string[] {
    return choiceAnswers[id] ?? [];
  }
  function setSingleAnswer(id: string, value: string) {
    choiceAnswers = { ...choiceAnswers, [id]: [value] };
  }
  function setChoiceAnswer(id: string, values: string[]) {
    choiceAnswers = { ...choiceAnswers, [id]: values };
  }
  /** Options-Liste einer Merkmalswahl inkl. Konsequenz-Tooltip für TooltipSelect. */
  function optionsFor(choice: { options: string[]; optionHelp: Record<string, string> }): TooltipOption[] {
    return choice.options.map((o) => ({ value: o, label: o, tooltip: choice.optionHelp[o] }));
  }
  function commitFeatureChoices() {
    w.resolvedChoices = w.featureChoices
      .map((ch) => ({ id: ch.id, choice: (choiceAnswers[ch.id] ?? []).join(', ') }))
      .filter((rc) => rc.choice.trim());
  }

  // ── Navigation ──
  const canProceed = $derived.by(() => {
    switch (currentStep) {
      case 'basics': return w.basicsComplete && w.name.trim().length > 0;
      case 'abilities': return pointBuyComplete(w.scores);
      case 'background': return asiValid;
      case 'proficiencies': return openChoicesDone;
      default: return true;
    }
  });

  function next() {
    if (!canProceed) return;
    if (currentStep === 'basics') {
      const sig = basicsSig();
      if (!kickedOff) { w.kickoff(); kickedOff = true; lastBasicsSig = sig; }
      else if (sig !== lastBasicsSig) { w.restart(); lastBasicsSig = sig; grants = null; choiceAnswers = {}; }
      loadAsi();
    }
    // Merkmals-Effekte UND -Text erst nach dem Wahl-Checkpoint: so trägt der Text die
    // getroffene Wahl statt eines Platzhalters („Resistenz gegen [Schadensart]").
    if (currentStep === 'features') { commitFeatureChoices(); w.finalizeFeatures(); w.summarizeFeatures(); }
    // Beim Betreten der Übungen die Grants laden (auch die Waffenmeisterschaft baut darauf auf).
    if (steps[stepIndex + 1]?.id === 'proficiencies' && !grants) loadGrants();
    stepIndex += 1;
  }
  function back() { if (stepIndex > 0) stepIndex -= 1; }

  async function create() {
    creating = true;
    createError = '';
    try {
      await w.awaitPending();
      const character = await buildWizardCharacter(w);
      onComplete(character);
    } catch (e) {
      createError = e instanceof Error ? e.message : String(e);
      creating = false;
    }
  }

  // ── Überblicks-Protokoll (Schritt 6): genau wie beim Stufenaufstieg SICHTBAR machen, was
  // der Charakter bekommt — deterministisch (Attribute, TP, Übungen, Ausrüstung) UND KI
  // (gewährte Zauber, Entscheidungen). Aus dem fertig zusammengesetzten Charakter abgeleitet,
  // damit die Vorschau exakt dem entspricht, was gespeichert wird — nicht bloß den Ridern.
  let preview = $state<Character | null>(null);
  $effect(() => {
    if (currentStep !== 'review') { preview = null; return; }
    // Job-Status mitlesen, damit die Vorschau nachzieht, sobald KI-Schritte fertig werden.
    void [w.effects.status, w.classText.status, w.speciesText.status, w.equipment.status, w.hpEffects.status];
    let cancelled = false;
    buildWizardCharacter(w).then((c) => { if (!cancelled) preview = c; }).catch(() => {});
    return () => { cancelled = true; };
  });

  const protocolGroups = $derived(
    preview
      ? buildCharacterProtocol(preview, {
          decisions: (w.effects.result?.riders ?? []).flatMap((r) => r.decisions),
        })
      : [],
  );

  function statusText(job: Job<unknown>): string {
    switch (job.status) {
      case 'running': return 'läuft …';
      case 'done': return 'fertig';
      case 'error': return `Fehler: ${job.error}`;
      case 'skipped': return 'übersprungen';
      default: return '—';
    }
  }
</script>

<div class="wizard-backdrop" role="dialog" aria-modal="true" aria-label="Charakter erstellen">
  <div class="wizard">
    <header>
      <h2>Neuer Charakter</h2>
      <button class="close" onclick={onCancel} aria-label="Abbrechen">✕</button>
    </header>

    <ol class="steps">
      {#each steps as s, i}
        <li class:active={i === stepIndex} class:done={i < stepIndex}>{s.label}</li>
      {/each}
    </ol>

    <div class="body">
      {#if currentStep === 'basics'}
        <label class="field">
          <span>Name</span>
          <input type="text" bind:value={w.name} placeholder="Charaktername" />
        </label>
        <label class="field">
          <span>Spielername (optional)</span>
          <input type="text" bind:value={w.playerName} placeholder="Spielername" />
        </label>

        <label class="field">
          <span>Klasse</span>
          <select value={w.klass.sourceKey} onchange={(e) => selectClass(e.currentTarget.value)}>
            <option value="">— Klasse wählen —</option>
            {#each baseClasses as node}
              <option value={node.key}>{classDisplayName(node)}</option>
            {/each}
          </select>
        </label>

        <label class="field">
          <span>Volk</span>
          <select value={w.species.sourceKey} onchange={(e) => selectSpecies(e.currentTarget.value)}>
            <option value="">— Volk wählen —</option>
            {#each speciesList as info}
              <option value={info.key}>{speciesDisplayName(info)}</option>
            {/each}
          </select>
        </label>

        <label class="field">
          <span>Hintergrund</span>
          <select value={w.background.sourceKey} onchange={(e) => selectBackground(e.currentTarget.value)}>
            <option value="">— Hintergrund wählen —</option>
            {#each backgroundList as info}
              <option value={info.key}>{backgroundDisplayName(info)}</option>
            {/each}
          </select>
        </label>
        <p class="hint">Die Unterklasse wird erst ab Stufe 3 gewählt. Sobald Volk, Klasse und Hintergrund stehen, arbeitet die KI im Hintergrund weiter, während du die nächsten Schritte machst.</p>

      {:else if currentStep === 'abilities'}
        <p class="hint">Punktekauf: {POINT_BUY_BUDGET} Punkte, Werte 8–15. Verbleibend: <strong>{remainingPoints(w.scores)}</strong></p>
        <div class="pointbuy">
          {#each ABILITY_KEYS as key}
            <div class="pb-row">
              <span class="pb-label">{ABILITY_LABEL[key]}</span>
              <button class="pb-btn" disabled={!canAdjust(w.scores, key, -1)} onclick={() => bump(key, -1)}>−</button>
              <span class="pb-val">{w.scores[key]}</span>
              <button class="pb-btn" disabled={!canAdjust(w.scores, key, 1)} onclick={() => bump(key, 1)}>+</button>
            </div>
          {/each}
        </div>
        <button class="secondary" onclick={useStandardArray}>Standard-Array (15,14,13,12,10,8)</button>

      {:else if currentStep === 'background'}
        {#if asiAllowed.length === 0}
          <p class="hint">Dieser Hintergrund liefert keine (auflösbaren) Attributserhöhungen.</p>
        {:else}
          <p class="hint">Verteile den Hintergrunds-Bonus: +2/+1 auf zwei oder +1/+1/+1 auf drei Attribute. Verbleibend: <strong>{BACKGROUND_ASI_TOTAL - allocatedTotal(w.asi)}</strong></p>
          <div class="asi">
            {#each asiAllowed as key}
              <div class="asi-row">
                <span>{ABILITY_LABEL[key]}</span>
                <div class="chips">
                  {#each [0, 1, 2] as v}
                    <button class="chip" class:sel={(w.asi[key] ?? 0) === v} onclick={() => setAsi(key, v)}>+{v}</button>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
          {#if !asiValid}<p class="warn">Ungültige Verteilung (erlaubt: +2/+1 oder +1/+1/+1).</p>{/if}
        {/if}

      {:else if currentStep === 'proficiencies'}
        {#if !grants}
          <p class="hint">Lade Übungen …</p>
        {:else}
          <div class="grants">
            {#if grants.skills.length}
              <p><strong>Fertigkeiten:</strong> {grants.skills.map((g) => skillLabelDe(g.value)).join(', ')}</p>
            {/if}
            {#if grants.savingThrows.length}
              <p><strong>Rettungswürfe:</strong> {grants.savingThrows.map((g) => abilityLabelDe(g.value)).join(', ')}</p>
            {/if}
            {#if grants.weapons.length}
              <p><strong>Waffen:</strong> {grants.weapons.map((g) => WEAPON_LABEL_DE[g.value]).join(', ')}</p>
            {/if}
            {#if grants.armor.length}
              <p><strong>Rüstung:</strong> {grants.armor.map((g) => ARMOR_LABEL_DE[g.value]).join(', ')}</p>
            {/if}
          </div>
          {#each grants.choices as choice, ci}
            <div class="field">
              <span>{choice.source.label}: wähle {choice.choose}</span>
              <div class="chips">
                {#each allowedSkillsFor(choice.from) as skill}
                  <button
                    class="chip"
                    class:sel={(skillPicks[ci] ?? []).includes(skill)}
                    onclick={() => toggleSkillPick(ci, skill, choice.choose)}
                  >{skillLabelDe(skill)}</button>
                {/each}
              </div>
            </div>
          {/each}
        {/if}

      {:else if currentStep === 'mastery'}
        {#if !mastery}
          <p class="hint">Lade Waffenmeisterschaft …</p>
        {:else}
          <p class="hint">Wähle die Waffenarten, deren Meisterschaftseigenschaft du nutzen darfst.</p>
          <WeaponMasteryPicker offer={mastery} bind:masteries={w.masteries} />
        {/if}

      {:else if currentStep === 'features'}
        {#if w.analysis.status === 'running'}
          <p class="hint">Die KI analysiert die Merkmale … ({statusText(w.analysis)})</p>
        {:else if w.analysis.status === 'skipped'}
          <p class="hint">Merkmals-Analyse übersprungen (kein QualityMinds-Modell aktiv). Merkmalsabhängige Wahlen kannst du später im Editor treffen.</p>
        {:else if w.analysis.status === 'error'}
          <p class="warn">{statusText(w.analysis)}</p>
        {:else if w.featureChoices.length === 0}
          <p class="hint">Keine erzwungenen Merkmalswahlen auf Stufe 1.</p>
        {:else}
          {#each w.featureChoices as choice}
            <div class="field">
              <span>
                {choice.feature}: {choice.question}
                {#if choice.help}<span class="info" title={choice.help}>ⓘ</span>{/if}
              </span>
              {#if choice.type === 'text'}
                <input type="text" value={answerFor(choice.id)[0] ?? ''} oninput={(e) => setSingleAnswer(choice.id, e.currentTarget.value)} />
              {:else}
                <TooltipSelect
                  options={optionsFor(choice)}
                  selected={answerFor(choice.id)}
                  multiple={choice.type === 'multiselect'}
                  max={choice.type === 'multiselect' ? choice.max : 0}
                  onchange={(v) => setChoiceAnswer(choice.id, v)}
                />
              {/if}
            </div>
          {/each}
        {/if}

      {:else if currentStep === 'equipment'}
        {#if w.equipment.status === 'running' && !equipGroups.length}
          <p class="hint">Die KI bereitet deine Startausrüstung als wählbare Optionen auf … ({statusText(w.equipment)})</p>
        {:else if w.equipment.status === 'error'}
          <p class="warn">Ausrüstung konnte nicht aufbereitet werden ({w.equipment.error}). Du kannst sie später im Editor ergänzen.</p>
        {:else if !equipGroups.length}
          <p class="hint">Keine Startausrüstung zum Auswählen (kann im Editor ergänzt werden).</p>
        {:else}
          <p class="hint">Wähle je Herkunft eine Option. Die Gegenstände landen als Inventar im fertigen Charakter.</p>
          {#each equipGroups as group, gi}
            <div class="field">
              <span>{group.source || 'Ausrüstung'}</span>
              <div class="eq-options">
                {#each group.options as opt, oi}
                  <button
                    type="button"
                    class="eq-option"
                    class:sel={equipSelected(gi) === oi}
                    onclick={() => selectEquipmentOption(gi, oi)}
                  >
                    <span class="eq-badge">{opt.label || String.fromCharCode(65 + oi)}</span>
                    <span class="eq-desc">
                      {opt.description || opt.items.map((i) => (i.count > 1 ? `${i.count}× ${i.name}` : i.name)).join(', ')}
                      {#if opt.goldPieces > 0}<em> · {opt.goldPieces} GM</em>{/if}
                    </span>
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        {/if}

      {:else if currentStep === 'review'}
        <div class="review">
          <p><strong>{w.name}</strong> — {w.klass.name} 1, {w.species.name}, {w.background.name}</p>

          <div class="protocol">
            <span class="section-label">Das wird angelegt</span>
            {#if !preview}
              <p class="hint">Charakter wird zusammengestellt …{#if aiBusy} (KI-Schritte laufen noch){/if}</p>
            {:else}
              {#each protocolGroups as g}
                <div class="proto-group">
                  <div class="proto-heading">{g.heading}</div>
                  {#each g.lines as l}<div class="proto-line">• {l}</div>{/each}
                </div>
              {/each}
            {/if}
          </div>

          {#if w.effects.status === 'skipped'}
            <p class="hint">Merkmals-Effekte übersprungen (kein QualityMinds-Modell) — im Editor ergänzbar.</p>
          {:else if w.effects.status === 'error'}
            <p class="warn">Merkmals-Effekte: {w.effects.error}</p>
          {/if}

          <ul class="jobs">
            <li>Klassenmerkmals-Text: {statusText(w.classText)}</li>
            <li>Volksmerkmals-Text: {statusText(w.speciesText)}</li>
            <li>Ausrüstung: {statusText(w.equipment)}</li>
          </ul>
          <p class="hint">Beim Erstellen wird kurz auf noch laufende KI-Schritte gewartet und ihr Ergebnis übernommen — was fehlschlägt, kannst du im Editor ergänzen.</p>
          {#if createError}<p class="warn">{createError}</p>{/if}
        </div>
      {/if}
    </div>

    {#if aiBusy}
      <div class="ai-status">
        <span class="spinner" aria-hidden="true"></span>
        <span>KI arbeitet: {runningJobs.map((j) => j.label).join(', ')} ({elapsedSec}s)</span>
      </div>
      {#if stalled}<p class="ai-stall">Seit über 50 s keine Antwort — du kannst warten oder die Grundwahl neu treffen.</p>{/if}
    {/if}

    <footer>
      <button class="secondary" onclick={onCancel}>Abbrechen</button>
      <div class="spacer"></div>
      {#if stepIndex > 0}<button class="secondary" onclick={back} disabled={creating}>Zurück</button>{/if}
      {#if stepIndex < steps.length - 1}
        <button class="primary" onclick={next} disabled={!canProceed}>Weiter</button>
      {:else}
        <button class="primary" onclick={create} disabled={creating}>{creating ? 'Erstelle …' : 'Charakter erstellen'}</button>
      {/if}
    </footer>
  </div>
</div>

<style>
  .wizard-backdrop {
    position: fixed; inset: 0; background: rgba(20, 12, 2, 0.45);
    display: flex; align-items: center; justify-content: center; z-index: 1000;
  }
  .wizard {
    background: var(--bg); color: var(--ink);
    border: 1px solid var(--border-strong); border-radius: 10px;
    /* Einheitliche Mindesthöhe, damit das Fenster nicht je Schritt springt und ein
       geöffnetes Dropdown Platz nach unten hat, statt den Body scrollen zu lassen. */
    width: min(760px, 92vw); min-height: min(600px, 86vh); max-height: 88vh;
    display: flex; flex-direction: column;
    box-shadow: 0 12px 40px rgba(20, 12, 2, 0.35);
  }
  header { display: flex; align-items: center; justify-content: space-between; padding: 0.8rem 1.1rem; border-bottom: 1px solid var(--border); }
  header h2 { margin: 0; font-size: 1.15rem; font-family: var(--font-display, inherit); color: var(--ink); }
  .close { background: none; border: none; color: var(--ink-muted); font-size: 1.25rem; line-height: 1; cursor: pointer; }
  .steps { list-style: none; display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0; padding: 0.6rem 1.1rem; font-size: 0.78rem; border-bottom: 1px solid var(--border); }
  .steps li { color: var(--ink-muted); padding: 0.15rem 0.55rem; border-radius: 4px; }
  .steps li.active { background: var(--arcane, var(--gold)); color: #fff; font-weight: 600; }
  .steps li.done { color: var(--ink-soft); }
  .ai-status {
    display: flex; align-items: center; gap: 0.5rem; margin: 0.6rem 1.1rem 0;
    padding: 0.4rem 0.6rem; font-size: 0.82rem; color: var(--ink-soft);
    background: var(--bg-raised); border: 1px solid var(--border); border-radius: 5px;
  }
  .spinner {
    flex: 0 0 auto; width: 0.9rem; height: 0.9rem; border-radius: 50%;
    border: 2px solid var(--border-strong); border-top-color: var(--arcane, var(--gold));
    animation: wiz-spin 0.8s linear infinite;
  }
  @keyframes wiz-spin { to { transform: rotate(360deg); } }
  .ai-stall { margin: 0.3rem 1.1rem 0; font-size: 0.78rem; color: var(--danger); }
  .body { flex: 1 1 auto; min-height: 0; padding: 1rem 1.1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.85rem; }
  .field { display: flex; flex-direction: column; gap: 0.35rem; }
  .field > span { font-size: 0.82rem; color: var(--ink-soft); }
  .info { cursor: help; color: var(--arcane, var(--gold)); font-size: 0.8rem; margin-left: 0.15rem; }
  input[type='text'], select {
    background: var(--bg-raised); color: var(--ink); border: 1px solid var(--border);
    border-radius: 5px; padding: 0.45rem 0.55rem; font: inherit;
  }
  input[type='text']::placeholder { color: var(--ink-muted); }
  input[type='text']:focus, select:focus { outline: none; border-color: var(--border-strong); }
  select { cursor: pointer; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .chip {
    background: var(--surface); color: var(--ink-soft); border: 1px solid var(--border);
    border-radius: 999px; padding: 0.25rem 0.65rem; cursor: pointer; font: inherit; font-size: 0.82rem;
  }
  .chip:hover { border-color: var(--border-strong); }
  .chip.sel { background: var(--arcane, var(--gold)); color: #fff; border-color: transparent; font-weight: 600; }
  .pointbuy { display: flex; flex-direction: column; gap: 0.4rem; }
  .pb-row { display: grid; grid-template-columns: 1fr auto 2.5rem auto; align-items: center; gap: 0.5rem; }
  .pb-label { color: var(--ink); }
  .pb-btn { width: 1.8rem; height: 1.8rem; border-radius: 5px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); cursor: pointer; font-size: 1rem; }
  .pb-btn:disabled { opacity: 0.4; cursor: default; }
  .pb-val { text-align: center; font-weight: 600; }
  .asi-row { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
  .grants p { margin: 0.2rem 0; font-size: 0.88rem; }
  .eq-options { display: flex; flex-direction: column; gap: 0.4rem; }
  .eq-option {
    display: flex; align-items: flex-start; gap: 0.6rem; text-align: left; cursor: pointer;
    background: var(--surface); color: var(--ink); border: 1px solid var(--border);
    border-radius: 6px; padding: 0.5rem 0.65rem; font: inherit;
  }
  .eq-option:hover { border-color: var(--border-strong); }
  .eq-option.sel { border-color: var(--arcane, var(--gold)); box-shadow: inset 0 0 0 1px var(--arcane, var(--gold)); }
  .eq-badge {
    flex: 0 0 auto; min-width: 1.5rem; text-align: center; font-weight: 700;
    color: var(--arcane, var(--gold));
  }
  .eq-desc { font-size: 0.88rem; color: var(--ink-soft); }
  .eq-desc em { color: var(--ink-muted); font-style: normal; }
  .section-label { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-muted); }
  .protocol { display: flex; flex-direction: column; gap: 0.5rem; }
  .proto-group { border-left: 2px solid var(--border-strong); padding-left: 0.6rem; }
  .proto-heading { font-weight: 600; font-size: 0.86rem; color: var(--ink); }
  .proto-line { font-size: 0.84rem; color: var(--ink-soft); }
  .hint { font-size: 0.82rem; color: var(--ink-soft); margin: 0; }
  .warn { color: var(--danger); font-size: 0.85rem; margin: 0.3rem 0 0; }
  .jobs { list-style: none; padding: 0; margin: 0.5rem 0; font-size: 0.85rem; color: var(--ink-soft); display: flex; flex-direction: column; gap: 0.2rem; }
  footer { display: flex; align-items: center; gap: 0.5rem; padding: 0.8rem 1.1rem; border-top: 1px solid var(--border); }
  .spacer { flex: 1; }
  .primary, .secondary { border-radius: 5px; padding: 0.45rem 0.9rem; cursor: pointer; font: inherit; }
  .primary { background: var(--arcane, var(--gold)); color: #fff; border: none; font-weight: 600; }
  .primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .secondary { background: var(--surface); color: var(--ink-soft); border: 1px solid var(--border); }
  .secondary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
