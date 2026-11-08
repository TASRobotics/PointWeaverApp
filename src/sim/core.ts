/**
 * 1:1 port of pointweaver.core.FollowerCore and Pid (github.com/TASRobotics/pointweaver-lib).
 * If you change the logic there, change it here too, or the ghost lies.
 */
import type { PathDefinition, PathPoint } from '../types.ts';
import {
  EPS, brakingSpeed, clamp, clampSpeed, desiredHeadingDeg, isPointFinished, prefixDistances, resolveAll, segmentProgress, slew,
  type ResolvedParams,
} from './follower.ts';

export interface FollowerSettings {
  maxSpeed: number;
  maxAcceleration: number;
  translationKp: number;
  translationKi: number;
  translationKd: number;
  positionTolerance: number;
  headingToleranceDeg: number;
  period: number;
}

export interface FollowerOutput {
  vx: number;
  vy: number;
  headingDeg: number;
  targetIndex: number;
  distance: number;
  plannedSpeed: number;
  finished: boolean;
}

/** Same math as WPILib's PIDController (including the default ±1 integrator clamp). */
class Pid {
  private prevError = 0;
  private totalError = 0;
  private readonly kP: number;
  private readonly kI: number;
  private readonly kD: number;
  private readonly period: number;

  constructor(kP: number, kI: number, kD: number, period: number) {
    this.kP = kP;
    this.kI = kI;
    this.kD = kD;
    this.period = period;
  }

  calculate(measurement: number, setpoint: number): number {
    const error = setpoint - measurement;
    if (this.kI !== 0) this.totalError = clamp(this.totalError + error * this.period, -1 / this.kI, 1 / this.kI);
    const derivative = (error - this.prevError) / this.period;
    this.prevError = error;
    return this.kP * error + this.kI * this.totalError + this.kD * derivative;
  }

  reset() {
    this.prevError = 0;
    this.totalError = 0;
  }
}

export class FollowerCore {
  private readonly pts: PathPoint[];
  private readonly prefix: number[];
  private readonly params: ResolvedParams[];
  private readonly fired: boolean[][];
  private readonly pid: Pid;
  private readonly settings: FollowerSettings;
  private readonly onEvent: (name: string) => void;

  private index = 0;
  private pointStartTime = 0;
  private startX = 0;
  private startY = 0;
  private startHeadingDeg = 0;
  private cmdVx = 0;
  private cmdVy = 0;
  private started = false;
  private finished = false;

  constructor(path: PathDefinition, settings: FollowerSettings, onEvent?: (name: string) => void) {
    this.pts = path.points ?? [];
    this.settings = settings;
    this.onEvent = onEvent ?? (() => {});
    this.prefix = prefixDistances(this.pts);
    this.params = resolveAll(path);
    this.fired = this.pts.map(p => (p.events ?? []).map(() => false));
    this.pid = new Pid(settings.translationKp, settings.translationKi, settings.translationKd, settings.period);
  }

  start(x: number, y: number, headingDeg: number, vx: number, vy: number, timeSec: number) {
    this.startX = x;
    this.startY = y;
    this.startHeadingDeg = headingDeg;
    this.cmdVx = vx;
    this.cmdVy = vy;
    for (const f of this.fired) f.fill(false);
    this.index = 0;
    this.pointStartTime = timeSec;
    this.pid.reset();
    this.started = true;
    this.finished = this.pts.length === 0;
  }

  update(x: number, y: number, headingDeg: number, timeSec: number): FollowerOutput {
    if (!this.started) throw new Error('call start() before update()');
    if (this.finished) return this.stopped(headingDeg);

    const { pts, params, settings } = this;
    const target = pts[this.index];
    const prm = params[this.index];
    const isLast = this.index === pts.length - 1;
    const accel = Math.min(prm.maxAccel, settings.maxAcceleration);

    const xError = target.x - x;
    const yError = target.y - y;
    const distance = Math.hypot(xError, yError);

    const approach = Math.abs(this.pid.calculate(distance, 0));
    const braking = brakingSpeed(distance, Math.hypot(this.cmdVx, this.cmdVy), 0, accel, settings.period);
    const planned = clampSpeed(Math.min(approach, braking), prm, isLast, settings.maxSpeed);
    let tx = 0;
    let ty = 0;
    if (distance > EPS) {
      tx = (xError / distance) * planned;
      ty = (yError / distance) * planned;
    }
    [this.cmdVx, this.cmdVy] = slew(this.cmdVx, this.cmdVy, tx, ty, accel * settings.period);

    const wantDeg = desiredHeadingDeg(pts, this.prefix, params, this.index, x, y, this.startX, this.startY, this.startHeadingDeg);

    if (this.index > 0) this.fireEvents(this.index - 1, segmentProgress(pts[this.index - 1], target, x, y));

    const done = isPointFinished(target, prm, isLast, x, y, headingDeg, timeSec - this.pointStartTime,
      settings.positionTolerance, settings.headingToleranceDeg);
    if (!done) return this.out(this.cmdVx, this.cmdVy, wantDeg, this.index, distance, planned, false);

    if (this.index > 0) this.fireEvents(this.index - 1, 1);
    if (isLast) {
      this.fireEvents(this.index, 1);
      this.finished = true;
      this.cmdVx = 0;
      this.cmdVy = 0;
      return this.out(0, 0, wantDeg, this.index, distance, 0, true);
    }
    this.index++;
    this.pointStartTime = timeSec;
    this.pid.reset();
    return this.out(this.cmdVx, this.cmdVy, wantDeg, this.index - 1, distance, planned, false);
  }

  isFinished() {
    return this.finished;
  }

  targetIndex() {
    return this.index;
  }

  private stopped(headingDeg: number): FollowerOutput {
    const last = Math.max(0, Math.min(this.index, this.pts.length - 1));
    return this.out(0, 0, headingDeg, last, 0, 0, true);
  }

  private out(vx: number, vy: number, headingDeg: number, targetIndex: number, distance: number, plannedSpeed: number, finished: boolean): FollowerOutput {
    return { vx, vy, headingDeg, targetIndex, distance, plannedSpeed, finished };
  }

  private fireEvents(pointIdx: number, progress: number) {
    const evs = this.pts[pointIdx].events ?? [];
    evs.forEach((ev, e) => {
      if (this.fired[pointIdx][e] || progress < ev.fraction) return;
      this.fired[pointIdx][e] = true;
      this.onEvent(ev.name);
    });
  }
}
