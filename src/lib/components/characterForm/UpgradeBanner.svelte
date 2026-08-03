<script lang="ts">
  /**
   * Sammel-Angebot am Kopf des Formulars: Schemaversion der DATEI plus alles, was sich
   * noch mit der Bibliothek verknüpfen lässt. Geschrieben wird über die Speichern-Leiste.
   */
  import type { PendingCharacterUpgrade } from '../../schemas/characterUpgrades';
  import './form.css';

  let { pendingUpgrade, fixLabels, upgradeAccepted, onapply }: {
    pendingUpgrade?: PendingCharacterUpgrade | null;
    fixLabels: string[];
    upgradeAccepted: boolean;
    onapply: () => void;
  } = $props();
</script>

{#if pendingUpgrade || fixLabels.length}
  <div class="legacy-banner upgrade-banner">
    <span class="legacy-banner-text">
      {#if pendingUpgrade}
        Diese Datei liegt im Format <strong>v{pendingUpgrade.fromVersion}</strong> vor
        (aktuell: <strong>v{pendingUpgrade.toVersion}</strong>).
      {:else}
        Dieser Charakter lässt sich vollständiger mit der Bibliothek verknüpfen.
      {/if}
      <ul class="upgrade-steps">
        {#if pendingUpgrade}
          {#each pendingUpgrade.applied as step}<li>{step}</li>{/each}
          {#if !pendingUpgrade.applied.length}<li>Versionsstempel nachtragen</li>{/if}
        {/if}
        {#each fixLabels as label}<li>{label}</li>{/each}
      </ul>
    </span>
    {#if pendingUpgrade && upgradeAccepted && !fixLabels.length}
      <span class="upgrade-done">✓ Wird beim Speichern übernommen</span>
    {:else}
      <button type="button" class="legacy-banner-btn" onclick={onapply}
        title="Übernimmt alles hier Aufgeführte — geschrieben wird über Speichern.">
        Alles umstellen
      </button>
    {/if}
  </div>
{/if}
