/**
 *   npm run test -- presentation
 */
import { describe, expect, it } from 'vitest';
import { presentationFromGender } from '../../src/lib/domain/presentation';

describe('presentationFromGender', () => {
  it('liest deutsche Bogenwerte und englische D&D-Beyond-Angaben', () => {
    expect(presentationFromGender('weiblich')).toBe('feminine');
    expect(presentationFromGender(' Female ')).toBe('feminine');
    expect(presentationFromGender('He/Him')).toBe('masculine');
    expect(presentationFromGender('Non-binary')).toBe('androgynous');
    expect(presentationFromGender('Divers')).toBe('androgynous');
  });

  it('lässt Text, der kein Äußeres benennt, unbeantwortet', () => {
    expect(presentationFromGender('')).toBeUndefined();
    expect(presentationFromGender('Gestaltwandler')).toBeUndefined();
  });
});
