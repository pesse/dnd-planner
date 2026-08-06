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
import {
  chosenOptionOf, declaredChoiceRefs, optionActivatesQuota, optionChoiceId, optionListChoice,
  optionListRider,
} from './declaration/optionList';
import { splitChoiceAnswer, type DeclaredChoiceRef } from './declaration/source';
import {
  spellAccessFacts, spellAccessGrantOf, spellAccessOptions, spellAccessPartChoice, spellAccessPartId,
  spellAccessParts, type SpellAccessFact, type SpellAccessGrant, type SpellAccessPart,
} from './spellcasting/access';
import { expertiseChoice, expertiseChoiceId, expertiseRider } from './declaration/expertise';
import {
  skillProficiencyChoice, skillProficiencyChoiceId, skillProficiencyRider,
} from './declaration/skillProficiency';
import { languageChoice, languageChoiceId, languageRider } from './declaration/languages';
import {
  characterPropertyChange, characterPropertyChoice, characterPropertyOptions, propertyChoiceId,
} from './characterProperties';
import { riderChanges } from './levelUp/changes';
import { validateRiderSpells } from './levelUp/spells';

/** EINE deklarierte Wahl + EINE Vergabe-Stufe des Merkmals, das sie stellt. */
export interface ChoiceSlot {
  feature: DeclaredFeature;
  /** Nur Beschriftung (Badge-Titel), nie Zuordnung. */
  group: string;
  /** Vergabe-Stufe = zweiter Teil des Ledger-Schlüssels. */
  gainedAt: number;
  /** Maßgebliche Stufe für `options[].spells` (siehe `DeclaredSlotSource.level`). */
  level: number;
  /** Die `grantsChoice`-Wahl dieses Platzes; fehlt genau dann, wenn `access` steht. */
  declared?: DeclaredChoiceRef<DeclaredFeature>;
  /**
   * Gesetzt = dieser Platz ist eine Wahl der ZAUBER-Deklaration (Liste oder Attribut), nicht
   * die `grantsChoice` des Merkmals. Ein Merkmal kann beides schulden: die Elfenabstammung
   * stellt ihre Zweigwahl UND ihr Zauberattribut.
   */
  access?: { grant: SpellAccessGrant; part: SpellAccessPart };
}

/**
 * Ob dieser Platz einen Wert OHNE gestellte Frage beanspruchen darf (Altbestand, PDF-Import,
 * KI-Deutung). Liste, Attribut und Zweigwahl stehen unter DEMSELBEN `sourceKey` und derselben
 * Vergabe-Stufe — auseinander hält sie dort nur der Wert.
 */
export function slotClaims(slot: ChoiceSlot, value: string): boolean {
  if (!slot.access) return true;
  const { grant, part } = slot.access;
  return spellAccessOptions(grant, part).some((v) => v.toLowerCase() === value.trim().toLowerCase());
}

/**
 * Welche Wahl-Art dieser Platz stellt. EINE Verzweigung für Frage-id und Frage — liefen sie
 * auseinander, stempelte das Schreiben eine id, die das Lesen nie wiederfände.
 */
type SlotKind = 'access' | 'expertise' | 'skillProficiency' | 'languages' | 'property' | 'optionList';

function slotKind(slot: ChoiceSlot): SlotKind | null {
  if (slot.access) return 'access';
  switch (slot.declared?.grant.kind) {
    case 'expertise': return 'expertise';
    case 'skillProficiency': return 'skillProficiency';
    case 'languages': return 'languages';
    case 'characterProperty': return 'property';
    case 'optionList': return 'optionList';
    default: return null;
  }
}

/**
 * Ob der WERT diesen Platz NACHWEIST — die schärfere Fassung von `slotClaims`. Beantworten kann
 * das nur ein geschlossenes Vokabular, und genau daran trennen sich zwei Wahlen desselben
 * Merkmals: der Waldläufer bekommt Expertise (englisches `SKILL_NAMES`) UND zwei Sprachen
 * (deutscher Freitext) unter demselben `sourceKey` und derselben Vergabe-Stufe.
 */
