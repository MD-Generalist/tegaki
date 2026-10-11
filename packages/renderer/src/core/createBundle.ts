import { BUNDLE_VERSION, type LineCap, type TegakiBundle, type TegakiFace, type TegakiGlyphData } from '../types.ts';

/**
 * Creates a {@link TegakiBundle} from its constituent parts.
 *
 * Useful when loading font data from a CDN or other source where the
 * pre-built bundle modules aren't available:
 *
 * ```js
 * const glyphData = await fetch('.../glyphData.json').then(r => r.json());
 * const bundle = createBundle({
 *   family: 'Caveat',
 *   fontUrl: '.../caveat.ttf',
 *   glyphData,
 * });
 * ```
 *
 * Other weights of the font go in `faces`, each with its own font file and
 * glyph data; the renderer draws the one the text's `font-weight` picks.
 */
export function createBundle({
  family,
  fullFamily,
  fontUrl,
  fullFontUrl,
  glyphData,
  lineCap = 'round',
  unitsPerEm = 1000,
  ascender = 800,
  descender = -200,
  weight,
  faces,
}: {
  family: string;
  fullFamily?: string;
  fontUrl: string;
  fullFontUrl?: string;
  glyphData: Record<string, TegakiGlyphData>;
  lineCap?: LineCap;
  unitsPerEm?: number;
  ascender?: number;
  descender?: number;
  /** The weight of the face above (default 400). */
  weight?: number;
  /** The font's other weights. */
  faces?: readonly TegakiFace[];
}): TegakiBundle {
  const rules: string[] = [];
  for (const face of [{ weight, fontUrl, fullFontUrl }, ...(faces ?? [])]) {
    const w = face.weight === undefined ? '' : ` font-weight: ${face.weight};`;
    rules.push(`@font-face { font-family: '${family}'; src: url(${face.fontUrl});${w} }`);
    if (fullFamily && face.fullFontUrl) rules.push(`@font-face { font-family: '${fullFamily}'; src: url(${face.fullFontUrl});${w} }`);
  }
  return {
    version: BUNDLE_VERSION,
    family,
    fullFamily,
    lineCap,
    fontUrl,
    fullFontUrl,
    fontFaceCSS: rules.join(' '),
    unitsPerEm,
    ascender,
    descender,
    glyphData,
    ...(weight === undefined ? {} : { weight }),
    ...(faces?.length ? { faces } : {}),
  };
}
