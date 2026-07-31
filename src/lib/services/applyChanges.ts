/**
 * Der EINE Applier des gemeinsamen Änderungsformats (`Change`, schemas/levelUp.ts).
 *
 * Vorher lag er als `switch` in `CharacterSheet.svelte` und der Wizard wendete dieselben
 * Daten ein zweites Mal von Hand an (`assembleCharacter`). Jede neue Grant-Art kostete
 * damit zwei Bearbeitungsstellen, und wer die zweite vergaß, bekam keinen Fehler, sondern
 * einen stillen Verlust am Charakter — so sind `weaponProficiency`/`armorTraining` und
 * danach `savingThrows`/`weaponsOther`/`tools`/`languages` aus dem Aufstieg gefallen.
 *
 * Zwei Regeln halten das jetzt zusammen:
 *   1. Beide Flows wenden HIER an. Eine neue Grant-Art ist eine Union-Variante plus ein
 *      Tabelleneintrag — und beide Flows haben sie.
 *   2. `APPLY` ist über `Change['target']` total: eine Variante ohne Eintrag bricht den
 *      Build, statt still nichts zu tun.
 *
 * Additiv, nie überschreibend: numerische Werte werden addiert, damit item-gewährte oder
 * von Hand gesetzte Boni erhalten bleiben. Die Funktion MUTIERT das übergebene Objekt —
 * der Aufrufer klont vorher (Aufstieg: Referenz-Swap fürs Formular-Remount) bzw. baut es
 * gerade erst auf (Wizard).
 */
import type { Character } from '../schemas/characterSchema';
import type { Change } from '../schemas/levelUp';
import { MONSTER_SIZES, type SkillName } from '../schemas/vocabulary';
import { ftToMVal } from '../itemFormat';
import { mod, skillSheetKey } from '../domain/skills';
import { markArmorTraining, markSavingThrow, markWeaponProficiency } from './proficiencyGrants';
import { int } from '$lib/utils/num';

export interface ApplyContext {
  /** Index der Klasse, an der `subclass` landet. */
  classIndex: number;
  /** true = die Klasse wurde gerade angehängt, dann ist es die letzte. */
  isNewClass?: boolean;
  /**
   * Bibliotheks-Key eines Zaubernamens für die Provenienz am Charakter. Fehlt sie, steht
   * der Zauber nur mit Namen da — verlinkt wird dann beim nächsten Öffnen.
   */
  resolveSpellKey?: (name: string) => string | undefined;
}

/** Hängt einen Freitext-Eintrag an, ohne Dubletten (Werkzeuge, Sprachen). */
function pushUnique(list: string[], value: string): void {
  const v = value.trim();
  if (v && !list.includes(v)) list.push(v);
}

/**
 * Ob diese Changes am Charakter noch etwas ändern würden — die Frage hinter einem
 * „Übernehmen"-Knopf, der verschwinden soll, sobald er nichts mehr tut.
 *
 * Geprüft am KLON, nicht an einer handgeführten Liste von Zielfeldern: die wäre die zweite
 * Ausfertigung von `applyChanges` und liefe auseinander, sobald eine Variante dazukommt.
 * Der Aufrufer übergibt einen SNAPSHOT (`$state.snapshot`) — `structuredClone` kann keinen
 * Svelte-Proxy klonen.
 */
export function changesWouldAlter(c: Character, changes: readonly Change[], ctx: ApplyContext): boolean {
  if (!changes.length) return false;
  const before = JSON.stringify(c);
  const next = structuredClone(c);
  applyChanges(next, changes, ctx);
  return JSON.stringify(next) !== before;
}

/** Was ein Handler außer dem Change und dem Charakter noch braucht. */
interface ApplyEnv {
  ctx: ApplyContext;
  /** Bibliotheks-Key eines Zaubernamens als anhängbares Teil-Objekt; leer, wenn unbekannt. */
  spellKey(name: string): { sourceKey?: string };
}

type ChangeOf<T extends Change['target']> = Extract<Change, { target: T }>;

/**
 * Je `Change`-Variante eine Senke. Die Tabelle ist über `Change['target']` TOTAL: eine
 * neue Variante ohne Eintrag ist ein Compile-Fehler — derselbe Riegel wie vorher das
 * `never` im `default`, nur ohne Zweig, den man versehentlich vor dem Riegel verlassen kann.
 */
