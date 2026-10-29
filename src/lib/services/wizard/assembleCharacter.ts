/**
 * Setzt aus dem Wizard-Zustand einen vollständigen `Character` zusammen. Bewusst OHNE
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
import { effectiveProficiencyBonus, getProgressionByKey, spellSlotsAt } from '../classProgression';
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
import { applyFeatureLedger, applyLinks, applyScores, draftScores, featLinks, wizardGrantInput } from './castingDraft';
import { equipmentIndex, startingItemName } from './startingEquipment';
import { applyPersonal } from './personal';
import { matchWeaponName } from '$lib/itemLibrary';
import { ABILITY_KEYS, type AbilityScores } from './pointBuy';
import type { CharacterWizard } from './characterWizard.svelte';
import { keySlug } from '$lib/utils/text';
import { libraryWeightKg } from '$lib/utils/inventoryWeight';

type AnswerLookup = (id: string) => string;

function applySpeciesSheetValues(c: Character, spec: Species | null, answerOf: AnswerLookup): void {
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

/** Das Maximum rechnet sich aus der Würfelsumme; leere aktuelle TP heißen „voll". */
function applyHitPoints(c: Character, prog: ClassProgression | null): void {
  const hitDie = prog?.hitDie ?? 0;
  if (hitDie <= 0) return;
  c.hitDice = `1W${hitDie}`;
  c.hpDiceTotal = hitDie;
}

/**
 * Verlinkte Artefakte + eigene Wahl + Rider, alles über EINE Senke (`applyChanges`) — zwei
 * Senken liefen hier schon einmal auseinander und verloren dabei still ganze Übungsarten.
 */
async function applyProficiencies(c: Character, w: CharacterWizard, answerOf: AnswerLookup): Promise<void> {
  const [grants, items] = await Promise.all([
    collectGrants(wizardGrantInput(w)),
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
          tools: grants.tools.map((g) => g.value),
        },
        { step: 'wizard-links', source: 'library-link' },
      ),
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
    row.value = row.prof ? attrMod + effectiveProficiencyBonus(c) * (row.exp ? 2 : 1) : attrMod;
  }
}

/**
 * Der Zauber-Block ENTSTEHT im Schritt „Zauber", Kontingent für Kontingent
 * (`wizard/spellRows.ts`) — hier wird er nur übernommen. Was keine Quota hat, ist
 * quellenloser Bestand: die gewährten Rider-Zauber und die Zauber einer Wahl, der keine
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
 * Kampfstil und Talent aus einem Speziesmerkmal sind echte Talente, also Links per
 * `sourceKey` — NICHT bloße Namen wie bei der Waffenbeherrschung. Die Mechanik löst der Bogen
 * wie bei jedem Talent-Link auf.
 */
async function applyFeatLinks(c: Character, w: CharacterWizard): Promise<void> {
  const links = featLinks(w);
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
  c.classFeatures = [...branchNotes, ...accessNotes].join('\n');
}

async function applyEquipment(c: Character, w: CharacterWizard): Promise<void> {
  const eq = w.selectedEquipment();
  if (!eq.items.length && eq.goldPieces <= 0) return;
  const index = await equipmentIndex();
  c.inventory = eq.items.map((i) => {
    const lib = index.byKey.get(i.itemKey);
    return {
      name: startingItemName(index, i),
      ...(lib ? { sourceKey: i.itemKey } : {}),
      count: i.count > 1 ? String(i.count) : '',
      weight: libraryWeightKg(lib?.weight),
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
  applyPersonal(c, w);
  applySpeciesSheetValues(c, spec, answerOf);
  applyScores(c, scores);
  applyHitPoints(c, prog);
  await applyProficiencies(c, w, answerOf);
  applySkillValues(c, scores);
  applyFeatureLedger(c, w);
  await applySpellPicks(c, w);
  if (w.presentation) c.presentation = w.presentation;
  c.masteries = [...w.masteries]; // Waffenmeisterschaft: im Wizard gewählt, nichts zu rechnen
  c.optionPicks = w.optionPicks.map((p) => ({ ...p }));
  await applyFeatLinks(c, w);
  applyFeatureText(c, w, answerOf);
  await applyEquipment(c, w);

  return c;
}
