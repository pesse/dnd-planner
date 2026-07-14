/**
 * Deterministische SRD-Regel-Injektion für die KI-Charakteraktionen.
 *
 * Statt die KI im Agent-Loop recherchieren zu lassen (teuer, viele Turns), bauen
 * wir hier vorab einen kompakten `<rules_srd>`-Block aus dem lokalen Regel-
 * Nachschlagewerk (services/rulesReference.ts) und hängen ihn an den System-Prompt.
 * So bleibt es bei EINEM KI-Call (TPM-schonend, Muster wie der Encounter-Entwurf).
 */
import { lookupRule, searchRules, type RuleSearchResult } from './rulesReference';

/** Die zwölf SRD-Grundklassen (deutsche Namen, wie in den Regel-Chunks). */
const GERMAN_CLASSES = [
  'Barbar', 'Barde', 'Kleriker', 'Druide', 'Kämpfer', 'Mönch',
  'Paladin', 'Waldläufer', 'Schurke', 'Zauberer', 'Hexenmeister', 'Magier',
];

const fold = (s: string): string =>
  s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

/** Übungsbonus einer Gesamtstufe (SRD-Tabelle). */
const proficiencyBonus = (level: number): number => 2 + Math.floor((Math.max(1, level) - 1) / 4);

/** Zerlegt einen classLevel-String in Klasse+Stufe (inkl. Multiclassing). */
function parseClassLevel(classLevel: string): { klasse: string; stufe: number }[] {
  const out: { klasse: string; stufe: number }[] = [];
  for (const seg of classLevel.split(/[/,&+]/).map((s) => s.trim()).filter(Boolean)) {
    const folded = fold(seg);
    const klasse = GERMAN_CLASSES.find((c) => folded.includes(fold(c)));
    if (!klasse) continue;
    const level = seg.match(/\d+/);
    out.push({ klasse, stufe: level ? Number(level[0]) : 1 });
  }
  return out;
}

/** Sucht eine Zielstufe im Freitext ("auf 4", "→ 4", "Stufe 4"); sonst null. */
function targetFromInput(input: string): number | null {
  const m = input.match(/(?:auf|→|->|zu|nach|stufe)\s*(?:stufe\s*)?(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** Formatiert Suchtreffer als lesbare Blöcke und kappt die Gesamtlänge. */
function formatChunks(chunks: RuleSearchResult[], maxChars = 4000): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  let total = 0;
  for (const c of chunks) {
    const key = `${c.section}|${c.heading}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const block = `### ${c.heading} (${c.section}, S. ${c.page})\n${c.text}`;
    if (total + block.length > maxChars) break;
    parts.push(block);
    total += block.length;
  }
  return parts.join('\n\n');
}

/** Definitions-Zeile eines Klassenbegriffs aus dem Regelglossar (falls vorhanden). */
function classDefinition(klasse: string): string {
  const hit = lookupRule(klasse);
  return hit.found && hit.entry ? `- **${hit.entry.de}**: ${hit.entry.definition}` : '';
}

function wrap(rulesText: string, defs: string[], mechanics: string): string {
  if (!rulesText && !defs.length) return '';
  return (
    `\n\n<rules_srd>\nAuszüge aus dem SRD 5.2.1 (Deutsch) — nutze sie als autoritative Quelle:\n\n` +
    (defs.filter(Boolean).length ? defs.filter(Boolean).join('\n') + '\n\n' : '') +
    rulesText +
    `\n</rules_srd>` +
    (mechanics ? `\n<mechanics>\n${mechanics}\n</mechanics>` : '')
  );
}

/**
 * Regel-Chunks einer Klasse. Da der MiniSearch-Tokenizer einstellige Zahlen
 * verwirft ("4" fällt raus), lässt sich die Zielstufe nicht per Query treffen —
 * daher breit über die Klassensektion suchen und über das rohe `heading`
 * (enthält "N. Stufe: …") nach der Zielstufe filtern.
 */
function classFeatureChunks(klasse: string, target: number): RuleSearchResult[] {
  const inSection = searchRules(`${klasse} Klassenmerkmale Stufe`, 30).filter((c) => c.section === klasse);
  const levelRe = new RegExp(`(?:^|[^\\d])${target}\\.?\\s*Stufe`, 'i');
  const atLevel = inSection.filter((c) => levelRe.test(c.heading));
  // Zielstufen-Merkmale zuerst, dann etwas allgemeiner Klassenkontext.
  return [...atLevel, ...inSection.slice(0, 3)];
}

/** Regelblock für einen Stufenaufstieg (Klasse/Stufe kommen aus dem Charakter). */
export function buildLevelUpRulesContext(classLevel: string, input = ''): string {
  const classes = parseClassLevel(classLevel);
  const chunks: RuleSearchResult[] = [];
  const defs: string[] = [];
  const targets: string[] = [];

  const explicit = targetFromInput(input);
  for (const { klasse, stufe } of classes) {
    const target = explicit ?? stufe + 1;
    targets.push(`${klasse} Stufe ${target}: Übungsbonus +${proficiencyBonus(target)}`);
    chunks.push(...classFeatureChunks(klasse, target), ...searchRules(`${klasse} Zauberplätze`, 2));
    defs.push(classDefinition(klasse));
  }
  if (!classes.length) chunks.push(...searchRules('Stufenaufstieg', 3));

  return wrap(formatChunks(chunks), defs, targets.join('\n'));
}

/** Regelblock für die Erstellung (Klasse aus der Freitext-Beschreibung erkannt). */
export function buildCreationRulesContext(input: string): string {
  const folded = fold(input);
  const detected = GERMAN_CLASSES.filter((c) => folded.includes(fold(c)));
  const target = targetFromInput(input) ?? 1;

  const chunks: RuleSearchResult[] = [...searchRules('Deinen Charakter erstellen', 2)];
  const defs: string[] = [];
  for (const klasse of detected) {
    chunks.push(...classFeatureChunks(klasse, target), ...searchRules(`${klasse} Zauberplätze`, 1));
    defs.push(classDefinition(klasse));
  }

  const mechanics = detected.length
    ? detected.map((k) => `${k} Stufe ${target}: Übungsbonus +${proficiencyBonus(target)}`).join('\n')
    : '';
  return wrap(formatChunks(chunks), defs, mechanics);
}
