/**
 * Zustandsmaschine + reine Helfer für den mehrstufigen Stufenaufstieg (rune-frei, kein LLM).
 *
 *  - `StepId` / `STEP_META` / `advance()` — die explizite Maschine: Schritt-Metadaten
 *    (Checkpoint vs. det. vs. KI) + eine lesbare Übergangsfunktion.
 *  - `computeSubclassFeatures` — zweiter deterministischer Pass, freigeschaltet durch die Wahl
 *  - `gainedFeaturesFor` / `featToGainedFeature` — Normalisierung für die Effekt-KI
 *  - `validateRiderSpells` — KI-Zaubernamen gegen die lokale Bibliothek prüfen/kanonisieren
 *  - `buildDecisions` / `countFeatsToPick` — Spieler-Fragebogen aus delta+riders ableiten
 *  - `*Changes`-Builder + `buildDoc` — das gemeinsame Änderungs-Dokument (Change[]) rein aus
 *    dem Zustand bauen; jeder Eintrag mit `step`-Provenienz (ersetzt LevelUpProposal).
 *
 * Die Svelte-Komponente hält den State (Runes) + das Lauf-Gerüst und ruft diese Helfer;
 * das Dokument ist dort ein `$derived` von `buildDoc` → das Protokoll ist eine reine Sicht.
 */
import { isFlowOwnedChoiceFeature, type LevelUpDelta } from './levelUp';
import { getProgressionByKey } from './classProgression';
import { skillLabelDe } from './proficiencyGrants';
import type { ClassFeature } from '../schemas/classProgression';
import type { GainedFeature, AnalysisChoice } from './aiActions/featureEffectsAction';
import type { LevelUpQuestion, FeatureRider, Change, LevelUpDoc } from '../schemas/levelUp';
import { searchSpells, type SpellInfo } from '../spellLibrary';

/**
 * Ein Schritt der Aufstiegs-Zustandsmaschine. `checkpoint` = die Maschine hält an
 * und die UI rendert (Nutzer-Interaktion nötig); `deterministic`/`ai` = Arbeits-
 * schritte, die die Komponente ohne Halt durchläuft. `running` ist KEIN Step,
 * sondern transienter UI-Zustand der Komponente während eines async-Arbeitsschritts.
 */
export type StepKind = 'deterministic' | 'ai' | 'checkpoint';
export type StepId =
  | 'choose-class'        // checkpoint
  | 'base-delta'          // det.
  | 'subclass-choice'     // checkpoint
  | 'subclass-delta'      // det.
  | 'feature-analysis'    // ai (Call 1: Choices ermitteln)
  | 'feature-choices'     // checkpoint (Wahlen direkt nach Call 1)
  | 'feature-effects'     // ai (Call C: finalisieren)
  | 'player-decisions'    // checkpoint
  | 'assemble-decisions'  // det.
  | 'feat-choice'         // checkpoint
  | 'feat-links'          // det.
  | 'feat-analysis'       // ai (Call 1, Talente)
  | 'feat-choices'        // checkpoint (Talent-Wahlen)
  | 'feat-effects'        // ai (Call C, Talente)
  | 'narrative'           // ai (C)
  | 'ongoing-effects'     // ai (F)
  | 'class-features-merge'// ai (D: Freitext + sheetNotes verschmelzen)
  | 'class-features'      // checkpoint (+ D erneut auf Klick)
  | 'review'              // checkpoint
  | 'done';               // terminal

export const STEP_META: Record<StepId, { kind: StepKind; label: string }> = {
  'choose-class':      { kind: 'checkpoint',    label: 'Klasse & Zielstufe' },
  'base-delta':        { kind: 'deterministic', label: 'Grundwerte' },
  'subclass-choice':   { kind: 'checkpoint',    label: 'Subklasse' },
  'subclass-delta':    { kind: 'deterministic', label: 'Subklasse' },
  'feature-analysis':  { kind: 'ai',            label: 'Merkmals-Analyse' },
  'feature-choices':   { kind: 'checkpoint',    label: 'Merkmals-Wahlen' },
  'feature-effects':   { kind: 'ai',            label: 'Merkmals-Effekte' },
  'player-decisions':  { kind: 'checkpoint',    label: 'Entscheidungen' },
  'assemble-decisions':{ kind: 'deterministic', label: 'Entscheidungen' },
  'feat-choice':       { kind: 'checkpoint',    label: 'Talente' },
  'feat-links':        { kind: 'deterministic', label: 'Talente' },
  'feat-analysis':     { kind: 'ai',            label: 'Talent-Analyse' },
  'feat-choices':      { kind: 'checkpoint',    label: 'Talent-Wahlen' },
  'feat-effects':      { kind: 'ai',            label: 'Talent-Effekte' },
  'narrative':         { kind: 'ai',            label: 'Narrativ' },
  'ongoing-effects':   { kind: 'ai',            label: 'Fortlaufende Effekte' },
  'class-features-merge': { kind: 'ai',         label: 'Klassenmerkmale' },
  'class-features':    { kind: 'checkpoint',    label: 'Klassenmerkmale' },
  'review':            { kind: 'checkpoint',    label: 'Überprüfung' },
  'done':              { kind: 'checkpoint',    label: 'Fertig' },
};

export const isCheckpoint = (s: StepId): boolean => STEP_META[s].kind === 'checkpoint';

