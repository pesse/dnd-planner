<script lang="ts">
  /** TP eines Monster-Tokens: Balken, Schaden und Heilung über einen kleinen Eingabedialog. */
  import type { Token } from '../../../schemas/battleMap';
  import type { MapEditor } from '../../../services/battleMap/mapEditor.svelte';
  import { adjustHp } from '../../../services/battleMap/tokenDetails';

  let { editor, token: t, fallbackMax }: { editor: MapEditor; token: Token; fallbackMax: number } = $props();

  const KIND = {
    damage: { sign: -1, title: 'Schaden', verb: 'Zufügen' },
    heal: { sign: 1, title: 'Heilung', verb: 'Heilen' },
  } as const;

  let dialog = $state<HTMLDialogElement>();
  let kind = $state<keyof typeof KIND>('damage');
  let amount = $state<number | null>(null);

  const hpMax = $derived(t.hpMax ?? fallbackMax);
  const hp = $derived(t.hp ?? hpMax);
  const preview = $derived(amount && amount > 0 ? adjustHp(t, hpMax, KIND[kind].sign * amount).hp : null);

  function open(k: keyof typeof KIND) {
    kind = k;
    amount = null;
    dialog?.showModal();
  }

  function apply(e: SubmitEvent) {
    e.preventDefault();
    if (!amount || amount < 1) return;
    editor.checkpoint();
    editor.updateToken(t.id, adjustHp(t, hpMax, KIND[kind].sign * amount));
    dialog?.close();
  }
</script>

{#if hpMax}
  <div class="hp" class:down={hp === 0}>
    <div class="line">
      <span class="value">{hp} / {hpMax} TP{hp === 0 ? ' · besiegt' : ''}</span>
      <div class="bar"><span style="width: {(100 * hp) / hpMax}%"></span></div>
    </div>
    <div class="line">
      <button class="hurt" onclick={() => open('damage')}>⚔ Schaden</button>
      <button class="mend" onclick={() => open('heal')}>✚ Heilung</button>
    </div>
  </div>
{/if}

<dialog bind:this={dialog} class:heal={kind === 'heal'} onclick={(e) => e.target === dialog && dialog?.close()}>
  <form onsubmit={apply}>
    <h3>{KIND[kind].title} · {t.name}</h3>
    <!-- svelte-ignore a11y_autofocus -->
    <input type="number" min="1" inputmode="numeric" placeholder="Wert" aria-label={KIND[kind].title} autofocus bind:value={amount} />
    <p class="preview">
      {hp} TP{#if preview != null}{' → '}<strong class:zero={preview === 0}>{preview} TP</strong>{preview === 0 ? ' · besiegt' : ''}{/if}
    </p>
    <div class="actions">
      <button type="button" onclick={() => dialog?.close()}>Abbrechen</button>
      <button type="submit" class="ok" disabled={!amount || amount < 1}>{KIND[kind].verb}</button>
    </div>
  </form>
</dialog>

<style>
  .hp {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .value {
    min-width: 6.5rem;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .down .value {
    color: var(--danger);
  }
  .bar {
    flex: 1;
    height: 0.55rem;
    border-radius: 3px;
    background: var(--surface);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--red);
    transition: width 0.2s;
  }
  button {
    flex: 1;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0.3rem 0.5rem;
  }
  .hurt {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 45%, var(--border));
  }
  .mend {
    color: var(--green);
    border-color: color-mix(in srgb, var(--green) 45%, var(--border));
  }
  dialog {
    --accent: var(--danger);
    width: 16rem;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-top: 4px solid var(--accent);
    border-radius: 8px;
    background: var(--bg);
    color: var(--ink);
    box-shadow: 0 12px 32px rgba(20, 8, 0, 0.5);
  }
  dialog.heal {
    --accent: var(--green);
  }
  dialog::backdrop {
    background: rgba(20, 10, 0, 0.35);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.8rem 1rem 0.9rem;
  }
  h3 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1rem;
    color: var(--accent);
  }
  input {
    font-size: 1.6rem;
    font-weight: 700;
    text-align: center;
    padding: 0.2rem;
  }
  .preview {
    margin: 0;
    text-align: center;
    font-size: 0.85rem;
    color: var(--ink-muted);
  }
  .preview strong {
    color: var(--ink);
  }
  .preview .zero {
    color: var(--danger);
  }
  .actions {
    display: flex;
    gap: 0.4rem;
  }
  .ok {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
  }
  .ok:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
