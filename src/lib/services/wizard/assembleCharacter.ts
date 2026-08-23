/**
 * Setzt aus dem Wizard-Zustand einen vollständigen `Character` zusammen — Schritt für
 * Schritt, deterministische Rechnung und fertige KI-Ergebnisse gemischt. Bewusst OHNE
 * Tauri/Dateizugriff: das Schreiben bleibt am Aufrufer, so bleibt das hier testbar.
 */
import { characterSchema, type Character } from '$lib/schemas/characterSchema';
import { SKILL_DEFS, mod } from '$lib/domain/skills';
import { type AbilityKey } from '$lib/schemas/abilities';
import { type SkillName } from '$lib/schemas/vocabulary';
import { collectGrants, proficiencyGrantChanges } from '../proficiencyGrants';
import { getSpeciesByKey } from '$lib/speciesLibrary';
import type { Species } from '$lib/schemas/species';
import { getFeats, featDisplayName } from '$lib/featsLibrary';
import { getProgressionByKey, spellSlotsAt } from '../classProgression';
import type { ClassProgression } from '$lib/schemas/classProgression';
import { getSpellLibrary, resolveSpell } from '$lib/spellLibrary';
import { validateRiderSpells } from '../levelUp/spells';
import { addExtra, cloneSpellcasting, pruneSpellcasting } from '../spellcasting/write';
import { riderGrantChanges } from '../levelUp/changes';
import { applyChanges } from '../applyChanges';
import { spellAccessNoteLines } from '../spellcasting/access';
import { declaredGrantChanges } from '../declaration/grants';
import { abilityIncreasesOf, cappedScore } from '../declaration/abilityIncrease';
import { optionListNoteLines } from '../declaration/optionList';
import { characterPropertyAnswerChanges } from '../characterProperties';
import { forClassFeaturesField } from '../declaredFeature';
import { resolveSizeCat, sizeChoiceId } from '../speciesSize';
import { applyFeatureLedger, applyLinks, applyScores, draftScores, fightingStyleLinks } from './castingDraft';
import { equipmentIndex } from './startingEquipment';
import { matchItem, matchWeaponName } from '$lib/itemLibrary';
import { ftToMVal } from '$lib/itemFormat';
import { ABILITY_KEYS, type AbilityScores } from './pointBuy';
import type { CharacterWizard } from './characterWizard.svelte';
import { keySlug } from '$lib/utils/text';

type AnswerLookup = (id: string) => string;

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
  const scores = { ...draftScores(w) };
  // Dieselbe Senke wie im Aufstieg (`riderChanges` → `APPLY.ability`), Deckelung inklusive.
  for (const inc of abilityIncreasesOf(w.riders))
    scores[inc.ability] = cappedScore(scores[inc.ability], inc.value, inc.max || undefined);
  return scores;
}

function applyHitPoints(c: Character, w: CharacterWizard, prog: ClassProgression | null, scores: AbilityScores): void {
  const hitDie = prog?.hitDie ?? 0;
  if (hitDie <= 0) return;
  c.hitDice = `1W${hitDie}`;
  c.hpMax = String(Math.max(1, hitDie + mod(scores.con) + w.hpPerLevelBonus()));
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
          // Werkzeuge sammelt `collectGrants` nicht: sie stehen am MERKMAL und reisen
          // deshalb über dessen Rider (`riderGrantChanges` weiter unten).
          tools: [],
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
 * Der Zauber-Block ENTSTEHT im Schritt „Zauber", Kontingent für Kontingent
 * (`wizard/spellRows.ts`) — hier wird er nur übernommen. Was keine Quota hat, ist
 * quellenloser Bestand: die gewährten Rider-Zauber und die Zauber einer KI-Wahl, der keine
 * Deklaration eine Quota mitgibt.
 */
async function applySpellPicks(c: Character, w: CharacterWizard): Promise<void> {
  c.spellcasting = pruneSpellcasting(cloneSpellcasting(w.spellcasting));

  const looseKeys = w.spellPickChoices
    .filter((ch) => !(ch.sourceId && ch.quotaId))
    .flatMap((ch) => w.featureSpellPicks[ch.id] ?? []);
  for (const key of looseKeys) addExtra(c.spellcasting, key);

  if (!w.riders.length) return;
  const spellLib = await getSpellLibrary();
  const validated = validateRiderSpells(w.riders, spellLib, w.klass.name);
  for (const name of [...validated.grantedCantrips, ...validated.grantedPrepared.map((p) => p.name)]) {
    const key = resolveSpell(spellLib, name, w.klass.name)?.key;
    if (key) addExtra(c.spellcasting, key);
  }
}

/**
 * Ein Kampfstil ist ein echtes Talent, also ein Link per `sourceKey` — NICHT ein bloßer Name
 * wie bei der Waffenbeherrschung. Die Mechanik löst der Bogen wie bei jedem Talent-Link auf.
 */
async function applyFightingStyles(c: Character, w: CharacterWizard): Promise<void> {
  const links = fightingStyleLinks(w);
  if (!links.length) return;
  const feats = await getFeats();
  for (const link of links) {
    const feat = feats.find((f) => f.sourceKey === link.sourceKey);
    c.features.push({ ...link, name: feat ? featDisplayName(feat) : '' });
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
  const c = characterSchema.parse({ name: w.name.trim() || 'Neuer Charakter' });
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
  c.optionPicks = w.optionPicks.map((p) => ({ ...p }));
  await applyFightingStyles(c, w);
  applyFeatureText(c, w, answerOf);
  await applyEquipment(c, w);

  return c;
}