const APPLY: { [T in Change['target']]: (c: ChangeOf<T>, next: Character, env: ApplyEnv) => void } = {
  // Freitext-Zahl additiv — bewahrt item-/manuelle Boni.
  hpMax: (c, next) => { next.hpMax = String(int(next.hpMax) + c.value); },
  hitDice: (c, next) => { next.hitDice = c.value; },
  proficiencyBonus: (c, next) => { next.proficiencyBonus = c.value; },

  // Additiv — bewahrt item-/manuell gewährte Slots.
  spellSlot: (c, next) => {
    const slot = (next.spells?.slots ?? [])[c.level - 1];
    if (slot) slot.total += c.value;
  },
  cantrip: (c, next, env) => {
    if (next.spells.cantrips.some((e) => e.name === c.name)) return;
    next.spells.cantrips = [...next.spells.cantrips, { name: c.name, ...env.spellKey(c.name) }];
  },
  spellcastingClass: (c, next) => {
    if (!next.spells.spellcastingClass) next.spells.spellcastingClass = c.value;
  },
  preparedSpell: (c, next, env) => {
    if (!c.name.trim()) return;
    const lvl = String(c.level);
    const arr = next.spells.byLevel[lvl] ?? [];
    if (!arr.some((e) => e.name === c.name)) arr.push({ name: c.name, prepared: c.prepared, ...env.spellKey(c.name) });
    next.spells.byLevel[lvl] = arr;
  },

  // Additiv, mit neu gerechnetem Modifikator.
  ability: (c, next) => {
    const score = (next[c.ability] ?? 10) + c.value;
    next[c.ability] = score;
    (next as unknown as Record<string, number>)[`${c.ability}Mod`] = mod(score);
  },

  feat: (c, next) => {
    next.features = [...next.features, { sourceKey: c.sourceKey, name: c.name, choice: '', choiceDe: '', gainedAt: c.gainedAt, desc: '' }];
  },

  // Der Change trägt den ENGLISCHEN SRD-Namen, der Bogen ist deutsch geschlüsselt → hier
  // liegt die Übersetzung. Vorher schlug die Zuweisung still fehl, weil „Animal Handling"
  // nie auf „MitTierenUmgehen" traf.
  //
  // Expertise setzt die Übung mit: regeltechnisch ist sie nur an einer geübten Fertigkeit
  // möglich, und ohne das Häkchen rechnete der Bogen den doppelten Übungsbonus gar nicht.
  expertise: (c, next) => {
    const row = next.skills[skillSheetKey(c.skill as SkillName)];
    if (row) { row.prof = true; row.exp = true; }
  },
  proficiency: (c, next) => {
    const row = next.skills[skillSheetKey(c.skill as SkillName)];
    if (row) row.prof = true;
  },
  // Dieselbe Grenze wie bei den Fertigkeiten; die Abbildung ist geteilt
  // (proficiencyGrants.ts), nicht kopiert.
  weaponProficiency: (c, next) => markWeaponProficiency(next.proficiencies, c.value),
  armorTraining: (c, next) => markArmorTraining(next.proficiencies, c.value),
  savingThrow: (c, next) => markSavingThrow(next, c.value),
  toolProficiency: (c, next) => pushUnique(next.tools, c.value),
  language: (c, next) => pushUnique(next.languages, c.value),

  // Freitextzeile, kommagetrennt und dublettenfrei.
  weaponProficiencyOther: (c, next) => {
    const parts = next.proficiencies.otherWeapons.split(',').map((s) => s.trim()).filter(Boolean);
    pushUnique(parts, c.value);
    next.proficiencies.otherWeapons = parts.join(', ');
  },

  // Grundeigenschaften: SETZEND, nicht additiv — es gibt nur einen Wert, und das Merkmal
  // legt ihn fest. Hier liegt die zweite Übersetzungsgrenze: der Change trägt die
  // Regelsprache (englische Größe, Fuß), der Bogen den deutschen bzw. metrischen Wert.
  sizeCategory: (c, next) => { next.personal.sizeCat = MONSTER_SIZES[c.value]; },
  speedFeet: (c, next) => { next.speed = String(ftToMVal(c.value)).replace('.', ','); },

  // An der (ggf. gerade angehängten) Klasse setzen.
  subclass: (c, next, env) => {
    const cls = env.ctx.isNewClass ? next.classes[next.classes.length - 1] : next.classes[env.ctx.classIndex];
    if (cls && c.key) { cls.subclassKey = c.key; cls.subclassName = c.name; }
  },

  // KI-Volltext ersetzen ODER Freitext anhängen (inkl. Kampfstil).
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

  // Info-Einträge: Klassen-/Subklassen-Merkmale werden aus dem Link abgeleitet, das
  // Fragebogen-Protokoll hat am Charakter kein Ziel.
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
  };
  for (const c of changes) {
    // Die Korrelation Variante↔Handler steht im Typ der Tabelle, TS kann sie an der
    // Aufrufstelle nicht mitziehen — genau ein Cast, hier.
    (APPLY[c.target] as (c: Change, next: Character, env: ApplyEnv) => void)(c, next, env);
  }
}
