import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

export interface DieFace {
  value: number;
  center: THREE.Vector3;
  normal: THREE.Vector3;
  /** Richtung, in die die Zahl auf der Fläche nach oben zeigt. */
  up: THREE.Vector3;
  /** Abstand der Mitte zur nächsten Kante — so groß darf die Zahl höchstens werden. */
  inradius: number;
  /** Ecken der Fläche, im Umlaufsinn geordnet. */
  outline: THREE.Vector3[];
}

/** Fünfeckiges Trapezoeder; `ring` folgt aus der Bedingung, dass jedes Drachenviereck eben ist. */
function d10Points(): THREE.Vector3[] {
  const pole = 1, c = Math.cos(Math.PI / 5), ring = pole * (1 - c) / (1 + c);
  const pts = [new THREE.Vector3(0, pole, 0), new THREE.Vector3(0, -pole, 0)];
  for (let k = 0; k < 5; k++) {
    const a = (k * 2 * Math.PI) / 5, b = a + Math.PI / 5;
    pts.push(new THREE.Vector3(Math.cos(a), ring, Math.sin(a)), new THREE.Vector3(Math.cos(b), -ring, Math.sin(b)));
  }
  return pts;
}

function bodyGeometry(sides: number): THREE.BufferGeometry {
  switch (sides) {
    case 4: return new THREE.TetrahedronGeometry(1);
    case 8: return new THREE.OctahedronGeometry(1);
    case 10: return new ConvexGeometry(d10Points());
    case 12: return new THREE.DodecahedronGeometry(1);
    case 20: return new THREE.IcosahedronGeometry(1);
    default: return new THREE.BoxGeometry(1.2, 1.2, 1.2);
  }
}

/** Fasst die Dreiecke des Körpers zu ebenen Flächen zusammen. */
function planarFaces(geo: THREE.BufferGeometry): { normal: THREE.Vector3; verts: THREE.Vector3[] }[] {
  const pos = geo.getAttribute('position');
  const groups: { normal: THREE.Vector3; verts: THREE.Vector3[] }[] = [];
  const tri = new THREE.Triangle();
  for (let i = 0; i < pos.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, i + k));
    const normal = tri.set(a, b, c).getNormal(new THREE.Vector3());
    let g = groups.find((o) => o.normal.dot(normal) > 0.999);
    if (!g) groups.push(g = { normal, verts: [] });
    for (const v of [a, b, c]) if (!g.verts.some((w) => w.distanceTo(v) < 1e-4)) g.verts.push(v);
  }
  return groups;
}

function describeFace(normal: THREE.Vector3, verts: THREE.Vector3[]): Omit<DieFace, 'value'> {
  const center = verts.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(verts.length);
  const ordered = [...verts].sort((p, q) => angleAround(p, center, normal) - angleAround(q, center, normal));
  const edges = ordered.map((v, i) => new THREE.Line3(v, ordered[(i + 1) % ordered.length]));
  const inradius = Math.min(...edges.map((e) => e.closestPointToPoint(center, true, new THREE.Vector3()).distanceTo(center)));
  const dists = ordered.map((v) => v.distanceTo(center));
  const regular = Math.max(...dists) - Math.min(...dists) < 1e-3;
  // Beim Quadrat stünde die Zahl über Eck; beim Drachenviereck des W10 zeigt sie zur Spitze.
  const towards = ordered.length === 4 && regular
    ? edges[0].getCenter(new THREE.Vector3())
    : ordered[dists.indexOf(Math.max(...dists))];
  const up = towards.clone().sub(center).projectOnPlane(normal).normalize();
  return { center, normal, up, inradius, outline: ordered };
}

function angleAround(p: THREE.Vector3, center: THREE.Vector3, normal: THREE.Vector3): number {
  const ref = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = ref.projectOnPlane(normal).normalize(), w = new THREE.Vector3().crossVectors(normal, u);
  const d = p.clone().sub(center);
  return Math.atan2(d.dot(w), d.dot(u));
}

/** Gegenüberliegende Flächen ergeben zusammen `sides + 1`, wie bei echten Würfeln. */
function numberFaces(faces: Omit<DieFace, 'value'>[], sides: number): DieFace[] {
  const out: DieFace[] = [];
  const rest = [...faces];
  let low = 1, high = sides;
  while (rest.length) {
    const f = rest.shift()!;
    const i = rest.findIndex((o) => o.normal.dot(f.normal) < -0.999);
    if (i < 0) { out.push({ ...f, value: low++ }); continue; }
    out.push({ ...f, value: low++ }, { ...rest.splice(i, 1)[0], value: high-- });
  }
  return out;
}

export function buildDie(sides: number): { geometry: THREE.BufferGeometry; faces: DieFace[] } {
  const body = bodyGeometry(sides);
  const geometry = body.index ? body.toNonIndexed() : body;
  geometry.computeVertexNormals();
  const faces = numberFaces(planarFaces(geometry).map((f) => describeFace(f.normal, f.verts)), sides);
  return { geometry, faces };
}

/** Drehung, die `face` zur Kamera (+z) kehrt, die Zahl aufrecht. */
export function restingRotation(face: DieFace): THREE.Quaternion {
  const toCamera = new THREE.Quaternion().setFromUnitVectors(face.normal, new THREE.Vector3(0, 0, 1));
  const up = face.up.clone().applyQuaternion(toCamera);
  const twist = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(up.x, up.y));
  return twist.multiply(toCamera);
}
