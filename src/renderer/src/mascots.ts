import { MASCOT_CATALOG } from "./mascot-catalog";
import type { MascotDefinition, MascotFace, MascotFaceGeometry, MascotFaceKind, MascotPart } from "./mascot-types";

export type { MascotDefinition, MascotFaceKind, MascotPart } from "./mascot-types";

export const MASCOTS: readonly MascotDefinition[] = MASCOT_CATALOG;
export const MASCOT_COUNT = MASCOTS.length;

export function mascotAt(index: number): MascotDefinition {
  const mascot = MASCOTS[((index % MASCOT_COUNT) + MASCOT_COUNT) % MASCOT_COUNT];
  if (!mascot) throw new Error("The mascot catalog is empty.");
  return mascot;
}

const round = (value: number): number => Math.round(value * 100) / 100;

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${round(cx - rx)} ${cy}A${round(rx)} ${round(ry)} 0 1 0 ${round(cx + rx)} ${cy}A${round(rx)} ${round(ry)} 0 1 0 ${round(cx - rx)} ${cy}Z`;
}

/** Eyes, mouth and badge of a mascot's face in one of its four expressions. */
export function mascotFaceGeometry(face: MascotFace, kind: MascotFaceKind): MascotFaceGeometry {
  const { x, y, gap, eyeRadius: r, mouthDrop, mouthWidth: mw } = face;
  const centres = [x - gap / 2, x + gap / 2];
  const mouthY = y + mouthDrop;
  let eyes: MascotPart[][];
  let mouth: MascotPart[];
  let badge: MascotPart[] = [];

  if (kind === "neutral") {
    eyes = centres.map((cx) => [
      { d: ellipsePath(cx, y, r, r * 1.2), fill: "ink" },
      { d: ellipsePath(cx + r * 0.35, y - r * 0.4, r * 0.32, r * 0.32), fill: "w" },
    ]);
    mouth = [
      {
        d: `M${round(x - mw)} ${round(mouthY)}Q${x} ${round(mouthY + mw)} ${round(x + mw)} ${round(mouthY)}`,
        stroke: "ink",
        strokeWidth: 2.4,
      },
    ];
  } else if (kind === "working") {
    eyes = centres.map((cx) => [
      {
        d: `M${round(cx - r * 1.1)} ${y}A${round(r * 1.1)} ${round(r * 1.1)} 0 0 0 ${round(cx + r * 1.1)} ${y}Z`,
        fill: "ink",
      },
      { d: `M${round(cx - r * 1.4)} ${y}H${round(cx + r * 1.4)}`, stroke: "ink", strokeWidth: 2.2 },
    ]);
    mouth = [{ d: `M${round(x - mw * 0.6)} ${round(mouthY)}H${round(x + mw * 0.6)}`, stroke: "ink", strokeWidth: 2.4 }];
  } else if (kind === "alert") {
    eyes = centres.map((cx) => [
      { d: ellipsePath(cx, y, r * 1.55, r * 1.55), fill: "w", stroke: "ink", strokeWidth: 1.6 },
      { d: ellipsePath(cx, y, r * 0.75, r * 0.75), fill: "ink" },
    ]);
    mouth = [{ d: ellipsePath(x, mouthY + 1, mw * 0.32, mw * 0.5), fill: "ink" }];
    badge = [
      { d: ellipsePath(56, 8, 7, 7), fill: "alert" },
      { d: "M56 4.5V9", stroke: "w", strokeWidth: 2.2 },
      { d: ellipsePath(56, 12.2, 1.3, 1.3), fill: "w" },
    ];
  } else {
    eyes = centres.map((cx) => [
      {
        d: `M${round(cx - r * 1.2)} ${y}Q${cx} ${round(y + r * 1.4)} ${round(cx + r * 1.2)} ${y}`,
        stroke: "ink",
        strokeWidth: 2.4,
      },
    ]);
    mouth = [{ d: ellipsePath(x, mouthY + 1, mw * 0.22, mw * 0.3), fill: "ink" }];
    badge = [
      { d: "M51 4H57L51 11H57", stroke: "muted", strokeWidth: 2 },
      { d: "M59 -2H63L59 3H63", stroke: "muted", strokeWidth: 1.6 },
    ];
  }

  return { eyes, mouth: face.noMouth ? [] : mouth, badge };
}
