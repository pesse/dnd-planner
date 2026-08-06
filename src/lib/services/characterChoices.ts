/**
 * Welche Wahlen schuldet dieser Charakter, und welche sind beantwortet? Die vorhandenen
 * Deklarations-Prädikate fragen nur einen ENTSTEHENDEN Aufstieg — für Altbestand und
 * PDF-Import ist dies der einzige Weg, eine deklarierte Wahl noch zu treffen.
 */
import type { CharacterBackground, CharacterClass, CharacterFeatureEntry, CharacterSpecies } from '$lib/schemas/characterSchema';
import type { Change, FeatureRider } from '$lib/schemas/levelUp';
import { SKILL_NAMES, type SkillName } from '$lib/schemas/vocabulary';
import { skillEnName } from '$lib/domain/skills';
import { totalLevel } from '$lib/schemas/classLevelText';
import type { SpellInfo } from '$lib/spellLibrary';
import { choiceLabelsDe, type AnalysisChoice } from './analysis/types';
import type { CoverageBadge } from './declarationCoverage';
import type { DeclaredFeature } from './declaredFeature';
import {
  declaredClassFeatures, declaredFeatFeatures, declaredSpeciesFeatures, type DeclaredSlotSource,
} from './characterFeatures';
import { chosenOption, isDeclaredChoiceFeature, optionListChoice, optionListRider } from './declaration/optionList';
import {
  spellAccessFacts, spellAccessGrantOf, spellAccessOptions, spellAccessPartChoice, spellAccessParts,
  type SpellAccessFact, type SpellAccessGrant, type SpellAccessPart,
} from './spellcasting/access';
import { expertiseChoice, expertiseRider, isExpertiseFeature } from './declaration/expertise';
import {
  characterPropertyAnswerChanges, characterPropertyChoice, isCharacterPropertyFeature,
} from './characterProperties';
import { riderChanges } from './levelUp/changes';
import { validateRiderSpells } from './levelUp/spells';

/** Ein deklariertes Merkmal + EINE seiner Vergabe-Stufen. */
export interface ChoiceSlot {
  feature: DeclaredFeature;
  /** Nur Beschriftung (Badge-Titel), nie Zuordnung. */
  group: string;
  /** Vergabe-Stufe = zweiter Teil des Ledger-Schlüssels. */
  gainedAt: number;
  /** Maßgebliche Stufe für `options[].spells` (siehe `DeclaredSlotSource.level`). */
  level: number;
  /**
   * Gesetzt = dieser Platz ist eine Wahl der ZAUBER-Deklaration (Liste oder Attribut), nicht
   * die `grantsChoice` des Merkmals. Ein Merkmal kann beides schulden: die Elfenabstammung
   * stellt ihre Zweigwahl UND ihr Zauberattribut.
   */
  access?: { grant: SpellAccessGrant; part: SpellAccessPart };
}

/**
 * Ob dieser Platz den Wert beanspruchen darf. Liste, Attribut und Zweigwahl stehen unter
 * DEMSELBEN `sourceKey` und derselben Vergabe-Stufe — auseinander hält sie nur der Wert.
 */
export function slotClaims(slot: ChoiceSlot, value: string): boolean {
  if (!slot.access) return true;
  const { grant, part } = slot.access;
  return spellAccessOptions(grant, part).some((v) => v.toLowerCase() === value.trim().toLowerCase());
}

/** Eine Festlegung am Merkmal, die kein Platz mehr abfragt (`spellAccessFacts`). */
export interface ChoiceFact extends SpellAccessFact {
  featureKey: string;
  gainedAt: number;
}

export interface ChoiceCollection {
  slots: ChoiceSlot[];
  facts: ChoiceFact[];
}

export interface CharacterChoice {
  slot: ChoiceSlot;
  /** Aus `optionListChoice` / `expertiseChoice` — kein zweiter Erzeuger. */
  choice: AnalysisChoice;
  /** Kanonisch (englisch); leer = OFFEN. */
  answer: string[];
  answerDe: string;
  open: boolean;
  /**
   * Index im übergebenen Ledger, −1 = noch kein Eintrag. Lesen und Schreiben teilen ihn,
   * damit die Zuordnungsregel nicht zweimal existiert.
   */
  entry: number;
}

const splitAnswer = (choice: string): string[] => choice.split(',').map((v) => v.trim()).filter(Boolean);

