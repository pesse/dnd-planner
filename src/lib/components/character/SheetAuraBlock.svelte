<script lang="ts">
  import './sheet.css';
  import { ftToM } from '../../itemFormat';
  import { auraLinesDe, type CharacterAura } from '../../services/auras';

  let { auras }: { auras: CharacterAura[] } = $props();
</script>

<div class="section">
  <h3>Auren <small>du und Verbündete darin</small></h3>
  {#each auras as aura (aura.id)}
    <div class="aura">
      <div class="aura-head">
        <span class="aura-name">{aura.nameDe}</span>
        {#if aura.radiusFeet}<span class="tag">{ftToM(aura.radiusFeet)}</span>{/if}
      </div>
      <ul class="aura-effects">
        {#each auraLinesDe(aura) as line}<li>{line}</li>{/each}
      </ul>
    </div>
  {/each}
</div>

<style>
  h3 small { text-transform: none; letter-spacing: 0; font-weight: normal; }
  .aura + .aura { margin-top: 0.5rem; }
  .aura-head { display: flex; align-items: center; gap: 0.4rem; }
  .aura-name { font-weight: 600; color: var(--ink); }
  .aura-effects { margin: 0.2rem 0 0; padding-left: 1.1rem; font-size: 0.82rem; color: var(--ink-soft); }
</style>
