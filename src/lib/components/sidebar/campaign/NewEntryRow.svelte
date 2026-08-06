<script lang="ts">
  import '../tree.css';

  let { value = $bindable(), placeholder, onkeydown, onconfirm, rowClass = '', rowStyle = '' }: {
    value: string;
    placeholder: string;
    onkeydown: (e: KeyboardEvent) => void;
    onconfirm: (e: MouseEvent) => void;
    rowClass?: string;
    rowStyle?: string;
  } = $props();
</script>

<div class="new-file-row {rowClass}" style={rowStyle}>
  <input class="new-file-input" bind:value {placeholder} {onkeydown} autofocus />
  <button class="confirm-btn" onclick={onconfirm}>✓</button>
</div>
