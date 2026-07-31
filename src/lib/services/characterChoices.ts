/**
 * Die eine Stelle, die fragt: **welche Wahlen schuldet dieser Charakter, und welche sind
 * beantwortet?**
 *
 * Alle vorhandenen Deklarations-Prädikate (`isOptionListFeature`, `isExpertiseFeature`,
 * `isFlowOwnedDeclaration`) sind Eingangsfilter für die KI-Kette — Fragen an einen
 * ENTSTEHENDEN Aufstieg, nie an einen gespeicherten Charakter. Deshalb war eine deklarierte
 * Wahl bisher nur im Moment ihres Entstehens beantwortbar: wer nie durch den Wizard lief
 * (PDF-Import, Altbestand) oder dessen Deklaration erst später in den Vault kam, hatte keinen
 * Weg, sie zu treffen. Dieses Modul ist dieser Weg.
 *
 * Zwei Hälften, weil die Expertise-Optionen LIVE vom Übungsstand des Formulars abhängen:
 * `collectChoiceSlots` fragt die Bibliothek (async, an den Links hängend),
 * `buildCharacterChoices` verknüpft die Plätze mit Ledger und Häkchen (synchron, ein
 * `$derived`). Wer beides in einen Effekt legte, löste mit jeder Antwort eine neue
 * Bibliotheksauflösung aus.
 *
 * Erzeugt wird KEIN neuer Wahl-Typ: `AnalysisChoice` ist der eine Typ von Oberfläche und
 * Ledger (`declaredChoice.ts`), und die Wirkung läuft über `FeatureRider` →
 * `validateRiderSpells` → `riderChanges` → `applyChanges` — dieselbe Kette wie im Aufstieg.
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
import { expertiseChoice, expertiseRider, isExpertiseFeature } from './declaration/expertise';
import {
  characterPropertyAnswerChanges, characterPropertyChoice, isCharacterPropertyFeature,
} from './characterProperties';
import { riderChanges } from './levelUp/changes';
import { validateRiderSpells } from './levelUp/spells';

/** Ein Wahl-Platz: deklariertes Merkmal + EINE seiner Vergabe-Stufen. */
export interface ChoiceSlot {
  feature: DeclaredFeature;
  /** Anzeigegruppe des Trägers — nur Beschriftung (Badge-Titel), nie Zuordnung. */
  group: string;
  /** Vergabe-Stufe = zweiter Teil des Ledger-Schlüssels. */
  gainedAt: number;
  /** Maßgebliche Stufe für `options[].spells` (siehe `DeclaredSlotSource.level`). */
  level: number;
}

/** Ein Wahl-Platz samt Frage, Antwort und Ledger-Fundstelle. */
export interface CharacterChoice {
  slot: ChoiceSlot;
  /** Aus `optionListChoice` / `expertiseChoice` — kein zweiter Erzeuger. */
  choice: AnalysisChoice;
  /** Kanonisch (englisch); leer = OFFEN. */
  answer: string[];
  /** Anzeigefassung der Antwort (Badge-Titel, Bogen). */
  answerDe: string;
  open: boolean;
  /**
   * Index im übergebenen Ledger, −1 = noch kein Eintrag. Lesen und Schreiben teilen ihn,
   * damit die Zuordnungsregel (unten) nicht zweimal existiert.
   */
  entry: number;
}

/** Die Antwort eines Ledger-Eintrags in ihre kanonischen Werte (so schreibt `answerValues`). */
const splitAnswer = (choice: string): string[] => choice.split(',').map((v) => v.trim()).filter(Boolean);

/** Ledger-Schlüssel eines Platzes; leer = nicht speicherbar (siehe `buildCharacterChoices`). */
const keyOf = (slot: ChoiceSlot): string => slot.feature.key?.trim() ?? '';