/** Laufzeit-Kontext für die Übergangsentscheidung (aus dem Komponenten-State). */
export interface AdvanceCtx {
  delta: LevelUpDelta;
  featsToPick: number;  // countFeatsToPick(delta, answers)
  baseChoices: number;  // von der Merkmals-Analyse (Call 1) erkannte Wahlen
  featChoices: number;  // von der Talent-Analyse (Call 1) erkannte Wahlen
}

/**
 * Nächster Schritt nach `from`. Eine bewusst lineare, lesbare Funktion mit den
 * Verzweigungen des Ablaufs (Subklasse? / erkannte Wahlen? / Talente?) — KEINE rigide
 * Übergangstabelle. Merkmale (und Talente) laufen als Analyse → [Wahlen] → Effekte:
 * erkennt Call 1 erzwungene Wahlen, hält die Maschine DIREKT DANACH am Choice-Checkpoint
 * an; der finalisierende Effekt-Call folgt mit der getroffenen Entscheidung. Die Komponente
 * läuft Arbeitsschritte ab, bis ein Checkpoint kommt:
 * `while (!isCheckpoint(next)) { await run(next); next = advance(next, ctx); }`.
 */
export function advance(from: StepId, ctx: AdvanceCtx): StepId {
  switch (from) {
    case 'choose-class':       return 'base-delta';
    case 'base-delta':         return needsSubclassChoice(ctx.delta) ? 'subclass-choice' : 'feature-analysis';
    case 'subclass-choice':    return 'subclass-delta';
    case 'subclass-delta':     return 'feature-analysis';
    // Merkmale: Analyse (Call 1) → bei erkannten Wahlen anhalten → Effekte (Call C).
    case 'feature-analysis':   return ctx.baseChoices > 0 ? 'feature-choices' : 'feature-effects';
    case 'feature-choices':    return 'feature-effects';
    case 'feature-effects':    return 'player-decisions';
    case 'player-decisions':   return 'assemble-decisions';
    case 'assemble-decisions': return ctx.featsToPick > 0 ? 'feat-choice' : 'narrative';
    case 'feat-choice':        return 'feat-links';
    case 'feat-links':         return 'feat-analysis';
    // Talente: analog Analyse → [Wahlen] → Effekte.
    case 'feat-analysis':      return ctx.featChoices > 0 ? 'feat-choices' : 'feat-effects';
    case 'feat-choices':       return 'feat-effects';
    case 'feat-effects':       return 'narrative';
    case 'narrative':          return 'ongoing-effects';
    case 'ongoing-effects':    return 'class-features-merge';
    case 'class-features-merge': return 'class-features';
    case 'class-features':     return 'review';
    case 'review':             return 'done';
    case 'done':               return 'done';
  }
}

/**
 * Zeitliche Gesamtreihenfolge ALLER Schritte (Checkpoints + interne). Bestimmt, welche
 * Änderungen im Dokument bereits „gelaufen" sind: ein Schritt ist erreicht, sobald der
 * aktuelle Phasenstand ihn erreicht oder überschritten hat. Verhindert, dass das Dokument
 * Einträge künftiger Schritte zeigt (z.B. Trefferpunkte VOR dem Entscheidungs-Checkpoint).
 */
const TIMELINE: StepId[] = [
  'choose-class', 'base-delta', 'subclass-choice', 'subclass-delta',
  'feature-analysis', 'feature-choices', 'feature-effects',
  'player-decisions', 'assemble-decisions', 'feat-choice', 'feat-links',
  'feat-analysis', 'feat-choices', 'feat-effects', 'narrative', 'ongoing-effects',
  'class-features-merge', 'class-features', 'review', 'done',
];

/** Ist der (Builder-)Schritt `step` beim aktuellen Phasenstand `current` bereits gelaufen? */
export function stepReached(current: StepId, step: string): boolean {
  const ci = TIMELINE.indexOf(current);
  const si = TIMELINE.indexOf(step as StepId);
  if (ci < 0 || si < 0) return true; // unbekannter Schritt → nicht herausfiltern
  return ci >= si;
}

export const ABILITY_KEYS = ['str', 'ges', 'kon', 'int', 'wei', 'cha'] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];
export const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: 'Stärke', ges: 'Geschicklichkeit', kon: 'Konstitution', int: 'Intelligenz', wei: 'Weisheit', cha: 'Charisma',
};

// ── Feature-Normalisierung ─────────────────────────────────────────────────────
function featureToGained(f: ClassFeature, source: 'class' | 'subclass', fromLevel: number, toLevel: number): GainedFeature {
  // Die Stufe ist die NIEDRIGSTE innerhalb der aufgestiegenen Spanne — bei einem mehrfach
  // vergebenen Merkmal (Expertise auf 1 und 6) sonst immer die erste Vergabe, womit die
  // zweite Entscheidung im Ledger die erste überschreiben würde.
  const inSpan = f.gainedAt.filter((l) => l > fromLevel && l <= toLevel);
  // EN-Text UND Übersetzung mitgeben: die KI liest die Mechanik aus dem Original und
  // formuliert Fragen/Optionen in den deutschen Begriffen der Übersetzung.
  return { name: f.name, desc: f.desc ?? '', descDe: f.descDe, source, key: f.key ?? '', gainedAt: inSpan.length ? Math.min(...inSpan) : toLevel };
}

/** Merkmale, die eine Progression in der Spanne (from, to] erlangt. */
function featuresBetween(features: ClassFeature[], from: number, to: number): ClassFeature[] {
  return features
    .filter((f) => f.gainedAt.some((l) => l > from && l <= to))
    .sort((a, b) => Math.min(...a.gainedAt) - Math.min(...b.gainedAt));
}

