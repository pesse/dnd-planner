/**
 * Setzt aus dem Wizard-Zustand einen vollständigen `Character` zusammen — die
 * deterministischen Schritte (Point-Buy, Hintergrund-ASI, Übungen, HP) UND die
 * fertigen KI-Ergebnisse (Merkmalswahlen/-zauber, Merkmals-Text, Ausrüstung).
 *
 * Bewusst OHNE Tauri/Dateizugriff: liefert nur das Objekt. Das Schreiben der
 * `character.json` + `gm-notes.md` bleibt am Aufrufer (Sidebar), der dafür schon
 * `write_file_content` nutzt — so bleibt diese Funktion rein und testbar.
 *
 * Reihenfolge der Attributsrechnung ist tragend: Point-Buy → Hintergrund-ASI →
 * Talent-/Merkmals-Erhöhungen → ERST DANN Modifikatoren und HP (Stufe 1 =
 * Trefferwürfel-Max + KON-Mod), sonst wäre der KON-Mod veraltet.
 */
import {
  CHARACTER_VERSION,
  formatClassLevel,
  formatSpecies,
  type Character,
} from '$lib/schemas/character';
import {
  SKILL_DEFS,
  skillSheetKey,
  mod,
  emptyProficiencies,
  emptyPersonal,
  emptySpells,
} from '$lib/pdf/characterFields';
import { ABILITY_TO_EN, type AbilityKey } from '$lib/schemas/classProgression';
import { readAbilityName, type AbilityName, type SkillName } from '$lib/schemas/shared';
import { collectGrants, markArmorTraining, markWeaponProficiency } from '../proficiencyGrants';
import { getSpeciesByKey } from '$lib/speciesLibrary';
import { getFeats, featDisplayName } from '$lib/featsLibrary';
import { choiceLabelsDe } from '../aiActions/featureEffectsAction';
import { getProgressionByKey, spellSlotsAt } from '../classProgression';
import { getSpellLibrary, buildSpellIndex, matchSpell } from '$lib/spellLibrary';
import { validateRiderSpells } from '../levelUpMachine';
import {
  buildSpellSelection,
  CASTER_ABILITY_DE,
  CASTER_ABILITY_KEY,
  spellAttackBonus,
  spellcastingOffer,
  spellSaveDC,
} from '../spellcasting';
import { spellAccessNoteLines } from '../spellAccess';
import { optionListNoteLines } from '../featureDeclaration';
import { resolveSizeCat, sizeChoiceId } from '../speciesSize';
import { applyAsi } from './backgroundAsi';
import { equipmentIndex } from './startingEquipment';
import { ftToMVal, matchItem } from '$lib/itemLibrary';
import { ABILITY_KEYS, type AbilityScores } from './pointBuy';
import type { CharacterWizard } from './characterWizard.svelte';

/** Englischer SRD-Attributsname → deutscher App-Schlüssel (Umkehrung von ABILITY_TO_EN). */
const KEY_BY_EN = new Map<AbilityName, AbilityKey>(
  (Object.entries(ABILITY_TO_EN) as [AbilityKey, AbilityName][]).map(([key, en]) => [en, key]),
);

/**
 * `character.speed` ist eine reine Meterzahl (der Editor lässt nichts anderes zu, der Bogen
 * hängt das „m" selbst an). Das Speed-Merkmal liefert aber Prosa: „9 Meter" / „30 feet".
 * Die deutsche Seite ist bereits metrisch, die englische wird umgerechnet — sonst stünden
 * 30 Fuß als „30 Meter" im Bogen.
 */
function metersFromSpeedText(de?: string, en?: string): string {
  const deNum = (de ?? '').match(/\d+(?:[.,]\d+)?/)?.[0];
  if (deNum) return deNum.replace('.', ',');
  const feet = (en ?? '').match(/\d+(?:\.\d+)?/)?.[0];
  return feet ? String(ftToMVal(parseFloat(feet))).replace('.', ',') : '';
}

