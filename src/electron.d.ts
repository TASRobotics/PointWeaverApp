import type { PathDefinition, PathFile, ProjectSettings, RobotSettings } from './types';

type Result<T = object> = (T & { error?: undefined }) | { error: string };

export interface ElectronAPI {
  listPaths(projectDir: string): Promise<Result<{ paths: PathFile[]; skipped: string[] }>>;
  writePath(projectDir: string, name: string, data: PathDefinition): Promise<Result>;
  renamePath(projectDir: string, oldName: string, newName: string): Promise<Result>;
  deletePath(projectDir: string, name: string): Promise<Result>;
  selectDir(): Promise<Result<{ dir: string | null }>>;
  readRobot(projectDir: string): Promise<Result<{ settings: RobotSettings | null }>>;
  writeRobot(projectDir: string, settings: RobotSettings): Promise<Result>;
  importTuner(projectDir: string): Promise<Result<{ settings: RobotSettings; file: string }>>;
  readSettings(projectDir: string): Promise<Result<{ settings: ProjectSettings }>>;
  writeSettings(projectDir: string, settings: ProjectSettings): Promise<Result>;
  pickFieldImage(projectDir: string): Promise<Result<{ file: string | null; dataUrl?: string }>>;
  saveFieldImage(projectDir: string, dataUrl: string): Promise<Result<{ file: string }>>;
  readFieldImage(projectDir: string, file: string): Promise<Result<{ dataUrl: string | null }>>;
  clearFieldImage(projectDir: string): Promise<Result>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
