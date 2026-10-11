import { describe, expect, test } from 'bun:test';
import type { TegakiBundle, TegakiFace, TegakiGlyphData } from '../types.ts';
import { bundleForWeight, bundleWeights, matchFontWeight, parseFontWeight } from './weights.ts';

const glyph = (w: number): TegakiGlyphData => ({ w, t: 1, s: [{ p: [[0, 0, 1]], d: 0, a: 1 }] });

function makeBundle(extra: Partial<TegakiBundle> = {}): TegakiBundle {
  return {
    family: 'test',
    lineCap: 'round',
    fontUrl: 'regular.ttf',
    fontFaceCSS: '',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphData: { a: glyph(400) },
    ...extra,
  };
}

const face = (weight: number): TegakiFace => ({ weight, fontUrl: `${weight}.ttf`, glyphData: { a: glyph(weight) } });

describe('matchFontWeight', () => {
  const all = [100, 300, 400, 500, 700, 900];

  test('an available weight matches itself', () => {
    for (const w of all) expect(matchFontWeight(all, w)).toBe(w);
  });

  test('from 400 to 500 it tries heavier faces up to 500 first', () => {
    expect(matchFontWeight([300, 500, 700], 400)).toBe(500);
    expect(matchFontWeight([300, 450, 700], 420)).toBe(450);
  });

  test('from 400 to 500 it then tries lighter faces before ones above 500', () => {
    expect(matchFontWeight([300, 700], 400)).toBe(300);
    expect(matchFontWeight([700, 900], 450)).toBe(700);
  });

  test('below 400 it tries lighter faces first, then heavier', () => {
    expect(matchFontWeight([100, 400], 300)).toBe(100);
    expect(matchFontWeight([400, 700], 300)).toBe(400);
  });

  test('above 500 it tries heavier faces first, then lighter', () => {
    expect(matchFontWeight([400, 900], 600)).toBe(900);
    expect(matchFontWeight([400, 500], 600)).toBe(500);
  });
});

describe('parseFontWeight', () => {
  test('reads computed weights and keywords', () => {
    expect(parseFontWeight('700')).toBe(700);
    expect(parseFontWeight('normal')).toBe(400);
    expect(parseFontWeight('bold')).toBe(700);
    expect(parseFontWeight('')).toBe(400);
  });
});

describe('bundleForWeight', () => {
  test('a bundle without faces is drawn as it is at every weight', () => {
    const bundle = makeBundle();
    expect(bundleForWeight(bundle, 700)).toBe(bundle);
  });

  test("the bundle's own face is the bundle itself", () => {
    const bundle = makeBundle({ faces: [face(700)] });
    expect(bundleForWeight(bundle, 400)).toBe(bundle);
  });

  test("another face takes its files and strokes in place of the bundle's", () => {
    const bundle = makeBundle({ faces: [face(700)] });
    const bold = bundleForWeight(bundle, 800);
    expect(bold.weight).toBe(700);
    expect(bold.fontUrl).toBe('700.ttf');
    expect(bold.glyphData.a!.w).toBe(700);
    expect(bold.family).toBe('test');
    expect(bold.faces).toBeUndefined();
  });

  test('the same face is the same object every time', () => {
    const bundle = makeBundle({ faces: [face(700)] });
    expect(bundleForWeight(bundle, 700)).toBe(bundleForWeight(bundle, 900));
  });

  test("the bundle's own weight takes part in the matching", () => {
    const bundle = makeBundle({ weight: 300, faces: [face(700)] });
    expect(bundleWeights(bundle)).toEqual([300, 700]);
    expect(bundleForWeight(bundle, 400)).toBe(bundle);
    expect(bundleForWeight(bundle, 600).weight).toBe(700);
  });
});
