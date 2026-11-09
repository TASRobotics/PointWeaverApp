import { useEffect, useRef, useState } from 'react';
import type { FieldImageConfig, ProjectSettings } from '../types';
import { FIELD_HEIGHT, FIELD_WIDTH } from '../constants';
import { round2 } from '../utils/pathOps';
// 2026 REBUILT, cropped to the carpet and turned blue-side-left, so it fills the field box exactly
import builtinField from '../assets/fields/rebuilt-2026.jpg';

export type Calibration = Pick<FieldImageConfig, 'x' | 'y' | 'width' | 'height'>;

/** The whole field. The built-in image always sits here. */
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

/**
 * The field background for a project: the project's own image (stored in <project>/.pointweaver), or the
 * built-in 2026 REBUILT field when it hasn't set one.
 * @param pxPerMeter the canvas's current zoom (CSS px per meter), so a new image can be placed at its real size
 */
export function useFieldImage(projectDir: string | null, pxPerMeter: () => number) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [cal, setCalState] = useState<Calibration>(DEFAULT_CAL);
  const calRef = useRef<Calibration>(DEFAULT_CAL);
  const setCal = (c: Calibration) => {
    calRef.current = c;
    setCalState(c);
  };
  const [opacity, setOpacityState] = useState(1);
  const opacityRef = useRef(1);
  const opacityTimer = useRef<number | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const settingsRef = useRef<ProjectSettings>({});

  const persist = async (next: FieldImageConfig | null) => {
    if (!projectDir) return;
    settingsRef.current = { ...settingsRef.current, fieldImage: next };
    const res = await api().writeSettings(projectDir, settingsRef.current);
    if (res.error !== undefined) console.error('settings write failed', res.error);
  };

  /** Save the image's file (null = built-in), calibration and opacity. */
  const save = (f: string | null, c: Calibration = calRef.current) =>
    persist({ file: f, ...c, opacity: opacityRef.current });

  /** Show the built-in field, filling the field box. */
  const showBuiltin = async (isCancelled = () => false) => {
    const img = await loadImage(builtinField);
    if (isCancelled()) return;
    setImage(img);
    setFile(null);
    setCal(DEFAULT_CAL);
  };

  /** A new image at its real size: 1 image pixel = 1 CSS pixel at the current zoom, centered on the field. */
  const actualSize = (img: HTMLImageElement): Calibration => {
    const scale = pxPerMeter();
    const width = Math.max(0.1, round2(img.naturalWidth / scale));
    const height = Math.max(0.1, round2(img.naturalHeight / scale));
    return { x: round2((FIELD_WIDTH - width) / 2), y: round2((FIELD_HEIGHT - height) / 2), width, height };
  };

  useEffect(() => {
    let cancelled = false;
    setImage(null);
    setFile(null);
    setCal(DEFAULT_CAL);
    opacityRef.current = 1;
    setOpacityState(1);
    window.clearTimeout(opacityTimer.current);
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
      if (cancelled) return;
      opacityRef.current = cfg?.opacity ?? 1;
      setOpacityState(opacityRef.current);

      if (cfg?.file) {
        const img = await api().readFieldImage(projectDir, cfg.file);
        if (cancelled) return;
        if (img.error === undefined && img.dataUrl) {
          const loaded = await loadImage(img.dataUrl);
          if (cancelled) return;
          setImage(loaded);
          setFile(cfg.file);
          setCal({ x: cfg.x, y: cfg.y, width: cfg.width, height: cfg.height });
          return;
        }
      }
      await showBuiltin(() => cancelled);
    })();

    return () => {
      cancelled = true;
    };
  }, [projectDir]);

  /** Change calibration. persist=false while dragging, then commit() on release. */
  const updateCal = (patch: Partial<Calibration>, persistNow = true) => {
    const next = { ...calRef.current, ...patch };
    setCal(next);
    if (persistNow && file) save(file, next);
  };

  const commit = () => {
    if (file) save(file);
  };

  /** Background opacity, 0..1 (0 hides it). Saved shortly after the slider stops moving. */
  const setOpacity = (v: number) => {
    opacityRef.current = Math.max(0, Math.min(1, v));
    setOpacityState(opacityRef.current);
    window.clearTimeout(opacityTimer.current);
    opacityTimer.current = window.setTimeout(() => save(file), 250);
  };

  /** Show a newly imported image at its real size and switch to align mode to fit it. */
  const place = async (dataUrl: string, savedFile: string) => {
    const img = await loadImage(dataUrl);
    const c = actualSize(img);
    setImage(img);
    setFile(savedFile);
    setCal(c);
    setEditing(true);
    save(savedFile, c);
  };

  const pick = async () => {
    if (!projectDir) return;
    const res = await api().pickFieldImage(projectDir);
    if (res.error !== undefined) return alert(`Couldn't load image: ${res.error}`);
    if (!res.file || !res.dataUrl) return;
    await place(res.dataUrl, res.file);
  };

  const drop = async (blob: File) => {
    if (!projectDir || !blob.type.startsWith('image/')) return;
    const dataUrl = await readAsDataUrl(blob);
    const res = await api().saveFieldImage(projectDir, dataUrl);
    if (res.error !== undefined) return alert(`Couldn't save image: ${res.error}`);
    await place(dataUrl, res.file);
  };

  /** Drop the project's own image and go back to the built-in field. */
  const clear = async () => {
    if (!projectDir) return;
    await api().clearFieldImage(projectDir);
    setEditing(false);
    await showBuiltin();
    save(null, DEFAULT_CAL);
  };

  return {
    image,
    /** true when the project uses its own image (alignable, removable) rather than the built-in field */
    custom: file != null,
    cal, opacity, editing, setEditing, updateCal, commit, setOpacity, pick, drop, clear,
  };
}

export type FieldImage = ReturnType<typeof useFieldImage>;
