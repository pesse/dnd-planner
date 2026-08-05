<script lang="ts">
  /**
   * Oberfläche des Stufenaufstieg-Assistenten. Die Zustandsmaschine liegt in
   * `levelUp/steps.ts`, Lauf und Zustand in `levelUp/run.svelte.ts`, die abgeleiteten
   * Wahlen in `levelUp/choices.svelte.ts`.
   */
  import { onDestroy } from 'svelte';
  import { createLevelUpRun } from '../services/levelUp/run.svelte';
  import { hasAnswer } from '../services/levelUp/answers';
  import { type StepId, STEP_META } from '../services/levelUp/steps';
  import { isPausedAt, stepOf } from '../services/levelUp/runState';
  import { type LevelUpDelta } from '../services/levelUp';
  import { getClasses, classDisplayName, type ClassInfo } from '../classLibrary';
  import { blankSpell, getSpellLibrary, createSpellInline } from '../spellLibrary';
  import { type Change, type LevelUpQuestion, type LevelUpChangeSet } from '../schemas/levelUp';
  import SpellPickField from './SpellPickField.svelte';
  import FeatureChoicePicker from './FeatureChoicePicker.svelte';
  import Modal from './ui/Modal.svelte';
  import AiStatusBanner from './ui/AiStatusBanner.svelte';
  import LlmProviderSelect from './ui/LlmProviderSelect.svelte';
  import { searchFeats, featDesc, featDisplayName, type FeatEntry } from '../featsLibrary';
  import { type Character } from '../schemas/characterSchema';
  import { SPELL_SCHOOLS } from '../types';

  let { character, onApply, onclose }: {
    character: Character;
    onApply: (changeSet: LevelUpChangeSet, delta: LevelUpDelta) => void;
    onclose: () => void;
  } = $props();

  const run = createLevelUpRun({ get character() { return character; } });
  const st = run.st;
  const clock = run.clock;
  onDestroy(() => run.destroy());

  const currentActivity = $derived(st.steps.length ? st.steps[st.steps.length - 1] : '');

  const classList = $derived(character.classes ?? []);
  const hasClasses = $derived(classList.length > 0);

  let classChoice = $state((character.classes ?? []).length ? '0' : 'new');
  const isNewClass = $derived(classChoice === 'new');
  const classIndex = $derived(isNewClass ? classList.length : Number(classChoice));
  const effectiveFrom = $derived(isNewClass ? 0 : (classList[classIndex]?.level ?? 1));

  let libClasses = $state<ClassInfo[]>([]);
  $effect(() => { getClasses().then((cs) => { libClasses = cs.filter((c) => c.key && !c.subclassOf); }); });

  let newClassKey = $state('');
  let newClassName = $state('');
  function selectNewClass(key: string) {
    newClassKey = key;
    const found = libClasses.find((c) => c.key === key);
    newClassName = found ? classDisplayName(found) : '';
  }

  let targetLevel = $state(1);
  $effect(() => {
    if (targetLevel <= effectiveFrom || targetLevel > 20) targetLevel = Math.min(20, effectiveFrom + 1);
  });

  function startFlow() {
    if (st.run.kind === 'running') return;
    if (isNewClass && !newClassKey) {
      st.run = { kind: 'error', at: 'choose-class', message: 'Bitte eine Klasse für das Multiclassing wählen.' };
      return;
    }
    if (!isNewClass && !hasClasses) return;
    run.start(classIndex, targetLevel, isNewClass && newClassKey ? { sourceKey: newClassKey, name: newClassName } : undefined);
  }

  const allAnswered = $derived(run.choices.isAnswered(st.decisions));

  function setIn(id: string, v: string) {
    st.answers[id] = v;
  }
  function toggleIn(id: string, v: string, max?: number) {
    const cur = (st.answers[id] as string[]) ?? [];
    let nextArr = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    if (max && nextArr.length > max) nextArr = nextArr.slice(nextArr.length - max);
    st.answers[id] = nextArr;
  }
  const answerList = (id: string): string[] => {
    const v = st.answers[id];
    return Array.isArray(v) ? v : v ? [v] : [];
  };
  function setAnswerList(q: LevelUpQuestion, next: string[]) {
    st.answers[q.id] = q.type === 'multiselect' ? next : (next[0] ?? '');
  }

  const pickBinding = (id: string) =>
    [() => (st.answers[id] as string[]) ?? [], (v: string[]) => (st.answers[id] = v)] as const;

  let hpRolls = $state<Record<string, number[]>>({});
  function rollHp(q: LevelUpQuestion) {
    const sides = q.dieSides ?? 6;
    const count = Math.max(1, q.rollCount ?? 1);
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
    hpRolls[q.id] = rolls;
    st.answers[q.id] = String(rolls.reduce((a, b) => a + b, 0));
  }

  let spellCreator = $state<{ targetQ: string | null; name: string; nameEn: string; level: number; school: string; levels: number[] } | null>(null);
  const SCHOOL_KEYS = Object.keys(SPELL_SCHOOLS);
  function openSpellCreator(name: string, levels: number[], targetQ: string | null) {
    const lv = levels.length ? levels : [1];
    const trimmed = name.trim();
    // Der auslösende Name ist oft der englische KI-Vorschlag — als `name_en` vormerken,
    // damit künftige EN↔DE-Treffer greifen.
    spellCreator = { targetQ, name: trimmed, nameEn: trimmed, level: lv[0], school: 'evocation', levels: lv };
  }
  let creatingSpell = $state(false);
  async function saveInlineSpell() {
    if (!spellCreator || creatingSpell) return;
    creatingSpell = true;
    const s = spellCreator;
    try {
      const canonical = await createSpellInline(blankSpell(s.name, s.level, s.school, s.nameEn));
      st.spellLib = await getSpellLibrary();
      if (s.targetQ) {
        const key = st.spellLib.find((sp) => sp.name === canonical)?.key;
        if (key) {
          const [read, write] = pickBinding(s.targetQ);
          if (!read().includes(key)) write([...read(), key]);
        }
      } else {
        if (s.level === 0) {
          if (!st.validatedBase.grantedCantrips.includes(canonical)) st.validatedBase.grantedCantrips = [...st.validatedBase.grantedCantrips, canonical];
        } else if (!st.validatedBase.grantedPrepared.some((p) => p.name === canonical)) {
          st.validatedBase.grantedPrepared = [...st.validatedBase.grantedPrepared, { level: s.level, name: canonical }];
        }
        st.flagged = st.flagged.filter((f) => f.toLowerCase() !== s.name.toLowerCase() && f.toLowerCase() !== s.nameEn.toLowerCase());
      }
      spellCreator = null;
    } catch (e) {
      st.run = {
        kind: 'error', at: stepOf(st.run),
        message: `Zauber konnte nicht angelegt werden: ${e instanceof Error ? e.message : String(e)}`,
      };
    } finally {
      creatingSpell = false;
    }
  }

  let featQuery = $state('');
  function featResults(): FeatEntry[] { return featQuery.trim() ? searchFeats(st.featLib, featQuery, 8) : []; }
  function toggleFeat(entry: FeatEntry) {
    const key = entry.sourceKey ?? '';
    const nameDe = featDisplayName(entry);
    const name = entry.name || nameDe;
    const idx = st.chosenFeats.findIndex((f) => f.name === name);
    if (idx >= 0) { st.chosenFeats = st.chosenFeats.filter((_, i) => i !== idx); return; }
    if (st.chosenFeats.length >= st.featsToPick) return;
    // `grantsChoice`/`grants` reisen mit — nur damit lesen `feat-links` Zauber-Zugang und
    // pro-Stufe-Effekte deterministisch aus der Bibliothek statt aus der KI.
    st.chosenFeats = [...st.chosenFeats, { key, name, nameDe, gainedAt: st.delta!.toLevel, desc: entry.desc || featDesc(entry), descDe: entry.descDe, grantsChoice: entry.grantsChoice, grants: entry.grants, grantsSpells: entry.grantsSpells, grantsCasting: entry.grantsCasting }];
    featQuery = '';
  }

  function confirmClassFeatures() {
    st.run = { kind: 'paused', at: 'review' };
  }

  function apply() {
    if (st.delta) onApply($state.snapshot(run.doc) as LevelUpChangeSet, st.delta);
    st.run = { kind: 'paused', at: 'done' };
    onclose();
  }

  function changeLine(c: Change): string {
    switch (c.target) {
      case 'hpMax':
      case 'spellSlot':
        return `${c.label}: +${c.value}`;
      case 'hitDice':
        return `${c.label}: ${c.value}`;
      default:
        return c.label; // Label trägt Wert/Detail bereits (z.B. „Stärke +1", „Talent: X")
    }
  }
  // `doc.changes` steht bereits in kanonischer Schritt-Reihenfolge — kein Sortieren nötig.
  const progressionGroups = $derived.by<{ heading: string; lines: string[] }[]>(() => {
    const groups: { heading: string; lines: string[] }[] = [];
    const idx = new Map<string, number>();
    for (const c of run.doc.changes) {
      let i = idx.get(c.step);
      if (i === undefined) {
        i = groups.length;
        idx.set(c.step, i);
        groups.push({ heading: STEP_META[c.step as StepId]?.label ?? c.step, lines: [] });
      }
      groups[i].lines.push(changeLine(c));
    }
    return groups;
  });
  const reviewLines = $derived(run.doc.changes.map(changeLine));

  const docJson = $derived(JSON.stringify(run.doc, null, 2));
  let jsonCopied = $state(false);
  async function copyDoc() {
    try {
      await navigator.clipboard.writeText(docJson);
      jsonCopied = true;
      setTimeout(() => (jsonCopied = false), 1500);
    } catch { /* Clipboard nicht verfügbar → ignorieren */ }
  }
