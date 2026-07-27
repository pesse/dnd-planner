/**
 * Eval: Merkmals-Analyse (Pass A) — Entwurfs-Prompt, noch ohne `AiAction`.
 *
 * Zwei Fälle auf demselben Input:
 *   1. Ein Call — die Analyse selbst (Choices erkannt, noch keine Zauber).
 *   2. Ein VERLAUF mit FESTER Analyse-Antwort (`assistant(ANALYSIS_FIXTURE)`), auf die
 *      die Landart-Wahl nachgereicht wird. Gemessen wird nur die Antwort danach —
 *      ein Call je Lauf, deterministischer Ausgangspunkt.
 *
 * Bewusst ohne echten Zwischen-Call: den kompletten mehrstufigen Produktionspfad
 * misst die Action-Strecke (`featureEffects.eval.test.ts`).
 *
 *   npm run eval -- --eval featureAnalysis --runs 3
 */
import { z } from 'zod';
import { defineEval } from './defineEval';
import { assistant, chatCase, promptCase, reply, user } from './promptCase';

const analysisChoiceSchema = z.object({
  id: z.string().describe('Stable id, e.g. "choice_<featureslug>_1".'),
  feature: z.string().describe('Name of the feature that forces this choice.'),
  question: z.string().describe('German question shown to the player.'),
  options: z.array(z.string()).describe('German options; empty array for free text.'),
  determinesFurtherEffects: z
      .boolean()
      .describe('true only when the answer unlocks grants that cannot be stated yet.'),
});

export const featureAnalysisSchema = z.object({
  choices: z.array(analysisChoiceSchema),
  spellsToGround: z
      .array(z.string())
      .describe('Canonical ENGLISH names of always-prepared spell grants; empty if none or blocked.'),
  blocked: z
      .boolean()
      .describe('true if a determinesFurtherEffects choice is still open and blocks spell grants.'),
});

export type FeatureAnalysisManifest = z.infer<typeof featureAnalysisSchema>;

const SYSTEM = `You are a rules analyst for Dungeons & Dragons 5e (SRD 5.2 / German 5.2.1 terminology).
You receive the game features/feats a character has JUST gained (<gained_features>) plus class context (<class_context>), and optionally choices the player has already made (<resolved_choices>).
    Your ONLY job is to ANALYSE these features so a later deterministic step and a separate formatting step can turn your analysis into concrete mechanics. Do NOT produce any final data structures or grants here — reason in prose and end with one compact manifest.

## What to work out
1. Forced player choices: does a feature FORCE the player to choose something (a subclass option, a terrain, a fighting style, "+1 to one of several abilities", pick a spell from a list)? For each note the German question, the concrete options if you know them, and whether the choice DETERMINES further mechanical effects that cannot be stated until it is made (e.g. a Circle of the Land terrain decides which spells are granted).
2. Mechanical dependencies: state clearly which grants depend on which choice and which grants are unconditional.
3. Spells granted as ALWAYS PREPARED for free (subclass/circle/domain lists, spell-granting feats) — canonical ENGLISH SRD names. List a spell ONLY once no still-open choice blocks it. Never list spells the player merely MAY learn.
4. Any other concrete mechanical grants (expertise, proficiencies, fighting style, fixed ability increases, extra cantrips/prepared spells) — describe them in prose. You do NOT need to structure these; the next step reads your prose.

## <resolved_choices>
    If present, each listed choice is FINAL: it no longer blocks anything and the spells/effects it unlocks can now be stated (canonical English spell names). Still list such a choice in the manifest, but set its determinesFurtherEffects=false.

## Output
Reason in prose first. Then end your answer with EXACTLY ONE fenced JSON manifest and nothing after it:
    \`\`\`json
{
  "choices": [
    { "id": "choice_<featureslug>_1", "feature": "<feature name>", "question": "<German question>", "options": ["<German option>"], "determinesFurtherEffects": true }
  ],
  "spellsToGround": ["Canonical English Spell Name"],
  "blocked": false
}
\`\`\`
    - choices: every forced player choice. Stable ids. options=[] if free text. determinesFurtherEffects=true only when the answer unlocks grants you cannot state yet.
- spellsToGround: canonical ENGLISH names of always-prepared spell grants to resolve NOW (empty [] if none or if blocked).
- blocked: true if a determinesFurtherEffects choice is still open (not yet in <resolved_choices>) and therefore blocks stating spell grants.
`;

