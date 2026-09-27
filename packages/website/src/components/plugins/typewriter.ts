import { createPlugin, expandBox, type StrokeFrame, type StrokePath, seededRandom, type TegakiFrame, unionBoxes } from 'tegaki/core';
import { canvasColor, mix, type Rgba, rgba } from './color.ts';
import { clack, ding } from './sound.ts';

/** How a typewriter strikes one glyph: its ink (0–1, a worn ribbon prints lighter), and how far its typebar is off true. */
export interface Strike {
  ink: number;
  dx: number;
  dy: number;
  turn: number;
}

/**
 * The strike of the glyph with this seed: its ink and misalignment, fixed
 * per glyph as a real machine's worn typebars are. `misalign` and `uneven`
 * (0–1) scale them; offsets are in ems, the turn in radians.
 */
export function strikeOf(seed: number, misalign: number, uneven: number): Strike {
  const random = seededRandom(seed, 'typewriter');
  const signed = () => random() * 2 - 1;
  return {
    ink: 1 - uneven * 0.45 * random() ** 1.5,
    dx: misalign * 0.012 * signed(),
    dy: misalign * 0.02 * signed(),
    turn: misalign * 0.035 * signed(),
  };
}

/** How far a glyph is still punched in, `age` seconds after its key struck: a snap down that springs back. */
export function punch(age: number, strike: number): number {
  if (age < 0 || strike <= 0) return 0;
  return strike * Math.exp(-age / 0.035) * Math.cos(age * 90);
}

/**
 * When each character's key is struck, by grapheme index: one key after
 * another, `rate` a second, each gap stretched or cut by up to half its
 * length at `rhythm` 1 — a typist's uneven hand, drawn from `random`.
 * Spaces and line breaks are keys too.
 */
export function keyTimes(count: number, rate: number, rhythm: number, random: () => number): number[] {
  const out: number[] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    out.push(at);
    at += (1 + rhythm * (random() - 0.5)) / rate;
  }
  return out;
}

/** The glyphs typed by `time`, each once: when it's struck and where its advance ends. */
export function typedGlyphs(strokes: readonly StrokeFrame[]): { entryIndex: number; at: number; end: { x: number; y: number } }[] {
  const out = new Map<number, { entryIndex: number; at: number; end: { x: number; y: number } }>();
  for (const s of strokes) {
    if (out.has(s.entryIndex)) continue;
    const { place } = s;
    out.set(s.entryIndex, {
      entryIndex: s.entryIndex,
      at: s.start,
      end: { x: place.x + s.glyph.w * place.scale, y: place.y + place.ascender * place.scale },
    });
  }
  return [...out.values()].sort((a, b) => a.at - b.at);
}

const WHITE: Rgba = [255, 255, 255, 1];

/**
 * A typewriter: each glyph struck whole, key after key at a typist's
 * pace, rather than written — snapped in by the typebar and settling, a
 * little off true and lighter or darker as the ribbon's ink allows, the same
 * every time for the same letter in the same place. A caret waits after the
 * last glyph, blinking once the typing stops, and each strike can clack (and
 * the bell ring at the end). `timing` sets when each key is struck (every
 * stroke of its glyph at once), `paint` stamps the glyph set off true, the
 * caret is an `overlay` blinking on `steps`, and the sound is `onFrame`.
 */