/**
 * Alle Wahl-Plätze eines Charakters, aus der Bibliothek aufgelöst.
 *
 * `kind`-Auswahl über `isDeclaredChoiceFeature`: `optionList`, `expertise` und
 * `characterProperty` — die Arten, deren Antwort im Merkmals-Ledger landet. `weaponMastery`
 * hat seinen eigenen Picker, `spellcasting` gehört dem Zauber-Block, `spellAccess`/
 * `featCategory` bleiben draußen.
 */
export async function collectChoiceSlots(c: {
  classes?: CharacterClass[];
  species?: CharacterSpecies;
  backgroundRef?: CharacterBackground;
  features?: CharacterFeatureEntry[];
}): Promise<ChoiceSlot[]> {
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
  for (const s of sources) {
    if (!isDeclaredChoiceFeature(s.feature)) continue;
    const levels = s.gainedAt.filter((l) => l <= s.level).sort((a, b) => a - b);
    // Ohne gepflegte Vergabe-Stufe bleibt Stufe 1 — dieselbe Belegung, die die
    // Wizard-Assembly und `featureChoiceChanges` schreiben.
    for (const gainedAt of levels.length ? levels : [1])
      out.push({ feature: s.feature, group: s.group, gainedAt, level: s.level });
  }
  return out;
}

/**
 * Verknüpft die Plätze mit dem Ledger und dem Übungsstand des Bogens.
 *
 * Ledger-Zuordnung in ZWEI Läufen, und die Reihenfolge ist der ganze Witz: erst alle exakten
 * `(sourceKey, gainedAt)`-Treffer — dieselbe Regel wie der Upsert in `applyChanges`
 * (`case 'featureChoice'`) —, dann bekommen offene Plätze die übrigen Einträge ihres Keys.
 * Der zweite Lauf ist der Altbestand: dort fehlt `gainedAt` meist ganz (und der Aufstieg
 * matcht Spezies-Antworten ohnehin nur am Key). Ohne ihn wäre eine vorhandene Antwort
 * unsichtbar, denn der read-only Chip weicht dem Picker.
 */
