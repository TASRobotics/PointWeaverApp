// 2026 REBUILT welded field, from WPILib's 2026-rebuilt-welded.json
export const FIELD_WIDTH = 16.541; // x (m)
export const FIELD_HEIGHT = 8.069; // y (m)

/**
 * Mirrors TunerConstants in the robot project so the ghost matches the real follower.
 * If you retune the robot, update these too.
 */
export const ROBOT = {
  maxSpeed: 6.48, // kSpeedAt12Volts (m/s)
  moveKp: 1.0, // PathMoveKp
  rotKp: 2.0, // PathRotKp (CTRE heading controller, rad/s per rad)
  maxAngularRate: 16, // physical limit ~ maxSpeed / module radius (rad/s); Pathfinder doesn't cap it
  posTolerance: 0.05, // PathPosTolerance (m)
  headingToleranceDeg: 2.0, // PathHeadingToleranceDeg
  length: 0.8, // ghost footprint, bumper to bumper (m)
  width: 0.8,
};

export const SIM_DT = 0.02; // robot loop period (s)

export const PATH_NAME_RE = /^[A-Za-z0-9_\- ]+$/;
