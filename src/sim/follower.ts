/**
 * 1:1 port of pointweaver.core.PathMath (github.com/TASRobotics/pointweaver-lib).
 * If you change the logic there, change it here too, or the ghost lies.
 */
import type { PathDefinition, PathParams, PathPoint } from '../types.ts';

export const EPS = 1e-9;
/** Braking is planned with this share of the acceleration limit; the rest is left for steering. */
export const BRAKE_MARGIN = 0.9;

export const smoothstep = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** signed shortest delta from start to end, in [-180, 180) */
export const shortestAngleDeg = (startDeg: number, endDeg: number) =>
  ((((endDeg - startDeg) % 360) + 540) % 360) - 180;

export const dist = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1);

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function prefixDistances(points: PathPoint[]): number[] {
  const prefix = new Array<number>(points.length).fill(0);
  for (let i = 1; i < points.length; i++) {
    prefix[i] = prefix[i - 1] + dist(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
  }
  return prefix;
}

/** first index >= from that has a theta, or -1 */
export function nextHeadingIndex(points: PathPoint[], from: number): number {
  for (let j = Math.max(0, from); j < points.length; j++) if (points[j].theta != null) return j;
  return -1;
}

/** last index < before that has a theta, or -1 */
export function prevHeadingIndex(points: PathPoint[], before: number): number {
  for (let j = Math.min(before, points.length) - 1; j >= 0; j--) if (points[j].theta != null) return j;
  return -1;
}

export interface ResolvedParams {
  minSpeed: number; // 0 when unset
  maxSpeed: number; // Infinity when unset
  maxAccel: number; // Infinity when unset
  earlyExitRange: number; // NaN when unset
  timeout: number; // Infinity when unset
  interpolate: boolean; // path OR point (on for the path can't be turned off per point)
}

export function resolve(path: PathParams | null | undefined, point: PathParams | null | undefined): ResolvedParams {
  return {
    minSpeed: point?.minSpeed ?? path?.minSpeed ?? 0,
    maxSpeed: point?.maxSpeed ?? path?.maxSpeed ?? Infinity,
    maxAccel: point?.maxAccel ?? path?.maxAccel ?? Infinity,
    earlyExitRange: point?.earlyExitRange ?? path?.earlyExitRange ?? NaN,
    timeout: point?.timeout ?? path?.timeout ?? Infinity,
    interpolate: path?.interpolate === true || point?.interpolate === true,
  };
}

export const resolveAll = (def: PathDefinition) => (def.points ?? []).map(p => resolve(def.params, p.params));

/** The last point ignores minSpeed so the robot settles instead of orbiting the target. */
export function clampSpeed(raw: number, p: ResolvedParams, isLast: boolean, robotMax: number): number {
  const max = Math.min(p.maxSpeed, robotMax);
  const min = isLast ? 0 : Math.min(p.minSpeed, max);
  if (raw <= EPS) return 0;
  return clamp(raw, min, max);
}

/**
 * Fastest speed toward a point that can still slow to vEnd by the time it gets there:
 * sqrt(vEnd² + 2·0.9·a·(d − vNow·dt)). The margin and one-loop look-ahead prevent overshoot.
 */
export function brakingSpeed(d: number, vNow: number, vEnd: number, accel: number, dt: number): number {
  const dPlan = Math.max(0, d - vNow * dt);
  return Math.sqrt(vEnd * vEnd + 2 * BRAKE_MARGIN * accel * dPlan);
}

/** Move velocity (vx, vy) toward (tx, ty), changing it by at most maxDelta as a vector. */
export function slew(vx: number, vy: number, tx: number, ty: number, maxDelta: number): [number, number] {
  const dx = tx - vx;
  const dy = ty - vy;
  const m = Math.hypot(dx, dy);
  if (m <= maxDelta || m <= EPS) return [tx, ty];
  return [vx + (dx / m) * maxDelta, vy + (dy / m) * maxDelta];
}

/**
 * Heading (deg) to face while driving toward pts[k].
 * interpolate on the sandwich's end point = smooth turn across the whole sandwich (no snapping).
 * interpolate off = aim for the end point's heading as soon as the robot leaves the previous heading point.
 */
export function desiredHeadingDeg(
  pts: PathPoint[], prefix: number[], params: ResolvedParams[], k: number,
  poseX: number, poseY: number, startX: number, startY: number, startHeadingDeg: number,
): number {
  const a = prevHeadingIndex(pts, k);
  const b = nextHeadingIndex(pts, k);
  const fromDeg = a >= 0 ? pts[a].theta! : startHeadingDeg;

  if (b < 0) return fromDeg;
  const toDeg = pts[b].theta!;

  if (!params[b].interpolate) return toDeg;

  const target = pts[k];
  const total = a >= 0
    ? prefix[b] - prefix[a]
    : dist(startX, startY, pts[0].x, pts[0].y) + prefix[b] - prefix[0];
  const remaining = dist(poseX, poseY, target.x, target.y) + prefix[b] - prefix[k];

  if (total <= EPS) return toDeg;
  const progress = smoothstep(clamp(1 - remaining / total, 0, 1));
  return fromDeg + shortestAngleDeg(fromDeg, toDeg) * progress;
}

export function isPointFinished(
  p: PathPoint, params: ResolvedParams, isLast: boolean,
  poseX: number, poseY: number, headingDeg: number, elapsed: number,
  posTolerance: number, headingToleranceDeg: number,
): boolean {
  if (elapsed > params.timeout) return true;

  const d = dist(poseX, poseY, p.x, p.y);
  if (!isLast && !Number.isNaN(params.earlyExitRange) && d < params.earlyExitRange) return true;

  if (d >= posTolerance) return false; // a circle around the point (straight-line distance)
  if (p.theta == null) return true;
  return Math.abs(shortestAngleDeg(headingDeg, p.theta)) < headingToleranceDeg;
}

/** 0..1 projection of (x, y) onto segment a -> b. */
export function segmentProgress(a: PathPoint, b: PathPoint, x: number, y: number): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= EPS) return 1;
  return clamp(((x - a.x) * dx + (y - a.y) * dy) / len2, 0, 1);
}
