import type { PathDefinition, PathParams } from '../../types';
import type { HistoryMode } from '../../hooks/usePathEditor';
import type { ResolvedRobot } from '../../sim/robot';
import { IconButton } from '../../components/Icon';
import { NumberField, Toggle } from '../../components/Controls';
import { removePoint, setEvents, updatePathParams, updatePoint, updatePointParams, wrapDeg } from '../../utils/pathOps';

interface Props {
  path: PathDefinition;
  selectedIndex: number | null;
  update: (def: PathDefinition, mode?: HistoryMode) => void;
  onSelect: (i: number | null) => void;
  duration: number;
  stalledAt: number | null;
  robot: ResolvedRobot;
}

const show = (v: number | null | undefined, fallback: string) => (v != null ? String(v) : fallback);

export function Inspector({ path, selectedIndex, update, onSelect, duration, stalledAt, robot }: Props) {
  const point = selectedIndex != null ? path.points[selectedIndex] : null;
  const pp = path.params ?? {};

  if (!point || selectedIndex == null) {
    const setPath = (patch: Partial<PathParams>, key: string) => update(updatePathParams(path, patch), key);
    return (
      <div className="inspector scroll">
        <div className="section-head"><span>Path</span></div>
        <div className="pad stack">
          <div className="row-between" title="Robot resets odometry to point 0 when this path starts">
            <span className="field-label">Reset pose at start</span>
            <Toggle checked={path.resetPose ?? false} title="Reset pose to point 0"
              onChange={v => update({ ...path, resetPose: v ? true : undefined })} />
          </div>
          <div className="grid-2">
            <NumberField label="Max" suffix="m/s" nullable value={pp.maxSpeed} placeholder={String(robot.maxSpeed)}
              onChange={v => setPath({ maxSpeed: v }, 'path-max')} />
            <NumberField label="Min" suffix="m/s" nullable value={pp.minSpeed} placeholder="0"
              onChange={v => setPath({ minSpeed: v }, 'path-min')} />
            <NumberField label="Accel" suffix="m/s²" nullable value={pp.maxAccel} placeholder={String(robot.maxAccel)}
              title="Acceleration limit (capped by the robot's)" onChange={v => setPath({ maxAccel: v }, 'path-accel')} />
            <NumberField label="Exit" suffix="m" nullable value={pp.earlyExitRange} placeholder="off" title="Early exit range"
              onChange={v => setPath({ earlyExitRange: v }, 'path-exit')} />
            <NumberField label="Timeout" suffix="s" nullable value={pp.timeout} placeholder="∞" title="Per-point timeout"
              onChange={v => setPath({ timeout: v }, 'path-timeout')} />
          </div>
          <div className="row-between">
            <span className="field-label">Interpolate heading</span>
            <Toggle checked={pp.interpolate ?? false} title="On: every heading point turns smoothly. Off: each point decides."
              onChange={v => setPath({ interpolate: v }, 'path-interp')} />
          </div>
          <div className="stats">
            <div><b>{stalledAt != null ? '∞' : duration.toFixed(2)}</b><span>s</span></div>
            <div><b>{path.points.length}</b><span>pts</span></div>
          </div>
        </div>
      </div>
    );
  }

  const i = selectedIndex;
  const isLast = i === path.points.length - 1;
  const set = (patch: Parameters<typeof updatePoint>[2], key: string) => update(updatePoint(path, i, patch), `pt-${i}-${key}`);
  const setParam = (patch: Partial<PathParams>, key: string) => update(updatePointParams(path, i, patch), `pt-${i}-${key}`);
  const ov = point.params ?? {};
  const events = point.events ?? [];
  // on for the whole path = on for every point; otherwise the point's own toggle decides
  const interpForced = pp.interpolate === true;
  const interpOn = interpForced || ov.interpolate === true;

  return (
    <div className="inspector scroll">
      <div className="section-head">
        <span>Point <b className="count">{i}</b></span>
        <IconButton icon="trash" title="Delete point (Del)" onClick={() => {
          update(removePoint(path, i));
          onSelect(null);
        }} />
      </div>

      <div className="pad stack">
        <div className="grid-2">
          <NumberField label="X" suffix="m" value={point.x} onChange={v => v != null && set({ x: v }, 'x')} />
          <NumberField label="Y" suffix="m" value={point.y} onChange={v => v != null && set({ y: v }, 'y')} />
        </div>
        <div className="heading-row">
          <Toggle checked={point.theta != null} title="Heading (off = translation only)"
            onChange={on => update(updatePoint(path, i, { theta: on ? 0 : null }))} />
          <NumberField label="Heading" suffix="°" step={5} value={point.theta} disabled={point.theta == null} placeholder="—"
            onChange={v => v != null && set({ theta: wrapDeg(v) }, 'theta')} />
        </div>
      </div>

      <div className="section-head sub"><span>Overrides</span></div>
      <div className="pad stack">
        <div className="grid-2">
          <NumberField label="Max" suffix="m/s" nullable value={ov.maxSpeed} placeholder={show(pp.maxSpeed, String(robot.maxSpeed))}
            onChange={v => setParam({ maxSpeed: v }, 'max')} />
          <NumberField label="Min" suffix="m/s" nullable value={ov.minSpeed} disabled={isLast}
            placeholder={isLast ? '0' : show(pp.minSpeed, '0')} title={isLast ? 'Last point always settles' : undefined}
            onChange={v => setParam({ minSpeed: v }, 'min')} />
          <NumberField label="Exit" suffix="m" nullable value={ov.earlyExitRange} disabled={isLast}
            placeholder={isLast ? 'off' : show(pp.earlyExitRange, 'off')} title={isLast ? 'Last point always arrives' : 'Early exit range'}
            onChange={v => setParam({ earlyExitRange: v }, 'exit')} />
          <NumberField label="Timeout" suffix="s" nullable value={ov.timeout} placeholder={show(pp.timeout, '∞')}
            onChange={v => setParam({ timeout: v }, 'timeout')} />
          <NumberField label="Accel" suffix="m/s²" nullable value={ov.maxAccel} placeholder={show(pp.maxAccel, String(robot.maxAccel))}
            title="Acceleration limit toward this point" onChange={v => setParam({ maxAccel: v }, 'accel')} />
        </div>
        {point.theta != null && (
          <div className="row-between">
            <span className="field-label">Interpolate into this heading</span>
            <Toggle checked={interpOn} disabled={interpForced}
              title={interpForced ? 'On for the whole path (Path: Interpolate heading)' : 'Turn smoothly into this heading'}
              onChange={v => update(updatePointParams(path, i, { interpolate: v ? true : null }))} />
          </div>
        )}
      </div>

      <div className="section-head sub">
        <span>Events</span>
        <IconButton icon="plus" title="Add event" onClick={() => update(setEvents(path, i, [...events, { name: 'event', fraction: 0 }]))} />
      </div>
      <div className="pad stack">
        {events.map((ev, e) => (
          <div key={e} className="event">
            <div className="event-top">
              <input className="text-input" value={ev.name} spellCheck={false}
                onChange={el => update(setEvents(path, i, events.map((x, j) => (j === e ? { ...x, name: el.target.value } : x))), `ev-${i}-${e}-name`)} />
              <IconButton icon="x" title="Remove event" onClick={() => update(setEvents(path, i, events.filter((_, j) => j !== e)))} />
            </div>
            {isLast ? (
              <span className="hint">Fires on arrival</span>
            ) : (
              <div className="event-slider">
                <input type="range" min={0} max={1} step={0.01} value={ev.fraction}
                  onChange={el => update(setEvents(path, i, events.map((x, j) => (j === e ? { ...x, fraction: Number(el.target.value) } : x))), `ev-${i}-${e}-frac`)} />
                <span className="num">{Math.round(ev.fraction * 100)}%</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
