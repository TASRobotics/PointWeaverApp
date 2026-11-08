import type { PathDefinition, SimulatedPose } from '../types.ts';
import { ROBOT, SIM_DT } from '../constants.ts';
import {
  EPS, clamp, clampSpeed, desiredHeadingDeg, isPointFinished, prefixDistances, resolveAll, shortestAngleDeg,
} from './follower.ts';

export type RobotConfig = typeof ROBOT;

export interface SimResult {
  poses: SimulatedPose[];
  duration: number;
  /** time each point finished */
  pointTimes: number[];
  /** index of the point the ghost got stuck on, if any */
  stalledAt: number | null;
}

const MAX_POINT_TIME = 30; // s, a point with no timeout that takes longer than this counts as stuck

const wrapDeg = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/**
 * Kinematic sim of Pathfinder, one 20ms robot loop per step:
 * compute the command from the current pose, check if the point is finished, then drive for one loop.
 * Translation is instant (no accel limit, same as the robot), heading follows a P controller like CTRE's.
 * Assumes the robot starts sitting on point 0.
 */
export function simulatePath(def: PathDefinition, cfg: RobotConfig = ROBOT): SimResult {
  const pts = def.points ?? [];
  if (pts.length === 0) return { poses: [], duration: 0, pointTimes: [], stalledAt: null };

  const prefix = prefixDistances(pts);
  const params = resolveAll(def);

  let x = pts[0].x;
  let y = pts[0].y;
  let h = pts[0].theta ?? 0;
  const startX = x, startY = y, startH = h;

  let t = 0;
  const poses: SimulatedPose[] = [{ t, x, y, theta: h }];
  const pointTimes: number[] = [];

  for (let k = 0; k < pts.length; k++) {
    const target = pts[k];
    const isLast = k === pts.length - 1;
    let elapsed = 0;

    for (;;) {
      const dx = target.x - x;
      const dy = target.y - y;
      const d = Math.hypot(dx, dy);
      const speed = clampSpeed(Math.abs(cfg.moveKp * d), params[k], isLast, cfg.maxSpeed);
      const vx = d > EPS ? (dx / d) * speed : 0;
      const vy = d > EPS ? (dy / d) * speed : 0;

      const want = desiredHeadingDeg(pts, prefix, params, k, x, y, startX, startY, startH);
      const finished = isPointFinished(
        target, params[k], isLast, x, y, h, elapsed, cfg.posTolerance, cfg.headingToleranceDeg,
      );

      // the command from this loop runs for one period either way
      const err = (shortestAngleDeg(h, want) * Math.PI) / 180;
      const omega = clamp(cfg.rotKp * err, -cfg.maxAngularRate, cfg.maxAngularRate);
      x += vx * SIM_DT;
      y += vy * SIM_DT;
      h = wrapDeg(h + (omega * SIM_DT * 180) / Math.PI);
      t += SIM_DT;
      elapsed += SIM_DT;
      poses.push({ t, x, y, theta: h });

      if (finished) break;
      if (elapsed > MAX_POINT_TIME) return { poses, duration: t, pointTimes, stalledAt: k };
    }
    pointTimes.push(t);
  }

  return { poses, duration: t, pointTimes, stalledAt: null };
}

/** Pose at time t (linear between sim steps). */
export function poseAt(sim: SimResult, t: number): SimulatedPose | null {
  const { poses } = sim;
  if (poses.length === 0) return null;
  const i = clamp(Math.floor(t / SIM_DT), 0, poses.length - 1);
  const a = poses[i];
  const b = poses[Math.min(i + 1, poses.length - 1)];
  if (a === b) return a;
  const f = clamp((t - a.t) / (b.t - a.t), 0, 1);
  return {
    t,
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    theta: a.theta + shortestAngleDeg(a.theta, b.theta) * f,
  };
}