/** Leer = nicht speicherbar (siehe `buildCharacterChoices`). */
const keyOf = (slot: ChoiceSlot): string => slot.feature.key?.trim() ?? '';

/**
 * Async und getrennt von `buildCharacterChoices`: läge beides in einem Effekt, löste jede
 * Antwort eine neue Bibliotheksauflösung aus. `isDeclaredChoiceFeature` lässt nur die Arten
 * durch, deren Antwort im Merkmals-Ledger landet (Waffenmeisterschaft hat eigenen Picker).
 */
export async function collectChoiceSlots(c: {
  classes?: CharacterClass[];
  species?: CharacterSpecies;
  backgroundRef?: CharacterBackground;
  features?: CharacterFeatureEntry[];
}): Promise<ChoiceCollection> {
  const charLevel = totalLevel(c.classes ?? []) || 1;
  const [cls, species, feats] = await Promise.all([
    declaredClassFeatures(c.classes ?? []),
    declaredSpeciesFeatures(c.species),
    declaredFeatFeatures(c.features, c.backgroundRef, charLevel),
  ]);
  const speciesGroup = c.species?.name?.trim() || 'Volk';
  const sources: DeclaredSlotSource[] = [
    ...cls,
    // Ein Volksmerkmal wird auf Stufe 1 erlangt und liest seine Zauber-Zeilen an der
    // CHARAKTERstufe (Elfenabstammung 1/3/5) — nicht an der einer Klasse.
    ...species.map((feature) => ({ feature, group: speciesGroup, gainedAt: [1], level: charLevel })),
    ...feats,
  ];

  const out: ChoiceSlot[] = [];
  const facts: ChoiceFact[] = [];
  for (const s of sources) {
    const levels = s.gainedAt.filter((l) => l <= s.level).sort((a, b) => a - b);
    // Ohne gepflegte Vergabe-Stufe bleibt Stufe 1 — dieselbe Belegung, die die
    // Wizard-Assembly und `featureChoiceChanges` schreiben.
    const gains = levels.length ? levels : [1];
    const base = { feature: s.feature, group: s.group, level: s.level };
    if (isDeclaredChoiceFeature(s.feature))
      for (const gainedAt of gains) out.push({ ...base, gainedAt });

    // Liste und Attribut fallen laut Regeltext beim ERHALT des Merkmals, also an seiner
    // ersten Vergabe-Stufe. Legt die Quelle die Liste fest („Weiser" ist immer Magier),
    // entsteht kein Platz, sondern eine Feststellung — sonst gälte sie unsichtbar.
    const grant = spellAccessGrantOf(s.feature, {
      specialisation: s.specialisation,
      level: s.level,
      gainedAt: gains[0],
      sourceId: s.sourceId,
    });
    if (!grant) continue;
    for (const part of spellAccessParts(grant))
      out.push({ ...base, gainedAt: gains[0], access: { grant, part } });
    for (const fact of spellAccessFacts(grant))
      facts.push({ ...fact, featureKey: grant.featureKey, gainedAt: grant.gainedAt });
  }
  return { slots: out, facts };
}

/**
 * Ledger-Zuordnung in ZWEI Läufen, und die Reihenfolge ist der ganze Witz: erst alle exakten
 * `(sourceKey, gainedAt)`-Treffer — dieselbe Regel wie der Upsert in `applyChanges` —, dann
 * bekommen offene Plätze die übrigen Einträge ihres Keys. Der zweite Lauf ist der Altbestand:
 * dort fehlt `gainedAt` meist, und ohne ihn wäre eine vorhandene Antwort unsichtbar.
 *
 * Innerhalb eines Laufs kommen die WERT-geprüften Plätze zuerst dran (`slotClaims`): sonst
 * griffe die Zweigwahl der Elfenabstammung das „Intelligence" ihres Zauberattributs, das unter
 * demselben Key und derselben Stufe steht.
 */
