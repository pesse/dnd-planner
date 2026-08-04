---
name: comment-review
description: Reviews and corrects code comments against this repo's rule — a comment survives because a reader would otherwise do the wrong thing, not because it is true. Judges every comment weg/kürzen/bleibt, applies the edits, and reports the extent; scales from one file to a batched sweep of the whole codebase with an inventory and a resumable ledger. Use whenever the user asks to review, shorten, prune, or clean up comments, JSDoc, or doc blocks — including the German phrasings "Kommentare kürzen", "Kommentare prüfen/aufräumen/überarbeiten", "zu viel Kommentar", "Kommentar-Review", "kommentier das mal ab" — and equally for the codebase-wide version of that ask ("alle Kommentare durchgehen", "die ganze Codebase aufräumen", "wo steht überall zu viel Kommentar", "Abschnittsbanner finden", "systematisch durchgehen", resuming an earlier sweep). Also use when a change you just wrote added several explanatory blocks, before committing a comment-heavy diff, or when the user says a file "erklärt sich zu Tode". Prefer this over ad-hoc pruning; ad-hoc pruning trades substance for brevity, which is the failure mode this skill exists to prevent.
---

# Comment review

## The test

**What does a reader do differently if this sentence is gone?** Nothing → delete. Being *true* is
not a reason to stay; a comment survives because otherwise a reader would do the wrong thing.

The test applies per comment, never per file. Three verdicts: **weg**, **kürzen**, **bleibt**.

**How the request is phrased is a hypothesis, not a verdict.** "Da steht zu viel", "das erklärt
sich zu Tode", "kürz das mal" report an impression of the file; they do not decide any single
comment. Test each one anyway and let the count fall out. **"Nichts davon geht" is a legitimate
result** — say it plainly and name two or three comments with the coupling they carry, so the
answer is visibly a judgement and not a shrug.

This matters most on a file that has been through this pass before, because a second sweep does
systematic damage: name-echoes are short and were removed the first time, so what is left is the
long comments — and length is now correlated with substance, not with waste. Cutting by feel there
removes precisely the constraints someone already decided were worth the words.

## Scope and procedure

The unit is the file. Review **every** comment in the named files, not only the ones the current
diff touched — an inherited comment fails the test the same way a new one does. If the user names
no file, take the files of the uncommitted working diff, review each whole, and say in the report
that the reach went beyond the change.

1. List every comment in the file with its verdict before editing anything. Judging them one at a
   time while editing loses the couplings between them (see Working rules).
2. Apply the edits.
3. Run `npm run verify` — a comment-only change goes through the same gate as any other.
4. Report (format below).

**Across the whole codebase**, the judgement is the same and the scaffolding is not: an inventory
decides the order, a ledger survives the session, batches keep the diff reviewable, and
cross-file duplicates must be *reported* rather than deleted — two parallel reviewers each
deleting "the copy" leaves none. Read `references/sweep.md` before starting one, and start it with

```bash
python3 .claude/skills/comment-review/scripts/comment_inventory.py --init
```

which scores every tracked file by comment volume and cheap form signals and marks the files that
have already been through this pass.

## Weg

- **The mechanism enforces itself.** A comment explaining that a `keyof` table, an exhaustive
  record or a total switch turns a missing field into a compile error describes a guardrail the
  reader runs into anyway. The guardrail is the documentation.
- **The code below says it.** `z.enum(...)` versus `z.string()` already says "closed vocabulary".
- **`git log` says it** ("Ersetzt den früheren …", "seit dem Refactor …").
- **A negation against an objection nobody raises.** "Keine Größe hier: sonst dürfte das Modell
  eine erfinden" defends a decision the reader had no intention of reversing. Negate only where
  the wrong grip is the obvious one (`Additiv, nie überschreibend`).
- **Reasoning residue** — weighed alternatives, discarded routes, the author thinking out loud.
- **The reason another module is cut the way it is.** The `import` line says where it lives; the
  why belongs in that file or nowhere.
- **A second copy of a schema or a type.** `.describe()`, the field name and the signature are the
  source; JSDoc that echoes name plus signature goes.

## Kürzen — but do not trade content for a virtue

The failure mode when shortening is replacing substance with a vague good property: "kurz und
prägnant", "in der Regel länger", "aus Performance-Gründen". That answers nothing.

Before adopting a short version, **name the question a reader has at this line** and check that the
short version still answers it:

| At a … | the question is |
|---|---|
| constant | why *this* value — why not half, why not double |
| unusual construct | what breaks if I do it the normal way |
| non-local coupling | what else I have to touch |

**The arithmetic stays, its provenance goes.** `160 / 1,17 ≈ 135` earns its line; "gemessen 102k
vs. 120k Zeichen über 249 Merkmale" is the author's route there, not what the reader needs.

Budget: 1–3 lines, module head ≤ 3. Longer needs a reason.

### Halving a comment: which half survives

Most shortening is a two-part comment losing one part. One part usually says *what this is*, the
other *what happens if you get it wrong* — and the second is the payload. Cutting the wrong half
leaves a line that is shorter, still true, and no longer worth reading. Two real misses:

```
  /** Leer, wenn die Klasse noch keine hat — hier ist die Wahl nie eine offene Frage. */
  subclassName: string;
```
Kept the first half → the remainder states what an empty string means. Kept the second half → the
reader learns that this flow never asks for the subclass, which is not visible from here.

```
  /** Bei `spell-pick` trägt `options` bewusst NICHTS: die Namen kommen aus `vault/spells`. */
```
The dropped clause was "Sonst wären es erfundene Zauber". Without it the empty array reads as an
oversight and the next reader fills it — the consequence *is* the reason the field stays empty.

