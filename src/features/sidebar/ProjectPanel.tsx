import { useRef, useState } from 'react';
import type { PathEditor } from '../../hooks/usePathEditor';
import type { FieldImage } from '../../hooks/useFieldImage';
import { Icon, IconButton } from '../../components/Icon';
import { NumberField } from '../../components/Controls';
import type { Theme } from '../canvas/FieldCanvas';

interface Props {
  projectDir: string;
  onOpenProject: () => void;
  editor: PathEditor;
  field: FieldImage;
  theme: Theme;
  onToggleTheme: () => void;
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

export function ProjectPanel({ projectDir, onOpenProject, editor, field, theme, onToggleTheme }: Props) {
  const [creating, setCreating] = useState(false);
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
        <div className="section-head">
          <span>Field</span>
          <span className="head-actions">
            <IconButton icon="image" title="Set field image (or drop one on the field)" onClick={field.pick} />
            {field.image && (
              <>
                <IconButton icon="move" title="Align image" active={field.editing} onClick={() => field.setEditing(!field.editing)} />
                <IconButton icon="x" title="Remove image" onClick={field.clear} />
              </>
            )}
          </span>
        </div>
        {field.image && field.editing && (
          <div className="grid-2 pad">
            <NumberField label="W" suffix="m" value={field.cal.width} onChange={v => v != null && v > 0 && field.updateCal({ width: v })} />
            <NumberField label="H" suffix="m" value={field.cal.height} onChange={v => v != null && v > 0 && field.updateCal({ height: v })} />
            <NumberField label="X" suffix="m" value={field.cal.x} onChange={v => v != null && field.updateCal({ x: v })} />
            <NumberField label="Y" suffix="m" value={field.cal.y} onChange={v => v != null && field.updateCal({ y: v })} />
          </div>
        )}
      </div>
    </aside>
  );
}