export function buildCharacterChoices(
  slots: ChoiceSlot[],
  ctx: { proficient: readonly string[]; ledger: CharacterFeatureEntry[] },
): CharacterChoice[] {
  const used = new Set<number>();
  const entryOf = slots.map(() => -1);
  const claim = (si: number, i: number) => { used.add(i); entryOf[si] = i; };
  // Nur ein Eintrag MIT Antwort ist beanspruchbar — `choice` ist der Diskriminator, sonst
  // überschriebe eine Wahl ihren eigenen Talent-Link (gleicher `sourceKey`). Erst dieser
  // Guard erlaubt es, das VOLLSTÄNDIGE `features` zu übergeben.
  const answered = (e: CharacterFeatureEntry) => !!e.choice.trim();
  const order = slots.map((_, si) => si).sort((a, b) => Number(!slots[a].access) - Number(!slots[b].access));
  for (const exact of [true, false])
    for (const si of order) {
      if (entryOf[si] >= 0) continue;
      const slot = slots[si];
      const key = keyOf(slot);
      const i = ctx.ledger.findIndex(
        (e, j) =>
          !used.has(j) && answered(e) && !!key && e.sourceKey === key &&
          (!exact || e.gainedAt === slot.gainedAt) && slotClaims(slot, e.choice),
      );
      if (i >= 0) claim(si, i);
    }

  const answers = slots.map((_, si) => splitAnswer(entryOf[si] >= 0 ? ctx.ledger[entryOf[si]].choice : ''));

  const out: CharacterChoice[] = [];
  for (const [si, slot] of slots.entries()) {
    const key = keyOf(slot);
    // Ohne Key wäre die Antwort nicht speicherbar (`sourceKey` ist der Anker des Ledgers) —
    // dann ist ein Picker eine Lüge, also gibt es keinen.
    if (!key) continue;

    const answer = answers[si];
    // Belegt sind die Antworten der ANDEREN Expertise-Plätze — NICHT die verdoppelten
    // Fertigkeiten des Bogens: die sind bei genau diesen Charakteren die nie protokollierte
    // Antwort auf DIESE Wahl, ein Filter danach nähme dem Schurken seine zwei Fertigkeiten.
    const already = answers
      .filter((_, j) => j !== si && !slots[j].access && isExpertiseFeature(slots[j].feature))
      .flat();
    const choice = slot.access
      ? spellAccessPartChoice(slot.access.grant, slot.access.part)
      : isExpertiseFeature(slot.feature)
        ? expertiseChoice(slot.feature, ctx.proficient, already)
        : characterPropertyChoice(slot.feature) ?? optionListChoice(slot.feature);
    if (!choice) continue;

    const stored = entryOf[si] >= 0 ? ctx.ledger[entryOf[si]] : undefined;

    out.push({
      slot,
      choice,
      answer,
      answerDe: stored?.choiceDe?.trim() || choiceLabelsDe(choice, answer.join(', ')),
      open: !answer.length,
      entry: entryOf[si],
    });
  }
  return out;
}

export interface ChoiceGrants {
  changes: Change[];
  /** Zaubernamen ohne Bibliothekstreffer — gemeldet, nicht repariert (wie im Aufstieg). */
  flagged: string[];
  /** null = die Option gewährt nichts ODER die Antwort trifft keine Option. */
  rider: FeatureRider | null;
  matched: boolean;
}

/**
 * Antwort → `Change[]` über dieselbe Kette wie der Aufstieg; kein zweiter Wahl-Typ.
 * Gefahrlos wiederholbar: alle so erzeugten Ziele sind idempotent, und das einzige additive
 * Ziel (`ability`) kann hier nicht entstehen — `featureGrantSchema` hat kein Attributsfeld.
 */
export function choiceGrantChanges(ch: CharacterChoice, library: SpellInfo[]): ChoiceGrants {
  const f = ch.slot.feature;
  // Liste und Attribut wirken über die AUFLÖSUNG — `spellcasting/resolve.ts` liest die Antwort
  // aus dem Ledger und verengt die Quelle damit. Es gibt nichts anzuwenden.
  if (ch.slot.access) return { changes: [], flagged: [], rider: null, matched: true };
  // Eine Grundeigenschaft hat keinen Rider — sie ist ein Bogenwert, kein Merkmalseffekt.
  if (isCharacterPropertyFeature(f)) {
    const changes = characterPropertyAnswerChanges([f], () => ch.answer[0] ?? '', {
      step: 'feature-effects',
      source: keyOf(ch.slot),
    });
    return { changes, flagged: [], rider: null, matched: changes.length > 0 };
  }
  const expertise = isExpertiseFeature(f);
  const rider = expertise
    ? expertiseRider(f, ch.answer)
    : optionListRider(f, ch.answer[0] ?? '', ch.slot.level);
  const matched = expertise
    ? ch.answer.some((s) => (SKILL_NAMES as readonly string[]).includes(s))
    : chosenOption(f, ch.answer[0] ?? '') !== null;
  if (!rider) return { changes: [], flagged: [], rider: null, matched };
  const v = validateRiderSpells([rider], library);
  return { changes: riderChanges(v, 'feature-effects'), flagged: v.flagged, rider, matched };
}

