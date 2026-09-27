import { type Box, createPlugin, type PlacedStroke, paintStroke, unionBoxes } from 'tegaki/core';
import { inkMarkup, meanWidth, num } from './svg.ts';

export type PaperStyle = 'ruled' | 'tian' | 'mi' | 'graph';

/** One line of text as the paper sees it: where its glyphs start and end, and its baseline, in text-box px. */
export interface PaperLine {
  left: number;
  right: number;
  baseline: number;
  /** The middle of the line's ink, up and down — where a practice square sits. */
  middle: number;
}

/** A practice square around one glyph. */
export interface PaperCell {
  x: number;
  y: number;
  size: number;
}

export interface PaperLayout {
  lines: PaperLine[];
  cells: PaperCell[];
}

/**
 * Where the paper's lines and squares go, from where the glyphs sit: a line
 * per baseline, spanning its glyphs' advances, and a square one em across
 * centred on each glyph's advance, at the middle of its line's ink. Glyphs
 * with no strokes (spaces) get no square.
 */
export function paperLayout(strokes: readonly PlacedStroke[], fontSize: number): PaperLayout {
  const byLine = new Map<number, { line: PaperLine; ink: (Box | null)[]; glyphs: Map<number, { x: number; advance: number }> }>();
  for (const s of strokes) {
    const { place } = s;
    const baseline = place.y + place.ascender * place.scale;
    const key = Math.round(baseline * 4);
    let entry = byLine.get(key);
    if (!entry) {
      entry = { line: { left: Infinity, right: -Infinity, baseline, middle: baseline }, ink: [], glyphs: new Map() };
      byLine.set(key, entry);
    }
    const advance = s.glyph.w * place.scale;
    entry.line.left = Math.min(entry.line.left, place.x);
    entry.line.right = Math.max(entry.line.right, place.x + advance);
    entry.ink.push(s.rawPath.bounds());
    entry.glyphs.set(s.entryIndex, { x: place.x, advance });
  }
  const lines: PaperLine[] = [];
  const cells: PaperCell[] = [];
  for (const { line, ink, glyphs } of byLine.values()) {
    const box = unionBoxes(ink);
    if (box) line.middle = (box.minY + box.maxY) / 2;
    lines.push(line);
    for (const g of glyphs.values()) cells.push({ x: g.x + g.advance / 2 - fontSize / 2, y: line.middle - fontSize / 2, size: fontSize });
  }
  lines.sort((a, b) => a.baseline - b.baseline);
  return { lines, cells };
}

/** Where a ruled line sits, in ems above the baseline: the capital line, and the dashed middle line small letters reach. */
const CAP = 0.7;
const MIDDLE = 0.35;
/** How far the rules run past the text, in ems. */
const RUN = 0.3;

/** The box the paper covers. */
export function paperBounds(layout: PaperLayout, style: PaperStyle, fontSize: number): Box | null {
  if (style === 'ruled' || style === 'graph') {
    return unionBoxes(
      layout.lines.map((l) => ({
        minX: l.left - RUN * fontSize,
        maxX: l.right + RUN * fontSize,
        minY: l.baseline - (CAP + 0.25) * fontSize,
        maxY: l.baseline + 0.35 * fontSize,
      })),
    );
  }
  return unionBoxes(layout.cells.map((c) => ({ minX: c.x, minY: c.y, maxX: c.x + c.size, maxY: c.y + c.size })));
}

/** A line of the paper, in text-box px: dashed or solid, and how strongly it shows (× the paper's opacity). */
export interface PaperRule {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  dashed: boolean;
  alpha: number;
}

