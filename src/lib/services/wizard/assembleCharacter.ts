/**
 * Setzt aus dem Wizard-Zustand einen vollständigen `Character` zusammen — Schritt für
 * Schritt, deterministische Rechnung und fertige KI-Ergebnisse gemischt. Bewusst OHNE
 * Tauri/Dateizugriff: das Schreiben bleibt am Aufrufer, so bleibt das hier testbar.
 */
import { CHARACTER_VERSION } from '$lib/schemas/characterUpgrades';
import { formatClassLevel, formatSpecies } from '$lib/schemas/classLevelText';
import { type Character } from '$lib/schemas/characterSchema';
import { emptyProficiencies, emptyPersonal } from '$lib/pdf/characterFields';
import { SKILL_DEFS, mod } from '$lib/domain/skills';
import { type AbilityKey } from '$lib/schemas/classProgression';
import { type SkillName } from '$lib/schemas/vocabulary';
import { collectGrants, proficiencyGrantChanges } from '../proficiencyGrants';
import { getSpeciesByKey } from '$lib/speciesLibrary';
import type { Species } from '$lib/schemas/species';
import { getFeats, featDisplayName } from '$lib/featsLibrary';
import { choiceLabelsDe } from '../analysis/types';
import { getProgressionByKey, spellSlotsAt } from '../classProgression';
import type { ClassProgression } from '$lib/schemas/classProgression';
import { getSpellLibrary, resolveSpell } from '$lib/spellLibrary';
import { validateRiderSpells } from '../levelUp/spells';
import { classCastingOffer } from '../spellcasting/classOffer';
import { addExtra, emptySpellcasting, setPicks } from '../spellcasting/write';
import { riderGrantChanges } from '../levelUp/changes';
import { applyChanges } from '../applyChanges';
import { spellAccessNoteLines } from '../spellAccess';
import { declaredGrantChanges } from '../declaration/grants';
import { optionListNoteLines } from '../declaration/optionList';
import { characterPropertyAnswerChanges } from '../characterProperties';
import { forClassFeaturesField } from '../declaredFeature';
import { resolveSizeCat, sizeChoiceId } from '../speciesSize';
import { applyAsi } from './backgroundAsi';
import { equipmentIndex } from './startingEquipment';
import { matchItem, matchWeaponName } from '$lib/itemLibrary';
import { ftToMVal } from '$lib/itemFormat';
import { ABILITY_KEYS, type AbilityScores } from './pointBuy';
import type { CharacterWizard } from './characterWizard.svelte';
import { keySlug } from '$lib/utils/text';

type AnswerLookup = (id: string) => string;

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
    spellcasting: emptySpellcasting(),
    personal: emptyPersonal(),
    proficiencies: emptyProficiencies(),
    masteries: [],
    features: [],
  };
}

function applyLinks(c: Character, w: CharacterWizard): void {
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
}

/**
 * `character.speed` ist eine reine METERZAHL, das Speed-Merkmal liefert Prosa („9 Meter" /
 * „30 feet"). Die englische Fassung wird umgerechnet, sonst stünden 30 Fuß als 30 Meter da.
 */
function metersFromSpeedText(de?: string, en?: string): string {
  const deNum = (de ?? '').match(/\d+(?:[.,]\d+)?/)?.[0];
  if (deNum) return deNum.replace('.', ',');
  const feet = (en ?? '').match(/\d+(?:\.\d+)?/)?.[0];
  return feet ? String(ftToMVal(parseFloat(feet))).replace('.', ',') : '';
}

function applySpeciesSheetValues(c: Character, spec: Species | null, answerOf: AnswerLookup): void {
  const speedTrait = spec?.traits.find((t) => /(_speed$|^speed$)/i.test(t.key) || t.name.toLowerCase() === 'speed');
  c.speed = metersFromSpeedText(speedTrait?.descDe, speedTrait?.desc || spec?.speed);
  c.personal.sizeCat = resolveSizeCat(spec?.traits ?? [], answerOf(sizeChoiceId(spec?.key ?? '')));
}

/**
 * Point-Buy → Hintergrund-ASI → Merkmals-Erhöhungen. Modifikatoren und TP dürfen erst
 * DANACH fallen, sonst rechnen sie mit einem veralteten KON-Mod.
 */
function finalScores(w: CharacterWizard): AbilityScores {
  const scores = applyAsi(w.scores, w.asi);
  const inc = w.effects.result?.riders?.reduce<Record<AbilityKey, number>>(
    (acc, r) => { for (const k of ABILITY_KEYS) acc[k] += r.abilityScoreIncrease[k] ?? 0; return acc; },
    { str: 0, ges: 0, kon: 0, int: 0, wei: 0, cha: 0 },
  );
  return inc ? ABILITY_KEYS.reduce((s, k) => ({ ...s, [k]: s[k] + inc[k] }), scores) : scores;
}