/**
 * Basis- + (falls bereits bekannt) Subklassen-Merkmale aus dem Delta als GainedFeature[].
 *
 * Klassenmerkmale, die nur auf eine vom Flow selbst getroffene Entscheidung zeigen
 * (Subklassen-Wahl, Attributsverbesserung), fliegen hier raus: die Wahl ist beim
 * Merkmals-Schritt längst gefallen, ihre Prosa würde die Analyse aber dazu verleiten,
 * sie ein zweites Mal zu stellen. Subklassen-Merkmale bleiben unangetastet.
 */
export function gainedFeaturesFor(delta: LevelUpDelta): GainedFeature[] {
  return [
    ...delta.featuresGained
      .filter((f) => !isFlowOwnedChoiceFeature(f))
      .map((f) => featureToGained(f, 'class', delta.fromLevel, delta.toLevel)),
    ...delta.subclassFeaturesGained.map((f) => featureToGained(f, 'subclass', delta.fromLevel, delta.toLevel)),
  ];
}

/** Zweiter deterministischer Pass: Subklassen-Merkmale NACH der Wahl nachladen. */
export async function computeSubclassFeatures(subclassKey: string, from: number, to: number): Promise<GainedFeature[]> {
  const prog = await getProgressionByKey(subclassKey);
  if (!prog) return [];
  return featuresBetween(prog.features, from, to).map((f) => featureToGained(f, 'subclass', from, to));
}

/** Ein Talent (Name + EN-/DE-Beschreibung) als GainedFeature für die Effekt-Deutung. */
export function featToGainedFeature(name: string, desc: string, gainedAt: number, descDe?: string): GainedFeature {
  return { name, desc, descDe, source: 'feat', gainedAt };
}

// ── Zaubernamen-Validierung ────────────────────────────────────────────────────
/**
 * Löst einen (oft ENGLISCHEN, von der KI gelieferten) Zaubernamen auf einen lokalen
 * Bibliothekseintrag auf. Matcht EN↔DE: gegen `name` (DE), `name_en` (EN) und `key`
 * (Open5e). Exakttreffer zuerst, sonst ein starker Suchtreffer, sonst null.
 */
export function resolveSpell(library: SpellInfo[], name: string, klasseName = ''): SpellInfo | null {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  const eq = (s: SpellInfo) =>
    s.name.toLowerCase() === q || (s.name_en ?? '').toLowerCase() === q || (s.key ?? '').toLowerCase() === q;
  const exact = library.find(eq);
  if (exact) return exact;
  const hit = searchSpells(library, name.trim(), null, klasseName, 1)[0];
  // Nur akzeptieren, wenn der Treffer denselben Namen (DE oder EN) trägt (kein loser Teilstring).
  return hit && eq(hit.spell) ? hit.spell : null;
}

export interface ValidatedRiders {
  riders: FeatureRider[];
  flagged: string[]; // KI-Zaubernamen ohne Bibliothekstreffer
  grantedCantrips: string[]; // aufgelöste Grad-0-Zauber (kanonisch)
  grantedPrepared: { level: number; name: string }[]; // aufgelöste Grad-1+-Zauber (kanonisch)
}

/** Prüft alle grantedSpells der Rider gegen die Bibliothek; kanonisiert + trennt nach Grad. */
export function validateRiderSpells(riders: FeatureRider[], library: SpellInfo[], klasseName = ''): ValidatedRiders {
  const flagged: string[] = [];
  const grantedCantrips: string[] = [];
  const grantedPrepared: { level: number; name: string }[] = [];
  const cleaned = riders.map((r) => {
    const kept: string[] = [];
    for (const raw of r.grantedSpells) {
      const info = resolveSpell(library, raw, klasseName);
      if (!info) { flagged.push(raw); continue; }
      kept.push(info.name);
      if (info.level === 0) { if (!grantedCantrips.includes(info.name)) grantedCantrips.push(info.name); }
      else if (!grantedPrepared.some((p) => p.name === info.name)) grantedPrepared.push({ level: info.level, name: info.name });
    }
    return { ...r, grantedSpells: kept };
  });
  return { riders: cleaned, flagged: [...new Set(flagged)], grantedCantrips, grantedPrepared };
}

// ── Zauber erlernen vs. vorbereiten ──────────────────────────────────────────────
/** Klasse mit Zauberbuch (nimmt beim Aufstieg dauerhaft Zauber auf) — im SRD nur der Magier. */
export function isSpellbookClass(delta: LevelUpDelta): boolean {
  return /wizard/i.test(delta.sourceKey) || /magier/i.test(delta.klasseName);
}

export interface LearnInfo {
  learns: boolean; // Klasse lernt beim Aufstieg Zauber dauerhaft dazu
  count: number; // wie viele
  spellbook: boolean; // true = ins Zauberbuch (nicht automatisch vorbereitet)
}

/**
 * Ermittelt, ob und wie viele Zauber beim Aufstieg ERLERNT werden. „Vorbereiten" ist
 * KEIN Teil des Aufstiegs — reine Vorbereiter (Druide/Kleriker) lernen nichts dazu und
 * bekommen daher keine Auswahl. Known-Caster lernen ihre neuen bekannten Zauber; der
 * Magier trägt (2 je Stufe) ins Zauberbuch ein.
 */
