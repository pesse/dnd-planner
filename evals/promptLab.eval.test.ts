/**
 * Prompt-Werkstatt (Vorlage zum Abschauen/Umbauen): misst einen ROHEN Prompt —
 * System + User + Server-Parameter — ohne dass es dafür eine `AiAction` gibt.
 *
 * Genau der Weg, um einen Prompt-Entwurf zu bewerten, BEVOR er in die App wandert:
 * Schema als Zod hinschreiben, Erwartungen als Assertions, `npm run eval -- --eval
 * promptLab --runs 3`. Trägt der Prompt, gießt man ihn in eine Action und die
 * Strecke wandert auf `action`/`input` um (siehe spell.eval.test.ts).
 *
 * Die beiden Fälle zeigen zugleich den Structured-Output-Vergleich: derselbe Prompt
 * einmal mit vllm-guided-decoding und einmal nur mit Schema-Instruktion im Prompt.
 */
import { z } from 'zod';
import { defineEval } from './defineEval';
import { promptCase } from './promptCase';
import { mentions, minChars, nonEmpty } from './checks';

/** Entwurfs-Schema (noch kein App-Schema) — dient zugleich der Validierung je Lauf. */
const npcSchema = z.object({
  name: z.string(),
  rolle: z.string().describe('Funktion im Hafenviertel, ein Halbsatz.'),
  auftreten: z.string().describe('Wie die Figur wirkt, 1–2 Sätze.'),
  geheimnis: z.string().describe('Was sie verbirgt, 1–2 Sätze.'),
  merkmale: z.array(z.string()).describe('Genau 3 knappe Eigenheiten.'),
});
type Npc = z.infer<typeof npcSchema>;

const SYSTEM =
  'You are a Dungeons & Dragons 5e game master assistant. ' +
  'You invent concise, usable NPCs for a harbour district campaign. ' +
  'All field VALUES must be written in German; keep every field short and playable.';

const USER =
  'Erfinde einen zwielichtigen Hafenmeister, der mit Schmugglern unter einer Decke steckt. ' +
  'Er soll für die Gruppe zunächst hilfsbereit wirken.';

const core = {
  'Name gesetzt': (n: Npc) => nonEmpty(n.name),
  'genau 3 Merkmale': (n: Npc) => n.merkmale.length === 3,
  'Geheimnis ausformuliert': (n: Npc) => minChars(n.geheimnis, 40),
  'Auftreten ausformuliert': (n: Npc) => minChars(n.auftreten, 40),
};

const soft = {
  'Geheimnis nennt Schmuggel': (n: Npc) => mentions(n.geheimnis, 'schmugg', 'schmuggler', 'ware'),
  'Werte auf Deutsch': (n: Npc) => mentions([n.auftreten, n.geheimnis], ' der ', ' die ', ' und ', ' er '),
  'Rolle kurz gehalten': (n: Npc) => n.rolle.length <= 120,
};

defineEval<Npc>({
  name: 'promptLab',
  description: 'Roher NSC-Prompt: Structured Output nativ (guided decoding) vs. nur als Prompt-Instruktion',
  cases: [
    promptCase<Npc>({
      label: 'NSC-Steckbrief — structured_outputs (nativ)',
      system: SYSTEM,
      user: USER,
      schema: npcSchema, // Zod → JSON-Schema für den Server UND Validierung je Lauf
      structured: 'native',
      temperature: 0.7,
      core,
      soft,
    }),
    promptCase<Npc>({
      label: 'NSC-Steckbrief — Schema nur im Prompt',
      system: SYSTEM,
      user: USER,
      schema: npcSchema,
      structured: 'prompt',
      temperature: 0.7,
      core,
      soft,
    }),
  ],
});
