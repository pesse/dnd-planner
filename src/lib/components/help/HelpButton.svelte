<script lang="ts">
  /** „?"-Knopf, der ein Hilfethema als Dialog öffnet. */
  import { HELP_TOPICS, renderHelp, type HelpTopicId } from '../../help/topics';

  let { topic, label = '' }: { topic: HelpTopicId; label?: string } = $props();

  let dialog = $state<HTMLDialogElement>();
  const html = $derived(renderHelp(topic));
</script>

<button type="button" class="help-btn" class:labeled={!!label} title={HELP_TOPICS[topic].title}
  onclick={() => dialog?.showModal()}>{label || '?'}</button>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialog} class="help-dialog" onclick={(e) => { if (e.target === dialog) dialog?.close(); }}>
  <header>
    <h3>{HELP_TOPICS[topic].title}</h3>
    <button type="button" class="close" title="Schließen" onclick={() => dialog?.close()}>×</button>
  </header>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  <div class="body">{@html html}</div>
</dialog>

<style>
  .help-btn {
    width: 1.15rem;
    height: 1.15rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: transparent;
    color: var(--ink-muted);
    font-size: 0.7rem;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
  }
  .help-btn.labeled { width: auto; border: none; border-radius: 0; text-decoration: underline; font-weight: 400; }
  .help-btn:hover { color: var(--arcane); border-color: var(--arcane); }

  .help-dialog {
    width: min(620px, 92vw);
    max-height: 84vh;
    padding: 0;
    background: var(--bg);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .help-dialog::backdrop { background: rgb(0 0 0 / 0.4); }
  header {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.8rem 1.1rem 0.5rem;
    background: var(--bg);
    border-bottom: 1px solid var(--surface);
  }
  h3 { margin: 0; font-size: 1rem; color: var(--arcane); }
  .close { background: none; border: none; color: var(--ink-muted); font-size: 1.2rem; cursor: pointer; }
  .close:hover { color: var(--ink); }

  .body { padding: 0.6rem 1.1rem 1.1rem; font-size: 0.85rem; line-height: 1.5; }
  .body :global(h2) { font-size: 0.9rem; color: var(--gold); margin: 1rem 0 0.35rem; }
  .body :global(p) { margin: 0 0 0.55rem; }
  .body :global(ol), .body :global(ul) { margin: 0 0 0.55rem; padding-left: 1.3rem; }
  .body :global(li) { margin: 0.15rem 0; }
  .body :global(a) { color: var(--arcane); }
</style>
