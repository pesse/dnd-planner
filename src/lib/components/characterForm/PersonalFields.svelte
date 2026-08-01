<script lang="ts">
  /** Persönliches: Alter, Gesinnung, Größe, Aussehen — die deutschen Bogen-Felder. */
  import { CHARACTER_ALIGNMENTS_DE, SIZE_CATEGORIES_DE } from '../../types';
  import { withCurrent } from '../../services/characterFormFields';
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import type { PersonalData } from '../../schemas/characterSchema';
  import './form.css';

  let { personal, savedPersonal, dirOf }: {
    personal: PersonalData;
    savedPersonal?: PersonalData;
    dirOf: (old: unknown, now: unknown) => DiffDir;
  } = $props();

  const gesinnungOptions = $derived(withCurrent(CHARACTER_ALIGNMENTS_DE, personal.gesinnung));
  const sizeCatOptions = $derived(withCurrent(SIZE_CATEGORIES_DE, personal.sizeCat));
</script>

<div class="personal-fields">
  <label use:diffMark={dirOf(savedPersonal?.alter, personal.alter)}>Alter<input bind:value={personal.alter} placeholder="32" /></label>
  <label use:diffMark={dirOf(savedPersonal?.geschlecht, personal.geschlecht)}>Geschlecht<input bind:value={personal.geschlecht} placeholder="männlich" /></label>
  <label use:diffMark={dirOf(savedPersonal?.gesinnung, personal.gesinnung)}>Gesinnung
    <select bind:value={personal.gesinnung}>
      <option value="">—</option>
      {#each gesinnungOptions as a}<option value={a}>{a}</option>{/each}
    </select>
  </label>
  <label use:diffMark={dirOf(savedPersonal?.glaube, personal.glaube)}>Glaube<input bind:value={personal.glaube} placeholder="Moradin" /></label>
  <label use:diffMark={dirOf(savedPersonal?.sizeCat, personal.sizeCat)}>Größenkategorie
    <select bind:value={personal.sizeCat}>
      <option value="">—</option>
      {#each sizeCatOptions as s}<option value={s}>{s}</option>{/each}
    </select>
  </label>
  <label use:diffMark={dirOf(savedPersonal?.koerpergroesse, personal.koerpergroesse)}>Körpergröße<input bind:value={personal.koerpergroesse} placeholder="1,30 m" /></label>
  <label use:diffMark={dirOf(savedPersonal?.gewicht, personal.gewicht)}>Gewicht<input bind:value={personal.gewicht} placeholder="65 kg" /></label>
  <label use:diffMark={dirOf(savedPersonal?.augenfarbe, personal.augenfarbe)}>Augenfarbe<input bind:value={personal.augenfarbe} placeholder="braun" /></label>
  <label use:diffMark={dirOf(savedPersonal?.haarfarbe, personal.haarfarbe)}>Haarfarbe<input bind:value={personal.haarfarbe} placeholder="schwarz" /></label>
  <label use:diffMark={dirOf(savedPersonal?.hautfarbe, personal.hautfarbe)}>Hautfarbe<input bind:value={personal.hautfarbe} placeholder="hell" /></label>
  <label use:diffMark={dirOf(savedPersonal?.lebensstil, personal.lebensstil)}>Lebensstil<input bind:value={personal.lebensstil} placeholder="bescheiden" /></label>
  <label use:diffMark={dirOf(savedPersonal?.taeglicheKosten, personal.taeglicheKosten)}>Tägliche Kosten<input bind:value={personal.taeglicheKosten} placeholder="1 GM" /></label>
</div>
