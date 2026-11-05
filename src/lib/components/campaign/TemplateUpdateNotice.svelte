<script lang="ts">
  /** Meldet beim Öffnen, dass ein Pack die Vorlage dieser Kampagne geändert hat, und baut sie auf Wunsch neu. */
  import { activeCampaign, invalidateVault } from '../../stores/campaign';
  import { confirmAction } from '../../stores/confirmDialog';
  import { navigateTo } from '../../services/navigation';
  import {
    dismissTemplateUpdate, pendingTemplateUpdate, rebuildFromTemplate, type TemplateUpdate,
  } from '../../services/templates/templateUpdate';
  import { CAMPAIGNS_PATH } from '../../services/templates/templates';
  import { slugToName } from '../../utils/text';

  let { campaignPath }: { campaignPath: string } = $props();

  let update = $state<TemplateUpdate | null>(null);
  let busy = $state(false);
  let error = $state('');

  $effect(() => {
    const slug = campaignPath;
    update = null;
    error = '';
    void pendingTemplateUpdate(slug)
      .then((u) => { if (slug === campaignPath) update = u; })
      .catch(() => {});
  });

  async function rebuild(replace: boolean) {
    if (!update) return;
    const ok = await confirmAction(replace
      ? {
          title: 'Kampagne überschreiben?',
          message: `„${slugToName(campaignPath)}" wird aus der neuen Vorlage neu aufgebaut. Alles, was ihr in der Kampagne selbst angelegt oder geändert habt – Sessions, Notizen, Tokens auf Karten –, geht verloren. Charaktere und abgehakte Abenteuer bleiben.`,
          confirmLabel: 'Überschreiben',
          danger: true,
        }
      : {
          title: 'Kampagne neu anlegen?',
          message: `Aus der neuen Vorlage entsteht eine zweite Kampagne mit denselben Charakteren und abgehakten Abenteuern. „${slugToName(campaignPath)}" bleibt unverändert.`,
          confirmLabel: 'Neu anlegen',
        });
    if (!ok) return;
    busy = true;
    error = '';
    try {
      const slug = await rebuildFromTemplate(campaignPath, update, replace);
      update = null;
      invalidateVault();
      activeCampaign.set({ id: slug, name: slugToName(slug), path: slug });
      await navigateTo({ name: 'campaign', path: `${CAMPAIGNS_PATH}/${slug}/campaign.md`, type: 'campaign' });
    } catch (e) {
      console.error('Kampagne konnte nicht neu aufgebaut werden:', e);
      error = 'Die Kampagne konnte nicht neu aufgebaut werden.';
    }
    busy = false;
  }

  async function dismiss() {
    if (!update) return;
    await dismissTemplateUpdate(campaignPath, update).catch(() => {});
    update = null;
  }
</script>

{#if update}
  <div class="legacy-banner notice" role="status">
    <span class="legacy-banner-text">
      Die Vorlage <strong>{update.template.name}</strong> wurde seit dem Anlegen dieser Kampagne durch ein
      Pack-Update geändert. Neu aufgebaut übernimmt die Kampagne die Änderungen.
      {#if error}<span class="error" role="alert">{error}</span>{/if}
    </span>
    <button type="button" class="legacy-banner-btn" disabled={busy} onclick={() => rebuild(false)}>Neu anlegen</button>
    <button type="button" class="legacy-banner-btn danger" disabled={busy} onclick={() => rebuild(true)}>Überschreiben</button>
    <button type="button" class="dismiss" disabled={busy} onclick={dismiss} title="Erst die nächste Änderung der Vorlage meldet sich wieder">Ignorieren</button>
  </div>
{/if}

<style>
  .notice {
    margin: 0.4rem 1rem;
  }
  .danger {
    border-color: var(--danger);
    background: var(--danger);
  }
  .dismiss {
    flex-shrink: 0;
    cursor: pointer;
    font: inherit;
    font-size: 0.8rem;
    padding: 0.25rem 0.5rem;
    border: none;
    background: none;
    color: var(--ink-muted);
    text-decoration: underline;
  }
  .error {
    display: block;
    color: var(--danger);
  }
</style>
