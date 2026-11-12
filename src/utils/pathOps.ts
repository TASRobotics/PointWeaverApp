import type { PathDefinition, PathEvent, PathParams, PathPoint } from '../types';
import { FIELD_HEIGHT, FIELD_WIDTH } from '../constants';

export const round2 = (v: number) => Math.round(v * 100) / 100;
export const clampToField = (x: number, y: number) => ({
  x: round2(Math.max(0, Math.min(FIELD_WIDTH, x))),
  y: round2(Math.max(0, Math.min(FIELD_HEIGHT, y))),
});
export const wrapDeg = (d: number) => {
  const w = ((((d + 180) % 360) + 360) % 360) - 180;
  return w === -180 ? 180 : w;
};

const withPoints = (def: PathDefinition, points: PathPoint[]): PathDefinition => ({ ...def, points });

export function updatePoint(def: PathDefinition, i: number, patch: Partial<PathPoint>): PathDefinition {
  return withPoints(def, def.points.map((p, j) => (j === i ? { ...p, ...patch } : p)));
}

export function updatePointParams(def: PathDefinition, i: number, patch: Partial<PathParams>): PathDefinition {
  return withPoints(def, def.points.map((p, j) => {
    if (j !== i) return p;
    const params = { ...(p.params ?? {}), ...patch };
    const empty = Object.values(params).every(v => v == null);
    return { ...p, params: empty ? null : params };
  }));
}

export function updatePathParams(def: PathDefinition, patch: Partial<PathParams>): PathDefinition {
  return { ...def, params: { ...(def.params ?? {}), ...patch } };
}

export function setEvents(def: PathDefinition, i: number, events: PathEvent[]): PathDefinition {
  return updatePoint(def, i, { events: events.length ? events : null });
}

export function insertPoint(def: PathDefinition, index: number, p: PathPoint): PathDefinition {
  const points = [...def.points];
  points.splice(index, 0, p);
  return withPoints(def, points);
}

export function removePoint(def: PathDefinition, index: number): PathDefinition {
  return withPoints(def, def.points.filter((_, j) => j !== index));
}

export function removePoints(def: PathDefinition, indices: number[]): PathDefinition {
  const drop = new Set(indices);
  return withPoints(def, def.points.filter((_, j) => !drop.has(j)));
}

/** Where some points were when a group drag started. */
export type PointStart = { i: number; x: number; y: number };

/**
 * Move a group of points by (dx, dy) from where they started. The offset is clamped so the whole group
 * stays on the field (it slides along the edge instead of squashing).
 */
export function offsetPoints(def: PathDefinition, start: PointStart[], dx: number, dy: number): PathDefinition {
  if (start.length === 0) return def;
  const xs = start.map(s => s.x);
  const ys = start.map(s => s.y);
  const ox = Math.max(-Math.min(...xs), Math.min(FIELD_WIDTH - Math.max(...xs), dx));
  const oy = Math.max(-Math.min(...ys), Math.min(FIELD_HEIGHT - Math.max(...ys), dy));
  const moved = new Map(start.map(s => [s.i, { x: round2(s.x + ox), y: round2(s.y + oy) }]));
  return withPoints(def, def.points.map((p, j) => {
    const m = moved.get(j);
    return m ? { ...p, ...m } : p;
  }));
}

export function movePoint(def: PathDefinition, from: number, to: number): PathDefinition {
  const points = [...def.points];
  const [p] = points.splice(from, 1);
  points.splice(to, 0, p);
  return withPoints(def, points);
}

/** New point half a meter past the last one (or mid field). */
export function appendPoint(def: PathDefinition): PathDefinition {
  const last = def.points[def.points.length - 1];
  const pos = last ? clampToField(last.x + 0.5, last.y + 0.5) : { x: round2(FIELD_WIDTH / 2), y: round2(FIELD_HEIGHT / 2) };
  return withPoints(def, [...def.points, { ...pos, theta: 0 }]);
}

/** Mirror across the field's center line (x). */
export function flipX(def: PathDefinition): PathDefinition {
  return withPoints(def, def.points.map(p => ({
    ...p,
    x: round2(FIELD_WIDTH - p.x),
    theta: p.theta != null ? wrapDeg(180 - p.theta) : p.theta,
  })));
}

/** Mirror across the field's long axis (y). */
export function flipY(def: PathDefinition): PathDefinition {
  return withPoints(def, def.points.map(p => ({
    ...p,
    y: round2(FIELD_HEIGHT - p.y),
    theta: p.theta != null ? wrapDeg(-p.theta) : p.theta,
  })));
}

/** Where an event sits on the field: fraction of the way from point i to i+1. */
export function eventPosition(points: PathPoint[], i: number, fraction: number) {
  const p = points[i];
  const next = points[i + 1];
  if (!next) return { x: p.x, y: p.y };
  return { x: p.x + (next.x - p.x) * fraction, y: p.y + (next.y - p.y) * fraction };
}
