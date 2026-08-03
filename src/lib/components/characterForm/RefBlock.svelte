<script lang="ts" generics="T">
  /**
   * Feldgruppe für einen EINZELNEN Bibliotheks-Link (Volk, Hintergrund): Überschrift,
   * Altformat-Angebot, Picker und der Hinweis auf einen unverlinkten Freitext.
   */
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import LibraryRefPicker from './LibraryRefPicker.svelte';
  import './form.css';

  let {
    title,
    kindLabel,
    name,
    sourceKey,
    placeholder,
    editTitle,
    diff,
    hasFix,
    onfix,
    editing,
    search,
    label,
    onopen,
    oninput,
    onselect,
    onediting,
  }: {
    title: string;
    /** „als … anlegen" im Hinweis für unverlinkten Freitext. */
    kindLabel: string;
    name: string;
    sourceKey: string;
    placeholder: string;
    editTitle: string;
    diff: DiffDir;
    hasFix: boolean;
    onfix: () => void;
    editing: boolean;
    search: (query: string) => T[];
    label: (hit: T) => string;
    onopen: () => void;
    oninput: (value: string) => void;
    onselect: (hit: T) => void;
    onediting: (value: boolean) => void;
  } = $props();
</script>

<div class="ref-block species-block" use:diffMark={diff}>
  <h4>{title}</h4>
  {#if hasFix}
    <div class="legacy-banner">
      <span class="legacy-banner-text">
        Altes Freitext-Format erkannt: „{name}" lässt sich mit der Bibliothek verknüpfen.
      </span>
      <button type="button" class="legacy-banner-btn" onclick={onfix}>Verknüpfen</button>
    </div>
  {/if}
  <LibraryRefPicker
    {name}
    linked={!!sourceKey}
    {editing}
    {placeholder}
    {editTitle}
    wide
    {search}
    {label}
    {onopen}
    {oninput}
    {onselect}
    {onediting}
  />
  {#if !sourceKey && name.trim() && !hasFix}
    <p class="species-hint">Nicht in der Bibliothek verlinkt – aus der Liste wählen oder als {kindLabel} anlegen.</p>
  {/if}
</div>
