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
 *      `case` — und beide Flows haben sie.
 *   2. Der `default`-Zweig ist ein `never`-Riegel: eine Variante ohne `case` bricht den
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
import { skillSheetKey } from '../pdf/characterFields';
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

export function applyChanges(next: Character, changes: readonly Change[], ctx: ApplyContext): void {
  const spellKey = (name: string): { sourceKey?: string } => {
    const key = ctx.resolveSpellKey?.(name);
    return key ? { sourceKey: key } : {};
  };

  for (const c of changes) {
    switch (c.target) {
      case 'hpMax': // Freitext-Zahl additiv (bewahrt item-/manuelle Boni)
        next.hpMax = String(int(next.hpMax) + c.value);
        break;
      case 'hitDice':
        next.hitDice = c.value;
        break;
      case 'proficiencyBonus':
        next.proficiencyBonus = c.value;
        break;
      case 'spellSlot': { // additiv — bewahrt item-/manuell gewährte Slots
        const slots = next.spells?.slots ?? [];
        const i = c.level - 1;
        if (slots[i]) slots[i].total += c.value;
        break;
      }
      case 'cantrip':
        if (!next.spells.cantrips.some((e) => e.name === c.name))
          next.spells.cantrips = [...next.spells.cantrips, { name: c.name, ...spellKey(c.name) }];
        break;
      case 'spellcastingClass':
        if (!next.spells.spellcastingClass) next.spells.spellcastingClass = c.value;
        break;
      case 'ability': { // additiv + Modifikator neu berechnen
        const score = (next[c.ability] ?? 10) + c.value;
        next[c.ability] = score;
        (next as unknown as Record<string, number>)[`${c.ability}Mod`] = Math.floor((score - 10) / 2);
        break;
      }
      case 'preparedSpell': { // → spells.byLevel (Dedup je Grad)
        if (!c.name.trim()) break;
        const lvl = String(c.level);
        const arr = next.spells.byLevel[lvl] ?? [];
        if (!arr.some((e) => e.name === c.name)) arr.push({ name: c.name, prepared: c.prepared, ...spellKey(c.name) });
        next.spells.byLevel[lvl] = arr;
        break;
      }
      case 'feat': // Talent-Link → Merkmals-Ledger
        next.features = [...next.features, { sourceKey: c.sourceKey, name: c.name, choice: '', choiceDe: '', gainedAt: c.gainedAt, desc: '' }];
        break;
      // Der Change trägt den ENGLISCHEN SRD-Namen (geschlossenes Vokabular aus dem
      // Rider-Schema); der Bogen ist deutsch geschlüsselt → hier übersetzen. Vorher
      // schlug die Zuweisung still fehl, weil „Animal Handling" nie auf
      // „MitTierenUmgehen" traf.
      // Expertise setzt die Übung mit: sie ist regeltechnisch nur an einer geübten
      // Fertigkeit möglich, und ohne das Häkchen rechnete der Bogen den doppelten
      // Übungsbonus gar nicht (Wert = Attribut-Mod, wenn `prof` fehlt).
      case 'expertise': {
        const key = skillSheetKey(c.skill as SkillName);
        if (next.skills[key]) {
          next.skills[key].prof = true;
          next.skills[key].exp = true;
        }
        break;
      }
      case 'proficiency': {
        const key = skillSheetKey(c.skill as SkillName);
        if (next.skills[key]) next.skills[key].prof = true;
        break;
      }
      // Wie bei den Fertigkeiten: der Change trägt das englische Vokabular, der Bogen
      // deutsche Flags — die Abbildung ist geteilt (proficiencyGrants.ts), nicht kopiert.
      case 'weaponProficiency':
        markWeaponProficiency(next.proficiencies, c.value);
        break;
      case 'armorTraining':
        markArmorTraining(next.proficiencies, c.value);
        break;
      // Grundeigenschaften: SETZEND, nicht additiv — es gibt nur einen Wert, und das Merkmal
      // legt ihn fest. Hier liegt die Übersetzungsgrenze: der Change trägt die Regelsprache
      // (englische Größe, Fuß), der Bogen den deutschen bzw. metrischen Wert.
      case 'sizeCategory':
        next.personal.sizeCat = MONSTER_SIZES[c.value];
        break;
      case 'speedFeet':
        next.speed = String(ftToMVal(c.value)).replace('.', ',');
        break;
      case 'savingThrow':
        markSavingThrow(next, c.value);
        break;
      case 'toolProficiency':
        pushUnique(next.tools, c.value);
        break;
      case 'language':
        pushUnique(next.languages, c.value);
        break;
      case 'weaponProficiencyOther': { // Freitextzeile, kommagetrennt und dublettenfrei
        const parts = next.proficiencies.otherWeapons.split(',').map((s) => s.trim()).filter(Boolean);
        pushUnique(parts, c.value);
        next.proficiencies.otherWeapons = parts.join(', ');
        break;
      }
      case 'subclass': { // an der (ggf. gerade angehängten) Klasse setzen
        const cls = ctx.isNewClass ? next.classes[next.classes.length - 1] : next.classes[ctx.classIndex];
        if (cls && c.key) { cls.subclassKey = c.key; cls.subclassName = c.name; }
        break;
      }
      case 'classFeaturesText': // KI-Volltext ersetzen ODER Freitext anhängen (inkl. Kampfstil)
        if (c.mode === 'replace') next.classFeatures = c.value;
        else next.classFeatures = [next.classFeatures, c.value].filter((s) => s && s.trim()).join('\n');
        break;
      case 'featureChoice': {
        // Upsert über (Merkmal, Stufe): dieselbe Stufe erneut zu durchlaufen ersetzt den
        // Eintrag, eine zweite Vergabe desselben Merkmals (Expertise 1 und 6) legt einen an.
        if (!c.sourceKey) break;
        const i = next.features.findIndex((e) => e.sourceKey === c.sourceKey && e.gainedAt === c.gainedAt);
        const entry = { sourceKey: c.sourceKey, name: '', choice: c.choice, choiceDe: c.choiceDe, gainedAt: c.gainedAt, desc: '' };
        if (i >= 0) next.features[i] = entry;
        else next.features = [...next.features, entry];
        break;
      }
      case 'featureGained':
        break; // Info-Eintrag — keine Anwendung (Klassen-/Subklassen-Merkmale aus Link abgeleitet)
      case 'note':
        break; // Info-Eintrag (Protokoll des Fragebogens) — kein Ziel am Charakter
      default: {
        // Der Riegel: eine neue `Change`-Variante ohne `case` ist ab hier ein Compile-Fehler.
        const unhandled: never = c;
        void unhandled;
      }
    }
  }
}
