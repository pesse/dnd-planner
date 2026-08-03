<script lang="ts">
  /** Münzsorten des Bogens — deutsche Schlüssel, weil sie das PDF-Formular diktiert. */
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import type { Character } from '../../schemas/characterSchema';
  import './form.css';

  type Currency = Character['currency'];

  let { currency, savedCurrency, dirOf }: {
    currency: Currency;
    savedCurrency?: Currency;
    dirOf: (old: unknown, now: unknown) => DiffDir;
  } = $props();

  const COINS: [keyof Currency, string][] = [
    ['km', 'Kupfer'], ['sm', 'Silber'], ['em', 'Elektrum'], ['gm', 'Gold'], ['pm', 'Platin'],
  ];
</script>

<div class="currency-row">
  {#each COINS as [key, label]}
    <label class="coin-label" use:diffMark={dirOf(savedCurrency?.[key], currency[key])}>
      {label}
      <input class="coin-input" bind:value={currency[key]} />
    </label>
  {/each}
</div>
