/**
 * Führt ein Charakter DIESE Waffe geübt? Zwei Wege sagen ja, und weil drei Stellen
 * dieselbe Frage stellen (Waffenbeherrschungs-Auswahl, Angriffs-Übungsbonus, Anzeige der
 * beherrschten Waffen im Bogen), liegt der Abgleich hier statt dreimal daneben.
 *
 *   - die Kategorie-Häkchen `simpleWeapons`/`martialWeapons`
 *   - `individualWeapons`: einzeln erklärte Waffen. Der Schurke ist nur mit einfachen
 *     Waffen geübt, dazu aber mit dem Kurzschwert (Kriegswaffe) — die zwei Booleans
 *     können das nicht ausdrücken.
 *
 * `otherWeapons` bleibt Freitext OHNE mechanische Wirkung: Prosa wie „Kriegswaffen mit
 * Finesse" ist keine Waffenliste. Wer Wirkung will, nennt die Waffe einzeln.
 *
 * Die Namensmenge darunter (`weaponNameSet`/`coversWeapon`) ist bewusst neutral: die
 * Waffenbeherrschung (`character.masteries`) stellt dieselbe Frage über eine andere
 * Liste — ein Matcher, zwei Listen.
 */

const normName = (s: string): string => s.trim().toLowerCase();

/** Eine Waffe, so weit sie zum Abgleich taugt — `ItemInfo` und `Item` erfüllen das strukturell. */
export interface WeaponLike {
  name: string;
  name_de?: string;
  index?: string;
  weapon_category?: string;
}

/** Aufgelöste Waffennamen: die Namen selbst plus die Waffenarten (`index`) dahinter. */
export interface WeaponNameSet {
  names: Set<string>;
  indexes: Set<string>;
}

/**
 * Der `index` ist der Zweck: gemeint ist die Waffenart, also zählt auch jedes magische
 * Stück derselben Art dazu.
 */
export function weaponNameSet(
  names: readonly string[],
  byName: (name: string) => { index?: string } | undefined,
): WeaponNameSet {
  const set: WeaponNameSet = { names: new Set(), indexes: new Set() };
  for (const n of names) {
    set.names.add(normName(n));
    const index = byName(n)?.index;
    if (index) set.indexes.add(index);
  }
  return set;
}

/**
 * Beide Namensseiten, weil ein Eintrag deutsch oder englisch geführt sein kann —
 * dieselbe Unschärfe wie beim Inventar, aber an EINER Stelle behandelt.
 */
export function coversWeapon(set: WeaponNameSet, item: WeaponLike): boolean {
  return (
    (!!item.index && set.indexes.has(item.index)) ||
    set.names.has(normName(item.name)) ||
    (!!item.name_de && set.names.has(normName(item.name_de)))
  );
}

/** Die Waffen-Seite von `ProficiencyFlags`; ein `Character` erfüllt sie strukturell. */
export interface WeaponProficiencies {
  simpleWeapons?: boolean;
  martialWeapons?: boolean;
  individualWeapons?: readonly string[];
}

/**
 * Übung mit einer einzelnen Waffe: Kategorie ODER ausdrückliche Nennung.
 *
 * `byName` löst die genannten Namen zur Waffenart auf und ist optional — ohne Item-Index
 * greift nur der Namensvergleich, was für Aufrufer reicht, die ohnehin Basiswaffen
 * durchgehen. Die Menge wird pro Aufruf gebaut: `individualWeapons` ist eine Handvoll
 * Einträge, und ein zweiter Parameter neben `prof` wäre eine zweite Wahrheit.
 */
export function isProficientWithWeapon(
  prof: WeaponProficiencies | undefined,
  item: WeaponLike,
  byName: (name: string) => { index?: string } | undefined = () => undefined,
): boolean {
  if (prof?.simpleWeapons && item.weapon_category === 'Simple') return true;
  if (prof?.martialWeapons && item.weapon_category === 'Martial') return true;
  const individual = prof?.individualWeapons ?? [];
  return individual.length > 0 && coversWeapon(weaponNameSet(individual, byName), item);
}
