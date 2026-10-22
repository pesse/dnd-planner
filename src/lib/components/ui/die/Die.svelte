<script lang="ts">
  /** Ein Würfel als 3D-Körper; `roll` wechselt je Wurf, er taumelt und landet mit `value` zur Kamera. */
  import * as THREE from 'three';
  import { buildDie, restingRotation, type DieFace } from './geometry';

  let { sides, value, roll = 0, delay = 0 }: { sides: number; value: number; roll?: number; delay?: number } = $props();

  const DURATION = 900;
  const GLOW_FADE = 300;
  const GLOW = 0.9;
  const TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, -0.18, 0));

  let canvas: HTMLCanvasElement;
  let rolling = $state(false);
  let scene: { renderer: THREE.WebGLRenderer; camera: THREE.Camera; root: THREE.Scene; die: THREE.Group; faces: DieFace[]; glows: Map<number, THREE.Mesh> } | null = $state.raw(null);

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

  /** Deckfläche in Gold über der Würfelfläche; sie leuchtet auf, wenn diese Fläche oben liegt. */
  function glow(face: DieFace): THREE.Mesh {
    const lift = face.normal.clone().multiplyScalar(0.001);
    const pts = face.outline.map((v) => v.clone().add(lift));
    const geo = new THREE.BufferGeometry().setFromPoints(pts.slice(1, -1).flatMap((v, i) => [pts[0], v, pts[i + 2]]));
    geo.computeVertexNormals();
    const color = new THREE.Color(css('--gold') || '#786012').lerp(new THREE.Color('#ffc93c'), 0.6);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
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
    die.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: css('--arcane') || '#6d3b8e', roughness: 0.42, metalness: 0.12, flatShading: true,
    })));
    die.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 10), new THREE.LineBasicMaterial({ color: css('--gold') || '#786012' })));
    const glows = new Map(faces.map((f) => [f.value, glow(f)]));
    for (const f of faces) die.add(glows.get(f.value)!, label(f));
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
    const face = s.faces.find((f) => f.value === final) ?? s.faces[0];
    const rest = TILT.clone().multiply(restingRotation(face));
    const render = () => s.renderer.render(s.root, s.camera);
    const lit = s.glows.get(face.value)!.material as THREE.MeshBasicMaterial;
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