const USER = `
<class_context>{"klasseName":"Druide","casterType":"FULL","casterKind":"prepared","spellcastingAbility":"wei","toLevel":3}</class_context>
<gained_features>[{"name":"Circle of the Land Spells","desc":"Choose one type of land: arid, polar, temperate, or tropical. Consult the table below that corresponds to the chosen type; you have the spells listed for your Druid level and lower prepared.\\n\\nTable: Arid Land\\n\\n|Druid Level|Circle Spells|\\n|---|---|\\n|3|Blur, Burning Hands, Fire Bolt|\\n|5|Fireball|\\n|7|Blight|\\n|9|Wall of Stone|\\n\\nTable: Polar Land\\n|Druid Level|Circle Spells|\\n|---|---|\\n|3|Fog Cloud, Hold Person, Ray of Frost|\\n|5|Sleet Storm|\\n|7|Ice Storm|\\n|9|Cone of Cold|\\n\\nTable: Temperate Land\\n|Druid Level|Circle Spells|\\n|---|---|\\n|3|Misty Step, Shocking Grasp, Sleep|\\n|5|Lightning Bolt|\\n|7|Freedom of Movement|\\n|9|Tree Stride|\\n\\nTable: Tropical Land\\n|Druid Level|Circle Spells|\\n|---|---|\\n|3|Acid Splash, Ray of Sickness, Web|\\n|5|Stinking Cloud|\\n|7|Polymorph|\\n|9|Insect Plague|","descDe":"Wähle eine Art des Landes aus: trocken, polar, gemäßigt oder tropisch. Ziehe die untenstehende Tabelle heran, die der gewählten Art entspricht; du hast die für deine Druidenstufe und niedriger aufgeführten Zauber vorbereitet.\n\nTabelle: Trockenes Land\n\n|Druidenstufe|Zirkelzauber|\n|---|---|\n|3|Verschwimmen, Brennende Hände, Feuerpfeil|\n|5|Feuerball|\n|7|Verderben|\n|9|Steinwand|\n\nTabelle: Polares Land\n|Druidenstufe|Zirkelzauber|\n|---|---|\n|3|Nebelwolke, Person festhalten, Kältestrahl|\n|5|Schneesturm|\n|7|Eissturm|\n|9|Kältekegel|\n\nTabelle: Gemäßigtes Land\n|Druidenstufe|Zirkelzauber|\n|---|---|\n|3|Nebelschritt, Schockgriff, Schlaf|\n|5|Blitz|\n|7|Bewegungsfreiheit|\n|9|Hölzerner Weg|\n\nTabelle: Tropisches Land\n|Druidenstufe|Zirkelzauber|\n|---|---|\n|3|Säurespritzer, Strahl der Übelkeit, Netz|\n|5|Stinkende Wolke|\n|7|Verwandlung|\n|9|Insektenplage|",source":"subclass","key":"srd-2024_druid_circle-of-the-land_spell-list","gainedAt":3},{"name":"Land's Aid","desc":"As a Magic action, you can expend a use of your Wild Shape and choose a point within 60 feet of yourself. Vitality-giving flowers and life-draining thorns appear for a moment in a 10-foot-radius Sphere centered on that point. Each creature of your choice in the Sphere must make a Constitution saving throw against your spell save DC, taking 2d6 Necrotic damage on a failed save or half as much damage on a successful one. One creature of your choice in that area regains 2d6 Hit Points.\\n\\nThe damage and healing increase by 1d6 when you reach Druid levels 10 (3d6) and 14 (4d6).","descDe":"Als magische Aktion kannst du eine Anwendung deiner Wildgestalt aufwenden und einen Punkt innerhalb von 18 Metern von dir wählen. Vitalität spendende Blumen und lebensentziehende Dornen erscheinen für einen Moment in einer Kugel mit einem Radius von 3 Metern, zentriert auf diesen Punkt. Jede Kreatur deiner Wahl in der Kugel muss einen Konstitutions-Rettungswurf gegen deinen SG des Zauber-Rettungswurfs ablegen und erleidet bei einem misslungenen Rettungswurf 2W6 Nekrotischen Schaden oder bei einem gelungenen halb so viel Schaden. Eine Kreatur deiner Wahl in diesem Bereich erhält 2W6 Trefferpunkte zurück.\n\nDer Schaden und die Heilung erhöhen sich um 1W6, wenn du die Druidenstufen 10 (3W6) und 14 (4W6) erreichst.","source":"subclass","key":"srd-2024_druid_circle-of-the-land_lands-aid","gainedAt":3}]</gained_features>
`

/**
 * VORGEGEBENE Antwort #1 (Fixture, kein Call): so soll die Analyse aussehen, bevor die
 * Wahl getroffen ist. Fest verdrahtet, damit der zweite Prompt isoliert und
 * deterministisch gemessen wird — die Qualität von Antwort #1 selbst prüft der
 * erste Fall bzw. die Action-Strecke (featureEffects.eval.test.ts).
 */
