---
paths:
  - "src/lib/schemas/**/*.ts"
---

# Schema invariants

What a schema field means for the flows that read it — none of it is visible from the schema alone.

- **The closed rule vocabularies are English** (`SKILL_NAMES`, `WEAPON_CATEGORIES`,
  `ARMOR_TRAININGS`, `WEAPON_MASTERIES` in `schemas/vocabulary.ts`, `ABILITY_NAMES` in
  `schemas/abilities.ts`), and German appears at exactly two boundaries: the sheet-key tables
  (`domain/skills.ts`, `schemas/abilities.ts`) and display labels
  (`domain/proficiencies.ts`). **Adding a third translation table is the mistake to avoid.**
  Prompts name the vocabulary via `z.enum(SKILL_NAMES)`; translation happens when a `Change` is
  *applied*, not when it is produced.
- **Tools and languages stay German free text** on purpose — no closed vocabulary, and in 2024
  languages are not a proficiency at all. That is why a language sits in `grants.languages` /
  `grantsChoice.kind = 'languages'` beside `grants.proficiencies`, never inside it, and why the
  value a player types is the value the sheet shows — there is no list to canonicalise against.
- **A feature whose only content is a choice declares it**, via `grantsChoice`
  (`featureChoiceGrantSchema` in `schemas/featureChoice.ts`, kinds in `FEATURE_CHOICE_KINDS`).
  A feature may declare SEVERAL — the field is a list. That declaration is what keeps
  it out of the AI feature analysis; the name-based predicates (`isWeaponMasteryFeature`,
  `isSpellcastingFeature`) are only the fallback for vault entries that do not carry the field
  yet. `optionList` carries the consequence **next to each option** (`options[].grants`), which
  is what makes `determinesFurtherEffects` structurally false — no blocking, no re-analysis.
  A German option label is a **quote** from `descDe` (`labelDe`), never a translation.
- **The declaration triple is identical at class feature, trait and feat** — one spread,
  `featureDeclarationFields` (`schemas/featureChoice.ts`), so a fourth field reaches all three
  carriers by itself. Consequently **the origin of a feature decides exactly one thing**: which
  sheet field its note line goes into (`forClassFeaturesField`, `services/declaredFeature.ts`).
  `source` lives on `DeclaredFeature`, never in a vault schema — a trait does not know it is a
  trait, the flow does.
- **At a FEATURE, `grants.proficiencies` is the only proficiency sink.** `proficiencyGrant`
  survives only at the class head and the background — those are not features.
  `foldLegacyProficiencyGrant` lifts the old field and **must run on every read path**
  (`schemaValidation`, `speciesLibrary`, `featsLibrary`, both Open5e mappers): the schemas are
  not `strict`, so a forgotten path loses the proficiency without a parse error.
  `skills.choose` IS used there (elf, human, `skilled`) — but by `collectGrants`, which asks
  the question, while `withGrant`/`proficiencyGrantChanges` only apply `skills.fixed`.
- **A grant field without a sink is a compile error, not a silent gap.** Both projections into
  `Change[]` are tables typed over `keyof` their source form (`riderGrantChanges` over
  `RiderProficiencies`, `proficiencyGrantChanges` over `ProficiencyGrant`), and `APPLY`
  (`services/applyChanges.ts`) is total over `Change['target']`. Adding a field or a `Change`
  variant breaks the build until it has a sink. **Do not hand-enumerate fields next to these
  tables.**
- **`grants` is optional WITHOUT a default** (`featureGrantSchema`, plus `grantsChoice`/
  `grantsSpells` alongside it). Missing field = the entry was never redacted and still runs
  through the AI chain; `{}` = reviewed, grants nothing. Erase that distinction and every
  coverage gap goes silent — an imported or homebrew feature would lose its mechanics
  unnoticed. It is also why there is no cut-over date: the chain shrinks with coverage.
- **A character property is a `Change`, never a rider field.** `grants.properties` and
  `grantsChoice.kind === 'characterProperty'` end in `services/characterProperties.ts`; the
  rider is the *model's* output vocabulary, so a size in it would mean Pass C may invent one.