export function learnInfo(delta: LevelUpDelta, riders: FeatureRider[]): LearnInfo {
  const spellbook = isSpellbookClass(delta);
  const known = delta.casterKind === 'known';
  const riderExtra = riders.reduce((s, r) => s + r.extraPreparedCount, 0);
  const count = known ? delta.preparedDelta + riderExtra : spellbook ? 2 * delta.levelsGained : 0;
  return { learns: known || spellbook, count, spellbook };
}

// ── Fragebogen ableiten ────────────────────────────────────────────────────────
const opt = (value: string, label: string) => ({ value, label });
const baseQuestion = (q: Partial<LevelUpQuestion> & { id: string; type: LevelUpQuestion['type']; prompt: string }): LevelUpQuestion => ({
  help: '', options: [], defaultValue: '', required: true, spellLevels: [], spellClass: '',
  resolvesEffects: false, featureKey: '', isBuildDecision: false, ...q,
});

/**
 * Leitet die zu treffenden Spieler-Entscheidungen deterministisch aus dem Delta und den
 * (bereits validierten) Merkmals-Ridern ab. `maxSpellLevel` = höchster Zaubergrad, den der
 * Charakter (nach Aufstieg) wirken kann — bestimmt die im Picker wählbaren Grade.
 */
export function buildDecisions(
  delta: LevelUpDelta,
  riders: FeatureRider[],
  opts: { maxSpellLevel: number; klasseName: string },
): LevelUpQuestion[] {
  const qs: LevelUpQuestion[] = [];

  // Trefferpunkte — bei „Würfeln" wird tatsächlich gewürfelt (Roll-Button), nicht getippt.
  if (delta.hitDie > 0) {
    qs.push(baseQuestion({
      id: 'hp_method', type: 'choice', prompt: 'Trefferpunkte bestimmen',
      help: `Durchschnitt = ${Math.floor(delta.hitDie / 2) + 1} pro Stufe (+ KON).`,
      options: [opt('average', 'Durchschnitt'), opt('roll', 'Würfeln')], defaultValue: 'average',
    }));
    qs.push(baseQuestion({
      id: 'hp_roll', type: 'hp-roll',
      prompt: delta.levelsGained > 1 ? `Trefferwürfel auswürfeln (${delta.levelsGained}×W${delta.hitDie})` : `Trefferwürfel auswürfeln (W${delta.hitDie})`,
      help: 'Nur bei „Würfeln" — klicke zum Auswürfeln.', required: false,
      dieSides: delta.hitDie, rollCount: delta.levelsGained,
    }));
  }

  // ASI vs. Talent — eine Entscheidung je ASI-Stufe in der Spanne
  for (let i = 1; i <= delta.asiCount; i++) {
    qs.push(baseQuestion({
      id: `asi_or_feat_${i}`, type: 'choice',
      prompt: delta.asiCount > 1 ? `Attributsverbesserung ${i}: Werte erhöhen oder Talent?` : 'Attributsverbesserung: Werte erhöhen oder Talent?',
      options: [opt('asi', 'Attributswerte erhöhen'), opt('feat', 'Talent wählen')], defaultValue: 'asi',
    }));
    qs.push(baseQuestion({
      id: `asi_ability1_${i}`, type: 'choice', prompt: 'Attribut A (bei „Werte erhöhen")',
      help: 'Erhält +2 (wenn B leer) bzw. +1.', required: false,
      options: ABILITY_KEYS.map((k) => opt(k, ABILITY_LABEL[k])), defaultValue: 'kon',
    }));
    qs.push(baseQuestion({
      id: `asi_ability2_${i}`, type: 'choice', prompt: 'Attribut B (optional, für +1/+1)', required: false,
      options: [opt('none', '— (nur +2 auf A)'), ...ABILITY_KEYS.map((k) => opt(k, ABILITY_LABEL[k]))], defaultValue: 'none',
    }));
  }

  // Zaubertricks
  const cantripGain = delta.cantripDelta + riders.reduce((s, r) => s + r.extraCantrips, 0);
  if (cantripGain > 0) {
    qs.push(baseQuestion({
      id: 'cantrips', type: 'spell-picker', prompt: `${cantripGain} neue(n) Zaubertrick(s) wählen`,
      max: cantripGain, spellLevels: [0], spellClass: opts.klasseName,
    }));
  }

  // Zauber ERLERNEN (nicht: vorbereiten). Nur Klassen, die Zauber dauerhaft aufnehmen
  // (known-Caster + Magier-Zauberbuch). Reine Vorbereiter bekommen hier keine Auswahl —
  // ihre Vorbereitung passiert täglich außerhalb des Aufstiegs. Immer-vorbereitete
  // Merkmalszauber werden ohnehin separat automatisch ergänzt.
  const learn = learnInfo(delta, riders);
  if (learn.learns && learn.count > 0 && opts.maxSpellLevel >= 1) {
    const levels = Array.from({ length: opts.maxSpellLevel }, (_, i) => i + 1);
    qs.push(baseQuestion({
      id: 'learned_spells', type: 'spell-picker', prompt: `${learn.count} Zauber erlernen`,
      help: learn.spellbook
        ? 'Werden ins Zauberbuch eingetragen (nicht automatisch vorbereitet).'
        : 'Neu erlernte Zauber, die du fortan wirken kannst.',
      max: learn.count, spellLevels: levels, spellClass: opts.klasseName,
    }));
  }

  // Kampfstil/Expertise + sonstige erzwungene Feature-Wahlen sind NICHT mehr hier — sie
  // werden von der Merkmals-Analyse (Call 1) erkannt und am Choice-Checkpoint entschieden.
  return qs;
}

