<script lang="ts">
  /** Der Einstieg zu „Neue Kampagne": leer mit eigenem Namen oder aus einer Vorlage. */
  import Modal from './ui/Modal.svelte';
  import {
    listCampaignTemplates, listCharacterTemplates, type CampaignTemplateRef, type CharacterTemplateRef,
  } from '../services/templates/templates';

  let { oncreate, ontemplate, oncancel }: {
    oncreate: (name: string) => Promise<boolean>;
    ontemplate: (t: CampaignTemplateRef, withCharacters: boolean) => Promise<boolean>;
    oncancel: () => void;
  } = $props();

  let view = $state<'options' | 'name' | 'templates'>('options');
  let templates = $state<CampaignTemplateRef[] | null>(null);
  let characters = $state(new Map<string, CharacterTemplateRef>());
  let name = $state('');
  let withCharacters = $state(true);
  let busy = $state('');
  let error = $state('');

  $effect(() => {
    void listCampaignTemplates().then((t) => (templates = t)).catch(() => (templates = []));
    void listCharacterTemplates()
      .then((list) => (characters = new Map(list.map((c) => [c.id, c]))))
      .catch(() => {});
  });

  async function run(id: string, action: () => Promise<boolean>, failure: string) {
    busy = id;
    error = '';
    if (!(await action().catch(() => false))) error = failure;
    busy = '';
  }

  const createEmpty = () => run('name', () => oncreate(name), 'Die Kampagne konnte nicht angelegt werden.');

  const pick = (t: CampaignTemplateRef) =>
    run(t.id, () => ontemplate(t, withCharacters && t.characters.length > 0), 'Die Vorlage konnte nicht kopiert werden.');

  function back() {
    view = 'options';
    error = '';
  }
</script>

<Modal title="Neue Kampagne" draggable={false} width="min(640px, 94vw)" onclose={oncancel}>
  {#if view === 'options'}
    <div class="options">
      <button class="option" onclick={() => (view = 'name')}>
        <span class="title">Leere Kampagne</span>
        <span class="sub">Akte, Sessions, NPCs und Welt selbst anlegen</span>
      </button>
      <button class="option" disabled={!templates?.length} onclick={() => (view = 'templates')}>
        <span class="title">Aus Vorlage erstellen</span>
        <span class="sub">
          {#if templates === null}Vorlagen werden gesucht…
          {:else if templates.length}Ein vorbereitetes Abenteuer mit Karten, Encountern und Charakteren
          {:else}Keine Vorlagen — sie kommen mit Inhaltspaketen wie „Hellfire Club"{/if}
        </span>
      </button>
    </div>
  {:else if view === 'name'}
    <button class="back" onclick={back}>← Zurück</button>
    <form class="naming" onsubmit={(e) => { e.preventDefault(); void createEmpty(); }}>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={name} placeholder="Name der Kampagne…" autofocus />
      <button type="submit" class="primary-btn" disabled={!name.trim() || !!busy}>Anlegen</button>
    </form>
  {:else}
    <button class="back" onclick={back}>← Zurück</button>
    <div class="list">
      {#each templates ?? [] as t (t.id)}
        {@const cast = t.characters.map((id) => characters.get(id)).filter((c) => !!c)}
        <button class="option template" disabled={!!busy} onclick={() => pick(t)}>
          <span class="title">{busy === t.id ? 'Wird angelegt…' : t.name}</span>
          {#if t.description}<span class="sub">{t.description}</span>{/if}
          {#if cast.length}
            <span class="cast">
              {#each cast as c (c.id)}
                {#if c.portraitSrc}<img src={c.portraitSrc} alt={c.name} title={c.name} />
                {:else}<span class="placeholder" title={c.name}>{c.name.slice(0, 1)}</span>{/if}
              {/each}
            </span>
          {/if}
        </button>
      {/each}
    </div>
    {#if templates?.some((t) => t.characters.length)}
      <label class="with-characters">
        <input type="checkbox" bind:checked={withCharacters} /> Vorgefertigte Charaktere mit anlegen
      </label>
    {/if}
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</Modal>

<style>
  .options,
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .option {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.8rem 1rem;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--ink);
    cursor: pointer;
  }
  .option:hover:not(:disabled) {
    border-color: var(--red);
  }
  .option:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .title {
    font-family: var(--font-display);
    font-size: 1.05rem;
  }
  .sub {
    font-size: 0.8rem;
    color: var(--ink-muted);
  }
  .back {
    display: block;
    margin-bottom: 0.7rem;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .naming {
    display: flex;
    gap: 0.5rem;
  }
  .naming input {
    flex: 1;
  }
  .cast {
    display: flex;
    gap: 0.3rem;
    margin-top: 0.4rem;
  }
  .cast img,
  .placeholder {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
  }
  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-deep);
  }
  .with-characters {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.8rem;
    font-size: 0.85rem;
  }
  .error {
    margin: 0.8rem 0 0;
    color: var(--danger);
  }
</style>
