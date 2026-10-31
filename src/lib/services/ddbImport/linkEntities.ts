/**
 * Verknüpft den Import mit der Bibliothek. Erst gelten die Entscheidungen des Spielers, dann
 * `collectLegacyFixes` — derselbe Abgleich, den der Editor für Altbögen anbietet.
 */
import type { Character } from '$lib/schemas/characterSchema';
import type { DdbSheet } from '$lib/schemas/ddbSheet';
import { formatClassLevel, formatSpecies } from '$lib/schemas/classLevelText';
import { displayName, type ItemIndex } from '$lib/itemLibrary';
import { featDisplayName, matchFeatEntry, type FeatEntry } from '$lib/featsLibrary';
import { resolveSpell, type SpellInfo } from '$lib/spellLibrary';
import type { Species } from '$lib/schemas/species';
import type { Background } from '$lib/schemas/background';
import type { ClassProgression } from '$lib/schemas/classProgression';
import { classDisplayName } from '$lib/classLibrary';
import { emptyCombatAdjustments } from '$lib/schemas/combatAdjustment';
import { normName } from '$lib/utils/text';
import { addExtra } from '../spellcasting/write';
import { collectLegacyFixes, type LegacyLinkLibraries, type LegacyLinkTarget } from '../characterLegacyLinks';
import { applyDeclaredChoices } from './declaredChoices';
import { findingId, type FindingLog, type LibraryOption } from './findings';

export type ImportLinkLibraries = Pick<LegacyLinkLibraries, 'classes' | 'species' | 'backgrounds' | 'items' | 'spells'>;

export interface DdbImportLibraries extends ImportLinkLibraries {
  spellList: SpellInfo[];
  feats: FeatEntry[];
  speciesByKey: (key: string) => Promise<Species | null>;
  backgroundByKey: (key: string) => Promise<Background | null>;
  classByKey: (key: string) => Promise<ClassProgression | null>;
}

export interface ImportNote {
  tone: 'ok' | 'warn';
  text: string;
}

interface Named { key?: string; name: string; nameDe?: string }
const entryLabel = (e: Named): string => e.nameDe || e.name;

/** Klasse, Volk, Hintergrund: eine Entscheidung „verknüpfen" setzt den Link vor dem Abgleich. */
function presetLinks(c: Character, libs: DdbImportLibraries, log: FindingLog): void {
  c.classes.forEach((row, i) => {
    const hit = libs.classes.find((e) => e.key && e.key === log.linkedKey(findingId('class', row.name, i)));
    if (hit?.key) { row.sourceKey = hit.key; row.name = classDisplayName(hit); }
  });
  const species = libs.species.find((e) => e.key && e.key === log.linkedKey(findingId('species', c.species.name)));
  if (species?.key) c.species = { sourceKey: species.key, name: entryLabel(species) };
  const bg = libs.backgrounds.find((e) => e.key && e.key === log.linkedKey(findingId('background', c.backgroundRef.name)));
  if (bg?.key) c.backgroundRef = { sourceKey: bg.key, name: entryLabel(bg) };
}

/** Wiederholt, bis nichts mehr zu tun ist: Waffen-Links machen erst Angriffe verlinkbar. */
function runLegacyFixes(c: Character, libs: ImportLinkLibraries): string[] {
  const target: LegacyLinkTarget = {
    classes: c.classes,
    legacyClassLevel: formatClassLevel(c.classes),
    species: c.species,
    backgroundRef: c.backgroundRef,
    inventory: c.inventory,
    features: c.features,
    optionPicks: c.optionPicks,
    spells: undefined,
    dropSpells: () => {},
    spellcasting: c.spellcasting,
    proficiencies: c.proficiencies,
    attacks: c.attacks,
    weaponCtx: { strMod: c.mods.str, dexMod: c.mods.dex, proficiencyBonus: c.proficiencyBonus ?? 2, proficiencies: c.proficiencies },
    hpMax: c.hpMax,
    hpDiceTotal: c.hpDiceTotal,
    combatAdjustments: (c.combatAdjustments ??= emptyCombatAdjustments()),
    splitHitPoints: () => {},
  };
  const full: LegacyLinkLibraries = { ...libs, casting: null, pools: [], hpBasis: null };
  const done: string[] = [];
  for (let round = 0; round < 3; round++) {
    const fixes = collectLegacyFixes(target, full);
    if (!fixes.length) break;
    for (const fix of fixes) { fix.apply(); done.push(fix.label); }
  }
  return done;
}

