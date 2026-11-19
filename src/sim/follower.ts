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
 * sqrt(vEnd² + 2·0.9·a·(d − vNow·(dt + lag))). The margin and the look-ahead (one loop plus the drivetrain's
 * response lag) prevent overshoot.
 */
export function brakingSpeed(d: number, vNow: number, vEnd: number, accel: number, dt: number, lag = 0): number {
  const dPlan = Math.max(0, d - vNow * (dt + lag));
  return Math.sqrt(vEnd * vEnd + 2 * BRAKE_MARGIN * accel * dPlan);
}

/**
 * Fastest speed for turning at p, from prev→p onto p→next, inside the radius-r circle where the robot moves on:
 * sqrt(0.9·a·r / tan(θ/2)), or with a drivetrain lag (turn starts v·lag late) v = (√(k²·lag² + 4·k·r) − k·lag) / 2,
 * k = 0.9·a / tan(θ/2). Straight through: no limit. Doubling back, or a zero-length side: 0.
 */
export function cornerSpeed(prev: PathPoint, p: PathPoint, next: PathPoint, r: number, accel: number, lag = 0): number {
  const ax = p.x - prev.x;
  const ay = p.y - prev.y;
  const bx = next.x - p.x;
  const by = next.y - p.y;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la <= EPS || lb <= EPS) return 0;
  const theta = Math.acos(clamp((ax * bx + ay * by) / (la * lb), -1, 1));
  const t = Math.tan(theta / 2);
  if (t <= 1e-6) return Infinity;
  const k = (BRAKE_MARGIN * accel) / t;
  return (Math.sqrt(k * k * lag * lag + 4 * k * r) - k * lag) / 2;
}

/**
 * Speed the robot may still have when it moves on from each point (0 = stop there: first and last points, and
 * heading points without an early exit range). Otherwise the lowest of the corner, what still slows to the next
 * point's speed in the room between them, and this and the next point's max speed.
 */
export function passSpeeds(
  pts: PathPoint[], params: ResolvedParams[], robotMax: number, robotAccel: number, posTolerance: number, lag = 0,
): number[] {
  const n = pts.length;
  const pass = new Array<number>(n).fill(0);
  for (let k = n - 2; k >= 1; k--) {
    const p = pts[k];
    const next = pts[k + 1];
    const here = params[k];
    const after = params[k + 1];
    if (p.theta != null && Number.isNaN(here.earlyExitRange)) continue; // stop and turn
    const accel = Math.min(here.maxAccel, after.maxAccel, robotAccel);
    const r = Number.isNaN(here.earlyExitRange) ? posTolerance : here.earlyExitRange;
    const rNext = k + 1 < n - 1 && !Number.isNaN(after.earlyExitRange) ? after.earlyExitRange : 0;
    const room = Math.max(0, dist(p.x, p.y, next.x, next.y) - r - rNext);
    const reach = Math.sqrt(pass[k + 1] * pass[k + 1] + 2 * BRAKE_MARGIN * accel * room);
    const cap = Math.min(here.maxSpeed, after.maxSpeed, robotMax);
    pass[k] = Math.min(cornerSpeed(pts[k - 1], p, next, r, accel, lag), reach, cap);
  }
  return pass;
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

  const [total, remaining] = turnLengths(pts, prefix, params, a, b, k, poseX, poseY, startX, startY);
  if (total <= EPS) return toDeg;
  const progress = smoothstep(clamp(1 - remaining / total, 0, 1));
  return fromDeg + shortestAngleDeg(fromDeg, toDeg) * progress;
}

/**
 * [total, remaining] of the turn from heading point a to b, along the path. If the robot moves on from b at an
 * early exit range (b isn't the last point), the turn ends there, so there's no jump at the handoff.
 */
function turnLengths(
  pts: PathPoint[], prefix: number[], params: ResolvedParams[], a: number, b: number, k: number,
  poseX: number, poseY: number, startX: number, startY: number,
): [number, number] {
  const target = pts[k];
  const total = a >= 0
    ? prefix[b] - prefix[a]
    : dist(startX, startY, pts[0].x, pts[0].y) + prefix[b] - prefix[0];
  const remaining = dist(poseX, poseY, target.x, target.y) + prefix[b] - prefix[k];
  const exit = b < pts.length - 1 && !Number.isNaN(params[b].earlyExitRange) ? params[b].earlyExitRange : 0;
  return [total - exit, Math.max(0, remaining - exit)];
}

/**
 * How fast desiredHeadingDeg is turning (deg/s) while the robot drives toward pts[k] at (vx, vy): the heading
 * controller's feedforward. 0 while holding a heading or aiming straight for the next one.
 */
export function desiredHeadingRateDegPerSec(
  pts: PathPoint[], prefix: number[], params: ResolvedParams[], k: number,
  poseX: number, poseY: number, vx: number, vy: number, startX: number, startY: number, startHeadingDeg: number,
): number {
  const a = prevHeadingIndex(pts, k);
  const b = nextHeadingIndex(pts, k);
  if (b < 0 || !params[b].interpolate) return 0;
  const fromDeg = a >= 0 ? pts[a].theta! : startHeadingDeg;
  const [total, remaining] = turnLengths(pts, prefix, params, a, b, k, poseX, poseY, startX, startY);
  if (total <= EPS) return 0;
  const u = 1 - remaining / total;
  if (u <= 0 || u >= 1) return 0;
  const target = pts[k];
  const d = dist(poseX, poseY, target.x, target.y);
  if (d <= EPS) return 0;
  const closing = ((target.x - poseX) * vx + (target.y - poseY) * vy) / d;
  return (shortestAngleDeg(fromDeg, pts[b].theta!) * 6 * u * (1 - u) * closing) / total;
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