function applyScores(c: Character, scores: AbilityScores): void {
  for (const k of ABILITY_KEYS) {
    c[k] = scores[k];
    c[`${k}Mod` as const] = mod(scores[k]);
  }
}

function applyHitPoints(c: Character, w: CharacterWizard, prog: ClassProgression | null, scores: AbilityScores): void {
  const hitDie = prog?.hitDie ?? 0;
  if (hitDie <= 0) return;
  c.hitDice = `1W${hitDie}`;
  c.hpMax = String(Math.max(1, hitDie + mod(scores.kon) + w.hpPerLevelBonus()));
  c.hpCurrent = c.hpMax;
}

/**
 * Verlinkte Artefakte + eigene Wahl + Rider, alles über EINE Senke (`applyChanges`) — zwei
 * Senken liefen hier schon einmal auseinander und verloren dabei still ganze Übungsarten.
 */
async function applyProficiencies(c: Character, w: CharacterWizard, answerOf: AnswerLookup): Promise<void> {
  const [grants, items] = await Promise.all([
    collectGrants({
      classes: c.classes,
      species: { sourceKey: w.species.sourceKey, subspeciesKey: w.species.subspeciesKey },
      backgroundRef: { sourceKey: w.background.sourceKey },
    }),
    equipmentIndex(),
  ]);
  // Die Zeilen müssen VOR dem Applier stehen: der setzt Häkchen an bestehenden Zeilen,
  // er legt keine an (am Bogen existieren sie immer, hier entstehen sie gerade erst).
  for (const def of SKILL_DEFS) c.skills[def.key] = { value: 0, prof: false, exp: false };

  applyChanges(
    c,
    [
      ...proficiencyGrantChanges(
        {
          // Feste Grants und die getroffene Wahl sind am Charakter dasselbe Häkchen — die
          // Provenienz bleibt in `collectGrants`, nicht am Bogen.
          skills: { fixed: [...grants.skills.map((g) => g.value), ...(w.chosenSkills as SkillName[])], choose: 0, from: [] },
          savingThrows: grants.savingThrows.map((g) => g.value),
          weapons: grants.weapons.map((g) => g.value),
          weaponsOther: grants.weaponsOther.map((g) => g.value),
          armor: grants.armor.map((g) => g.value),
        },
        { step: 'wizard-links', source: 'library-link' },
      ),
      // Der GETTER, nicht das rohe Job-Ergebnis: er hängt die Rider der deklarierten
      // Zweigwahlen an (Urtümlicher Orden → Kriegswaffen), die kein Modell geliefert hat.
      ...riderGrantChanges(w.riders, { step: 'wizard-features', source: 'class-feature' }),
      // Was die Deklaration gewährt, der Rider aber nicht tragen kann. Bewusst NACH
      // `applySpeciesSheetValues`: der deklarierte Wert überschreibt den geparsten.
      ...declaredGrantChanges(w.declared, { step: 'wizard-features', source: 'class-feature' }),
      ...characterPropertyAnswerChanges(w.declared, answerOf, {
        step: 'wizard-features',
        source: 'species-trait',
      }),
    ],
    { classIndex: 0, resolveWeaponName: (name) => matchWeaponName(items, name) },
  );
}

function applySkillValues(c: Character, scores: AbilityScores): void {
  for (const def of SKILL_DEFS) {
    const row = c.skills[def.key];
    const attrMod = mod(scores[def.attr]);
    row.value = row.prof ? attrMod + c.proficiencyBonus * (row.exp ? 2 : 1) : attrMod;
  }
}

/**
 * Aus BEIDEN Kanälen (KI-Analyse und deklarierte Wahlen): der Zauber-Zugang eines Talents ist
 * so dauerhaft wie eine Subklassen-Wahl. Zauber-Wahlen selbst tragen `isBuildDecision: false`
 * — sie stehen im Zauber-Block.
 */
function applyFeatureLedger(c: Character, w: CharacterWizard): void {
  const byId = new Map(w.featureChoices.map((ch) => [ch.id, ch]));
  for (const rc of [...w.resolvedChoices, ...w.declaredAnswers]) {
    const ch = byId.get(rc.id);
    if (!ch?.isBuildDecision || !ch.featureKey) continue;
    // `choice` englisch (Prompt-Kanal späterer Stufen), `choiceDe` als Anzeige.
    c.features.push({
      sourceKey: ch.featureKey,
      name: '',
      choice: rc.choice,
      choiceDe: choiceLabelsDe(ch, rc.choice),
      gainedAt: 1,
      desc: '',
    });
  }
}

/**
 * Die Wahlen des Wizards landen an der Quota, zu der sie gehören — `w.pickedCantrips` &Co. sind
 * bereits `spell.key`, und `offer`/`w.spellPickChoices` tragen ihre Ziel-Quota schon (dasselbe
 * `classCastingOffer`, das der Zauber-Schritt anzeigt; keine zweite Ableitung). Rider-Zauber der
 * KI haben keine Quota und werden quellenloser Bestand.
 */
