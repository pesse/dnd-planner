<script lang="ts">
  /** „Neue Charaktervorlage": ein vorhandener Charakter wird als Vorlage in die Kampagne kopiert. */
  import Modal from './ui/Modal.svelte';
  import CharacterTile from './character/CharacterTile.svelte';
  import { characterCatalog } from '../services/catalog/characterCatalog';
  import type { CatalogRow } from '../services/catalog/catalogTypes';

  let { campaignName, onpick, oncancel }: {
    campaignName: string;
    /** Die UID ist der Ordnername unter `CHARACTERS_PATH`. */
    onpick: (uid: string) => Promise<void>;
    oncancel: () => void;
  } = $props();

  let rows = $state<CatalogRow[] | null>(null);
  let query = $state('');
  let busy = $state('');
  let error = $state('');

  $effect(() => {
    void characterCatalog.load().then((r) => (rows = r.rows)).catch(() => (rows = []));
  });

  const shown = $derived.by(() => {
    const q = query.trim().toLocaleLowerCase('de');
    const all = [...(rows ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return q ? all.filter((r) => r.name.toLocaleLowerCase('de').includes(q)) : all;
  });

  const uidOf = (r: CatalogRow) => r.dirPath!.split('/').pop()!;
  const metaOf = (r: CatalogRow) => [r.cells.species?.text, r.cells.classLevel?.text].filter(Boolean).join(' · ');

  async function pick(r: CatalogRow) {
    busy = r.path;
    error = '';
    try {
      await onpick(uidOf(r));
    } catch (e) {
      error = `Vorlage konnte nicht angelegt werden: ${e instanceof Error ? e.message : e}`;
    } finally {
      busy = '';
    }
  }
</script>

<Modal title="Neue Charaktervorlage" draggable={false} width="min(640px, 94vw)" onclose={oncancel}>
  <p class="intro">Welcher Charakter wird zur Vorlage für „{campaignName}“? Die Vorlage ist eine Kopie — der Charakter selbst bleibt unverändert.</p>
  <!-- svelte-ignore a11y_autofocus -->
  <input class="search" bind:value={query} placeholder="Charakter suchen…" aria-label="Charakter suchen" autofocus spellcheck="false" />
  {#if rows === null}
    <p class="hint">Charaktere werden geladen…</p>
  {:else if !shown.length}
    <p class="hint">{rows.length ? 'Kein Charakter passt zur Suche.' : 'Noch keine Charaktere.'}</p>
  {:else}
    <div class="grid">
      {#each shown as r (r.path)}
        <CharacterTile
          name={busy === r.path ? 'Wird kopiert…' : r.name}
          meta={metaOf(r)}
          portrait={r.icon ?? ''}
          disabled={!!busy}
          onclick={() => pick(r)}
        />
      {/each}
    </div>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</Modal>

<style>
  .intro,
  .hint {
    margin: 0 0 0.7rem;
    font-size: 0.85rem;
    color: var(--ink-muted);
  }
  .search {
    box-sizing: border-box;
    width: 100%;
    margin-bottom: 0.8rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink);
    padding: 0.4rem 0.55rem;
    font: inherit;
    font-size: 0.85rem;
    outline: none;
  }
  .search:focus {
    border-color: var(--gold);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.6rem;
  }
  .error {
    margin: 0.8rem 0 0;
    color: var(--danger);
  }
</style>
