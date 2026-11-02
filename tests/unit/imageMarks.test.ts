import { describe, expect, it } from 'vitest';
import { imageAddress, pointOnImage } from '../../src/lib/services/imageMarks/address';
import { imageMarksText } from '../../src/lib/stores/imageMarks';

describe('Adresse eines markierten Bilds', () => {
  it('macht aus der Tauri-Asset-URL den Vault-relativen Pfad, ohne Cache-Buster', () => {
    const win = 'http://asset.localhost/' + encodeURIComponent('C:\\dev\\privat\\dnd-planner\\vault\\art\\monsters\\goblin.avif');
    expect(imageAddress(win)).toBe('vault/art/monsters/goblin.avif');
    const release = 'asset://localhost/' + encodeURIComponent('/home/x/.local/share/de.developer-sam.dnd-planner/vault/characters/ab12/portrait.png') + '?v=3';
    expect(imageAddress(release)).toBe('vault/characters/ab12/portrait.png');
  });

  it('kennt die Bilder des Browser-Devs und die der App selbst', () => {
    expect(imageAddress('http://localhost:1420/art/spells/fireball.avif')).toBe('vault/art/spells/fireball.avif');
    expect(imageAddress('/branding/icons/log.png')).toBe('static/branding/icons/log.png');
    expect(imageAddress('data:image/png;base64,AAAA')).toBe('eingebettetes Bild (image/png)');
  });
});

describe('Klickpunkt auf der Bilddatei', () => {
  const box = { left: 100, top: 50, width: 200, height: 200 };
  const wide = { width: 400, height: 200 };

  it('rechnet `object-fit: cover` auf den sichtbaren Ausschnitt um', () => {
    // 400×200 auf 200×200 gedeckt: Maßstab 1, die Datei ragt links und rechts je 100 px hinaus.
    expect(pointOnImage(box, wide, { fit: 'cover', position: '50% 50%', flipX: false }, 200, 150)).toEqual({ x: 0.5, y: 0.5 });
    expect(pointOnImage(box, wide, { fit: 'cover', position: '0% 50%', flipX: false }, 100, 50)).toEqual({ x: 0, y: 0 });
  });

  it('klemmt Klicks in den Rand bei `contain` und spiegelt bei `scaleX(-1)`', () => {
    // contain: 200×100, oben und unten je 50 px leer.
    expect(pointOnImage(box, wide, { fit: 'contain', position: 'center', flipX: false }, 150, 60)).toEqual({ x: 0.25, y: 0 });
    expect(pointOnImage(box, wide, { fit: 'contain', position: 'center', flipX: true }, 150, 150)).toEqual({ x: 0.75, y: 0.5 });
  });
});

describe('Markierungen als Text', () => {
  it('nennt Status, Adresse, Pixel, Ort und Beschreibung', () => {
    const text = imageMarksText([
      {
        id: '1', address: 'vault/art/monsters/goblin.avif', url: null, where: 'Startseite',
        x: 0.25, y: 0.5, width: 640, height: 960, text: 'Sechs Finger', status: 'open',
        fingerprint: null, createdAt: '2026-11-02T00:00:00Z',
      },
    ]);
    expect(text).toBe(
      '1. [offen] vault/art/monsters/goblin.avif\n' +
        '   Position: x 25.0 %, y 50.0 % (Pixel 160, 480 von 640×960)\n' +
        '   Ort: Startseite\n' +
        '   Sechs Finger',
    );
  });
});