const ANALYSIS_FIXTURE = `### Analysis

1. **Forced player choices:** The feature \`Circle of the Land Spells\` forces a single choice. The German question is: *"Wähle eine Art des Landes aus: trocken, polar, gemäßigt oder tropisch."* The concrete options are \`["trocken", "polar", "gemäßigt", "tropisch"]\`. This choice directly determines which specific spells from the corresponding table are granted as always-prepared. Therefore, \`determinesFurtherEffects\` is \`true\`.

2. **Mechanical dependencies:** The spell grants from \`Circle of the Land Spells\` are entirely conditional on the unresolved land type choice. Until the player selects a land type, the exact list of prepared spells cannot be determined. The feature \`Land's Aid\` has no dependencies on the land choice and is fully unconditional.

3. **Spells granted as ALWAYS PREPARED:** Because the land type choice remains open and blocks the determination of the spell list, no spells can be safely added to \`spellsToGround\` at this stage. The list remains empty until the choice is resolved.

4. **Other concrete mechanical grants:** \`Land's Aid\` provides a specific combat/utility action. As a Magic action, the Druid can expend one use of Wild Shape to choose a point within 60 feet. A 10-foot-radius sphere appears centered on that point. Every creature in the sphere must make a Constitution saving throw against the Druid's spell save DC. On a failed save, a creature takes 2d6 necrotic damage; on a success, it takes half damage. Additionally, one creature of the Druid's choice in the area regains 2d6 hit points. The damage and healing values scale to 3d6 at Druid level 10 and 4d6 at level 14.

\`\`\`json
{
  "choices": [
    {
      "id": "choice_circle-of-the-land-spells_1",
      "feature": "Circle of the Land Spells",
      "question": "Wähle eine Art des Landes aus: trocken, polar, gemäßigt oder tropisch.",
      "options": ["trocken", "polar", "gemäßigt", "tropisch"],
      "determinesFurtherEffects": true
    }
  ],
  "spellsToGround": [],
  "blocked": true
}
\`\`\``;

/** Antwort des Spielers auf die Landart-Frage (Turn 3). */
const LAND_ANSWER = 'gemäßigt';

/**
 * Turn 3: die getroffene Wahl — bewusst MINIMAL. Nur die `id` aus dem Manifest von
 * Antwort #1 plus das gewählte Label; Frage, Optionen und Merkmal stehen bereits im
 * Verlauf. Mehr Kontext hier verschlechtert die Antwort, statt sie zu verbessern.
 */
const USER_2 = `<resolved_choices>${JSON.stringify([
  { id: 'choice_circle-of-the-land-spells_1', choice: LAND_ANSWER },
])}</resolved_choices>`;

type Manifest = FeatureAnalysisManifest;

const landRe = /trocken|polar|gemäßigt|tropisch/i;
/** Die Landart-Wahl aus einem Manifest (Frage oder Optionen nennen das Gelände). */
const landChoices = (m: Manifest) => m.choices.filter((c) => landRe.test([c.question, ...c.options].join(' ')));

/** Assertions an die Analyse VOR der Wahl. */
const core = {
  'genau 1 Choice': (o: Manifest) => o.choices.length === 1,
  'Choice ist folgenreich': (o: Manifest) => landChoices(o).some((c) => c.determinesFurtherEffects),
  'noch keine Zauber': (o: Manifest) => o.blocked || o.spellsToGround.length === 0,
  'Choice bietet exakt 4 Optionen': (o: Manifest) => (landChoices(o)[0]?.options.length ?? 0) == 4,
};

const soft = {
};


/** Für Temperate Land auf Stufe 3 erwartete Kreissprüche (aus der Tabelle im Merkmal). */
const EXPECTED_SPELLS = ['Misty Step', 'Shocking Grasp', 'Sleep'];

defineEval<Manifest>({
  name: 'featureAnalysis',
  description: 'Pass-A-Analyse: Ein-Call ohne Wahl vs. Verlauf mit nachgereichter Landart-Wahl',
  cases: [
    promptCase<Manifest>({
      label: 'Ein Call — Choices für Druide Lvl 3',
      system: SYSTEM,
      user: USER,
      // 'parse': der SYSTEM-Prompt beschreibt das Manifest bereits selbst — Schema nur
      // zum Parsen/Validieren, am Request ändert sich nichts.
      schema: featureAnalysisSchema,
      structured: 'parse',
      temperature: 0.3,
      core,
      soft,
    }),

    chatCase<Manifest>({
      label: 'Verlauf — Wahl auf vorgegebene Analyse nachgereicht',
      system: SYSTEM,
      schema: featureAnalysisSchema,
      structured: 'parse',
      temperature: 0.3,
      turns: [
        user(USER),
        // Antwort #1 ist FEST vorgegeben — kein Call, kein Rauschen. Gemessen wird
        // ausschließlich, was das Modell nach der nachgereichten Wahl liefert.
        assistant(ANALYSIS_FIXTURE),
        user(USER_2),
        reply<Manifest>({ label: 'nach-wahl' }),
      ],
      core: {
        'Zauber jetzt gewährt': (m) => m.spellsToGround.length > 0,
        'nicht mehr blockiert': (m) => m.blocked === false,
        'Wahl nicht mehr folgenreich': (m) => landChoices(m).every((c) => !c.determinesFurtherEffects),
        'Wahl bleibt protokolliert': (m) => landChoices(m).length === 1,
      },
      soft: {
        'gewährte Zauber = Referenzliste': (m) => {
          const got = new Set(m.spellsToGround.map((s) => s.toLowerCase().trim()));
          return EXPECTED_SPELLS.every((s) => got.has(s.toLowerCase()));
        },
        'keine Zauber erfunden': (m) => m.spellsToGround.length <= EXPECTED_SPELLS.length,
      },
    }),
  ],
});