/** What the paper draws: its lines, and the squares around practice cells (solid, at the paper's opacity). */
export function paperShapes(layout: PaperLayout, style: PaperStyle, fontSize: number): { rules: PaperRule[]; squares: PaperCell[] } {
  const rules: PaperRule[] = [];
  const squares: PaperCell[] = [];
  const rule = (x0: number, y0: number, x1: number, y1: number, dashed = false, alpha = 1) => rules.push({ x0, y0, x1, y1, dashed, alpha });
  if (style === 'ruled') {
    for (const l of layout.lines) {
      const x0 = l.left - RUN * fontSize;
      const x1 = l.right + RUN * fontSize;
      rule(x0, l.baseline - CAP * fontSize, x1, l.baseline - CAP * fontSize);
      rule(x0, l.baseline - MIDDLE * fontSize, x1, l.baseline - MIDDLE * fontSize, true, 0.8);
      rule(x0, l.baseline, x1, l.baseline);
    }
  } else if (style === 'graph') {
    const box = paperBounds(layout, style, fontSize);
    if (box) {
      const step = fontSize / 4;
      const snap = (v: number) => Math.floor(v / step) * step;
      for (let x = snap(box.minX); x <= box.maxX; x += step)
        rule(x, box.minY, x, box.maxY, false, Math.round(x / step) % 4 === 0 ? 1 : 0.45);
      for (let y = snap(box.minY); y <= box.maxY; y += step)
        rule(box.minX, y, box.maxX, y, false, Math.round(y / step) % 4 === 0 ? 1 : 0.45);
    }
  } else {
    for (const c of layout.cells) {
      squares.push(c);
      const mx = c.x + c.size / 2;
      const my = c.y + c.size / 2;
      rule(mx, c.y, mx, c.y + c.size, true, 0.8);
      rule(c.x, my, c.x + c.size, my, true, 0.8);
      if (style === 'mi') {
        rule(c.x, c.y, c.x + c.size, c.y + c.size, true, 0.6);
        rule(c.x + c.size, c.y, c.x, c.y + c.size, true, 0.6);
      }
    }
  }
  return { rules, squares };
}

/** The paper's line width and dash pattern, in px. */
function paperPen(fontSize: number): { line: number; dash: [number, number] } {
  return { line: Math.max(1, fontSize * 0.012), dash: [fontSize * 0.04, fontSize * 0.035] };
}

/** The tracing guide's dot size, in px. */
function traceDot(fontSize: number): number {
  return Math.max(1.5, fontSize * 0.022);
}

/**
 * A practice sheet under the text, laid out by where its glyphs sit: school
 * ruled lines (capital line, dashed middle, baseline), a 田字格 or 米字格
 * square around each character — the grids Chinese and Japanese are
 * practised on — or graph paper, with a tracing guide of the text to come
 * if wanted. An `underlay`: clip-to-text doesn't cut it,
 * and it's under the ink. Each stroke knows where its glyph sits (`place`),
 * which is all the layout needs. Its `svg` hook lays the same sheet under an
 * exported SVG.
 */
