import type { StrokePath } from 'tegaki/core';

/** A number for SVG markup, to a hundredth. */
export function num(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/** A path's polyline as SVG path data. */
export function pathData(path: StrokePath): string {
  return path.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${num(p.x)} ${num(p.y)}`).join(' ');
}

/** A path's mean width. */
export function meanWidth(path: StrokePath): number {
  let sum = 0;
  for (const p of path.points) sum += p.width;
  return path.points.length > 0 ? sum / path.points.length : 0;
}

/**
 * Each path as SVG: a line along it, or a disc for a dot. `attrs` go on
 * every element — the stroke, its width and opacity usually sit on a `<g>`
 * around them.
 */
export function inkMarkup(paths: readonly StrokePath[], width: (path: StrokePath) => number, attrs = ''): string {
  return paths
    .map((path) => {
      const p0 = path.points[0];
      if (!p0) return '';
      if (path.points.length === 1)
        return `<circle cx="${num(p0.x)}" cy="${num(p0.y)}" r="${num(width(path) / 2)}" stroke="none" fill="currentColor"${attrs} />`;
      return `<path d="${pathData(path)}" stroke-width="${num(width(path))}"${attrs} />`;
    })
    .join('');
}
