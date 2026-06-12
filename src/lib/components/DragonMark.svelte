<script lang="ts">
  // Dezentes heraldisches Drachen-Emblem als Inline-SVG.
  // Rendert plattformunabhängig (kein Emoji-Font nötig) und übernimmt die
  // aktuelle Textfarbe (currentColor), lässt sich also per CSS einfärben.
  let { size = 20, title = 'Drache' }: { size?: number; title?: string } = $props();
</script>

<svg
  class="dragon-mark"
  width={size}
  height={size}
  viewBox="0 0 64 64"
  fill="currentColor"
  role="img"
  aria-label={title}
  xmlns="http://www.w3.org/2000/svg"
>
  <path d="M4 30c0-6 4-11 10-12 2-4 7-7 13-7 1-3 4-5 7-5-1 2-1 4 0 6 4 1 7 4 8 8 5 1 9 5 10 10-3-2-6-3-9-2 2 2 3 5 3 8 0 2-1 4-2 6 3 0 6 2 7 5-3-1-6-1-9 0-2 4-6 7-11 7-2 2-5 3-8 3 2-2 3-4 3-7-4 1-8 0-11-3-3 1-6 0-8-2 3 0 5-1 7-3-5-1-9-5-10-10 3 2 6 2 9 1-2-2-3-4-3-6zm30-13c-1 0-2 1-2 2s1 2 2 2 2-1 2-2-1-2-2-2z"/>
  <path d="M40 4c3 1 5 3 6 6-2-1-5-1-7 0 0-2 0-4 1-6z" opacity="0.85"/>
</svg>

<style>
  .dragon-mark {
    display: inline-block;
    vertical-align: middle;
    flex-shrink: 0;
  }
</style>