/** Leerer Charakter im aktuellen Schemaformat (wie `Sidebar.createCharacter`). */
function blankCharacter(name: string): Character {
  return {
    _version: CHARACTER_VERSION,
    name,
    classes: [], classLevel: '', playerName: '',
    backgroundRef: { sourceKey: '', name: '' }, background: '',
    species: { sourceKey: '', name: '' }, race: '', xp: '',
    str: 10, ges: 10, kon: 10, int: 10, wei: 10, cha: 10,
    strMod: 0, gesMod: 0, konMod: 0, intMod: 0, weiMod: 0, chaMod: 0,
    ac: '', initiative: '', speed: '', hpMax: '', hpCurrent: '', hpTemp: '',
    proficiencyBonus: 2, passivePerception: '', hitDice: '',
    strSaveProf: false, gesSaveProf: false, konSaveProf: false,
    intSaveProf: false, weiSaveProf: false, chaSaveProf: false,
    skills: {},
    attacks: [],
    classFeatures: '', traits: '', ideals: '', bonds: '', flaws: '',
    languages: [], tools: [], alleskoenner: false,
    currency: { km: '', sm: '', em: '', gm: '', pm: '' },
    inventory: [], inventoryNotes: '', totalWeight: '',
    spells: emptySpells(),
    personal: emptyPersonal(),
    proficiencies: emptyProficiencies(),
    masteries: [],
    features: [],
  };
}

/** Setzt das Übungs-Flag für einen englischen Rettungswurf-Namen (tolerant). */
function applySave(c: Character, en: string): void {
  const ability = readAbilityName(en);
  const key = ability ? KEY_BY_EN.get(ability) : undefined;
  if (key) c[`${key}SaveProf` as const] = true;
}

/** Setzt Waffen-/Rüstungs-Flags additiv. */
/** Markiert eine Fertigkeit als geübt bzw. mit Expertise (englischer Name → Bogen-Schlüssel). */
function markSkill(profSkills: Set<string>, expSkills: Set<string>, en: string, exp = false): void {
  const key = skillSheetKey(en as SkillName);
  profSkills.add(key);
  if (exp) expSkills.add(key);
}

