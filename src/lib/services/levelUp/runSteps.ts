/**
 * Die Arbeitsschritte eines Aufstiegs: die drei KI-Pässe (Analyse, Effekte, Narrativ),
 * die deterministischen Nachläufe und die Projektionen, die sie brauchen. Sie schreiben in
 * den Lauf-Zustand; angetrieben werden sie von `run.svelte.ts`.
 */
import { get } from 'svelte/store';
import { mod } from '../../domain/skills';
import { llmConfig } from '../../stores/llm';
import { runAiAction } from '../aiActions/runner';
import { buildLevelUpNarrativeAction, buildNarrativeInput, type CharacterSummary } from '../aiActions/levelUpAction';
import { buildFieldSummaryAction, buildFieldSummaryInput, SHEET_FIELDS } from '../aiActions/fieldSummaryAction';
import { analyzeFeatureEffects, finalizeFeatureEffects, type FeatureAnalysis } from '../aiActions/featureEffectsAction';
import type { GainedFeature, FeatureClassContext, ResolvedChoice } from '../analysis/types';
import { hpPerLevelSources as computeHpPerLevel, hpPerLevelSum, type PerLevelFeature } from '../perLevelEffects';
import {
  declaredSpeciesFeatures, resolveSpeciesTraits, resolveClassFeatures, resolveFeatLinks,
} from '../characterFeatures';
import { validateRiderSpells, resolveDeclaredSpells, resolveSpellNames } from './spells';
import { featToGainedFeature } from './features';
import { buildDecisions, buildFeatureChoices } from './questions';
import { sheetNoteLines, answerValues, hasAnswer } from './answers';
import { expertiseChoiceId, expertiseRider, isExpertiseFeature } from '../declaration/expertise';
import {
  optionChoiceId, optionListNoteLines, optionListRiders, optionSpellNames, unredactedChoiceFeatures,
  withoutDeclaredChoiceFeatures,
} from '../declaration/optionList';
import { withDeclaredGrants } from '../declaration/grants';
import { spellAccessNoteLines, withoutSpellAccessFeatures } from '../spellAccess';
import { parseLevelUpNarrative, parseFieldSummary, type FeatureRider, type LevelUpQuestion } from '../../schemas/levelUp';
import type { SpellInfo } from '../../spellLibrary';
import { decodePick } from '../spellcasting';
import { totalLevel } from '../../schemas/classLevelText';
import type { Character } from '../../schemas/characterSchema';
import type { LevelUpChoices } from './choices.svelte';
import type { LevelUpRunState } from './runState';

export interface RunStepsDeps {
  st: LevelUpRunState;
  choices: LevelUpChoices;
  character: Character;
  /** Meldet eine Aktivität ins Schritt-Log und stupst die Uhr an. */
  pushStep: (text: string) => void;
  runOpts: () => { onActivity: () => void; signal: AbortSignal };
  ensureSpellLib: () => Promise<SpellInfo[]>;
}

