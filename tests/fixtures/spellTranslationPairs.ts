/**
 * EN/DE-Zauberpaare mit BEKANNTEM Befund — Prüfstand für den Richter-Prompt.
 *
 * Die Texte sind eingefroren statt aus dem Vault geladen: die defekten Fassungen werden
 * repariert, sobald der Sweep läuft, und ein mitwanderndes Fixture würde lautlos zur
 * Negativ-Kontrolle. Der Satz deckt beide Fehlerrichtungen (Auslassung wie quellenloser
 * Zusatz) und die Falle, an der Richter scheitern: `enlarge-alt` ist flüssiges Deutsch mit
 * Regelabweichung, `enlarge-neu` holpriges und vollständiges. Wer nach Sprachgefühl urteilt,
 * dreht die beiden genau falsch.
 */

/** Ein Prüffall: englischer Quelltext, deutsche Fassung, erwartete Bewertung. */
export interface TranslationPair {
  /** Stabiler Schlüssel (Report/Assertion-Label). */
  id: string;
  /** Zaubername, wie in der Bibliothek. */
  name: string;
  nameEn: string;
  /** Datei bzw. git-Stand — hält den Fall rückverfolgbar. */
  origin: string;
  desc: string[];
  descDe: string[];
  /** Erwartung: enthält die deutsche Fassung Regelabweichungen? Steht im Fall-Label des Reports. */
  expectDivergence: boolean;
  /**
   * Was ein brauchbarer Richter melden muss — für den Leser dieser Datei. Absichtlich
   * NICHT im Prompt und nicht im Report: die Erwartung darf dem Modell nirgends
   * vorliegen. Geprüft wird sie über die Assertion-Labels der Strecke.
   */
  expected: string;
}

const SPRINGEN_EN: string[] = [
  'You touch a willing creature. Once on each of its turns until the spell ends, that creature can jump up to 30 feet by spending 10 feet of movement.',
];

const SPRINGEN_DE: string[] = [
  'Du berührst eine Kreatur. Die Sprungdistanz der Kreatur wird bis zum Ende des Zaubers verdreifacht.',
];

const ENLARGE_EN: string[] = [
  'For the duration, the spell enlarges or reduces a creature or an object you can see within range (see the chosen effect below). A targeted object must be neither worn nor carried. If the target is an unwilling creature, it can make a Constitution saving throw. On a successful save, the spell has no effect. Everything that a targeted creature is wearing and carrying changes size with it. Any item it drops returns to normal size at once. A thrown weapon or piece of ammunition returns to normal size immediately after it hits or misses a target.',
  "**_Enlarge._** The target's size increases by one category—from Medium to Large, for example. The target also has Advantage on Strength checks and Strength saving throws. The target's attacks with its enlarged weapons or Unarmed Strikes deal an extra 1d4 damage on a hit.",
  "**_Reduce._** The target's size decreases by one category—from Medium to Small, for example. The target also has Disadvantage on Strength checks and Strength saving throws. The target's attacks with its reduced weapons or Unarmed Strikes deal 1d4 less damage on a hit (this can't reduce the damage below 1).",
];

const ENLARGE_DE_ALT: string[] = [
  'Wenn das Ziel eine Kreatur ist, verändert ihre gesamte Ausrüstung ebenfalls die Größe. Wird ein Gegenstand von einer betroffenen Kreatur fallengelassen, kehrt er sofort zu seiner normalen Größe zurück. \n\n Vergrößern: Die Größe des Ziels verdoppelt sich in alle Richtungen und sein Gewicht wird mit acht multipliziert. Dadurch steigt seine Größenkategorie um eins, beispielsweise von mittelgroß zu groß. Gibt es nicht genug Raum, um seine Größe zu verdoppelt, erreicht die Kreatur oder der Gegenstand die maximale Größe, die aufgrund der Gegebenheiten möglich ist. Bis der Zauber endet, ist das Ziel zudem bei Stärke-Attributs- und -rettungswürfen im Vorteil. Die Waffen des Ziels passen sich ebenfalls der neuen Größe an. Während sie vergrößert sind, fügen die Waffenangriffe des Ziels 1W4 zusätzlichen Schaden zu. \n\n Verkleinern: Die Größe des Ziels halbiert sich in alle Richtungen und sein Gewicht wird auf ein Achtel verringert. Dadurch verringert sich seine Größenkategorie um eins, beispielsweise von mittelgroß zu klein. Bis der Zauber endet, ist das Ziel zudem bei Stärke-Attributs- und -rettungswürfen im Nachteil. Die Waffen des Ziels passen sich ebenfalls der neuen Größe an. Während sie verkleinert sind, fügen die Waffenangriffe des Ziels 1W4 weniger Schaden zu (der Schaden kann allerdings nicht unter 1 sinken).',
];

