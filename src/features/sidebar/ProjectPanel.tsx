import { useEffect, useRef, useState } from 'react';
import type { PathEditor } from '../../hooks/usePathEditor';
import type { FieldImage } from '../../hooks/useFieldImage';
import type { RobotSettingsState } from '../../hooks/useRobotSettings';
import { DEFAULT_ROBOT } from '../../sim/robot';
import { Icon, IconButton } from '../../components/Icon';
import { NumberField } from '../../components/Controls';
import type { Theme } from '../canvas/FieldCanvas';

interface Props {
  projectDir: string;
  onOpenProject: () => void;
  editor: PathEditor;
  field: FieldImage;
  robot: RobotSettingsState;
  theme: Theme;
  onToggleTheme: () => void;
  grid: boolean;
  onToggleGrid: () => void;
}

const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

/** Inline name box. Submits once (Enter or blur), Escape cancels. */
function InlineInput({ initial, placeholder, onSubmit, onDone }: {
  initial: string;
  placeholder?: string;
  onSubmit: (v: string) => Promise<unknown>;
  onDone: () => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = async (submit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (submit && value.trim() && value.trim() !== initial) await onSubmit(value);
    onDone();
  };
  return (
    <input autoFocus className="inline-input" placeholder={placeholder} value={value} onChange={e => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={e => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }} />
  );
}

export function ProjectPanel({ projectDir, onOpenProject, editor, field, robot, theme, onToggleTheme, grid, onToggleGrid }: Props) {
  const [creating, setCreating] = useState(false);
  const [robotOpen, setRobotOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <aside className="panel left">
      <div className="brand">
        <Icon name="logo" size={18} />
        <span className="grow">PointWeaver</span>
        <IconButton icon={theme === 'day' ? 'moon' : 'sun'} title={theme === 'day' ? 'Night mode' : 'Day mode'} onClick={onToggleTheme} />
      </div>

      <button type="button" className="project-btn" onClick={onOpenProject} title={projectDir}>
        <Icon name="folder" />
        <span>{baseName(projectDir)}</span>
      </button>

      <div className="section-head">
        <span>Paths</span>
        <IconButton icon="plus" title="New path" onClick={() => setCreating(true)} />
      </div>

      <div className="list scroll">
        {editor.paths.map(p => {
          const active = p.name === editor.currentPathName;
          if (renaming === p.name) {
            return (
              <div key={p.name} className="list-row editing">
                <InlineInput initial={p.name} onSubmit={v => editor.rename(p.name, v)} onDone={() => setRenaming(null)} />
              </div>
            );
          }
          return (
            <div key={p.name} className={`list-row ${active ? 'selected' : ''}`} onClick={() => editor.selectPath(p.name)}
              onDoubleClick={() => setRenaming(p.name)}>
              <span className="grow ellipsis">{p.name}</span>
              {editor.dirtyPaths.has(p.name) && <span className="dirty-dot" title="Unsaved" />}
              <span className="row-actions" onClick={e => e.stopPropagation()}>
                <IconButton icon="pencil" title="Rename" onClick={() => setRenaming(p.name)} />
                <IconButton icon="x" title="Delete" onClick={() => editor.remove(p.name)} />
              </span>
            </div>
          );
        })}
        {creating && (
          <div className="list-row editing">
            <InlineInput initial="" placeholder="name" onSubmit={editor.create} onDone={() => setCreating(false)} />
          </div>
        )}
      </div>

      <div className="panel-foot">
        <RobotSection robot={robot} open={robotOpen} onToggle={() => setRobotOpen(!robotOpen)} />
        <div className="section-head">
          <span>Field</span>
          <span className="head-actions">
            <IconButton icon="grid" title={grid ? 'Hide grid (G)' : 'Show grid (G)'} active={grid} onClick={onToggleGrid} />
            <FieldImageMenu field={field} />
            {field.custom && (
              <>
                <IconButton icon={field.editing ? 'check' : 'move'} title={field.editing ? 'Done aligning' : 'Align image'}
                  active={field.editing} onClick={() => field.setEditing(!field.editing)} />
                <IconButton icon="trash" title="Remove image (back to the built-in field)" onClick={field.clear} />
              </>
            )}
          </span>
        </div>
        {field.image && (
          <div className="pad stack">
            <div className="event-slider" title="Background image opacity">
              <span className="field-label">Opacity</span>
              <input type="range" min={0} max={1} step={0.05} value={field.opacity} aria-label="Background image opacity"
                onChange={e => field.setOpacity(Number(e.target.value))} />
              <span className="num">{Math.round(field.opacity * 100)}%</span>
            </div>
            {field.editing && (
              <div className="grid-2">
                <NumberField label="W" suffix="m" value={field.cal.width} onChange={v => v != null && v > 0 && field.updateCal({ width: v })} />
                <NumberField label="H" suffix="m" value={field.cal.height} onChange={v => v != null && v > 0 && field.updateCal({ height: v })} />
                <NumberField label="X" suffix="m" value={field.cal.x} onChange={v => v != null && field.updateCal({ x: v })} />
                <NumberField label="Y" suffix="m" value={field.cal.y} onChange={v => v != null && field.updateCal({ y: v })} />
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

/** The image button: use the built-in Rebuilt field, or import your own (dropping one on the field works too). */
function FieldImageMenu({ field }: { field: FieldImage }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!anchor.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (action: () => unknown) => {
    setOpen(false);
    action();
  };

  return (
    <span className="menu-anchor" ref={anchor}>
      <IconButton icon="image" title="Field image" active={open} expanded={open} onClick={() => setOpen(!open)} />
      {open && (
        <div className="menu" role="menu">
          <button type="button" role="menuitemradio" aria-checked={!field.custom} className="menu-item"
            onClick={() => choose(() => field.custom && field.clear())}>
            <span className="menu-check">{!field.custom && <Icon name="check" size={14} />}</span>
            Rebuilt
            <span className="menu-hint">2026</span>
          </button>
          <div className="menu-sep" />
          <button type="button" role="menuitem" className="menu-item" title="Or drop an image on the field"
            onClick={() => choose(field.pick)}>
            <span className="menu-check" />
            Import custom…
          </button>
        </div>
      )}
    </span>
  );
}

/** robot.json editor: the numbers the robot and the ghost share. Empty field = library default. */
function RobotSection({ robot, open, onToggle }: { robot: RobotSettingsState; open: boolean; onToggle: () => void }) {
  const s = robot.settings ?? {};
  const d = DEFAULT_ROBOT;
  const num = (key: 'maxSpeed' | 'maxAccel' | 'positionTolerance' | 'headingTolerance' | 'maxAngularRate' | 'robotLength' | 'robotWidth') =>
    (v: number | null) => {
      if (v == null || v > 0) robot.update({ [key]: v ?? undefined });
    };
  const kp = (key: 'translationPID' | 'headingPID') => (v: number | null) => {
    const rest = s[key]?.slice(1) ?? [0, 0];
    robot.update({ [key]: v == null ? undefined : [v, ...rest] });
  };

  return (
    <>
      <div className="section-head">
        <span>
          Robot
          {!robot.settings && <span className="head-dot" title="No robot.json yet: the ghost is using default numbers" />}
        </span>
        <span className="head-actions">
          <IconButton icon="importFile" title="Fill from TunerConstants.java" onClick={robot.importFromTuner} />
          <IconButton icon="sliders" title="Robot settings (robot.json)" active={open} onClick={onToggle} />
        </span>
      </div>
      {open && (
        <div className="grid-2 pad">
          <NumberField label="Max" suffix="m/s" nullable value={s.maxSpeed} placeholder={String(d.maxSpeed)} onChange={num('maxSpeed')} />
          <NumberField label="Accel" suffix="m/s²" nullable value={s.maxAccel} placeholder={String(d.maxAccel)} onChange={num('maxAccel')} />
          <NumberField label="Drive P" nullable step={0.5} value={s.translationPID?.[0]} placeholder={String(d.translationPID[0])}
            title="Final approach gain" onChange={kp('translationPID')} />
          <NumberField label="Turn P" nullable step={0.5} value={s.headingPID?.[0]} placeholder={String(d.headingPID[0])}
            title="CTRE heading gain" onChange={kp('headingPID')} />
          <NumberField label="Pos tol" suffix="m" nullable step={0.01} value={s.positionTolerance} placeholder={String(d.positionTolerance)}
            onChange={num('positionTolerance')} />
          <NumberField label="Head tol" suffix="°" nullable value={s.headingTolerance} placeholder={String(d.headingTolerance)}
            onChange={num('headingTolerance')} />
          <NumberField label="Spin" suffix="°/s" nullable step={10} value={s.maxAngularRate} placeholder={String(d.maxAngularRate)}
            title="Fastest the robot can rotate" onChange={num('maxAngularRate')} />
          <span />
          <NumberField label="Length" suffix="m" nullable step={0.01} value={s.robotLength} placeholder={String(d.robotLength)}
            title="Bumper to bumper (ghost only)" onChange={num('robotLength')} />
          <NumberField label="Width" suffix="m" nullable step={0.01} value={s.robotWidth} placeholder={String(d.robotWidth)}
            title="Bumper to bumper (ghost only)" onChange={num('robotWidth')} />
        </div>
      )}
    </>
  );
}
