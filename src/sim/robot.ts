import type { RobotSettings } from '../types.ts';

/** robot.json with every value filled in. Defaults match pointweaver-lib's PointWeaverConfig. */
export interface ResolvedRobot {
  maxSpeed: number; // m/s
  maxAccel: number; // m/s²
  translationPID: [number, number, number];
  headingPID: [number, number, number];
  positionTolerance: number; // m
  headingTolerance: number; // deg
  maxAngularRate: number; // deg/s
  robotLength: number; // m
  robotWidth: number; // m
}

export const DEFAULT_ROBOT: ResolvedRobot = {
  maxSpeed: 4.5, // the library requires this one; this is just a typical swerve top speed for the preview
  maxAccel: 3,
  translationPID: [5, 0, 0],
  headingPID: [2, 0, 0],
  positionTolerance: 0.05,
  headingTolerance: 2,
  maxAngularRate: 720,
  robotLength: 0.85,
  robotWidth: 0.85,
};

const pid = (v: number[] | undefined, d: [number, number, number]): [number, number, number] =>
  v && v.length ? [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0] : d;

export function resolveRobot(s: RobotSettings | null | undefined): ResolvedRobot {
  const d = DEFAULT_ROBOT;
  return {
    maxSpeed: s?.maxSpeed ?? d.maxSpeed,
    maxAccel: s?.maxAccel ?? d.maxAccel,
    translationPID: pid(s?.translationPID, d.translationPID),
    headingPID: pid(s?.headingPID, d.headingPID),
    positionTolerance: s?.positionTolerance ?? d.positionTolerance,
    headingTolerance: s?.headingTolerance ?? d.headingTolerance,
    maxAngularRate: s?.maxAngularRate ?? d.maxAngularRate,
    robotLength: s?.robotLength ?? d.robotLength,
    robotWidth: s?.robotWidth ?? d.robotWidth,
  };
}