const ENLARGE_DE_NEU: string[] = [
  'Für die Dauer des Zaubers vergrößert oder verkleinert er eine Kreatur oder einen Gegenstand, den du in Reichweite siehst (siehe die gewählte Wirkung unten). Ein Zielobjekt darf weder getragen noch geführt werden. Wenn das Ziel eine unwillige Kreatur ist, kann sie einen Konstitutionsrettungswurf ablegen. Bei einem erfolgreichen Wurf hat der Zauber keine Wirkung. Alles, was eine Zielkreatur trägt und mit sich führt, ändert ihre Größe mit ihr. Jeder Gegenstand, den sie fallen lässt, kehrt augenblicklich zu ihrer normalen Größe zurück. Ein geworfenes Waffe oder Geschoss kehrt sofort nach dem Treffer oder Fehlschlag eines Ziels zu seiner normalen Größe zurück.',
  '**_Vergrößern._** Die Größe des Ziels erhöht sich um eine Kategorie – von Mittel zu Groß zum Beispiel. Das Ziel hat auch Vorteil auf Stärke-Checks und Stärke-Rettungswürfe. Die Angriffe des Ziels mit seinen vergrößerten Waffen oder Waffenlosen Angriffen verursachen bei einem Treffer zusätzlichen 1d4 Schaden.',
  '**_Verkleinern._** Die Größe des Ziels verringert sich um eine Kategorie – von Mittel zu Klein zum Beispiel. Das Ziel hat auch Nachteil auf Stärke-Checks und Stärke-Rettungswürfe. Die Angriffe des Ziels mit seinen verkleinerten Waffen oder Waffenlosen Angriffen verursachen bei einem Treffer 1d4 weniger Schaden (dies kann den Schaden nicht unter 1 reduzieren).',
];

const SHILLELAGH_EN: string[] = [
  "A Club or Quarterstaff you are holding is imbued with nature's power. For the duration, you can use your spellcasting ability instead of Strength for the attack and damage rolls of melee attacks using that weapon, and the weapon's damage die becomes a d8. If the attack deals damage, it can be Force damage or the weapon's normal damage type (your choice). The spell ends early if you cast it again or if you let go of the weapon.",
];

const SHILLELAGH_DE: string[] = [
  'Das Holz eines Knüppels oder Kampfstabs, den du in der Hand hältst, wird von der Macht der Natur erfüllt. Für die Wirkungsdauer kannst du für Angriffs- und Schadenswürfe von \n\nNahkampfangriffen mit dieser Waffe dein Attribut zum Zauberwirken anstatt Stärke verwenden.\n\n Der Schadenswürfel der Waffe wird zu einem W8. Sie wird zudem magisch, falls sie es nicht bereits ist. Der Zauber endet, wenn du ihn erneut wirkst oder die Waffe loslässt.',
];

const ZEITSTOPP_EN: string[] = [
  'You briefly stop the flow of time for everyone but yourself. No time passes for other creatures, while you take 1d4 + 1 turns in a row, during which you can use actions and move as normal. This spell ends if one of the actions you use during this period, or any effects that you create during it, affects a creature other than you or an object being worn or carried by someone other than you. In addition, the spell ends if you move to a place more than 1,000 feet from the location where you cast it.',
];

const ZEITSTOPP_DE: string[] = [
  'Du stoppst kurzzeitig den Fluss der Zeit für alle außer dir selbst. Für andere Kreaturen vergeht keine Zeit, während du 1W4+1 Züge hintereinander bekommst, in denen du wie gewohnt Aktionen ausführen und dich bewegen kannst. \n\n Dieser Zauber endet, wenn eine deiner Aktionen oder ein von dir erschaffener Effekt während dieser Zeitspanne eine Kreatur außer dir selbst oder einen Gegenstand beeinflusst, den jemand anderes außer dir trägt. Zudem endet der Zauber, wenn du dich mehr als 300 Meter von dem Ort entfernst, an dem du ihn gewirkt hast.',
];