/** Was am Platz steht, wenn dort KEIN „Übernehmen" erscheint. */
export function choiceHint(ch: CharacterChoice, g: ChoiceGrants, p: { wouldAlter: boolean }): string {
  if (!ch.answer.length) return '';
  if (ch.slot.access) return '✓ übernommen — wirkt im Zauber-Block';
  if (!g.matched) return 'Diese Antwort passt zu keiner Option — Altbestand oder Tippfehler. Bitte neu wählen.';
  if (p.wouldAlter) return '';
  // Zauber-Kontingent ist kein Bogenfeld: der Zauber-Block zieht es aus den Ridern,
  // ein Knopf dafür täte nichts.
  if (g.rider && (g.rider.extraCantrips || g.rider.extraPreparedCount))
    return 'Zusätzliche Zaubertricks/Zauber dieser Option zählen im Zauber-Block.';
  // `changes` ohne Rider ist der Eigenschafts-Fall (Größe): angewendet, nur nicht über den
  // Rider — ohne diese Bedingung stünde dort „keine deklarierte Mechanik".
  if (!g.rider && !g.changes.length)
    return 'Keine deklarierte Mechanik — die Wirkung deutet die KI beim Aufstieg.';
  return '✓ übernommen';
}

/**
 * Eine GELEERTE Antwort löscht ihren Eintrag: ein Eintrag mit leerem `choice` wäre ein
 * Phantom-Talent-Link, weil `choice` der Diskriminator ist.
 */
export function withChoiceAnswer(
  ledger: CharacterFeatureEntry[],
  ch: CharacterChoice,
  answer: readonly string[],
): CharacterFeatureEntry[] {
  const next = [...ledger];
  const values = answer.map((v) => v.trim()).filter(Boolean);
  if (!values.length) {
    if (ch.entry >= 0) next.splice(ch.entry, 1);
    return next;
  }
  // Genau die Form, die `applyChanges` upsertet — inklusive `gainedAt`, das ein
  // Altbestands-Eintrag damit nachträglich bekommt.
  const entry: CharacterFeatureEntry = {
    sourceKey: keyOf(ch.slot),
    name: '',
    choice: values.join(', '),
    choiceDe: choiceLabelsDe(ch.choice, values.join(', ')),
    gainedAt: ch.slot.gainedAt,
    desc: '',
  };
  if (ch.entry >= 0) next[ch.entry] = entry;
  else next.push(entry);
  return next;
}

/**
 * null, sobald nichts OFFEN ist — „alle getroffen" ist keine Meldung wert. Der `title`
 * listet trotzdem alle Wahlen, damit die getroffenen im Tooltip nachlesbar bleiben.
 */
export function openChoiceBadge(list: CharacterChoice[]): CoverageBadge | null {
  const open = list.filter((c) => c.open);
  if (!open.length) return null;
  const title = list
    .map((c) => `${c.slot.group} · ${c.choice.featureDe}: ${c.open ? 'offen' : c.answerDe}`)
    .join('\n');
  return {
    text: open.length === 1 ? '1 offene Entscheidung' : `${open.length} offene Entscheidungen`,
    title,
    tone: 'open',
  };
}

/**
 * Der Übungsstand des BOGENS als englische SRD-Namen — die Optionsliste jeder
 * Expertise-Wahl, der einzige `kind`, dessen Optionen nicht im Vault stehen können.
 * Hier statt inline in beiden Aufrufern: die Bogen-Schlüsselung ist die Übersetzungsgrenze.
 */
export function sheetSkillProficiencies(
  skills: Record<string, { prof?: boolean; exp?: boolean }> | undefined,
): { prof: SkillName[]; exp: SkillName[] } {
  const prof: SkillName[] = [];
  const exp: SkillName[] = [];
  for (const [key, row] of Object.entries(skills ?? {})) {
    const en = skillEnName(key);
    if (!en || !row?.prof) continue;
    prof.push(en);
    if (row.exp) exp.push(en);
  }
  return { prof, exp };
}
