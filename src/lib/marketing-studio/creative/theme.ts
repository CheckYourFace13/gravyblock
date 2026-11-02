/**
 * Visual themes. A theme is derived from the product TYPE (so a website, a SaaS and a game do not share one look) and the
 * product's own brand colors. All colors are validated for contrast here, in code, not by eye.
 */
import type { ProductKind } from "../config";

export type LayoutStyle = "editorial" | "clean" | "playful";

export type Theme = {
  layout: LayoutStyle;
  bg1: string;
  bg2: string;
  fg: string;
  muted: string;
  accent: string;
  accentFg: string;
  /** Accent used as TEXT on the background; falls back to fg when the accent does not have enough contrast. */
  accentText: string;
  card: string;
  cardFg: string;
  headingFont: "Playfair Display" | "Inter" | "Fredoka";
  headingWeight: number;
  bodyFont: "Inter";
};

export const SIZES = {
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
  landscape: { w: 1200, h: 628 },
} as const;
export type SizeKey = keyof typeof SIZES;
export const SIZE_KEYS = Object.keys(SIZES) as SizeKey[];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeHex(input: string | null | undefined): string | null {
  if (!input || !HEX.test(input.trim())) return null;
  let h = input.trim().toLowerCase();
  if (h.length === 4) h = "#" + [...h.slice(1)].map((c) => c + c).join("");
  return h;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function readableOn(bg: string): string {
  // Pure black, not near-black: for mid-tone colors the better of white and black always reaches at least 4.5:1.
  return contrast("#ffffff", bg) >= contrast("#000000", bg) ? "#ffffff" : "#000000";
}

/** Darkens or lightens a color toward black or white until it reaches the contrast target on a background. */
export function ensureContrast(color: string, bg: string, target = 4.5): string {
  if (contrast(color, bg) >= target) return color;
  const towards = luminance(bg) > 0.4 ? "#000000" : "#ffffff";
  const [r, g, b] = rgb(color);
  const [tr, tg, tb] = rgb(towards);
  for (let t = 0.1; t <= 1.0001; t += 0.1) {
    const mix = (c: number, tc: number) => Math.round(c + (tc - c) * t);
    const hex = "#" + [mix(r, tr), mix(g, tg), mix(b, tb)].map((v) => v.toString(16).padStart(2, "0")).join("");
    if (contrast(hex, bg) >= target) return hex;
  }
  return towards;
}

const PRESETS: Record<LayoutStyle, Omit<Theme, "accent" | "accentFg" | "accentText">> = {
  editorial: { layout: "editorial", bg1: "#fbf7f0", bg2: "#efe6d6", fg: "#1c1917", muted: "#57534e", card: "#ffffff", cardFg: "#1c1917", headingFont: "Playfair Display", headingWeight: 800, bodyFont: "Inter" },
  clean: { layout: "clean", bg1: "#f8fafc", bg2: "#dbe4f0", fg: "#0f172a", muted: "#475569", card: "#ffffff", cardFg: "#0f172a", headingFont: "Inter", headingWeight: 800, bodyFont: "Inter" },
  playful: { layout: "playful", bg1: "#1e1b4b", bg2: "#3b2f8f", fg: "#ffffff", muted: "#d4d9ff", card: "#ffffff", cardFg: "#1e1b4b", headingFont: "Fredoka", headingWeight: 700, bodyFont: "Inter" },
};

export function layoutFor(kind: ProductKind): LayoutStyle {
  if (kind === "website") return "editorial";
  if (kind === "web_game" || kind === "mobile_game") return "playful";
  return "clean";
}

/** Builds the theme for a product type and an optional brand primary color. */
export function themeFor(kind: ProductKind, brandPrimary?: string | null): Theme {
  const preset = PRESETS[layoutFor(kind)];
  const accent = normalizeHex(brandPrimary) ?? (preset.layout === "editorial" ? "#b45309" : preset.layout === "clean" ? "#2563eb" : "#fbbf24");
  return {
    ...preset,
    accent,
    accentFg: readableOn(accent),
    accentText: ensureContrast(accent, preset.bg1, 4.5),
  };
}

/** Every text-on-background pairing a template uses, so QA can verify contrast from the theme itself. */
export function contrastPairs(theme: Theme): Array<{ role: string; fg: string; bg: string; min: number }> {
  return [
    { role: "headline on background", fg: theme.fg, bg: theme.bg1, min: 4.5 },
    { role: "headline on background (end of gradient)", fg: theme.fg, bg: theme.bg2, min: 4.5 },
    { role: "muted text on background", fg: theme.muted, bg: theme.bg1, min: 4.5 },
    { role: "muted text on background (end of gradient)", fg: theme.muted, bg: theme.bg2, min: 4.5 },
    { role: "accent label on background", fg: theme.accentText, bg: theme.bg1, min: 4.5 },
    { role: "call to action text on accent", fg: theme.accentFg, bg: theme.accent, min: 4.5 },
    { role: "text on card", fg: theme.cardFg, bg: theme.card, min: 4.5 },
  ];
}
