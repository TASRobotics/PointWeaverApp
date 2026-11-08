import { useEffect, useMemo, useRef, useState } from 'react';
import type { RobotSettings } from '../types';
import { resolveRobot } from '../sim/robot';

const api = () => window.electronAPI!;

/** Strip unset values so robot.json only holds what the team actually set. */
function clean(s: RobotSettings): RobotSettings {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) if (v != null) out[k] = v;
  return out as RobotSettings;
}

/**
 * deploy/pointweaver/robot.json: the robot settings shared with pointweaver-lib.
 * `settings` is null when the project doesn't have the file yet; `robot` is always filled in (defaults).
 */
export function useRobotSettings(projectDir: string | null) {
  const [settings, setSettings] = useState<RobotSettings | null>(null);
  const settingsRef = useRef<RobotSettings | null>(null);

  const apply = (s: RobotSettings | null) => {
    settingsRef.current = s;
    setSettings(s);
  };

  useEffect(() => {
    apply(null);
    if (!projectDir) return;
    let cancelled = false;
    api().readRobot(projectDir).then(res => {
      if (cancelled) return;
      if (res.error !== undefined) alert(`Couldn't read robot.json: ${res.error}`);
      else apply(res.settings);
    });
    return () => {
      cancelled = true;
    };
  }, [projectDir]);

  const save = async (next: RobotSettings) => {
    if (!projectDir) return;
    const cleaned = clean(next);
    apply(cleaned);
    const res = await api().writeRobot(projectDir, cleaned);
    if (res.error !== undefined) alert(`Couldn't save robot.json: ${res.error}`);
  };

  /** Change some values (null/undefined = back to default) and save. */
  const update = (patch: Partial<RobotSettings>) => save({ ...(settingsRef.current ?? {}), ...patch });

  /** Fill speed, spin rate and footprint from the project's TunerConstants.java, keeping everything else. */
  const importFromTuner = async () => {
    if (!projectDir) return;
    const res = await api().importTuner(projectDir);
    if (res.error !== undefined) return alert(res.error);
    await save({ ...(settingsRef.current ?? {}), ...res.settings });
  };

  const robot = useMemo(() => resolveRobot(settings), [settings]);

  return { settings, robot, update, importFromTuner };
}

export type RobotSettingsState = ReturnType<typeof useRobotSettings>;
