<script lang="ts">
  /** Die Abenteuer einer aus einer Vorlage angelegten Kampagne zum Abhaken. */
  import { invalidateVault } from '../../stores/campaign';
  import { readCampaignTemplate, readProgress, setChapterCompleted } from '../../services/templates/chapters';
  import type { CampaignProgress } from '../../schemas/campaignProgress';
  import type { CampaignTemplate } from '../../schemas/template';

  let { campaignPath }: { campaignPath: string } = $props();

  let progress = $state<CampaignProgress | null>(null);
  let template = $state<CampaignTemplate | null>(null);
  let busy = $state('');
  let error = $state('');

  $effect(() => {
    const slug = campaignPath;
    progress = null;
    template = null;
    void readProgress(slug).then(async (p) => {
      const t = p ? await readCampaignTemplate(p.template) : null;
      if (slug !== campaignPath) return;
      progress = p;
      template = t;
    });
  });

  async function toggle(chapter: string, done: boolean) {
    if (!progress) return;
    busy = chapter;
    error = '';
    try {
      progress = await setChapterCompleted(campaignPath, progress, chapter, done);
      if (done) invalidateVault();
    } catch {
      error = 'Der Fortschritt konnte nicht gespeichert werden.';
    }
    busy = '';
  }
</script>

{#if progress && template?.chapters.length}
  <section class="progress" aria-label="Abenteuer">
    <span class="label">Abenteuer</span>
    {#each template.chapters as ch (ch.id)}
      {@const done = progress.completed.includes(ch.id)}
      <label class="chapter" class:done title={template.playerEditionOf && !done ? 'Abhaken liefert nach, was ihr dort erfahren habt' : ''}>
        <input type="checkbox" checked={done} disabled={!!busy} onchange={(e) => toggle(ch.id, e.currentTarget.checked)} />
        <span>{ch.title}</span>
        <span class="level">Stufe {ch.level}</span>
      </label>
    {/each}
    {#if error}<span class="error" role="alert">{error}</span>{/if}
  </section>
{/if}

<style>
  .progress {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 1rem;
    padding: 0.4rem 1rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.85rem;
  }
  .label {
    font-family: var(--font-display);
    color: var(--ink-soft);
  }
  .chapter {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    cursor: pointer;
  }
  .chapter.done span:first-of-type {
    color: var(--ink-muted);
  }
  .level {
    font-size: 0.75rem;
    color: var(--ink-muted);
  }
  .error {
    color: var(--danger);
  }
</style>
