import { Fragment, useEffect, useRef, useState } from 'react';
import type { PathDefinition } from '../../types';
import { HeadingGlyph, IconButton } from '../../components/Icon';

interface Props {
  path: PathDefinition;
  selectedIndex: number | null;
  /** every selected point (a box-selected group highlights all its rows) */
  selection: number[];
  hoverIndex: number | null;
  onSelect: (i: number | null) => void;
  /** an event row was clicked: select its point and show that event in the Inspector */
  onSelectEvent: (point: number, event: number) => void;
  onHover: (i: number | null) => void;
  onAdd: () => void;
  onMove: (from: number, to: number) => void;
  stalledAt: number | null;
}

/**
 * Every point in order, so overlapping points on the field are still reachable. Drag rows to reorder.
 * Clicking a row selects just that point. A point's events are listed under it, indented on a guide line; clicking
 * one selects its point and brings that event up in the Inspector.
 */
export function PointList({
  path, selectedIndex, selection, hoverIndex, onSelect, onSelectEvent, onHover, onAdd, onMove, stalledAt,
}: Props) {
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
          <Fragment key={i}>
            <div
              data-index={i}
              draggable
              className={[
                'list-row point-row',
                selection.includes(i) && 'selected',
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
                {stalledAt === i && <span className="warn-dot" title="Ghost gets stuck here" />}
              </span>
            </div>
            {p.events?.length ? (
              <div className={`point-events ${selection.includes(i) ? 'selected' : ''}`}>
                {p.events.map((ev, e) => (
                  <div key={e} className="event-row" title={ev.name} onClick={() => onSelectEvent(i, e)} onMouseEnter={() => onHover(i)}>
                    <span className="diamond" />
                    <span className="name">{ev.name || <em>unnamed</em>}</span>
                    {/* the last point's events fire when the robot arrives, whatever their fraction */}
                    <span className="at">{i === path.points.length - 1 ? 'arrive' : `${Math.round(ev.fraction * 100)}%`}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </Fragment>
        ))}
        {path.points.length === 0 && <div className="empty">Double-click the field to add points</div>}
      </div>
    </>
  );
}
