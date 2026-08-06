/**
 * Der EINE Applier des Änderungsformats: BEIDE Flows wenden hier an, und `APPLY` ist über
 * `Change['target']` total — eine Variante ohne Eintrag bricht den Build, statt (wie früher
 * viermal geschehen) still eine Grant-Art zu verlieren.
 *
 * Additiv, nie überschreibend, damit item-gewährte Boni bleiben. MUTIERT das übergebene
 * Objekt — der Aufrufer klont vorher bzw. baut es gerade erst auf.
 */
import type { Character } from '../schemas/characterSchema';
import type { Change } from '../schemas/levelUp';
import { MONSTER_SIZES } from '../schemas/vocabulary';
import { ftToMVal } from '../itemFormat';
import { mod, skillSheetKey } from '../domain/skills';
import { markProficiency, markSavingThrow } from './proficiencyGrants';
import { addIndividualWeapon } from './weaponProficiency';
import { int } from '$lib/utils/num';
import { addExtra, addPick } from './spellcasting/write';

export interface ApplyContext {
  /** Index der Klasse, an der `subclass` landet. */
  classIndex: number;
  /** true = die Klasse wurde gerade angehängt, dann ist es die letzte. */
  isNewClass?: boolean;
  /** Fehlt sie, steht der Zauber nur mit Namen da und wird beim nächsten Öffnen verlinkt. */
  resolveSpellKey?: (name: string) => string | undefined;
  /**
   * Der kanonische Waffenname, falls der Grant eine Waffe NENNT (`matchWeaponName`). Fehlt
   * sie, bleibt jeder Wert Freitext — die Übung fiele also aus, wo eine Waffe gemeint war.
   */
  resolveWeaponName?: (name: string) => string | undefined;
}

/**
 * Ein Zauber ohne Bibliothekstreffer wird NICHT übernommen — gespeichert werden nur Keys.
 * Kennt der Change seine Quota (Wizard-/Aufstiegs-Picker), landet er dort statt im
 * quellenlosen Bestand — Rider und Stufentabellen-Zauber haben keine und bleiben dort.
 */
function addSpell(next: Character, c: { name: string; key?: string; sourceId?: string; quotaId?: string }, env: ApplyEnv): void {
  const key = c.key ?? env.spellKey(c.name).sourceKey;
  if (!key) return;
  if (c.sourceId && c.quotaId) addPick(next.spellcasting, c.sourceId, c.quotaId, key);
  else addExtra(next.spellcasting, key);
}

function pushUnique(list: string[], value: string): void {
  const v = value.trim();
  if (v && !list.includes(v)) list.push(v);
}

/**
 * Geprüft am KLON, nicht an einer Liste von Zielfeldern: die wäre die zweite Ausfertigung von
 * `applyChanges`. Der Aufrufer übergibt einen SNAPSHOT — `structuredClone` kann keinen
 * Svelte-Proxy klonen.
 */
export function changesWouldAlter(c: Character, changes: readonly Change[], ctx: ApplyContext): boolean {
  if (!changes.length) return false;
  const before = JSON.stringify(c);
  const next = structuredClone(c);
  applyChanges(next, changes, ctx);
  return JSON.stringify(next) !== before;
}

interface ApplyEnv {
  ctx: ApplyContext;
  /** Anhängbares Teil-Objekt; leer, wenn der Name unbekannt ist. */
  spellKey(name: string): { sourceKey?: string };
  weaponName(name: string): string | undefined;
}

type ChangeOf<T extends Change['target']> = Extract<Change, { target: T }>;

