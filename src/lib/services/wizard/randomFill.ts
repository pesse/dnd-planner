/**
 * Füllt alles Offene im Wizard zufällig, aber spielbar: Attribute nach der Klassentabelle,
 * Fertigkeiten nach den hohen Attributen, empfohlene Talente zuerst. Getroffene Wahlen bleiben.
 * Prosa (Name, Persönlichkeit) bleibt beim Spieler — der Bogen erfindet keine Texte.
 */
import type { CharacterWizard } from './characterWizard.svelte';
import type { OriginCatalog } from './originCatalog';
import { isComplete, primaryAbilityKeys, recommendedScores } from './pointBuy';
import { allowedKeys, isValidAllocation, suggestAsi } from './backgroundAsi';
import { ALIGNMENTS, STANDARD_LANGUAGE_PICKS, STANDARD_LANGUAGES } from './personal';
import { wizardFightingStyleOffer, wizardMasteryOffer, wizardTraitFeatOffers } from './wizardOffers';
import { wizardCastingInput } from './castingDraft';
import { spellStepRows } from './spellRows';
import { toolPickKey } from './characterWizard.svelte';
import { pickOne, preferring, randomChoiceAnswer, rankSkills, shuffled, topUp, type Rng } from './randomPicks';
import { PRESENTATIONS } from '$lib/schemas/characterSchema';
import { SKILL_NAMES } from '$lib/schemas/vocabulary';
import { getToolChoices } from '$lib/itemLibrary';
import { getSpellLibrary, type SpellInfo } from '$lib/spellLibrary';
import { masteryName } from '../weaponMastery';
import { loadSpellcasting } from '../spellcasting/project';
import { groupedSpellcasting } from '../spellcasting/grouped';
import { pickedKeys, setPicks } from '../spellcasting/write';
import { isLanguageChoice } from '../declaration/languages';
import { pickerKnown, pickLevels, pickLibrary, spellCandidates } from '../spellcasting/picker';

/** Je Grundwahl ein Nachladen; mehr Runden braucht keine Kette aus Wahl → neuer Wahl. */
const MAX_ROUNDS = 4;

export async function fillRandom(w: CharacterWizard, catalog: OriginCatalog, rng: Rng = Math.random): Promise<void> {
  fillOrigin(w, catalog, rng);
  if (w.languages.length < STANDARD_LANGUAGE_PICKS)
    w.languages = topUp(w.languages, shuffled(STANDARD_LANGUAGES, rng), STANDARD_LANGUAGE_PICKS);

  const klass = catalog.classes.find((c) => c.key === w.klass.sourceKey) ?? null;
  if (!isComplete(w.scores)) {
    w.abilityMethod = 'standard';
    w.scores = recommendedScores(klass);
  }
  const allowed = allowedKeys(catalog.backgrounds.find((b) => b.key === w.background.sourceKey)?.abilityScores ?? []);
  if (allowed.length && !isValidAllocation(w.asi, allowed)) w.asi = suggestAsi(allowed, primaryAbilityKeys(klass), w.scores);

  w.kickoff();
  await w.settled();
  await fillTraitFeats(w, rng);
  fillSkills(w, rng);
  fillFeatureChoices(w, rng);
  await fillFightingStyles(w, rng);
  await fillMasteries(w, rng);
  await fillTools(w, rng);
  await fillSpells(w, rng);
  if (!w.alignment) w.alignment = pickOne(ALIGNMENTS, rng)?.label ?? '';
}

function fillOrigin(w: CharacterWizard, catalog: OriginCatalog, rng: Rng): void {
  const link = (e: { key?: string; name: string; nameDe?: string } | undefined) =>
    e?.key ? { sourceKey: e.key, name: e.nameDe || e.name } : null;
  if (!w.species.sourceKey) w.species = link(pickOne(catalog.species, rng)) ?? w.species;
  if (!w.background.sourceKey) w.background = link(pickOne(catalog.backgrounds, rng)) ?? w.background;
  if (!w.klass.sourceKey) w.klass = link(pickOne(catalog.classes, rng)) ?? w.klass;
  if (!w.presentation) w.presentation = pickOne(PRESENTATIONS, rng) ?? '';
}

async function fillTraitFeats(w: CharacterWizard, rng: Rng): Promise<void> {
  for (const offer of await wizardTraitFeatOffers(w)) {
    const current = w.traitFeats[offer.featureKey] ?? [];
    const count = Math.min(offer.allowance, offer.options.length);
    if (current.length >= count) continue;
    const ranked = preferring(offer.options.map((o) => o.sourceKey), (k) => offer.recommended.includes(k), rng);
    // Ein Talent kann Deklarationen mitbringen (Begabt) — der Wizard lädt danach neu.
    w.setTraitFeats(offer.featureKey, topUp(current, ranked, count));
  }
  await w.settled();
}

function fillSkills(w: CharacterWizard, rng: Rng): void {
  const choices = w.grants?.choices ?? [];
  const picks = w.skillPicks.map((p) => [...p]);
  const taken = new Set<string>([...w.grantedSkills, ...picks.flat()]);
  // Die engste Liste zuerst: eine freie Wahl (Begabt) nähme ihr sonst die einzigen Optionen.
  const order = choices.map((_, i) => i).sort((a, b) => (choices[a].from.length || Infinity) - (choices[b].from.length || Infinity));
  for (const i of order) {
    const ch = choices[i];
    const open = (ch.from.length ? ch.from : SKILL_NAMES).filter((s) => !taken.has(s));
    picks[i] = topUp(picks[i], rankSkills(open, w.scores, rng), ch.choose);
    picks[i].forEach((s) => taken.add(s));
  }
  w.skillPicks = picks;
}

