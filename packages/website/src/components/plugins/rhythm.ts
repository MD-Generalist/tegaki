import { createPlugin, type StrokePath, type StrokeTime } from 'tegaki/core';

/** How a hand paces its writing (see {@link handTimes}). */
export interface Pace {
  /** Ems of line the pen draws a second; `0` keeps each stroke's own duration. */
  speed: number;
  /** Seconds the pen takes to travel an em between strokes, lifted. */
  travel: number;
  /** How often the hand stops to think before a stroke (0–1). */
  hesitate: number;
}

/**
 * The strokes written by a hand: one after another in the order they come,
 * each after the pen has travelled to it from where the last one ended — a
 * short hop inside a letter, longer to the next word, longest back to the
 * start of the next line — and now and then after a pause to think. At a
 * `speed`, every stroke is drawn at that pace, so a long one takes longer
 * than a short one; a dot is a quick tap.
 */
export function handTimes(
  strokes: readonly { start: number; duration: number; path: StrokePath }[],
  fontSize: number,
  pace: Pace,
  random: () => number,
): StrokeTime[] {
  const out: StrokeTime[] = strokes.map((s) => ({ start: s.start, duration: s.duration }));
  const order = strokes.map((_, i) => i).sort((a, b) => strokes[a]!.start - strokes[b]!.start);
  let clock = order.length > 0 ? strokes[order[0]!]!.start : 0;
  let pen: { x: number; y: number } | null = null;
  for (const i of order) {
    const { path, duration } = strokes[i]!;
    const from = path.pointAt(0);
    let gap = 0;
    if (pen) {
      const hop = Math.hypot(from.x - pen.x, from.y - pen.y) / fontSize;
      gap = 0.03 + hop * pace.travel;
      if (random() < pace.hesitate * 0.2) gap += 0.25 + random() * 0.5;
    }
    const length = path.length / fontSize;
    const draw = pace.speed > 0 ? (length > 0.02 ? length / pace.speed : 0.06) : duration;
    out[i] = { start: clock + gap, duration: draw };
    clock += gap + draw;
    pen = path.pointAt(1);
  }
  return out;
}

/**
 * A hand's rhythm: the pen travels between strokes, lifted, and takes
 * longer the farther it goes; it draws at a steady pace, so long strokes
 * take longer than short ones; and now and then it stops to think. The
 * font's own timing, replaced by one that follows where the strokes are on
 * the page. A `timing` plugin, run once per layout.
 */
export const rhythmPlugin = createPlugin({
  name: 'rhythm',
  label: 'Hand rhythm',
  description: 'The pen travels between strokes, draws at a steady pace and stops to think now and then. timing.',
  params: {
    speed: {
      type: 'number',
      label: 'Speed',
      description: 'Ems of line a second; 0 keeps the font’s own stroke times.',
      default: 4,
      min: 0,
      max: 16,
      step: 0.5,
    },
    travel: {
      type: 'number',
      label: 'Travel',
      description: 'Seconds the lifted pen takes to cross an em.',
      default: 0.12,
      min: 0,
      max: 0.6,
      step: 0.01,
    },
    hesitate: {
      type: 'number',
      label: 'Hesitate',
      description: 'How often the hand stops to think.',
      default: 0.2,
      min: 0,
      max: 1,
      step: 0.05,
    },
  },
  presets: {
    Careful: { speed: 2, travel: 0.3, hesitate: 0.5 },
    Hurried: { speed: 10, travel: 0.04, hesitate: 0 },
    'Steady pen': { speed: 4, travel: 0, hesitate: 0 },
  },
  setup: (pace) => ({
    timing: ({ strokes, fontSize, random }) => ({ strokes: handTimes(strokes, fontSize, pace, random('rhythm')) }),
  }),
});
