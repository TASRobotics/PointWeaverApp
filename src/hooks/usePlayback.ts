import { useEffect, useMemo, useRef, useState } from 'react';
import type { PathDefinition } from '../types';
import { simulatePath } from '../sim/simulate';

export type PlaybackState = 'stopped' | 'playing' | 'paused';

export function usePlayback(path: PathDefinition) {
  const sim = useMemo(() => simulatePath(path), [path]);
  const [state, setState] = useState<PlaybackState>('stopped');
  const timeRef = useRef(0);
  const durationRef = useRef(sim.duration);
  durationRef.current = sim.duration;

  useEffect(() => {
    if (state !== 'playing') return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      timeRef.current += (now - last) / 1000;
      last = now;
      if (timeRef.current > durationRef.current) timeRef.current = 0; // loop
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  const playPause = () => {
    if (state === 'playing') return setState('paused');
    if (state === 'stopped' || timeRef.current >= sim.duration) timeRef.current = 0;
    setState('playing');
  };

  const stop = () => {
    setState('stopped');
    timeRef.current = 0;
  };

  /** Jump to a time (pauses if stopped so the ghost shows). */
  const seek = (t: number) => {
    timeRef.current = Math.max(0, Math.min(sim.duration, t));
    if (state === 'stopped') setState('paused');
  };

  return { sim, state, timeRef, playPause, stop, seek };
}

export type Playback = ReturnType<typeof usePlayback>;