export function createRunSteps(ctx: RunStepsDeps) {
  const { st, choices, pushStep, runOpts, ensureSpellLib } = ctx;

  function buildSummary(): CharacterSummary {
    const c = ctx.character;
    const classList = c.classes ?? [];
    const abilities: Record<string, number> = {
      str: c.str, ges: c.ges, kon: c.kon, int: c.int, wei: c.wei, cha: c.cha,
    };
    const mods = Object.fromEntries(Object.entries(abilities).map(([k, v]) => [k, mod(v)]));
    return {
      name: c.name,
      classes: classList.map((x) => ({ name: x.name, level: x.level, subclassName: x.subclassName ?? '' })),
      totalLevel: classList.reduce((s, x) => s + (x.level || 0), 0),
      abilities, mods,
      hitDice: c.hitDice ?? '',
      spellcasting: {
        class: c.spells?.spellcastingClass ?? '',
        ability: c.spells?.spellcastingAbility ?? '',
        currentSlots: (c.spells?.slots ?? []).map((s) => s.total),
      },
    };
  }

  function classContext(): FeatureClassContext {
    return {
      klasseName: st.delta?.klasseName ?? '',
      // In dieser Spanne gewählt (chosenSubclass) oder längst bekannt (Delta).
      subclassName: st.chosenSubclass?.name ?? st.delta?.subclassName ?? '',
      casterType: st.delta?.casterType ?? 'NONE',
      casterKind: st.delta?.casterKind ?? 'none',
      spellcastingAbility: ctx.character.spells?.spellcastingAbility ?? '',
      toLevel: st.delta?.toLevel ?? 1,
    };
  }

  /** Höchster Zaubergrad, den der Charakter nach dem Aufstieg wirken kann. */
  function maxSpellLevel(): number {
    let m = 0;
    for (let i = 0; i < 9; i++) {
      const total = (ctx.character.spells?.slots?.[i]?.total ?? 0) + (st.delta?.spellSlotDelta?.[i] ?? 0);
      if (total > 0) m = i + 1;
    }
    return m;
  }

  /** Die Charakterstufe NACH diesem Aufstieg — nicht die Klassenstufe (`delta.toLevel`). */
  const newCharLevel = (): number => totalLevel(ctx.character.classes) + (st.delta!.toLevel - st.delta!.fromLevel);

  /** Die am Charakter GESPEICHERTE Antwort eines Merkmals, englisch kanonisch. */
  const storedChoiceOf = (f: { key?: string }): string =>
    st.pastChoices.find((p) => p.featureKey === f.key)?.choice ?? '';

  function initAnswers(questions: LevelUpQuestion[]) {
    // Bestehende Antworten ERHALTEN; nur für neue Fragen Defaults setzen.
    const a: Record<string, string | string[]> = { ...st.answers };
    for (const q of questions) {
      if (q.id in a) continue;
      if (q.type === 'multiselect' || q.type === 'spell-picker') a[q.id] = [];
      else if (q.type === 'choice') a[q.id] = q.defaultValue || q.options[0]?.value || '';
      else a[q.id] = q.defaultValue ?? '';
    }
    st.answers = a;
  }
  /**
   * Init für die Feature-Wahlen (Checkpoint nach Call 1): bewusst LEER vorbelegen (kein
   * Auto-Default auf die erste Option), damit der Spieler jede Wahl aktiv trifft — sonst
   * würde z.B. eine folgenreiche Landart stillschweigend feststehen.
   */
  function initFeatureChoices(questions: LevelUpQuestion[]) {
    const a: Record<string, string | string[]> = { ...st.answers };
    for (const q of questions) {
      if (q.id in a) continue;
      a[q.id] = q.type === 'multiselect' || q.type === 'spell-picker' ? [] : '';
    }
    st.answers = a;
  }

  /** Merkmale bzw. Talente als GainedFeature[] für die jeweilige Phase. */
  function featuresFor(kind: 'base' | 'feat'): GainedFeature[] {
    return kind === 'base'
      ? st.gainedFeatures
      : withoutDeclaredChoiceFeatures(
          withoutSpellAccessFeatures(st.chosenFeats.map((f) => featToGainedFeature(f, st.delta!.toLevel)), st.featAccess),
        );
  }

  /** Call 1 (KI): reine Analyse → erkannte Wahlen für den Checkpoint direkt danach. */
  async function runAnalyze(kind: 'base' | 'feat', alive: () => boolean) {
    await ensureSpellLib();
    if (!alive()) return;
    const features = featuresFor(kind);
    let analysis: FeatureAnalysis = { choices: [], spellsToGround: [], blocked: false, analysisText: '' };
    if (features.length) {
      pushStep(`KI analysiert ${features.length} ${kind === 'feat' ? 'Talent(e)' : 'neu gewonnene Merkmal(e)'}…`);
      analysis = await analyzeFeatureEffects(get(llmConfig), { classContext: classContext(), features, pastChoices: st.pastChoices }, runOpts());
      if (!alive()) return;
    }
    const choiceQs = buildFeatureChoices(analysis.choices);
    initFeatureChoices(choiceQs);
    if (kind === 'base') {
      st.baseAnalysis = analysis; st.baseChoices = choiceQs;
      // Die deklarierten Zweigwahlen stehen schon (ohne KI) — hier nur leer vorbelegen.
      const declaredQs = [...choices.baseOptionChoices, ...choices.baseExpertiseChoices, ...choices.baseAccessChoices];
      initFeatureChoices(declaredQs);
      if (declaredQs.length) pushStep(`${declaredQs.length} Wahl(en) aus der Bibliothek gelesen (ohne KI).`);
    }
    else { st.featAnalysis = analysis; st.featChoices = choiceQs; }
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
    const qs = kind === 'base' ? st.baseChoices : st.featChoices;
    const out: ResolvedChoice[] = [];
    for (const q of qs) {
      const v = st.answers[q.id];
      if (!hasAnswer(v)) continue;
      out.push({ id: q.id, choice: answerValues(q, v) });
    }
    return out;
  }

  /** Call C (KI): finalisiert die Effekte mit den getroffenen Entscheidungen → Rider. */
  async function runFinalize(kind: 'base' | 'feat', alive: () => boolean) {
    await ensureSpellLib();
    if (!alive()) return;
    const analysis = kind === 'base' ? st.baseAnalysis : st.featAnalysis;
    const decisionsCtx = gatherDecisions(kind);
    // Merkmale, deren Zweig nichts deklariert, kommen ERST hier dazu: die Analyse hätte
    // dieselbe Wahl ein zweites Mal gestellt, Pass C deutet nur noch ihre Prosa.
    const unredacted = unredactedChoiceFeatures(
      kind === 'base' ? choices.baseDeclared : choices.featDeclared,
      (f) => choices.optionAnswer(optionChoiceId(f)),
    ).map((f) => ({ ...f, desc: f.desc ?? '', gainedAt: st.delta!.toLevel }));
    const features = [...featuresFor(kind), ...unredacted];
    let parsed: FeatureRider[] = [];
    if (features.length && analysis) {
      pushStep(decisionsCtx.length
        ? 'KI berücksichtigt die getroffene Wahl und leitet die Effekte ab…'
        : `KI deutet ${features.length} ${kind === 'feat' ? 'Talent(e)' : 'neu gewonnene Merkmal(e)'}…`);
      const eff = await finalizeFeatureEffects(get(llmConfig),
        { classContext: classContext(), features, pastChoices: st.pastChoices, resolvedChoices: decisionsCtx }, analysis, runOpts());
      if (!alive()) return;
      parsed = eff.riders;
    }
    // Deklarierte Wahlen liefern ihren Rider aus der Bibliothek, nicht aus dem Modell —
    // dieselbe Form, damit `riderChanges`/`learnInfo` sie nicht unterscheiden müssen. Beide
    // Phasen aus DERSELBEN Liste: ein Talent mit `optionList` verlor sonst seine Wirkung.
    const grantSources = kind === 'base' ? choices.baseDeclared : choices.featDeclared;
    // Die Stufe einer Options-Zauberliste: am Klassenmerkmal die KLASSEN-, am Talent die
    // CHARAKTERstufe (`declaredSpellGrants` liest dieselbe Unterscheidung).
    const optionLevel = kind === 'base' ? st.delta!.toLevel : newCharLevel();
    const declared = [
      ...optionListRiders(grantSources, (id) => choices.optionAnswer(id), optionLevel),
      ...grantSources
        .filter(isExpertiseFeature)
        .map((f) => expertiseRider(f, choices.optionAnswer(expertiseChoiceId(f)).split(',').map((x) => x.trim())))
        .filter((r): r is FeatureRider => r !== null),
    ];
    // Die Deklaration gewinnt über den KI-Rider desselben Merkmals (und springt ein, wo gar
    // keiner kam). Nur auf `parsed` angewandt: die Rider der Zweigwahlen tragen die Grants der
    // GEWÄHLTEN OPTION, die das unbedingte `grants` des Merkmals nicht ersetzen darf.
    const validated = validateRiderSpells(
      [...withDeclaredGrants(parsed, grantSources), ...declared],
      st.spellLib,
      st.delta!.klasseName,
    );
    if (validated.flagged.length) st.flagged = [...new Set([...st.flagged, ...validated.flagged])];
    if (kind === 'base') {
      st.validatedBase = validated;
      st.riders = validated.riders;
      st.decisions = buildDecisions(st.delta!, st.riders, { maxSpellLevel: maxSpellLevel(), klasseName: st.delta!.klasseName });
      initAnswers(st.decisions);
      pushStep(st.decisions.length ? `${st.decisions.length} Entscheidung(en) vorbereitet.` : 'Keine offenen Entscheidungen.');
    } else {
      st.validatedFeats = validated;
      st.featRiders = validated.riders;
    }
  }

  /** Narrativ (KI, Schritt C) → doc.summary. */
  async function runNarrative(alive: () => boolean) {
    let n = { summary: '' };
    try {
      pushStep('KI formuliert das Narrativ…');
      const raw = await runAiAction(get(llmConfig), buildLevelUpNarrativeAction(),
        buildNarrativeInput({
          summary: buildSummary(), delta: st.delta!, gainedFeatures: st.gainedFeatures, chosenSubclass: st.chosenSubclass,
          chosenFeats: st.chosenFeats.map((f) => ({ key: f.key, name: f.nameDe })),
          riders: [...st.riders, ...st.featRiders], pastChoices: st.pastChoices,
        }), runOpts());
      if (!alive()) return;
      n = parseLevelUpNarrative(raw) ?? n;
    } catch { /* Narrativ ist optional → deterministischer Fallback */ }
    st.narrativeSummary = n.summary || fallbackSummary();
  }

  function fallbackSummary(): string {
    const names = [...st.gainedFeatures.map((f) => f.nameDe || f.name), ...st.chosenFeats.map((f) => f.nameDe)];
    const sub = st.chosenSubclass ? ` · Subklasse: ${st.chosenSubclass.name}` : '';
    return `${st.delta!.klasseName} Stufe ${st.delta!.fromLevel} → ${st.delta!.toLevel}${sub}${names.length ? ` · ${names.join(', ')}` : ''}`;
  }

  /** Die verdichteten Bogen-Notizen dieses Aufstiegs (Merkmale + Talente). */
  const newSheetNotes = () => [...sheetNoteLines(st.validatedBase.riders), ...sheetNoteLines(st.validatedFeats.riders)];

  /**
   * Rohe Saat: bestehendes Feld + neue Notizzeilen — die Fassung ohne KI-Merge.
   *
   * Die Zeile eines deklarierten Zauber-Zugangs steht BEWUSST nur hier und nicht in
   * `newSheetNotes`: sie ist fertiges Deutsch, und als „neue Notiz" würde sie den Merge-Call
   * auslösen — ein Aufstieg mit nur einem solchen Talent fährt sonst wieder einen LLM-Call.
   */
  const seedFeaturesText = () =>
    [
      ctx.character.classFeatures,
      ...newSheetNotes(),
      ...optionListNoteLines(choices.declaredOptionFeatures, (id) => choices.optionAnswer(id)),
      ...spellAccessNoteLines(choices.baseAccess, st.answers),
      ...spellAccessNoteLines(st.featAccess, st.answers),
    ]
      .filter((s) => s?.trim())
      .join('\n');

  /**
   * Verschmilzt den bestehenden (nutzergeschriebenen) Freitext mit den neuen Bogen-Notizen.
   * Scheitert der Call, bleibt die rohe Saat stehen — der Aufstieg darf daran nicht hängen.
   */
  async function mergeClassFeatures(alive: () => boolean, currentText = seedFeaturesText()) {
    const notes = newSheetNotes();
    st.featuresText = currentText;
    // Ohne neue Notizen gibt es nichts zusammenzuführen — den nutzergeschriebenen Text
    // dann NICHT durch die KI schicken, das kann nur schaden.
    if (!notes.length) {
      pushStep('Keine neuen Merkmale fürs Klassenmerkmale-Feld.');
      return;
    }
    try {
      pushStep('KI führt die Klassenmerkmale zusammen…');
      const raw = await runAiAction(get(llmConfig), buildFieldSummaryAction(),
        buildFieldSummaryInput({
          target: SHEET_FIELDS.classFeatures,
          currentText,
          newNotes: notes,
          otherFields: [{ label: SHEET_FIELDS.speciesTraits.label, text: ctx.character.personal?.rassenmerkmale ?? '' }],
          chosenSubclass: st.chosenSubclass,
        }), runOpts());
      if (!alive()) return;
      const r = parseFieldSummary(raw);
      if (r && r.text.trim()) { st.featuresText = r.text; pushStep('Klassenmerkmale zusammengeführt.'); }
      else pushStep('Keine Zusammenführung erhalten — Rohfassung bleibt stehen.');
    } catch {
      pushStep('Zusammenführung fehlgeschlagen — Rohfassung bleibt stehen.');
    }
  }

  /**
   * Zauber der Spezies- und Talent-Deklarationen auf der NEUEN Charakterstufe.
   *
   * Eigener Aufruf neben `declaredSpells`, weil `declaredSpellGrants` genau EINE Stufe filtert:
   * für ein Klassenmerkmal ist das die Klassenstufe, für ein Trait oder Talent die
   * Charakterstufe (die Elfenlinien-Tabelle 1/3/5 hängt an ihr). Kumulativ und idempotent —
   * `applyChanges` dedupliziert, schon gewährte Zeilen kosten nichts.
   */
  async function resolveCharLevelSpells() {
    const charLevel = newCharLevel();
    const species = await declaredSpeciesFeatures(ctx.character.species);
    const sources = [...species, ...choices.featDeclared];
    const lib = await ensureSpellLib();
    // Dazu die Zeilen einer bei der ERSCHAFFUNG getroffenen Zweigwahl (Elfenabstammung Stufe
    // 3 und 5). Die Wahl wird nicht erneut gestellt — ihre Antwort steht am Charakter.
    st.charLevelSpells = resolveSpellNames(
      optionSpellNames(species, storedChoiceOf, charLevel),
      lib,
      st.delta!.klasseName,
      resolveDeclaredSpells(sources, charLevel, lib, st.delta!.klasseName),
    );
    if (st.charLevelSpells.flagged.length) st.flagged = [...new Set([...st.flagged, ...st.charLevelSpells.flagged])];
  }

  // Fortlaufende, PRO-STUFE wirkende Effekte: deterministisch aus `grants.perLevel` des
  // GESAMTEN Merkmalsbestands (Spezies + Klasse/Subklasse + Talente, inkl. der diesen Level
  // neu gewonnenen). Vormals ein KI-Call über dieselbe Liste; die Dedup steckt jetzt im
  // Service, damit Wizard und Aufstieg dieselbe Regel benutzen.
  async function detectHpPerLevel(alive: () => boolean) {
    st.hpPerLevelSources = [];
    try {
      const groups = [
        ...((await resolveSpeciesTraits(ctx.character.species)) ?? []),
        ...(await resolveClassFeatures(ctx.character.classes)),
      ];
      // Nur die Talent-Links: Wahl-Annotationen bringen keinen eigenen Merkmalstext mit,
      // ihr Merkmal steckt schon in `groups`.
      const featLinks = await resolveFeatLinks((ctx.character.features ?? []).filter((f) => !f.choice?.trim()));
      const features: PerLevelFeature[] = [
        ...groups.flatMap((g) => g.features),
        ...featLinks,
        ...st.gainedFeatures,
        ...st.chosenFeats,
      ].map((f) => ({ key: f.key ?? '', name: f.name, grants: f.grants }));
      if (!alive()) return;
      st.hpPerLevelSources = computeHpPerLevel(features);
      const perLevelSum = hpPerLevelSum(st.hpPerLevelSources);
      if (perLevelSum > 0)
        pushStep(`Fortlaufende TP: +${perLevelSum}/Stufe (${st.hpPerLevelSources.map((s) => s.feature).join(', ')}).`);
    } catch {
      st.hpPerLevelSources = [];
    }
  }

  function gatherLearned(): { level: number; name: string }[] {
    const q = st.decisions.find((d) => d.id === 'learned_spells');
    if (!q) return [];
    return ((st.answers['learned_spells'] as string[]) ?? []).map(decodePick);
  }
  function gatherCantrips(): string[] {
    return ((st.answers['cantrips'] as string[]) ?? []).map((v) => decodePick(v).name);
  }

  return {
    initAnswers, initFeatureChoices,
    runAnalyze, runFinalize, runNarrative,
    seedFeaturesText, mergeClassFeatures,
    resolveCharLevelSpells, detectHpPerLevel,
    gatherLearned, gatherCantrips,
  };
}

export type LevelUpSteps = ReturnType<typeof createRunSteps>;
