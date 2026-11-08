import { useEffect, useRef } from 'react';
import type { PathDefinition } from '../../types';
import type { HistoryMode } from '../../hooks/usePathEditor';
import type { Calibration, FieldImage } from '../../hooks/useFieldImage';
import type { Playback } from '../../hooks/usePlayback';
import { FIELD_HEIGHT, FIELD_WIDTH } from '../../constants';
import type { ResolvedRobot } from '../../sim/robot';
import { poseAt } from '../../sim/simulate';
import { resolve } from '../../sim/follower';
import { distToSegmentSquared } from '../../utils/math';
import { clampToField, eventPosition, insertPoint, removePoint, round2, updatePoint, wrapDeg } from '../../utils/pathOps';

interface Props {
  path: PathDefinition | null;
  selectedIndex: number | null;
  hoverIndex: number | null;
  onSelect: (i: number | null) => void;
  onHover: (i: number | null) => void;
  update: (def: PathDefinition, mode?: HistoryMode) => void;
  checkpoint: () => void;
  field: FieldImage;
  playback: Playback;
  fitToken: number;
  theme: Theme;
  robot: ResolvedRobot;
}

// screen-space sizes (CSS px), constant at any zoom
const R_POINT = 5.5;
const R_TRANS = 4;
const HEADING_LEN = 24;
const HIT_POINT = 10;
const HIT_TIP = 8;
const HIT_HANDLE = 8;
const FIT_MARGIN = 28;
const FIT_BOTTOM = 76; // room for the toolbar

export type Theme = 'night' | 'day';

const makePalette = (day: boolean) => {
  const a = (o: number) => (day ? `rgba(0,0,0,${o})` : `rgba(255,255,255,${o})`);
  return {
    bg: day ? '#ffffff' : '#000000',
    field: day ? '#f7f7f7' : '#080808',
    fg: day ? '#000000' : '#ffffff',
    grid: a(day ? 0.07 : 0.045),
    center: a(0.16),
    border: a(0.8),
    path: a(0.92),
    ghostTrail: a(0.3),
    ghostFill: a(0.1),
    ring: a(0.14),
    ringSelected: a(0.45),
    halo: a(0.1),
    haloSelected: a(0.16),
    label: a(0.45),
    muted: a(0.6),
    start: a(0.25),
    startReset: a(0.7),
  };
};
const PALETTES = { night: makePalette(false), day: makePalette(true) };

type View = { scale: number; ox: number; oy: number };
type BgMode = 'move' | 'tl' | 'tr' | 'bl' | 'br';
type Drag =
  | { kind: 'point'; index: number; mode: 'position' | 'heading'; moved: boolean }
  | { kind: 'pan'; x: number; y: number; moved: boolean; deselect: boolean }
  | { kind: 'bg'; mode: BgMode; wx: number; wy: number; cal: Calibration };
type Hit = { index: number; mode: 'position' | 'heading' } | null;

