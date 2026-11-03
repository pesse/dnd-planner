<script lang="ts">
  /** Das ausgewählte Token: Einstellungen, SL-Notiz und dahinter Werteblock oder Charakter. */
  import { textTip } from '../../textTip.svelte';
  import { withRule } from '../../ruleTips.svelte';
  import RichTextEditor from '../../RichTextEditor.svelte';
  import type { Token } from '../../../schemas/battleMap';
  import type { Encounter } from '../../../schemas/encounter';
  import type { Monster } from '../../../types';
  import type { MapEditor } from '../../../services/battleMap/mapEditor.svelte';
  import { characterEntry, encounterPath, loadEncounter, loadTokenMonster } from '../../../services/battleMap/tokenDetails';
  import MonsterStatBlock from '../../MonsterStatBlock.svelte';
  import EntryCard from '../../ui/EntryCard.svelte';
  import HpTracker from './HpTracker.svelte';
  import ConditionPicker from './ConditionPicker.svelte';

  let { editor, token: t, campaignDir }: { editor: MapEditor; token: Token; campaignDir: string } = $props();

  const SIZES = [
    { value: 0.5, label: 'Winzig' },
    { value: 1, label: 'Klein/Mittel' },
    { value: 2, label: 'Groß' },
    { value: 3, label: 'Riesig' },
    { value: 4, label: 'Gigantisch' },
  ];
  const KIND_LABEL = { character: 'Charakter', monster: 'Monster', marker: 'Markierung' } as const;

  let monster = $state<Monster | null>(null);
  let monsterMissing = $state(false);
  let encounter = $state<Encounter | null>(null);

  $effect(() => {
    const { kind, ref, encounter: key } = t;
    monster = null;
    monsterMissing = false;
    encounter = null;
    let live = true;
    if (kind === 'monster' && ref) {
      void loadTokenMonster({ ref, encounter: key }, campaignDir).then((m) => {
        if (!live) return;
        monster = m;
        monsterMissing = !m;
      });
    }
    if (key) void loadEncounter(encounterPath(campaignDir, key)).then((e) => { if (live) encounter = e; });
    return () => { live = false; };
  });

  const monsterNotes = $derived(encounter?.monsters.find((m) => m.slug === t.ref)?.notes ?? '');

  function update(patch: Partial<Token>) {
    editor.checkpoint();
    editor.updateToken(t.id, patch);
  }
</script>

<div class="settings">
  <div class="title-row">
    <input class="name" value={t.name} aria-label="Name" onchange={(e) => update({ name: e.currentTarget.value })} />
    <button
      class="eye"
      title={t.hidden ? 'Für Spieler versteckt — zeigen (H)' : 'Für Spieler sichtbar — verstecken (H)'}
      onclick={() => update({ hidden: !t.hidden })}
    >{t.hidden ? '🙈' : '👁'}</button>
    <button class="del" title="Token entfernen (Entf)" onclick={() => editor.removeToken(t.id)}>✕</button>
  </div>
  <p class="kind">
    {KIND_LABEL[t.kind]}{t.hidden ? ' · für Spieler versteckt' : ''}
    {#if t.encounter}
      · <button class="link" onclick={() => editor.details.show({ kind: 'encounter', key: t.encounter })}>
        {encounter?.name ?? 'Encounter'}
      </button>
    {/if}
  </p>
  <div class="row">
    <select value={t.size} aria-label="Größe" onchange={(e) => update({ size: Number(e.currentTarget.value) })}>
      {#each SIZES as s}<option value={s.value}>{s.label}</option>{/each}
    </select>
    <input type="color" value={t.color} title="Farbe" onchange={(e) => update({ color: e.currentTarget.value })} />
    {#if t.kind !== 'marker'}
      <label class="ini" use:textTip={withRule('Leer: nimmt nicht am Kampf teil.', 'srd-2024_initiative')}>
        Ini
        <input
          type="number"
          value={t.initiative ?? ''}
          onchange={(e) => editor.setInitiatives({ [t.id]: e.currentTarget.value === '' ? null : Math.round(Number(e.currentTarget.value)) })}
        />
      </label>
    {/if}
  </div>
  {#if t.kind !== 'marker'}
    <ConditionPicker {editor} token={t} />
  {/if}
  <div class="note" class:tall={t.kind === 'marker'} onfocusin={() => editor.checkpoint()}>
    {#key t.id}
      <RichTextEditor value={t.note} placeholder="Notiz (nur für dich) …" onChange={(note) => editor.updateToken(t.id, { note })} />
    {/key}
  </div>
</div>

{#if t.kind === 'monster' && (t.hpMax || monster)}
  <div class="hp"><HpTracker {editor} token={t} fallbackMax={monster?.hit_points ?? 0} /></div>
{/if}

{#if t.kind === 'monster'}
  {#if monster}
    <div class="sheet"><MonsterStatBlock {monster} notes={monsterNotes} /></div>
  {:else if monsterMissing}
    <p class="muted">Keine Werte zu „{t.ref}" gefunden.</p>
  {/if}
{:else if t.kind === 'character' && t.ref}
  <div class="sheet character"><EntryCard entry={characterEntry(t.ref, t.name)} /></div>
{/if}

<style>
  .settings {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--surface);
  }
  .title-row,
  .row {
    display: flex;
    gap: 0.3rem;
    align-items: center;
  }
  .name {
    flex: 1;
    min-width: 0;
    font-family: var(--font-display);
    font-size: 1.1rem;
  }
  .row select {
    flex: 1;
  }
  input[type='color'] {
    width: 2.2rem;
    padding: 0;
  }
  .kind {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-muted);
  }
  .note {
    display: flex;
    height: 7rem;
    min-height: 4rem;
    resize: vertical;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .note.tall {
    height: 13rem;
  }
  .note :global(.toolbar) {
    padding: 0.1rem 0.3rem;
  }
  .note :global(.ProseMirror) {
    padding: 0.4rem 0.6rem;
    font-size: 0.85rem;
    line-height: 1.5;
  }
  button {
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
    padding: 0.2rem 0.4rem;
  }
  .eye:hover,
  .del:hover {
    border-color: var(--border);
  }
  .del {
    color: var(--danger);
  }
  .link {
    padding: 0;
    border: none;
    color: var(--red);
    font-size: inherit;
  }
  .link:hover {
    text-decoration: underline;
  }
  .sheet {
    padding: 0.75rem;
  }
  .hp {
    padding: 0.6rem 1rem;
    border-bottom: 1px solid var(--surface);
  }
  .ini {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--ink-muted);
  }
  .ini input {
    width: 3.2rem;
  }
  .character :global(.peek-char) {
    flex-direction: column;
    padding: 0;
  }
  .character :global(.peek-char .portrait) {
    width: 100%;
    height: 14rem;
    object-position: 50% 15%;
  }
  .muted {
    padding: 1rem;
    color: var(--ink-muted);
    font-style: italic;
  }
</style>