export const SPRINGEN: TranslationPair = {
  id: 'springen',
  name: 'Springen',
  nameEn: 'Jump',
  origin: 'vault/spells/verwandlung/springen.json (Stand 2026-07-30)',
  desc: SPRINGEN_EN,
  descDe: SPRINGEN_DE,
  expectDivergence: true,
  expected:
    'Zwei Regelabweichungen in zwei Sätzen: „willing" fehlt (Berühren einer unwilligen Kreatur wäre erlaubt), ' +
    'und die Mechanik ist die von 2014 (verdreifachte Sprungdistanz) statt 9 Meter Sprung für 3 Meter Bewegung, ' +
    'einmal pro Zug.',
};

export const ENLARGE_ALT: TranslationPair = {
  id: 'enlarge-alt',
  name: 'Vergrößern/Verkleinern',
  nameEn: 'Enlarge/Reduce',
  origin: 'vault @ HEAD:spells/verwandlung/vergroessern-verkleinern.json (Fassung vor der Überarbeitung)',
  desc: ENLARGE_EN,
  descDe: ENLARGE_DE_ALT,
  expectDivergence: true,
  expected:
    'Der Rettungswurf auf Konstitution der unwilligen Kreatur fehlt vollständig — damit ist der Zauber ' +
    'unwiderstehlich. Ebenso fehlt die Zielbeschränkung („weder getragen noch geführt"). Umgekehrt steht ' +
    'quellenloses 2014er-Material im Text: Verdoppelung/Halbierung in alle Richtungen, Gewicht mal acht bzw. ' +
    'ein Achtel, Platzmangel-Regel. Sprachlich ist die Fassung die BESSERE der beiden.',
};

export const ENLARGE_NEU: TranslationPair = {
  id: 'enlarge-neu',
  name: 'Vergrößern/Verkleinern',
  nameEn: 'Enlarge/Reduce',
  origin: 'vault/spells/verwandlung/vergroessern-verkleinern.json (überarbeitete Fassung, Arbeitsbaum)',
  desc: ENLARGE_EN,
  descDe: ENLARGE_DE_NEU,
  expectDivergence: false,
  expected:
    'Regelinhaltlich vollständig — kein Befund als Auslassung, Zusatz oder Widerspruch. Sprachlich mangelhaft ' +
    '(„Stärke-Checks" statt Attributswurf auf Stärke, „Ein geworfenes Waffe", „1d4" statt „1W4", Genusfehler): ' +
    'das darf gemeldet werden, aber ausdrücklich als Sprach-/Terminologiebefund.',
};

export const SHILLELAGH: TranslationPair = {
  id: 'shillelagh',
  name: 'Shillelagh',
  nameEn: 'Shillelagh',
  origin: 'vault/spells/verwandlung/shillelagh.json (Stand 2026-07-30)',
  desc: SHILLELAGH_EN,
  descDe: SHILLELAGH_DE,
  expectDivergence: true,
  expected:
    'Beide Richtungen in einem kurzen Text: die Wahl des Schadenstyps (Kraftschaden oder normaler Schadenstyp) ' +
    'fehlt, und „Sie wird zudem magisch" hat keine Grundlage im Englischen. Der Rest deckt sich.',
};

export const ZEITSTOPP: TranslationPair = {
  id: 'zeitstopp',
  name: 'Zeitstopp',
  nameEn: 'Time Stop',
  origin: 'vault/spells/verwandlung/zeitstopp.json (Stand 2026-07-30)',
  desc: ZEITSTOPP_EN,
  descDe: ZEITSTOPP_DE,
  expectDivergence: false,
  expected:
    'Deckungsgleich und flüssig — die Negativ-Kontrolle. Metrische Umrechnung (1.000 Fuß → 300 Meter), ' +
    'W-Notation (1W4+1) und deutsche Regelbegriffe sind gewollt und dürfen NICHT als Abweichung erscheinen.',
};

/** Alle Paare in Report-Reihenfolge: erst die Befunde, dann die Kontrollen. */
export const TRANSLATION_PAIRS: TranslationPair[] = [SPRINGEN, ENLARGE_ALT, SHILLELAGH, ENLARGE_NEU, ZEITSTOPP];
