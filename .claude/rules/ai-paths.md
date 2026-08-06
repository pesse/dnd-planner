---
paths:
  - "src/lib/services/aiActions/**/*.ts"
  - "src/lib/services/analysis/**/*.ts"
  - "src/lib/services/levelUp/**/*.ts"
  - "src/lib/services/wizard/**/*.ts"
  - "src/lib/services/llm/**/*.ts"
---

# What the model may and may not produce

- **Weapon mastery is not an AI path.** `isFlowOwnedChoiceFeature` keeps it out of the level-up
  prompt, and the options must come from the library, never from a model.
- **Spell selection is not an AI path either.** Counts come from the quotas a feature declares in
  the vault (`grantsCasting.quotas`, schema `schemas/casting.ts`), resolved by
  `services/spellcasting/{resolve,quota}.ts` — one path for class spellcasting, species traits and
  feat access alike, so a starting book size or a per-level formula is content, not code. Options
  come from `vault/spells`, filtered by the quota's `pool`. What is persisted is per source and
  quota (`spellcasting.sources[id].picks[quotaId]`, spell **keys**); a pool that *is* the class
  list (`swap.spells: 'long-rest-all'`) still holds only the prepared choice. A feature that lets
  the player choose spells emits an `AnalysisChoice` of type `spell-pick` carrying only
  count/level/class list — **never spell names**.
- **The feature interpretation is monolingual English, with a translation boundary.** Analysis and
  effects pass (`aiActions/featureEffectsAction.ts`) see English only — `buildFeatureEffectsInput`
  strips `nameDe`/`descDe` although `GainedFeature` carries them. German is produced by the two
  thinking-free calls in `featureTranslationAction.ts` (choices for the checkpoint, sheet notes for
  the PDF box) and by `fieldSummaryAction`, which stays German because its input is the *player's*
  prose. Two consequences: a German label in a choice is a **quote** from `descDe`, never a
  translation, and a length budget always belongs to the target language (`SHEET_NOTE_EN_MAX_CHARS`
  → `SHEET_NOTE_MAX_CHARS`). A failed translation degrades to English, it never blocks.
- **A choice is stored twice:** `features[].choice` is the English canonical label (it goes back to
  the model as `<past_choices>`), `choiceDe` the display. Legacy files hold German in `choice` —
  that field is also the discriminator „choice entry vs. feat link", which is why upgrade step 5
  copies instead of moving it.
- **New entity create/edit actions are not hand-written**: describe the differences in an
  `EntityActionSpec` (`services/aiActions/spec.ts`) and let `factory.ts` build the action.
- **Gate LLM features on `LlmCapabilities`, never on provider names** (`services/llmClient.ts`).
  Claude-only features live in `anthropicExtras.ts`, outside the portable interface.
