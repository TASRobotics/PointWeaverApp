import type { PathDefinition, SimulatedPose } from '../types.ts';
import { SIM_DT } from '../constants.ts';
import { clamp, shortestAngleDeg } from './follower.ts';
import { FollowerCore } from './core.ts';
import { DEFAULT_ROBOT, type ResolvedRobot } from './robot.ts';

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
 * Kinematic sim of the robot following a path, one 20 ms loop per step. Same loop as
 * FollowerCoreSimTest in pointweaver-lib: ask FollowerCore what to do, then move at that velocity
 * while the heading follows a P controller like CTRE's. Assumes the robot starts at rest on point 0.
 */
export function simulatePath(def: PathDefinition, robot: ResolvedRobot = DEFAULT_ROBOT): SimResult {
  const pts = def.points ?? [];
  if (pts.length === 0) return { poses: [], duration: 0, pointTimes: [], stalledAt: null };

  const core = new FollowerCore(def, {
    maxSpeed: robot.maxSpeed,
    maxAcceleration: robot.maxAccel,
    translationKp: robot.translationPID[0],
    translationKi: robot.translationPID[1],
    translationKd: robot.translationPID[2],
    positionTolerance: robot.positionTolerance,
    headingToleranceDeg: robot.headingTolerance,
    period: SIM_DT,
  });
  const rotKp = robot.headingPID[0];
  const maxRate = (robot.maxAngularRate * Math.PI) / 180;

  let x = pts[0].x;
  let y = pts[0].y;
  let h = pts[0].theta ?? 0;
  let t = 0;
  core.start(x, y, h, 0, 0, t);

  const poses: SimulatedPose[] = [{ t, x, y, theta: h, speed: 0 }];
  const pointTimes: number[] = [];
  let index = 0;
  let indexSince = 0;

  for (;;) {
    const out = core.update(x, y, h, t);
    const err = (shortestAngleDeg(h, out.headingDeg) * Math.PI) / 180;
    const omega = clamp(rotKp * err, -maxRate, maxRate);
    x += out.vx * SIM_DT;
    y += out.vy * SIM_DT;
    h = wrapDeg(h + (omega * SIM_DT * 180) / Math.PI);
    t += SIM_DT;
    poses.push({ t, x, y, theta: h, speed: Math.hypot(out.vx, out.vy) });

    if (out.finished || core.targetIndex() !== index) {
      pointTimes.push(t);
      index = core.targetIndex();
      indexSince = t;
    }
    if (out.finished) break;
    if (t - indexSince > MAX_POINT_TIME) return { poses, duration: t, pointTimes, stalledAt: index };
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
    speed: a.speed + (b.speed - a.speed) * f,
  };
}
