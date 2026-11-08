import { useEffect, useRef } from 'react';
import type { Playback } from '../../hooks/usePlayback';
import { Icon, IconButton } from '../../components/Icon';

interface Props {
  playback: Playback;
  dirty: boolean;
  onAdd: () => void;
  onFlipX: () => void;
  onFlipY: () => void;
  onFit: () => void;
  onSave: () => void;
}

function Scrubber({ playback }: { playback: Playback }) {
  const fillRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const { sim, timeRef, seek } = playback;

  // follow the playhead without re-rendering React every frame
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const f = sim.duration > 0 ? timeRef.current / sim.duration : 0;
      if (fillRef.current) fillRef.current.style.width = `${Math.min(1, f) * 100}%`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sim, timeRef]);

  const seekTo = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect();
    seek(((clientX - r.left) / r.width) * sim.duration);
  };

  return (
    <div className="scrubber" ref={barRef}
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId);
        seekTo(e.clientX);
      }}
      onPointerMove={e => {
        if (e.buttons & 1) seekTo(e.clientX);
      }}>
      <div className="scrubber-track"><div className="scrubber-fill" ref={fillRef} /></div>
    </div>
  );
}

export function Toolbar({ playback, dirty, onAdd, onFlipX, onFlipY, onFit, onSave }: Props) {
  const { sim, state } = playback;
  const stalled = sim.stalledAt != null;

  return (
    <div className="toolbar">
      <IconButton icon={state === 'playing' ? 'pause' : 'play'} title="Play ghost (Space)" onClick={playback.playPause}
        disabled={sim.poses.length < 2} />
      <IconButton icon="stop" title="Stop" onClick={playback.stop} disabled={state === 'stopped'} />
      <Scrubber playback={playback} />
      <span className="time" title={stalled ? `Ghost gets stuck at point ${sim.stalledAt} (add a timeout or early exit)` : 'Ghost time'}>
        {stalled ? <><Icon name="warn" size={13} />{sim.stalledAt}</> : `${sim.duration.toFixed(1)}s`}
      </span>
      <span className="sep" />
      <IconButton icon="plus" title="Add point" onClick={onAdd} />
      <IconButton icon="flipX" title="Mirror across center line" onClick={onFlipX} />
      <IconButton icon="flipY" title="Mirror top / bottom" onClick={onFlipY} />
      <IconButton icon="fit" title="Fit field (F)" onClick={onFit} />
      <span className="sep" />
      <IconButton icon="save" title="Save (Ctrl+S)" onClick={onSave} disabled={!dirty} active={dirty} />
    </div>
  );
}
