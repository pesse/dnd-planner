<script lang="ts">
  /** Ein Würfel als 3D-Körper; `roll` wechselt je Wurf, er taumelt und landet mit `value` zur Kamera. */
  import * as THREE from 'three';
  import { buildDie, restingRotation, type DieFace } from './geometry';

  let { sides, value, roll = 0, delay = 0, color }: {
    sides: number; value: number; roll?: number; delay?: number;
    /** Körperfarbe; ohne sie `--arcane`. */
    color?: string;
  } = $props();

  const DURATION = 900;
  const GLOW_FADE = 300;
  const GLOW = 1;
  /** Innenkante des Rahmens als Anteil des Wegs von der Ecke zur Flächenmitte. */
  const RING = 0.2;
  const TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, -0.18, 0));

  let canvas: HTMLCanvasElement;
  let rolling = $state(false);
  let scene: { renderer: THREE.WebGLRenderer; camera: THREE.Camera; root: THREE.Scene; die: THREE.Group; faces: DieFace[]; glows: Map<DieFace, THREE.Mesh> } | null = $state.raw(null);

  function css(name: string): string {
    return getComputedStyle(canvas).getPropertyValue(name).trim();
  }

  function labelTexture(n: number): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.font = `700 ${n >= 10 ? 66 : 84}px ${css('--font-display') || 'serif'}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(30, 10, 40, 0.55)';
    g.fillStyle = '#fff';
    g.strokeText(String(n), 64, 68);
    g.fillText(String(n), 64, 68);
    // 6 und 9 sind auf jedem Würfel mit beiden Zahlen nur am Strich zu unterscheiden.
    if ((n === 6 || n === 9) && sides >= 9) g.fillRect(44, 106, 40, 7);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  function label(face: DieFace): THREE.Mesh {
    const size = face.inradius * 1.9;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: labelTexture(face.value), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    const right = new THREE.Vector3().crossVectors(face.up, face.normal);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, face.up, face.normal));
    mesh.position.copy(face.center).addScaledVector(face.normal, 0.002);
    mesh.renderOrder = 2;
    return mesh;
  }

  /** Goldener Rahmen um die Fläche und eine leichte Aufhellung darin; sichtbar, wenn sie oben liegt. */
  function glow(face: DieFace, body: THREE.Color): THREE.Mesh {
    const lift = face.normal.clone().multiplyScalar(0.001);
    const outer = face.outline.map((v) => v.clone().add(lift));
    const inner = outer.map((v) => v.clone().lerp(face.center.clone().add(lift), RING));
    const gold = new THREE.Color(css('--gold') || '#786012').lerp(new THREE.Color('#ffc93c'), 0.6);
    // Auf einem goldfarbenen Körper (Paladin) verschwände der Rahmen — dort ist er hell.
    const hue = (c: THREE.Color) => c.getHSL({ h: 0, s: 0, l: 0 }).h;
    const ring = Math.abs(hue(body) - hue(gold)) < 0.05 ? new THREE.Color('#fff3d0') : gold;
    const pos: THREE.Vector3[] = [], col: number[] = [];
    const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color, alpha: number) => {
      pos.push(a, b, c);
      for (let k = 0; k < 3; k++) col.push(color.r, color.g, color.b, alpha);
    };
    const white = new THREE.Color('#ffffff');
    outer.forEach((o, i) => {
      const j = (i + 1) % outer.length;
      tri(o, outer[j], inner[j], ring, 1);
      tri(o, inner[j], inner[i], ring, 1);
      if (i > 0 && i < inner.length - 1) tri(inner[0], inner[i], inner[i + 1], white, 0.22);
    });
    const geo = new THREE.BufferGeometry().setFromPoints(pos);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1;
    return mesh;
  }

  $effect(() => {
    const px = canvas.clientWidth;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(px, px, false);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    camera.position.set(0, 0, 4.3);
    const root = new THREE.Scene();
    root.add(new THREE.HemisphereLight(0xfff4e0, 0x3a2440, 2.0));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
    sun.position.set(2, 3, 4);
    root.add(sun);

    const { geometry, faces } = buildDie(sides);
    const die = new THREE.Group();
    const body = new THREE.Color(color || css('--arcane') || '#6d3b8e');
    die.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: body, roughness: 0.42, metalness: 0.12, flatShading: true,
    })));
    die.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 10), new THREE.LineBasicMaterial({ color: css('--gold') || '#786012' })));
    const glows = new Map(faces.map((f) => [f, glow(f, body)]));
    for (const f of faces) die.add(glows.get(f)!, label(f));
    root.add(die);
    scene = { renderer, camera, root, die, faces, glows };

    return () => {
      scene = null;
      root.traverse((o) => {
        if (!(o instanceof THREE.Mesh || o instanceof THREE.LineSegments)) return;
        o.geometry.dispose();
        const m = o.material as THREE.Material & { map?: THREE.Texture | null };
        m.map?.dispose();
        m.dispose();
      });
      renderer.dispose();
    };
  });

  $effect(() => {
    void roll;
    const s = scene, final = value;
    if (!s) return;
    const hits = s.faces.filter((f) => f.value === final);
    const face = hits[Math.floor(Math.random() * hits.length)] ?? s.faces[0];
    const rest = TILT.clone().multiply(restingRotation(face));
    const render = () => s.renderer.render(s.root, s.camera);
    const lit = s.glows.get(face)!.material as THREE.MeshBasicMaterial;
    for (const g of s.glows.values()) (g.material as THREE.MeshBasicMaterial).opacity = 0;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      s.die.quaternion.copy(rest);
      lit.opacity = GLOW;
      render();
      return;
    }
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const turns = (3 + Math.random() * 2) * Math.PI * 2;
    const spin = new THREE.Quaternion();
    let frame = 0;
    const start = performance.now() + delay;
    rolling = true;
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / DURATION));
      lit.opacity = GLOW * Math.min(1, Math.max(0, (now - start - DURATION) / GLOW_FADE));
      const ease = 1 - (1 - t) ** 3;
      s.die.quaternion.copy(spin.setFromAxisAngle(axis, turns * (1 - ease))).multiply(rest);
      s.die.position.set(-0.35 * (1 - ease), 0.45 * Math.abs(Math.cos(t * 2.5 * Math.PI)) * (1 - t) ** 2, 0);
      s.die.scale.setScalar(0.6 + 0.4 * Math.min(1, t * 3));
      render();
      if (t >= 1) rolling = false;
      if (now < start + DURATION + GLOW_FADE) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  });
</script>

<span class="die" class:max={!rolling && value === sides} class:min={!rolling && value === 1} role="img" aria-label="W{sides}: {value}">
  <canvas bind:this={canvas} aria-hidden="true"></canvas>
</span>

<style>
  .die { display: inline-block; width: 4.4rem; height: 4.4rem; filter: drop-shadow(0 4px 5px rgba(40, 20, 0, 0.35)); transition: filter 0.3s; }
  canvas { width: 100%; height: 100%; display: block; }
  .max { filter: drop-shadow(0 0 10px var(--gold)); }
  .min { filter: drop-shadow(0 0 8px var(--danger)); }
</style>