/** In Runden: eine beantwortete Zauberliste macht erst die Zauber-Wahl dahinter sichtbar. */
function fillFeatureChoices(w: CharacterWizard, rng: Rng): void {
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const answered = new Set(w.declaredAnswers.map((a) => a.id));
    const open = w.plainChoices
      .filter((c) => !answered.has(c.id))
      .map((c) => [c.id, isLanguageChoice(c) ? newLanguages(w, c.max, rng) : randomChoiceAnswer(c, rng)] as const)
      .filter(([, v]) => v.length);
    if (!open.length) return;
    w.choiceAnswers = { ...w.choiceAnswers, ...Object.fromEntries(open) };
  }
}

/** Sprachen sind Freitext; gewürfelt wird unter den Standardsprachen, die noch fehlen. */
function newLanguages(w: CharacterWizard, count: number, rng: Rng): string[] {
  const ids = new Set(w.plainChoices.filter(isLanguageChoice).map((c) => c.id));
  const spoken = new Set([...w.languages, ...w.declaredAnswers.filter((a) => ids.has(a.id)).flatMap((a) => a.choice.split(', '))]);
  return shuffled(STANDARD_LANGUAGES.filter((l) => !spoken.has(l)), rng).slice(0, Math.max(1, count));
}

async function fillFightingStyles(w: CharacterWizard, rng: Rng): Promise<void> {
  const offer = await wizardFightingStyleOffer(w);
  if (w.fightingStyles.length >= offer.allowance) return;
  w.fightingStyles = topUp(w.fightingStyles, shuffled(offer.options.map((o) => o.sourceKey), rng), offer.allowance);
}

/** Waffen aus der Startausrüstung zuerst — die Meisterschaft soll etwas sein, das man trägt. */
async function fillMasteries(w: CharacterWizard, rng: Rng): Promise<void> {
  const offer = await wizardMasteryOffer(w);
  if (w.masteries.length >= offer.allowance) return;
  const carried = new Set(w.selectedEquipment().items.map((i) => i.itemKey));
  const ranked = preferring(offer.weapons, (wpn) => !!wpn.key && carried.has(wpn.key), rng).map(masteryName);
  w.masteries = topUp(w.masteries, ranked, offer.allowance);
}

async function fillTools(w: CharacterWizard, rng: Rng): Promise<void> {
  const picks = { ...w.toolPicks };
  for (const [gi, group] of w.equipmentGroups.entries()) {
    const oi = w.selectedOptionIndex(gi);
    for (const [ii, item] of (group.options[oi]?.items ?? []).entries()) {
      const key = toolPickKey(gi, oi, ii);
      if (!item.choiceFrom || picks[key]) continue;
      const tool = pickOne((await getToolChoices(item.choiceFrom)).filter((t) => t.key), rng);
      if (tool?.key) picks[key] = tool.key;
    }
  }
  w.toolPicks = picks;
}

/**
 * Kontingent für Kontingent, in Runden: die Vorbereitung speist sich aus dem Zauberbuch und
 * hat erst Kandidaten, wenn das gefüllt ist.
 */
async function fillSpells(w: CharacterWizard, rng: Rng): Promise<void> {
  if (!w.spellLib.length) w.spellLib = await getSpellLibrary();
  const lib = w.spellLib;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { state, lookup } = await loadSpellcasting(wizardCastingInput(w));
    const view = groupedSpellcasting(state, lookup);
    let changed = false;
    for (const row of spellStepRows(view)) {
      if (row.fixed) continue;
      const known = pickerKnown(view, row.quota);
      const candidates = spellCandidates(pickLibrary(row.quota, lib), { levels: pickLevels(row.quota), spellClass: row.quota.lists[0] ?? '' });
      changed = topUpQuota(w, row.quota.sourceId, row.quota.quotaId, keysOf(candidates, (k) => !known.has(k), rng), row.count) || changed;
      if (row.prepared) {
        const book = pickedKeys(w.spellcasting, row.quota.sourceId, row.quota.quotaId);
        changed = topUpQuota(w, row.prepared.sourceId, row.prepared.quotaId, shuffled(book, rng), row.prepared.count) || changed;
      }
    }
    if (!changed) break;
  }
  const picks = { ...w.featureSpellPicks };
  for (const c of w.spellPickChoices.filter((ch) => !(ch.sourceId && ch.quotaId))) {
    const candidates = spellCandidates(lib, { levels: c.spellLevels, spellClass: c.spellClass, schools: c.spellSchools });
    picks[c.id] = topUp(picks[c.id] ?? [], keysOf(candidates, () => true, rng), c.max);
  }
  w.featureSpellPicks = picks;
}

const keysOf = (spells: SpellInfo[], preferred: (key: string) => boolean, rng: Rng): string[] =>
  preferring(spells.flatMap((s) => (s.key ? [s.key] : [])), preferred, rng);

function topUpQuota(w: CharacterWizard, sourceId: string, quotaId: string, ranked: string[], count: number): boolean {
  const current = pickedKeys(w.spellcasting, sourceId, quotaId);
  if (current.length >= count) return false;
  const next = topUp(current, ranked, count);
  if (next.length === current.length) return false;
  setPicks(w.spellcasting, sourceId, quotaId, next);
  w.spellcasting = { ...w.spellcasting };
  return true;
}
