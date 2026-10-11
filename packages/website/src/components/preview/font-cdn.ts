import { matchFontWeight } from 'tegaki/core';

/**
 * Fetch a Google Font from the Fontsource CDN (CORS-enabled, no server needed).
 *
 * First queries the Fontsource API for available subsets and weights, then downloads
 * the Latin subset as primary and any extra subsets (e.g., japanese, korean, cyrillic)
 * as additional font files. This enables CJK and other non-Latin fonts to work.
 *
 * `weight` picks the weight; a family without it gives the one CSS font matching
 * picks instead (`weight` in the result), out of `weights`, every weight it has.
 */
export async function fetchFontFromCDN(
  family: string,
  weight = 400,
): Promise<{ primary: ArrayBuffer; extra: ArrayBuffer[]; weight: number; weights: number[] }> {
  const slug = family.toLowerCase().replace(/\s+/g, '-');
  const baseUrl = `https://cdn.jsdelivr.net/fontsource/fonts/${slug}@latest`;

  let subsets: string[] = ['latin'];
  let weights: number[] = [400];
  try {
    const metaResp = await fetch(`https://api.fontsource.org/v1/fonts/${slug}`);
    if (metaResp.ok) {
      const meta: { subsets?: string[]; weights?: number[] } = await metaResp.json();
      if (meta.subsets?.length) subsets = meta.subsets;
      if (meta.weights?.length) weights = [...meta.weights].sort((a, b) => a - b);
    }
  } catch {
    // Fall back to just latin if metadata fetch fails
  }
  const picked = matchFontWeight(weights, weight);

  const latinResp = await fetch(`${baseUrl}/latin-${picked}-normal.ttf`);
  if (!latinResp.ok) {
    throw new Error(`Font "${family}" not found on CDN (${latinResp.status}). Try uploading a .ttf file instead.`);
  }
  const primary = await latinResp.arrayBuffer();

  const extraSubsets = subsets.filter((s) => s !== 'latin');
  const extraResults = await Promise.allSettled(
    extraSubsets.map(async (subset) => {
      const resp = await fetch(`${baseUrl}/${subset}-${picked}-normal.ttf`);
      if (!resp.ok) return null;
      return resp.arrayBuffer();
    }),
  );

  const extra = extraResults
    .filter((r): r is PromiseFulfilledResult<ArrayBuffer | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((buf): buf is ArrayBuffer => buf !== null);

  return { primary, extra, weight: picked, weights };
}
