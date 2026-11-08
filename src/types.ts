export interface PathParams {
  minSpeed?: number | null;
  maxSpeed?: number | null;
  earlyExitRange?: number | null;
  timeout?: number | null;
  interpolate?: boolean | null;
}

export interface PathEvent {
  name: string;
  fraction: number;
}

export interface PathPoint {
  x: number;
  y: number;
  theta?: number | null;
  events?: PathEvent[] | null;
  params?: PathParams | null;
}

export interface PathDefinition {
  points: PathPoint[];
  params: PathParams | null;
  /** robot resets odometry to the first point when this path starts */
  resetPose?: boolean | null;
}

export interface PathFile {
  name: string;
  content: PathDefinition;
}

export interface SimulatedPose {
  t: number;
  x: number;
  y: number;
  theta: number;
}

export interface FieldImageConfig {
  /** file name inside <project>/.pointweaver */
  file: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProjectSettings {
  fieldImage?: FieldImageConfig | null;
}
