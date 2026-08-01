<script lang="ts">
  /** Die sechs Attributs-Kästchen mit dem Modifikator darüber. */
  import { sign } from '../../utils/num';
  import { mod } from '../../services/characterFormFields';
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import './form.css';

  let {
    str = $bindable(), ges = $bindable(), kon = $bindable(),
    int = $bindable(), wei = $bindable(), cha = $bindable(),
    dirOf,
  }: {
    str: number; ges: number; kon: number; int: number; wei: number; cha: number;
    dirOf: (key: string, value: number) => DiffDir;
  } = $props();

  const boxes = $derived([
    { key: 'str', label: 'STR', value: str, set: (v: number) => (str = v) },
    { key: 'ges', label: 'GES', value: ges, set: (v: number) => (ges = v) },
    { key: 'kon', label: 'KON', value: kon, set: (v: number) => (kon = v) },
    { key: 'int', label: 'INT', value: int, set: (v: number) => (int = v) },
    { key: 'wei', label: 'WEI', value: wei, set: (v: number) => (wei = v) },
    { key: 'cha', label: 'CHA', value: cha, set: (v: number) => (cha = v) },
  ]);
</script>

<div class="attr-row">
  {#each boxes as box}
    <div class="attr-box" use:diffMark={dirOf(box.key, box.value)}>
      <span class="attr-mod-display">{sign(mod(box.value))}</span>
      <span class="attr-label">{box.label}</span>
      <input
        class="attr-input"
        type="number"
        min="1" max="30"
        value={box.value}
        oninput={(e) => box.set(Number(e.currentTarget.value))}
      />
    </div>
  {/each}
</div>
