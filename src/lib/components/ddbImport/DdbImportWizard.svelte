<script lang="ts">
  /**
   * Import eines öffentlichen D&D-Beyond-Charakters: laden, Befunde je Bereich entscheiden,
   * anlegen. Schritte ohne Befund entfallen.
   */
  import FullscreenWizard from '../ui/FullscreenWizard.svelte';
  import ImportSummary from './ImportSummary.svelte';
  import FindingCard from './FindingCard.svelte';
  import { defaultResolution } from './findingHints';
  import '../wizard/wizard.css';
  import { ddbCharacterId } from '../../services/ddbImport/fetchCharacter';
  import { analyzeDdbCharacter, finishDdbImport, searchLibrary, type DdbAnalysis } from '../../services/ddbImport/session';
  import type { FindingKind, ImportFinding, Resolution, Resolutions } from '../../services/ddbImport/findings';
  import type { Character } from '../../schemas/characterSchema';

  let { onComplete, onCancel }: {
    onComplete: (character: Character, details: string) => Promise<void>;
    onCancel: () => void;
  } = $props();

  interface Step { id: string; label: string; kinds: FindingKind[]; intro: string }
  const FINDING_STEPS: Step[] = [
    { id: 'base', label: 'Grundlagen', kinds: ['class', 'subclass', 'species', 'background'], intro: 'Klasse, Unterklasse, Volk und Hintergrund, die die Bibliothek nicht von selbst zuordnen konnte.' },
    { id: 'feats', label: 'Talente', kinds: ['feat'], intro: 'Talente ohne Bibliothekseintrag. Als Freitext bleiben Name und Beschreibung am Charakter, wirken aber nicht.' },
    { id: 'items', label: 'Ausrüstung', kinds: ['item'], intro: 'Gegenstände ohne eindeutigen Bibliothekseintrag. Als Freitext bleiben sie mit Name, Anzahl und Gewicht im Inventar.' },
    { id: 'spells', label: 'Zauber', kinds: ['spell'], intro: 'Zauber ohne Bibliothekseintrag. Als Freitext landen Name und Beschreibung in den Notizen (details.md).' },
  ];

  let link = $state('');
  let busy = $state(false);
  let error = $state('');
  let analysis = $state<DdbAnalysis | null>(null);
  let resolutions = $state<Resolutions>({});
  let stepIndex = $state(0);

  const findings = $derived(analysis?.draft.findings ?? []);
  const findingSteps = $derived(FINDING_STEPS.filter((s) => findings.some((f) => s.kinds.includes(f.kind))));
  const steps = $derived([
    { id: 'source', label: 'Charakter laden' },
    ...findingSteps,
    { id: 'review', label: 'Prüfen & anlegen' },
  ]);
  const step = $derived(steps[stepIndex]);
  const stepFindings = $derived.by(() => {
    const s = findingSteps.find((x) => x.id === step.id);
    return s ? findings.filter((f) => s.kinds.includes(f.kind)) : [];
  });

  const resolutionOf = (f: ImportFinding): Resolution => resolutions[f.id] ?? defaultResolution(f);
  const unresolvedLinks = $derived(findings.filter((f) => { const r = resolutionOf(f); return r.action === 'link' && !r.key; }));

  async function load(e: Event) {
    e.preventDefault();
    const id = ddbCharacterId(link);
    if (!id) { error = 'Im Link steht keine Charakter-ID — erwartet wird z. B. dndbeyond.com/characters/12345678.'; return; }
    busy = true; error = '';
    try {
      analysis = await analyzeDdbCharacter(id);
      resolutions = Object.fromEntries(analysis.draft.findings.map((f) => [f.id, defaultResolution(f)]));
      stepIndex = 1;
    } catch (err) {
      console.error('D&D-Beyond-Import fehlgeschlagen:', err);
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  async function create() {
    if (!analysis) return;
    busy = true; error = '';
    try {
      const result = await finishDdbImport(analysis, $state.snapshot(resolutions));
      await onComplete(result.character, result.details);
    } catch (err) {
      console.error('D&D-Beyond-Import: Anlegen fehlgeschlagen:', err);
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  const counts = $derived.by(() => {
    const by = { link: 0, create: 0, freetext: 0, drop: 0 };
    for (const f of findings) by[resolutionOf(f).action]++;
    return by;
  });
</script>

{#snippet footer()}
  <button class="secondary" onclick={onCancel}>Abbrechen</button>
  <div class="spacer"></div>
  {#if error && stepIndex > 0}<span class="warn">{error}</span>{/if}
  {#if stepIndex > 1}<button class="secondary" onclick={() => stepIndex--} disabled={busy}>Zurück</button>{/if}
  {#if stepIndex > 0 && stepIndex < steps.length - 1}
    <button class="primary" onclick={() => stepIndex++}>Weiter</button>
  {:else if stepIndex === steps.length - 1}
    <button class="primary" onclick={create} disabled={busy || unresolvedLinks.length > 0}>{busy ? 'Lege an …' : 'Charakter anlegen'}</button>
  {/if}
{/snippet}

{#snippet preview()}
  {#if analysis}<ImportSummary result={analysis.draft} />{/if}
{/snippet}

<FullscreenWizard
  title="Aus D&D Beyond importieren"
  label="D&D-Beyond-Import"
  scope="wizard"
  {steps}
  current={stepIndex}
  onstep={(i) => { if (i > 0) stepIndex = i; }}
  onclose={onCancel}
  {footer}
  preview={analysis ? preview : undefined}
>
  {#if step.id === 'source'}
    <p class="hint">
      Der Charakter muss in D&D Beyond <em>öffentlich</em> sein (Character Settings → Character Privacy → Public).
      Übernommen werden Werte, Wahlen, Zauber, Ausrüstung samt Status und die vollen Texte.
    </p>
    <form class="load" onsubmit={load}>
      <input type="text" bind:value={link} placeholder="https://www.dndbeyond.com/characters/12345678" disabled={busy} aria-label="Link zum Charakter" />
      <button class="primary" type="submit" disabled={busy || !link.trim()}>{busy ? 'Lade …' : 'Laden'}</button>
    </form>
    {#if error}<p class="warn">{error}</p>{/if}
  {:else if step.id === 'review'}
    {#if analysis}
      <p class="hint">
        {#if findings.length}
          {counts.link} verknüpft · {counts.create} neu im Vault · {counts.freetext} als Freitext · {counts.drop} weggelassen.
        {:else}
          Alles ließ sich mit der Bibliothek verknüpfen.
        {/if}
      </p>
      {#if unresolvedLinks.length}
        <p class="warn">Noch ohne Auswahl: {unresolvedLinks.map((f) => f.name).join(', ')}.</p>
      {/if}
      <h3>Hinweise</h3>
      <ul class="notes">
        {#each analysis.draft.notes as n}<li class={n.tone}>{n.text}</li>{/each}
      </ul>
    {/if}
  {:else if analysis}
    {@const s = findingSteps.find((x) => x.id === step.id)}
    {#if s}<p class="hint">{s.intro}</p>{/if}
    {#each stepFindings as f (f.id)}
      <FindingCard
        finding={f}
        catalog={analysis.catalog}
        resolution={resolutionOf(f)}
        search={(q) => searchLibrary(analysis!.libs, f, q)}
        onchange={(r) => (resolutions[f.id] = r)}
      />
    {/each}
  {/if}
</FullscreenWizard>

<style>
  .load { display: flex; gap: 0.5rem; max-width: 640px; }
  .load input { flex: 1; min-width: 0; }
  .spacer { flex: 1; }
  h3 { margin: 0.4rem 0 0; font-size: 0.95rem; color: var(--ink-soft); }
  .notes { margin: 0; padding-left: 1.1rem; font-size: 0.85rem; display: flex; flex-direction: column; gap: 0.2rem; }
  .notes .warn { color: inherit; font-size: inherit; margin: 0; }
  .notes .warn::marker { content: '⚠ '; color: var(--copper); }
  .notes .ok::marker { content: '✓ '; color: var(--green); }
</style>
