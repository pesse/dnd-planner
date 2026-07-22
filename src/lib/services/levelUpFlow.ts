/**
 * Deterministischer Driver für den mehrstufigen Stufenaufstieg (kein LLM).
 *
 * Besitzt die Schritt-Zustandsmaschine als reine Helfer:
 *  - `nextStep`         — Übergänge inkl. Skip-Logik (Subklasse schon gewählt, Homebrew, …)
 *  - `computeSubclassFeatures` — zweiter deterministischer Pass, freigeschaltet durch die Wahl
 *  - `gainedFeaturesFor` / `featToGainedFeature` — Normalisierung für die Effekt-KI
 *  - `validateRiderSpells` — KI-Zaubernamen gegen die lokale Bibliothek prüfen/kanonisieren
 *  - `buildDecisions`    — den Spieler-Fragebogen AUS delta+riders ableiten (statt raten)
 *  - `countFeatsToPick`  — wie viele Talente der Spieler wählen muss
 *  - `assembleProposal`  — den additiven Änderungsvorschlag deterministisch bauen
 *
 * Die Svelte-Komponente hält den State (Svelte-Runes) und ruft diese Helfer.
 */
import type { LevelUpDelta } from './levelUp';
import { getProgressionByKey } from './classProgression';
import type { ClassFeature } from '../schemas/classProgression';
import type { GainedFeature } from './aiActions/featureEffectsAction';
import type { LevelUpQuestion, LevelUpProposal, FeatureRider } from '../schemas/levelUp';
import { searchSpells, type SpellInfo } from '../spellLibrary';

export type LevelUpStep =
  | 'choose-class'
  | 'running'
  | 'subclass-choice'
  | 'feature-effects'
  | 'player-decisions'
  | 'feat-choice'
  | 'feat-effects'
  | 'followup-decisions'
  | 'class-features'
  | 'review'
  | 'done';

export const ABILITY_KEYS = ['str', 'ges', 'kon', 'int', 'wei', 'cha'] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];
const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: 'Stärke', ges: 'Geschicklichkeit', kon: 'Konstitution', int: 'Intelligenz', wei: 'Weisheit', cha: 'Charisma',
};

// ── Feature-Normalisierung ─────────────────────────────────────────────────────
function featureToGained(f: ClassFeature, source: 'class' | 'subclass', toLevel: number): GainedFeature {
  return { name: f.name, desc: f.desc ?? '', source, gainedAt: Math.min(toLevel, ...(f.gainedAt.length ? f.gainedAt : [toLevel])) };
}

/** Merkmale, die eine Progression in der Spanne (from, to] erlangt. */
function featuresBetween(features: ClassFeature[], from: number, to: number): ClassFeature[] {
  return features
    .filter((f) => f.gainedAt.some((l) => l > from && l <= to))
    .sort((a, b) => Math.min(...a.gainedAt) - Math.min(...b.gainedAt));
}

/** Basis- + (falls bereits bekannt) Subklassen-Merkmale aus dem Delta als GainedFeature[]. */
export function gainedFeaturesFor(delta: LevelUpDelta): GainedFeature[] {
  return [
    ...delta.featuresGained.map((f) => featureToGained(f, 'class', delta.toLevel)),
    ...delta.subclassFeaturesGained.map((f) => featureToGained(f, 'subclass', delta.toLevel)),
  ];
}

/** Zweiter deterministischer Pass: Subklassen-Merkmale NACH der Wahl nachladen. */
export async function computeSubclassFeatures(subclassKey: string, from: number, to: number): Promise<GainedFeature[]> {
  const prog = await getProgressionByKey(subclassKey);
  if (!prog) return [];
  return featuresBetween(prog.features, from, to).map((f) => featureToGained(f, 'subclass', to));
}

/** Ein Talent (Name + Beschreibung) als GainedFeature für die Effekt-Deutung. */
export function featToGainedFeature(name: string, desc: string, gainedAt: number): GainedFeature {
  return { name, desc, source: 'feat', gainedAt };
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
  help: '', options: [], defaultValue: '', required: true, spellLevels: [], spellClass: '', ...q,
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

  // Rider-getriebene Wahlen: Fighting Style, Expertise, sonstige choicePrompts
  for (const r of riders) {
    if (r.fightingStyle && r.fightingStyleOptions.length) {
      qs.push(baseQuestion({
        id: `fighting_style_${qs.length}`, type: 'choice', prompt: 'Kampfstil wählen',
        options: r.fightingStyleOptions, defaultValue: r.fightingStyleOptions[0]?.value ?? '',
      }));
    }
    if (r.expertiseCount > 0 && r.expertiseOptions.length) {
      qs.push(baseQuestion({
        id: `expertise_${qs.length}`, type: 'multiselect', prompt: `Expertise wählen (${r.expertiseCount})`,
        options: r.expertiseOptions.map((s) => opt(s, s)), max: r.expertiseCount,
      }));
    }
  }

  return qs;
}

