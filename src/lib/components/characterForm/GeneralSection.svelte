<script lang="ts">
  import { activeFile } from '../../stores/campaign';
  import { confirmNavigation } from '../../stores/navigationGuard';
  import { formatClassLevel } from '../../schemas/classLevelText';
  import { speciesDisplayName, searchSpecies, type SpeciesInfo } from '../../speciesLibrary';
  import { backgroundDisplayName, searchBackgrounds, type BackgroundInfo } from '../../backgroundsLibrary';
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import type { CharacterFormFields } from '../../services/characterFormFields';
  import type { FormLibraries } from '../../services/characterFormLibraries.svelte';
  import type { LegacyFix, LegacyFixKind } from '../../services/characterLegacyLinks';
  import type { Character } from '../../schemas/characterSchema';
  import RefBlock from './RefBlock.svelte';
  import ClassLevelTable from './ClassLevelTable.svelte';

  // Der offene Picker liegt hier, nicht im Eltern-Formular: `applyFix` von dort
  // schließt ihn über dieselben `$bindable`-Felder.
  let {
    form, saved, dirOf, libs, fixOf, onApplyFix,
    editingClassRow = $bindable(-1),
    editingSpecies = $bindable(!form.species.sourceKey && !form.species.name.trim()),
    editingBackground = $bindable(!form.backgroundRef.sourceKey && !form.backgroundRef.name.trim()),
  }: {
    form: CharacterFormFields;
    saved?: Character | null;
    dirOf(o: unknown, n: unknown): DiffDir;
    libs: FormLibraries;
    fixOf(kind: LegacyFixKind): LegacyFix | undefined;
    onApplyFix(fix: LegacyFix | undefined): void;
    editingClassRow?: number;
    editingSpecies?: boolean;
    editingBackground?: boolean;
  } = $props();

  const classLevelPreview = $derived(formatClassLevel(form.classes));

  async function openLibraryPage(path: string | undefined, type: 'species' | 'background') {
    if (!path) return;
    if (!(await confirmNavigation())) return; // ungespeicherte Charakter-Änderungen
    activeFile.set({ name: path.split('/').pop()!.replace('.json', ''), path, type });
  }

  function selectSpecies(info: SpeciesInfo) {
    form.species.name = speciesDisplayName(info);
    form.species.sourceKey = info.key ?? '';
    form.species.subspeciesKey = undefined;
    form.species.subspeciesName = undefined;
    form.race = form.species.name;
    editingSpecies = false;
  }

  function selectBackground(info: BackgroundInfo) {
    form.backgroundRef.name = backgroundDisplayName(info);
    form.backgroundRef.sourceKey = info.key ?? '';
    form.background = form.backgroundRef.name;
    editingBackground = false;
  }
</script>

<section>
  <h3>Allgemein</h3>
  <div class="grid-2">
    <label use:diffMark={dirOf(saved?.name, form.name)}>Name<input bind:value={form.name} placeholder="Charaktername" /></label>
    <label use:diffMark={dirOf(saved?.playerName, form.playerName)}>Spieler<input bind:value={form.playerName} placeholder="Spielername" /></label>
    <label use:diffMark={dirOf(saved?.xp, form.xp)}>EP<input bind:value={form.xp} placeholder="0" /></label>
  </div>

  <RefBlock
    title="Hintergrund"
    kindLabel="Hintergrund"
    name={form.backgroundRef.name}
    sourceKey={form.backgroundRef.sourceKey}
    placeholder="z.B. Soldat"
    editTitle="Hintergrund ändern"
    diff={dirOf(saved?.background, form.background)}
    hasFix={!!fixOf('background')}
    onfix={() => onApplyFix(fixOf('background'))}
    editing={editingBackground}
    search={(q) => searchBackgrounds(libs.backgrounds, q, 8)}
    label={backgroundDisplayName}
    onopen={() => openLibraryPage(libs.backgrounds.find((b) => b.key === form.backgroundRef.sourceKey)?.path, 'background')}
    oninput={(v) => { form.backgroundRef.name = v; form.background = v; form.backgroundRef.sourceKey = ''; }}
    onselect={selectBackground}
    onediting={(v) => (editingBackground = v)}
  />

  <RefBlock
    title="Volk"
    kindLabel="Volk"
    name={form.species.name}
    sourceKey={form.species.sourceKey}
    placeholder="z.B. Zwerg"
    editTitle="Volk ändern"
    diff={dirOf(saved?.race, form.race)}
    hasFix={!!fixOf('species')}
    onfix={() => onApplyFix(fixOf('species'))}
    editing={editingSpecies}
    search={(q) => searchSpecies(libs.species, q, 8)}
    label={speciesDisplayName}
    onopen={() => openLibraryPage(libs.species.find((s) => s.key === form.species.sourceKey)?.path, 'species')}
    oninput={(v) => { form.species.name = v; form.race = v; form.species.sourceKey = ''; }}
    onselect={selectSpecies}
    onediting={(v) => (editingSpecies = v)}
  />

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
