import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// WCAG 2.x contrast ratios for the six theme x mode palettes declared in styles.css.
const COMBOS = [
  { theme: "papel", mode: "light" },
  { theme: "papel", mode: "dark" },
  { theme: "eclipse", mode: "light" },
  { theme: "eclipse", mode: "dark" },
  { theme: "quadrante", mode: "light" },
  { theme: "quadrante", mode: "dark" },
] as const;

const AVATAR_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8].map((slot) => `avatar-${slot}`);

// [foreground, background, minimum ratio]
const CHECKS: ReadonlyArray<readonly [string, string, number]> = [
  ["ink", "paper", 7],
  ["ink", "surface-raised", 7],
  ["ink-2", "paper", 4.5],
  ["ink-3", "paper", 4.5],
  ["ink-3", "surface-raised", 4.5],
  ["accent", "paper", 3],
  ["accent-text", "paper", 4.5],
  ["accent-ink", "accent", 4.5],
  ["accent-ink", "danger-strong", 4.5],
  ...["success", "warning", "danger", "danger-strong", "question-option"].flatMap((status) => [
    [status, "paper", 4.5] as const,
    [status, "surface-raised", 4.5] as const,
  ]),
  ...AVATAR_SLOTS.map((slot) => [slot, "paper", 3] as const),
];

// Collapsed-rail controls (app-shell.css `.sidebar-compact`, `.sidebar-icon-button`, `.bot-row`) and the rail tooltip.
// [foreground, background, minimum ratio] over the --lunabot-* tokens those rules paint.
const RAIL_CHECKS: ReadonlyArray<readonly [string, string, number]> = [
  // Idle icons and the focus ring both paint --lunabot-muted (text-muted).
  ["muted", "sidebar", 3],
  ["white", "border", 3],
  ["white", "hover", 3],
  ["text-primary", "hover", 4.5],
  ["text-primary", "active", 4.5],
  ["bg-sidebar", "text-primary", 4.5],
  ["text-primary", "bg-surface-raised", 4.5],
];

const css = readFileSync(join(process.cwd(), "src/renderer/src/styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// Derived aliases (e.g. --lunabot-sidebar: var(--lunabot-bg-sidebar)) live in plain `:root` blocks.
const DERIVED = new Map<string, string>();
for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  if (selectors.split(",").some((part) => part.trim() === ":root")) {
    for (const [name, value] of parseTokenBody(body)) DERIVED.set(name, value);
  }
}

function parseTokenBody(body: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const [, name, value] of body.matchAll(/--lunabot-([a-z0-9-]+):\s*([^;]+);/g)) {
    tokens.set(name, value.trim());
  }
  return tokens;
}

function tokensFor(theme: string, mode: string): Map<string, string> {
  const selector = `[data-theme="${theme}"][data-mode="${mode}"]`;
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selectors]) =>
    selectors.split(",").some((part) => part.trim().endsWith(selector)),
  );
  expect(rules, `exactly one rule block for ${theme}/${mode}`).toHaveLength(1);
  return parseTokenBody(rules[0][2]);
}

type Rgb = readonly [number, number, number];
type Paint = { rgb: Rgb; alpha: number };

function hexToRgb(value: string): [number, number, number] {
  const hex = value.replace("#", "");
  const full = hex.length === 3 ? [...hex].map((char) => char + char).join("") : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Not a hex color: ${value}`);
  const channel = (index: number) => Number.parseInt(full.slice(index, index + 2), 16);
  return [channel(0), channel(2), channel(4)];
}

function luminance(rgb: Rgb): number {
  const [red, green, blue] = rgb.map((channel) => {
    const scaled = channel / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastOf(first: Rgb, second: Rgb): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function contrastRatio(first: string, second: string): number {
  return contrastOf(hexToRgb(first), hexToRgb(second));
}

// Splits on commas that are not inside parentheses, so nested functions stay intact.
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += char;
  }
  parts.push(current.trim());
  return parts;
}

// Resolves var() aliases and the color-mix() overlays (`X 6%, transparent`) the theme uses.
function paintOf(value: string, palette: Map<string, string>, depth = 0): Paint {
  if (depth > 10) throw new Error(`Token cycle at ${value}`);
  const text = value.trim();
  const alias = /^var\(--lunabot-([a-z0-9-]+)\)$/.exec(text);
  if (alias) {
    const next = palette.get(alias[1]) ?? DERIVED.get(alias[1]);
    if (!next) throw new Error(`Missing --lunabot-${alias[1]}`);
    return paintOf(next, palette, depth + 1);
  }
  if (text === "transparent") return { rgb: [0, 0, 0], alpha: 0 };
  if (text.startsWith("#")) return { rgb: hexToRgb(text), alpha: 1 };
  const mix = /^color-mix\((.*)\)$/.exec(text);
  const [space, first = "", second = "transparent"] = mix ? splitTopLevel(mix[1]) : [];
  const share = /^(.+)\s+([\d.]+)%$/.exec(first);
  if (!mix || space !== "in srgb" || !share) throw new Error(`Unsupported color value: ${text}`);
  const weight = Number(share[2]) / 100;
  const a = paintOf(share[1], palette, depth + 1);
  const b = paintOf(second, palette, depth + 1);
  const alpha = a.alpha * weight + b.alpha * (1 - weight);
  if (alpha === 0) return { rgb: a.rgb, alpha };
  const mixed = a.rgb.map(
    (channel, index) => (channel * a.alpha * weight + b.rgb[index] * b.alpha * (1 - weight)) / alpha,
  );
  return { rgb: [mixed[0], mixed[1], mixed[2]], alpha };
}

// Composites a translucent paint over an opaque background.
function over(paint: Paint, base: Rgb): Rgb {
  const blended = paint.rgb.map((channel, index) => channel * paint.alpha + base[index] * (1 - paint.alpha));
  return [blended[0], blended[1], blended[2]];
}

function colorToken(tokens: Map<string, string>, name: string): string {
  const value = tokens.get(name);
  if (!value) throw new Error(`Missing --lunabot-${name}`);
  return value;
}

describe.each(COMBOS)("$theme $mode palette contrast", ({ theme, mode }) => {
  const tokens = tokensFor(theme, mode);

  it.each(CHECKS)("%s on %s is at least %s:1", (foreground, background, minimum) => {
    const ratio = contrastRatio(colorToken(tokens, foreground), colorToken(tokens, background));
    expect(ratio, `${foreground} on ${background}`).toBeGreaterThanOrEqual(minimum);
  });

  const sidebarRgb = paintOf("var(--lunabot-sidebar)", tokens).rgb;
  const railRgb = (name: string) => over(paintOf(`var(--lunabot-${name})`, tokens), sidebarRgb);

  it.each(RAIL_CHECKS)("rail %s on %s is at least %s:1", (foreground, background, minimum) => {
    const ratio = contrastOf(railRgb(foreground), railRgb(background));
    expect(ratio, `rail ${foreground} on ${background}`).toBeGreaterThanOrEqual(minimum);
  });
});
