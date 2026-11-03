<script lang="ts">
  /** Würfel als 3D-Körper, alle in einem Canvas; `roll` wechselt je Wurf, dann taumeln sie und landen mit `value` zur Kamera. */
  import * as THREE from 'three';
  import { untrack } from 'svelte';
  import { createDieModel, ROLL_MS, type DieModel, type Percentile } from './dieModel';

  export interface DieSpec {
    sides: number;
    value: number;
    /** Zählt nicht, z. B. der schlechtere W20 bei Vorteil. */
    dim?: boolean;
    /** Liegt schon und taumelt beim neuen `roll` nicht mit. */
    landed?: boolean;
  }

  let { dice, roll = 0, color, size = 70, gap = 8, columns, onlanded }: {
    dice: DieSpec[];
    roll?: number;
    /** Körperfarbe; ohne sie `--arcane`. */
    color?: string;
    size?: number;
    gap?: number;
    /** Höchstens so viele je Reihe; ohne Angabe so viele, wie in die Breite passen. */
    columns?: number;
    /** Alle Würfel des aktuellen `roll` liegen. */
    onlanded?: () => void;
  } = $props();

  const STAGGER = 90;
  const TENS_COLOR = '#2f5f7a';

  type Body = DieSpec & { percentile?: Percentile };

  /** Ein W100 liegt als Zehner- und Einer-W10 im Kasten; 100 zeigt „00“ und „0“. */
  function bodiesOf(spec: DieSpec): Body[] {
    if (spec.sides !== 100) return [spec];
    const face = (digit: number) => (digit === 0 ? 10 : digit);
    return [
      { ...spec, sides: 10, value: face(Math.floor((spec.value % 100) / 10)), percentile: 'tens' },
      { ...spec, sides: 10, value: face(spec.value % 10), percentile: 'units' },
    ];
  }
  const bodies = $derived(dice.flatMap(bodiesOf));

  let canvas = $state<HTMLCanvasElement>();
  let width = $state(0);
  let stage = $state.raw<{ renderer: THREE.WebGLRenderer; camera: THREE.Camera; scene: THREE.Scene } | null>(null);
  let models: DieModel[] = [];
  /** Startzeit je Würfel des laufenden Wurfs — ein `landed`-Würfel rollt damit zu Ende statt zu springen. */
  let starts: number[] = [];

  const pitch = $derived(size + gap);
  const cols = $derived(Math.max(1, Math.min(bodies.length, columns ?? Math.floor((width + gap) / pitch))));
  const rows = $derived(Math.ceil(bodies.length / cols));
  const canvasW = $derived(cols * pitch - gap);
  const canvasH = $derived(rows * pitch - gap);
  const signature = $derived(`${roll}|${color}|${bodies.map((d) => `${d.sides}:${d.value}:${d.dim ? 1 : 0}${d.landed ? 'l' : ''}`).join(',')}`);

  function css(name: string, fallback: string): string {
    return getComputedStyle(canvas!).getPropertyValue(name).trim() || fallback;
  }

  /** Jeder Würfel bekommt sein eigenes Feld mit derselben Kamera — so sieht jeder aus wie einzeln gerendert. */
  function draw() {
    if (!stage) return;
    const { renderer, scene, camera } = stage;
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    models.forEach((m, i) => {
      const x = (i % cols) * pitch;
      const y = canvasH - Math.floor(i / cols) * pitch - size;
      renderer.setViewport(x, y, size, size);
      renderer.setScissor(x, y, size, size);
      for (const o of models) o.root.visible = o === m;
      renderer.render(scene, camera);
    });
  }

  $effect(() => {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    camera.position.set(0, 0, 4.3);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff4e0, 0x3a2440, 2.0));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
    sun.position.set(2, 3, 4);
    scene.add(sun);
    stage = { renderer, camera, scene };
    return () => {
      stage = null;
      renderer.dispose();
    };
  });

  $effect(() => {
    if (!stage || !canvasW) return;
    stage.renderer.setSize(canvasW, canvasH, false);
    draw();
  });

  $effect(() => {
    void signature;
    const s = stage;
    if (!s) return;
    const palette = { body: color || css('--arcane', '#6d3b8e'), gold: css('--gold', '#786012'), danger: css('--danger', '#b3261e'), font: css('--font-display', 'serif') };
    const built = bodies.map((d) => createDieModel(d.sides, d.value, d.percentile === 'tens' ? { ...palette, body: TENS_COLOR } : palette, d.dim, d.percentile));
    for (const m of built) s.scene.add(m.root);
    models = built;
    let frame = 0;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const m of built) m.pose(ROLL_MS);
      draw();
      untrack(() => onlanded?.());
    } else {
      const start = performance.now();
      const first = bodies.filter((d) => d.landed).length;
      const prev = starts;
      starts = bodies.map((d, i) => (d.landed ? (prev[i] ?? -Infinity) : start + (i - first) * STAGGER));
      const end = Math.max(start, ...starts) + ROLL_MS;
      const mine = starts;
      const step = (now: number) => {
        built.forEach((m, i) => m.pose(now - mine[i]));
        draw();
        if (now < end) frame = requestAnimationFrame(step);
        else untrack(() => onlanded?.());
      };
      frame = requestAnimationFrame(step);
    }
    return () => {
      cancelAnimationFrame(frame);
      for (const m of built) {
        s.scene.remove(m.root);
        m.dispose();
      }
    };
  });
</script>

<span class="dice" class:fill={columns == null} bind:clientWidth={width} role="img" aria-label={dice.map((d) => `W${d.sides}: ${d.value}`).join(', ')}>
  <canvas bind:this={canvas} style="width: {canvasW}px; height: {canvasH}px" aria-hidden="true"></canvas>
</span>

<style>
  .dice { display: inline-block; vertical-align: middle; line-height: 0; }
  .dice.fill { display: block; width: 100%; }
  canvas { filter: drop-shadow(0 4px 5px rgba(40, 20, 0, 0.35)); }
</style>