export function buildCharacterChoices(
  slots: ChoiceSlot[],
  ctx: { proficient: readonly string[]; ledger: CharacterFeatureEntry[] },
): CharacterChoice[] {
  const used = new Set<number>();
  const entryOf = slots.map(() => -1);
  const claim = (si: number, i: number) => { used.add(i); entryOf[si] = i; };
  // Nur ein Eintrag MIT Antwort ist beanspruchbar — `choice` ist der Diskriminator
  // (`schemas/character.ts`), sonst überschriebe eine Wahl ihren eigenen Talent-Link:
  // der Slot eines Talent-Merkmals trägt denselben `sourceKey` wie sein Link. Erst dieser
  // Guard erlaubt es, das VOLLSTÄNDIGE `features` zu übergeben — und nur dann ist `entry`
  // ein Index ins echte Ledger, das `withChoiceAnswer` reihenfolge-treu schreiben kann.
  const answered = (e: CharacterFeatureEntry) => !!e.choice.trim();
  slots.forEach((slot, si) => {
    const i = ctx.ledger.findIndex((e, j) => !used.has(j) && answered(e) && !!keyOf(slot) && e.sourceKey === keyOf(slot) && e.gainedAt === slot.gainedAt);
    if (i >= 0) claim(si, i);
  });
  slots.forEach((slot, si) => {
    if (entryOf[si] >= 0) return;
    const i = ctx.ledger.findIndex((e, j) => !used.has(j) && answered(e) && !!keyOf(slot) && e.sourceKey === keyOf(slot));
    if (i >= 0) claim(si, i);
  });

  const answers = slots.map((_, si) => splitAnswer(entryOf[si] >= 0 ? ctx.ledger[entryOf[si]].choice : ''));

  const out: CharacterChoice[] = [];
  for (const [si, slot] of slots.entries()) {
    const key = keyOf(slot);
    // Ohne Key wäre die Antwort nicht speicherbar (`sourceKey` ist der Anker des Ledgers) —
    // dann ist ein Picker eine Lüge, also gibt es keinen.
    if (!key) continue;

    const answer = answers[si];
    // Belegt sind die Antworten der ANDEREN Expertise-Plätze — NICHT die verdoppelten
    // Fertigkeiten des Bogens. Bei genau den Charakteren, für die dieses Panel existiert,
    // sind die Häkchen ja die (nur nie protokollierte) Antwort auf DIESE Wahl: filterte man
    // danach, fehlten dem Schurken ausgerechnet die zwei Fertigkeiten, die er nachtragen
    // will. Zwischen zwei Vergaben stapelt Expertise weiterhin nicht — die Antwort der
    // Stufe 1 fällt bei Stufe 6 heraus und bleibt bei Stufe 1 sichtbar.
    const already = answers.filter((_, j) => j !== si && isExpertiseFeature(slots[j].feature)).flat();
    const choice = isExpertiseFeature(slot.feature)
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

/** Die Wirkung einer getroffenen Wahl, samt allem, was der Picker darüber sagen muss. */
export interface ChoiceGrants {
  changes: Change[];
  /** Zaubernamen ohne Bibliothekstreffer — gemeldet, nicht repariert (wie im Aufstieg). */
  flagged: string[];
  /** Die Wirkung; null = die Option gewährt nichts ODER die Antwort trifft keine Option. */
  rider: FeatureRider | null;
  /** Ob die Antwort überhaupt eine Option/geübte Fertigkeit trifft. */
  matched: boolean;
}

/**
 * Antwort → `Change[]`, über die Kette des Aufstiegs.
 *
 * Braucht die Zauberbibliothek, weil eine Abstammungs-Option benannte Zauber gewährt (Elf,
 * Tiefling) — `riderGrantChanges` allein deckte nur die Übungen. Gefahrlos wiederholbar:
 * alle so erzeugten Ziele sind idempotent (Flags setzen, Zauber mit Dedup anhängen). Das
 * einzige additive Ziel in `riderChanges` ist `ability`, und das kann hier nicht entstehen —
 * `featureGrantSchema` hat kein Attributsfeld und `emptyRider` lässt es auf null.
 */
export function choiceGrantChanges(ch: CharacterChoice, library: SpellInfo[]): ChoiceGrants {
  const f = ch.slot.feature;
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

/** Was am Platz steht, wenn dort KEIN „Übernehmen" erscheint — drei ehrliche Fassungen. */
export function choiceHint(ch: CharacterChoice, g: ChoiceGrants, p: { wouldAlter: boolean }): string {
  if (!ch.answer.length) return '';
  if (!g.matched) return 'Diese Antwort passt zu keiner Option — Altbestand oder Tippfehler. Bitte neu wählen.';
  if (p.wouldAlter) return '';
  // Zauber-Kontingent ist kein Bogenfeld: `spellcastingOffer` zieht es aus den Ridern,
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
 * Antwort ins Ledger schreiben. Eine GELEERTE Antwort löscht ihren Eintrag: ein Eintrag mit
 * leerem `choice` wäre ein Phantom-Talent-Link (`choice` ist der Diskriminator,
 * schemas/character.ts).
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
 * Der Zähler an der Merkmals-Leiste — in der Sprache, die die Bibliothekskarten schon
 * sprechen (`CoverageBadge`, gold = offen).
 *
 * null, sobald nichts OFFEN ist: „alle getroffen" ist keine Meldung wert, sondern der
 * Normalfall. Der `title` listet trotzdem alle Wahlen, damit die getroffenen im Tooltip
 * nachlesbar bleiben.
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
 * Expertise-Wahl (der einzige `kind`, dessen Optionen nicht im Vault stehen können).
 *
 * Hier statt inline in beiden Aufrufern (Editor und `LevelUpAssistant`): die deutsche
 * Bogen-Schlüsselung ist genau die Übersetzungsgrenze, an der zwei Fassungen auseinanderlaufen.
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
