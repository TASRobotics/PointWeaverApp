import type { ReactNode } from 'react';

const ICONS: Record<string, ReactNode> = {
  play: <path d="M5 3.5v9l7.5-4.5z" fill="currentColor" stroke="none" />,
  pause: <><rect x="4" y="3.5" width="2.6" height="9" rx=".6" fill="currentColor" stroke="none" /><rect x="9.4" y="3.5" width="2.6" height="9" rx=".6" fill="currentColor" stroke="none" /></>,
  stop: <rect x="4" y="4" width="8" height="8" rx="1.2" fill="currentColor" stroke="none" />,
  plus: <path d="M8 3v10M3 8h10" />,
  x: <path d="M4 4l8 8M12 4l-8 8" />,
  flipX: <><path d="M8 2v12" strokeDasharray="1.5 1.5" /><path d="M5.5 5L2.5 8l3 3M10.5 5l3 3-3 3" /></>,
  flipY: <><path d="M2 8h12" strokeDasharray="1.5 1.5" /><path d="M5 5.5L8 2.5l3 3M5 10.5l3 3 3-3" /></>,
  fit: <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />,
  save: <><path d="M8 2.5v7M5 6.5l3 3 3-3" /><path d="M3 11v2.5h10V11" /></>,
  folder: <path d="M2 4.5c0-.6.4-1 1-1h3l1.5 1.5H13c.6 0 1 .4 1 1v6c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1z" />,
  image: <><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M2.5 11l3.5-3.5 3 3 2-2 2.5 2.5" /><circle cx="10.5" cy="6" r="1" /></>,
  move: <path d="M8 2v12M2 8h12M8 2L6.5 3.5M8 2l1.5 1.5M8 14l-1.5-1.5M8 14l1.5-1.5M2 8l1.5-1.5M2 8l1.5 1.5M14 8l-1.5-1.5M14 8l-1.5 1.5" />,
  pencil: <path d="M10.5 2.5l3 3L6 13H3v-3z" />,
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />,
  check: <path d="M3 8.5l3.2 3.2L13 4.8" />,
  grid: <><rect x="2.5" y="2.5" width="11" height="11" rx="1" /><path d="M6.2 2.5v11M9.8 2.5v11M2.5 6.2h11M2.5 9.8h11" /></>,
  reset: <><path d="M3.5 8a4.5 4.5 0 1 0 1.3-3.2" /><path d="M3.5 2.5v2.5H6" /></>,
  speed: <><path d="M2.5 11.5a5.5 5.5 0 0 1 11 0" /><path d="M8 11.5l2.6-3.4" /><circle cx="8" cy="11.5" r=".9" fill="currentColor" stroke="none" /></>,
  warn: <><path d="M8 2.5l6 10.5H2z" /><path d="M8 6.5v3M8 11.3v.2" /></>,
  grip: <><circle cx="6" cy="4" r=".9" fill="currentColor" stroke="none" /><circle cx="10" cy="4" r=".9" fill="currentColor" stroke="none" /><circle cx="6" cy="8" r=".9" fill="currentColor" stroke="none" /><circle cx="10" cy="8" r=".9" fill="currentColor" stroke="none" /><circle cx="6" cy="12" r=".9" fill="currentColor" stroke="none" /><circle cx="10" cy="12" r=".9" fill="currentColor" stroke="none" /></>,
  importFile: <><path d="M9 2.5H4.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V6z" /><path d="M9 2.5V6h3.5" /><path d="M8 7.5v4.5M6.3 10.3 8 12l1.7-1.7" /></>,
  sliders: <><path d="M2.5 4h11M2.5 8h11M2.5 12h11" /><circle cx="6" cy="4" r="1.4" fill="currentColor" /><circle cx="10.5" cy="8" r="1.4" fill="currentColor" /><circle cx="5" cy="12" r="1.4" fill="currentColor" /></>,
  sun: <><circle cx="8" cy="8" r="2.8" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></>,
  moon: <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" />,
  logo: <><circle cx="3.5" cy="11.5" r="1.8" fill="currentColor" stroke="none" /><circle cx="8" cy="4.5" r="1.8" fill="currentColor" stroke="none" /><circle cx="12.5" cy="11.5" r="1.8" fill="currentColor" stroke="none" /><path d="M3.5 11.5C5 6 6 4.5 8 4.5s3 1.5 4.5 7" /></>,
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

/** Heading arrow, rotated to a field angle (deg, CCW from +x). */
export function HeadingGlyph({ theta, size = 12 }: { theta: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" style={{ transform: `rotate(${-theta}deg)` }}>
      <path d="M2 6h7M6.5 3.5L9 6 6.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface IconButtonProps {
  icon: IconName;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  /** set when the button opens a menu: whether it's open */
  expanded?: boolean;
}

export function IconButton({ icon, title, onClick, disabled, active, className = '', expanded }: IconButtonProps) {
  return (
    <button type="button" className={`icon-btn ${active ? 'active' : ''} ${className}`} title={title} aria-label={title}
      onClick={onClick} disabled={disabled}
      aria-haspopup={expanded !== undefined ? 'menu' : undefined} aria-expanded={expanded}>
      <Icon name={icon} />
    </button>
  );
}