export function slotOwnsValue(slot: ChoiceSlot, value: string): boolean {
  const values = splitChoiceAnswer(value).map((v) => v.toLowerCase());
  const has = (options: readonly string[]) => options.some((o) => values.includes(o.toLowerCase()));
  switch (slotKind(slot)) {
    case 'access': return has(spellAccessOptions(slot.access!.grant, slot.access!.part));
    case 'expertise': case 'skillProficiency': return has(SKILL_NAMES);
    case 'property': return has(characterPropertyOptions(slot.declared!.grant));
    case 'optionList': return has(slot.declared!.grant.options.map((o) => o.value));
    // Sprachen: kein Vokabular, also nie über den Wert — sie greifen erst im Nachsichts-Lauf.
    default: return false;
  }
}

/**
 * Die Kennung der Frage dieses Platzes — derselbe Wert, den `featureChoiceChanges` als
 * `LevelUpQuestion.id` ins Ledger schreibt. Damit hängt eine Antwort an der FRAGE und nicht
 * mehr an ihrer Position: zwei Wahlen desselben Merkmals auf derselben Vergabe-Stufe
 * überschreiben einander nicht.
 */
export function choiceIdOf(slot: ChoiceSlot): string {
  switch (slotKind(slot)) {
    case 'access': return spellAccessPartId(slot.access!.grant, slot.access!.part);
    case 'expertise': return expertiseChoiceId(slot.declared!);
    case 'skillProficiency': return skillProficiencyChoiceId(slot.declared!);
    case 'languages': return languageChoiceId(slot.declared!);
    case 'property': return propertyChoiceId(slot.declared!);
    case 'optionList': return optionChoiceId(slot.declared!);
    default: return '';
  }
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

/** Leer = nicht speicherbar (siehe `buildCharacterChoices`). */
const keyOf = (slot: ChoiceSlot): string => slot.feature.key?.trim() ?? '';

/**
 * Async und getrennt von `buildCharacterChoices`: läge beides in einem Effekt, löste jede
 * Antwort eine neue Bibliotheksauflösung aus. `declaredChoiceRefs` lässt nur die Arten
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
    for (const declared of declaredChoiceRefs(s.feature))
      for (const gainedAt of gains) out.push({ ...base, gainedAt, declared });

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
 * Ledger-Zuordnung in drei Läufen mal zwei, und die Reihenfolge ist der ganze Witz. `id`
 * zuerst: eine gestempelte Antwort nennt ihre Frage selbst, dieselbe Regel wie der Upsert in
 * `applyChanges`. Dann `value` für den Altbestand, der keinen Stempel trägt — er trennt die
 * Plätze eines Merkmals daran, wessen Vokabular den Wert bestätigt („Intelligence" gehört dem
 * Zauberattribut der Elfenabstammung, nicht ihrer Zweigwahl). Zuletzt `loose`: was kein
 * Vokabular kennt, darf trotzdem landen, sonst wäre eine vorhandene Antwort unsichtbar.
 *
 * Im Nachsichts-Lauf kommen die FREITEXT-Plätze zuerst dran: nur für sie ist er gemeint, und
 * sonst nähme die Expertise-Wahl des Waldläufers das „Elbisch" seiner Sprachwahl.
 *
 * `exact` unterscheidet in jedem Lauf die eigene Vergabe-Stufe von einer fremden: Altbestand
 * und PDF-Import führen kein `gainedAt`, und eine geänderte Deklaration verschiebt es.
 *
 * Ein Stempel macht den Eintrag für die beiden Altbestands-Läufe tabu — aber nur, solange es
 * seine Frage noch GIBT. Ohne diese Einschränkung bliebe eine KI-gedeutete Antwort (`choice_…`)
 * für immer lose, sobald das Merkmal später eine Deklaration bekommt.
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
  const asked = new Set(slots.map(choiceIdOf));
  const index = slots.map((_, si) => si);
  const freeText = (si: number) => slotKind(slots[si]) === 'languages';
  const looseOrder = [...index].sort((a, b) => Number(!freeText(a)) - Number(!freeText(b)));
  for (const mode of ['id', 'value', 'loose'] as const)
    for (const exact of [true, false])
      for (const si of mode === 'loose' ? looseOrder : index) {
        if (entryOf[si] >= 0) continue;
        const slot = slots[si];
        const key = keyOf(slot);
        if (!key) continue;
        const id = choiceIdOf(slot);
        const i = ctx.ledger.findIndex((e, j) => {
          if (used.has(j) || !answered(e) || e.sourceKey !== key) return false;
          if (exact && e.gainedAt !== slot.gainedAt) return false;
          if (mode === 'id') return !!e.choiceId && e.choiceId === id;
          if (e.choiceId && asked.has(e.choiceId)) return false;
          return mode === 'value' ? slotOwnsValue(slot, e.choice) : slotClaims(slot, e.choice);
        });
        if (i >= 0) claim(si, i);
      }

  const answers = slots.map((_, si) => splitChoiceAnswer(entryOf[si] >= 0 ? ctx.ledger[entryOf[si]].choice : ''));

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
      .filter((_, j) => j !== si && slots[j].declared?.grant.kind === 'expertise')
      .flat();
    const choice = ((): AnalysisChoice | null => {
      switch (slotKind(slot)) {
        case 'access': return spellAccessPartChoice(slot.access!.grant, slot.access!.part);
        case 'expertise': return expertiseChoice(slot.declared!, ctx.proficient, already);
        // `answer` als `keep`: angewendet steht sie in `ctx.proficient` und fiele sonst aus
        // ihren eigenen Optionen.
        case 'skillProficiency': return skillProficiencyChoice(slot.declared!, ctx.proficient, answer);
        case 'languages': return languageChoice(slot.declared!);
        case 'property': return characterPropertyChoice(slot.declared!);
        case 'optionList': return optionListChoice(slot.declared!);
        default: return null;
      }
    })();
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
  const ref = ch.slot.declared;
  // Liste und Attribut wirken über die AUFLÖSUNG — `spellcasting/resolve.ts` liest die Antwort
  // aus dem Ledger und verengt die Quelle damit. Es gibt nichts anzuwenden.
  if (!ref) return { changes: [], flagged: [], rider: null, matched: true };
  // Eine Grundeigenschaft hat keinen Rider — sie ist ein Bogenwert, kein Merkmalseffekt.
  if (ref.grant.kind === 'characterProperty') {
    const change = characterPropertyChange(ref, ch.answer[0] ?? '', {
      step: 'feature-effects',
      source: keyOf(ch.slot),
    });
    return { changes: change ? [change] : [], flagged: [], rider: null, matched: !!change };
  }
  const { rider, matched } = ((): { rider: FeatureRider | null; matched: boolean } => {
    switch (ref.grant.kind) {
      case 'expertise':
        return {
          rider: expertiseRider(ref, ch.answer),
          matched: ch.answer.some((s) => (SKILL_NAMES as readonly string[]).includes(s)),
        };
      case 'skillProficiency':
        return {
          rider: skillProficiencyRider(ref, ch.answer),
          matched: ch.answer.some((s) => (SKILL_NAMES as readonly string[]).includes(s)),
        };
      // Freitext: es gibt kein Vokabular, an dem eine Antwort vorbeigehen könnte.
      case 'languages':
        return { rider: languageRider(ref, ch.answer), matched: ch.answer.length > 0 };
      default:
        return {
          rider: optionListRider(ref, ch.answer[0] ?? '', ch.slot.level),
          matched: chosenOptionOf(ref, ch.answer[0] ?? '') !== null,
        };
    }
  })();
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
  // Ein Kontingent ist kein Bogenfeld — ein Knopf dafür täte nichts. Vor der Prüfung auf
  // fehlende Mechanik: die Option schaltet eines ein, hat aber oft keinen Rider mehr.
  if (optionActivatesQuota(ch.slot.feature, ch.answer[0] ?? ''))
    return '✓ übernommen — wirkt im Zauber-Block';
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
  // Genau die Form, die `applyChanges` upsertet — inklusive `gainedAt` und `choiceId`, die ein
  // Altbestands-Eintrag damit nachträglich bekommt.
  const entry: CharacterFeatureEntry = {
    sourceKey: keyOf(ch.slot),
    name: '',
    choice: values.join(', '),
    choiceDe: choiceLabelsDe(ch.choice, values.join(', ')),
    choiceId: ch.choice.id,
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