/** Wandelt die von der Analyse (Call 1) erkannten Wahlen in Fragebogen-Fragen für den Checkpoint. */
export function buildFeatureChoices(choices: AnalysisChoice[]): LevelUpQuestion[] {
  return choices.map((c) =>
    baseQuestion({
      id: c.id,
      type: c.type === 'multiselect' ? 'multiselect' : c.type === 'text' ? 'text' : 'choice',
      prompt: c.question,
      options: c.options.map((o) => opt(o, o)),
      max: c.type === 'multiselect' ? Math.max(1, c.max) : undefined,
      resolvesEffects: c.determinesFurtherEffects,
      featureKey: c.featureKey,
      isBuildDecision: c.isBuildDecision,
    }),
  );
}

/** Anzahl zu wählender Talente = Anzahl ASI-Stufen, für die „Talent" gewählt wurde. */
export function countFeatsToPick(delta: LevelUpDelta, answers: Record<string, string | string[]>): number {
  let n = 0;
  for (let i = 1; i <= delta.asiCount; i++) if (answers[`asi_or_feat_${i}`] === 'feat') n++;
  return n;
}

// ── Vorschlag zusammenbauen ────────────────────────────────────────────────────
const isAbility = (v: unknown): v is AbilityKey => typeof v === 'string' && (ABILITY_KEYS as readonly string[]).includes(v);

/** Erhöht die Trefferwürfel-Notation für den passenden Würfeltyp; Fallback: anhängen. */
function bumpHitDice(current: string, die: number, add: number, toLevel: number): string {
  if (!die) return current;
  const re = new RegExp(`(\\d+)\\s*[WwDd]\\s*${die}\\b`);
  const m = current.match(re);
  if (m) return current.replace(re, `${Number(m[1]) + add}W${die}`);
  if (!current.trim()) return `${toLevel}W${die}`;
  return `${current} + ${add}W${die}`;
}

// ── Change-Builder (ersetzen assembleProposal + proposalToChanges) ───────────────
// Jeder Builder liefert Change[] getaggt mit seinem erzeugenden Schritt (Provenienz).
// Die Komponente schreibt die Ergebnisse per `upsertStep` ins lebende Dokument; ein
// erneut ausgeführter Schritt ersetzt so NUR seine eigenen Einträge (kein Duplikat).
//
// REIHENFOLGE-INVARIANTE: `applyLevelUp` verarbeitet changes in Array-Reihenfolge.
// classFeaturesText 'replace' (Schritt 'class-features') muss deshalb NACH allen
// übrigen Einträgen stehen — `upsertStep` sortiert dazu stabil nach STEP_ORDER.

/** Kanonische Schritt-Reihenfolge im Dokument (bestimmt die Sortierung in upsertStep). */
export const STEP_ORDER = [
  'base-delta', 'subclass-delta', 'feature-effects', 'assemble-decisions',
  'feat-links', 'feat-effects',
  'ongoing-effects', 'class-features',
] as const;
export type BuilderStep = (typeof STEP_ORDER)[number];

// ── Attributs-Helfer (aus assembleProposal gehoben) ──────────────────────────────
type AbilityMap = Record<AbilityKey, number>;
const zeroAbil = (): AbilityMap => ({ str: 0, ges: 0, kon: 0, int: 0, wei: 0, cha: 0 });

/** Attributsverbesserungen aus den ASI-Antworten (+2 auf A, oder +1/+1 auf A+B). */
function abilityFromAnswers(delta: LevelUpDelta, answers: Record<string, string | string[]>): AbilityMap {
  const abil = zeroAbil();
  for (let i = 1; i <= delta.asiCount; i++) {
    if (answers[`asi_or_feat_${i}`] !== 'asi') continue;
    const a1 = answers[`asi_ability1_${i}`];
    const a2 = answers[`asi_ability2_${i}`];
    if (isAbility(a1) && isAbility(a2) && a2 !== a1) { abil[a1] += 1; abil[a2] += 1; }
    else if (isAbility(a1)) abil[a1] += 2;
  }
  return abil;
}

/** Feste Attributsboni, die Merkmale/Talente selbst gewähren (nicht spielergewählt). */
function abilityFromRiders(riders: FeatureRider[]): AbilityMap {
  const abil = zeroAbil();
  for (const r of riders) for (const k of ABILITY_KEYS) abil[k] += r.abilityScoreIncrease[k] ?? 0;
  return abil;
}

