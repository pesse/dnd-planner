<script lang="ts">
  import type { ClassProgression, ClassFeature } from '$lib/types';
  import { ABILITY_KEYS } from '$lib/schemas/classProgression';
  import { parseClass as _parseClass } from '$lib/utils/schemaValidation';
  import ClassEditForm from './ClassEditForm.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import TranslateModal from './TranslateModal.svelte';
  import { buildRuleTranslationSystemPrompt } from '$lib/prompts';
  import { createCardEditor } from '$lib/editor/cardEditor.svelte';
  import { slugify } from '$lib/editor/saveAs';
  import { invalidateVault } from '$lib/stores/campaign';
  import { invalidateClassCache } from '$lib/classLibrary';

  function parseClass(json: string): ClassProgression | null {
    try {
      const result = _parseClass(JSON.parse(json));
      return result.ok ? result.data : null;
    } catch { return null; }
  }

  const ed = createCardEditor<ClassProgression>({
    type: 'class',
    label: 'Klasse',
    parse: parseClass,
    defaultName: (c) => slugify(c.nameDe || c.name || 'klasse'),
    location: {
      resolvePath: (_c, name) => `./vault/classes/${name}.json`,
    },
    onSaved: () => { invalidateClassCache(); invalidateVault(); },
  });

  let draft = $derived(ed.draft);
  let dirty = $derived(ed.dirty);
  let saveError = $derived(ed.saveError);
  let lastSavedContent = $derived(ed.lastSavedContent);
  const save = () => ed.save();
  const discard = () => ed.discard();
  const saveJson = (json: string) => ed.saveJson(json);

  const ABILITY_LABELS: Record<string, string> = {
    str: 'STÄ', ges: 'GES', kon: 'KON', int: 'INT', wei: 'WEI', cha: 'CHA',
  };
  const CASTER_LABELS: Record<string, string> = {
    NONE: 'Kein Zauberwirker', FULL: 'Voller Zauberwirker', HALF: 'Halber Zauberwirker',
    THIRD: 'Drittel-Zauberwirker', PACT: 'Paktmagie',
  };

  const featureName = (f: ClassFeature): string => f.nameDe || f.name;
  const featureDesc = (f: ClassFeature): string => f.descDe || f.desc;

  // ── Übersetzung ─────────────────────────────────────────────────────────────
  let showTranslate = $state(false);

  function buildTranslationPrompt(): string | null {
    const c = ed.draft;
    if (!c) return null;
    const payload = {
      name: c.name,
      features: c.features.map((f) => ({ name: f.name, desc: f.desc })),
    };
    if (!payload.name && !payload.features.length) return null;
    return JSON.stringify(payload);
  }

  function applyTranslation(raw: string) {
    const c = ed.draft;
    if (!c) return;
    try {
      const result = JSON.parse(raw);
      if (typeof result.name_de === 'string') c.nameDe = result.name_de;
      if (Array.isArray(result.features)) {
        result.features.forEach((tf: { nameDe?: string; descDe?: string }, i: number) => {
          if (!c.features[i]) return;
          if (typeof tf.nameDe === 'string') c.features[i].nameDe = tf.nameDe;
          if (typeof tf.descDe === 'string') c.features[i].descDe = tf.descDe;
        });
      }
    } catch { /* ignore */ }
  }
</script>

