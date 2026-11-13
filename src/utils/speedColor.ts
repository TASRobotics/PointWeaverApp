// Color scale for speed: red (stopped) through yellow to green (top speed).
// Each theme has its own steps so every color stays readable on that field: darker on the light (day) field
// (all at least 3:1 against #f7f7f7), brighter on the dark (night) field (at least 5:1 against #080808).
// Red and green look alike to red-green colorblind eyes, so the hover tooltip's number is the exact reading.
const RAMPS = {
  day: ['#c62828', '#d4610f', '#b58900', '#5f9e1a', '#1e8a3c'],
  night: ['#e5484d', '#f0883e', '#e9c046', '#9fd356', '#3fcf74'],
};

export type SpeedTheme = keyof typeof RAMPS;

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const PARSED = { day: RAMPS.day.map(rgb), night: RAMPS.night.map(rgb) };

/** Color for a fraction of top speed (0 = stopped, 1 = top speed), blended between ramp steps. */
export function speedColor(fraction: number, theme: SpeedTheme): string {
  const ramp = PARSED[theme];
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(f));
  const t = f - i;
  const [r, g, b] = ramp[i].map((c, k) => Math.round(c + (ramp[i + 1][k] - c) * t));
  return `rgb(${r},${g},${b})`;
}

/** The ramp's stops, slow to fast, for drawing a legend gradient. */
export const speedStops = (theme: SpeedTheme) => RAMPS[theme];
