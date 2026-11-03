<script lang="ts">
  /** Der Einstieg zu „Neue Kampagne": leer mit eigenem Namen oder aus einer Vorlage. */
  import Modal from './ui/Modal.svelte';
  import {
    listCampaignTemplates, listCharacterTemplates, type CampaignTemplateRef, type CharacterTemplateRef,
  } from '../services/templates/templates';

  let { oncreate, ontemplate, oncancel }: {
    oncreate: (name: string) => Promise<boolean>;
    ontemplate: (t: CampaignTemplateRef, characters: string[]) => Promise<boolean>;
    oncancel: () => void;
  } = $props();

  type Role = 'gm' | 'player';

  let view = $state<'options' | 'name' | 'templates' | 'setup'>('options');
  let templates = $state<CampaignTemplateRef[] | null>(null);
  let characters = $state(new Map<string, CharacterTemplateRef>());
  let name = $state('');
  let chosen = $state<CampaignTemplateRef | null>(null);
  let role = $state<Role>('gm');
  let picked = $state(new Set<string>());
  let busy = $state('');
  let error = $state('');

  const edition = $derived(chosen && role === 'player' ? (chosen.player ?? chosen) : chosen);
  const cast = $derived(
    (edition?.characters ?? []).map((id) => characters.get(id)).filter((c): c is CharacterTemplateRef => !!c),
  );

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

  function choose(t: CampaignTemplateRef) {
    chosen = t;
    setRole('gm');
    view = 'setup';
  }

  /** Die Spielleitung bekommt die ganze Gruppe, ein Spieler sucht sich seine Figur selbst aus. */
  function setRole(r: Role) {
    role = r;
    picked = new Set(r === 'gm' ? (chosen?.characters ?? []) : []);
  }

  function toggle(id: string) {
    const next = new Set(picked);
    if (!next.delete(id)) next.add(id);
    picked = next;
  }

  function create() {
    const t = edition;
    if (!t) return;
    const ids = t.characters.filter((id) => picked.has(id));
    void run(t.id, () => ontemplate(t, ids), 'Die Vorlage konnte nicht kopiert werden.');
  }

  function back() {
    view = view === 'setup' ? 'templates' : 'options';
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
          {:else if templates.length}Ein vorbereitetes Abenteuer – als Spielleitung oder als Spieler
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
  {:else if view === 'templates'}
    <button class="back" onclick={back}>← Zurück</button>
    <div class="list">
      {#each templates ?? [] as t (t.id)}
        <button class="option" onclick={() => choose(t)}>
          <span class="title">{t.name}</span>
          {#if t.description}<span class="sub">{t.description}</span>{/if}
          {#if t.player}<span class="sub">Mit spoilerfreier Ausgabe für Spieler</span>{/if}
        </button>
      {/each}
    </div>
  {:else if chosen && edition}
    <button class="back" onclick={back}>← Zurück</button>
    <h3 class="title">{chosen.name}</h3>
    {#if chosen.player}
      <div class="roles" role="radiogroup" aria-label="Rolle">
        <button class="option" role="radio" aria-checked={role === 'gm'} onclick={() => setRole('gm')}>
          <span class="title">Als Spielleitung</span>
          <span class="sub">Das ganze Abenteuer: Akte, Encounter, Karten mit versteckten Tokens, NSCs und Handouts</span>
        </button>
        <button class="option" role="radio" aria-checked={role === 'player'} onclick={() => setRole('player')}>
          <span class="title">Als Spieler</span>
          <span class="sub">{chosen.player.description || 'Nur was ihr vor dem ersten Spielabend wissen dürft'}</span>
        </button>
      </div>
    {/if}
    {#if cast.length}
      <p class="cast-label">
        {role === 'player' ? 'Wen spielst du? Die Figur kommt mit Bogen und Hintergrundgeschichte.' : 'Vorgefertigte Charaktere mit anlegen'}
      </p>
      <div class="cast">
        {#each cast as c (c.id)}
          <button class="figure" aria-pressed={picked.has(c.id)} title={c.classLevel} onclick={() => toggle(c.id)}>
            {#if c.portraitSrc}<img src={c.portraitSrc} alt="" />
            {:else}<span class="placeholder">{c.name.slice(0, 1)}</span>{/if}
            <span class="figure-name">{c.name}</span>
          </button>
        {/each}
      </div>
    {/if}
    <div class="actions">
      <button class="primary-btn" disabled={!!busy} onclick={create}>
        {busy ? 'Wird angelegt…' : 'Kampagne anlegen'}
      </button>
    </div>
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
  .roles {
    display: grid;
    grid-template-columns: 1fr 1fr;
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
  .option:hover:not(:disabled),
  .option[aria-checked='true'] {
    border-color: var(--red);
  }
  .option[aria-checked='true'] {
    box-shadow: inset 0 0 0 1px var(--red);
  }
  .option:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .title {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.05rem;
    font-weight: normal;
  }
  h3.title {
    margin-bottom: 0.7rem;
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
  .cast-label {
    margin: 1rem 0 0.5rem;
    font-size: 0.85rem;
  }
  .cast {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .figure {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    width: 84px;
    padding: 0.4rem 0.2rem;
    background: none;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--ink);
    cursor: pointer;
    opacity: 0.5;
  }
  .figure:hover {
    opacity: 0.8;
  }
  .figure[aria-pressed='true'] {
    border-color: var(--red);
    background: var(--surface);
    opacity: 1;
  }
  .figure img,
  .placeholder {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    object-fit: cover;
  }
  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-deep);
  }
  .figure-name {
    font-size: 0.75rem;
    line-height: 1.15;
    text-align: center;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 1rem;
  }
  .error {
    margin: 0.8rem 0 0;
    color: var(--danger);
  }
</style>
