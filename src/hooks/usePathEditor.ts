import { useEffect, useRef, useState } from 'react';
import type { PathDefinition, PathFile } from '../types';
import { PATH_NAME_RE } from '../constants';

/**
 * true  = save an undo step first
 * false = no undo step (live drag; call checkpoint() once before)
 * string = undo step, but merge with the previous one if it had the same key in the last second (typing, scrolling)
 */
export type HistoryMode = boolean | string;

interface History {
  past: PathDefinition[];
  future: PathDefinition[];
}

const MAX_HISTORY = 100;
const COALESCE_MS = 1000;
const EMPTY: PathDefinition = { points: [], params: null };

const api = () => window.electronAPI!;
const clone = (d: PathDefinition): PathDefinition => structuredClone(d);

export function usePathEditor(projectDir: string | null) {
  const [paths, setPathsState] = useState<PathFile[]>([]);
  const [currentPathName, setCurrentPathName] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set());

  // refs so back-to-back calls in one event see each other's changes
  const pathsRef = useRef<PathFile[]>([]);
  const histories = useRef(new Map<string, History>());
  const lastAction = useRef<{ path: string; key: string; time: number } | null>(null);

  const setPaths = (next: PathFile[]) => {
    pathsRef.current = next;
    setPathsState(next);
  };

  const markDirty = (name: string, dirty = true) =>
    setDirtyPaths(prev => {
      if (prev.has(name) === dirty) return prev;
      const next = new Set(prev);
      if (dirty) next.add(name);
      else next.delete(name);
      return next;
    });

  const history = (name: string) => {
    let h = histories.current.get(name);
    if (!h) histories.current.set(name, (h = { past: [], future: [] }));
    return h;
  };

  const contentOf = (name: string) => pathsRef.current.find(p => p.name === name)?.content;

  const reload = async (dir: string) => {
    const res = await api().listPaths(dir);
    if (res.error !== undefined) {
      alert(`Couldn't read paths: ${res.error}`);
      return;
    }
    if (res.skipped.length) alert(`Skipped unreadable files:\n${res.skipped.join('\n')}`);
    histories.current.clear();
    lastAction.current = null;
    setPaths(res.paths);
    setDirtyPaths(new Set());
    setSelectedIndex(null);
    setCurrentPathName(res.paths[0]?.name ?? null);
  };

  useEffect(() => {
    if (projectDir) reload(projectDir);
    else {
      setPaths([]);
      setCurrentPathName(null);
    }
  }, [projectDir]);

  const currentPath: PathDefinition = paths.find(p => p.name === currentPathName)?.content ?? EMPTY;

  /** Save an undo step for the current path (before a change). */
  const checkpoint = (key?: string) => {
    const name = currentPathName;
    if (!name) return;
    const now = performance.now();
    const last = lastAction.current;
    if (key && last && last.path === name && last.key === key && now - last.time < COALESCE_MS) {
      last.time = now;
      return;
    }
    lastAction.current = key ? { path: name, key, time: now } : null;
    const def = contentOf(name);
    if (!def) return;
    const h = history(name);
    h.past.push(clone(def));
    if (h.past.length > MAX_HISTORY) h.past.shift();
    h.future = [];
  };

  const replace = (name: string, def: PathDefinition) => {
    setPaths(pathsRef.current.map(p => (p.name === name ? { ...p, content: def } : p)));
    markDirty(name);
  };

  /** Replace the current path's contents. */
  const update = (def: PathDefinition, mode: HistoryMode = true) => {
    const name = currentPathName;
    if (!name) return;
    if (mode !== false) checkpoint(typeof mode === 'string' ? mode : undefined);
    replace(name, def);
  };

  const step = (dir: 'undo' | 'redo') => {
    const name = currentPathName;
    const now = name && contentOf(name);
    if (!name || !now) return;
    const h = history(name);
    const from = dir === 'undo' ? h.past : h.future;
    const to = dir === 'undo' ? h.future : h.past;
    const target = from.pop();
    if (!target) return;
    to.push(clone(now));
    lastAction.current = null;
    replace(name, target);
    if (selectedIndex !== null && selectedIndex >= target.points.length) setSelectedIndex(null);
  };

  const selectPath = (name: string | null) => {
    setCurrentPathName(name);
    setSelectedIndex(null);
    lastAction.current = null;
  };

  const save = async () => {
    const name = currentPathName;
    const def = name && contentOf(name);
    if (!projectDir || !name || !def) return;
    const res = await api().writePath(projectDir, name, def);
    if (res.error !== undefined) alert(`Failed to save: ${res.error}`);
    else markDirty(name, false);
  };

  const validName = (raw: string, except?: string) => {
    const name = raw.trim();
    if (!name || name === except) return null;
    if (!PATH_NAME_RE.test(name)) {
      alert('Use letters, numbers, spaces, - or _');
      return null;
    }
    if (pathsRef.current.some(p => p.name === name)) {
      alert('A path with that name already exists.');
      return null;
    }
    return name;
  };

  const create = async (raw: string) => {
    const name = validName(raw);
    if (!name || !projectDir) return false;
    const def: PathDefinition = { points: [], params: null };
    const res = await api().writePath(projectDir, name, def);
    if (res.error !== undefined) {
      alert(`Failed to create: ${res.error}`);
      return false;
    }
    setPaths([...pathsRef.current, { name, content: def }]);
    selectPath(name);
    return true;
  };

  const rename = async (oldName: string, raw: string) => {
    const name = validName(raw, oldName);
    if (!name || !projectDir) return;
    const res = await api().renamePath(projectDir, oldName, name);
    if (res.error !== undefined) {
      alert(`Failed to rename: ${res.error}`);
      return;
    }
    setPaths(pathsRef.current.map(p => (p.name === oldName ? { ...p, name } : p)));
    const h = histories.current.get(oldName);
    histories.current.delete(oldName);
    if (h) histories.current.set(name, h);
    if (currentPathName === oldName) setCurrentPathName(name);
    setDirtyPaths(prev => {
      if (!prev.has(oldName)) return prev;
      const next = new Set(prev);
      next.delete(oldName);
      next.add(name);
      return next;
    });
  };

  const remove = async (name: string) => {
    if (!projectDir || !window.confirm(`Delete ${name}.json? This can't be undone.`)) return;
    const res = await api().deletePath(projectDir, name);
    if (res.error !== undefined) {
      alert(`Failed to delete: ${res.error}`);
      return;
    }
    const rest = pathsRef.current.filter(p => p.name !== name);
    setPaths(rest);
    histories.current.delete(name);
    markDirty(name, false);
    if (currentPathName === name) selectPath(rest[0]?.name ?? null);
  };

  return {
    paths,
    currentPathName,
    currentPath,
    selectedIndex,
    setSelectedIndex,
    dirtyPaths,
    update,
    checkpoint,
    undo: () => step('undo'),
    redo: () => step('redo'),
    selectPath,
    save,
    create,
    rename,
    remove,
  };
}

export type PathEditor = ReturnType<typeof usePathEditor>;