// ── Deterministische Builder ─────────────────────────────────────────────────────
/** Basis-Delta: Übungsbonus, Zauberplätze, Zauberklasse, Trefferwürfel + Klassen-Merkmale (Info). */
export function baseDeltaChanges(delta: LevelUpDelta, hitDice: string): Change[] {
  const step: BuilderStep = 'base-delta';
  const out: Change[] = [];
  if (delta.profBonusTo !== delta.profBonusFrom)
    out.push({ target: 'proficiencyBonus', value: delta.profBonusTo, step, source: 'class-progression', label: `Übungsbonus (+${delta.profBonusFrom} → +${delta.profBonusTo})` });
  delta.spellSlotDelta.forEach((n, i) => {
    if (n > 0) out.push({ target: 'spellSlot', level: i + 1, value: n, step, source: 'class-progression', label: `Zauberplätze Grad ${i + 1}` });
  });
  // Zauberwirken NUR eintragen, wenn es in dieser Spanne erstmals erlangt wird
  // (nicht bei jedem Aufstieg eines längst zaubernden Charakters, z.B. Druide 2→3).
  if (delta.castingIsNew && delta.klasseName)
    out.push({ target: 'spellcastingClass', value: delta.klasseName, step, source: 'class-progression', label: `Zauberwirken: ${delta.klasseName}` });
  const hd = bumpHitDice(hitDice, delta.hitDie, delta.levelsGained, delta.toLevel);
  if (hd) out.push({ target: 'hitDice', value: hd, step, source: 'class-progression', label: 'Trefferwürfel' });
  // Waffenbeherrschung: nur ein HINWEIS, keine Wahl. Welche Waffen es sind, entscheidet
  // der Charakterbogen aus der Item-Bibliothek — die Wahl ist ohnehin nach jeder langen
  // Rast änderbar, und eine KI-Frage hier würde eine erfundene Waffenliste anbieten.
  if (delta.masteryTo > delta.masteryFrom) {
    const value = `Waffenbeherrschung: jetzt ${delta.masteryTo} Waffen — im Charakterbogen wählbar`;
    out.push({ target: 'note', value, step, source: 'class-progression', label: value });
  }
  for (const f of delta.featuresGained)
    out.push({ target: 'featureGained', name: f.name, sourceKey: f.key ?? '', step, source: delta.sourceKey, label: `Neues Merkmal: ${f.name}` });
  return out;
}

/** Subklassen-Wahl: Subklasse setzen + neu erlangte Subklassen-Merkmale (Info). */
export function subclassChanges(subclass: { key: string; name: string } | null, subFeatures: GainedFeature[]): Change[] {
  const step: BuilderStep = 'subclass-delta';
  const out: Change[] = [];
  if (subclass?.key)
    out.push({ target: 'subclass', key: subclass.key, name: subclass.name, step, source: subclass.key, label: `Subklasse: ${subclass.name}` });
  for (const f of subFeatures)
    out.push({ target: 'featureGained', name: f.name, sourceKey: f.key ?? '', step, source: subclass?.key ?? '', label: `Neues Merkmal: ${f.name}` });
  return out;
}

/**
 * Rider-abgeleitete AUTOMATISCHE Grants (kein Spieler-Choice): gewährte Zauber/Tricks,
 * feste Attributsboni, gewährte Profizienzen. `step` unterscheidet Basis-Merkmale
 * ('feature-effects') von Talenten ('feat-effects').
 */
export function riderChanges(v: ValidatedRiders, step: 'feature-effects' | 'feat-effects'): Change[] {
  const out: Change[] = [];
  for (const name of v.grantedCantrips)
    out.push({ target: 'cantrip', name, step, source: 'class-feature', label: `Zaubertrick: ${name}` });
  for (const p of v.grantedPrepared)
    out.push({ target: 'preparedSpell', level: p.level, name: p.name, prepared: true, step, source: 'class-feature', label: `Vorbereitet (Grad ${p.level}): ${p.name}` });
  const abil = abilityFromRiders(v.riders);
  for (const k of ABILITY_KEYS) if (abil[k])
    out.push({ target: 'ability', ability: k, value: abil[k], step, source: 'feature', label: `${ABILITY_LABEL[k]} ${abil[k] > 0 ? '+' : ''}${abil[k]}` });
  // `skill` bleibt der ENGLISCHE SRD-Name (übersetzt wird erst beim Anwenden, via
  // skillSheetKey); nur das Anzeige-Label ist deutsch.
  const profs = [...new Set(v.riders.flatMap((r) => r.proficiencies.skills))];
  for (const skill of profs)
    out.push({ target: 'proficiency', skill, step, source: 'class-feature', label: `Übung: ${skillLabelDe(skill)}` });
  // Gewählte Expertise (bereits entschieden, kommt aus rider.expertiseSkills).
  const experts = [...new Set(v.riders.flatMap((r) => r.expertiseSkills))];
  for (const skill of experts)
    out.push({ target: 'expertise', skill, step, source: 'class-feature', label: `Expertise: ${skillLabelDe(skill)}` });
  return out;
}

export interface DecisionChangesParams {
  delta: LevelUpDelta;
  answers: Record<string, string | string[]>;
  konMod: number;
  pickedCantrips: string[];
  pickedLearned: { level: number; name: string }[];
  learnAsPrepared: boolean;
}

/** Spieler-Entscheidungen: Trefferpunkte, ASI, gewählte Zaubertricks/Zauber, Expertise. */
export function decisionChanges(p: DecisionChangesParams): Change[] {
  const step: BuilderStep = 'assemble-decisions';
  const { delta, answers } = p;
  const out: Change[] = [];

  // Trefferpunkte. Beim Würfeln ist `hp_roll` bereits die SUMME aller Stufen; KON je Stufe.
  if (delta.hitDie > 0) {
    const avg = Math.floor(delta.hitDie / 2) + 1;
    const rolled = Number(answers['hp_roll']);
    const hpGain = answers['hp_method'] === 'roll' && rolled > 0
      ? rolled + p.konMod * delta.levelsGained
      : (avg + p.konMod) * delta.levelsGained;
    if (hpGain) out.push({ target: 'hpMax', value: hpGain, step, source: 'hit-dice+kon', label: 'Trefferpunkte (Würfel + KON)' });
  }

  const abil = abilityFromAnswers(delta, answers);
  for (const k of ABILITY_KEYS) if (abil[k])
    out.push({ target: 'ability', ability: k, value: abil[k], step, source: 'asi', label: `${ABILITY_LABEL[k]} ${abil[k] > 0 ? '+' : ''}${abil[k]}` });

  for (const name of p.pickedCantrips)
    out.push({ target: 'cantrip', name, step, source: 'class-progression', label: `Zaubertrick: ${name}` });

  for (const s of p.pickedLearned) {
    if (!s.name?.trim()) continue;
    out.push({ target: 'preparedSpell', level: s.level, name: s.name, prepared: p.learnAsPrepared, step, source: 'class-progression', label: `${p.learnAsPrepared ? 'Vorbereitet' : 'Zauberbuch'} (Grad ${s.level}): ${s.name}` });
  }

  return out;
}

