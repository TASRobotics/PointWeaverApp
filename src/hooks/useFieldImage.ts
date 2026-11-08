import { useEffect, useRef, useState } from 'react';
import type { FieldImageConfig, ProjectSettings } from '../types';
import { FIELD_HEIGHT, FIELD_WIDTH } from '../constants';

export type Calibration = Pick<FieldImageConfig, 'x' | 'y' | 'width' | 'height'>;

const DEFAULT_CAL: Calibration = { x: 0, y: 0, width: FIELD_WIDTH, height: FIELD_HEIGHT };
const api = () => window.electronAPI!;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const readAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

/** Old versions kept the image in localStorage (and could blow the quota). Pull it into the project once. */
function takeLegacy(projectDir: string) {
  try {
    const dataUrl = localStorage.getItem(`bg_${projectDir}`);
    if (!dataUrl) return null;
    const num = (k: string, d: number) => {
      const v = parseFloat(localStorage.getItem(`${k}_${projectDir}`) ?? '');
      return Number.isFinite(v) ? v : d;
    };
    const cal = {
      x: num('bgOffsetX', 0), y: num('bgOffsetY', 0),
      width: num('bgWidth', FIELD_WIDTH), height: num('bgHeight', FIELD_HEIGHT),
    };
    for (const k of ['bg', 'bgOffsetX', 'bgOffsetY', 'bgWidth', 'bgHeight']) localStorage.removeItem(`${k}_${projectDir}`);
    return { dataUrl, cal };
  } catch {
    return null;
  }
}

export function useFieldImage(projectDir: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [cal, setCalState] = useState<Calibration>(DEFAULT_CAL);
  const calRef = useRef<Calibration>(DEFAULT_CAL);
  const setCal = (c: Calibration) => {
    calRef.current = c;
    setCalState(c);
  };
  const [editing, setEditing] = useState(false);
  const settingsRef = useRef<ProjectSettings>({});

  const persist = async (next: FieldImageConfig | null) => {
    if (!projectDir) return;
    settingsRef.current = { ...settingsRef.current, fieldImage: next };
    const res = await api().writeSettings(projectDir, settingsRef.current);
    if (res.error !== undefined) console.error('settings write failed', res.error);
  };

  useEffect(() => {
    let cancelled = false;
    setImage(null);
    setFile(null);
    setCal(DEFAULT_CAL);
    setEditing(false);
    settingsRef.current = {};
    if (!projectDir) return;

    (async () => {
      const res = await api().readSettings(projectDir);
      if (cancelled) return;
      settingsRef.current = res.error === undefined ? res.settings : {};
      let cfg = settingsRef.current.fieldImage ?? null;

      if (!cfg?.file) {
        const legacy = takeLegacy(projectDir);
        if (legacy) {
          const saved = await api().saveFieldImage(projectDir, legacy.dataUrl);
          if (saved.error === undefined) {
            cfg = { file: saved.file, ...legacy.cal };
            settingsRef.current = { ...settingsRef.current, fieldImage: cfg };
            await api().writeSettings(projectDir, settingsRef.current);
          }
        }
      }
      if (!cfg?.file || cancelled) return;

      const img = await api().readFieldImage(projectDir, cfg.file);
      if (cancelled || img.error !== undefined || !img.dataUrl) return;
      setImage(await loadImage(img.dataUrl));
      setFile(cfg.file);
      setCal({ x: cfg.x, y: cfg.y, width: cfg.width, height: cfg.height });
    })();

    return () => {
      cancelled = true;
    };
  }, [projectDir]);

  /** Change calibration. persist=false while dragging, then commit() on release. */
  const updateCal = (patch: Partial<Calibration>, save = true) => {
    const next = { ...calRef.current, ...patch };
    setCal(next);
    if (save && file) persist({ file, ...next });
  };

  const commit = () => {
    if (file) persist({ file, ...calRef.current });
  };

  const pick = async () => {
    if (!projectDir) return;
    const res = await api().pickFieldImage(projectDir);
    if (res.error !== undefined) return alert(`Couldn't load image: ${res.error}`);
    if (!res.file || !res.dataUrl) return;
    setImage(await loadImage(res.dataUrl));
    setFile(res.file);
    persist({ file: res.file, ...calRef.current });
  };

  const drop = async (blob: File) => {
    if (!projectDir || !blob.type.startsWith('image/')) return;
    const dataUrl = await readAsDataUrl(blob);
    const res = await api().saveFieldImage(projectDir, dataUrl);
    if (res.error !== undefined) return alert(`Couldn't save image: ${res.error}`);
    setImage(await loadImage(dataUrl));
    setFile(res.file);
    setEditing(true);
    persist({ file: res.file, ...calRef.current });
  };

  const clear = async () => {
    if (!projectDir) return;
    await api().clearFieldImage(projectDir);
    setImage(null);
    setFile(null);
    setEditing(false);
    persist(null);
  };

  return { image, cal, editing, setEditing, updateCal, commit, pick, drop, clear };
}

export type FieldImage = ReturnType<typeof useFieldImage>;
