# Sweeping the whole codebase

A sweep is the same per-comment judgement applied to ~380 files and ~6000 comment lines. What
changes is everything around it: what to look at first, how to keep the reviewer able to read the
result, and which decisions can no longer be made file-locally.

## 1. Inventory

```bash
python3 .claude/skills/comment-review/scripts/comment_inventory.py --init
```

Writes `.comment-review/ledger.json` (gitignored) and prints the worklist, highest score first.
The score is deliberately crude — comment volume plus cheap form signals (`Sig` column: section
banners, commented-out code, TODO/FIXME, comments hanging on a group instead of a declaration).
It orders the work; it never decides a verdict.

A `*` marks a file that already appears in a comment-pruning commit (`git log --grep=kommentar`).
Its score is divided by three, and the expectation there is **"bleibt"** — see the second-sweep
argument in SKILL.md. Do not treat a `*` file as low-hanging fruit.

Other commands: `--todo N` (next N open files), `--status` (progress),
`--mark PATH done|unchanged|skipped --note "..."`, `--json`.

## 2. Work in batches, not in one run

Take 5–15 files that belong together — one directory, one flow, one layer. The unit of delivery is
**a batch that a human can review in one sitting and one commit**, not "the codebase". A 200-file
diff of comment changes gets rubber-stamped, and rubber-stamping is how a wrong deletion enters the
repo permanently.

Per batch:

1. Review each file by the normal procedure (whole file, every comment, three verdicts).
2. Mark each file in the ledger as `done` (edits applied), `unchanged` (reviewed, nothing to do —
   a real and frequent outcome) or `skipped` with a note saying why.
3. Run `npm run verify` **once for the batch**, not per file.
4. Commit the batch alone. Comment-only, German message, nothing else in it.

When subagents are available, one agent per file parallelises well — the judgement is per file and
context is what limits a sweep. Keep the batch boundary anyway: agents return reports, you read
them, then the batch is committed as a unit. Cap concurrency at what you can still read.

## 3. What only a sweep can see — and the trap that comes with it

The reason to sweep at all: **the same fact stated in four files** is invisible while reviewing one
of them. When you find one, keep it at the site that *enforces* the fact (the function that must
not be "fixed", the parse path that must not be forgotten), delete the copies, and name the new
home in the report.

The trap is the same finding under parallelism: two agents reviewing two files each see the other
file's copy as "the original" and delete their own. Both copies vanish and nothing says so.

So: **within a batch, cross-file duplicates are reported, never deleted.** Each agent notes "this
also stands in X" and leaves the comment alone. After the batch you decide once, with both texts in
front of you, which site keeps it. This costs one extra pass and is the only way the decision is
made by someone who saw both sides.

The same rule applies to a comment that leans on another one across files ("dieselbe Asymmetrie wie
…"). Anchor and dependant get decided together or not at all.

## 4. What a sweep skips

- Generated files (`schemas/exampleObjects/`, `src-tauri/gen/`) — the inventory already excludes
  them.
- Text that is prompt *content* rather than comment: `aiActions/*` (`SHEET_NOTE_*`), the German
  case descriptions in `evals/cases/*`. They score high on volume and are not review targets.
- `vault/` — a separate content repo with its own rules.

## 5. Form is a separate sweep

Aligning `/** */` versus `//` is repo-wide, mechanical, and must not travel inside a content diff.
Do it after the content sweep, as its own pass and its own commit, and measure the convention
before touching anything:

```bash
grep -rc "^\s*/\*\*" --include=*.ts src/lib | awk -F: '{s+=$2} END {print s}'
```

## 6. Reporting a sweep

Per batch, one block: files touched, files left unchanged, comment lines before → after, and — the
part that matters — the verdicts you expect to be contested, with the file and the reason. A sweep
report that lists only numbers cannot be checked by anyone.

At the end of a session, `--status` gives the remaining work, and the ledger makes the next session
resumable without re-reading anything.