/** Gewählte Talente als Referenz-Links (references.feats). */
export function featChanges(chosenFeats: { key: string; name: string; gainedAt: number }[]): Change[] {
  const step: BuilderStep = 'feat-links';
  return chosenFeats.map((f) => ({ target: 'feat' as const, sourceKey: f.key, name: f.name, gainedAt: f.gainedAt, step, source: f.key || 'feat', label: `Talent: ${f.name}` }));
}

/**
 * Die Antwort auf eine Frage als deutsche Label-Liste (Mehrfachauswahl komma-verbunden).
 * Ein Wert ohne passende Option ist Freitext und bleibt, wie er ist.
 */
export function answerLabels(q: LevelUpQuestion, value: string | string[] | undefined): string {
  if (value === undefined) return '';
  const vals = Array.isArray(value) ? value : [value];
  return vals.map((v) => q.options.find((o) => o.value === v)?.label ?? v).filter((s) => s.trim()).join(', ');
}

/** Ob diese Frage eine Entscheidung ins Merkmals-Ledger schreibt. */
function recordsChoice(q: LevelUpQuestion, answers: Record<string, string | string[]>): boolean {
  return !!q.featureKey && q.isBuildDecision && !!answerLabels(q, answers[q.id]);
}

/**
 * Getroffene Aufbau-Entscheidungen als `featureChoice`-Changes — der strukturierte Teil,
 * der im Merkmals-Ledger des Charakters landet. Nur Fragen, die ein Bibliotheks-Merkmal
 * stellt (`featureKey`) UND die eine dauerhafte Wahl sind (`isBuildDecision`); Wahlen pro
 * Einsatz werden beantwortet, aber nicht festgeschrieben.
 *
 * Die Stufe kommt aus dem Merkmal selbst, nicht aus der Zielstufe: bei einem Sprung über
 * mehrere Stufen gehört die Wahl zu der Stufe, auf der das Merkmal kam.
 */
export function featureChoiceChanges(
  qs: LevelUpQuestion[],
  answers: Record<string, string | string[]>,
  gainedAtByKey: Map<string, number>,
  fallbackLevel: number,
  step: 'assemble-decisions' | 'feat-effects',
): Change[] {
  const out: Change[] = [];
  for (const q of qs) {
    if (!recordsChoice(q, answers)) continue;
    const choice = answerLabels(q, answers[q.id]);
    out.push({
      target: 'featureChoice',
      sourceKey: q.featureKey,
      choice,
      gainedAt: gainedAtByKey.get(q.featureKey) ?? fallbackLevel,
      step,
      source: q.featureKey,
      label: `${q.prompt}: ${choice}`,
    });
  }
  return out;
}

/**
 * Getroffene Feature-Wahlen (rider.decisions) als Info-Notiz (`note`) — reines Protokoll
 * für alles, was NICHT im Merkmals-Ledger landet (Wahlen pro Einsatz, Wahlen ohne
 * auflösbaren Merkmals-Key). Was `featureChoiceChanges` schon aufgenommen hat, wird über
 * `recorded` (Choice-ids) ausgelassen — sonst stünde jede Entscheidung zweimal im Protokoll.
 * `step` unterscheidet Basis- ('assemble-decisions') von Talent-Wahlen ('feat-effects').
 */
export function decisionNotes(
  riders: FeatureRider[],
  step: 'assemble-decisions' | 'feat-effects',
  recorded: Set<string> = new Set(),
): Change[] {
  const out: Change[] = [];
  for (const r of riders) {
    for (const d of r.decisions) {
      if (!d.answer?.trim() || recorded.has(d.id)) continue;
      out.push({ target: 'note', value: d.answer, step, source: r.featureName || 'feature', label: `${d.question}: ${d.answer}` });
    }
  }
  return out;
}

/** Choice-ids, die als `featureChoice` festgehalten werden (Gegenstück zu `decisionNotes`). */
export function recordedChoiceIds(qs: LevelUpQuestion[], answers: Record<string, string | string[]>): Set<string> {
  return new Set(qs.filter((q) => recordsChoice(q, answers)).map((q) => q.id));
}

/**
 * Die von der Merkmals-Deutung verdichteten Bogen-Notizen als Textzeilen für den
 * Klassenmerkmale-Freitext. Merkmale ohne Notiz-Bedarf liefern einen leeren `sheetNote`
 * und fallen hier heraus — die Auswahl trifft bewusst die KI (Pass C, Regel 10), nicht
 * dieser Code: nur sie weiß, was der Bogen bereits anderswo führt.
 *
 * Getroffene Wahlen (rider.decisions) tauchen hier NICHT separat auf — Pass C webt ihr
 * Ergebnis in die Notiz des jeweiligen Merkmals ein. Im Protokoll bleiben sie über
 * `decisionNotes` sichtbar.
 */
export function sheetNoteLines(riders: FeatureRider[]): string[] {
  return riders.map((r) => r.sheetNote.trim()).filter(Boolean);
}