/** Je `Change`-Variante eine Senke; eine neue Variante ohne Eintrag ist ein Compile-Fehler. */
const APPLY: { [T in Change['target']]: (c: ChangeOf<T>, next: Character, env: ApplyEnv) => void } = {
  hpMax: (c, next) => { next.hpMax = String(int(next.hpMax) + c.value); },
  hitDice: (c, next) => { next.hitDice = c.value; },
  proficiencyBonus: (c, next) => { next.proficiencyBonus = c.value; },

  // Plätze sind abgeleitet; nur die Handeingabe für Klassen ohne Progression wächst mit.
  spellSlot: (c, next) => {
    const totals = next.spellcasting.manual?.slotTotals;
    if (!totals?.length) return;
    totals[c.level - 1] = Math.max(0, (totals[c.level - 1] ?? 0) + c.value);
  },
  cantrip: (c, next, env) => {
    addSpell(next, c, env);
  },
  spellcastingClass: () => {
    /* Die Zauberklasse ergibt sich aus `classes[]` und der Deklaration. */
  },
  preparedSpell: (c, next, env) => {
    addSpell(next, c, env);
  },

  ability: (c, next) => {
    const score = next.abilities[c.ability] + c.value;
    next.abilities[c.ability] = score;
    next.mods[c.ability] = mod(score);
  },

  feat: (c, next) => {
    next.features = [...next.features, { sourceKey: c.sourceKey, name: c.name, choice: '', choiceDe: '', gainedAt: c.gainedAt, desc: '' }];
  },

  // Der Change trägt den ENGLISCHEN SRD-Namen, der Bogen ist deutsch geschlüsselt — hier
  // liegt die Übersetzung. Expertise setzt die Übung mit: ohne das Häkchen rechnet der Bogen
  // den doppelten Übungsbonus gar nicht.
  expertise: (c, next) => {
    const row = next.skills[skillSheetKey(c.skill)];
    if (row) { row.prof = true; row.exp = true; }
  },
  proficiency: (c, next) => {
    const row = next.skills[skillSheetKey(c.skill)];
    if (row) row.prof = true;
  },
  // Dieselbe Grenze; die Abbildung ist geteilt (proficiencyGrants.ts), nicht kopiert.
  weaponProficiency: (c, next) => markProficiency(next.proficiencies, 'weapons', c.value),
  armorTraining: (c, next) => markProficiency(next.proficiencies, 'armor', c.value),
  savingThrow: (c, next) => markSavingThrow(next.saveProfs, c.value),
  toolProficiency: (c, next) => pushUnique(next.tools, c.value),
  language: (c, next) => pushUnique(next.languages, c.value),

  /**
   * Nennt der Grant eine Waffe der Bibliothek, wirkt er NUR als `individualWeapons` — der
   * Freitext daneben hat keine mechanische Wirkung. Prosa („Kriegswaffen mit Finesse")
   * trifft nichts und gehört dorthin, sonst stünde sie auf keinem Bogen. Dieselbe Grenze
   * zieht `weaponsFix` am Altbestand (`matchWeaponName`).
   */
  weaponProficiencyOther: (c, next, env) => {
    const weapon = env.weaponName(c.value);
    if (weapon) {
      addIndividualWeapon(next.proficiencies.individualWeapons, weapon);
      return;
    }
    const parts = next.proficiencies.otherWeapons.split(',').map((s) => s.trim()).filter(Boolean);
    pushUnique(parts, c.value);
    next.proficiencies.otherWeapons = parts.join(', ');
  },

  // Grundeigenschaften: SETZEND, nicht additiv. Zweite Übersetzungsgrenze — der Change trägt
  // Regelsprache (englische Größe, Fuß), der Bogen deutsch und metrisch.
  sizeCategory: (c, next) => { next.personal.sizeCat = MONSTER_SIZES[c.value]; },
  speedFeet: (c, next) => { next.speed = String(ftToMVal(c.value)).replace('.', ','); },

  subclass: (c, next, env) => {
    const cls = env.ctx.isNewClass ? next.classes[next.classes.length - 1] : next.classes[env.ctx.classIndex];
    if (cls && c.key) { cls.subclassKey = c.key; cls.subclassName = c.name; }
  },

  classFeaturesText: (c, next) => {
    next.classFeatures = c.mode === 'replace'
      ? c.value
      : [next.classFeatures, c.value].filter((s) => s && s.trim()).join('\n');
  },

  // Upsert über (Merkmal, Stufe): dieselbe Stufe erneut zu durchlaufen ersetzt den Eintrag,
  // eine zweite Vergabe desselben Merkmals (Expertise 1 und 6) legt einen an.
  featureChoice: (c, next) => {
    if (!c.sourceKey) return;
    const i = next.features.findIndex((e) => e.sourceKey === c.sourceKey && e.gainedAt === c.gainedAt);
    const entry = { sourceKey: c.sourceKey, name: '', choice: c.choice, choiceDe: c.choiceDe, gainedAt: c.gainedAt, desc: '' };
    if (i >= 0) next.features[i] = entry;
    else next.features = [...next.features, entry];
  },

  // Kein Ziel am Charakter: Merkmale kommen aus dem Link, das Protokoll ist reine Info.
  featureGained: () => {},
  note: () => {},
};

export function applyChanges(next: Character, changes: readonly Change[], ctx: ApplyContext): void {
  const env: ApplyEnv = {
    ctx,
    spellKey: (name) => {
      const key = ctx.resolveSpellKey?.(name);
      return key ? { sourceKey: key } : {};
    },
    weaponName: (name) => ctx.resolveWeaponName?.(name),
  };
  for (const c of changes) {
    // TS zieht die Korrelation Variante↔Handler an der Aufrufstelle nicht mit — ein Cast.
    (APPLY[c.target] as (c: Change, next: Character, env: ApplyEnv) => void)(c, next, env);
  }
}
