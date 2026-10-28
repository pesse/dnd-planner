<script lang="ts">
  import { navigateTo } from '../../services/navigation';
  import { formatClassLevel } from '../../schemas/classLevelText';
  import { speciesDisplayName, type SpeciesInfo } from '../../speciesLibrary';
  import { backgroundDisplayName, type BackgroundInfo } from '../../backgroundsLibrary';
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import type { CharacterFormFields } from '../../services/characterFormFields';
  import type { FormLibraries } from '../../services/characterFormLibraries.svelte';
  import type { LegacyFix, LegacyFixKind } from '../../services/characterLegacyLinks';
  import type { Character } from '../../schemas/characterSchema';
  import RefSelect from './RefSelect.svelte';
  import ClassLevelTable from './ClassLevelTable.svelte';

  // Der offene Klassen-Picker liegt hier, nicht im Eltern-Formular: `applyFix` von dort
  // schließt ihn über dasselbe `$bindable`-Feld.
  let {
    form, saved, dirOf, libs, fixOf, onApplyFix,
    editingClassRow = $bindable(-1),
  }: {
    form: CharacterFormFields;
    saved?: Character | null;
    dirOf(o: unknown, n: unknown): DiffDir;
    libs: FormLibraries;
    fixOf(kind: LegacyFixKind): LegacyFix | undefined;
    onApplyFix(fix: LegacyFix | undefined): void;
    editingClassRow?: number;
  } = $props();

  const classLevelPreview = $derived(formatClassLevel(form.classes));

  async function openLibraryPage(path: string | undefined, type: 'species' | 'background') {
    if (!path) return;
    await navigateTo({ name: path.split('/').pop()!.replace('.json', ''), path, type });
  }

  function selectSpecies(info: SpeciesInfo | null) {
    form.species.name = info ? speciesDisplayName(info) : '';
    form.species.sourceKey = info?.key ?? '';
    form.species.subspeciesKey = undefined;
    form.species.subspeciesName = undefined;
    form.race = form.species.name;
  }

  function selectBackground(info: BackgroundInfo | null) {
    form.backgroundRef.name = info ? backgroundDisplayName(info) : '';
    form.backgroundRef.sourceKey = info?.key ?? '';
    form.background = form.backgroundRef.name;
  }
</script>

<section>
  <div class="grid-3">
    <label use:diffMark={dirOf(saved?.name, form.name)}>Name<input bind:value={form.name} placeholder="Charaktername" /></label>
    <label use:diffMark={dirOf(saved?.playerName, form.playerName)}>Spieler<input bind:value={form.playerName} placeholder="Spielername" /></label>
    <label use:diffMark={dirOf(saved?.xp, form.xp)}>EP<input bind:value={form.xp} placeholder="0" /></label>
  </div>

  <div class="ref-pair">
    <RefSelect
      title="Hintergrund"
      options={libs.backgrounds}
      label={backgroundDisplayName}
      name={form.backgroundRef.name}
      sourceKey={form.backgroundRef.sourceKey}
      diff={dirOf(saved?.background, form.background)}
      hasFix={!!fixOf('background')}
      onfix={() => onApplyFix(fixOf('background'))}
      onopen={() => openLibraryPage(libs.backgrounds.find((b) => b.key === form.backgroundRef.sourceKey)?.path, 'background')}
      onselect={selectBackground}
    />
    <RefSelect
      title="Volk"
      options={libs.species}
      label={speciesDisplayName}
      name={form.species.name}
      sourceKey={form.species.sourceKey}
      diff={dirOf(saved?.race, form.race)}
      hasFix={!!fixOf('species')}
      onfix={() => onApplyFix(fixOf('species'))}
      onopen={() => openLibraryPage(libs.species.find((s) => s.key === form.species.sourceKey)?.path, 'species')}
      onselect={selectSpecies}
    />
  </div>

  <ClassLevelTable
    classes={form.classes}
    classIndex={libs.classes}
    diff={dirOf(saved?.classLevel, classLevelPreview)}
    fixLabel={fixOf('classes')?.label}
    onfix={() => onApplyFix(fixOf('classes'))}
    editingRow={editingClassRow}
    oneditingRow={(row) => (editingClassRow = row)}
  />
</section>