function sameNamedItems(items: ItemIndex, name: string): LibraryOption[] {
  const nm = normName(name);
  return [...items.byKey.values()]
    .filter((e) => e.key && [e.name, e.name_de].some((n) => normName(n) === nm))
    .map((e) => ({ key: e.key!, label: `${displayName(e)} (${e.name})` }));
}

function reportBaseFindings(c: Character, s: DdbSheet, libs: DdbImportLibraries, log: FindingLog): void {
  c.classes.forEach((row, i) => {
    if (!row.sourceKey) log.add({ id: findingId('class', s.classes[i].name, i), kind: 'class', name: s.classes[i].name, origin: s.classes[i].origin });
  });
  if (!c.species.sourceKey && s.species.name) log.add({ id: findingId('species', s.species.name), kind: 'species', ...s.species });
  if (!c.backgroundRef.sourceKey && s.background.name) log.add({ id: findingId('background', s.background.name), kind: 'background', ...s.background });
  const ddbItems = new Map(s.inventory.map((it) => [normName(it.name), it]));
  for (const line of c.inventory.filter((l) => !l.sourceKey)) {
    const it = ddbItems.get(normName(line.name));
    const candidates = libs.items.ambiguous.has(normName(line.name)) ? sameNamedItems(libs.items, line.name) : [];
    log.add({
      id: findingId('item', line.name), kind: 'item', name: line.name, origin: it?.origin ?? null,
      reason: candidates.length ? 'ambiguous' : 'missing', candidates,
    });
  }
}

/** Nur unter der schon verknüpften Grundklasse — derselbe Name kann bei zwei Klassen vorkommen. */
function applySubclasses(c: Character, s: DdbSheet, libs: DdbImportLibraries, log: FindingLog, notes: ImportNote[]): void {
  c.classes.forEach((row, i) => {
    const sub = s.classes[i]?.subclass;
    if (!sub?.name) return;
    const id = findingId('subclass', sub.name, i);
    const decided = log.linkedKey(id);
    const hit = libs.classes.find((e) => e.key && e.subclassOf === row.sourceKey && (decided
      ? e.key === decided
      : [e.name, e.nameDe ?? ''].some((n) => normName(n) === normName(sub.name))));
    if (hit?.key && row.sourceKey) {
      row.subclassKey = hit.key;
      row.subclassName = classDisplayName(hit);
      if (!decided) notes.push({ tone: 'ok', text: `Unterklasse ${row.subclassName} verknüpft.` });
      return;
    }
    log.add({ id, kind: 'subclass', name: sub.name, origin: sub.origin, context: row.sourceKey });
    if (!log.dropped(id)) row.subclassName = sub.name;
  });
}

