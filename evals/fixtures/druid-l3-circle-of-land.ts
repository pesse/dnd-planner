/**
 * Fixture: Druide 2 → 3 mit „Zirkel des Landes".
 *
 * Referenzfall für die featureEffects-Eval. Erwartetes Kernverhalten:
 *  - 1. Pass (ohne aufgelöste Wahl): die KI liefert eine Landart-Auswahl als
 *    choicePrompt mit resolvesEffects=true — die Kreissprüche hängen von der Wahl ab,
 *    daher noch KEINE grantedSpells.
 *  - 2. Pass (Landart aufgelöst): die KI liefert die konkreten Kreissprüche als
 *    grantedSpells und hält die Wahl mit resolvesEffects=false fest.
 *
 * Die Werte sind handgeschrieben und portabel (kein Vault/Tauri nötig). Für maximale
 * Treue kann man `circleOfLandFeatures[].desc` durch den echten Merkmalstext aus dem
 * Vault ersetzen (in der App einmal die Ausgabe von `buildFeatureEffectsInput` loggen).
 */
import type { CharacterSummary } from '../../src/lib/services/aiActions/levelUpAction';
import type {
  FeatureClassContext,
  GainedFeature,
} from '../../src/lib/services/aiActions/featureEffectsAction';

export const druidSummary: CharacterSummary = {
  name: 'Thalia Eichenschild',
  classes: [{ name: 'Druide', level: 3, subclassName: 'Zirkel des Landes' }],
  totalLevel: 3,
  abilities: { str: 10, ges: 14, kon: 14, int: 12, wei: 16, cha: 10 },
  mods: { str: 0, ges: 2, kon: 2, int: 1, wei: 3, cha: 0 },
  hitDice: '3d8',
  spellcasting: { class: 'Druide', ability: 'wei', currentSlots: [4, 2] },
};

export const druidClassContext: FeatureClassContext = {
  klasseName: 'Druide',
  casterType: 'FULL',
  casterKind: 'prepared',
  spellcastingAbility: 'wei',
  toLevel: 3,
};

export const circleOfLandFeatures: GainedFeature[] = [
  {
    name: 'Zirkel des Landes',
    source: 'subclass',
    gainedAt: 3,
    key: 'circle-of-the-land',
    desc:
      'Wenn du auf Stufe 3 diesen Zirkel wählst, erhältst du einen zusätzlichen Druiden-Zaubertrick ' +
      'deiner Wahl. Zudem verbindet dich deine mystische Verbindung zum Land mit bestimmten Zaubern: ' +
      'Wähle eine Landart – Trocken (arid), Polar, Gemäßigt oder Tropisch. Du erhältst die dieser ' +
      'Landart zugeordneten Zirkelzauber; sie gelten stets als vorbereitet und zählen nicht gegen die ' +
      'Anzahl der Zauber, die du vorbereiten kannst. Außerdem erhältst du die Aktion „Beistand des Landes".',
  },
];

/**
 * Kanonische Landarten, welche die Optionen der Landart-Auswahl abdecken sollten
 * (SRD 5.2 / 2024). NUR für die weiche „options cover expected"-Assertion.
 * Bitte gegen den eigenen Vault verifizieren.
 */
export const EXPECTED_LAND_TYPES = ['arid', 'polar', 'temperate', 'tropical', 'trocken', 'gemäßigt', 'tropisch'];

/** Landart, die im 2. Pass als getroffene Wahl übergeben wird. */
export const RESOLVED_LAND = 'Gemäßigt';

/**
 * Erwartete immer-vorbereitete Kreissprüche für die gewählte Landart auf Stufe 3
 * (kanonische ENGLISCHE Namen). Vom User zu befüllen.
 * Leer ⇒ es wird nur geprüft, dass ÜBERHAUPT Kreissprüche gewährt wurden.
 */
export const EXPECTED_CIRCLE_SPELLS: string[] = [];
