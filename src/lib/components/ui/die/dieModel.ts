import * as THREE from 'three';
import { buildDie, restingRotation, type DieFace } from './geometry';

const DURATION = 900;
const GLOW_FADE = 300;
/** Innenkante des Rahmens als Anteil des Wegs von der Ecke zur Flächenmitte. */
const RING = 0.2;
const DIM = 0.35;
const TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, -0.18, 0));

export const ROLL_MS = DURATION + GLOW_FADE;

export interface DiePalette {
  body: string;
  gold: string;
  danger: string;
  font: string;
}

export interface DieModel {
  root: THREE.Group;
  /** Stellt den Würfel `ms` nach seinem Wurfbeginn dar; negativ heißt: noch nicht losgerollt. */
  pose(ms: number): void;
  dispose(): void;
}

/** Ein Prozentwürfel ist ein W10 mit anderer Beschriftung: Zehner `00`–`90`, Einer `0`–`9`. */
export type Percentile = 'tens' | 'units';

function faceText(n: number, percentile?: Percentile): string {
  if (percentile === 'tens') return String((n % 10) * 10).padStart(2, '0');
  if (percentile === 'units') return String(n % 10);
  return String(n);
}

function labelTexture(n: number, sides: number, font: string, percentile?: Percentile): THREE.CanvasTexture {
  const text = faceText(n, percentile);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.font = `700 ${text.length > 1 ? 66 : 84}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(30, 10, 40, 0.55)';
  g.fillStyle = '#fff';
  g.strokeText(text, 64, 68);
  g.fillText(text, 64, 68);
  // 6 und 9 sind auf jedem Würfel mit beiden Zahlen nur am Strich zu unterscheiden.
  if ((text === '6' || text === '9') && sides >= 9) g.fillRect(44, 106, 40, 7);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function label(face: DieFace, sides: number, font: string, opacity: number, percentile?: Percentile): THREE.Mesh {
  const size = face.inradius * 1.9;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: labelTexture(face.value, sides, font, percentile), transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  const right = new THREE.Vector3().crossVectors(face.up, face.normal);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, face.up, face.normal));
  mesh.position.copy(face.center).addScaledVector(face.normal, 0.002);
  mesh.renderOrder = 2;
  return mesh;
}

/** Goldener Rahmen um die Fläche und eine leichte Aufhellung darin; sichtbar, wenn sie oben liegt. */
function glow(face: DieFace, body: THREE.Color, goldCss: string): THREE.Mesh {
  const lift = face.normal.clone().multiplyScalar(0.001);
  const outer = face.outline.map((v) => v.clone().add(lift));
  const inner = outer.map((v) => v.clone().lerp(face.center.clone().add(lift), RING));
  const gold = new THREE.Color(goldCss).lerp(new THREE.Color('#ffc93c'), 0.6);
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

/** Weicher Schein hinter dem Würfel für die höchste und die niedrigste Zahl. */
function halo(color: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color, transparent: true, opacity: 0, depthWrite: false }));
  sprite.position.z = -1.4;
  sprite.scale.setScalar(3.2);
  return sprite;
}

/** `value` ist die Fläche (1–`sides`); beim Prozentwürfel trägt Fläche 10 die Null. */
export function createDieModel(sides: number, value: number, palette: DiePalette, dim = false, percentile?: Percentile): DieModel {
  const alpha = dim ? DIM : 1;
  const { geometry, faces } = buildDie(sides);
  const body = new THREE.Color(palette.body);
  const die = new THREE.Group();
  die.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: body, roughness: 0.42, metalness: 0.12, flatShading: true, transparent: dim, opacity: alpha,
  })));
  die.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 10), new THREE.LineBasicMaterial({ color: palette.gold, transparent: dim, opacity: alpha })));
  const glows = new Map(faces.map((f) => [f, glow(f, body, palette.gold)]));
  for (const f of faces) die.add(glows.get(f)!, label(f, sides, palette.font, alpha, percentile));

  const hits = faces.filter((f) => f.value === value);
  const face = hits[Math.floor(Math.random() * hits.length)] ?? faces[0];
  const rest = TILT.clone().multiply(restingRotation(face));
  const lit = glows.get(face)!.material as THREE.MeshBasicMaterial;
  const extreme = dim || percentile ? null : value === sides ? palette.gold : value === 1 ? palette.danger : null;
  const shine = extreme ? halo(extreme) : null;

  const root = new THREE.Group();
  root.add(die);
  if (shine) root.add(shine);

  const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  const turns = (3 + Math.random() * 2) * Math.PI * 2;
  const spin = new THREE.Quaternion();

  function pose(ms: number) {
    const t = Math.min(1, Math.max(0, ms / DURATION));
    const shown = Math.min(1, Math.max(0, (ms - DURATION) / GLOW_FADE));
    lit.opacity = alpha * shown;
    if (shine) shine.material.opacity = 0.75 * shown;
    const ease = 1 - (1 - t) ** 3;
    die.quaternion.copy(spin.setFromAxisAngle(axis, turns * (1 - ease))).multiply(rest);
    die.position.set(-0.35 * (1 - ease), 0.45 * Math.abs(Math.cos(t * 2.5 * Math.PI)) * (1 - t) ** 2, 0);
    die.scale.setScalar(0.6 + 0.4 * Math.min(1, t * 3));
  }

  function dispose() {
    root.traverse((o) => {
      // Die Geometrie eines Sprites teilen sich alle Sprites von three.
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
      if (!(o instanceof THREE.Mesh || o instanceof THREE.LineSegments || o instanceof THREE.Sprite)) return;
      const m = o.material as THREE.Material & { map?: THREE.Texture | null };
      m.map?.dispose();
      m.dispose();
    });
  }

  return { root, pose, dispose };
}