/** Baut den vollständigen Charakter aus dem Wizard-Zustand. */
export async function buildWizardCharacter(w: CharacterWizard): Promise<Character> {
  const c = blankCharacter(w.name.trim() || 'Neuer Charakter');
  const [prog, spec] = await Promise.all([
    getProgressionByKey(w.klass.sourceKey),
    w.species.sourceKey ? getSpeciesByKey(w.species.sourceKey) : Promise.resolve(null),
  ]);

  // ── Links + Anzeige-Strings ──
  c.classes = [{
    sourceKey: w.klass.sourceKey,
    name: w.klass.name,
    ...(w.klass.subclassKey ? { subclassKey: w.klass.subclassKey, subclassName: w.klass.subclassName } : {}),
    level: 1,
  }];
  c.species = {
    sourceKey: w.species.sourceKey,
    name: w.species.name,
    ...(w.species.subspeciesKey ? { subspeciesKey: w.species.subspeciesKey, subspeciesName: w.species.subspeciesName } : {}),
  };
  c.backgroundRef = { sourceKey: w.background.sourceKey, name: w.background.name };
  c.classLevel = formatClassLevel(c.classes);
  c.race = formatSpecies(c.species);
  c.background = w.background.name;

  // ── Bogenwerte der Spezies (deutsch aus den Merkmalen; die Felder selbst sind leer) ──
  const speedTrait = spec?.traits.find((t) => /(_speed$|^speed$)/i.test(t.key) || t.name.toLowerCase() === 'speed');
  c.speed = metersFromSpeedText(speedTrait?.descDe, speedTrait?.desc || spec?.speed);
  const sizeAnswer = w.declaredAnswers.find((a) => a.id === sizeChoiceId(spec?.key ?? ''))?.choice ?? '';
  c.personal.sizeCat = resolveSizeCat(spec?.traits ?? [], sizeAnswer);

  // ── Attribute: Point-Buy → Hintergrund-ASI → (Rider-Erhöhungen weiter unten) ──
  let scores: AbilityScores = applyAsi(w.scores, w.asi);
  const inc = w.effects.result?.riders?.reduce<Record<AbilityKey, number>>(
    (acc, r) => { for (const k of ABILITY_KEYS) acc[k] += r.abilityScoreIncrease[k] ?? 0; return acc; },
    { str: 0, ges: 0, kon: 0, int: 0, wei: 0, cha: 0 },
  );
  if (inc) scores = ABILITY_KEYS.reduce((s, k) => ({ ...s, [k]: s[k] + inc[k] }), scores);

  for (const k of ABILITY_KEYS) {
    c[k] = scores[k];
    c[`${k}Mod` as const] = mod(scores[k]);
  }

  // ── HP Stufe 1 + Trefferwürfel (deterministisch + fortlaufende Merkmals-Effekte) ──
  // Trefferwürfel-Max + KON-Mod + pro-Stufe-Boni (Zäh, Zwergische Zähigkeit) einmal für Stufe 1.
  const hitDie = prog?.hitDie ?? 0;
  if (hitDie > 0) {
    c.hitDice = `1W${hitDie}`;
    c.hpMax = String(Math.max(1, hitDie + mod(scores.kon) + w.hpPerLevelBonus()));
    c.hpCurrent = c.hpMax;
  }

  // ── Übungen: collectGrants (fest) + offene Fertigkeitswahlen + Rider ──
  const profSkills = new Set<string>();
  const expSkills = new Set<string>();

  const grants = await collectGrants({
    classes: c.classes,
    species: { sourceKey: w.species.sourceKey, subspeciesKey: w.species.subspeciesKey },
    backgroundRef: { sourceKey: w.background.sourceKey },
  });
  for (const g of grants.skills) markSkill(profSkills, expSkills, g.value);
  for (const en of w.chosenSkills) markSkill(profSkills, expSkills, en);
  for (const s of grants.savingThrows) applySave(c, s.value);
  for (const wp of grants.weapons) markWeaponProficiency(c.proficiencies, wp.value);
  for (const a of grants.armor) markArmorTraining(c.proficiencies, a.value);
  if (grants.weaponsOther.length)
    c.proficiencies.otherWeapons = grants.weaponsOther.map((x) => x.value).join(', ');

  // ── Merkmals-Effekte (Rider) anwenden ──
  // Der GETTER, nicht das rohe Job-Ergebnis: er hängt die Rider der deklarierten
  // Zweigwahlen an (Urtümlicher Orden → Kriegswaffen), die kein Modell geliefert hat.
  const riders = w.riders;
  for (const r of riders) {
    for (const s of r.proficiencies.skills) markSkill(profSkills, expSkills, s);
    for (const s of r.expertiseSkills) markSkill(profSkills, expSkills, s, true);
    for (const wp of r.proficiencies.weapons) markWeaponProficiency(c.proficiencies, wp);
    for (const a of r.proficiencies.armor) markArmorTraining(c.proficiencies, a);
    for (const s of r.proficiencies.savingThrows) applySave(c, s);
    for (const t of r.proficiencies.tools) if (t.trim() && !c.tools.includes(t)) c.tools.push(t);
    for (const l of r.proficiencies.languages) if (l.trim() && !c.languages.includes(l)) c.languages.push(l);
  }

  // ── Fertigkeitszeilen berechnen (Wert = Attribut-Mod + Übungsbonus, Expertise verdoppelt) ──
  const profBonus = c.proficiencyBonus;
  for (const def of SKILL_DEFS) {
    const prof = profSkills.has(def.key);
    const exp = expSkills.has(def.key);
    const attrMod = mod(scores[def.attr]);
    const value = prof ? attrMod + profBonus * (exp ? 2 : 1) : attrMod;
    c.skills[def.key] = { value, prof, exp };
  }

  // ── Merkmals-Ledger: getroffene Aufbau-Entscheidungen (KI-Analyse UND deklarierte) ──
  // Beide Kanäle, weil beide Aufbau-Entscheidungen sind: der Zauber-Zugang eines Talents
  // (Liste, Attribut) ist so dauerhaft wie eine Subklassen-Wahl. Zauber-Wahlen tragen
  // `isBuildDecision: false` — die gewählten Zauber stehen im Zauber-Block.
  const keyById = new Map(w.featureChoices.map((ch) => [ch.id, ch]));
  for (const rc of [...w.resolvedChoices, ...w.declaredAnswers]) {
    const ch = keyById.get(rc.id);
    // `choice` englisch (Prompt-Kanal späterer Stufen), `choiceDe` als Anzeige.
    if (ch?.isBuildDecision && ch.featureKey)
      c.features.push({
        sourceKey: ch.featureKey,
        name: '',
        choice: rc.choice,
        choiceDe: choiceLabelsDe(ch, rc.choice),
        gainedAt: 1,
        desc: '',
      });
  }

  // ── Zauber-Block: Klassenwerte (det.) → eigene Wahl → gewährte Zauber aus Merkmalen ──
  const slug = w.klass.sourceKey.split('_').pop() ?? '';
  const abilityKey = CASTER_ABILITY_KEY[slug];
  if (prog && prog.casterType !== 'NONE' && abilityKey) {
    const abilityMod = mod(scores[abilityKey]);
    c.spells.spellcastingClass = w.klass.name;
    c.spells.spellcastingAbility = CASTER_ABILITY_DE[abilityKey];
    c.spells.autoCalc = true;
    c.spells.saveDC = spellSaveDC(profBonus, abilityMod);
    c.spells.attackBonus = spellAttackBonus(profBonus, abilityMod);
    c.spells.slots = spellSlotsAt(prog, 1).map((total) => ({ total, used: 0 }));
  }

  // Nur Picks zu Wahlen, die es JETZT noch gibt: wer im Merkmals-Schritt die Zauberliste
  // wechselt (oder dessen Analyse neu lief), lässt sonst die Zauber der alten Liste im
  // Zustand zurück — sie würden hier stumm mit auf den Bogen wandern.
  const livePickIds = new Set(w.spellPickChoices.map((c) => c.id));
  const featurePicks = Object.entries(w.featureSpellPicks)
    .filter(([id]) => livePickIds.has(id))
    .flatMap(([, picks]) => picks);
  const hasPicks =
    w.pickedCantrips.length > 0 || w.pickedKnown.length > 0 || featurePicks.length > 0;
  if (hasPicks || riders.length) {
    // Zauber per Key an die Bibliothek binden (wie inventory[].sourceKey); Namens-Fallback
    // bleibt, wenn kein eindeutiger Key auflöst. Index einmal für beide Zweige.
    const spellLib = await getSpellLibrary();
    const spellIndex = buildSpellIndex(spellLib);
    const linkRef = (name: string): { sourceKey?: string } => {
      const hit = matchSpell(spellIndex, { name });
      const unique = !spellIndex.ambiguous.has(name.trim().toLowerCase());
      return hit?.key && unique ? { sourceKey: hit.key } : {};
    };

    // Die eigene Wahl zuerst — ihre Namen sind bereits kanonisch (aus der Bibliothek
    // gewählt), sie legt also die Vorbereitungs-Markierung fest. Ein Zauber, der DANACH
    // noch als gewährt hereinkommt, überschreibt sie nicht.
    if (hasPicks) {
      const offer = await spellcastingOffer({
        classKey: w.klass.sourceKey,
        klasseName: w.klass.name,
        level: 1,
      });
      const sel = buildSpellSelection({
        regime: offer.regime,
        cantripPicks: w.pickedCantrips,
        knownPicks: w.pickedKnown,
        preparedPicks: w.pickedPrepared,
        featurePicks,
      });
      c.spells.cantrips = sel.cantrips.map((name) => ({ name, ...linkRef(name) }));
      for (const [level, entries] of sel.byLevel)
        c.spells.byLevel[String(level)] = entries.map((e) => ({ name: e.name, prepared: e.prepared, ...linkRef(e.name) }));
    }

    // Gewährte Zauber (Elfenlinie, Domänenzauber …): stets vorbereitet, zählen nicht gegen
    // das Kontingent. Namen kommen vom LLM und müssen erst kanonisiert werden.
    if (riders.length) {
      const validated = validateRiderSpells(riders, spellLib, w.klass.name);
      for (const name of validated.grantedCantrips)
        if (!c.spells.cantrips.some((e) => e.name === name)) c.spells.cantrips.push({ name, ...linkRef(name) });
      for (const { level, name } of validated.grantedPrepared) {
        const lvl = String(level);
        const arr = c.spells.byLevel[lvl] ?? [];
        const seen = arr.find((e) => e.name === name);
        if (seen) seen.prepared = true;
        else arr.push({ name, prepared: true, ...linkRef(name) });
        c.spells.byLevel[lvl] = arr;
      }
    }
  }

  // ── Waffenmeisterschaft (deterministisch, im Wizard gewählt) ──
  c.masteries = [...w.masteries];

  // ── Kampfstile (deterministisch, im Wizard gewählt) → Talent-Links im Merkmals-Ledger ──
  // Ein Kampfstil ist ein echtes Talent (z.B. Verteidigung), daher ein Link per sourceKey —
  // NICHT ein bloßer Name wie bei der Waffenbeherrschung. Die Mechanik löst der Bogen wie
  // bei jedem Talent-Link auf.
  if (w.fightingStyles.length) {
    const feats = await getFeats();
    for (const key of w.fightingStyles) {
      const feat = feats.find((f) => f.sourceKey === key);
      c.features.push({ sourceKey: key, name: feat ? featDisplayName(feat) : '', choice: '', choiceDe: '', gainedAt: 1, desc: '' });
    }
  }

  // ── Merkmals-Text (KI) + die deterministische Zeile deklarierter Zauber-Zugänge ──
  // Dieselbe Funktion wie im Aufstieg: der Zugang hat keinen Rider, der eine Notiz schreiben
  // könnte, und ohne die Zeile stünde das gewählte Attribut nirgends auf dem Bogen.
  const declaredAnswerOf = (id: string): string => w.declaredAnswers.find((a) => a.id === id)?.choice ?? '';
  const accessNotes = spellAccessNoteLines(
    w.spellAccess,
    Object.fromEntries(w.declaredAnswers.map((a) => [a.id, a.choice])),
  );
  const branchNotes = optionListNoteLines(w.optionListFeatures, declaredAnswerOf);
  c.classFeatures = [w.classText.result?.text?.trim() ?? '', ...branchNotes, ...accessNotes]
    .filter(Boolean)
    .join('\n');
  c.personal.rassenmerkmale = w.speciesText.result?.text?.trim() ?? '';

  // ── Ausrüstung (gewählte Optionen der KI-Aufbereitung) ──
  const eq = w.selectedEquipment();
  if (eq.items.length || eq.goldPieces > 0) {
    // Verfehlt der KI-gelieferte Name die Bibliothek, bleibt die Zeile Freitext.
    const index = await equipmentIndex();
    c.inventory = eq.items.map((i) => {
      const lib = matchItem(index, { name: i.name });
      // Mehrdeutig → kein Link: welcher Gleichnamige gemeint ist, entscheidet der Nutzer.
      const unique = !index.ambiguous.has(i.name.trim().toLowerCase());
      return {
        name: i.name,
        ...(lib?.key && unique ? { sourceKey: lib.key } : {}),
        count: i.count > 1 ? String(i.count) : '',
        weight: typeof lib?.weight === 'number' ? String(lib.weight) : '',
      };
    });
    if (eq.goldPieces > 0) c.currency.gm = String(eq.goldPieces);
  }

  return c;
}
