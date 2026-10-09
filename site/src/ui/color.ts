/**
 * Colour maths for the pickers, from the LFX UI (RaceGFX-Frontend/src/utils/color.ts).
 *
 * Everything the UI touches is an `RGBA` in 0-255 (alpha 0-1); hex is the wire
 * format because that is what character palettes store.
 */

export interface RGBA { r: number; g: number; b: number; a: number }
export interface HSV { h: number; s: number; v: number }

export type ColorFormat = 'hex' | 'rgb' | 'hsl';
export const COLOR_FORMATS: ColorFormat[] = ['hex', 'rgb', 'hsl'];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const byte = (n: number) => clamp(Math.round(n), 0, 255);
const hex2 = (n: number) => byte(n).toString(16).padStart(2, '0');

export const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };

/**
 * Accepts `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`,
 * `hsla()` — everything `formatColor` can write, so a value copied out of the
 * picker in any format pastes back in.
 * Anything unparseable comes back as `null` so a caller can keep the old value
 * rather than silently snapping a half-typed hex to black.
 */
export function parseColor(input: string | null | undefined): RGBA | null {
    if (!input) return null;
    const s = input.trim().toLowerCase();

    if (s.startsWith('#')) {
        const h = s.slice(1);
        if (!/^[0-9a-f]+$/.test(h)) return null;
        if (h.length === 3 || h.length === 4) {
            const [r, g, b, a] = h.split('').map(c => parseInt(c + c, 16));
            return { r, g, b, a: h.length === 4 ? a / 255 : 1 };
        }
        if (h.length === 6 || h.length === 8) {
            const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
            return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
        }
        return null;
    }

    const m = s.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
        const parts = m[1].split(/[,/\s]+/).filter(Boolean).map(parseFloat);
        if (parts.length < 3 || parts.some(Number.isNaN)) return null;
        return { r: byte(parts[0]), g: byte(parts[1]), b: byte(parts[2]), a: parts[3] ?? 1 };
    }

    const hsl = s.match(/^hsla?\(([^)]+)\)$/);
    if (hsl) {
        // Both `hsl(210, 50%, 40%, 0.5)` and `hsl(210deg 50% 40% / 50%)`.
        const parts = hsl[1].split(/[,/\s]+/).filter(Boolean);
        if (parts.length < 3) return null;
        const [h, sat, l] = parts.slice(0, 3).map(parseFloat);
        if ([h, sat, l].some(Number.isNaN)) return null;
        const alpha = parts[3] === undefined ? 1
            : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
        if (Number.isNaN(alpha)) return null;
        return hslToRgb(((h % 360) + 360) % 360, clamp(sat, 0, 100) / 100, clamp(l, 0, 100) / 100, clamp(alpha, 0, 1));
    }

    return null;
}

/** Alpha is only appended when it is actually partial — `#1e90ff`, not `#1e90ffff`. */
export function toHex({ r, g, b, a }: RGBA, withAlpha = true): string {
    const base = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
    return withAlpha && a < 1 ? `${base}${hex2(a * 255)}` : base;
}

export function rgbToHsv({ r, g, b }: RGBA): HSV {
    const R = r / 255, G = g / 255, B = b / 255;
    const max = Math.max(R, G, B), min = Math.min(R, G, B);
    const d = max - min;

    let h = 0;
    if (d) {
        if (max === R) h = ((G - B) / d) % 6;
        else if (max === G) h = (B - R) / d + 2;
        else h = (R - G) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    return { h, s: max ? d / max : 0, v: max };
}

export function hsvToRgb({ h, s, v }: HSV, a = 1): RGBA {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    const seg = Math.floor(((h % 360) + 360) % 360 / 60);
    const [r, g, b] = (
        [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]] as const
    )[seg];
    return { r: byte((r + m) * 255), g: byte((g + m) * 255), b: byte((b + m) * 255), a };
}

export function hslToRgb(h: number, s: number, l: number, a = 1): RGBA {
    // Via HSV so there is one conversion to keep correct.
    const v = l + s * Math.min(l, 1 - l);
    return hsvToRgb({ h, s: v ? 2 * (1 - l / v) : 0, v }, a);
}

export function rgbToHsl({ r, g, b }: RGBA): { h: number; s: number; l: number } {
    const { h, s, v } = rgbToHsv({ r, g, b, a: 1 });
    const l = v * (1 - s / 2);
    return { h, s: l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l), l };
}

/** WCAG relative luminance. */
export function luminance({ r, g, b }: RGBA): number {
    const f = (c: number) => {
        const x = c / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * "Would this swatch vanish into the app's dark surface?" — a translucent colour
 * counts as darker, since what shows through behind it is the dark page.
 */
export function isDark(c: RGBA): boolean {
    return luminance(c) * c.a < 0.22;
}

export function formatColor(c: RGBA, format: ColorFormat, withAlpha = true): string {
    const a = Math.round(c.a * 100) / 100;
    const showAlpha = withAlpha && a < 1;

    if (format === 'rgb') {
        return showAlpha
            ? `rgba(${byte(c.r)}, ${byte(c.g)}, ${byte(c.b)}, ${a})`
            : `rgb(${byte(c.r)}, ${byte(c.g)}, ${byte(c.b)})`;
    }
    if (format === 'hsl') {
        const { h, s, l } = rgbToHsl(c);
        const H = Math.round(h), S = Math.round(s * 100), L = Math.round(l * 100);
        return showAlpha ? `hsla(${H}, ${S}%, ${L}%, ${a})` : `hsl(${H}, ${S}%, ${L}%)`;
    }
    return toHex(c, withAlpha).toUpperCase();
}

export const sameColor = (a: RGBA, b: RGBA) =>
    byte(a.r) === byte(b.r) && byte(a.g) === byte(b.g) && byte(a.b) === byte(b.b) &&
    Math.round(a.a * 255) === Math.round(b.a * 255);

/** CSS for a swatch, with the checkerboard showing through a partial alpha. */
export const CHECKERBOARD =
    'repeating-conic-gradient(#2b2c28 0% 25%, #161715 0% 50%) 50% / 8px 8px';
