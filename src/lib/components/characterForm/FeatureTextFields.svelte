<script lang="ts">
  /**
   * Die beiden Merkmals-Freitextfelder des Bogens und ihre KI-Verdichtung. Rohstoff sind
   * die aus der Bibliothek aufgelösten DEUTSCHEN Merkmalstexte plus der bisherige
   * Feldinhalt; das jeweils andere Feld geht mit, damit keine Zeile doppelt landet.
   */
  import { llmConfig } from '../../stores/llm';
  import { runAiAction } from '../../services/aiActions/runner';
  import {
    buildFieldSummaryAction, buildFieldSummaryInput, SHEET_FIELDS, type SummaryFeature,
  } from '../../services/aiActions/fieldSummaryAction';
  import { resolveCharacterFeatures, type ResolvedFeatureGroup } from '../../services/characterFeatures';
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import type { Character } from '../../schemas/characterSchema';
  import './form.css';

  let { character, classFeatures = $bindable(), speciesTraits = $bindable(), saved, dirOf }: {
    character: Character;
    classFeatures: string;
    speciesTraits: string;
    saved?: Character | null;
    dirOf: (old: unknown, now: unknown) => DiffDir;
  } = $props();

  type SummaryField = keyof typeof SHEET_FIELDS;
  let busy = $state<SummaryField | null>(null);
  let error = $state('');
  // Vorfassung je Feld — ein Fehlgriff der KI bleibt damit zurücknehmbar.
  let undoText = $state<Partial<Record<SummaryField, string>>>({});

  function featuresOf(groups: ResolvedFeatureGroup[], source: SummaryFeature['source']): SummaryFeature[] {
    return groups.flatMap((g) =>
      g.features.map((f) => ({
        // Hier sind Name und Text schon aufgelöst und deutsch (Bibliothek) — anders als im
        // Wizard, der die englische Fassung durchreicht. `nameDe` trägt deshalb dasselbe.
        name: f.name,
        nameDe: f.name,
        desc: f.desc,
        source,
        group: g.title,
        ...(f.gainedAt != null ? { gainedAt: f.gainedAt } : {}),
        ...(f.choice ? { choice: f.choice } : {}),
      })),
    );
  }

  async function summarize(field: SummaryField) {
    if (busy) return;
    busy = field;
    error = '';
    try {
      // Einmal auflösen statt drei stehende Derived: die Merkmale wohnen in der
      // Seitenleiste, hier braucht es sie nur im Augenblick des Klicks.
      const resolved = await resolveCharacterFeatures($state.snapshot(character) as Character);
      const features = [
        ...featuresOf(resolved.classGroups, 'class'),
        ...featuresOf(resolved.speciesGroups, 'species'),
        ...featuresOf(resolved.backgroundGroups, 'background'),
        ...resolved.featEntries.map((f): SummaryFeature => ({
          name: f.name, desc: f.desc, source: 'feat',
          ...(f.gainedAt != null ? { gainedAt: f.gainedAt } : {}),
        })),
      ].filter((f) => f.name.trim() && f.desc.trim());

      const isClassField = field === 'classFeatures';
      const currentText = isClassField ? classFeatures : speciesTraits;
      const other = isClassField
        ? { label: SHEET_FIELDS.speciesTraits.label, text: speciesTraits }
        : { label: SHEET_FIELDS.classFeatures.label, text: classFeatures };

      const result = await runAiAction($llmConfig, buildFieldSummaryAction(),
        buildFieldSummaryInput({ target: SHEET_FIELDS[field], currentText, features, otherFields: [other] }));
      const text = result.text.trim();
      if (!text) {
        error = 'Die KI lieferte keinen Text — Feld unverändert.';
        return;
      }
      undoText = { ...undoText, [field]: currentText };
      if (isClassField) classFeatures = text;
      else speciesTraits = text;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = null;
    }
  }

  function undo(field: SummaryField) {
    const prev = undoText[field];
    if (prev === undefined) return;
    if (field === 'classFeatures') classFeatures = prev;
    else speciesTraits = prev;
    undoText = { ...undoText, [field]: undefined };
  }
</script>

{#snippet summaryBtn(field: SummaryField)}
  <span class="summary-actions">
    {#if undoText[field] !== undefined && busy !== field}
      <button class="ai-btn" onclick={() => undo(field)} title="Fassung vor der Zusammenfassung wiederherstellen">↩ Zurück</button>
    {/if}
    <button class="ai-btn" onclick={() => summarize(field)} disabled={busy !== null}
      title="Aus allen verlinkten Merkmalen und dem bisherigen Text eine knappe Fassung für den Bogen erzeugen">
      {busy === field ? '⏳ KI verdichtet…' : '✨ Zusammenfassen'}
    </button>
  </span>
{/snippet}

<div class="field-head">
  <h3>Klassenmerkmale & Eigenschaften</h3>
  {@render summaryBtn('classFeatures')}
</div>
<textarea class="ta-large" use:diffMark={dirOf(saved?.classFeatures, classFeatures)} bind:value={classFeatures} placeholder="Klassenmerkmale, Rasseneigenschaften…"></textarea>

<div class="field-head sub">
  <span class="field-title">Volksmerkmale</span>
  {@render summaryBtn('speciesTraits')}
</div>
<textarea class="ta-medium" aria-label="Volksmerkmale"
  use:diffMark={dirOf(saved?.personal?.rassenmerkmale, speciesTraits)}
  bind:value={speciesTraits} placeholder="Dunkelsicht, Zwergenresistenz, …"></textarea>

{#if error}<p class="summary-error">{error}</p>{/if}
