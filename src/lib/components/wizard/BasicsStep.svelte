<script lang="ts">
  import './wizard.css';
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import { classDisplayName, type ClassNode } from '../../classLibrary';
  import { speciesDisplayName, type SpeciesInfo } from '../../speciesLibrary';
  import { backgroundDisplayName, type BackgroundInfo } from '../../backgroundsLibrary';

  let { w, classes, speciesList, backgroundList }: {
    w: CharacterWizard;
    classes: ClassNode[];
    speciesList: SpeciesInfo[];
    backgroundList: BackgroundInfo[];
  } = $props();

  function selectClass(key: string) {
    const node = classes.find((n) => n.key === key);
    w.klass = { sourceKey: key, name: node ? classDisplayName(node) : '' };
  }
  function selectSpecies(key: string) {
    const info = speciesList.find((s) => s.key === key);
    w.species = { sourceKey: key, name: info ? speciesDisplayName(info) : '' };
  }
  function selectBackground(key: string) {
    const info = backgroundList.find((b) => b.key === key);
    w.background = { sourceKey: key, name: info ? backgroundDisplayName(info) : '' };
  }
</script>

<label class="field">
  <span>Name</span>
  <input type="text" bind:value={w.name} placeholder="Charaktername" autofocus />
</label>
<label class="field">
  <span>Spielername (optional)</span>
  <input type="text" bind:value={w.playerName} placeholder="Spielername" />
</label>

<label class="field">
  <span>Klasse</span>
  <select value={w.klass.sourceKey} onchange={(e) => selectClass(e.currentTarget.value)}>
    <option value="">— Klasse wählen —</option>
    {#each classes as node}
      <option value={node.key}>{classDisplayName(node)}</option>
    {/each}
  </select>
</label>

<label class="field">
  <span>Volk</span>
  <select value={w.species.sourceKey} onchange={(e) => selectSpecies(e.currentTarget.value)}>
    <option value="">— Volk wählen —</option>
    {#each speciesList as info}
      <option value={info.key}>{speciesDisplayName(info)}</option>
    {/each}
  </select>
</label>

<label class="field">
  <span>Hintergrund</span>
  <select value={w.background.sourceKey} onchange={(e) => selectBackground(e.currentTarget.value)}>
    <option value="">— Hintergrund wählen —</option>
    {#each backgroundList as info}
      <option value={info.key}>{backgroundDisplayName(info)}</option>
    {/each}
  </select>
</label>
<p class="hint">Die Unterklasse wird erst ab Stufe 3 gewählt. Sobald Volk, Klasse und Hintergrund stehen, arbeitet die KI im Hintergrund weiter, während du die nächsten Schritte machst.</p>
