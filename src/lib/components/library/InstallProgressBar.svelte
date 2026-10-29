<script lang="ts">
  import { PHASE_LABEL, progressShare, type InstallProgress } from '../../stores/libraries';

  let { progress, compact = false }: { progress: InstallProgress | undefined; compact?: boolean } = $props();

  const pct = $derived(Math.round(progressShare(progress) * 100));
  const mib = (bytes: number) => (bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0);
  const detail = $derived.by(() => {
    if (!progress) return 'Starte…';
    const { phase, done, total } = progress;
    if (phase === 'download') return `${PHASE_LABEL.download} … ${mib(done)} / ${mib(total)} MB`;
    if (phase === 'write') return `${PHASE_LABEL.write} … ${done} / ${total}`;
    return `${PHASE_LABEL.unpack} …`;
  });
</script>

<div class="install-progress" class:compact title={compact ? `${detail} (${pct} %)` : undefined}>
  <div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}>
    <div class="bar" class:busy={progress?.phase === 'unpack'} style="width: {pct}%"></div>
  </div>
  {#if !compact}<span class="detail">{detail} · {pct} %</span>{/if}
</div>

<style>
  .install-progress { display: flex; flex-direction: column; gap: 0.2rem; }
  .track { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
  .compact .track { height: 3px; }
  .bar { height: 100%; background: var(--gold); transition: width 0.2s ease; }
  .bar.busy { animation: busy-pulse 0.9s ease-in-out infinite alternate; }
  @keyframes busy-pulse { to { opacity: 0.45; } }
  .detail { font-size: 0.7rem; color: var(--ink-muted); }
</style>
