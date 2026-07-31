/**
 * Eval: Richter für die deutschen Zauberbeschreibungen — misst, ob EIN Call die
 * Regelabweichungen zwischen `desc` (englisch, autoritativ) und `desc_de` findet.
 *
 * Der Prompt steht noch hier, nicht in einer Action: er ist der Entwurf für den
 * geplanten Bibliotheks-Sweep (`scripts/audit-spells.mts`). Trägt er, wandert er in
 * eine `AiAction` und die Fälle stellen auf `action`/`input` um — Weg wie in
 * promptLab.eval.test.ts beschrieben.
 *
 * Gemessen wird an fünf eingefrorenen Paaren mit bekanntem Befund (siehe
 * `fixtures/spellTranslationPairs.ts`). Drei tragen echte Abweichungen, zwei sind
 * Kontrollen — und die Kontrollen sind der eigentliche Prüfstein: die
 * Falsch-Positiv-Rate entscheidet, ob ein Report über 338 Zauber lesbar bleibt.
 *
 *   npm run eval -- --eval translationQuality --runs 3
 */
import { z } from 'zod';
import { defineEval } from './defineEval';
import { promptCase } from './promptCase';
import { mentions } from './checks';
import { TRANSLATION_PAIRS, type TranslationPair } from './fixtures/spellTranslationPairs';

// ── Ergebnis-Form ─────────────────────────────────────────────────────────────

/**
 * MQM-Stil: Fundstellen statt Note. Eine Zahl wäre über Läufe hinweg instabil und
 * sagt nicht, was zu tun ist; ein Befund mit Zitat ist mit dem Auge nachprüfbar und
 * ist gleich die Eingabe des späteren Korrektur-Calls.
 */
const findingSchema = z.object({
  kind: z
    .enum(['omission', 'addition', 'contradiction', 'terminology', 'language'])
    .describe('Type of divergence. The first three are rules problems, the last two are not.'),
  english: z.string().describe('Verbatim excerpt from the English text; "" if the German has no English basis.'),
  german: z.string().describe('Verbatim excerpt from the German text; "" if the German omits the rule entirely.'),
  problem: z.string().describe('What is wrong. One sentence, in German.'),
});

const reviewSchema = z.object({
  findings: z.array(findingSchema).describe('One entry per divergence; empty array if the German is faithful.'),
});

type Review = z.infer<typeof reviewSchema>;
type Finding = z.infer<typeof findingSchema>;

/**
 * `'prompt'` statt `'native'`: guided decoding erzwingt `enable_thinking:false`
 * (siehe promptCase), und die Auslassungen in diesem Korpus sind genau die Klasse,
 * die ohne Nachdenken durchrutscht. Für den Gegenversuch diese Konstante auf
 * `'native'` stellen und mit eigenem `--title` laufen lassen.
 */
const STRUCTURED_MODE = 'prompt' as const;

/**
 * Thinking-Schalter, absichtlich UNABHÄNGIG von `STRUCTURED_MODE`: auf `false`
 * bleiben Prompt, Schema-Weg und Temperatur gleich und nur das Nachdenken fällt weg
 * — sonst vergleicht man zwei Änderungen auf einmal. Die Frage dahinter ist die
 * Sweep-Rechnung: der Abgleich kostet mit Reasoning 2500–3500 Output-Tokens, ohne
 * wären es ~250. Läuft mit eigenem `--title`.
 */
const REASONING = true;

const REASONING_BODY = REASONING ? undefined : { chat_template_kwargs: { enable_thinking: false } };

// ── Der Prompt ────────────────────────────────────────────────────────────────

const SYSTEM = `You compare the German translation of a D&D 5e (SRD 5.2, 2024) spell against its English source text and report where the German states different rules.

<authority>
The English text is the ONLY authority on the rules. The German text has unknown provenance: much of this library was written for the PREVIOUS edition (2014) and describes mechanics the current English text no longer contains. Such a German text can be fluent, idiomatic, perfectly phrased publisher-grade prose and still be the wrong spell. Fluency, style and register are NEVER evidence of correctness. Judge the German by what it STATES, never by how well it reads.
</authority>

<what_to_report>
- "omission" — the English states a rule the German does not state at all. This is the most important category and the easiest to miss. A dropped qualifier is an omission: "a willing creature", "unwilling", "that you can see", "you are holding", "once on each of its turns", a saving throw, an ability, an action type, a condition, a limit. Dropping one changes what the spell does.
- "addition" — the German states a rule with no basis in the English text.
- "contradiction" — both texts address the same point but state it differently: another value, another ability, another action type, another target, another duration.
- "terminology" — the German uses a wrong or non-standard German rules term for an English rules term.
- "language" — grammatical error, wrong gender or case, untranslated English, wording that is hard to read.
Work through the English text clause by clause from beginning to end, then read the German text for statements that appear nowhere in the English. Reporting only the most obvious divergence is a failure; so is inventing one.
</what_to_report>

<not_a_divergence>
The following are intended and correct. Never report them:
- Imperial units converted to metric: 30 feet → 9 Meter, 1,000 feet → 300 Meter, 5-foot → 1,5 Meter.
- German dice notation: 1d4 → 1W4, d8 → W8.
- Established German rules terminology: Rettungswurf, Trefferpunkte, Zauberplatz, Attributswurf, Vorteil, Nachteil, Wirkungsdauer.
- Different paragraph splitting or merging, different Markdown emphasis, different sentence order.
- German that is shorter or longer than the English as long as it states the same rules.
</not_a_divergence>

<output>
One finding per divergence. "english" and "german" are VERBATIM, CONTIGUOUS excerpts copied character for character from the texts given to you — no paraphrase, no ellipsis, no stitching together of separated fragments. For an omission "german" is "", for an addition "english" is "". Write "problem" in German, one sentence. Do NOT propose a corrected translation — that is a separate step. If the German states the same rules as the English, return an empty findings array.
</output>`;