/** Das Talent des Hintergrunds kommt über `backgroundRef` und wird nicht doppelt verlinkt. */
async function applyFeats(c: Character, s: DdbSheet, libs: DdbImportLibraries, log: FindingLog, notes: ImportNote[]): Promise<void> {
  const bg = c.backgroundRef.sourceKey ? await libs.backgroundByKey(c.backgroundRef.sourceKey) : null;
  const level = c.classes.reduce((n, k) => n + (k.level ?? 0), 0) || 1;
  // Die Attributserhöhung des Hintergrunds steht bei D&D Beyond unter FEATS, ist aber keins.
  for (const f of s.features.filter((x) => x.section === 'FEATS' && !/Ability Score (Improvements?|Increases?)$/i.test(x.name))) {
    const id = findingId('feat', f.name);
    const decided = log.linkedKey(id);
    const hit = decided
      ? libs.feats.find((e) => e.sourceKey === decided)
      : matchFeatEntry(libs.feats, { name: f.name.replace(/\s*\(.*\)\s*$/, '') });
    if (!hit?.sourceKey) {
      log.add({ id, kind: 'feat', name: f.name, origin: f.origin });
      if (!log.dropped(id)) {
        c.features.push({ sourceKey: '', name: f.name, choice: '', choiceDe: '', choiceId: '', gainedAt: level, desc: f.origin?.desc ?? '' });
      }
      continue;
    }
    if (hit.sourceKey === bg?.featKey) { notes.push({ tone: 'ok', text: `Talent ${featDisplayName(hit)} kommt über den Hintergrund.` }); continue; }
    c.features.push({
      sourceKey: hit.sourceKey, name: featDisplayName(hit), choice: '', choiceDe: '', choiceId: '',
      gainedAt: hit.category === 'Origin' ? 1 : level, desc: '',
    });
    if (!decided) notes.push({ tone: 'ok', text: `Talent ${featDisplayName(hit)} verknüpft.` });
  }
}

/** Liefert die Zauber ohne Link als Absätze für `details.md`. */
function applySpells(c: Character, s: DdbSheet, libs: DdbImportLibraries, log: FindingLog, notes: ImportNote[]): string[] {
  const unlinked: string[] = [];
  let linked = 0;
  for (const sp of s.spells) {
    const id = findingId('spell', sp.name);
    const decided = log.linkedKey(id);
    const key = decided ?? resolveSpell(libs.spellList, sp.name)?.key;
    if (key) { addExtra(c.spellcasting, key); linked++; continue; }
    log.add({ id, kind: 'spell', name: sp.name, origin: sp.origin, context: sp.source });
    if (!log.dropped(id) && !unlinked.some((u) => u.startsWith(`### ${sp.name}\n`))) {
      unlinked.push(`### ${sp.name}\n\n${sp.source ? `Quelle: ${sp.source}\n\n` : ''}${sp.origin.desc}`.trim());
    }
  }
  if (linked) notes.push({ tone: 'warn', text: `${linked} Zauber als Zusatzbestand übernommen — im Editor den Klassen-, Talent- und Volksquellen zuordnen.` });
  if (!s.spells.length && s.spellcastingClasses.length) {
    notes.push({ tone: 'warn', text: `D&D Beyond nennt Zauberwirken (${s.spellcastingClasses.join(', ')}), aber keinen Zauber — im Editor auswählen.` });
  }
  return unlinked;
}

export async function linkEntities(
  c: Character, s: DdbSheet, libs: DdbImportLibraries, log: FindingLog,
): Promise<{ notes: ImportNote[]; spellNotes: string[] }> {
  const notes: ImportNote[] = [];
  presetLinks(c, libs, log);
  for (const label of runLegacyFixes(c, libs)) notes.push({ tone: 'ok', text: label });
  reportBaseFindings(c, s, libs, log);
  applySubclasses(c, s, libs, log, notes);
  c.classLevel = formatClassLevel(c.classes);
  c.race = formatSpecies(c.species);
  c.background = c.backgroundRef.name;
  for (const n of await applyDeclaredChoices(c, s, libs)) notes.push({ tone: 'ok', text: n });
  await applyFeats(c, s, libs, log, notes);
  const spellNotes = applySpells(c, s, libs, log, notes);
  if (s.languages.length) notes.push({ tone: 'warn', text: 'Sprachen stehen englisch wie bei D&D Beyond — bei Bedarf eindeutschen.' });
  return { notes, spellNotes };
}
