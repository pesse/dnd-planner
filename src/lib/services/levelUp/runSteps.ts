/**
 * Die Arbeitsschritte eines Aufstiegs — deterministische Auswertung der Deklarationen, drei
 * KI-Pässe am Ende und ihre Projektionen. Sie schreiben in den Lauf-Zustand, angetrieben von
 * `run.svelte.ts`.
 */
import { get } from 'svelte/store';
import { mod } from '../../domain/skills';
import { abilityRecordOf } from '../../schemas/abilities';
import { llmConfig } from '../../stores/llm';
import { runAiAction } from '../aiActions/runner';
import { buildLevelUpNarrativeAction, buildNarrativeInput, type CharacterSummary } from '../aiActions/levelUpAction';
import { buildFieldSummaryAction, buildFieldSummaryInput, SHEET_FIELDS } from '../aiActions/fieldSummaryAction';
import { summarizeFeatureNotes } from '../aiActions/featureNotesAction';
import type { GainedFeature, FeatureClassContext } from '../analysis/types';
import { hpPerLevelSources as computeHpPerLevel, hpPerLevelSum, type PerLevelFeature } from '../perLevelEffects';
import {
  declaredSpeciesFeatures, resolveSpeciesTraits, resolveClassFeatures, resolveFeatLinks,
} from '../characterFeatures';
import { validateRiderSpells, resolveDeclaredSpells, resolveSpellNames } from './spells';
import { featToGainedFeature } from './features';
import { buildDecisions } from './questions';
import { sheetNoteLines } from './answers';
import { expertiseRiders } from '../declaration/expertise';
import { skillProficiencyRiders } from '../declaration/skillProficiency';
import { languageRiders } from '../declaration/languages';
import {
  optionListNoteLines, optionListRiders, optionSpellNames, unredactedChoiceFeatures,
  withoutDeclaredChoiceFeatures,
} from '../declaration/optionList';
import { declaredGrantRiders } from '../declaration/grants';
import { declarationGapLines, type GapCandidate } from '../declarationGap';
import { spellAccessNoteLines, withoutSpellAccessFeatures } from '../spellcasting/access';
import { parseLevelUpNarrative, parseFieldSummary, type FeatureRider, type LevelUpQuestion } from '../../schemas/levelUp';
import { spellInfoByKey, type SpellInfo } from '../../spellLibrary';
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

  /** `spell.key` → Bibliotheks-Eintrag; erst nach `ensureSpellLib()` sinnvoll befüllt. */
  const spellOf = (key: string) => spellInfoByKey(st.spellLib, key);

  function buildSummary(): CharacterSummary {
    const c = ctx.character;
    const classList = c.classes ?? [];
    const abilities = { ...c.abilities };
    const mods = abilityRecordOf((k) => mod(abilities[k]));
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
   * Bewusst LEER vorbelegen statt auf die erste Option: der Spieler soll jede Wahl aktiv
   * treffen, sonst stünde etwa eine folgenreiche Landart stillschweigend fest.
   */
  function initFeatureChoices(questions: LevelUpQuestion[]) {
    const a: Record<string, string | string[]> = { ...st.answers };
    for (const q of questions) {
      if (q.id in a) continue;
      a[q.id] = q.type === 'multiselect' || q.type === 'spell-picker' ? [] : '';
    }
    st.answers = a;
  }

  function featuresFor(kind: 'base' | 'feat'): GainedFeature[] {
    return kind === 'base'
      ? st.gainedFeatures
      : withoutDeclaredChoiceFeatures(
          withoutSpellAccessFeatures(st.chosenFeats.map((f) => featToGainedFeature(f, st.delta!.toLevel)), st.featAccess),
        );
  }

  /** Die deklarierten Wahlen der Basis-Merkmale leer vorbelegen — der Checkpoint folgt. */
  function runDeclaredChoices() {
    const declaredQs = [
      ...choices.baseOptionChoices, ...choices.baseExpertiseChoices, ...choices.baseSkillProfChoices,
      ...choices.baseLanguageChoices, ...choices.baseAccessChoices,
    ];
    initFeatureChoices(declaredQs);
    pushStep(declaredQs.length
      ? `${declaredQs.length} Wahl(en) aus der Bibliothek gelesen.`
      : 'Keine Wahl nötig.');
  }

  /**
   * Die Rider einer Seite: rein aus den Deklarationen der Bibliothek und den Antworten
   * darauf. `declaredGrantRiders` steht getrennt neben den Wahl-Ridern, weil die Rider einer
   * Zweigwahl die Grants der GEWÄHLTEN OPTION tragen und das unbedingte `grants` des
   * Merkmals nicht ersetzen dürfen.
   */
  async function runRiders(kind: 'base' | 'feat', alive: () => boolean) {
    await ensureSpellLib();
    if (!alive()) return;
    const grantSources = kind === 'base' ? choices.baseDeclared : choices.featDeclared;
    // Die Stufe einer Options-Zauberliste: am Klassenmerkmal die KLASSEN-, am Talent die
    // CHARAKTERstufe (`declaredSpellGrants` liest dieselbe Unterscheidung).
    const optionLevel = kind === 'base' ? st.delta!.toLevel : newCharLevel();
    const answerOf = (id: string) => choices.optionAnswer(id);
    const riders: FeatureRider[] = [
      ...declaredGrantRiders(grantSources),
      ...optionListRiders(grantSources, answerOf, optionLevel),
      ...expertiseRiders(grantSources, answerOf),
      ...skillProficiencyRiders(grantSources, answerOf),
      ...languageRiders(grantSources, answerOf),
    ];
    const validated = validateRiderSpells(riders, st.spellLib, st.delta!.klasseName);
    if (validated.flagged.length) st.flagged = [...new Set([...st.flagged, ...validated.flagged])];
    reportGaps(grantSources, unredactedOf(grantSources));
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

  /** Merkmale, deren gewählter Zweig nichts deklariert — Wahl getroffen, Wirkung offen. */
  const unredactedOf = (declared: typeof choices.baseDeclared) =>
    unredactedChoiceFeatures(declared, (id) => choices.optionAnswer(id))
      .map((f) => ({ ...f, desc: f.desc ?? '', gainedAt: st.delta!.toLevel }));

  /**
   * Der Preis des Schnitts: eine undeklarierte Wahl fängt niemand mehr auf. Ins Schritt-Log
   * UND (über `seedFeaturesText`) ins Klassenmerkmale-Feld, damit die Lücke den Lauf überlebt.
   */
  function reportGaps(features: readonly GapCandidate[], unredacted: readonly { name: string; nameDe?: string }[]) {
    const lines = declarationGapLines(features, unredacted).filter((l) => !st.gaps.includes(l));
    if (!lines.length) return;
    st.gaps = [...st.gaps, ...lines];
    for (const l of lines) pushStep(l);
  }

  /**
   * Der EINZIGE Deutungs-Call der Merkmalsstrecke: je Merkmal eine Bogenzeile. Basis- und
   * Talentmerkmale in EINEM Call — erst hier stehen beide fest, und der Merge braucht sie
   * als Nächstes.
   */
  async function runNotes(alive: () => boolean) {
    // Merkmale, deren gewählter Zweig nichts deklariert, kommen hier dazu: mechanisch ist
    // nichts von ihnen zu holen, ihre Prosa braucht trotzdem eine Zeile.
    const features = [
      ...featuresFor('base'), ...unredactedOf(choices.baseDeclared),
      ...featuresFor('feat'), ...unredactedOf(choices.featDeclared),
    ];
    st.notes = [];
    if (!features.length) {
      pushStep('Keine Merkmale für eine Bogen-Notiz übrig.');
      return;
    }
    pushStep(`KI formuliert die Bogen-Notiz für ${features.length} Merkmal(e)…`);
    const notes = await summarizeFeatureNotes(get(llmConfig),
      { classContext: classContext(), features, terms: choiceTerms() }, runOpts());
    if (!alive()) return;
    st.notes = notes;
  }

  /**
   * Die Options-Paare aller Wahlen als feste Begriffe für die Übersetzung: eine Notiz nennt
   * die gewählte Option („Magic Initiate (Wizard)"), und ohne das Paar wird daraus
   * „Zauberer" statt „Magier".
   */
  function choiceTerms(): { en: string; de: string }[] {
    return [...choices.baseChoiceQs, ...choices.featChoiceQs]
      .flatMap((q) => q.options.map((o) => ({ en: o.value, de: o.label })))
      .filter((t) => t.de && t.de !== t.en);
  }

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

  const newSheetNotes = () => sheetNoteLines(st.notes);

  /**
   * Die Zeile eines deklarierten Zauber-Zugangs steht BEWUSST nur hier und nicht in
   * `newSheetNotes`: sie ist fertiges Deutsch, und als „neue Notiz" löste sie den Merge-Call
   * aus — ein Aufstieg mit nur einem solchen Talent fährt sonst wieder einen LLM-Call.
   */
  const seedFeaturesText = () =>
    [
      ctx.character.classFeatures,
      ...newSheetNotes(),
      ...optionListNoteLines(choices.declaredOptionFeatures, (id) => choices.optionAnswer(id)),
      ...spellAccessNoteLines(choices.baseAccess, st.answers),
      ...spellAccessNoteLines(st.featAccess, st.answers),
      ...st.gaps,
    ]
      .filter((s) => s?.trim())
      .join('\n');

  /** Scheitert der Call, bleibt die rohe Saat stehen — der Aufstieg darf daran nicht hängen. */
  async function mergeClassFeatures(alive: () => boolean, currentText = seedFeaturesText()) {
    const notes = newSheetNotes();
    st.featuresText = currentText;
    // Ohne neue Notizen den nutzergeschriebenen Text NICHT durch die KI schicken.
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
   * Eigener Aufruf neben `declaredSpells`, weil `declaredSpellGrants` genau EINE Stufe filtert:
   * am Klassenmerkmal die Klassen-, am Trait oder Talent die CHARAKTERstufe (die
   * Elfenlinien-Tabelle 1/3/5 hängt daran). Idempotent, `applyChanges` dedupliziert.
   */
  async function resolveCharLevelSpells() {
    const charLevel = newCharLevel();
    const species = await declaredSpeciesFeatures(ctx.character.species);
    const sources = [...species, ...choices.featDeclared];
    const lib = await ensureSpellLib();
    // Dazu die Zeilen einer bei der ERSCHAFFUNG getroffenen Zweigwahl (Elfenabstammung 3/5):
    // die Wahl wird nicht erneut gestellt, ihre Antwort steht am Charakter.
    st.charLevelSpells = resolveSpellNames(
      optionSpellNames(species, storedChoiceOf, charLevel),
      lib,
      st.delta!.klasseName,
      resolveDeclaredSpells(sources, charLevel, lib, st.delta!.klasseName),
    );
    if (st.charLevelSpells.flagged.length) st.flagged = [...new Set([...st.flagged, ...st.charLevelSpells.flagged])];
  }

  // Über den GESAMTEN Merkmalsbestand, nicht nur den neuen: `grants.perLevel` wirkt
  // rückwirkend auf alle Stufen. Die Dedup liegt im Service, damit Wizard und Aufstieg
  // dieselbe Regel benutzen.
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

  function gatherLearned(): { key: string; name: string; level: number }[] {
    const q = st.decisions.find((d) => d.id === 'learned_spells');
    if (!q) return [];
    return ((st.answers['learned_spells'] as string[]) ?? [])
      .map((key) => { const info = spellOf(key); return info ? { key, name: info.name, level: info.level } : null; })
      .filter((x): x is { key: string; name: string; level: number } => !!x);
  }
  function gatherCantrips(): { key: string; name: string }[] {
    return ((st.answers['cantrips'] as string[]) ?? [])
      .map((key) => { const info = spellOf(key); return info ? { key, name: info.name } : null; })
      .filter((x): x is { key: string; name: string } => !!x);
  }

  return {
    initAnswers, initFeatureChoices,
    runDeclaredChoices, runRiders, runNotes, runNarrative,
    seedFeaturesText, mergeClassFeatures,
    resolveCharLevelSpells, detectHpPerLevel,
    gatherLearned, gatherCantrips, spellOf,
  };
}

export type LevelUpSteps = ReturnType<typeof createRunSteps>;