export const paperPlugin = createPlugin({
  name: 'paper',
  label: 'Practice paper',
  description: 'Ruled lines, 田字格 / 米字格 squares or graph paper under the text, laid out by its glyphs. underlay + bounds + svg.',
  params: {
    style: {
      type: 'select',
      label: 'Style',
      default: 'ruled',
      options: [
        { value: 'ruled', label: 'Ruled' },
        { value: 'tian', label: '田字格' },
        { value: 'mi', label: '米字格' },
        { value: 'graph', label: 'Graph' },
      ],
    },
    color: { type: 'color', label: 'Color', default: '#3b82f6' },
    opacity: { type: 'number', label: 'Opacity', default: 0.45, min: 0.05, max: 1, step: 0.05 },
    trace: {
      type: 'select',
      label: 'Tracing guide',
      description: 'The text to write, shown on the paper to trace over.',
      default: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'faint', label: 'Faint' },
        { value: 'dotted', label: 'Dotted' },
      ],
    },
  },
  presets: {
    Kanji: { style: 'mi', color: '#e5484d', opacity: 0.5 },
    Notebook: { style: 'graph', color: '#64748b', opacity: 0.35 },
    Worksheet: { style: 'ruled', trace: 'dotted' },
    'Kanji tracing': { style: 'tian', color: '#e5484d', opacity: 0.5, trace: 'faint' },
  },
  setup: ({ style, color, opacity, trace }) => {
    let cached: { first: PlacedStroke | undefined; count: number; fontSize: number; shapes: ReturnType<typeof paperShapes> } | null = null;
    const shapesOf = (strokes: readonly PlacedStroke[], fontSize: number) => {
      // Frames come and go, but their strokes stay where the layout put them.
      const first = strokes[0];
      if (cached?.first?.path !== first?.path || cached?.count !== strokes.length || cached?.fontSize !== fontSize) {
        cached = { first, count: strokes.length, fontSize, shapes: paperShapes(paperLayout(strokes, fontSize), style, fontSize) };
      }
      return cached.shapes;
    };
    return {
      bounds: ({ strokes, fontSize }) => paperBounds(paperLayout(strokes, fontSize), style, fontSize),
      underlay({ ctx, frame, fontSize, color: ink }) {
        const { rules, squares } = shapesOf(frame.strokes, fontSize);
        const { line, dash } = paperPen(fontSize);
        ctx.strokeStyle = color;
        ctx.lineWidth = line;
        ctx.setLineDash([]);
        ctx.globalAlpha = opacity;
        for (const c of squares) ctx.strokeRect(c.x, c.y, c.size, c.size);
        for (const r of rules) {
          ctx.setLineDash(r.dashed ? dash : []);
          ctx.globalAlpha = opacity * r.alpha;
          ctx.beginPath();
          ctx.moveTo(r.x0, r.y0);
          ctx.lineTo(r.x1, r.y1);
          ctx.stroke();
        }
        // The guide, over the paper: each stroke whole, faint, or as a line of dots along its middle.
        ctx.setLineDash([]);
        if (trace === 'faint') {
          ctx.globalAlpha = 0.16;
          for (const s of frame.strokes) paintStroke({ ctx, stroke: { ...s, state: 'done', progress: 1 }, style: ink, lineCap: 'round' });
        } else if (trace === 'dotted') {
          const dot = traceDot(fontSize);
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = ink;
          ctx.fillStyle = ink;
          ctx.lineWidth = dot;
          ctx.lineCap = 'round';
          ctx.setLineDash([0, dot * 2.4]);
          for (const s of frame.strokes) {
            const pts = s.path.points;
            ctx.beginPath();
            if (pts.length === 1) {
              ctx.arc(pts[0]!.x, pts[0]!.y, dot / 2, 0, Math.PI * 2);
              ctx.fill();
              continue;
            }
            ctx.moveTo(pts[0]!.x, pts[0]!.y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
            ctx.stroke();
          }
        }
      },
      svg({ strokes, fontSize, color: ink, underlay }) {
        const { rules, squares } = paperShapes(paperLayout(strokes, fontSize), style, fontSize);
        const { line, dash } = paperPen(fontSize);
        const out = [
          `<g fill="none" stroke="${color}" stroke-width="${num(line)}">`,
          ...squares.map(
            (c) => `<rect x="${num(c.x)}" y="${num(c.y)}" width="${num(c.size)}" height="${num(c.size)}" stroke-opacity="${opacity}" />`,
          ),
          ...rules.map(
            (r) =>
              `<line x1="${num(r.x0)}" y1="${num(r.y0)}" x2="${num(r.x1)}" y2="${num(r.y1)}" stroke-opacity="${num(opacity * r.alpha)}"` +
              `${r.dashed ? ` stroke-dasharray="${dash.map(num).join(' ')}"` : ''} />`,
          ),
          '</g>',
        ];
        const paths = strokes.map((s) => s.path);
        if (trace === 'faint') {
          out.push(
            `<g opacity="0.16" color="${ink}" fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round">${inkMarkup(paths, meanWidth)}</g>`,
          );
        } else if (trace === 'dotted') {
          const dot = traceDot(fontSize);
          out.push(
            `<g opacity="0.35" color="${ink}" fill="none" stroke="${ink}" stroke-linecap="round" stroke-dasharray="0 ${num(dot * 2.4)}">` +
              `${inkMarkup(paths, () => dot)}</g>`,
          );
        }
        underlay(out.join(''));
      },
    };
  },
});
