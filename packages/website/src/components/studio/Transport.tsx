import type { ReactNode } from 'react';
import { LoopIcon, PauseIcon, PlayIcon } from './icons.tsx';
import { cx, IconButton } from './ui.tsx';

/** How long a looping timeline holds its last frame before it starts over, in ms. */
export const LOOP_HOLD_MS = 700;

/** Play/pause, a loop toggle and a scrubber for a seekable timeline. */
export function Transport({
  time,
  duration,
  playing,
  loop,
  onPlayPause,
  onLoopChange,
  onSeek,
  disabled,
  trailing,
}: {
  time: number;
  duration: number;
  playing: boolean;
  /** Whether playback starts over at the end (after {@link LOOP_HOLD_MS}). */
  loop: boolean;
  onPlayPause: () => void;
  onLoopChange: (loop: boolean) => void;
  onSeek: (t: number) => void;
  /** Keeps the bar (and the space it takes) with its controls off — for a view with nothing to play. */
  disabled?: boolean;
  trailing?: ReactNode;
}) {
  const off = disabled || duration <= 0;
  const pct = !disabled && duration > 0 ? Math.min(time / duration, 1) * 100 : 0;
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-t border-zinc-200 bg-white px-2 dark:border-zinc-800 dark:bg-zinc-900">
      <IconButton label={playing ? 'Pause (Space)' : 'Play (Space)'} onClick={onPlayPause} disabled={off}>
        {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
      </IconButton>
      <IconButton label={loop ? 'Loop: on' : 'Loop: off'} active={loop} onClick={() => onLoopChange(!loop)} disabled={off}>
        <LoopIcon size={14} />
      </IconButton>
      <input
        type="range"
        aria-label="Timeline position"
        className="studio-scrubber mx-2 min-w-0 flex-1"
        min={0}
        max={duration || 1}
        step={0.0001}
        value={disabled ? 0 : Math.min(time, duration)}
        disabled={off}
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
        onChange={(e) => onSeek(Number(e.target.value))}
      />
      <span className={cx('shrink-0 font-mono text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400', disabled && 'opacity-40')}>
        {time.toFixed(2)}
        <span className="text-zinc-300 dark:text-zinc-600"> / </span>
        {duration.toFixed(2)}s
      </span>
      {trailing}
    </div>
  );
}
