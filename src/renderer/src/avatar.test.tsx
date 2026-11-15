import { render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AvatarArt,
  type AvatarFamily,
  avatarCandidateSeeds,
  avatarFaceGeometry,
  avatarHeadColor,
  avatarHueSwatch,
  avatarProfile,
  createStaticAvatarSvg,
  MOUTH_STROKE,
} from "./avatar";
import { setThemePreference } from "./theme";

afterEach(() => {
  vi.unstubAllGlobals();
  setThemePreference("eclipse");
});

const FAMILIES: AvatarFamily[] = ["fases", "monolito", "quadrantes"];
const SILHOUETTE_COUNT = 7;
const EXPRESSION_COUNT = 16;

describe("avatar catalog", () => {
  it("keeps stored seeds on the same silhouette, expression and colour indices", () => {
    expect(avatarProfile("first-bot:avatar:0:13", null)).toEqual({ shape: 6, expression: 4, color: 1 });
    expect(avatarProfile("chief", null)).toEqual({ shape: 1, expression: 10, color: 7 });
    expect(avatarProfile("chief:avatar:4:7", null)).toEqual({ shape: 2, expression: 4, color: 1 });
    expect(avatarProfile("shape-regression-0", null)).toEqual({ shape: 5, expression: 7, color: 4 });
    expect(avatarProfile("story-avatar", null)).toEqual({ shape: 5, expression: 0, color: 5 });
  });

  it("draws from seven silhouettes, sixteen expressions and eight colours", () => {
    const profiles = Array.from({ length: 400 }, (_, index) => avatarProfile(`seed-${index}`, null));
    expect(new Set(profiles.map((profile) => profile.shape))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
    expect(new Set(profiles.map((profile) => profile.expression)).size).toBe(16);
    expect(new Set(profiles.map((profile) => profile.color)).size).toBe(8);
  });

  it("maps stored hues to palette tokens", () => {
    expect(avatarProfile("chief", 215).color).toBe(4);
    expect(avatarHeadColor("chief", 215)).toBe("var(--lunabot-avatar-5)");
    expect(avatarHueSwatch(215)).toBe(avatarHeadColor("different-seed", 215));
  });

  it("keeps every silhouette in avatar candidates", () => {
    const firstSet = avatarCandidateSeeds("chief", "chief:avatar:4:7", 0);
    const repeatedSet = avatarCandidateSeeds("chief", "chief:avatar:4:7", 0);
    const nextSet = avatarCandidateSeeds("chief", "chief:avatar:4:7", 1);

    expect(firstSet).toEqual(repeatedSet);
    expect(firstSet).toHaveLength(12);
    expect(new Set(firstSet)).toHaveLength(12);
    expect(firstSet[0]).toBe("chief:avatar:4:7");
    expect(new Set(firstSet.map((seed) => avatarProfile(seed, null).shape))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
    expect(new Set(firstSet.map((seed) => avatarProfile(seed, null).expression)).size).toBeGreaterThanOrEqual(8);
    expect(nextSet[0]).toBe(firstSet[0]);
    expect(nextSet.slice(1)).not.toEqual(firstSet.slice(1));
  });

  it("gives each family seven distinct silhouettes", () => {
    for (const family of FAMILIES) {
      const bodies = Array.from({ length: SILHOUETTE_COUNT }, (_, shape) => {
        const view = render(() => <AvatarArt family={family} shape={shape} expression={0} color={0} pose="rest" />);
        const outline = Array.from(view.container.querySelectorAll("path.avatar-body, mask > path"), (path) =>
          path.getAttribute("d"),
        ).join("|");
        view.unmount();
        return outline;
      });
      expect(new Set(bodies).size).toBe(7);
    }
  });
});

describe("Avatar rendering", () => {
  it.each([
    ["eclipse", "fases"],
    ["papel", "monolito"],
    ["quadrante", "quadrantes"],
  ] as const)("draws the %s theme with the %s family", (theme, family) => {
    setThemePreference(theme);
    expect(createStaticAvatarSvg("chief", 215).getAttribute("data-family")).toBe(family);
  });

  it("renders decorative static SVG without starting an animation frame", () => {
    const requestAnimationFrame = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);

    const svg = createStaticAvatarSvg("chief", 215);

    expect(svg.localName).toBe("svg");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(svg.hasAttribute("role")).toBe(false);
    expect(svg.hasAttribute("aria-label")).toBe(false);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("wraps the animated eyes in a scalable face group", () => {
    const view = render(() => <AvatarArt family="fases" shape={0} expression={0} color={0} pose="rest" />);
    expect(view.container.querySelector("g.avatar-face > g.avatar-eyes")).not.toBeNull();
    view.unmount();
  });

  it("draws a mouth for each of the sixteen expressions", () => {
    for (let expression = 0; expression < EXPRESSION_COUNT; expression += 1) {
      const view = render(() => (
        <AvatarArt family="monolito" shape={0} expression={expression} color={0} pose="rest" />
      ));
      expect(view.container.querySelector("g.avatar-face > g.avatar-mouth path.avatar-mouth-shape")).not.toBeNull();
      view.unmount();
    }
  });

  it("keeps the eyes well apart in every family, silhouette and expression", () => {
    for (const family of FAMILIES) {
      for (let shape = 0; shape < SILHOUETTE_COUNT; shape += 1) {
        for (let expression = 0; expression < EXPRESSION_COUNT; expression += 1) {
          const [left, right] = avatarFaceGeometry(family, shape, expression).eyes;
          if (!left || !right) throw new Error("Expected two eyes.");
          const gap = Math.hypot(right.cx - left.cx, right.cy - left.cy);
          const widest = Math.max(left.width, right.width);
          expect(gap, `${family} ${shape} ${expression}`).toBeGreaterThanOrEqual(2.2 * widest);
        }
      }
    }
  });

  it("keeps eyes and mouth inside the filled body with a 1.5 unit margin", () => {
    const violations: string[] = [];
    for (const family of FAMILIES) {
      for (let shape = 0; shape < SILHOUETTE_COUNT; shape += 1) {
        for (let expression = 0; expression < EXPRESSION_COUNT; expression += 1) {
          violations.push(...faceViolations(family, shape, expression));
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

const MARGIN = 1.5;

type Point = readonly [number, number];

/** Lists every eye or mouth sample that leaves the filled body or comes closer than the margin to its edge. */
function faceViolations(family: AvatarFamily, shape: number, expression: number): string[] {
  const { silhouette, eyes, mouth } = avatarFaceGeometry(family, shape, expression);
  const body = discretizePath(silhouette.body);
  // The Anel draws its own eyes and mouth inside its hole, the second subpath of its body.
  const container = silhouette.ownEyes ? body.slice(1) : body;
  const cut = silhouette.cut ? discretizePath(silhouette.cut) : [];
  const boundary = [...container, ...cut];
  const inside = (point: Point) => insideEvenOdd(container, point) && !insideEvenOdd(cut, point);
  const label = `${family} ${shape} (${silhouette.id}) expression ${expression}`;
  const violations: string[] = [];

  const check = (name: string, samples: readonly Point[], margin: number) => {
    for (const point of samples) {
      if (!inside(point) || distanceToBoundary(boundary, point) < margin) {
        violations.push(`${label} ${name} at ${point[0].toFixed(2)},${point[1].toFixed(2)}`);
        return;
      }
    }
  };

  eyes.forEach((eye, index) => {
    const contour = rectangleContour(eye.cx, eye.cy, eye.width / 2, eye.height / 2, eye.tilt);
    check(`eye ${index}`, contour, MARGIN);
    check(`eye ${index} interior`, gridInside(contour), 0);
  });

  const mouthScale = mouth.scale;
  const mouthPolygons = discretizePath(mouth.d).map((polygon) =>
    polygon.map(([x, y]): Point => [mouth.x + x * mouthScale, mouth.y + y * mouthScale]),
  );
  const mouthMargin = MARGIN + (MOUTH_STROKE * mouthScale) / 2;
  for (const polygon of mouthPolygons) {
    check("mouth", polygon, mouthMargin);
  }
  if (mouth.filled) {
    check("mouth interior", gridInside(mouthPolygons.flat()), 0);
  }
  return violations;
}

function rectangleContour(cx: number, cy: number, halfWidth: number, halfHeight: number, tiltDegrees: number): Point[] {
  const corners: Point[] = [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ];
  const samples: Point[] = [];
  for (let index = 0; index < corners.length; index += 1) {
    const [ax, ay] = corners[index];
    const [bx, by] = corners[(index + 1) % corners.length];
    for (let step = 0; step < 8; step += 1) {
      const t = step / 8;
      samples.push(rotateAbout(cx, cy, ax + (bx - ax) * t, ay + (by - ay) * t, tiltDegrees));
    }
  }
  return samples;
}

/** Rotates an offset from (cx, cy) the way SVG rotate(degrees cx cy) does. */
function rotateAbout(cx: number, cy: number, offsetX: number, offsetY: number, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  return [
    cx + offsetX * Math.cos(radians) - offsetY * Math.sin(radians),
    cy + offsetX * Math.sin(radians) + offsetY * Math.cos(radians),
  ];
}

/** Interior samples on a 5x5 grid over the bounding box, kept only when they fall inside the shape. */
function gridInside(contour: readonly Point[]): Point[] {
  const xs = contour.map(([x]) => x);
  const ys = contour.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const samples: Point[] = [];
  for (let i = 0; i < 5; i += 1) {
    for (let j = 0; j < 5; j += 1) {
      samples.push([minX + ((maxX - minX) * (i + 0.5)) / 5, minY + ((maxY - minY) * (j + 0.5)) / 5]);
    }
  }
  return samples.filter((point) => insideEvenOdd([contour], point));
}

function insideEvenOdd(polygons: readonly (readonly Point[])[], [px, py]: Point): boolean {
  let inside = false;
  for (const polygon of polygons) {
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function distanceToBoundary(polygons: readonly (readonly Point[])[], point: Point): number {
  let best = Number.POSITIVE_INFINITY;
  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      best = Math.min(best, distanceToSegment(point, a, b));
    }
  }
  return best;
}

function distanceToSegment([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Discretises an absolute M/L/H/V/A/Q/T/Z path into polylines. Curves are sampled; subpaths are kept apart. */
function discretizePath(d: string): Point[][] {
  const tokens = d.match(/[MLHVAQTZ]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/gi) ?? [];
  const polygons: Point[][] = [];
  let current: Point[] = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let control: Point | null = null;
  let index = 0;
  const isCommand = (token: string | undefined) => token !== undefined && /^[A-Za-z]$/.test(token);
  const take = () => Number(tokens[index++]);
  const closeSubpath = () => {
    if (current.length > 0) polygons.push(current);
    current = [];
  };

  while (index < tokens.length) {
    const command = tokens[index++] ?? "";
    if (!isCommand(command) || command !== command.toUpperCase()) {
      throw new Error(`Unsupported path command "${command}" in ${d}`);
    }
    if (command === "Z") {
      closeSubpath();
      x = startX;
      y = startY;
      control = null;
      continue;
    }
    let first = true;
    do {
      if (command === "M") {
        if (first) {
          closeSubpath();
          startX = take();
          startY = take();
          x = startX;
          y = startY;
        } else {
          x = take();
          y = take();
        }
        current.push([x, y]);
        control = null;
      } else if (command === "L") {
        x = take();
        y = take();
        current.push([x, y]);
        control = null;
      } else if (command === "H") {
        x = take();
        current.push([x, y]);
        control = null;
      } else if (command === "V") {
        y = take();
        current.push([x, y]);
        control = null;
      } else if (command === "A") {
        const rx = take();
        const ry = take();
        const rotation = take();
        const largeArc = take() !== 0;
        const sweep = take() !== 0;
        const endX = take();
        const endY = take();
        current.push(...arcPoints(x, y, rx, ry, rotation, largeArc, sweep, endX, endY));
        x = endX;
        y = endY;
        control = null;
      } else if (command === "Q" || command === "T") {
        const reflected: Point = control ? [2 * x - control[0], 2 * y - control[1]] : [x, y];
        const [cx, cy]: Point = command === "Q" ? [take(), take()] : reflected;
        const endX = take();
        const endY = take();
        current.push(...quadraticPoints(x, y, cx, cy, endX, endY));
        x = endX;
        y = endY;
        control = [cx, cy];
      } else {
        throw new Error(`Unsupported path command "${command}" in ${d}`);
      }
      first = false;
    } while (index < tokens.length && !isCommand(tokens[index]));
  }
  closeSubpath();
  return polygons;
}

function quadraticPoints(x0: number, y0: number, cx: number, cy: number, x: number, y: number): Point[] {
  const points: Point[] = [];
  for (let step = 1; step <= 16; step += 1) {
    const t = step / 16;
    const mt = 1 - t;
    points.push([mt * mt * x0 + 2 * mt * t * cx + t * t * x, mt * mt * y0 + 2 * mt * t * cy + t * t * y]);
  }
  return points;
}

/** SVG elliptical arc, endpoint to centre parameterisation (SVG 1.1 appendix F.6.5). */
function arcPoints(
  x1: number,
  y1: number,
  radiusX: number,
  radiusY: number,
  rotation: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
): Point[] {
  if (x1 === x2 && y1 === y2) return [];
  let rx = Math.abs(radiusX);
  let ry = Math.abs(radiusY);
  const phi = (rotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const numerator = rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p;
  const denominator = rx2 * y1p * y1p + ry2 * x1p * x1p;
  let factor = Math.sqrt(Math.max(0, numerator / denominator));
  if (largeArc === sweep) factor = -factor;
  const cxp = (factor * rx * y1p) / ry;
  const cyp = (-factor * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;
  const angleBetween = (ux: number, uy: number, vx: number, vy: number) => {
    const sign = ux * vy - uy * vx < 0 ? -1 : 1;
    const cos = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
    return sign * Math.acos(Math.min(1, Math.max(-1, cos)));
  };
  const theta1 = angleBetween(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angleBetween((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const steps = 64;
  const points: Point[] = [];
  for (let step = 1; step <= steps; step += 1) {
    const theta = theta1 + (delta * step) / steps;
    points.push([
      cx + rx * Math.cos(theta) * cosPhi - ry * Math.sin(theta) * sinPhi,
      cy + rx * Math.cos(theta) * sinPhi + ry * Math.sin(theta) * cosPhi,
    ]);
  }
  return points;
}

describe("Avatar masks", () => {
  it("links every body to its own mask, so each face keeps its eyes and mouth", () => {
    const view = render(() => (
      <>
        <AvatarArt family="fases" shape={0} expression={0} color={0} pose="rest" />
        <AvatarArt family="fases" shape={1} expression={1} color={1} pose="rest" />
      </>
    ));
    const svgs = Array.from(view.container.querySelectorAll("svg.avatar-svg"));
    const maskIds = svgs.map((svg) => svg.querySelector("mask")?.id);
    expect(new Set(maskIds).size).toBe(2);
    for (const svg of svgs) {
      const mask = svg.querySelector("mask");
      expect(svg.querySelector("path.avatar-body")?.getAttribute("mask")).toBe(`url(#${mask?.id})`);
    }
    view.unmount();
  });
});
