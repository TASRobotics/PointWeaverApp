/**
 * Math for number fields: + - * / and parentheses, `pi`, and units that convert to the field's own unit
 * ("18 in" in a meters field is 0.4572). Units are plain scale factors, so "1 ft + 6 in" works; there's no
 * dimensional analysis beyond each field accepting only the units of its own kind.
 */

/** What a field measures, which decides the units it accepts. */
export type Dimension = 'length' | 'speed' | 'accel' | 'time' | 'angle' | 'angleRate' | 'none';

const UNITS: Record<Dimension, Record<string, number>> = {
  length: { m: 1, cm: 0.01, mm: 0.001, in: 0.0254, ft: 0.3048, yd: 0.9144 },
  speed: { 'm/s': 1, 'ft/s': 0.3048, 'in/s': 0.0254, mph: 0.44704 },
  accel: { 'm/s^2': 1, 'ft/s^2': 0.3048, 'in/s^2': 0.0254 },
  time: { s: 1, ms: 0.001 },
  angle: { deg: 1, rad: 180 / Math.PI },
  angleRate: { 'deg/s': 1, 'rad/s': 180 / Math.PI },
  none: {},
};

/** The dimension a field shows with its suffix ("m", "m/s", "°" ...); anything else takes plain numbers. */
export function dimensionOf(suffix: string | undefined): Dimension {
  switch (suffix) {
    case 'm': return 'length';
    case 'm/s': return 'speed';
    case 'm/s²': return 'accel';
    case 's': return 'time';
    case '°': return 'angle';
    case '°/s': return 'angleRate';
    default: return 'none';
  }
}

type Token = { kind: 'num'; value: number } | { kind: 'word'; text: string } | { kind: 'op'; text: string };

function tokenize(src: string): Token[] | null {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[\d.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) return null;
      out.push({ kind: 'num', value: Number(m[0]) });
      i += m[0].length;
    } else if (/[a-zA-Zµπ°²]/.test(c)) {
      const m = /^[a-zA-Zµπ°²]+/.exec(src.slice(i))!;
      out.push({ kind: 'word', text: m[0] });
      i += m[0].length;
    } else if ('+-*/()^×÷'.includes(c)) {
      out.push({ kind: 'op', text: c === '×' ? '*' : c === '÷' ? '/' : c });
      i++;
    } else {
      return null;
    }
  }
  return out;
}

const ALIASES: Record<string, string> = {
  meter: 'm', meters: 'm', inch: 'in', inches: 'in', foot: 'ft', feet: 'ft',
  sec: 's', secs: 's', second: 's', seconds: 's',
  degs: 'deg', degree: 'deg', degrees: 'deg', radian: 'rad', radians: 'rad',
};

/** Normalize how a unit can be written: any case, ° for deg, ² for ^2, common spelled-out names. */
const unitKey = (text: string) => {
  const t = text.toLowerCase().replace(/°/g, 'deg').replace(/²/g, '^2');
  return ALIASES[t] ?? t;
};

/**
 * Evaluate what was typed into a field. Returns the number in the field's unit, or null if it doesn't parse
 * (or uses a unit that doesn't fit the field).
 */
export function evaluate(src: string, dim: Dimension = 'none'): number | null {
  const tokens = tokenize(src);
  if (!tokens || tokens.length === 0) return null;
  const units = UNITS[dim];
  let pos = 0;
  const peek = (k = 0) => tokens[pos + k];
  const isOp = (t: Token | undefined, text: string) => t?.kind === 'op' && t.text === text;

  // after a value: the longest unit (up to word/word^2) that this field accepts, as a factor; 1 if none
  const unit = (): number | null => {
    const w = peek();
    if (w?.kind !== 'word') return 1;
    const tries: { n: number; key: string }[] = [{ n: 1, key: unitKey(w.text) }];
    const w2 = peek(2);
    if (isOp(peek(1), '/') && w2?.kind === 'word') {
      const per = `${unitKey(w.text)}/${unitKey(w2.text)}`;
      tries.push({ n: 3, key: per });
      if (isOp(peek(3), '^') && peek(4)?.kind === 'num') tries.push({ n: 5, key: `${per}^${(peek(4) as { value: number }).value}` });
    }
    for (const t of tries.reverse()) {
      if (t.key in units) {
        pos += t.n;
        return units[t.key];
      }
    }
    return null; // a word that isn't a unit for this field
  };

  const primary = (): number | null => {
    const t = peek();
    let v: number | null;
    if (t?.kind === 'num') {
      pos++;
      v = t.value;
    } else if (t?.kind === 'word' && (t.text.toLowerCase() === 'pi' || t.text === 'π')) {
      pos++;
      v = Math.PI;
    } else if (isOp(t, '(')) {
      pos++;
      v = sum();
      if (v == null || !isOp(peek(), ')')) return null;
      pos++;
    } else {
      return null;
    }
    return v;
  };

  const unary = (): number | null => {
    if (isOp(peek(), '-') || isOp(peek(), '+')) {
      const neg = isOp(peek(), '-');
      pos++;
      const v = unary();
      return v == null ? null : neg ? -v : v;
    }
    return primary();
  };

  // a unit applies to everything multiplied or divided before it: "pi/2 rad" is (pi/2) rad, "1/2 ft" is half a foot,
  // while "1 ft + 6 in" still gives each term its own unit
  const product = (): number | null => {
    let v = unary();
    if (v == null) return null;
    for (;;) {
      const f = unit();
      if (f == null) return null;
      v *= f;
      if (!isOp(peek(), '*') && !isOp(peek(), '/')) return v;
      const div = isOp(peek(), '/');
      pos++;
      const r = unary();
      if (r == null) return null;
      v = div ? v / r : v * r;
    }
  };

  function sum(): number | null {
    let v = product();
    while (v != null && (isOp(peek(), '+') || isOp(peek(), '-'))) {
      const minus = isOp(peek(), '-');
      pos++;
      const r = product();
      if (r == null) return null;
      v = minus ? v - r : v + r;
    }
    return v;
  }

  const v = sum();
  return v != null && pos === tokens.length && Number.isFinite(v) ? v : null;
}

/** True if the text is just a number (no math or units), so there's nothing to preview. */
export const isPlainNumber = (src: string) => /^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i.test(src);