{#if draft}
  <EditorPanel
    bind:tab={ed.tab}
    {dirty}
    {saveError}
    onsave={save}
    ondiscard={discard}
    onsavejson={saveJson}
    getJson={() => draft ? JSON.stringify(draft, null, 2) : lastSavedContent}
    style="--ep-accent: var(--copper)"
  >
    {#snippet karte()}
      <div class="class-card">
        <div class="head">
          <div class="name">{draft!.nameDe || draft!.name}</div>
          {#if draft!.nameDe && draft!.name && draft!.nameDe !== draft!.name}
            <div class="name-en">{draft!.name}</div>
          {/if}
          <div class="meta">
            {CASTER_LABELS[draft!.casterType] ?? draft!.casterType}
            {#if draft!.hitDie} · Trefferwürfel W{draft!.hitDie}{/if}
          </div>
          {#if draft!.savingThrows.length}
            <div class="meta">Rettungswürfe: {draft!.savingThrows.map((s) => ABILITY_LABELS[s] ?? s).join(', ')}</div>
          {/if}
        </div>
        {#if draft!.features.length}
          <div class="features">
            {#each draft!.features as f}
              <div class="feature">
                <div class="feature-head">
                  <span class="feature-name">{featureName(f)}</span>
                  {#if f.gainedAt.length}<span class="feature-lvl">Stufe {f.gainedAt.join(', ')}</span>{/if}
                </div>
                {#if featureDesc(f)}<div class="feature-desc">{featureDesc(f)}</div>{/if}
              </div>
            {/each}
          </div>
        {:else}
          <p class="empty">Keine Merkmale.</p>
        {/if}
      </div>
    {/snippet}

    {#snippet bearbeiten()}
      {#if ed.draft}
        <div class="edit-wrap">
          <ClassEditForm bind:klass={ed.draft} />
        </div>
        <div class="ai-section">
          <span class="ai-label">Werkzeuge</span>
          <div class="ai-row">
            <button class="ai-btn" onclick={() => (showTranslate = true)}>🌐 Übersetzen…</button>
          </div>
        </div>
      {/if}
    {/snippet}
  </EditorPanel>
{:else}
  <EditorPanel
    bind:tab={ed.tab}
    dirty={false}
    onsavejson={saveJson}
    getJson={() => lastSavedContent}
  >
    {#snippet karte()}
      <p class="parse-error">Kein gültiger Klassen-Datensatz.</p>
    {/snippet}
    {#snippet bearbeiten()}
      <p class="parse-error">
        Ungültiges Klassen-JSON.
        <button onclick={() => ed.tab = 'json'}>JSON bearbeiten</button>
      </p>
    {/snippet}
  </EditorPanel>
{/if}

{#if showTranslate && ed.draft}
  <TranslateModal
    entityName={ed.draft.nameDe || ed.draft.name || 'Klasse'}
    systemPrompt={buildRuleTranslationSystemPrompt(buildTranslationPrompt() ?? '')}
    buildPrompt={buildTranslationPrompt}
    onresult={applyTranslation}
    onclose={() => (showTranslate = false)}
  />
{/if}

<style>
  .class-card {
    width: 100%; max-width: 560px; background: var(--bg);
    border: 1.5px solid var(--copper); border-radius: 8px;
    color: var(--ink); font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
    overflow: hidden;
  }
  .head {
    padding: 0.9rem 1.2rem; text-align: center;
    background: linear-gradient(to bottom,
      color-mix(in srgb, var(--copper) 40%, var(--bg)) 0%,
      color-mix(in srgb, var(--copper) 8%, var(--bg)) 100%);
  }
  .name { font-size: 1.3rem; font-weight: 700; font-variant: small-caps; letter-spacing: 0.02em; }
  .name-en { font-size: 0.85rem; font-style: italic; color: var(--ink-soft); }
  .meta { font-size: 0.8rem; color: color-mix(in srgb, var(--copper) 70%, var(--ink)); margin-top: 0.2rem; }

  .features { padding: 0.6rem 1.2rem 1rem; display: flex; flex-direction: column; gap: 0.7rem; }
  .feature-head { display: flex; align-items: baseline; gap: 0.5rem; }
  .feature-name { font-weight: 700; font-variant: small-caps; color: var(--copper); }
  .feature-lvl { font-size: 0.72rem; color: var(--ink-muted); font-style: italic; }
  .feature-desc { font-size: 0.85rem; line-height: 1.55; white-space: pre-wrap; margin-top: 0.15rem; }
  .empty { padding: 1rem; color: var(--ink-muted); font-style: italic; }

  .edit-wrap {
    background: var(--bg);
    border: 1px solid color-mix(in srgb, var(--copper) 25%, var(--surface));
    border-radius: 6px; padding: 1rem 1.25rem; max-width: 560px; width: 100%;
    --mef-accent: var(--copper);
  }

  .ai-section {
    display: flex; flex-direction: column; align-items: flex-start; gap: 0.45rem;
    width: 100%; max-width: 560px; margin-top: 0.6rem; padding-top: 0.6rem;
    border-top: 1px solid var(--surface);
  }
  .ai-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); }
  .ai-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .ai-btn {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink); padding: 0.3rem 0.7rem; cursor: pointer; font-size: 0.82rem; font-family: inherit;
  }
  .ai-btn:hover { border-color: var(--copper); color: var(--copper); }

  .parse-error { color: var(--danger); font-size: 0.9rem; }
  .parse-error button {
    background: none; border: none; color: var(--red);
    cursor: pointer; text-decoration: underline; font-family: inherit;
  }
</style>
