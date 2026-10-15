<script lang="ts">
  let { progress }: { progress: number } = $props();
</script>

<div class="loading" role="status" aria-live="polite">
  <div class="sigil" aria-hidden="true">
    <span class="ring"></span>
    <span class="gem"></span>
  </div>
  <p class="title">Die Chronik wird aufgeschlagen …</p>
  <div class="bar" aria-hidden="true"><span style:width="{Math.round(progress * 100)}%"></span></div>
</div>

<style>
  .loading {
    position: fixed; inset: 0; z-index: 1000; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 1.1rem;
    background: radial-gradient(ellipse at 50% 45%, var(--surface) 0%, var(--bg) 70%);
    color: var(--ink); animation: fade-in 0.25s ease-out;
  }
  .sigil { position: relative; width: 5.5rem; height: 5.5rem; display: grid; place-items: center; }
  .ring {
    position: absolute; inset: 0; border-radius: 50%;
    border: 2px dashed color-mix(in srgb, var(--gold) 80%, transparent);
    animation: spin 6s linear infinite;
  }
  .ring::after {
    content: ''; position: absolute; inset: 0.55rem; border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--arcane) 55%, transparent);
    animation: spin 3s linear infinite reverse;
  }
  .gem {
    width: 2.6rem; height: 2.6rem; background: url('/branding/wizard/gem-on.png') center / contain no-repeat;
    animation: pulse 1.4s ease-in-out infinite;
  }
  .title { margin: 0; font-family: var(--font-display); font-size: 1.05rem; letter-spacing: 0.04em; color: var(--ink-soft); }
  .bar { width: min(14rem, 60vw); height: 3px; border-radius: 2px; background: var(--border); overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--gold); transition: width 0.2s ease; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse {
    0%, 100% { transform: scale(0.92); filter: drop-shadow(0 0 3px color-mix(in srgb, var(--arcane) 40%, transparent)); }
    50% { transform: scale(1.06); filter: drop-shadow(0 0 12px color-mix(in srgb, var(--arcane) 75%, transparent)); }
  }
  @keyframes fade-in { from { opacity: 0; } }
</style>