const buildUser = (p: TranslationPair): string =>
  [
    `<spell name_en="${p.nameEn}" name_de="${p.name}">`,
    '<source_en>',
    p.desc.join('\n\n'),
    '</source_en>',
    '<translation_de>',
    p.descDe.join('\n\n'),
    '</translation_de>',
    '</spell>',
  ].join('\n');

// ── Assertion-Helfer ──────────────────────────────────────────────────────────

/** Die drei Kategorien, die eine Regeländerung bedeuten — nur sie gaten die Kontrollen. */
const RULES_KINDS: Finding['kind'][] = ['omission', 'addition', 'contradiction'];

const rulesFindings = (r: Review): Finding[] => r.findings.filter((f) => RULES_KINDS.includes(f.kind));

/** Alles, was ein Befund an Text mitbringt — Zitate wie Begründung. */
const findingText = (f: Finding): string => [f.english, f.german, f.problem].join(' — ');

/**
 * Nur die Begründungen. Für „darf X nicht beanstanden"-Prüfungen das Richtige: die
 * Zitate enthalten die harmlose Stelle ohnehin, beklagt wird sie im `problem`-Satz.
 */
const problems = (r: Review): string[] => r.findings.map((f) => f.problem);

/**
 * Gibt es einen Regelbefund, der JEDE der Begriffsgruppen trifft (innerhalb einer
 * Gruppe genügt ein Treffer)? So bleibt „Konstitution UND Rettungswurf" prüfbar,
 * ohne den Wortlaut des Modells vorwegzunehmen.
 */
const hasRulesFinding = (r: Review, ...groups: string[][]): boolean =>
  rulesFindings(r).some((f) => groups.every((g) => mentions(findingText(f), ...g)));

/** Befund der Kategorie `kind`, der einen der Begriffe nennt. */
const hasFindingOfKind = (r: Review, kind: Finding['kind'], ...needles: string[]): boolean =>
  r.findings.some((f) => f.kind === kind && mentions(findingText(f), ...needles));

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Die billige Halluzinations-Sperre, die später im Sweep den Report filtert: jedes
 * nicht-leere deutsche Zitat muss wörtlich im deutschen Text stehen. Whitespace wird
 * normalisiert (die Vault-Texte tragen `\n\n` mitten im Absatz), sonst wird nichts
 * nachgesehen.
 */
const germanQuotesGrounded = (pair: TranslationPair, r: Review): boolean => {
  const hay = norm(pair.descDe.join(' '));
  return r.findings.every((f) => !f.german.trim() || hay.includes(norm(f.german)));
};

const englishQuotesGrounded = (pair: TranslationPair, r: Review): boolean => {
  const hay = norm(pair.desc.join(' '));
  return r.findings.every((f) => !f.english.trim() || hay.includes(norm(f.english)));
};

/** Gemeinsame Prüfungen jedes Falls. */
const groundingChecks = (pair: TranslationPair) => ({
  core: { 'deutsche Zitate wörtlich belegt': (r: Review) => germanQuotesGrounded(pair, r) },
  soft: { 'englische Zitate wörtlich belegt': (r: Review) => englishQuotesGrounded(pair, r) },
});

type ReviewChecks = Record<string, (r: Review) => boolean>;

/** Ein Fall je Paar — Prompt, Schema und Grounding sind für alle gleich. */
const caseFor = (pair: TranslationPair, core: ReviewChecks, soft: ReviewChecks) => {
  const grounding = groundingChecks(pair);
  return promptCase<Review>({
    label: `${pair.name} — ${pair.expectDivergence ? 'Abweichung erwartet' : 'Kontrolle: unauffällig'}`,
    system: SYSTEM,
    user: buildUser(pair),
    schema: reviewSchema,
    structured: STRUCTURED_MODE,
    // Niedrig, damit die Pass-Raten den Prompt messen und nicht das Sampling. Der
    // Sweep darf höher fahren: dort werden mehrere Läufe vereinigt (Trefferquote).
    temperature: 0.2,
    // Weit über dem Ergebnis (das JSON ist ~250 Tokens): der Abgleich kostet 2500–3500
    // Reasoning-Tokens, die auf `received` zählen, im `content` aber nicht auftauchen.
    // Mit dem Default 4096 lief der Erstlauf in 11 von 15 Fällen in `finish_reason:
    // length` — und je länger der Zauber, desto sicher: Vergrößern/Verkleinern und
    // Zeitstopp scheiterten 3/3. Nicht am Modell sparen, was der Prompt zum Denken braucht.
    maxTokens: 16384,
    body: REASONING_BODY,
    callLabel: `judge-${pair.id}`,
    core: { ...core, ...grounding.core },
    soft: { ...soft, ...grounding.soft },
  });
};