/** Sammelt alle erzwungenen Folge-Wahlen (choicePrompts) aus den Ridern. */
export function collectChoicePrompts(riders: FeatureRider[]): LevelUpQuestion[] {
  return riders.flatMap((r) => r.choicePrompts.map((q) => baseQuestion(q as LevelUpQuestion)));
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

export interface AssembleParams {
  delta: LevelUpDelta;
  chosenSubclass: { key: string; name: string } | null;
  gainedFeatures: GainedFeature[]; // tatsächlich gewonnene Klassen-+Subklassen-Merkmale (inkl. frisch gewählter Subklasse)
  riders: FeatureRider[]; // Basis+Subklasse (validiert)
  featRiders: FeatureRider[]; // Talente (validiert)
  validated: ValidatedRiders; // Zusammenführung der Zauber-Validierung (Basis+Subklasse+Talente)
  answers: Record<string, string | string[]>;
  followupAnswers: Record<string, string | string[]>;
  chosenFeats: { key: string; name: string; gainedAt: number }[];
  pickedLearned: { level: number; name: string }[]; // aus dem „Zauber erlernen"-Picker
  learnAsPrepared: boolean; // gelernte Zauber als vorbereitet (known-Caster) oder nur ins Buch (Magier)
  pickedCantrips: string[]; // aus dem Zaubertrick-Picker
  konMod: number;
  hitDice: string; // aktuelle Trefferwürfel-Notation des Charakters
  narrative: { summary: string; classFeaturesAppend: string };
}

export function assembleProposal(p: AssembleParams): LevelUpProposal {
  const { delta, answers } = p;

  // Trefferpunkte. Beim Würfeln ist `hp_roll` bereits die SUMME aller gewonnenen Stufen;
  // der KON-Mod kommt je Stufe dazu. Sonst Durchschnitt je Stufe.
  let hpGain = 0;
  if (delta.hitDie > 0) {
    const avg = Math.floor(delta.hitDie / 2) + 1;
    const rolledTotal = Number(answers['hp_roll']);
    if (answers['hp_method'] === 'roll' && rolledTotal > 0) {
      hpGain = rolledTotal + p.konMod * delta.levelsGained;
    } else {
      hpGain = (avg + p.konMod) * delta.levelsGained;
    }
  }

  // Attributsverbesserungen (ASI) + feste Rider-Boni + Folge-Wahlen
  const abil = { str: 0, ges: 0, kon: 0, int: 0, wei: 0, cha: 0 };
  for (let i = 1; i <= delta.asiCount; i++) {
    if (answers[`asi_or_feat_${i}`] !== 'asi') continue;
    const a1 = answers[`asi_ability1_${i}`];
    const a2 = answers[`asi_ability2_${i}`];
    if (isAbility(a1) && isAbility(a2) && a2 !== a1) { abil[a1] += 1; abil[a2] += 1; }
    else if (isAbility(a1)) abil[a1] += 2;
  }
  for (const r of [...p.riders, ...p.featRiders]) {
    for (const k of ABILITY_KEYS) abil[k] += r.abilityScoreIncrease[k] ?? 0;
  }
  // Folge-Wahlen: eine choicePrompt-Antwort, die einen Attributsschlüssel liefert → +1
  for (const [id, v] of Object.entries(p.followupAnswers)) {
    if (/ability|attribut|abil/i.test(id) && isAbility(v)) abil[v] += 1;
  }

  // Zauber → byLevel. Gewährte (immer-vorbereitet) → prepared:true. Gelernte:
  // known-Caster → prepared:true (castbar), Magier → prepared:false (nur Zauberbuch).
  const prepared: { level: number; name: string; prepared: boolean }[] = [];
  const pushPrep = (e: { level: number; name: string; prepared: boolean }) => {
    if (!prepared.some((x) => x.name === e.name)) prepared.push(e);
  };
  p.validated.grantedPrepared.forEach((e) => pushPrep({ ...e, prepared: true }));
  p.pickedLearned.forEach((e) => pushPrep({ ...e, prepared: p.learnAsPrepared }));
  const cantrips = [...new Set([...p.pickedCantrips, ...p.validated.grantedCantrips])];

  // Klassen-/Subklassen-Merkmale werden NICHT mehr am Charakter persistiert — sie ergeben
  // sich aus dem Klassen-Link (classes[].sourceKey/subclassKey) + Stufe und werden zur
  // Laufzeit aus der Bibliothek aufgelöst. Die KI-Deutung (featureEffects) bekommt sie
  // weiterhin als Prompt-Input (p.gainedFeatures), nur die Persistenz entfällt.
  // Talent-Referenzen (eigene Links).
  const refsFeats = p.chosenFeats.map((f) => ({ sourceKey: f.key, name: f.name, gainedAt: f.gainedAt, desc: '' }));

  // Fighting Style / Expertise / Profizienzen aus Antworten + Ridern
  let fightingStyle = '';
  const expertiseSkills: string[] = [];
  for (const [id, v] of Object.entries(answers)) {
    if (id.startsWith('fighting_style') && typeof v === 'string') fightingStyle = v;
    if (id.startsWith('expertise') && Array.isArray(v)) expertiseSkills.push(...v);
  }
  const proficiencySkillsAdd = [...new Set([...p.riders, ...p.featRiders].flatMap((r) => r.proficiencies.skills))];

  return {
    summary: p.narrative.summary,
    spellSlotDeltas: delta.spellSlotDelta.slice(0, 9),
    newCantrips: cantrips,
    abilityScoreDeltas: abil,
    hpGain,
    hitDiceNew: bumpHitDice(p.hitDice, delta.hitDie, delta.levelsGained, delta.toLevel),
    classFeaturesAppend: p.narrative.classFeaturesAppend,
    subclass: p.chosenSubclass ? { key: p.chosenSubclass.key, name: p.chosenSubclass.name } : { key: '', name: '' },
    spellcastingClass: delta.casterKind !== 'none' ? delta.klasseName : '',
    preparedSpellsAdd: prepared,
    referencesFeatsAdd: refsFeats,
    expertiseSkills,
    proficiencySkillsAdd,
    fightingStyle,
    classFeaturesRewrite: '', // wird im eigenen KI-Schritt (class-features) gesetzt
  };
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