/** Fortlaufende Pro-Stufe-TP (je Quelle ein eigener Eintrag; Betrag × gewonnene Stufen). */
export function ongoingChanges(sources: { feature: string; sourceKey?: string; amount: number }[], levelsGained: number): Change[] {
  const step: BuilderStep = 'ongoing-effects';
  return sources
    .map((s) => ({ target: 'hpMax' as const, value: s.amount * levelsGained, step, source: s.sourceKey || s.feature, label: s.feature }))
    .filter((c) => c.value);
}

/** Klassenmerkmale-Freitext als Volltext-Ersatz (aus dem editierbaren Feld / KI-Rewrite). */
export function classFeaturesChanges(text: string): Change[] {
  if (!text?.trim()) return [];
  return [{ target: 'classFeaturesText', mode: 'replace', value: text, step: 'class-features', source: 'ai', label: 'Klassenmerkmale (überarbeitet)' }];
}

// ── Das gemeinsame Dokument (reine Projektion des aktuellen Zustands) ─────────────
export interface DocInput {
  delta: LevelUpDelta;
  hitDice: string;
  chosenSubclass: { key: string; name: string } | null;
  subFeatures: GainedFeature[];            // NUR die Subklassen-Merkmale (für Info-Einträge)
  validatedBase: ValidatedRiders;
  validatedFeats: ValidatedRiders;
  answers: Record<string, string | string[]>;
  konMod: number;
  pickedCantrips: string[];
  pickedLearned: { level: number; name: string }[];
  learnAsPrepared: boolean;
  chosenFeats: { key: string; name: string; gainedAt: number }[];
  // Die Wahl-Fragebögen beider Checkpoints — Quelle der `featureChoice`-Changes; die
  // Merkmalsliste liefert dazu die Stufe je Merkmals-Key.
  baseChoiceQs: LevelUpQuestion[];
  featChoiceQs: LevelUpQuestion[];
  gainedFeatures: GainedFeature[];
  hpPerLevelSources: { feature: string; sourceKey?: string; amount: number }[];
  narrativeSummary: string;
  featuresText: string;
  upTo?: StepId; // aktueller Phasenstand: nur Änderungen bereits gelaufener Schritte aufnehmen
}

/**
 * Baut das gemeinsame LevelUp-Dokument als reine Funktion des aktuellen Zustands:
 * die Builder werden in kanonischer STEP_ORDER konkateniert (die Reihenfolge-Invariante
 * — classFeaturesText 'replace' zuletzt — ist damit strukturell garantiert). Die
 * Komponente ruft dies in einem `$derived` auf; dadurch ist das Dokument stets synchron
 * und das Protokoll eine reine Sicht darauf. Ein erneut ausgeführter Schritt (geänderte
 * Antwort, neu gewählte Subklasse) ersetzt automatisch nur seine eigenen Einträge.
 */
export function buildDoc(p: DocInput): LevelUpDoc {
  const gainedAtByKey = new Map<string, number>();
  for (const f of [...p.gainedFeatures, ...p.subFeatures]) if (f.key) gainedAtByKey.set(f.key, f.gainedAt);
  for (const f of p.chosenFeats) if (f.key) gainedAtByKey.set(f.key, f.gainedAt);

  const changes: Change[] = [
    ...baseDeltaChanges(p.delta, p.hitDice),
    ...subclassChanges(p.chosenSubclass, p.subFeatures),
    ...riderChanges(p.validatedBase, 'feature-effects'),
    ...decisionChanges({ delta: p.delta, answers: p.answers, konMod: p.konMod, pickedCantrips: p.pickedCantrips, pickedLearned: p.pickedLearned, learnAsPrepared: p.learnAsPrepared }),
    ...featureChoiceChanges(p.baseChoiceQs, p.answers, gainedAtByKey, p.delta.toLevel, 'assemble-decisions'),
    ...decisionNotes(p.validatedBase.riders, 'assemble-decisions', recordedChoiceIds(p.baseChoiceQs, p.answers)),
    ...featChanges(p.chosenFeats),
    ...riderChanges(p.validatedFeats, 'feat-effects'),
    ...featureChoiceChanges(p.featChoiceQs, p.answers, gainedAtByKey, p.delta.toLevel, 'feat-effects'),
    ...decisionNotes(p.validatedFeats.riders, 'feat-effects', recordedChoiceIds(p.featChoiceQs, p.answers)),
    ...ongoingChanges(p.hpPerLevelSources, p.delta.levelsGained),
    ...classFeaturesChanges(p.featuresText),
  ];
  // Nur Änderungen bereits erreichter Schritte zeigen (kein Vorgriff auf künftige Schritte).
  const visible = p.upTo ? changes.filter((c) => stepReached(p.upTo!, c.step)) : changes;
  return { fromLevel: p.delta.fromLevel, toLevel: p.delta.toLevel, klasse: p.delta.klasseName, summary: p.narrativeSummary, changes: visible };
}

// ── Schritt-Übergänge ──────────────────────────────────────────────────────────
/**
 * Nächster Schritt nach `feature-effects`/`player-decisions`. Reine Skip-Logik;
 * die async-Arbeit (Delta, KI) orchestriert die Komponente. `homebrew` wird separat
 * behandelt (Rückfall auf den alten Frage-→-Vorschlag-KI-Pfad).
 */
export function needsSubclassChoice(delta: LevelUpDelta): boolean {
  return delta.triggersSubclassChoice && !delta.subclassKey && delta.subclassOptions.length > 0;
}