// ── Fälle ─────────────────────────────────────────────────────────────────────

const [SPRINGEN, ENLARGE_ALT, SHILLELAGH, ENLARGE_NEU, ZEITSTOPP] = TRANSLATION_PAIRS;

defineEval<Review>({
  name: 'translationQuality',
  description:
    'Richter-Prompt für die deutschen Zauberbeschreibungen: findet er Auslassungen und quellenlose Zusätze ' +
    'gegen den englischen Quelltext — ohne die beiden unauffälligen Kontrollen zu beanstanden?',
  cases: [
    // Der Fall, der die ganze Klasse erklärt: ein weggelassenes Adjektiv macht aus
    // einem Unterstützungs- einen Zauber, den man gegen Unwillige wirken kann.
    caseFor(
      SPRINGEN,
      {
        'meldet das fehlende „willing"': (r) =>
          hasRulesFinding(r, ['willing', 'bereitwillig', 'freiwillig', 'einverstanden', 'einwilligung']),
        'meldet die abweichende Sprungmechanik': (r) =>
          hasRulesFinding(r, ['verdreifach', 'dreifach', 'sprungdistanz', '30 feet', '9 meter', 'jump up to', 'bewegung']),
      },
      {
        'höchstens 4 Regelbefunde (keine Flut)': (r) => rulesFindings(r).length <= 4,
        'Auslassung als solche eingeordnet': (r) => r.findings.some((f) => f.kind === 'omission'),
      },
    ),

    // Flüssiges 2014er-Deutsch. Ein Richter, der nach Sprachgefühl urteilt, winkt es durch.
    caseFor(
      ENLARGE_ALT,
      {
        'meldet den fehlenden Konstitutions-Rettungswurf': (r) =>
          hasRulesFinding(r, ['konstitution', 'constitution'], ['rettungswurf', 'saving', 'wurf']),
        'meldet quellenloses 2014er-Material': (r) =>
          hasFindingOfKind(r, 'addition', 'gewicht', 'acht', 'weight', 'verdoppel', 'halbier', 'richtungen', 'raum'),
      },
      {
        'meldet die fehlende Zielbeschränkung': (r) =>
          hasRulesFinding(r, ['getragen', 'geführt', 'worn', 'carried']),
        'meldet den fehlenden Zusatzschaden-Kontext (waffenlos)': (r) =>
          hasRulesFinding(r, ['waffenlos', 'unarmed']),
      },
    ),

    // Beide Richtungen in vier Sätzen — der kompakteste echte Fall im Bestand.
    caseFor(
      SHILLELAGH,
      {
        'meldet die fehlende Schadenstyp-Wahl': (r) => hasRulesFinding(r, ['kraftschaden', 'force', 'schadenstyp']),
        'meldet „wird magisch" als quellenlos': (r) => hasFindingOfKind(r, 'addition', 'magisch', 'magic'),
      },
      {
        'höchstens 4 Regelbefunde (keine Flut)': (r) => rulesFindings(r).length <= 4,
      },
    ),

    // Die Umkehrprobe: holpriges Deutsch, aber regelinhaltlich vollständig. Sprach- und
    // Terminologiebefunde sind hier erwünscht, Regelbefunde wären Falsch-Positive.
    caseFor(
      ENLARGE_NEU,
      {
        'keine Regelabweichung gemeldet': (r) => rulesFindings(r).length === 0,
      },
      {
        'erkennt die sprachlichen Mängel': (r) =>
          r.findings.some((f) => f.kind === 'terminology' || f.kind === 'language'),
        'nennt „Stärke-Checks" oder die d-Notation': (r) =>
          mentions(r.findings.map(findingText), 'stärke-check', 'check', '1d4', 'attributswurf'),
        'nennt den Genusfehler „Ein geworfenes Waffe"': (r) =>
          mentions(r.findings.map(findingText), 'geworfenes waffe', 'geworfene waffe', 'genus', 'geschlecht'),
      },
    ),

    // Deckungsgleich und flüssig: hier darf gar nichts kommen. Fällt diese Assertion,
    // ist der Prompt für 338 Zauber unbrauchbar, egal wie gut die Trefferquote ist.
    caseFor(
      ZEITSTOPP,
      {
        'keine Regelabweichung gemeldet': (r) => rulesFindings(r).length === 0,
      },
      {
        'überhaupt kein Befund': (r) => r.findings.length === 0,
        'metrische Umrechnung nicht beanstandet': (r) => !mentions(problems(r), '300 meter', 'fuß', 'feet', 'umrechn'),
        'W-Notation nicht beanstandet': (r) => !mentions(problems(r), 'w4', 'würfelnotation', 'd4'),
      },
    ),
  ],
});