async function applySpellPicks(c: Character, w: CharacterWizard): Promise<void> {
  const featurePicks = w.spellPickChoices
    .map((ch) => ({ choice: ch, picks: w.featureSpellPicks[ch.id] ?? [] }))
    .filter((entry) => entry.picks.length > 0);
  const hasPicks = w.pickedCantrips.length > 0 || w.pickedKnown.length > 0 || featurePicks.length > 0;
  if (!hasPicks && !w.riders.length) return;

  const offer = await classCastingOffer({
    classKey: w.klass.sourceKey,
    klasseName: w.klass.name,
    subclassKey: w.klass.subclassKey,
    subclassName: w.klass.subclassName,
    level: 1,
  });
  if (offer.cantrips) setPicks(c.spellcasting, offer.cantrips.sourceId, offer.cantrips.quotaId, w.pickedCantrips);
  if (offer.spells) setPicks(c.spellcasting, offer.spells.sourceId, offer.spells.quotaId, w.pickedKnown);
  if (offer.prepared) setPicks(c.spellcasting, offer.prepared.sourceId, offer.prepared.quotaId, w.pickedPrepared);

  for (const { choice, picks } of featurePicks) {
    if (choice.sourceId && choice.quotaId) setPicks(c.spellcasting, choice.sourceId, choice.quotaId, picks);
  }

  if (w.riders.length) {
    const spellLib = await getSpellLibrary();
    const validated = validateRiderSpells(w.riders, spellLib, w.klass.name);
    for (const name of [...validated.grantedCantrips, ...validated.grantedPrepared.map((p) => p.name)]) {
      const key = resolveSpell(spellLib, name, w.klass.name)?.key;
      if (key) addExtra(c.spellcasting, key);
    }
  }
}

/**
 * Ein Kampfstil ist ein echtes Talent, also ein Link per `sourceKey` — NICHT ein bloßer Name
 * wie bei der Waffenbeherrschung. Die Mechanik löst der Bogen wie bei jedem Talent-Link auf.
 */
async function applyFightingStyles(c: Character, w: CharacterWizard): Promise<void> {
  if (!w.fightingStyles.length) return;
  const feats = await getFeats();
  for (const key of w.fightingStyles) {
    const feat = feats.find((f) => f.sourceKey === key);
    c.features.push({ sourceKey: key, name: feat ? featDisplayName(feat) : '', choice: '', choiceDe: '', gainedAt: 1, desc: '' });
  }
}

function applyFeatureText(c: Character, w: CharacterWizard, answerOf: AnswerLookup): void {
  // Der Zugang hat keinen Rider, der eine Notiz schreiben könnte — ohne diese Zeile stünde
  // das gewählte Attribut nirgends auf dem Bogen.
  const accessNotes = spellAccessNoteLines(
    w.spellAccess,
    Object.fromEntries(w.declaredAnswers.map((a) => [a.id, a.choice])),
  );
  // `forClassFeaturesField` ist die EINZIGE Stelle, an der die Herkunft entscheidet.
  const branchNotes = optionListNoteLines(w.declared.filter(forClassFeaturesField), answerOf);
  c.classFeatures = [w.classText.result?.text?.trim() ?? '', ...branchNotes, ...accessNotes]
    .filter(Boolean)
    .join('\n');
  c.personal.rassenmerkmale = w.speciesText.result?.text?.trim() ?? '';
}

async function applyEquipment(c: Character, w: CharacterWizard): Promise<void> {
  const eq = w.selectedEquipment();
  if (!eq.items.length && eq.goldPieces <= 0) return;
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

export async function buildWizardCharacter(w: CharacterWizard): Promise<Character> {
  const c = blankCharacter(w.name.trim() || 'Neuer Charakter');
  const [prog, spec] = await Promise.all([
    getProgressionByKey(w.klass.sourceKey),
    w.species.sourceKey ? getSpeciesByKey(w.species.sourceKey) : Promise.resolve(null),
  ]);
  const answerOf: AnswerLookup = (id) => w.declaredAnswers.find((a) => a.id === id)?.choice ?? '';
  const scores = finalScores(w);

  applyLinks(c, w);
  applySpeciesSheetValues(c, spec, answerOf);
  applyScores(c, scores);
  applyHitPoints(c, w, prog, scores);
  await applyProficiencies(c, w, answerOf);
  applySkillValues(c, scores);
  applyFeatureLedger(c, w);
  await applySpellPicks(c, w);
  c.masteries = [...w.masteries]; // Waffenmeisterschaft: im Wizard gewählt, nichts zu rechnen
  await applyFightingStyles(c, w);
  applyFeatureText(c, w, answerOf);
  await applyEquipment(c, w);

  return c;
}
