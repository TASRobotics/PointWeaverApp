import { useEffect, useRef, useState } from 'react';
import './App.css';

import { usePathEditor } from './hooks/usePathEditor';
import { usePlayback } from './hooks/usePlayback';
import { useFieldImage } from './hooks/useFieldImage';
import { useTheme } from './hooks/useTheme';
import { useRobotSettings } from './hooks/useRobotSettings';
import { ProjectPanel } from './features/sidebar/ProjectPanel';
import { FieldCanvas } from './features/canvas/FieldCanvas';
import { Toolbar } from './features/canvas/Toolbar';
import { PointList } from './features/inspector/PointList';
import { Inspector } from './features/inspector/Inspector';
import { Icon } from './components/Icon';
import { appendPoint, flipX, flipY, movePoint, removePoints } from './utils/pathOps';

const LAST_PROJECT = 'pw:lastProject';

const readLastProject = () => {
  if (!window.electronAPI) return null; // plain browser: nothing to load
  try {
    return localStorage.getItem(LAST_PROJECT);
  } catch {
    return null;
  }
};

const GRID = 'pw:grid';

const readGrid = () => {
  try {
    return localStorage.getItem(GRID) !== 'off';
  } catch {
    return true;
  }
};

export default function App() {
  const [projectDir, setProjectDir] = useState<string | null>(readLastProject);
  const editor = usePathEditor(projectDir);
  const robotSettings = useRobotSettings(projectDir);
  const playback = usePlayback(editor.currentPath, robotSettings.robot);
  const viewScale = useRef(50); // canvas zoom (px per m), kept current by FieldCanvas
  const field = useFieldImage(projectDir, () => viewScale.current);
  const { theme, toggle: toggleTheme } = useTheme();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [fitToken, setFitToken] = useState(0);
  const [grid, setGrid] = useState(readGrid);
  const toggleGrid = () => setGrid(g => !g);

  useEffect(() => {
    try {
      localStorage.setItem(GRID, grid ? 'on' : 'off');
    } catch { /* not important */ }
  }, [grid]);

  const { currentPathName, currentPath: path, selectedIndex, setSelectedIndex, selection, setSelection, update } = editor;
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
    if (res.dir !== projectDir && !(await editor.resolveUnsaved())) return;
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

  /** Delete the selected point, or the whole selected group (one undo step). */
  const deleteSelected = () => {
    if (selection.length === 0) return;
    update(removePoints(path, selection));
    setSelection([]);
  };

  const reorder = (from: number, to: number) => {
    update(movePoint(path, from, to));
    // keep the same points selected after the shuffle
    const order = path.points.map((_, i) => i);
    const [m] = order.splice(from, 1);
    order.splice(to, 0, m);
    setSelection(selection.map(i => order.indexOf(i)));
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
      } else if (k === 'g') {
        toggleGrid();
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
        robot={robotSettings} theme={theme} onToggleTheme={toggleTheme} grid={grid} onToggleGrid={toggleGrid} />

      <main className="stage">
        <FieldCanvas
          path={hasPath ? path : null}
          selectedIndex={selectedIndex}
          selection={selection}
          hoverIndex={hoverIndex}
          onSelect={setSelectedIndex}
          onSelectMany={setSelection}
          onHover={setHoverIndex}
          update={update}
          checkpoint={editor.checkpoint}
          field={field}
          playback={playback}
          fitToken={fitToken}
          theme={theme}
          robot={robotSettings.robot}
          grid={grid}
          viewScale={viewScale}
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
              selection={selection}
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
              selectionCount={selection.length}
              onDeleteSelection={deleteSelected}
              update={update}
              onSelect={setSelectedIndex}
              duration={playback.sim.duration}
              stalledAt={playback.sim.stalledAt}
              robot={robotSettings.robot}
            />
          </>
        ) : (
          <div className="empty pad">No path selected</div>
        )}
      </aside>
    </div>
  );
}
