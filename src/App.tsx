import { useEffect, useRef, useState } from 'react';
import './App.css';

import { usePathEditor } from './hooks/usePathEditor';
import { usePlayback } from './hooks/usePlayback';
import { useFieldImage } from './hooks/useFieldImage';
import { useTheme } from './hooks/useTheme';
import { ProjectPanel } from './features/sidebar/ProjectPanel';
import { FieldCanvas } from './features/canvas/FieldCanvas';
import { Toolbar } from './features/canvas/Toolbar';
import { PointList } from './features/inspector/PointList';
import { Inspector } from './features/inspector/Inspector';
import { Icon } from './components/Icon';
import { appendPoint, flipX, flipY, movePoint, removePoint } from './utils/pathOps';

const LAST_PROJECT = 'pw:lastProject';

const readLastProject = () => {
  if (!window.electronAPI) return null; // plain browser: nothing to load
  try {
    return localStorage.getItem(LAST_PROJECT);
  } catch {
    return null;
  }
};

export default function App() {
  const [projectDir, setProjectDir] = useState<string | null>(readLastProject);
  const editor = usePathEditor(projectDir);
  const playback = usePlayback(editor.currentPath);
  const field = useFieldImage(projectDir);
  const { theme, toggle: toggleTheme } = useTheme();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [fitToken, setFitToken] = useState(0);

  const { currentPathName, currentPath: path, selectedIndex, setSelectedIndex, update } = editor;
  const hasPath = currentPathName != null;

  // new path = fresh ghost
  const stopPlayback = useRef(playback.stop);
  stopPlayback.current = playback.stop;
  useEffect(() => {
    stopPlayback.current();
    setHoverIndex(null);
  }, [currentPathName]);

  const openProject = async () => {
    const res = await window.electronAPI?.selectDir();
    if (!res || res.error !== undefined || !res.dir) return;
    try {
      localStorage.setItem(LAST_PROJECT, res.dir);
    } catch { /* not important */ }
    setProjectDir(res.dir);
  };

  const addPoint = () => {
    if (!hasPath) return;
    update(appendPoint(path));
    setSelectedIndex(path.points.length);
  };

  const deleteSelected = () => {
    if (selectedIndex == null) return;
    update(removePoint(path, selectedIndex));
    setSelectedIndex(null);
  };

  const reorder = (from: number, to: number) => {
    update(movePoint(path, from, to));
    if (selectedIndex === from) setSelectedIndex(to);
    else if (selectedIndex != null) {
      // keep the same point selected after the shuffle
      const order = path.points.map((_, i) => i);
      const [m] = order.splice(from, 1);
      order.splice(to, 0, m);
      setSelectedIndex(order.indexOf(selectedIndex));
    }
  };

  const stepSelection = (dir: 1 | -1) => {
    const n = path.points.length;
    if (!n) return;
    setSelectedIndex(selectedIndex == null ? (dir > 0 ? 0 : n - 1) : Math.max(0, Math.min(n - 1, selectedIndex + dir)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      const k = e.key.toLowerCase();

      if (mod && k === 's') {
        e.preventDefault();
        editor.save();
        return;
      }
      if (typing) return;

      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        editor.redo();
      } else if (mod) {
        return;
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      } else if (e.key === 'Escape') {
        setSelectedIndex(null);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        stepSelection(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === ' ') {
        e.preventDefault();
        if (hasPath) playback.playPause();
      } else if (k === 'f') {
        setFitToken(t => t + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!window.electronAPI) {
    return <div className="welcome"><p>Run with <code>npm start</code> to use the desktop app.</p></div>;
  }

  if (!projectDir) {
    return (
      <div className="welcome">
        <Icon name="logo" size={40} />
        <h1>PointWeaver</h1>
        <button type="button" className="primary-btn" onClick={openProject}>
          <Icon name="folder" />
          Open robot project
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <ProjectPanel projectDir={projectDir} onOpenProject={openProject} editor={editor} field={field}
        theme={theme} onToggleTheme={toggleTheme} />

      <main className="stage">
        <FieldCanvas
          path={hasPath ? path : null}
          selectedIndex={selectedIndex}
          hoverIndex={hoverIndex}
          onSelect={setSelectedIndex}
          onHover={setHoverIndex}
          update={update}
          checkpoint={editor.checkpoint}
          field={field}
          playback={playback}
          fitToken={fitToken}
          theme={theme}
        />
        {hasPath && (
          <Toolbar
            playback={playback}
            dirty={editor.dirtyPaths.has(currentPathName)}
            onAdd={addPoint}
            onFlipX={() => update(flipX(path))}
            onFlipY={() => update(flipY(path))}
            onFit={() => setFitToken(t => t + 1)}
            onSave={editor.save}
          />
        )}
      </main>

      <aside className="panel right">
        {hasPath ? (
          <>
            <PointList
              path={path}
              selectedIndex={selectedIndex}
              hoverIndex={hoverIndex}
              onSelect={setSelectedIndex}
              onHover={setHoverIndex}
              onAdd={addPoint}
              onMove={reorder}
              stalledAt={playback.sim.stalledAt}
            />
            <Inspector
              path={path}
              selectedIndex={selectedIndex}
              update={update}
              onSelect={setSelectedIndex}
              duration={playback.sim.duration}
              stalledAt={playback.sim.stalledAt}
            />
          </>
        ) : (
          <div className="empty pad">No path selected</div>
        )}
      </aside>
    </div>
  );
}