export const typewriterPlugin = createPlugin({
  name: 'typewriter',
  label: 'Typewriter',
  description:
    'Each glyph struck whole at a typist’s pace, a little off true, with a blinking caret and a clack. timing + paint + overlay + onFrame.',
  params: {
    rate: { type: 'number', label: 'Rate', description: 'Keys struck a second.', default: 10, min: 2, max: 40, step: 1 },
    rhythm: {
      type: 'number',
      label: 'Rhythm',
      description: 'How unevenly the keys come.',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.05,
    },
    misalign: {
      type: 'number',
      label: 'Misalign',
      description: 'How far worn typebars strike off true.',
      default: 0.4,
      min: 0,
      max: 1,
      step: 0.05,
    },
    uneven: {
      type: 'number',
      label: 'Uneven ink',
      description: 'How much lighter some letters print.',
      default: 0.4,
      min: 0,
      max: 1,
      step: 0.05,
    },
    strike: {
      type: 'number',
      label: 'Strike',
      description: 'How hard a glyph snaps in as it’s struck.',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.05,
    },
    caret: {
      type: 'select',
      label: 'Caret',
      default: 'bar',
      options: [
        { value: 'bar', label: 'Bar' },
        { value: 'block', label: 'Block' },
        { value: 'underscore', label: 'Underscore' },
        { value: 'none', label: 'None' },
      ],
    },
    sound: { type: 'boolean', label: 'Clack', description: 'A key sound per glyph, and the bell at the end.', default: false },
    volume: { type: 'number', label: 'Volume', default: 0.5, min: 0, max: 1, step: 0.05 },
  },
  presets: {
    Worn: { misalign: 1, uneven: 0.85 },
    Terminal: { misalign: 0, uneven: 0, strike: 0, caret: 'block', rate: 30, rhythm: 0 },
    Clacky: { sound: true, strike: 0.8 },
  },
  setup: ({ rate, rhythm, misalign, uneven, strike, caret, sound, volume }) => {
    const moved = new WeakMap<StrokePath, StrokePath>();
    const strikes = new Map<number, Strike>();
    const strikeFor = (seed: number) => {
      let st = strikes.get(seed);
      if (!st) {
        if (strikes.size > 4096) strikes.clear();
        strikes.set(seed, (st = strikeOf(seed, misalign, uneven)));
      }
      return st;
    };
    /** The glyph's strokes, set off true by its strike (about its advance's middle, on the baseline) and pushed down by `push` px. */
    const setOff = (stroke: StrokeFrame, st: Strike, fontSize: number, push: number) => {
      const { place } = stroke;
      const cx = place.x + (stroke.glyph.w * place.scale) / 2;
      const cy = place.y + place.ascender * place.scale;
      const cos = Math.cos(st.turn);
      const sin = Math.sin(st.turn);
      const dx = st.dx * fontSize;
      const dy = st.dy * fontSize + push;
      return stroke.path.map((p) => {
        const x = p.x - cx;
        const y = p.y - cy;
        return { ...p, x: cx + x * cos - y * sin + dx, y: cy + x * sin + y * cos + dy };
      });
    };
    let ink: { style: string; rgb: Rgba | null } | null = null;
    return {
      // Room for the caret past the last glyph, and a glyph struck off true.
      bounds: ({ strokes, fontSize }) => expandBox(unionBoxes(strokes.map((st) => st.path.bounds())), fontSize * 0.55),
      steps: caret === 'none' ? undefined : { count: 2, fps: 1.6, idle: true },
      timing({ strokes, random }) {
        const count = strokes.reduce((n, s) => Math.max(n, s.entry.graphemeIndex + 1), 0);
        const keys = keyTimes(count, rate, rhythm, random('keys'));
        return { strokes: strokes.map((s) => ({ start: keys[s.entry.graphemeIndex]!, duration: 0 })) };
      },
      paint(s, next) {
        const { stroke, fontSize } = s;
        // Not struck yet: nothing on the paper.
        if (stroke.state === 'pending') return;
        const age = s.frame.time - stroke.start;
        const st = strikeFor(stroke.seed);
        const push = punch(age, strike) * 0.05 * fontSize;
        let path = moved.get(stroke.path);
        if (push !== 0) path = setOff(stroke, st, fontSize, push);
        else if (!path) moved.set(stroke.path, (path = setOff(stroke, st, fontSize, 0)));
        if (typeof s.style === 'string' && ink?.style !== s.style) ink = { style: s.style, rgb: canvasColor(s.ctx, s.style) };
        const rgb = typeof s.style === 'string' ? ink?.rgb : null;
        const style = rgb && st.ink < 1 ? rgba(mix(rgb, WHITE, 1 - st.ink)) : s.style;
        next({ ...s, style, stroke: { ...stroke, state: 'done', progress: 1, path, head: path.pointAt(1) } });
      },
      overlay({ ctx, frame, fontSize, color, step }) {
        if (caret === 'none') return;
        const glyphs = typedGlyphs(frame.strokes);
        if (glyphs.length === 0) return;
        const typed = glyphs.filter((g) => g.at <= frame.time);
        const typing = typed.length > 0 && typed.length < glyphs.length;
        // Solid while typing; blinking before and after.
        if (!typing && step === 1) return;
        const first = frame.strokes.find((s) => s.entryIndex === glyphs[0]!.entryIndex)!;
        const at = typed.length > 0 ? typed.at(-1)!.end : { x: first.place.x, y: first.place.y + first.place.ascender * first.place.scale };
        const gap = fontSize * 0.12;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        if (caret === 'bar') ctx.fillRect(at.x + gap, at.y - fontSize * 0.72, Math.max(1.5, fontSize * 0.035), fontSize * 0.86);
        else if (caret === 'block') ctx.fillRect(at.x + gap, at.y - fontSize * 0.62, fontSize * 0.42, fontSize * 0.74);
        else ctx.fillRect(at.x + gap, at.y + fontSize * 0.06, fontSize * 0.42, Math.max(1.5, fontSize * 0.05));
      },
      onFrame(frame: TegakiFrame, prev: TegakiFrame | null) {
        if (!sound || !prev) return;
        const dt = frame.time - prev.time;
        if (dt <= 0 || dt > 0.25) return;
        const glyphs = typedGlyphs(frame.strokes);
        const struck = glyphs.filter((g) => g.at > prev.time && g.at <= frame.time);
        if (struck.length > 0) clack(volume);
        if (struck.length > 0 && struck.at(-1) === glyphs.at(-1)) setTimeout(() => ding(volume), 180);
      },
    };
  },
});