The check that catches both: **read the remainder on its own and put the reader's question to it
again.** If what is left could be derived from the identifier, the type, or the literal below it,
you cut the wrong half. And if both halves survive that, the comment was not too long.

## Bleibt

- A derivation or a worked example of a value (`− 2×5mm Padding = 59mm`).
- A constraint a type cannot express, together with its consequence.
- A causal chain not visible from here (what breaks elsewhere, in which order).
- Text that is prompt *content* rather than comment (`SHEET_NOTE_*` in `aiActions/*`).

## Worked examples

These are the four real edits this rule set came from (`schemas/levelUp.ts`).

**Constant — keep the arithmetic, drop the measurement route:**

```
- /**
-  * Budget der ENGLISCHEN Rohfassung: Deutsch läuft in dieser Bibliothek gemessen ~17 %
-  * länger (102k vs. 120k Zeichen über 249 Klassenmerkmale), also plant Pass C mit Reserve,
-  * damit der Übersetzer die harte Grenze hält, ohne Mechanik wegzukürzen.
-  */
+ /** Reserve, weil Deutsch ~17 % länger läuft als Englisch: 160 / 1,17. */
  export const SHEET_NOTE_EN_MAX_CHARS = 135;
```

The question at a constant is "why 135" — `160 / 1,17` answers it. A short version reading "Reserve
für die längere deutsche Fassung" would have been shorter *and* worthless.

**Self-enforcing mechanism — gone entirely:**

```
- /**
-  * Exportiert, weil die Projektion Rider → `Change[]` über `keyof` dieser Form läuft
-  * (`riderGrantChanges`, services/levelUp/changes.ts). Ein neues Feld hier ist damit ein
-  * Compile-Fehler dort, statt still am Charakter zu fehlen.
-  */
  export type RiderProficiencies = z.infer<typeof riderProficienciesSchema>;
```

Adding a field breaks the build. Nobody reaches this comment without the compiler having told them.

**The code below says the closed part — what remains is the frame:**

```
- // Fertigkeiten/Waffen/Rüstung als GESCHLOSSENE englische Vokabulare: mit freien Strings
- // fällt die Zuweisung still durch, weil der Bogen deutsche Schlüssel führt
- // (`MitTierenUmgehen`; übersetzt wird beim Anwenden). `tools`/`languages` bleiben Freitext.
+ /** Ausgabevokabular des Modells, wo möglich auf geschlossene Werte eingegrenzt. */
  const riderProficienciesSchema = z.object({
    skills: z.array(z.enum(SKILL_NAMES)).default([]),
    tools: z.array(z.string()).default([]),
```

`z.enum` versus `z.string()` shows per field which is closed; the sheet-key detour lives in the
translating module. What the schema cannot say is *whose* vocabulary this is.

## Form: what the comment hangs on

**Every comment hangs on exactly one thing.** If a blank line and then several declarations follow
it, it is a section banner — and thus the sign of a missing module, not documentation. Either move
it against the declaration it justifies, or the group becomes its own file.

The syntax follows from that:

| Form | for |
|---|---|
| `/** … */` | hangs on a declaration and describes it: module head, constant, schema, type, function — exported or not |
| `// …` | hangs on no declaration: a field line in an object literal, a branch of a union array, an end-of-line note |

**The convention is measured, not invented.** Before aligning existing code, count which form
prevails before declarations (`grep -c` over `schemas/` and `services/`; here it was 161 to 9 for
`/** */`) — the minority gets adjusted, a personal preference does not get enforced. A plausible
but wrong criterion would be "exported → `/** */`": non-exported declarations carry JSDoc here too.

**Aligning the form is its own change.** Do not mix it with shortening content — otherwise a diff
that removes lines quietly contains a rewrite as well. Two commits, or the form pass second.

## Working rules

- **A human-proposed wording is a proposal, not an instruction.** If the answer to the reader's
  question falls out of it, contradict in one sentence and apply a version that keeps the answer
  and still drops the ballast. Do not defend length as such.
- **Check before deleting.** If the statement could be the only evidence of a non-local coupling,
  look into the other file first, then decide.
- **Watch for couplings between comments.** One that leans on another ("dieselbe Asymmetrie wie
  oben", a number named only once) quietly points at nothing once its anchor falls — shorten both
  or name the fact where it now has to stand.
- Write in the language the file's other comments use (German here).
- Comment-only changes run through `npm run verify` too.

## Report

Per file, and short:

```
services/vaultTools.ts — 14 Zeilen → 5
  weg    Abschnittsbanner „── Tool-Definitionen ──" (3×): Hinweis auf ein fehlendes Modul,
         nicht an eine Deklaration gerückt, weil der Schnitt eine eigene Änderung wäre
  weg    /** Abort signal … */ — wiederholt Name plus Typ
  kürzen Temperatur-Preset: Messwerte raus, die Anthropic-Konsequenz bleibt
  bleibt 4 Kommentare (nicht-lokale Kopplungen, Reihenfolge-Zusicherung)
```

Name what deliberately fell out, so the user can contradict a single verdict instead of re-reading
the diff. For a halved comment, name the half that went — that is the verdict most worth objecting
to, and it is invisible in a line count. If a comment stays only because you could not verify the
coupling it claims, say that — an unchecked "bleibt" is a different result from a checked one.

When the file comes out unchanged or nearly so, the report is the whole deliverable: say which
comments you expected to fall and why they held.
