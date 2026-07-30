<script lang="ts">
  /**
   * KI-gestützter Stufenaufstieg-Assistent als mehrstufiger Wizard mit Checkpoints.
   *
   * Ablauf (deterministische Zustandsmaschine in levelUpMachine.ts):
   *   Klasse wählen → Basis-Delta (det.) → [Subklasse wählen] → Subklassen-Delta (det.)
   *   → Merkmals-Analyse (KI, Call 1) → [Merkmals-Wahlen] → Merkmals-Effekte (KI, Call C)
   *   → Spieler-Entscheidungen → [Talente wählen → Talent-Analyse (KI) → [Talent-Wahlen]
   *   → Talent-Effekte (KI)] → Narrativ (KI) + Vorschlag (det.) → Review → in den Draft.
   *
   * Erkennt Call 1 (Analyse) erzwungene Feature-Wahlen (Landart, Kampfstil, Expertise …),
   * hält die Maschine DIREKT DANACH am Choice-Checkpoint an; der finalisierende Effekt-Call
   * bäckt die getroffene Entscheidung ein. Der Rider trägt nur Ergebnisse + die Entscheidung.
   *
   * Das Muster „Analyse → [Wahlen] → Effekte" gilt für Merkmale UND Talente. Fehlende
   * Zauber lassen sich inline anlegen, ohne den Dialog zu schließen. Alle Zahlen werden
   * deterministisch assembliert; die KI liefert nur Prosa-Deutung + Narrativ.
   *
   * Scaffolding (Drag, Uhr/Stall-Erkennung, Schritt-Log, Provider-Wahl, Soft-Cancel)
   * analog ContextActionModal.svelte / bisheriger Assistent.
   */
  import { onDestroy } from 'svelte';
  import { llmConfig, saveConfig, loadApiKeyForProvider } from '../stores/llm';
  import { modelsFor, defaultModelFor, defaultBaseUrlFor } from '../llmModels';
  import { runAiAction } from '../services/aiActions/runner';
  import { computeLevelUpDelta, type LevelUpDelta } from '../services/levelUp';
  import {
    buildLevelUpNarrativeAction, buildNarrativeInput, type CharacterSummary,
  } from '../services/aiActions/levelUpAction';
  import {
    buildFieldSummaryAction, buildFieldSummaryInput, SHEET_FIELDS,
  } from '../services/aiActions/fieldSummaryAction';
  import {
    analyzeFeatureEffects, finalizeFeatureEffects,
    type GainedFeature, type FeatureClassContext, type FeatureAnalysis, type ResolvedChoice,
  } from '../services/aiActions/featureEffectsAction';
  import {
    buildLevelUpEffectsAction, buildLevelUpEffectsInput, type EffectFeature,
  } from '../services/aiActions/levelUpEffectsAction';
  import {
    resolveSpeciesTraits, resolveClassFeatures, resolveFeatLinks, resolvePastChoices, type PastChoice,
  } from '../services/characterFeatures';
  import {
    type StepId, type AdvanceCtx, type ValidatedRiders, type DeclaredSpells,
    gainedFeaturesFor, computeSubclassFeatures, featToGainedFeature, validateRiderSpells,
    buildDecisions, buildFeatureChoices, countFeatsToPick, learnInfo,
    resolveDeclaredSpells, noDeclaredSpells,
    STEP_META, isCheckpoint, advance, buildDoc, sheetNoteLines, answerValues,
  } from '../services/levelUpMachine';
  import { withoutSpellGrantFeatures } from '../services/grantedSpells';
  import {
    spellAccessChoices, spellAccessGrantOf, spellListChoiceId, withoutSpellAccessFeatures,
    type SpellAccessGrant,
  } from '../services/spellAccess';
  import {
    parseLevelUpEffects, parseLevelUpNarrative, parseFieldSummary,
    type LevelUpQuestion, type FeatureRider, type Change, type LevelUpChangeSet, type LevelUpDoc,
  } from '../schemas/levelUp';
  import { getClasses, classDisplayName, type ClassInfo } from '../classLibrary';
  import { getSpellLibrary, createSpellInline, type SpellInfo } from '../spellLibrary';
  import { decodePick, encodePick } from '../services/spellcasting';
  import SpellPickField from './SpellPickField.svelte';
  import { getFeats, searchFeats, featDesc, featDisplayName, type FeatEntry } from '../featsLibrary';
  import type { Character } from '../schemas/character';
  import type { Spell, LlmProvider } from '../types';
  import { SPELL_SCHOOLS } from '../types';
  import { OWN_SOURCE, type FeatureChoiceGrant } from '../schemas/shared';

  let { character, onApply, onclose }: {
    character: Character;
    onApply: (changeSet: LevelUpChangeSet, delta: LevelUpDelta) => void;
    onclose: () => void;
  } = $props();

  // ── State-Machine ──────────────────────────────────────────────────────────────
  let phase = $state<StepId | 'running'>('choose-class');
  let delta = $state<LevelUpDelta | null>(null);
  let chosenSubclass = $state<{ key: string; name: string } | null>(null);
  let subFeatures = $state<GainedFeature[]>([]);    // NUR Subklassen-Merkmale (Info-Einträge im Dokument)
  let gainedFeatures = $state<GainedFeature[]>([]); // Klassen- + Subklassen-Merkmale (KI-Input + UI-Liste)
  /**
   * Immer-vorbereitete Zauber aus Merkmalstabellen (Kreissprüche, Domänenzauber …) —
   * deterministisch gelesen, deshalb hier und nicht in `validatedBase`: sie hängen am
   * Subklassen-Schritt und stehen auch ohne KI-Analyse.
   */
  let declaredSpells = $state<DeclaredSpells>(noDeclaredSpells());
  let riders = $state<FeatureRider[]>([]);
  let validatedBase = $state<ValidatedRiders>({ riders: [], flagged: [], grantedCantrips: [], grantedPrepared: [] });
  let decisions = $state<LevelUpQuestion[]>([]);
  let answers = $state<Record<string, string | string[]>>({});
  // Merkmals-/Talent-Analyse (Call 1) + die daraus abgeleiteten Wahl-Fragen für den
  // Checkpoint DIREKT nach Call 1. Der finalisierende Effekt-Call (Call C) bäckt die
  // getroffene Entscheidung ein — kein iterativer Loop mehr.
  let baseAnalysis = $state<FeatureAnalysis | null>(null);
  let baseChoices = $state<LevelUpQuestion[]>([]);
  let featAnalysis = $state<FeatureAnalysis | null>(null);
  let featChoices = $state<LevelUpQuestion[]>([]);
  let featsToPick = $state(0);
  // Englisch geführt (`name`/`desc` = Deutungs-Eingang), deutsche Fassung für Anzeige und
  // Übersetzungs-Call. `nameDe` ist auch der Anzeigename in der Talent-Auswahl.
  let chosenFeats = $state<{ key: string; name: string; nameDe: string; gainedAt: number; desc: string; descDe?: string; grantsChoice?: FeatureChoiceGrant }[]>([]);
  /**
   * Deklarierter Zauber-Zugang der gewählten Talente („Magiekundiger") — am Schritt
   * `feat-links` aus der Bibliothek gelesen. Damit fällt das Talent aus dem KI-Eingang.
   */
  let featAccess = $state<SpellAccessGrant[]>([]);
  let featRiders = $state<FeatureRider[]>([]);
  let validatedFeats = $state<ValidatedRiders>({ riders: [], flagged: [], grantedCantrips: [], grantedPrepared: [] });
  let flagged = $state<string[]>([]);
  // Pro-Stufe-TP-Max aus dem Voll-Kontext-Effekt-Pass (z.B. Zwergische Zähigkeit).
  let hpPerLevelSources = $state<{ feature: string; sourceKey: string; amount: number }[]>([]);
  let narrativeSummary = $state(''); // KI-Narrativ (Zusammenfassung) → doc.summary
  let featuresText = $state(''); // editierbarer Klassenmerkmale-Volltext (KI-Merge + Nachbearbeitung)

  const modOf = (s: number) => Math.floor((s - 10) / 2);

  const classList = $derived(character.classes ?? []);
  const hasClasses = $derived(classList.length > 0);

  // ── Klasse & Zielstufe ───────────────────────────────────────────────────────
  let classChoice = $state((character.classes ?? []).length ? '0' : 'new');
  const isNewClass = $derived(classChoice === 'new');
  const classIndex = $derived(isNewClass ? classList.length : Number(classChoice));
  const effectiveFrom = $derived(isNewClass ? 0 : (classList[classIndex]?.level ?? 1));

  let libClasses = $state<ClassInfo[]>([]);
  $effect(() => { getClasses().then((cs) => { libClasses = cs.filter((c) => c.key && !c.subclassOf); }); });

  // Entscheidungen früherer Stufen: die Analyse darf sie nicht erneut stellen und muss
  // ihre Folgen als gesetzt behandeln (Wächter ⇒ Kriegswaffen + mittlere Rüstung).
  let pastChoices = $state<PastChoice[]>([]);
  $effect(() => { resolvePastChoices(character).then((p) => { pastChoices = p; }); });
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

  // ── Bibliotheken (Zauber/Talente), lazy ─────────────────────────────────────────
  let spellLib = $state<SpellInfo[]>([]);
  let featLib = $state<FeatEntry[]>([]);
  async function ensureSpellLib() { if (!spellLib.length) spellLib = await getSpellLibrary(); return spellLib; }

  function buildSummary(): CharacterSummary {
    const abilities: Record<string, number> = {
      str: character.str, ges: character.ges, kon: character.kon,
      int: character.int, wei: character.wei, cha: character.cha,
    };
    const mods = Object.fromEntries(Object.entries(abilities).map(([k, v]) => [k, modOf(v)]));
    return {
      name: character.name,
      classes: classList.map((c) => ({ name: c.name, level: c.level, subclassName: c.subclassName ?? '' })),
      totalLevel: classList.reduce((s, c) => s + (c.level || 0), 0),
      abilities, mods,
      hitDice: character.hitDice ?? '',
      spellcasting: {
        class: character.spells?.spellcastingClass ?? '',
        ability: character.spells?.spellcastingAbility ?? '',
        currentSlots: (character.spells?.slots ?? []).map((s) => s.total),
      },
    };
  }

  function classContext(): FeatureClassContext {
    return {
      klasseName: delta?.klasseName ?? '',
      // In dieser Spanne gewählt (chosenSubclass) oder längst bekannt (Delta).
      subclassName: chosenSubclass?.name ?? delta?.subclassName ?? '',
      casterType: delta?.casterType ?? 'NONE',
      casterKind: delta?.casterKind ?? 'none',
      spellcastingAbility: character.spells?.spellcastingAbility ?? '',
      toLevel: delta?.toLevel ?? 1,
    };
  }

  /** Höchster Zaubergrad, den der Charakter nach dem Aufstieg wirken kann. */
  function maxSpellLevel(): number {
    let m = 0;
    for (let i = 0; i < 9; i++) {
      const total = (character.spells?.slots?.[i]?.total ?? 0) + (delta?.spellSlotDelta?.[i] ?? 0);
      if (total > 0) m = i + 1;
    }
    return m;
  }

  // ── Verschiebbarer Dialog ────────────────────────────────────────────────────
  let pos = $state({ x: Math.max(16, window.innerWidth / 2 - 280), y: 70 });
  let dragOff = { x: 0, y: 0 };
  let dragging = false;
  function startDrag(e: MouseEvent) {
    dragging = true;
    dragOff = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', endDrag);
    e.preventDefault();
  }
  function onDrag(e: MouseEvent) {
    if (!dragging) return;
    pos = {
      x: Math.min(Math.max(0, e.clientX - dragOff.x), window.innerWidth - 80),
      y: Math.min(Math.max(0, e.clientY - dragOff.y), window.innerHeight - 40),
    };
  }
  function endDrag() {
    dragging = false;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
  }

  // ── Lauf-State + Uhr ──────────────────────────────────────────────────────────
  let steps = $state<string[]>([]);
  let running = $state(false);
  let error = $state('');
  let abort: AbortController | null = null;
  let userAborted = false;
  let runToken = 0;
  let resumePhase = $state<StepId>('choose-class');
  // Weitester bereits abgeschlossener Schritt — steuert, was das Dokument WÄHREND eines
  // Laufs zeigt. Wird pro Schritt hochgezählt, damit deterministische Teilschritte (z.B.
  // Subklassen-Delta) im JSON erscheinen, BEVOR die nachfolgende KI-Aktion läuft.
  let reachedStep = $state<StepId>('choose-class');
  const pushStep = (text: string) => { steps = [...steps, text]; lastActivityMs = Date.now(); };

  /** Angekündigte Zauberliste, die der Parser nicht lesen konnte — sonst fiele sie stumm zur KI. */
  const reportUnreadableGrants = () => {
    for (const name of declaredSpells.unreadable)
      pushStep(`„${name}" kündigt eine Zauberliste an, die nicht als Tabelle lesbar ist — Zauber nicht automatisch übernommen.`);
  };

  const STALL_MS = 50_000;
  let nowMs = $state(0);
  let runStartMs = 0;
  let lastActivityMs = $state(0);
  let tick: ReturnType<typeof setInterval> | null = null;

  let elapsedSec = $derived(running ? Math.max(0, Math.floor((nowMs - runStartMs) / 1000)) : 0);
  let stalledSec = $derived(running ? Math.max(0, Math.floor((nowMs - lastActivityMs) / 1000)) : 0);
  let stalled = $derived(running && nowMs - lastActivityMs > STALL_MS);
  // Woran die KI/der Schritt gerade arbeitet = die zuletzt gemeldete Aktivität.
  let currentActivity = $derived(steps.length ? steps[steps.length - 1] : '');

  function startClock() {
    runStartMs = Date.now(); lastActivityMs = Date.now(); nowMs = Date.now();
    tick = setInterval(() => { nowMs = Date.now(); }, 500);
  }
  function stopClock() { if (tick) { clearInterval(tick); tick = null; } }
  onDestroy(() => { stopClock(); abort?.abort(); endDrag(); });

  async function changeProvider(provider: LlmProvider) {
    const key = await loadApiKeyForProvider(provider);
    await saveConfig({ ...$llmConfig, provider, model: defaultModelFor(provider), apiKey: key ?? undefined, baseUrl: defaultBaseUrlFor(provider) });
  }
  async function changeModel(model: string) { await saveConfig({ ...$llmConfig, model }); }

  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const runOpts = () => ({ onActivity: () => { lastActivityMs = Date.now(); }, signal: abort!.signal });

  /** Kapselt einen (ggf. mehrteiligen) async-Lauf mit Token-Guard, Uhr und Fehler-Rücksprung. */
  async function runSegment(resume: StepId, body: (alive: () => boolean) => Promise<void>) {
    if (running) return;
    running = true; error = ''; userAborted = false; resumePhase = resume; reachedStep = resume;
    const myToken = ++runToken;
    abort = new AbortController(); startClock();
    phase = 'running';
    try {
      await body(() => myToken === runToken);
    } catch (e) {
      if (myToken === runToken && !userAborted) { error = msg(e); phase = resume; }
    } finally {
      if (myToken === runToken) { stopClock(); running = false; abort = null; }
    }
  }

  function stop() {
    userAborted = true; runToken++; abort?.abort(); stopClock();
    running = false; abort = null; phase = resumePhase;
  }

  // ── Delta-Zusammenfassung fürs Schritt-Log ──────────────────────────────────────
  function summarizeDelta(d: LevelUpDelta): string {
    if (d.isHomebrew) return `${d.klasseName || 'Klasse'} ${d.fromLevel} → ${d.toLevel} · Homebrew (KI fragt alles ab)`;
    const parts = [`${d.klasseName || 'Klasse'} ${d.fromLevel} → ${d.toLevel}`];
    if (d.profBonusTo !== d.profBonusFrom) parts.push(`Übungsbonus +${d.profBonusFrom}→+${d.profBonusTo}`);
    const slotGain = d.spellSlotDelta.reduce((a, b) => a + b, 0);
    if (slotGain > 0) parts.push(`+${slotGain} Zauberplatz${slotGain > 1 ? 'e' : ''}`);
    if (d.cantripDelta > 0) parts.push(`+${d.cantripDelta} Zaubertrick${d.cantripDelta > 1 ? 's' : ''}`);
    if (d.preparedDelta > 0) parts.push(`+${d.preparedDelta} vorbereitbar`);
    const feats = d.featuresGained.length + d.subclassFeaturesGained.length;
    if (feats > 0) parts.push(`${feats} Merkmal${feats > 1 ? 'e' : ''}`);
    return parts.join(' · ');
  }

  // ── Antworten-Handling ──────────────────────────────────────────────────────────
  function initAnswers(questions: LevelUpQuestion[]) {
    // Bestehende Antworten ERHALTEN; nur für neue Fragen Defaults setzen.
    const a: Record<string, string | string[]> = { ...answers };
    for (const q of questions) {
      if (q.id in a) continue;
      if (q.type === 'multiselect' || q.type === 'spell-picker') a[q.id] = [];
      else if (q.type === 'choice') a[q.id] = q.defaultValue || q.options[0]?.value || '';
      else a[q.id] = q.defaultValue ?? '';
    }
    answers = a;
  }
  /**
   * Init für die Feature-Wahlen (Checkpoint nach Call 1): bewusst LEER vorbelegen (kein
   * Auto-Default auf die erste Option), damit der Spieler jede Wahl aktiv trifft — sonst
   * würde z.B. eine folgenreiche Landart stillschweigend feststehen.
   */
  function initFeatureChoices(questions: LevelUpQuestion[]) {
    const a: Record<string, string | string[]> = { ...answers };
    for (const q of questions) {
      if (q.id in a) continue;
      a[q.id] = q.type === 'multiselect' || q.type === 'spell-picker' ? [] : '';
    }
    answers = a;
  }
  function setIn(_store: 'a' | 'f', id: string, v: string) {
    answers[id] = v;
  }
  function toggleIn(_store: 'a' | 'f', id: string, v: string, max?: number) {
    const cur = (answers[id] as string[]) ?? [];
    let nextArr = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    if (max && nextArr.length > max) nextArr = nextArr.slice(nextArr.length - max);
    answers[id] = nextArr;
  }

  function isAnswered(questions: LevelUpQuestion[], rec: Record<string, string | string[]>): boolean {
    return questions.every((q) => {
      if (!q.required) return true;
      const v = rec[q.id];
      if (Array.isArray(v)) return v.length > 0;
      return (v ?? '').toString().trim() !== '';
    });
  }
  let allAnswered = $derived(isAnswered(decisions, answers));
  let allBaseChoices = $derived(isAnswered(baseChoices, answers));

  /**
   * Die Wahlen der deklarierten Zauber-Zugänge. Reaktiv, weil die Zauber-Wahlen erst mit der
   * beantworteten Liste entstehen — ohne Klassenfilter würde der Picker die ganze Bibliothek
   * anbieten.
   */
  let featAccessChoices = $derived.by<LevelUpQuestion[]>(() =>
    featAccess.flatMap((g) =>
      buildFeatureChoices(spellAccessChoices(g, (answers[spellListChoiceId(g)] as string) ?? '')),
    ),
  );
  /** Der Talent-Checkpoint zeigt beide Herkünfte: KI-erkannt und deklariert. */
  let featChoiceQs = $derived([...featChoices, ...featAccessChoices]);
  let allFeatChoices = $derived(isAnswered(featChoiceQs, answers));

  // ── Zauber-Picker ────────────────────────────────────────────────────────────────
  /** Lese-/Schreib-Paar für `bind:picks` einer Zauber-Frage (Antworten liegen in `answers`). */
  const pickBinding = (id: string) =>
    [() => (answers[id] as string[]) ?? [], (v: string[]) => (answers[id] = v)] as const;

  // ── Trefferwürfel würfeln (echtes Würfeln, kein Selbst-Eintragen) ────────────────
  let hpRolls = $state<Record<string, number[]>>({});
  function rollHp(q: LevelUpQuestion) {
    const sides = q.dieSides ?? 6;
    const count = Math.max(1, q.rollCount ?? 1);
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
    hpRolls[q.id] = rolls;
    answers[q.id] = String(rolls.reduce((a, b) => a + b, 0));
  }
  // ── Inline-Zauberanlage ─────────────────────────────────────────────────────────
  let spellCreator = $state<{ targetQ: string | null; name: string; nameEn: string; level: number; school: string; levels: number[] } | null>(null);
  const SCHOOL_KEYS = Object.keys(SPELL_SCHOOLS);
  function openSpellCreator(name: string, levels: number[], targetQ: string | null) {
    const lv = levels.length ? levels : [1];
    const trimmed = name.trim();
    // Der auslösende Name ist oft der englische KI-Vorschlag → als name_en vormerken,
    // damit künftige EN↔DE-Treffer funktionieren; der deutsche Anzeigename ist editierbar.
    spellCreator = { targetQ, name: trimmed, nameEn: trimmed, level: lv[0], school: 'evocation', levels: lv };
  }
  function blankSpell(name: string, nameEn: string, level: number, school: string): Spell {
    return {
      name: name || 'Neuer Zauber', name_en: nameEn.trim() || undefined, level, school: school as Spell['school'],
      casting_time: '1 Aktion', range: '9 Meter',
      components: { verbal: true, somatic: false, material: false, materials_needed: null },
      duration: 'Unmittelbar', concentration: false, ritual: false,
      classes: [], desc: [''], source: OWN_SOURCE,
    };
  }
  let creatingSpell = $state(false);
  async function saveInlineSpell() {
    if (!spellCreator || creatingSpell) return;
    creatingSpell = true;
    const s = spellCreator;
    try {
      const canonical = await createSpellInline(blankSpell(s.name, s.nameEn, s.level, s.school));
      spellLib = await getSpellLibrary();
      if (s.targetQ) {
        // Direkt in die Antwort der auslösenden Frage übernehmen (der Picker liest sie).
        const [read, write] = pickBinding(s.targetQ);
        const val = encodePick(s.level, canonical);
        if (!read().includes(val)) write([...read(), val]);
      } else {
        // Review-Inline-Anlage: neuen Zauber als gewährten Zauber ergänzen (fließt via buildDoc ein).
        if (s.level === 0) {
          if (!validatedBase.grantedCantrips.includes(canonical)) validatedBase.grantedCantrips = [...validatedBase.grantedCantrips, canonical];
        } else if (!validatedBase.grantedPrepared.some((p) => p.name === canonical)) {
          validatedBase.grantedPrepared = [...validatedBase.grantedPrepared, { level: s.level, name: canonical }];
        }
        flagged = flagged.filter((f) => f.toLowerCase() !== s.name.toLowerCase() && f.toLowerCase() !== s.nameEn.toLowerCase());
      }
      spellCreator = null;
    } catch (e) {
      error = `Zauber konnte nicht angelegt werden: ${msg(e)}`;
    } finally {
      creatingSpell = false;
    }
  }

  // ── Zustandsmaschine: Pipeline-Antrieb ──────────────────────────────────────────
  // Die Komponente hält den State + das Lauf-Gerüst; die Übergänge kommen aus
  // `advance()` (levelUpMachine.ts). `pipelineBody` läuft Arbeitsschritte ab, bis ein
  // Checkpoint erreicht ist. Das gemeinsame Dokument (`doc`) ist eine reine Projektion
  // des States (buildDoc) — deterministische Schritte brauchen daher keine Aktion.
  function advCtx(): AdvanceCtx {
    return {
      delta: delta!,
      featsToPick: delta ? countFeatsToPick(delta, answers) : 0,
      baseChoices: baseChoices.length,
      // Auch die deklarierten Wahlen zählen: sonst überspringt die Maschine den Checkpoint,
      // wenn das Talent gar nicht mehr bei der KI war — und niemand wählt die Zauber.
      featChoices: featChoiceQs.length,
    };
  }
  const answered = (v: string | string[] | undefined) => (Array.isArray(v) ? v.length > 0 : (v ?? '').toString().trim() !== '');

  async function pipelineBody(from: StepId, alive: () => boolean) {
    let step = advance(from, advCtx());
    while (!isCheckpoint(step)) {
      await runStep(step, alive);
      if (!alive()) return;
      reachedStep = step; // Schritt fertig → seine Änderungen werden im Dokument sichtbar
      step = advance(step, advCtx());
    }
    onEnterCheckpoint(step);
    reachedStep = step;
    phase = step;
  }

  async function runStep(step: StepId, alive: () => boolean) {
    switch (step) {
      case 'base-delta':
        gainedFeatures = gainedFeaturesFor(delta!);
        // Schon bekannte Subklasse: ihre Merkmale stehen bereits im Delta. Wird die Subklasse
        // erst in diesem Aufstieg gewählt, ergänzt `subclass-delta` unten.
        declaredSpells = resolveDeclaredSpells(
          [...delta!.featuresGained, ...delta!.subclassFeaturesGained],
          delta!.toLevel,
          await ensureSpellLib(),
          delta!.klasseName,
        );
        // Ein Merkmalstext kann einen Zauber nennen, den die Bibliothek nicht führt — dieselbe
        // Warnung wie bei KI-Namen, damit er inline angelegt werden kann statt still zu fehlen.
        if (declaredSpells.flagged.length) flagged = [...new Set([...flagged, ...declaredSpells.flagged])];
        reportUnreadableGrants();
        break;
      case 'subclass-delta':
        pushStep(`Subklasse „${chosenSubclass?.name}" — Merkmale werden geladen…`);
        subFeatures = await computeSubclassFeatures(chosenSubclass!.key, delta!.fromLevel, delta!.toLevel);
        if (!alive()) return;
        // `subFeatures` bleibt vollständig (Info-Einträge „Neues Merkmal: …"), der KI-Eingang
        // nicht: die immer-vorbereiteten Zauberlisten liest `declaredSpells` deterministisch.
        gainedFeatures = [...gainedFeaturesFor(delta!), ...withoutSpellGrantFeatures(subFeatures)];
        declaredSpells = resolveDeclaredSpells(
          [...delta!.featuresGained, ...delta!.subclassFeaturesGained, ...subFeatures],
          delta!.toLevel,
          await ensureSpellLib(),
          delta!.klasseName,
        );
        // Ein Merkmalstext kann einen Zauber nennen, den die Bibliothek nicht führt — dieselbe
        // Warnung wie bei KI-Namen, damit er inline angelegt werden kann statt still zu fehlen.
        if (declaredSpells.flagged.length) flagged = [...new Set([...flagged, ...declaredSpells.flagged])];
        reportUnreadableGrants();
        break;
      case 'feature-analysis':
        await runAnalyze('base', alive);
        break;
      case 'feature-effects':
        await runFinalize('base', alive);
        break;
      case 'feat-analysis':
        await runAnalyze('feat', alive);
        break;
      case 'feat-effects':
        await runFinalize('feat', alive);
        break;
      case 'narrative':
        await runNarrative(alive);
        break;
      case 'ongoing-effects':
        await detectHpPerLevel(alive);
        break;
      case 'class-features-merge':
        await mergeClassFeatures(alive);
        break;
      case 'feat-links':
        // Deklarierter Zauber-Zugang der Talente: Liste, Attribut und Kontingent stehen im
        // Vault, also fragt der Flow sie ab statt die KI sie aus der Prosa zu deuten.
        featAccess = chosenFeats
          .map((f) => spellAccessGrantOf(f))
          .filter((g): g is SpellAccessGrant => g !== null);
        if (featAccess.length) {
          initFeatureChoices(featAccessChoices);
          pushStep(`${featAccess.length} Zauber-Zugang aus der Bibliothek gelesen (ohne KI).`);
        }
        break;
      // assemble-decisions: rein deterministisch → keine Aktion, das Dokument leitet
      // diese Änderungen selbst aus dem State ab.
    }
  }

  function onEnterCheckpoint(step: StepId) {
    if (step === 'feat-choice') {
      featsToPick = countFeatsToPick(delta!, answers);
      chosenFeats = [];
      getFeats().then((f) => { featLib = f; });
    } else if (step === 'class-features' && !featuresText.trim()) {
      // Sicherheitsnetz: normalerweise hat `class-features-merge` den Text längst gesetzt.
      featuresText = seedFeaturesText();
    }
  }

  // ── KI-Arbeitsschritte (setzen State; das Dokument ist abgeleitet) ───────────────
  /** Merkmale bzw. Talente als GainedFeature[] für die jeweilige Phase. */
  function featuresFor(kind: 'base' | 'feat'): GainedFeature[] {
    return kind === 'base'
      ? gainedFeatures
      : withoutSpellAccessFeatures(chosenFeats.map((f) => featToGainedFeature(f, delta!.toLevel)), featAccess);
  }

  /** Call 1 (KI): reine Analyse → erkannte Wahlen für den Checkpoint direkt danach. */
  async function runAnalyze(kind: 'base' | 'feat', alive: () => boolean) {
    await ensureSpellLib();
    if (!alive()) return;
    const features = featuresFor(kind);
    let analysis: FeatureAnalysis = { choices: [], spellsToGround: [], blocked: false, analysisText: '' };
    if (features.length) {
      pushStep(`KI analysiert ${features.length} ${kind === 'feat' ? 'Talent(e)' : 'neu gewonnene Merkmal(e)'}…`);
      analysis = await analyzeFeatureEffects($llmConfig, { classContext: classContext(), features, pastChoices }, runOpts());
      if (!alive()) return;
    }
    const choiceQs = buildFeatureChoices(analysis.choices);
    initFeatureChoices(choiceQs);
    if (kind === 'base') { baseAnalysis = analysis; baseChoices = choiceQs; }
    else { featAnalysis = analysis; featChoices = choiceQs; }
    if (!features.length) pushStep(kind === 'feat' ? 'Kein Talent für die Deutung übrig.' : 'Keine Merkmale zu deuten.');
    else pushStep(choiceQs.length ? `KI wartet auf ${choiceQs.length} Wahl(en).` : 'Keine Wahl nötig.');
  }

  /**
   * Getroffene Feature-Wahlen als Folge-Turn für Call C — bewusst minimal (id + Wert).
   * Frage, Optionen und Merkmal stehen bereits in der Analyse im Verlauf; die id (aus
   * `buildFeatureChoices`, identisch zur Choice-id der Analyse) verknüpft beides.
   *
   * Der WERT, nicht das Label: der Verlauf ist englisch, das deutsche Label kennt er nicht.
   */
  function gatherDecisions(kind: 'base' | 'feat'): ResolvedChoice[] {
    // Nur die KI-erkannten Wahlen: das Merkmal einer deklarierten Wahl steht nicht im Eingang,
    // das Modell könnte ihre id nur einem erfundenen Rider zuordnen.
    const qs = kind === 'base' ? baseChoices : featChoices;
    const out: ResolvedChoice[] = [];
    for (const q of qs) {
      const v = answers[q.id];
      if (!answered(v)) continue;
      out.push({ id: q.id, choice: answerValues(q, v) });
    }
    return out;
  }

  /** Call C (KI): finalisiert die Effekte mit den getroffenen Entscheidungen → Rider. */
  async function runFinalize(kind: 'base' | 'feat', alive: () => boolean) {
    await ensureSpellLib();
    if (!alive()) return;
    const features = featuresFor(kind);
    const analysis = kind === 'base' ? baseAnalysis : featAnalysis;
    const decisionsCtx = gatherDecisions(kind);
    let parsed: FeatureRider[] = [];
    if (features.length && analysis) {
      pushStep(decisionsCtx.length
        ? 'KI berücksichtigt die getroffene Wahl und leitet die Effekte ab…'
        : `KI deutet ${features.length} ${kind === 'feat' ? 'Talent(e)' : 'neu gewonnene Merkmal(e)'}…`);
      const eff = await finalizeFeatureEffects($llmConfig,
        { classContext: classContext(), features, pastChoices, resolvedChoices: decisionsCtx }, analysis, runOpts());
      if (!alive()) return;
      parsed = eff.riders;
    }
    const validated = validateRiderSpells(parsed, spellLib, delta!.klasseName);
    if (validated.flagged.length) flagged = [...new Set([...flagged, ...validated.flagged])];
    if (kind === 'base') {
      validatedBase = validated;
      riders = validated.riders;
      decisions = buildDecisions(delta!, riders, { maxSpellLevel: maxSpellLevel(), klasseName: delta!.klasseName });
      initAnswers(decisions);
      pushStep(decisions.length ? `${decisions.length} Entscheidung(en) vorbereitet.` : 'Keine offenen Entscheidungen.');
    } else {
      validatedFeats = validated;
      featRiders = validated.riders;
    }
  }

  /** Narrativ (KI, Schritt C) → doc.summary. */
  async function runNarrative(alive: () => boolean) {
    let n = { summary: '' };
    try {
      pushStep('KI formuliert das Narrativ…');
      const raw = await runAiAction($llmConfig, buildLevelUpNarrativeAction(),
        buildNarrativeInput({
          summary: buildSummary(), delta: delta!, gainedFeatures, chosenSubclass,
          chosenFeats: chosenFeats.map((f) => ({ key: f.key, name: f.nameDe })),
          riders: [...riders, ...featRiders], pastChoices,
        }), runOpts());
      if (!alive()) return;
      n = parseLevelUpNarrative(raw) ?? n;
    } catch { /* Narrativ ist optional → deterministischer Fallback */ }
    narrativeSummary = n.summary || fallbackSummary();
  }

  // ── Klassenmerkmale-Freitext ────────────────────────────────────────────────────
  /** Die verdichteten Bogen-Notizen dieses Aufstiegs (Merkmale + Talente). */
  const newSheetNotes = () => [...sheetNoteLines(validatedBase.riders), ...sheetNoteLines(validatedFeats.riders)];

  /** Rohe Saat: bestehendes Feld + neue Notizzeilen — die Fassung ohne KI-Merge. */
  const seedFeaturesText = () =>
    [character.classFeatures, ...newSheetNotes()].filter((s) => s?.trim()).join('\n');

  /**
   * Verschmilzt den bestehenden (nutzergeschriebenen) Freitext mit den neuen Bogen-Notizen.
   * Scheitert der Call, bleibt die rohe Saat stehen — der Aufstieg darf daran nicht hängen.
   */
  async function mergeClassFeatures(alive: () => boolean, currentText = seedFeaturesText()) {
    const notes = newSheetNotes();
    featuresText = currentText;
    // Ohne neue Notizen gibt es nichts zusammenzuführen — den nutzergeschriebenen Text
    // dann NICHT durch die KI schicken, das kann nur schaden.
    if (!notes.length) {
      pushStep('Keine neuen Merkmale fürs Klassenmerkmale-Feld.');
      return;
    }
    try {
      pushStep('KI führt die Klassenmerkmale zusammen…');
      const raw = await runAiAction($llmConfig, buildFieldSummaryAction(),
        buildFieldSummaryInput({
          target: SHEET_FIELDS.classFeatures,
          currentText,
          newNotes: notes,
          otherFields: [{ label: SHEET_FIELDS.speciesTraits.label, text: character.personal?.rassenmerkmale ?? '' }],
          chosenSubclass,
        }), runOpts());
      if (!alive()) return;
      const r = parseFieldSummary(raw);
      if (r && r.text.trim()) { featuresText = r.text; pushStep('Klassenmerkmale zusammengeführt.'); }
      else pushStep('Keine Zusammenführung erhalten — Rohfassung bleibt stehen.');
    } catch {
      pushStep('Zusammenführung fehlgeschlagen — Rohfassung bleibt stehen.');
    }
  }

  // ── Checkpoint-Aktionen (Nutzer klickt „Weiter") ────────────────────────────────
  function startFlow() {
    if (running) return;
    if (isNewClass && !newClassKey) { error = 'Bitte eine Klasse für das Multiclassing wählen.'; return; }
    if (!isNewClass && !hasClasses) return;
    // State zurücksetzen (Neustart aus choose-class)
    chosenSubclass = null; subFeatures = []; gainedFeatures = []; riders = []; decisions = []; answers = {};
    declaredSpells = noDeclaredSpells();
    baseAnalysis = null; baseChoices = []; featAnalysis = null; featChoices = [];
    chosenFeats = []; featAccess = []; featRiders = []; flagged = [];
    hpPerLevelSources = []; narrativeSummary = ''; featuresText = '';
    validatedBase = { riders: [], flagged: [], grantedCantrips: [], grantedPrepared: [] };
    validatedFeats = { riders: [], flagged: [], grantedCantrips: [], grantedPrepared: [] };

    runSegment('choose-class', async (alive) => {
      steps = [];
      pushStep('Progression & Aufstiegs-Delta werden berechnet…');
      const d = await computeLevelUpDelta(
        character, classIndex, targetLevel,
        isNewClass && newClassKey ? { sourceKey: newClassKey, name: newClassName } : undefined,
      );
      if (!alive()) return;
      delta = d;
      if (d.atLevelCap) { error = 'Diese Klasse ist bereits auf Stufe 20.'; phase = 'choose-class'; return; }
      if (d.isHomebrew) {
        error = 'Stufenaufstieg ist nur mit hinterlegter Klassen-Progression möglich — für diese Klasse gibt es keine Progressionsdaten.';
        phase = 'choose-class';
        return;
      }
      pushStep(`Delta: ${summarizeDelta(d)}`);
      await pipelineBody('choose-class', alive);
    });
  }

  function confirmSubclass(key: string, name: string) {
    if (!delta) return;
    chosenSubclass = { key, name };
    runSegment('subclass-choice', (alive) => pipelineBody('subclass-choice', alive));
  }

  // ── Feature-Wahl-Checkpoints: getroffen → finalisierender Effekt-Call ─────────────
  function submitFeatureChoices() {
    if (!delta) return;
    runSegment('feature-choices', (alive) => pipelineBody('feature-choices', alive));
  }
  function submitFeatChoices() {
    if (!delta) return;
    runSegment('feat-choices', (alive) => pipelineBody('feat-choices', alive));
  }

  // ── Schritt 3: Entscheidungen abschicken → Talente oder Assemblierung ────────────
  function submitDecisions() {
    if (!delta) return;
    runSegment('player-decisions', (alive) => pipelineBody('player-decisions', alive));
  }

  // ── Schritt 4: Talente wählen → Talent-Effekte (KI) ─────────────────────────────
  let featQuery = $state('');
  function featResults(): FeatEntry[] { return featQuery.trim() ? searchFeats(featLib, featQuery, 8) : []; }
  function toggleFeat(entry: FeatEntry) {
    const key = entry.sourceKey ?? '';
    const nameDe = featDisplayName(entry);
    const name = entry.name || nameDe;
    const idx = chosenFeats.findIndex((f) => f.name === name);
    if (idx >= 0) { chosenFeats = chosenFeats.filter((_, i) => i !== idx); return; }
    if (chosenFeats.length >= featsToPick) return;
    // `grantsChoice` reist mit: nur damit kann `feat-links` den Zugang deterministisch lesen.
    chosenFeats = [...chosenFeats, { key, name, nameDe, gainedAt: delta!.toLevel, desc: entry.desc || featDesc(entry), descDe: entry.descDe, grantsChoice: entry.grantsChoice }];
    featQuery = '';
  }

  function confirmFeats() {
    if (!delta) return;
    runSegment('feat-choice', (alive) => pipelineBody('feat-choice', alive));
  }

  // ── Hilfsfunktionen für die Dokument-Projektion ─────────────────────────────────
  function gatherLearned(): { level: number; name: string }[] {
    const q = decisions.find((d) => d.id === 'learned_spells');
    if (!q) return [];
    return ((answers['learned_spells'] as string[]) ?? []).map(decodePick);
  }
  function gatherCantrips(): string[] {
    return ((answers['cantrips'] as string[]) ?? []).map((v) => decodePick(v).name);
  }
  function fallbackSummary(): string {
    const names = [...gainedFeatures.map((f) => f.nameDe || f.name), ...chosenFeats.map((f) => f.nameDe)];
    const sub = chosenSubclass ? ` · Subklasse: ${chosenSubclass.name}` : '';
    return `${delta!.klasseName} Stufe ${delta!.fromLevel} → ${delta!.toLevel}${sub}${names.length ? ` · ${names.join(', ')}` : ''}`;
  }

  // Fortlaufende, PRO-STUFE wirkende Effekte: die KI liest ALLE Merkmale des
  // Charakters (Spezies + Klasse/Subklasse + Talente, inkl. diesen Level neu
  // gewählter) und liefert die pro-Stufe-Änderungen (heute nur TP-Max, referenziert
  // per Bibliotheks-Key). Fehler-tolerant → bei Ausfall verhält es sich wie bisher.
  async function detectHpPerLevel(alive: () => boolean) {
    hpPerLevelSources = [];
    try {
      const groups = [
        ...((await resolveSpeciesTraits(character.species)) ?? []),
        ...(await resolveClassFeatures(character.classes)),
      ];
      // Nur die Talent-Links: Wahl-Annotationen bringen keinen eigenen Merkmalstext mit,
      // ihr Merkmal steckt schon in `groups`.
      const featLinks = await resolveFeatLinks((character.features ?? []).filter((f) => !f.choice?.trim()));
      const raw = [
        ...groups.flatMap((g) => g.features).map((f) => ({ key: f.key ?? '', name: f.name, desc: f.desc })),
        ...featLinks.map((f) => ({ key: f.key ?? '', name: f.name, desc: f.desc })),
        ...gainedFeatures.map((f) => ({ key: '', name: f.name, desc: f.desc })),
        ...chosenFeats.map((f) => ({ key: f.key, name: f.name, desc: f.desc || f.descDe || '' })),
      ];
      // Nach Key (bzw. Name, wenn kein Key) deduplizieren.
      const seen = new Set<string>();
      const features: EffectFeature[] = [];
      for (const f of raw) {
        if (!f.name.trim() && !f.key) continue;
        const id = f.key || f.name.toLowerCase();
        if (seen.has(id)) continue;
        seen.add(id);
        features.push(f);
      }
      if (!alive() || !features.length) return;
      pushStep('KI prüft fortlaufende Merkmals-Effekte (TP/Stufe)…');
      const eff = parseLevelUpEffects(await runAiAction($llmConfig, buildLevelUpEffectsAction(),
        buildLevelUpEffectsInput({ level: delta!.toLevel, features }), runOpts()));
      if (!alive()) return;
      const nameByKey = new Map(features.filter((f) => f.key).map((f) => [f.key, f.name] as const));
      const hpChanges = (eff?.changes ?? []).filter((c) => c.target === 'hpMax' && (parseInt(c.valueChange, 10) || 0) !== 0);
      hpPerLevelSources = hpChanges.map((c) => ({
        feature: nameByKey.get(c.source) || c.source || 'Merkmal',
        sourceKey: c.source,
        amount: parseInt(c.valueChange, 10) || 0,
      }));
      const perLevelSum = hpPerLevelSources.reduce((s, x) => s + x.amount, 0);
      if (perLevelSum > 0)
        pushStep(`Fortlaufende TP: +${perLevelSum}/Stufe (${hpPerLevelSources.map((s) => s.feature).join(', ')}).`);
    } catch {
      hpPerLevelSources = [];
    }
  }

  /**
   * „Nochmal zusammenführen" auf Klick: derselbe Merge, aber auf dem aktuell im Textfeld
   * stehenden (ggf. handbearbeiteten) Stand statt auf der Rohfassung.
   */
  function reworkFeatures() {
    if (!delta) return;
    runSegment('class-features', async (alive) => {
      await mergeClassFeatures(alive, featuresText);
      phase = 'class-features';
    });
  }

  // Der editierte Klassenmerkmale-Freitext fließt via buildDoc automatisch ins Dokument.
  function confirmClassFeatures() {
    phase = 'review';
  }

  function apply() {
    if (delta) onApply($state.snapshot(doc) as LevelUpChangeSet, delta);
    phase = 'done';
    onclose();
  }

  // ── Gemeinsames LevelUp-Dokument (reine Projektion des States; buildDoc) ─────────
  // Jeder Schritt schreibt in seine State-Eingaben; das Dokument ist dadurch stets
  // synchron. Anzeige (Protokoll) UND Anwendung (apply) lesen dasselbe Dokument.
  // Phasenstand fürs Dokument: während eines Laufs der zuletzt ABGESCHLOSSENE Schritt
  // (progressiv hochgezählt) — so erscheinen fertige deterministische Teilschritte im
  // JSON, bevor die nächste KI-Aktion läuft, ohne Vorgriff auf noch laufende Schritte.
  let viewStep = $derived<StepId>(phase === 'running' ? reachedStep : phase);
  let doc = $derived.by<LevelUpDoc>(() => {
    if (!delta) return { fromLevel: 0, toLevel: 0, klasse: '', summary: '', changes: [] };
    return buildDoc({
      delta, hitDice: character.hitDice ?? '',
      chosenSubclass, subFeatures, declaredSpells, validatedBase, validatedFeats,
      answers, konMod: modOf(character.kon),
      pickedCantrips: gatherCantrips(), pickedLearned: gatherLearned(),
      learnAsPrepared: !learnInfo(delta, riders).spellbook,
      chosenFeats: chosenFeats.map((f) => ({ key: f.key, name: f.nameDe, gainedAt: f.gainedAt })),
      baseChoiceQs: baseChoices, featChoiceQs, gainedFeatures,
      hpPerLevelSources, narrativeSummary, featuresText, upTo: viewStep,
    });
  });

  // ── Progression = Sicht auf das Dokument (gruppiert nach erzeugendem Schritt) ─────
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
  // doc.changes stehen bereits in kanonischer Schritt-Reihenfolge (buildDoc) → die
  // Gruppen entstehen in Erst-Auftritts-Reihenfolge, kein Sortieren nötig.
  let progressionGroups = $derived.by<{ heading: string; lines: string[] }[]>(() => {
    const groups: { heading: string; lines: string[] }[] = [];
    const idx = new Map<string, number>();
    for (const c of doc.changes) {
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
  let reviewLines = $derived(doc.changes.map(changeLine));

  // Live-JSON des gemeinsamen Dokuments (zum Ansehen/Kopieren des Formats).
  let docJson = $derived(JSON.stringify(doc, null, 2));
  let jsonCopied = $state(false);
  async function copyDoc() {
    try {
      await navigator.clipboard.writeText(docJson);
      jsonCopied = true;
      setTimeout(() => (jsonCopied = false), 1500);
    } catch { /* Clipboard nicht verfügbar → ignorieren */ }
  }
</script>

<div class="dialog" style="left: {pos.x}px; top: {pos.y}px;" role="dialog" aria-label="Stufenaufstieg">
  <div class="modal-header" onmousedown={startDrag} role="presentation">
    <span class="modal-title">⬆ Stufenaufstieg — {character.name}</span>
    <button class="close-btn" onmousedown={(e) => e.stopPropagation()} onclick={onclose} title="Schließen">×</button>
  </div>

  <div class="row two">
    <select class="select" value={$llmConfig.provider} onchange={(e) => changeProvider((e.target as HTMLSelectElement).value as LlmProvider)}>
      <option value="anthropic">Anthropic</option>
      <option value="groq">Groq</option>
      <option value="qualityminds">QualityMinds</option>
      <option value="ollama">Ollama</option>
    </select>
    {#if modelsFor($llmConfig.provider).length}
      <select class="select" value={$llmConfig.model} onchange={(e) => changeModel((e.target as HTMLSelectElement).value)}>
        {#each modelsFor($llmConfig.provider) as m}<option value={m}>{m}</option>{/each}
      </select>
    {:else}
      <input class="input" value={$llmConfig.model} onchange={(e) => changeModel((e.target as HTMLInputElement).value)} placeholder="Modell" />
    {/if}
  </div>

  <div class="body">
  <!-- ── Progression (immer sichtbar) ─── -->
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
  <!-- ── Klasse wählen ─── -->
  {#if phase === 'choose-class'}
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

  <!-- ── Läuft ─── -->
  {#if phase === 'running'}
    <div class="ai-status"><span class="spinner" aria-hidden="true"></span><span>{currentActivity || 'KI arbeitet…'} ({elapsedSec}s)</span></div>
  {/if}
  {#if stalled}
    <p class="hint warn">Seit {stalledSec}s keine Antwort — du kannst abbrechen und neu starten.</p>
  {/if}

  <!-- ── Subklasse wählen ─── -->
  {#if phase === 'subclass-choice' && delta}
    <div class="row">
      <span class="field-label">Subklasse für {delta.klasseName}</span>
      <span class="field-hint">Die Wahl schaltet die Subklassen-Merkmale frei.</span>
      <div class="group-chips">
        {#each delta.subclassOptions as sc}
          <button type="button" class="group-chip" class:on={chosenSubclass?.key === sc.key}
                  onclick={() => (chosenSubclass = { key: sc.key, name: sc.name })}>{sc.name}</button>
        {/each}
      </div>
      {#if !delta.subclassOptions.length}<span class="field-hint">Keine Subklassen gefunden.</span>{/if}
    </div>
  {/if}

  <!-- ── Feature-Wahlen (gemeinsames Rendering für Merkmale + Talente) ─── -->
  {#snippet choiceBlock(list: LevelUpQuestion[])}
    <div class="questions">
      {#each list as q (q.id)}
        <div class="row">
          <span class="field-label">{q.prompt}{#if !q.required}<span class="field-hint"> (optional)</span>{/if}</span>
          {#if q.help}<span class="field-hint">{q.help}</span>{/if}
          {#if q.type === 'choice'}
            <select class="select" value={answers[q.id] as string} onchange={(e) => setIn('a', q.id, (e.target as HTMLSelectElement).value)}>
              <option value="">— bitte wählen —</option>
              {#each q.options as opt}<option value={opt.value}>{opt.label}</option>{/each}
            </select>
          {:else if q.type === 'multiselect'}
            <div class="group-chips">
              {#each q.options as opt}
                <button type="button" class="group-chip" class:on={(answers[q.id] as string[])?.includes(opt.value)} onclick={() => toggleIn('a', q.id, opt.value, q.max)}>{opt.label}</button>
              {/each}
            </div>
          {:else if q.type === 'number'}
            <input class="input" type="number" min={q.min} max={q.max} value={answers[q.id] as string} oninput={(e) => setIn('a', q.id, (e.target as HTMLInputElement).value)} />
          {:else if q.type === 'spell-picker'}
            {@const bind = pickBinding(q.id)}
            <SpellPickField
              title={q.prompt}
              library={spellLib}
              spellLevels={q.spellLevels}
              spellClass={q.spellClass}
              max={q.max ?? 1}
              bind:picks={bind[0], bind[1]}
              allowCreate
              onCreate={(name, levels) => openSpellCreator(name, levels, q.id)}
            />
          {:else}
            <textarea class="textarea" rows="2" value={answers[q.id] as string} oninput={(e) => setIn('a', q.id, (e.target as HTMLTextAreaElement).value)}></textarea>
          {/if}
        </div>
      {/each}
    </div>
  {/snippet}

  <!-- ── Merkmals-Wahlen (direkt nach der Analyse, Call 1) ─── -->
  {#if phase === 'feature-choices'}
    <p class="hint">Diese Wahl(en) bestimmen die konkreten Effekte — nach dem Bestätigen leitet die KI sie ab (z.B. gewährte Zauber, Kampfstil, Expertise).</p>
    {@render choiceBlock(baseChoices)}
  {/if}

  <!-- ── Talent-Wahlen (direkt nach der Talent-Analyse) ─── -->
  {#if phase === 'feat-choices'}
    {#if featChoices.length}
      <p class="hint">Wahl(en) durch die gewählten Talente — nach dem Bestätigen leitet die KI die Effekte ab.</p>
    {:else}
      <p class="hint">Wahl(en) der gewählten Talente — Liste, Attribut und Anzahl stehen in der Bibliothek, hier wird nur ausgewählt.</p>
    {/if}
    {@render choiceBlock(featChoiceQs)}
  {/if}

  <!-- ── Fragebogen (Entscheidungen) ─── -->
  {#if phase === 'player-decisions'}
    {#if decisions.length === 0}
      <p class="hint">Keine offenen Entscheidungen — direkt zum Vorschlag.</p>
    {/if}
    <div class="questions">
      {#each decisions as q (q.id)}
        <div class="row">
          <span class="field-label">{q.prompt}{#if !q.required}<span class="field-hint"> (optional)</span>{/if}</span>
          {#if q.help}<span class="field-hint">{q.help}</span>{/if}
          {#if q.type === 'choice'}
            <select class="select" value={answers[q.id] as string} onchange={(e) => setIn('a', q.id, (e.target as HTMLSelectElement).value)}>
              {#each q.options as opt}<option value={opt.value}>{opt.label}</option>{/each}
            </select>
          {:else if q.type === 'multiselect'}
            <div class="group-chips">
              {#each q.options as opt}
                <button type="button" class="group-chip" class:on={(answers[q.id] as string[])?.includes(opt.value)} onclick={() => toggleIn('a', q.id, opt.value, q.max)}>{opt.label}</button>
              {/each}
            </div>
          {:else if q.type === 'number'}
            <input class="input" type="number" min={q.min} max={q.max} value={answers[q.id] as string} oninput={(e) => setIn('a', q.id, (e.target as HTMLInputElement).value)} />
          {:else if q.type === 'spell-picker'}
            {@const bind = pickBinding(q.id)}
            <SpellPickField
              title={q.prompt}
              library={spellLib}
              spellLevels={q.spellLevels}
              spellClass={q.spellClass}
              max={q.max ?? 1}
              bind:picks={bind[0], bind[1]}
              allowCreate
              onCreate={(name, levels) => openSpellCreator(name, levels, q.id)}
            />
          {:else if q.type === 'hp-roll'}
            {#if answers['hp_method'] === 'roll'}
              <div class="roll">
                <button type="button" class="secondary-btn" onclick={() => rollHp(q)}>🎲 {hpRolls[q.id]?.length ? 'Neu würfeln' : 'Würfeln'}</button>
                {#if hpRolls[q.id]?.length}
                  <span class="roll-result">{hpRolls[q.id].join(' + ')} = <strong>{answers[q.id]}</strong> (+ KON je Stufe)</span>
                {:else}
                  <span class="field-hint">Noch nicht gewürfelt.</span>
                {/if}
              </div>
            {:else}
              <span class="field-hint">„Durchschnitt" gewählt — kein Wurf nötig.</span>
            {/if}
          {:else}
            <textarea class="textarea" rows="2" value={answers[q.id] as string} oninput={(e) => setIn('a', q.id, (e.target as HTMLTextAreaElement).value)}></textarea>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- ── Talente wählen ─── -->
  {#if phase === 'feat-choice' && delta}
    <div class="row">
      <span class="field-label">{featsToPick} Talent(e) wählen</span>
      <div class="chips">
        {#each chosenFeats as f}
          <span class="pick">{f.nameDe}<button type="button" onclick={() => (chosenFeats = chosenFeats.filter((x) => x.name !== f.name))}>×</button></span>
        {/each}
      </div>
      <input class="input" placeholder="Talent suchen…" value={featQuery} oninput={(e) => (featQuery = (e.target as HTMLInputElement).value)} />
      {#if featQuery.trim()}
        <div class="results">
          {#each featResults() as entry}
            <button type="button" class="result" onclick={() => toggleFeat(entry)} disabled={chosenFeats.length >= featsToPick && !chosenFeats.some((f) => f.nameDe === featDisplayName(entry))}>{featDisplayName(entry)}</button>
          {/each}
          {#if !featResults().length}<span class="field-hint">Keine Treffer im Talent-Wörterbuch.</span>{/if}
        </div>
      {/if}
      <span class="field-hint">{chosenFeats.length} / {featsToPick} gewählt</span>
    </div>
  {/if}


  <!-- ── Klassenmerkmale prüfen (bereits zusammengeführt) ─── -->
  {#if phase === 'class-features'}
    <div class="row">
      <span class="field-label">Klassenmerkmale & Eigenschaften</span>
      <span class="field-hint">Die KI hat die neuen Merkmale bereits verkürzt ins bestehende Feld eingearbeitet. Du kannst frei nachbearbeiten oder erneut zusammenführen lassen.</span>
      {#if gainedFeatures.length}
        <div class="facts">
          {#each gainedFeatures as gf}<div class="fact">• {gf.name}{gf.source === 'subclass' ? ' (Subklasse)' : ''}</div>{/each}
        </div>
      {/if}
      <textarea class="textarea ta-features" rows="10" bind:value={featuresText}></textarea>
      <button type="button" class="secondary-btn rework-btn" onclick={reworkFeatures} disabled={running}>🪄 Nochmal zusammenführen</button>
    </div>
  {/if}

  <!-- ── Inline-Zauberanlage ─── -->
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

  <!-- ── Review ─── -->
  {#if phase === 'review'}
    {#if doc.summary}<p class="hint">{doc.summary}</p>{/if}
    <div class="review">
      <div class="review-line">✦ {doc.klasse || 'Klasse'}: Stufe {doc.fromLevel} → {doc.toLevel}</div>
      {#each reviewLines as line}<div class="review-line">✦ {line}</div>{/each}
      {#if reviewLines.length === 0}<div class="review-line muted">Keine automatischen Änderungen erkannt.</div>{/if}
    </div>
    {#if flagged.length}
      <div class="flagged">
        <span class="field-label warn">Nicht in der Bibliothek gefunden</span>
        {#each flagged as f}
          <div class="flagged-line">⚠ {f}
            <button type="button" class="link-btn" onclick={() => openSpellCreator(f, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], null)}>anlegen</button>
          </div>
        {/each}
      </div>
    {/if}
    <p class="field-hint">Die Änderungen werden additiv in den Entwurf übernommen (bestehende Item-Boni bleiben erhalten) und farblich hervorgehoben. Speichern/Verwerfen wie gewohnt.</p>
  {/if}

  {#if error}<p class="hint err">{error}</p>{/if}

  <!-- ── Aktionen ─── -->
  <div class="actions">
    {#if phase === 'running'}
      <button class="secondary-btn" onclick={stop}>Abbrechen</button>
    {:else if phase === 'choose-class'}
      <button class="secondary-btn" onclick={onclose}>Schließen</button>
      <button class="primary-btn" onclick={startFlow}
              disabled={(isNewClass && !newClassKey) || (!isNewClass && effectiveFrom >= 20)}>Weiter</button>
    {:else if phase === 'subclass-choice'}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={() => chosenSubclass && confirmSubclass(chosenSubclass.key, chosenSubclass.name)} disabled={!chosenSubclass}>Weiter</button>
    {:else if phase === 'feature-choices'}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={submitFeatureChoices} disabled={!allBaseChoices}>Weiter</button>
    {:else if phase === 'player-decisions'}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={submitDecisions} disabled={!allAnswered}>Weiter</button>
    {:else if phase === 'feat-choice'}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={confirmFeats} disabled={chosenFeats.length !== featsToPick}>Weiter</button>
    {:else if phase === 'feat-choices'}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={submitFeatChoices} disabled={!allFeatChoices}>Weiter</button>
    {:else if phase === 'class-features'}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={confirmClassFeatures}>Weiter</button>
    {:else if phase === 'review'}
      <button class="secondary-btn" onclick={onclose}>Verwerfen</button>
      <button class="primary-btn" onclick={apply}>In den Entwurf übernehmen</button>
    {/if}
  </div>
  </div><!-- .main -->
  </div><!-- .body -->

  <!-- ── JSON-Dokument (volle Breite, unten) ─── -->
  {#if delta}
    <details class="json-view">
      <summary>
        <span>JSON-Dokument</span>
        <button type="button" class="link-btn json-copy" onclick={(e) => { e.preventDefault(); copyDoc(); }}>{jsonCopied ? 'Kopiert ✓' : 'Kopieren'}</button>
      </summary>
      <pre class="json">{docJson}</pre>
    </details>
  {/if}
</div>

<style>
  .dialog {
    position: fixed; width: min(940px, 96vw); max-height: 88vh; overflow-y: auto;
    background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 0 1.3rem 1.3rem; display: flex; flex-direction: column; gap: 0.7rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5); z-index: 1000;
  }
  .modal-header {
    display: flex; justify-content: space-between; align-items: center; cursor: grab; user-select: none;
    margin: 0 -1.3rem 0.2rem; padding: 0.6rem 1.3rem; border-bottom: 1px solid var(--surface);
    position: sticky; top: 0; background: var(--bg);
  }
  .modal-header:active { cursor: grabbing; }
  .modal-title { font-weight: 700; font-size: 1rem; color: var(--ink); }
  .close-btn { background: none; border: none; color: var(--ink-muted); font-size: 1.3rem; cursor: pointer; line-height: 1; }
  .close-btn:hover { color: var(--ink); }

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
  .field-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); }
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

  .input, .select, .textarea {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink); font-size: 0.85rem; padding: 0.35rem 0.5rem; outline: none; font-family: inherit; width: 100%;
  }
  .input:focus, .select:focus, .textarea:focus { border-color: var(--arcane, var(--red)); }
  .textarea { resize: vertical; }

  .review { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.3rem 0; }
  .review-line { font-size: 0.82rem; color: var(--ink-soft); }
  .review-line.muted { color: var(--ink-muted); }

  .flagged { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.3rem 0; }
  .flagged-line { font-size: 0.8rem; color: var(--gold, #c89b3c); }
  .link-btn { background: none; border: none; color: var(--arcane, var(--red)); cursor: pointer; font-family: inherit; font-size: 0.78rem; text-decoration: underline; padding: 0 0.2rem; }

  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  .primary-btn { background: var(--arcane, var(--red)); border: none; border-radius: 4px; color: #fff; padding: 0.35rem 0.9rem; cursor: pointer; font-family: inherit; font-size: 0.85rem; }
  .primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .secondary-btn { background: var(--surface); border: 1px solid var(--border); border-radius: 4px; color: var(--ink-soft); padding: 0.35rem 0.9rem; cursor: pointer; font-family: inherit; font-size: 0.85rem; }

  .ai-status { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: var(--ink-soft); }
  .spinner { width: 0.9rem; height: 0.9rem; flex-shrink: 0; border: 2px solid var(--surface); border-top-color: var(--arcane, var(--red)); border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .hint { font-size: 0.78rem; margin: 0; }
  .hint.warn { color: var(--gold, #c89b3c); }
  .hint.err { color: var(--danger); }
</style>
