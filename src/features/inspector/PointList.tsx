import { useEffect, useRef, useState } from 'react';
import type { PathDefinition } from '../../types';
import { HeadingGlyph, IconButton } from '../../components/Icon';

interface Props {
  path: PathDefinition;
  selectedIndex: number | null;
  hoverIndex: number | null;
  onSelect: (i: number | null) => void;
  onHover: (i: number | null) => void;
  onAdd: () => void;
  onMove: (from: number, to: number) => void;
  stalledAt: number | null;
}

/** Every point in order, so overlapping points on the field are still reachable. Drag rows to reorder. */
export function PointList({ path, selectedIndex, hoverIndex, onSelect, onHover, onAdd, onMove, stalledAt }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  useEffect(() => {
    if (selectedIndex == null) return;
    listRef.current?.querySelector(`[data-index="${selectedIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const endDrag = () => {
    setDragFrom(null);
    setDropAt(null);
  };

  return (
    <>
      <div className="section-head">
        <span>Points <b className="count">{path.points.length}</b></span>
        <IconButton icon="plus" title="Add point" onClick={onAdd} />
      </div>
      <div className="list scroll points" ref={listRef} onMouseLeave={() => onHover(null)}>
        {path.points.map((p, i) => (
          <div
            key={i}
            data-index={i}
            draggable
            className={[
              'list-row point-row',
              i === selectedIndex && 'selected',
              i === hoverIndex && 'hovered',
              dropAt === i && dragFrom !== null && (dragFrom > i ? 'drop-above' : 'drop-below'),
            ].filter(Boolean).join(' ')}
            onClick={() => onSelect(i === selectedIndex ? null : i)}
            onMouseEnter={() => onHover(i)}
            onDragStart={e => {
              e.dataTransfer.effectAllowed = 'move';
              setDragFrom(i);
            }}
            onDragOver={e => {
              if (dragFrom === null) return;
              e.preventDefault();
              setDropAt(i);
            }}
            onDrop={e => {
              e.preventDefault();
              if (dragFrom !== null && dragFrom !== i) onMove(dragFrom, i);
              endDrag();
            }}
            onDragEnd={endDrag}
          >
            <span className="idx">{i}</span>
            <span className="num">{p.x.toFixed(2)}</span>
            <span className="num">{p.y.toFixed(2)}</span>
            <span className="heading" title={p.theta != null ? `${p.theta}°` : 'Translation only'}>
              {p.theta != null ? <><HeadingGlyph theta={p.theta} /><span className="num">{Math.round(p.theta)}°</span></> : <span className="ring" />}
            </span>
            <span className="flags">
              {p.events?.length ? <span className="diamond" title={p.events.map(e => e.name).join(', ')} /> : null}
              {stalledAt === i && <span className="warn-dot" title="Ghost gets stuck here" />}
            </span>
          </div>
        ))}
        {path.points.length === 0 && <div className="empty">Double-click the field to add points</div>}
      </div>
    </>
  );
}
