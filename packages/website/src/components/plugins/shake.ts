import { createPlugin, expandBox, seededRandom, type TegakiFrame, unionBoxes } from 'tegaki/core';
import { scratchCanvas } from './ink-canvas.ts';

export type ShakeTrigger = 'strokes' | 'writing' | 'both';

export interface ShakeOptions {
  trigger: ShakeTrigger;
  /** How far it shakes at its strongest, in ems. */
  amount: number;
  /** Seconds a jolt takes to die away. */
  decay: number;
  /** How far it turns at its strongest, in degrees. */
  rotation: number;
  /** Shakes a second. */
  speed: number;
}

/**
 * How hard the text is shaking at `frame` (0–1): a jolt as each stroke
 * lands, dying away over `decay` seconds, and a rumble while the pen is
 * moving. Still once the text is written, so it comes to rest.
 */
export function shakeStrength(frame: TegakiFrame, o: Pick<ShakeOptions, 'trigger' | 'decay'>): number {
  if (frame.strokes.every((s) => s.state === 'done')) return 0;
  let jolt = 0;
  if (o.trigger !== 'writing') {
    for (const s of frame.strokes) {
      const age = frame.time - s.start;
      if (age >= 0 && age < o.decay * 5) jolt += Math.exp(-age / Math.max(0.01, o.decay));
    }
  }
  const rumble = o.trigger !== 'strokes' && frame.active.length > 0 ? 0.45 : 0;
  return Math.min(1, jolt + rumble);
}

/**
 * Where the shake has the text at `frame`: an offset in ems and a turn in
 * degrees, from a few quick waves of the frame's time — the same at the
 * same time, so a video shakes the same every render.
 */
export function shakeAt(frame: TegakiFrame, o: ShakeOptions, seed = 0): { dx: number; dy: number; turn: number } {
  const strength = shakeStrength(frame, o);
  if (strength <= 0) return { dx: 0, dy: 0, turn: 0 };
  const random = seededRandom(seed, 'shake');
  const w = Math.PI * 2 * o.speed;
  const wave = () => {
    const a = random() * Math.PI * 2;
    const b = random() * Math.PI * 2;
    return Math.sin(frame.time * w + a) * 0.7 + Math.sin(frame.time * w * 1.73 + b) * 0.3;
  };
  return { dx: strength * o.amount * wave(), dy: strength * o.amount * wave(), turn: strength * o.rotation * wave() };
}

/**
 * Screen shake: the text jolts as each stroke lands, rumbles while the
 * pen writes, or both, dying away and coming to rest once it's written. An
 * `ink` hook moving the whole finished picture — the ink and what the hooks
 * before it drew (a glow, a shadow) — from the frame alone, so scrubbing
 * and controlled time shake the same. Underlays and overlays hold still.
 */
export const shakePlugin = createPlugin({
  name: 'shake',
  label: 'Screen shake',
  description: 'The text jolts as strokes land, or rumbles as the pen writes, then comes to rest. ink + bounds.',
  params: {
    trigger: {
      type: 'select',
      label: 'On',
      default: 'strokes',
      options: [
        { value: 'strokes', label: 'Each stroke landing' },
        { value: 'writing', label: 'While writing' },
        { value: 'both', label: 'Both' },
      ],
    },
    amount: { type: 'number', label: 'Amount', description: 'How far it shakes, in ems.', default: 0.025, min: 0, max: 0.15, step: 0.005 },
    decay: {
      type: 'number',
      label: 'Decay',
      description: 'Seconds a jolt takes to die away.',
      default: 0.15,
      min: 0.03,
      max: 1,
      step: 0.01,
    },
    rotation: { type: 'number', label: 'Turn', description: 'How far it turns, in degrees.', default: 0.8, min: 0, max: 6, step: 0.1 },
    speed: { type: 'number', label: 'Speed', description: 'Shakes a second.', default: 14, min: 3, max: 30, step: 1 },
  },
  presets: {
    Impact: { trigger: 'strokes', amount: 0.05, decay: 0.1, rotation: 1.2 },
    Earthquake: { trigger: 'writing', amount: 0.018, speed: 22, rotation: 0.4 },
    Heavy: { trigger: 'both', amount: 0.08, decay: 0.3, rotation: 2.5, speed: 9 },
  },
  setup: (o) => {
    const copy = scratchCanvas();
    return {
      bounds: ({ strokes, fontSize }) =>
        expandBox(unionBoxes(strokes.map((s) => s.path.bounds())), fontSize * (o.amount * 1.2 + o.rotation * 0.01)),
      ink({ ctx, frame, fontSize, bounds, random }) {
        const { dx, dy, turn } = shakeAt(frame, o, random('shake')());
        if (dx === 0 && dy === 0 && turn === 0) return;
        const canvas = ctx.canvas;
        const m = ctx.getTransform();
        // Turn about the middle of the ink.
        const cx = bounds ? m.a * (bounds.minX + bounds.maxX) * 0.5 + m.e : canvas.width / 2;
        const cy = bounds ? m.d * (bounds.minY + bounds.maxY) * 0.5 + m.f : canvas.height / 2;
        const c = copy(canvas.width, canvas.height);
        const g = c.getContext('2d')!;
        g.globalCompositeOperation = 'copy';
        g.drawImage(canvas, 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'copy';
        ctx.translate(cx + dx * fontSize * m.a, cy + dy * fontSize * m.a);
        ctx.rotate((turn * Math.PI) / 180);
        ctx.drawImage(c, 0, 0, canvas.width, canvas.height, -cx, -cy, canvas.width, canvas.height);
      },
    };
  },
});
