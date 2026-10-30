<script lang="ts">
  import './wizard.css';
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import { COMMON_LANGUAGE, STANDARD_LANGUAGE_PICKS } from '../../services/wizard/personal';
  import LanguagePicker from '../LanguagePicker.svelte';

  let { w }: { w: CharacterWizard } = $props();
</script>

<p class="hint">
  Jeder Charakter spricht die <strong>{COMMON_LANGUAGE}</strong>. Dazu wählst du {STANDARD_LANGUAGE_PICKS} weitere
  Standardsprachen — zum Beispiel die deines Volkes. Merkmale wie die Diebessprache des Schurken kommen automatisch hinzu.
</p>
<LanguagePicker
  selected={w.languages}
  max={STANDARD_LANGUAGE_PICKS}
  known={[COMMON_LANGUAGE]}
  rareCaveat="Seltene Sprachen lernt man normalerweise nur über Merkmale. Wähle eine davon nur, wenn deine Spielleitung zustimmt — sie zählt dann als eine deiner {STANDARD_LANGUAGE_PICKS} Sprachen."
  onchange={(next) => (w.languages = next)}
/>
