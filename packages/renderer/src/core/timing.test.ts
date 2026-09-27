import { describe, expect, mock, test } from 'bun:test';
import type { PlacedStroke } from '../lib/strokeTimeline.ts';
import { timingWith } from './plugins.ts';
import type { TegakiPlugin, TegakiTimingContext } from './types.ts';

const stroke = (id: string, start: number, duration: number) => ({ id, start, duration }) as PlacedStroke;
const strokes = [stroke('0:0', 0, 1), stroke('0:1', 1, 0.5), stroke('2:0', 2, 1)];
const extra = { fontSize: 10, random: () => Math.random };
const times = (out: { strokes: readonly PlacedStroke[] }) => out.strokes.map((s) => [s.start, s.duration]);

describe('timingWith', () => {
  test('without a timing hook there is nothing to run', () => {
    expect(timingWith([{ name: 'plain', paint: () => {} }], extra, mock())).toBeUndefined();
  });

  test('a hook gives every stroke its time; the timeline ends as far past the last stroke as it did', () => {
    const halve: TegakiPlugin = {
      name: 'halve',
      timing: ({ strokes }) => ({ strokes: strokes.map((s) => ({ start: s.start / 2, duration: s.duration / 2 })) }),
    };
    const out = timingWith([halve], extra, mock())!(strokes, 3.5);
    expect(times(out)).toEqual([
      [0, 0.5],
      [0.5, 0.25],
      [1, 0.5],
    ]);
    expect(out.duration).toBe(2);
  });

  test('a hook can set how long the timeline runs, but not end it before the last stroke', () => {
    const run = (duration: number) =>
      timingWith([{ name: 'hold', timing: ({ strokes }) => ({ strokes, duration }) }], extra, mock())!(strokes, 3);
    expect(run(10).duration).toBe(10);
    expect(run(1).duration).toBe(3);
  });

  test('hooks run in order, each on the times the one before gave', () => {
    const seen: number[][] = [];
    const shift: TegakiPlugin = {
      name: 'shift',
      timing: ({ strokes }) => ({ strokes: strokes.map((s) => ({ start: s.start + 1, duration: s.duration })) }),
    };
    const look: TegakiPlugin = {
      name: 'look',
      timing: (ctx: TegakiTimingContext) => {
        seen.push([...ctx.strokes.map((s) => s.start), ctx.duration]);
        return undefined;
      },
    };
    timingWith([shift, look], extra, mock())!(strokes, 3);
    expect(seen).toEqual([[1, 2, 3, 4]]);
  });

  test('a stroke a hook leaves as it was is the same object', () => {
    const out = timingWith([{ name: 'same', timing: ({ strokes }) => ({ strokes }) }], extra, mock())!(strokes, 3);
    expect(out.strokes[0]).toBe(strokes[0]!);
  });

  test('times are kept to zero or later', () => {
    const early: TegakiPlugin = { name: 'early', timing: ({ strokes }) => ({ strokes: strokes.map(() => ({ start: -1, duration: -2 })) }) };
    expect(times(timingWith([early], extra, mock())!(strokes, 3))[0]).toEqual([0, 0]);
  });

  test('a hook that throws, or misses a stroke, is reported and skipped', () => {
    const onError = mock();
    const broken: TegakiPlugin = {
      name: 'broken',
      timing: () => {
        throw new Error('x');
      },
    };
    const short: TegakiPlugin = { name: 'short', timing: ({ strokes }) => ({ strokes: strokes.slice(1) }) };
    const nan: TegakiPlugin = {
      name: 'nan',
      timing: ({ strokes }) => ({ strokes: strokes.map(() => ({ start: Number.NaN, duration: 1 })) }),
    };
    const out = timingWith([broken, short, nan], extra, onError)!(strokes, 3);
    expect(out.strokes).toBe(strokes);
    expect(out.duration).toBe(3);
    expect(onError.mock.calls.map((c) => [(c[0] as TegakiPlugin).name, c[1]])).toEqual([
      ['broken', 'timing'],
      ['short', 'timing'],
      ['nan', 'timing'],
    ]);
  });
});