</script>

<Modal
  title="⬆ Stufenaufstieg — {character.name}"
  label="Stufenaufstieg"
  top={70}
  width="min(940px, 96vw)"
  maxHeight="88vh"
  pad="1.3rem"
  padBottom="1.3rem"
  {onclose}
>
  <LlmProviderSelect accent="arcane" />

  <div class="body">
  <aside class="protocol">
    <span class="field-label">Progression</span>
    {#if progressionGroups.length}
      <div class="facts">
        {#each progressionGroups as g}
          <div class="proto-group">
            <div class="proto-heading">{g.heading}</div>
            {#each g.lines as l}<div class="fact">• {l}</div>{/each}
          </div>
        {/each}
      </div>
    {:else}
      <span class="field-hint">Noch keine Änderungen.</span>
    {/if}
  </aside>

  <div class="main">
  {#if isPausedAt(st.run, 'choose-class')}
    <div class="row">
      <span class="field-label">Welche Klasse steigt auf?</span>
      <select class="select" value={classChoice} onchange={(e) => (classChoice = (e.target as HTMLSelectElement).value)}>
        {#each classList as c, i}
          <option value={String(i)}>{c.name} {c.level}{c.subclassName ? ` (${c.subclassName})` : ''}</option>
        {/each}
        <option value="new">➕ Neue Klasse (Multiclassing)</option>
      </select>
    </div>

    {#if isNewClass}
      <div class="row">
        <span class="field-label">Neue Klasse</span>
        <select class="select" value={newClassKey} onchange={(e) => selectNewClass((e.target as HTMLSelectElement).value)}>
          <option value="">— Klasse wählen —</option>
          {#each libClasses as lc}
            <option value={lc.key}>{classDisplayName(lc)}</option>
          {/each}
        </select>
        {#if !libClasses.length}<span class="field-hint">Klassen-Bibliothek wird geladen…</span>{/if}
      </div>
    {/if}

    <div class="row">
      <span class="field-label">Zielstufe</span>
      {#if !isNewClass && effectiveFrom >= 20}
        <p class="hint warn">{classList[classIndex]?.name} ist bereits auf Stufe 20.</p>
      {:else}
        <input class="input" type="number" min={effectiveFrom + 1} max="20" value={targetLevel}
               oninput={(e) => (targetLevel = Number((e.target as HTMLInputElement).value))} />
        <span class="field-hint">
          {isNewClass
            ? `Neue Klasse startet auf Stufe ${targetLevel}`
            : `von Stufe ${effectiveFrom} → ${targetLevel} (${targetLevel - effectiveFrom === 1 ? 'eine Stufe' : `${Math.max(0, targetLevel - effectiveFrom)} Stufen`})`}
        </span>
      {/if}
    </div>
  {/if}

  {#if st.run.kind === 'running'}
    <AiStatusBanner accent="arcane" text="{currentActivity || 'KI arbeitet…'} ({clock.elapsedSec}s)" />
  {/if}
  {#if clock.stalled}
    <p class="hint warn">Seit {clock.stalledSec}s keine Antwort — du kannst abbrechen und neu starten.</p>
  {/if}

  {#if isPausedAt(st.run, 'subclass-choice') && st.delta}
    <div class="row">
      <span class="field-label">Subklasse für {st.delta.klasseName}</span>
      <span class="field-hint">Die Wahl schaltet die Subklassen-Merkmale frei.</span>
      <div class="group-chips">
        {#each st.delta.subclassOptions as sc}
          <button type="button" class="group-chip" class:on={st.chosenSubclass?.key === sc.key}
                  onclick={() => (st.chosenSubclass = { key: sc.key, name: sc.name })}>{sc.name}</button>
        {/each}
      </div>
      {#if !st.delta.subclassOptions.length}<span class="field-hint">Keine Subklassen gefunden.</span>{/if}
    </div>
  {/if}

  {#snippet choiceBlock(list: LevelUpQuestion[])}
    <div class="questions">
      {#each list as q (q.id)}
        {@const choice = run.choices.analysisById.get(q.id)}
        {#if choice && (q.type === 'choice' || q.type === 'multiselect')}
          <FeatureChoicePicker
            {choice}
            answer={answerList(q.id)}
            open={!hasAnswer(st.answers[q.id])}
            gainedAt={st.delta?.toLevel ?? 0}
            onchange={(next) => setAnswerList(q, next)}
            onapply={() => {}}
          />
        {:else}
          <div class="row">
            <span class="field-label">{q.prompt}{#if !q.required}<span class="field-hint"> (optional)</span>{/if}</span>
            {#if q.help}<span class="field-hint">{q.help}</span>{/if}
            {#if q.type === 'number'}
              <input class="input" type="number" min={q.min} max={q.max} value={st.answers[q.id] as string} oninput={(e) => setIn(q.id, (e.target as HTMLInputElement).value)} />
            {:else if q.type === 'spell-picker'}
              {@const bind = pickBinding(q.id)}
              <SpellPickField
                title={q.prompt}
                library={st.spellLib}
                spellLevels={q.spellLevels}
                spellClass={q.spellClass}
                max={q.max ?? 1}
                known={run.knownSpells.except(q.id)}
                bind:picks={bind[0], bind[1]}
                allowCreate
                onCreate={(name, levels) => openSpellCreator(name, levels, q.id)}
              />
            {:else}
              <textarea class="textarea" rows="2" value={st.answers[q.id] as string} oninput={(e) => setIn(q.id, (e.target as HTMLTextAreaElement).value)}></textarea>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {/snippet}

  {#if isPausedAt(st.run, 'feature-choices')}
    <p class="hint">Diese Wahl(en) bestimmen die konkreten Effekte — nach dem Bestätigen leitet die KI sie ab (z.B. gewährte Zauber, Kampfstil, Expertise).</p>
    {@render choiceBlock(run.choices.baseChoiceQs)}
  {/if}

  {#if isPausedAt(st.run, 'feat-choices')}
    {#if st.featChoices.length}
      <p class="hint">Wahl(en) durch die gewählten Talente — nach dem Bestätigen leitet die KI die Effekte ab.</p>
    {:else}
      <p class="hint">Wahl(en) der gewählten Talente — Liste, Attribut und Anzahl stehen in der Bibliothek, hier wird nur ausgewählt.</p>
    {/if}
    {@render choiceBlock(run.choices.featChoiceQs)}
  {/if}

  {#if isPausedAt(st.run, 'player-decisions')}
    {#if st.decisions.length === 0}
      <p class="hint">Keine offenen Entscheidungen — direkt zum Vorschlag.</p>
    {/if}
    <div class="questions">
      {#each st.decisions as q (q.id)}
        <div class="row">
          <span class="field-label">{q.prompt}{#if !q.required}<span class="field-hint"> (optional)</span>{/if}</span>
          {#if q.help}<span class="field-hint">{q.help}</span>{/if}
          {#if q.type === 'choice'}
            <select class="select" value={st.answers[q.id] as string} onchange={(e) => setIn(q.id, (e.target as HTMLSelectElement).value)}>
              {#each q.options as opt}<option value={opt.value}>{opt.label}</option>{/each}
            </select>
          {:else if q.type === 'multiselect'}
            <div class="group-chips">
              {#each q.options as opt}
                <button type="button" class="group-chip" class:on={(st.answers[q.id] as string[])?.includes(opt.value)} onclick={() => toggleIn(q.id, opt.value, q.max)}>{opt.label}</button>
              {/each}
            </div>
          {:else if q.type === 'number'}
            <input class="input" type="number" min={q.min} max={q.max} value={st.answers[q.id] as string} oninput={(e) => setIn(q.id, (e.target as HTMLInputElement).value)} />
          {:else if q.type === 'spell-picker'}
            {@const bind = pickBinding(q.id)}
            <SpellPickField
              title={q.prompt}
              library={st.spellLib}
              spellLevels={q.spellLevels}
              spellClass={q.spellClass}
              max={q.max ?? 1}
              known={run.knownSpells.except(q.id)}
              bind:picks={bind[0], bind[1]}
              allowCreate
              onCreate={(name, levels) => openSpellCreator(name, levels, q.id)}
            />
          {:else if q.type === 'hp-roll'}
            {#if st.answers['hp_method'] === 'roll'}
              <div class="roll">
                <button type="button" class="secondary-btn" onclick={() => rollHp(q)}>🎲 {hpRolls[q.id]?.length ? 'Neu würfeln' : 'Würfeln'}</button>
                {#if hpRolls[q.id]?.length}
                  <span class="roll-result">{hpRolls[q.id].join(' + ')} = <strong>{st.answers[q.id]}</strong> (+ KON je Stufe)</span>
                {:else}
                  <span class="field-hint">Noch nicht gewürfelt.</span>
                {/if}
              </div>
            {:else}
              <span class="field-hint">„Durchschnitt" gewählt — kein Wurf nötig.</span>
            {/if}
          {:else}
            <textarea class="textarea" rows="2" value={st.answers[q.id] as string} oninput={(e) => setIn(q.id, (e.target as HTMLTextAreaElement).value)}></textarea>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if isPausedAt(st.run, 'feat-choice') && st.delta}
    <div class="row">
      <span class="field-label">{st.featsToPick} Talent(e) wählen</span>
      <div class="chips">
        {#each st.chosenFeats as f}
          <span class="pick">{f.nameDe}<button type="button" onclick={() => (st.chosenFeats = st.chosenFeats.filter((x) => x.name !== f.name))}>×</button></span>
        {/each}
      </div>
      <input class="input" placeholder="Talent suchen…" value={featQuery} oninput={(e) => (featQuery = (e.target as HTMLInputElement).value)} />
      {#if featQuery.trim()}
        <div class="results">
          {#each featResults() as entry}
            <button type="button" class="result" onclick={() => toggleFeat(entry)} disabled={st.chosenFeats.length >= st.featsToPick && !st.chosenFeats.some((f) => f.nameDe === featDisplayName(entry))}>{featDisplayName(entry)}</button>
          {/each}
          {#if !featResults().length}<span class="field-hint">Keine Treffer im Talent-Wörterbuch.</span>{/if}
        </div>
      {/if}
      <span class="field-hint">{st.chosenFeats.length} / {st.featsToPick} gewählt</span>
    </div>
  {/if}

  {#if isPausedAt(st.run, 'class-features')}
    <div class="row">
      <span class="field-label">Klassenmerkmale & Eigenschaften</span>
      <span class="field-hint">Die KI hat die neuen Merkmale bereits verkürzt ins bestehende Feld eingearbeitet. Du kannst frei nachbearbeiten oder erneut zusammenführen lassen.</span>
      {#if st.gainedFeatures.length}
        <div class="facts">
          {#each st.gainedFeatures as gf}<div class="fact">• {gf.name}{gf.source === 'subclass' ? ' (Subklasse)' : ''}</div>{/each}
        </div>
      {/if}
      <textarea class="textarea ta-features" rows="10" bind:value={st.featuresText}></textarea>
      <button type="button" class="secondary-btn rework-btn" onclick={run.rework} disabled={st.run.kind === 'running'}>🪄 Nochmal zusammenführen</button>
    </div>
  {/if}

  {#if spellCreator}
    <div class="creator">
      <span class="field-label">Neuen Zauber anlegen</span>
      <input class="input" placeholder="Deutscher Name" value={spellCreator.name} oninput={(e) => (spellCreator!.name = (e.target as HTMLInputElement).value)} />
      <input class="input" placeholder="Englischer Name (für Matching, optional)" value={spellCreator.nameEn} oninput={(e) => (spellCreator!.nameEn = (e.target as HTMLInputElement).value)} />
      <div class="row two">
        <select class="select" value={String(spellCreator.level)} onchange={(e) => (spellCreator!.level = Number((e.target as HTMLSelectElement).value))}>
          {#each spellCreator.levels as lv}<option value={String(lv)}>{lv === 0 ? 'Zaubertrick' : `Grad ${lv}`}</option>{/each}
        </select>
        <select class="select" value={spellCreator.school} onchange={(e) => (spellCreator!.school = (e.target as HTMLSelectElement).value)}>
          {#each SCHOOL_KEYS as sk}<option value={sk}>{SPELL_SCHOOLS[sk as keyof typeof SPELL_SCHOOLS]}</option>{/each}
        </select>
      </div>
      <div class="actions">
        <button class="secondary-btn" onclick={() => (spellCreator = null)}>Abbrechen</button>
        <button class="primary-btn" onclick={saveInlineSpell} disabled={creatingSpell || !spellCreator.name.trim()}>{creatingSpell ? 'Speichert…' : 'Zauber anlegen'}</button>
      </div>
      <span class="field-hint">Wird in der Zauber-Bibliothek gespeichert; der Dialog bleibt offen.</span>
    </div>
  {/if}

  {#if isPausedAt(st.run, 'review')}
    {#if run.doc.summary}<p class="hint">{run.doc.summary}</p>{/if}
    <div class="review">
      <div class="review-line">✦ {run.doc.klasse || 'Klasse'}: Stufe {run.doc.fromLevel} → {run.doc.toLevel}</div>
      {#each reviewLines as line}<div class="review-line">✦ {line}</div>{/each}
      {#if reviewLines.length === 0}<div class="review-line muted">Keine automatischen Änderungen erkannt.</div>{/if}
    </div>
    {#if st.flagged.length}
      <div class="flagged">
        <span class="field-label warn">Nicht in der Bibliothek gefunden</span>
        {#each st.flagged as f}
          <div class="flagged-line">⚠ {f}
            <button type="button" class="link-btn" onclick={() => openSpellCreator(f, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], null)}>anlegen</button>
          </div>
        {/each}
      </div>
    {/if}
    <p class="field-hint">Die Änderungen werden additiv in den Entwurf übernommen (bestehende Item-Boni bleiben erhalten) und farblich hervorgehoben. Speichern/Verwerfen wie gewohnt.</p>
  {/if}

  {#if st.run.kind === 'error'}<p class="hint err">{st.run.message}</p>{/if}

  <div class="actions">
    {#if st.run.kind === 'running'}
      <button class="secondary-btn" onclick={run.stop}>Abbrechen</button>
    {:else if isPausedAt(st.run, 'choose-class')}
      <button class="secondary-btn" onclick={onclose}>Schließen</button>
      <button class="primary-btn" onclick={startFlow}
              disabled={(isNewClass && !newClassKey) || (!isNewClass && effectiveFrom >= 20)}>Weiter</button>
    {:else if isPausedAt(st.run, 'subclass-choice')}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={() => st.chosenSubclass && run.chooseSubclass(st.chosenSubclass.key, st.chosenSubclass.name)} disabled={!st.chosenSubclass}>Weiter</button>
    {:else if isPausedAt(st.run, 'feature-choices')}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={() => run.resume('feature-choices')} disabled={!run.choices.allBaseAnswered}>Weiter</button>
    {:else if isPausedAt(st.run, 'player-decisions')}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={() => run.resume('player-decisions')} disabled={!allAnswered}>Weiter</button>
    {:else if isPausedAt(st.run, 'feat-choice')}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={() => run.resume('feat-choice')} disabled={st.chosenFeats.length !== st.featsToPick}>Weiter</button>
    {:else if isPausedAt(st.run, 'feat-choices')}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={() => run.resume('feat-choices')} disabled={!run.choices.allFeatAnswered}>Weiter</button>
    {:else if isPausedAt(st.run, 'class-features')}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={confirmClassFeatures}>Weiter</button>
    {:else if isPausedAt(st.run, 'review')}
      <button class="secondary-btn" onclick={onclose}>Verwerfen</button>
      <button class="primary-btn" onclick={apply}>In den Entwurf übernehmen</button>
    {/if}
  </div>
  </div><!-- .main -->
  </div><!-- .body -->

  {#if st.delta}
    <details class="json-view">
      <summary>
        <span>JSON-Dokument</span>
        <button type="button" class="link-btn json-copy" onclick={(e) => { e.preventDefault(); copyDoc(); }}>{jsonCopied ? 'Kopiert ✓' : 'Kopieren'}</button>
      </summary>
      <pre class="json">{docJson}</pre>
    </details>
  {/if}
</Modal>

<style>
  .body { display: flex; gap: 1rem; align-items: flex-start; }
  .protocol {
    flex: 0 0 220px; display: flex; flex-direction: column; gap: 0.45rem;
    border-right: 1px solid var(--surface); padding-right: 0.9rem;
    max-height: 66vh; overflow-y: auto;
  }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.7rem; }
  .facts { display: flex; flex-direction: column; gap: 0.5rem; }
  .proto-group { display: flex; flex-direction: column; gap: 0.15rem; }
  .proto-heading { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); }
  .fact { font-size: 0.76rem; color: var(--ink-soft); }

  .json-view { border-top: 1px solid var(--surface); padding-top: 0.5rem; }
  .json-view summary {
    display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
    font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--ink-muted); cursor: pointer; user-select: none;
  }
  .json-view summary::-webkit-details-marker { display: none; }
  .json-copy { font-size: 0.7rem; }
  .json {
    margin: 0.5rem 0 0; max-height: 30vh; overflow: auto; white-space: pre;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.72rem; line-height: 1.4; color: var(--ink-soft);
    background: var(--surface); border-radius: 4px; padding: 0.7rem; tab-size: 2;
  }
  .roll { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .roll-result { font-size: 0.82rem; color: var(--ink-soft); }
  .rework-btn { align-self: flex-start; }
  .ta-features { min-height: 12rem; }

  .row { display: flex; flex-direction: column; gap: 0.3rem; }
  .row.two { flex-direction: row; gap: 0.5rem; }
  .row.two > * { flex: 1; }
  .field-label.warn { color: var(--gold, #c89b3c); }
  .field-hint { text-transform: none; letter-spacing: 0; color: var(--ink-muted); font-size: 0.72rem; }

  .questions { display: flex; flex-direction: column; gap: 0.7rem; }

  .group-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .group-chip {
    background: var(--surface); border: 1px solid var(--border); border-radius: 999px;
    color: var(--ink-muted); padding: 0.18rem 0.6rem; cursor: pointer; font-family: inherit; font-size: 0.74rem; opacity: 0.6;
  }
  .group-chip:hover { opacity: 0.85; }
  .group-chip.on { border-color: var(--arcane, var(--red)); color: var(--ink); opacity: 1; }

  .creator {
    display: flex; flex-direction: column; gap: 0.35rem;
    border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem; background: var(--surface);
  }
  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .pick { display: inline-flex; align-items: center; gap: 0.3rem; background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 0.12rem 0.5rem; font-size: 0.74rem; color: var(--ink); }
  .pick button { background: none; border: none; color: var(--ink-muted); cursor: pointer; font-size: 0.9rem; line-height: 1; }
  .pick button:hover { color: var(--danger); }
  .results { display: flex; flex-direction: column; gap: 0.15rem; max-height: 180px; overflow-y: auto; }
  .result { text-align: left; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; color: var(--ink-soft); padding: 0.25rem 0.5rem; cursor: pointer; font-family: inherit; font-size: 0.78rem; }
  .result:hover { border-color: var(--arcane, var(--red)); color: var(--ink); }
  .result:disabled { opacity: 0.4; cursor: not-allowed; }

  .input:focus, .select:focus, .textarea:focus { border-color: var(--arcane, var(--red)); }
  .textarea { resize: vertical; }

  .review { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.3rem 0; }
  .review-line { font-size: 0.82rem; color: var(--ink-soft); }
  .review-line.muted { color: var(--ink-muted); }

  .flagged { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.3rem 0; }
  .flagged-line { font-size: 0.8rem; color: var(--gold, #c89b3c); }
  .link-btn { background: none; border: none; color: var(--arcane, var(--red)); cursor: pointer; font-family: inherit; font-size: 0.78rem; text-decoration: underline; padding: 0 0.2rem; }

  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  .primary-btn { background: var(--arcane, var(--red)); }

  .hint { font-size: 0.78rem; margin: 0; }
  .hint.warn { color: var(--gold, #c89b3c); }
  .hint.err { color: var(--danger); }
</style>
