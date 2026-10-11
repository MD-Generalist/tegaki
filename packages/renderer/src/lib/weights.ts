import type { TegakiBundle } from '../types.ts';

/** The weight of a bundle's own face (absent = 400). */
export function bundleWeight(bundle: TegakiBundle): number {
  return bundle.weight ?? 400;
}

/** Every weight the bundle has a face for, its own first. */
export function bundleWeights(bundle: TegakiBundle): number[] {
  return [bundleWeight(bundle), ...(bundle.faces ?? []).map((f) => f.weight)];
}

/**
 * The weight CSS font matching picks among `available` for `desired`
 * (CSS Fonts 4, §5.2): from 400–500 it tries heavier up to 500, then lighter,
 * then heavier; below 400 lighter first; above 500 heavier first. The engine
 * picks the face this way so it draws the strokes of the face the browser
 * lays the text out in.
 */
export function matchFontWeight(available: readonly number[], desired: number): number {
  if (available.length === 0) return desired;
  const sorted = [...new Set(available)].sort((a, b) => a - b);
  const lighter = (limit: number) => sorted.filter((w) => w <= limit).at(-1);
  const heavier = (limit: number) => sorted.find((w) => w >= limit);
  if (desired >= 400 && desired <= 500) {
    const upTo500 = sorted.find((w) => w >= desired && w <= 500);
    return upTo500 ?? lighter(desired) ?? heavier(desired)!;
  }
  if (desired < 400) return lighter(desired) ?? heavier(desired)!;
  return heavier(desired) ?? lighter(desired)!;
}

/** A computed `font-weight` as a number (`normal` = 400, `bold` = 700). */
export function parseFontWeight(value: string | undefined): number {
  if (value === 'bold' || value === 'bolder') return 700;
  if (value === 'lighter') return 100;
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) ? n : 400;
}

const faceBundles = new WeakMap<TegakiBundle, Map<number, TegakiBundle>>();

/**
 * The bundle as the face CSS picks for `weight`: the bundle itself when that's
 * its own face, otherwise a bundle with the face's files and strokes in place
 * of its own (and no `faces`). The same object for the same bundle and face,
 * so caches keyed on the bundle (the shaper, stroke lists) hold across calls.
 */
export function bundleForWeight(bundle: TegakiBundle, weight: number): TegakiBundle {
  if (!bundle.faces?.length) return bundle;
  const matched = matchFontWeight(bundleWeights(bundle), weight);
  if (matched === bundleWeight(bundle)) return bundle;
  const face = bundle.faces.find((f) => f.weight === matched)!;
  let byWeight = faceBundles.get(bundle);
  if (!byWeight) faceBundles.set(bundle, (byWeight = new Map()));
  let view = byWeight.get(matched);
  if (!view) {
    const { faces: _faces, ...shared } = bundle;
    view = {
      ...shared,
      weight: face.weight,
      fontUrl: face.fontUrl,
      extraFontUrls: face.extraFontUrls,
      extraFontRanges: face.extraFontRanges,
      fullFontUrl: face.fullFontUrl,
      glyphData: face.glyphData,
      glyphDataById: face.glyphDataById,
    };
    byWeight.set(matched, view);
  }
  return view;
}