export function FieldCanvas(props: Props) {
  const { path, field, fitToken } = props;
  const C = PALETTES[props.theme];
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const view = useRef<View>({ scale: 50, ox: 0, oy: 0 });
  const fitted = useRef(true);
  const drag = useRef<Drag | null>(null);
  const cursor = useRef<{ sx: number; sy: number; wx: number; wy: number } | null>(null);
  const hoveredEvent = useRef<{ name: string; sx: number; sy: number } | null>(null);
  const dirty = useRef(true);
  const latest = useRef(props);
  latest.current = props;

  // ---- coordinate helpers ----
  const toScreen = (x: number, y: number): [number, number] => {
    const v = view.current;
    return [v.ox + x * v.scale, v.oy - y * v.scale];
  };
  const toWorld = (sx: number, sy: number) => {
    const v = view.current;
    return { x: (sx - v.ox) / v.scale, y: (v.oy - sy) / v.scale };
  };
  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };

  const fit = () => {
    const { w, h } = size.current;
    if (!w || !h) return;
    const aw = w - FIT_MARGIN * 2;
    const ah = h - FIT_MARGIN - FIT_BOTTOM;
    const scale = Math.max(1, Math.min(aw / FIELD_WIDTH, ah / FIELD_HEIGHT));
    const ox = FIT_MARGIN + (aw - FIELD_WIDTH * scale) / 2;
    const top = FIT_MARGIN + (ah - FIELD_HEIGHT * scale) / 2;
    view.current = { scale, ox, oy: top + FIELD_HEIGHT * scale };
    fitted.current = true;
    dirty.current = true;
  };

  // ---- sizing ----
  useEffect(() => {
    const el = containerRef.current!;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      size.current = { w: width, h: height, dpr };
      const c = canvasRef.current!;
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
      if (fitted.current) fit();
      dirty.current = true;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    fit();
  }, [fitToken]);

  // redraw after any prop change
  useEffect(() => {
    dirty.current = true;
  });

  // ---- hit testing ----
  const hitTest = (sx: number, sy: number): Hit => {
    const pts = latest.current.path?.points ?? [];
    const sel = latest.current.selectedIndex;
    const order = pts.map((_, i) => i).reverse();
    if (sel != null && sel < pts.length) order.unshift(sel);
    for (const i of order) {
      const p = pts[i];
      const [px, py] = toScreen(p.x, p.y);
      if (p.theta != null) {
        const r = (p.theta * Math.PI) / 180;
        if (Math.hypot(sx - (px + Math.cos(r) * HEADING_LEN), sy - (py - Math.sin(r) * HEADING_LEN)) < HIT_TIP) {
          return { index: i, mode: 'heading' };
        }
      }
      if (Math.hypot(sx - px, sy - py) < HIT_POINT) return { index: i, mode: 'position' };
    }
    return null;
  };

  const bgHit = (sx: number, sy: number): BgMode | null => {
    const { field: f } = latest.current;
    if (!f.editing || !f.image) return null;
    const { x, y, width, height } = f.cal;
    const corners: [BgMode, number, number][] = [
      ['tl', x, y + height], ['tr', x + width, y + height], ['bl', x, y], ['br', x + width, y],
    ];
    for (const [mode, cx, cy] of corners) {
      const [hx, hy] = toScreen(cx, cy);
      if (Math.abs(sx - hx) < HIT_HANDLE && Math.abs(sy - hy) < HIT_HANDLE) return mode;
    }
    const w = toWorld(sx, sy);
    if (w.x >= x && w.x <= x + width && w.y >= y && w.y <= y + height) return 'move';
    return null;
  };

  // ---- drawing ----
  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { w, h, dpr } = size.current;
    const { path, selectedIndex, hoverIndex, field, playback } = latest.current;
    const v = view.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);

    // field box
    const [fx, fy] = toScreen(0, FIELD_HEIGHT);
    const fw = FIELD_WIDTH * v.scale;
    const fh = FIELD_HEIGHT * v.scale;
    ctx.fillStyle = C.field;
    ctx.fillRect(fx, fy, fw, fh);

    if (field.image) {
      const [ix, iy] = toScreen(field.cal.x, field.cal.y + field.cal.height);
      ctx.drawImage(field.image, ix, iy, field.cal.width * v.scale, field.cal.height * v.scale);
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = C.grid;
    ctx.beginPath();
    for (let x = 1; x < FIELD_WIDTH; x++) {
      const sx = Math.round(fx + x * v.scale) + 0.5;
      ctx.moveTo(sx, fy);
      ctx.lineTo(sx, fy + fh);
    }
    for (let y = 1; y < FIELD_HEIGHT; y++) {
      const sy = Math.round(fy + fh - y * v.scale) + 0.5;
      ctx.moveTo(fx, sy);
      ctx.lineTo(fx + fw, sy);
    }
    ctx.stroke();

    ctx.strokeStyle = C.center;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(fx + fw / 2, fy);
    ctx.lineTo(fx + fw / 2, fy + fh);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(fx, fy, fw, fh);

    if (field.image && field.editing) {
      const { x, y, width, height } = field.cal;
      const [ix, iy] = toScreen(x, y + height);
      ctx.strokeStyle = C.fg;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(ix, iy, width * v.scale, height * v.scale);
      ctx.setLineDash([]);
      ctx.fillStyle = C.fg;
      for (const [cx, cy] of [[x, y], [x + width, y], [x, y + height], [x + width, y + height]]) {
        const [hx, hy] = toScreen(cx, cy);
        ctx.fillRect(hx - 4, hy - 4, 8, 8);
      }
    }

    if (path) drawPath(ctx, path, selectedIndex, hoverIndex, playback);

    // cursor readout
    const c = cursor.current;
    if (c && c.wx >= 0 && c.wx <= FIELD_WIDTH && c.wy >= 0 && c.wy <= FIELD_HEIGHT) {
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.fillStyle = C.label;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`x ${c.wx.toFixed(2)}   y ${c.wy.toFixed(2)}`, 14, h - 14);
    }
  };

  /** ghost = the playing robot; otherwise the start footprint (solid-ish when the path resets pose there) */
  const drawRobot = (ctx: CanvasRenderingContext2D, x: number, y: number, thetaDeg: number, ghost: boolean, reset = false) => {
    const v = view.current;
    const [sx, sy] = toScreen(x, y);
    const { robot } = latest.current;
    const L = robot.robotLength * v.scale;
    const W = robot.robotWidth * v.scale;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate((-thetaDeg * Math.PI) / 180);
    ctx.lineWidth = 1.25;
    if (ghost) {
      ctx.fillStyle = C.ghostFill;
      ctx.strokeStyle = C.fg;
      ctx.fillRect(-L / 2, -W / 2, L, W);
    } else {
      ctx.strokeStyle = reset ? C.startReset : C.start;
      if (!reset) ctx.setLineDash([3, 3]);
    }
    ctx.strokeRect(-L / 2, -W / 2, L, W);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(L / 2, 0);
    ctx.stroke();
    ctx.restore();
  };

  const drawPath = (
    ctx: CanvasRenderingContext2D, path: PathDefinition, selectedIndex: number | null, hoverIndex: number | null, playback: Playback,
  ) => {
    const pts = path.points;
    const v = view.current;
    if (pts.length === 0) return;

    // start footprint
    drawRobot(ctx, pts[0].x, pts[0].y, pts[0].theta ?? 0, false, !!path.resetPose);

    // where the ghost actually drives (shows early-exit corner cutting)
    const poses = playback.sim.poses;
    if (poses.length > 1) {
      ctx.strokeStyle = C.ghostTrail;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      poses.forEach((p, i) => {
        const [sx, sy] = toScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // path
    if (pts.length > 1) {
      ctx.strokeStyle = C.path;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [sx, sy] = toScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    }

    // early exit rings (the last point always has to arrive, so none there)
    for (let i = 0; i < pts.length - 1; i++) {
      const exit = resolve(path.params, pts[i].params).earlyExitRange;
      if (!(exit > 0)) continue;
      const [sx, sy] = toScreen(pts[i].x, pts[i].y);
      ctx.strokeStyle = i === selectedIndex ? C.ringSelected : C.ring;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(sx, sy, exit * v.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // events
    hoveredEvent.current = null;
    const c = cursor.current;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      for (const ev of p.events ?? []) {
        const pos = eventPosition(pts, i, i === pts.length - 1 ? 0 : ev.fraction);
        const [sx, sy] = toScreen(pos.x, pos.y);
        const hot = c && Math.hypot(c.sx - sx, c.sy - sy) < 9;
        if (hot) hoveredEvent.current = { name: ev.name, sx, sy };
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = hot ? C.fg : C.bg;
        ctx.strokeStyle = C.fg;
        ctx.lineWidth = 1.25;
        ctx.fillRect(-3.5, -3.5, 7, 7);
        ctx.strokeRect(-3.5, -3.5, 7, 7);
        ctx.restore();
      }
    }

    // points (selected drawn last so it's on top)
    const order = pts.map((_, i) => i).filter(i => i !== selectedIndex);
    if (selectedIndex != null && selectedIndex < pts.length) order.push(selectedIndex);
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const i of order) {
      const p = pts[i];
      const [sx, sy] = toScreen(p.x, p.y);
      const sel = i === selectedIndex;
      const hov = i === hoverIndex;

      if (sel || hov) {
        ctx.fillStyle = sel ? C.haloSelected : C.halo;
        ctx.beginPath();
        ctx.arc(sx, sy, 11, 0, Math.PI * 2);
        ctx.fill();
      }

      if (p.theta != null) {
        const r = (p.theta * Math.PI) / 180;
        const tx = sx + Math.cos(r) * HEADING_LEN;
        const ty = sy - Math.sin(r) * HEADING_LEN;
        ctx.strokeStyle = sel ? C.fg : C.muted;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.fillStyle = sel ? C.fg : C.bg;
        ctx.beginPath();
        ctx.arc(tx, ty, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      const radius = p.theta != null ? R_POINT : R_TRANS;
      ctx.fillStyle = sel ? C.fg : C.bg;
      ctx.strokeStyle = sel ? C.fg : p.theta != null ? C.fg : C.muted;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (playback.sim.stalledAt === i) {
        ctx.strokeStyle = C.fg;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(sx, sy, 15, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.fillStyle = sel ? C.fg : C.label;
      ctx.fillText(String(i), sx + 9, sy + 10);
    }

    // ghost
    if (playback.state !== 'stopped') {
      const pose = poseAt(playback.sim, playback.timeRef.current);
      if (pose) drawRobot(ctx, pose.x, pose.y, pose.theta, true);
    }

    // event tooltip
    const he = hoveredEvent.current;
    if (he) {
      ctx.font = '11px Inter, system-ui, sans-serif';
      const tw = ctx.measureText(he.name).width;
      const bx = he.sx - tw / 2 - 7;
      const by = he.sy - 30;
      ctx.fillStyle = C.fg;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw + 14, 20, 5);
      ctx.fill();
      ctx.fillStyle = C.bg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(he.name, he.sx, by + 10.5);
    }
  };

  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (dirty.current || latest.current.playback.state === 'playing') {
        dirty.current = false;
        drawRef.current();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- input ----
  const setCursor = (c: string) => {
    if (canvasRef.current) canvasRef.current.style.cursor = c;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const { sx, sy } = local(e);
    const w = toWorld(sx, sy);
    const { path, selectedIndex, onSelect, update, field } = latest.current;
    canvasRef.current!.setPointerCapture(e.pointerId);

    if (e.button === 1 || e.button === 2) {
      drag.current = { kind: 'pan', x: sx, y: sy, moved: false, deselect: false };
      return;
    }
    if (e.button !== 0) return;

    const bg = bgHit(sx, sy);
    if (bg) {
      drag.current = { kind: 'bg', mode: bg, wx: w.x, wy: w.y, cal: { ...field.cal } };
      return;
    }

    const hit = path ? hitTest(sx, sy) : null;
    if (path && hit) {
      if (e.shiftKey) {
        update(removePoint(path, hit.index));
        if (selectedIndex === hit.index) onSelect(null);
        else if (selectedIndex != null && selectedIndex > hit.index) onSelect(selectedIndex - 1);
        return;
      }
      onSelect(hit.index);
      drag.current = { kind: 'point', index: hit.index, mode: hit.mode, moved: false };
      setCursor('grabbing');
      return;
    }

    if (path && e.detail === 2) {
      // double click: insert on the nearest segment, otherwise append
      const pts = path.points;
      let at = pts.length;
      let best = (HIT_POINT * 1.5 / view.current.scale) ** 2;
      for (let i = 0; i < pts.length - 1; i++) {
        const d = distToSegmentSquared(w.x, w.y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
        if (d < best) {
          best = d;
          at = i + 1;
        }
      }
      const pos = clampToField(w.x, w.y);
      update(insertPoint(path, at, { ...pos, theta: 0 }));
      onSelect(at);
      drag.current = null;
      return;
    }

    drag.current = { kind: 'pan', x: sx, y: sy, moved: false, deselect: true };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const { sx, sy } = local(e);
    const w = toWorld(sx, sy);
    cursor.current = { sx, sy, wx: w.x, wy: w.y };
    dirty.current = true;
    const d = drag.current;
    const { path, update, checkpoint, field, onHover, hoverIndex } = latest.current;

    if (!d) {
      const hit = hitTest(sx, sy);
      const idx = hit?.index ?? null;
      if (idx !== hoverIndex) onHover(idx);
      const bg = bgHit(sx, sy);
      setCursor(hit ? 'grab' : bg === 'move' ? 'move' : bg ? 'nwse-resize' : 'default');
      return;
    }

    if (d.kind === 'pan') {
      const dx = sx - d.x;
      const dy = sy - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 3) return;
      d.moved = true;
      view.current.ox += dx;
      view.current.oy += dy;
      d.x = sx;
      d.y = sy;
      fitted.current = false;
      setCursor('grabbing');
      return;
    }

    if (d.kind === 'bg') {
      const dx = w.x - d.wx;
      const dy = w.y - d.wy;
      const c0 = d.cal;
      const patch: Partial<Calibration> = {};
      if (d.mode === 'move') {
        patch.x = round2(c0.x + dx);
        patch.y = round2(c0.y + dy);
      } else {
        const left = d.mode === 'tl' || d.mode === 'bl';
        const top = d.mode === 'tl' || d.mode === 'tr';
        const nw = left ? c0.width - dx : c0.width + dx;
        const nh = top ? c0.height + dy : c0.height - dy;
        if (nw > 0.1) {
          patch.width = round2(nw);
          if (left) patch.x = round2(c0.x + dx);
        }
        if (nh > 0.1) {
          patch.height = round2(nh);
          if (!top) patch.y = round2(c0.y + dy);
        }
      }
      field.updateCal(patch, false);
      return;
    }

    if (d.kind === 'point' && path) {
      const p = path.points[d.index];
      if (!p) return;
      if (!d.moved) {
        checkpoint();
        d.moved = true;
      }
      if (d.mode === 'position') {
        update(updatePoint(path, d.index, clampToField(w.x, w.y)), false);
      } else {
        let deg = (Math.atan2(w.y - p.y, w.x - p.x) * 180) / Math.PI;
        deg = e.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg);
        update(updatePoint(path, d.index, { theta: wrapDeg(deg) }), false);
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    canvasRef.current?.releasePointerCapture(e.pointerId);
    if (!d) return;
    if (d.kind === 'pan' && !d.moved && d.deselect) latest.current.onSelect(null);
    if (d.kind === 'bg') latest.current.field.commit();
    setCursor('default');
  };

  const onPointerLeave = () => {
    cursor.current = null;
    hoveredEvent.current = null;
    if (latest.current.hoverIndex != null && !drag.current) latest.current.onHover(null);
    dirty.current = true;
  };

  const onWheel = (e: React.WheelEvent) => {
    const { sx, sy } = local(e);
    const { path, selectedIndex, update } = latest.current;

    // scroll over the selected heading point = rotate it
    const p = selectedIndex != null ? path?.points[selectedIndex] : null;
    if (path && p && p.theta != null) {
      const [px, py] = toScreen(p.x, p.y);
      if (Math.hypot(sx - px, sy - py) < HEADING_LEN + 6) {
        const delta = e.deltaY > 0 ? -5 : 5;
        update(updatePoint(path, selectedIndex!, { theta: wrapDeg(p.theta + delta) }), `wheel-${selectedIndex}`);
        return;
      }
    }

    const v = view.current;
    const w = toWorld(sx, sy);
    const minScale = Math.min(size.current.w / FIELD_WIDTH, size.current.h / FIELD_HEIGHT) * 0.4;
    const scale = Math.max(minScale, Math.min(600, v.scale * Math.exp(-e.deltaY * 0.0015)));
    view.current = { scale, ox: sx - w.x * scale, oy: sy + w.y * scale };
    fitted.current = false;
    dirty.current = true;
  };

  return (
    <div className="canvas-wrap" ref={containerRef}
      onDragOver={e => e.preventDefault()}
      onDrop={e => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) field.drop(file);
      }}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        onWheel={onWheel}
        onContextMenu={e => e.preventDefault()}
      />
      {!path && <div className="canvas-hint">Select or create a path</div>}
    </div>
  );
}
