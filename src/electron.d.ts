import type { PathDefinition, PathFile, ProjectSettings, RobotSettings } from './types';

type Result<T = object> = (T & { error?: undefined }) | { error: string };

/** What the user tried to do when unsaved paths blocked it. */
export type LeaveAction = 'close' | 'reload';

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
  /** Save / Don't Save / Cancel dialog for these path names. */
  askUnsaved(names: string[]): Promise<Result<{ choice: 'save' | 'discard' | 'cancel' }>>;
  /** Finish a close/reload that was blocked by unsaved paths. */
  leave(action: LeaveAction): Promise<Result>;
  onUnloadBlocked(cb: (action: LeaveAction) => void): () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
