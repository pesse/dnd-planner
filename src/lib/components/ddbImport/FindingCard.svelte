<script lang="ts">
  /** Ein Befund des D&D-Beyond-Imports: Hinweise, Beschreibung und die Entscheidung des Spielers. */
  import { RESOLUTION_ACTIONS, type ImportFinding, type LibraryOption, type Resolution } from '../../services/ddbImport/findings';
  import { isCreatableSource, type DdbSourceCatalog } from '../../services/ddbImport/sources';
  import { sourceLabel } from '../../services/sourceRegistry';
  import type { SourceKey } from '../../schemas/source';
  import { ACTION_LABELS, KIND_LABELS, defaultCreateSource, findingHints } from './findingHints';

  let { finding, catalog, resolution, search, onchange }: {
    finding: ImportFinding;
    catalog: DdbSourceCatalog;
    resolution: Resolution;
    search: (query: string) => LibraryOption[];
    onchange: (r: Resolution) => void;
  } = $props();

  const hints = $derived(findingHints(finding, catalog));
  const actions = $derived(RESOLUTION_ACTIONS[finding.kind]);

  // Erstes Wort statt ganzem Namen: „Rope, Hempen (50 feet)" findet so noch das Seil.
  let query = $state('');
  $effect.pre(() => { query = finding.name.split(/[\s,(]/)[0]; });
  const hits = $derived.by(() => {
    const own = search(query);
    return [...finding.candidates, ...own.filter((o) => !finding.candidates.some((c) => c.key === o.key))];
  });

  let createSource = $state('');
  $effect.pre(() => { createSource = defaultCreateSource(finding, catalog); });
  const sourceValid = $derived(isCreatableSource(catalog, createSource));

  function choose(action: Resolution['action']) {
    if (action === 'link') onchange({ action, key: resolution.action === 'link' ? resolution.key : hits[0]?.key ?? '' });
    else if (action === 'create') onchange({ action, source: createSource as SourceKey });
    else onchange({ action });
  }

  function setSource(value: string) {
    createSource = value.trim().toLowerCase();
    if (sourceValid) onchange({ action: 'create', source: createSource as SourceKey });
  }
</script>

<article class="finding" class:open={resolution.action !== 'freetext'}>
  <header>
    <span class="kind">{KIND_LABELS[finding.kind]}</span>
    <h4>{finding.name}</h4>
    {#if finding.context && finding.kind === 'spell'}<span class="ctx">über {finding.context}</span>{/if}
  </header>

  {#each hints as h}<p class="hint {h.tone}">{h.text}</p>{/each}

  {#if finding.origin?.desc}
    <details>
      <summary>Beschreibung aus D&D Beyond</summary>
      <p class="desc">{finding.origin.desc}</p>
    </details>
  {/if}

  <div class="chips" role="radiogroup" aria-label="Entscheidung">
    {#each actions as a}
      <button type="button" class="chip" class:sel={resolution.action === a} role="radio" aria-checked={resolution.action === a}
              onclick={() => choose(a)}>{ACTION_LABELS[a]}</button>
    {/each}
  </div>

  {#if resolution.action === 'link'}
    <div class="link">
      <input type="text" bind:value={query} placeholder="In der Bibliothek suchen …" aria-label="Bibliothek durchsuchen" />
      {#if hits.length}
        <ul>
          {#each hits as o (o.key)}
            <li>
              <button type="button" class:sel={resolution.key === o.key} onclick={() => onchange({ action: 'link', key: o.key })}>
                {o.label}
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="hint">Kein Treffer — anderen Suchbegriff versuchen.</p>
      {/if}
    </div>
  {:else if resolution.action === 'create'}
    <label class="field">
      <span>Herkunft <small>({sourceValid ? sourceLabel(createSource) : 'muss auf „-import" enden'})</small></span>
      <input type="text" value={createSource} oninput={(e) => setSource((e.currentTarget as HTMLInputElement).value)} />
    </label>
    <p class="hint">Englischer Text aus D&D Beyond; Übersetzung und Mechanik ergänzt du danach im Editor.</p>
  {/if}
</article>

<style>
  .finding {
    border: 1px solid var(--border); border-radius: 6px; padding: 0.7rem 0.85rem;
    display: flex; flex-direction: column; gap: 0.45rem; background: var(--bg-raised, var(--bg));
  }
  .finding.open { border-color: var(--border-strong); }
  header { display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; }
  h4 { margin: 0; font-size: 1rem; }
  .kind { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); }
  .ctx { font-size: 0.8rem; color: var(--ink-soft); }
  .hint.info::before { content: 'ⓘ '; color: var(--arcane, var(--gold)); }
  .hint.warn::before { content: '⚠ '; color: var(--copper); }
  details summary { cursor: pointer; font-size: 0.82rem; color: var(--ink-soft); }
  .desc { white-space: pre-line; font-size: 0.85rem; margin: 0.35rem 0 0; max-height: 14rem; overflow-y: auto; }
  .link { display: flex; flex-direction: column; gap: 0.35rem; }
  .link ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.15rem; max-height: 12rem; overflow-y: auto; }
  .link li button {
    width: 100%; text-align: left; background: none; border: 1px solid transparent; border-radius: 4px;
    padding: 0.25rem 0.5rem; font: inherit; font-size: 0.88rem; color: var(--ink); cursor: pointer;
  }
  .link li button:hover { background: var(--surface); }
  .link li button.sel { border-color: var(--arcane, var(--gold)); background: var(--surface); font-weight: 600; }
  small { color: var(--ink-muted); }
</style>
